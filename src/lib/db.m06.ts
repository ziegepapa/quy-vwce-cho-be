import type { Instrument, Quote, QuoteCandidate } from "./types";
import { VWCE_ISIN } from "./types";
import { defaultVwceInstrument, nowIso } from "./defaults";
import {
  candidateId,
  isValidAsOfDate,
  isValidIsin,
  normalizeIsin,
  preferenceId,
  quoteId,
  toDateOnly,
} from "./instrument";
import { db } from "./db.m01a";
import { ensureQuoteFoundationMigrated } from "./db.m02";
import { assertQuoteWritesUnlocked } from "./db.m01b";
import { resolveEffective } from "./quoteResolve";
import { applyResolvedEffective } from "./db.m03";

export type AutoQuoteInput = {
  instrumentIsin: string;
  price: number;
  asOf: string;
  currency?: string;
  venue?: string;
  provider?: string;
  providerUrl?: string;
  crossCheckedWith?: string;
  crossCheckDifferencePct?: number;
  fetchedAt?: string;
};

function normalizeCurrency(raw?: string): string {
  return String(raw || "EUR").trim().toUpperCase();
}

function comparableText(raw: string | null | undefined): string | undefined {
  const value = String(raw ?? "").trim();
  return value || undefined;
}

/** fetchedAt/createdAt/updatedAt are metadata and intentionally excluded. */
export function isSameAutoQuoteSemantics(
  current: QuoteCandidate,
  incoming: AutoQuoteInput,
): boolean {
  return (
    current.source === "auto" &&
    normalizeIsin(current.instrumentIsin) === normalizeIsin(incoming.instrumentIsin) &&
    normalizeCurrency(current.currency) === normalizeCurrency(incoming.currency) &&
    current.price === incoming.price &&
    current.asOf === String(incoming.asOf).trim() &&
    comparableText(current.venue) === comparableText(incoming.venue) &&
    comparableText(current.provider) === comparableText(incoming.provider) &&
    comparableText(current.providerUrl) === comparableText(incoming.providerUrl) &&
    comparableText(current.crossCheckedWith) === comparableText(incoming.crossCheckedWith) &&
    current.crossCheckDifferencePct === incoming.crossCheckDifferencePct
  );
}

function isSameEffectiveSemantics(current: Quote | null, next: Quote | null): boolean {
  if (!current || !next) return current === next;
  return (
    current.id === next.id &&
    current.instrumentIsin === next.instrumentIsin &&
    current.currency === next.currency &&
    current.source === next.source &&
    current.price === next.price &&
    current.asOf === next.asOf &&
    comparableText(current.venue) === comparableText(next.venue) &&
    comparableText(current.provider) === comparableText(next.provider) &&
    comparableText(current.providerUrl) === comparableText(next.providerUrl) &&
    comparableText(current.crossCheckedWith) === comparableText(next.crossCheckedWith) &&
    current.crossCheckDifferencePct === next.crossCheckDifferencePct
  );
}

function buildInstrument(input: AutoQuoteInput, t: string): Instrument {
  const isin = normalizeIsin(input.instrumentIsin);
  if (isin === VWCE_ISIN) return defaultVwceInstrument();
  return {
    isin,
    name: isin,
    currency: normalizeCurrency(input.currency),
    venue: input.venue,
    createdAt: t,
    updatedAt: t,
  };
}

export async function putAutoCandidateAndResolve(
  input: AutoQuoteInput,
  opts?: { nowDate?: string },
): Promise<Quote | null> {
  await ensureQuoteFoundationMigrated();
  await assertQuoteWritesUnlocked();

  const isin = normalizeIsin(input.instrumentIsin);
  if (!isValidIsin(isin)) throw new Error(`Invalid ISIN: ${input.instrumentIsin}`);
  if (typeof input.price !== "number" || !Number.isFinite(input.price) || input.price <= 0) {
    throw new Error(`Invalid quote price: ${input.price}`);
  }
  if (!isValidAsOfDate(input.asOf)) {
    throw new Error(`Invalid quote asOf (need YYYY-MM-DD): ${input.asOf}`);
  }
  const nowDate = opts?.nowDate ?? toDateOnly();

  const currency = normalizeCurrency(input.currency);
  const t = nowIso();
  const instrument = buildInstrument(input, t);
  const candidate: QuoteCandidate = {
    id: candidateId(isin, currency, "auto"),
    instrumentIsin: isin,
    currency,
    source: "auto",
    price: input.price,
    asOf: String(input.asOf).trim(),
    venue: comparableText(input.venue),
    provider: comparableText(input.provider),
    providerUrl: comparableText(input.providerUrl),
    crossCheckedWith: comparableText(input.crossCheckedWith),
    crossCheckDifferencePct: input.crossCheckDifferencePct,
    fetchedAt: comparableText(input.fetchedAt),
    createdAt: t,
    updatedAt: t,
  };

  return db.transaction(
    "rw",
    [db.instruments, db.quoteCandidates, db.quotePreferences, db.quotes, db.settings, db.outbox],
    async () => {
      const [existingInstrument, prior, manual, existing, pref] = await Promise.all([
        db.instruments.get(isin),
        db.quoteCandidates.get(candidate.id),
        db.quoteCandidates.get(candidateId(isin, currency, "manual")),
        db.quotes.get(quoteId(isin, currency)),
        db.quotePreferences.get(preferenceId(isin, currency)),
      ]);

      if (!existingInstrument) {
        await db.instruments.put(instrument);
      }

      const candidateChanged = !prior || !isSameAutoQuoteSemantics(prior, candidate);
      const candidateForResolution: QuoteCandidate = candidateChanged
        ? { ...candidate, createdAt: prior?.createdAt ?? t }
        : prior;
      if (candidateChanged) {
        await db.quoteCandidates.put(candidateForResolution);
      }

      const mode = pref?.mode === "manual" ? "manual" : "auto";
      const resolved = resolveEffective({
        mode,
        auto: candidateForResolution,
        manual: manual ?? null,
        existingEffective: existing ?? null,
        nowDate,
      });
      const currentEffective = existing ?? null;
      if (!isSameEffectiveSemantics(currentEffective, resolved.effective)) {
        await applyResolvedEffective(isin, currency, resolved.effective, {
          t,
          syncSettings: true,
        });
        return resolved.effective;
      }
      return currentEffective;
    },
  );
}

export async function setQuotePreference(
  instrumentIsin: string,
  mode: "auto" | "manual",
  opts?: { currency?: string; nowDate?: string },
): Promise<Quote | null> {
  await ensureQuoteFoundationMigrated();
  await assertQuoteWritesUnlocked();

  const isin = normalizeIsin(instrumentIsin);
  if (!isValidIsin(isin)) throw new Error(`Invalid ISIN: ${instrumentIsin}`);
  const currency = normalizeCurrency(opts?.currency);
  const t = nowIso();
  const prefRow = {
    id: preferenceId(isin, currency),
    instrumentIsin: isin,
    currency,
    mode,
    createdAt: t,
    updatedAt: t,
  };

  return db.transaction("rw", [db.quotePreferences, db.quoteCandidates, db.quotes, db.settings, db.outbox], async () => {
    const existingPref = await db.quotePreferences.get(prefRow.id);
    await db.quotePreferences.put({ ...prefRow, createdAt: existingPref?.createdAt ?? t });

    const [auto, manual, existing] = await Promise.all([
      db.quoteCandidates.get(candidateId(isin, currency, "auto")),
      db.quoteCandidates.get(candidateId(isin, currency, "manual")),
      db.quotes.get(quoteId(isin, currency)),
    ]);
    const resolved = resolveEffective({
      mode,
      auto,
      manual,
      existingEffective: existing ?? null,
      nowDate: opts?.nowDate ?? toDateOnly(),
    });
    await applyResolvedEffective(isin, currency, resolved.effective, { t, syncSettings: true });
    return resolved.effective;
  });
}