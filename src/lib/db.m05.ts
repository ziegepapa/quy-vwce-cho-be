import type { Instrument, Quote } from "./types";
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
  calendarDaysBetween,
} from "./instrument";
import { db } from "./db.m01a";
import { ensureQuoteFoundationMigrated } from "./db.m02";
import { assertQuoteWritesUnlocked } from "./db.m01b";
import { resolveEffective } from "./quoteResolve";
import { applyResolvedEffective } from "./db.m03";

export type ManualQuoteInput = {
  instrumentIsin: string;
  price: number;
  asOf: string;
  currency?: string;
  venue?: string;
  name?: string;
};

export type ManualQuoteSaveResult = {
  instrument: Instrument;
  quote: Quote;
};

function normalizeCurrency(raw?: string): string {
  return String(raw || "EUR").trim().toUpperCase();
}

function buildInstrument(input: ManualQuoteInput, t: string): Instrument {
  const isin = normalizeIsin(input.instrumentIsin);
  if (isin === VWCE_ISIN) return defaultVwceInstrument();
  return {
    isin,
    name: String(input.name || "").trim() || isin,
    currency: normalizeCurrency(input.currency),
    venue: input.venue,
    createdAt: t,
    updatedAt: t,
  };
}

async function loadCurrentCandidates(isin: string, currency: string) {
  const [auto, existing] = await Promise.all([
    db.quoteCandidates.get(candidateId(isin, currency, "auto")),
    db.quotes.get(quoteId(isin, currency)),
  ]);
  return { auto, existing };
}

export async function saveManualQuoteForIsin(
  input: ManualQuoteInput,
  opts?: { nowDate?: string },
): Promise<ManualQuoteSaveResult> {
  await ensureQuoteFoundationMigrated();
  await assertQuoteWritesUnlocked();

  const isin = normalizeIsin(input.instrumentIsin);
  if (!isValidIsin(isin)) {
    throw new Error(`Invalid ISIN: ${input.instrumentIsin}`);
  }
  if (typeof input.price !== "number" || !Number.isFinite(input.price) || input.price <= 0) {
    throw new Error(`Invalid quote price: ${input.price}`);
  }
  if (!isValidAsOfDate(input.asOf)) {
    throw new Error(`Invalid quote asOf (need YYYY-MM-DD): ${input.asOf}`);
  }
  const nowDate = opts?.nowDate ?? toDateOnly();
  if (calendarDaysBetween(input.asOf, nowDate) < 0) {
    throw new Error(`Invalid quote asOf is in the future: ${input.asOf}`);
  }

  const currency = normalizeCurrency(input.currency);
  const t = nowIso();
  const instrument = buildInstrument(input, t);
  const candidate = {
    id: candidateId(isin, currency, "manual"),
    instrumentIsin: isin,
    currency,
    source: "manual" as const,
    price: input.price,
    asOf: String(input.asOf).trim(),
    venue: input.venue,
    createdAt: t,
    updatedAt: t,
  };

  return db.transaction("rw", [db.instruments, db.quoteCandidates, db.quotePreferences, db.quotes, db.settings, db.outbox], async () => {
    const existingInstrument = await db.instruments.get(isin);
    if (!existingInstrument) {
      await db.instruments.put(instrument);
    }
    await db.quoteCandidates.put(candidate);
    await db.quotePreferences.put({
      id: preferenceId(isin, currency),
      instrumentIsin: isin,
      currency,
      mode: "manual",
      createdAt: t,
      updatedAt: t,
    });

    const { auto, existing } = await loadCurrentCandidates(isin, currency);
    const resolved = resolveEffective({
      mode: "manual",
      auto,
      manual: candidate,
      existingEffective: existing ?? null,
      nowDate,
    });
    await applyResolvedEffective(isin, currency, resolved.effective, { t, syncSettings: true });

    const quote = (resolved.effective ?? {
      id: quoteId(isin, currency),
      instrumentIsin: isin,
      currency,
      venue: input.venue,
      price: input.price,
      asOf: String(input.asOf).trim(),
      source: "manual" as const,
      createdAt: t,
      updatedAt: t,
    }) as Quote;

    return { instrument: existingInstrument ?? instrument, quote };
  });
}

/**
 * QUOTE-MANUAL-UX-001 r1 — drop the manual candidate for one ISIN.
 *
 * The preference goes back to "auto" on purpose. Leaving it on "manual" with no
 * manual row would only survive through the soft fallback inside resolveEffective,
 * and the row would keep claiming a source the owner just deleted.
 *
 * What the owner sees afterwards is whatever is actually true: a usable auto
 * candidate becomes the effective price again, and when there is none the
 * effective row is cleared, so the list says "Thiếu giá" instead of showing a
 * number nobody stands behind. The instrument row is kept — deleting a price is
 * not the same as leaving the asset.
 *
 * Returns the new effective quote, or null when the ISIN now has no price.
 */
export async function deleteManualQuoteForIsin(
  instrumentIsin: string,
  opts?: { currency?: string; nowDate?: string },
): Promise<Quote | null> {
  await ensureQuoteFoundationMigrated();
  await assertQuoteWritesUnlocked();

  const isin = normalizeIsin(instrumentIsin);
  if (!isValidIsin(isin)) {
    throw new Error(`Invalid ISIN: ${instrumentIsin}`);
  }
  const currency = normalizeCurrency(opts?.currency);
  const nowDate = opts?.nowDate ?? toDateOnly();
  const t = nowIso();

  return db.transaction(
    "rw",
    [db.instruments, db.quoteCandidates, db.quotePreferences, db.quotes, db.settings, db.outbox],
    async () => {
      await db.quoteCandidates.delete(candidateId(isin, currency, "manual"));

      const existingPref = await db.quotePreferences.get(preferenceId(isin, currency));
      await db.quotePreferences.put({
        id: preferenceId(isin, currency),
        instrumentIsin: isin,
        currency,
        mode: "auto",
        createdAt: existingPref?.createdAt ?? t,
        updatedAt: t,
      });

      const { auto, existing } = await loadCurrentCandidates(isin, currency);
      const resolved = resolveEffective({
        mode: "auto",
        auto,
        manual: null,
        existingEffective: existing ?? null,
        nowDate,
      });
      await applyResolvedEffective(isin, currency, resolved.effective, { t, syncSettings: true });
      return resolved.effective;
    },
  );
}

/**
 * QUOTE-MANUAL-UX-001 r1 — take one ISIN out of the price list entirely.
 *
 * Call canRemoveFromPriceList first; the VWCE guard is repeated here because
 * this deletes rows, and the legacy settings mirror only makes sense while VWCE
 * still exists.
 *
 * This is a hard delete. Instrument, Quote, QuoteCandidate and
 * QuoteSelectionPreference have no deletedAt field, unlike Goal, Transaction and
 * DepotStatement, so a tombstone would need a type and schema change that this
 * task is not allowed to make. Two consequences worth knowing rather than
 * discovering:
 * - importing an older backup can bring the row back, because BackupPayload
 *   carries instruments, quotes, quoteCandidates and quotePreferences
 * - the price bot only writes ISINs from its registry, so a removed extra ISIN
 *   does not reappear on its own
 */
export async function removeInstrumentAndQuotes(
  instrumentIsin: string,
  opts?: { currency?: string },
): Promise<void> {
  await ensureQuoteFoundationMigrated();
  await assertQuoteWritesUnlocked();

  const isin = normalizeIsin(instrumentIsin);
  if (!isValidIsin(isin)) {
    throw new Error(`Invalid ISIN: ${instrumentIsin}`);
  }
  if (isin === VWCE_ISIN) {
    throw new Error("Refusing to remove VWCE from the price list");
  }
  const currency = normalizeCurrency(opts?.currency);

  await db.transaction(
    "rw",
    [db.instruments, db.quoteCandidates, db.quotePreferences, db.quotes],
    async () => {
      await db.quotes.delete(quoteId(isin, currency));
      await db.quoteCandidates.delete(candidateId(isin, currency, "manual"));
      await db.quoteCandidates.delete(candidateId(isin, currency, "auto"));
      await db.quotePreferences.delete(preferenceId(isin, currency));
      await db.instruments.delete(isin);
    },
  );
}
