import type {
  AppMetadata, Quote, QuoteCandidate, QuoteMigrationMeta, QuoteSelectionPreference,
} from "./types";
import { nowIso } from "./defaults";
import { candidateId, normalizeIsin, preferenceId } from "./instrument";
import { db } from "./db.m01a";
import {
  QUOTE_MIGRATION_META_ID, coerceQuoteSource, validateQuoteRowForMigration,
} from "./db.m01b";
export async function ensureQuoteFoundationMigrated(): Promise<void> {
  const existing = (await db.appMetadata.get(QUOTE_MIGRATION_META_ID)) as
    | QuoteMigrationMeta
    | undefined;
  if (existing?.state === "complete") return;

  const t = nowIso();
  if (!existing || existing.state === "failed") {
    const pending: QuoteMigrationMeta = {
      id: "quoteMigration",
      state: "pending",
      updatedAt: t,
      lastError: existing?.lastError,
    };
    await db.appMetadata.put(pending as unknown as AppMetadata);
  }

  try {
    await db.transaction(
      "rw",
      [
        db.quotes,
        db.quoteCandidates,
        db.quotePreferences,
        db.appMetadata,
        db.instruments,
        db.settings,
      ],
      async () => {
        const allQuotes = await db.quotes.toArray();
        for (const q of allQuotes) {
          validateQuoteRowForMigration(q);
        }
        for (const q of allQuotes) {
          const isin = normalizeIsin(q.instrumentIsin);
          const currency = String(q.currency || "EUR").toUpperCase();
          const source = coerceQuoteSource(q.source);
          const cid = candidateId(isin, currency, source);
          const prior = await db.quoteCandidates.get(cid);
          if (!prior) {
            const cand: QuoteCandidate = {
              id: cid,
              instrumentIsin: isin,
              currency,
              source,
              price: q.price,
              asOf: String(q.asOf).trim(),
              venue: q.venue,
              provider: q.provider,
              providerUrl: q.providerUrl,
              crossCheckedWith: q.crossCheckedWith,
              crossCheckDifferencePct: q.crossCheckDifferencePct,
              fetchedAt: q.fetchedAt,
              createdAt: q.createdAt || t,
              updatedAt: t,
            };
            await db.quoteCandidates.put(cand);
          }
          if (source === "manual") {
            const pid = preferenceId(isin, currency);
            const prefPrior = await db.quotePreferences.get(pid);
            if (!prefPrior) {
              const pref: QuoteSelectionPreference = {
                id: pid,
                instrumentIsin: isin,
                currency,
                mode: "manual",
                createdAt: t,
                updatedAt: t,
              };
              await db.quotePreferences.put(pref);
            }
          }
        }
        const done: QuoteMigrationMeta = {
          id: "quoteMigration",
          state: "complete",
          updatedAt: nowIso(),
        };
        await db.appMetadata.put(done as unknown as AppMetadata);
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const failed: QuoteMigrationMeta = {
      id: "quoteMigration",
      state: "failed",
      updatedAt: nowIso(),
      lastError: msg,
    };
    try {
      await db.appMetadata.put(failed as unknown as AppMetadata);
    } catch {
      /* ignore secondary failure */
    }
    throw err;
  }
}
