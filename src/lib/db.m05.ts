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
import { ensureQuoteFoundationMigrated, assertQuoteWritesUnlocked } from "./db.m01b";
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
  const [auto, manual, pref, existing] = await Promise.all([
    db.quoteCandidates.get(candidateId(isin, currency, "auto")),
    db.quoteCandidates.get(candidateId(isin, currency, "manual")),
    db.quotePreferences.get(preferenceId(isin, currency)),
    db.quotes.get(quoteId(isin, currency)),
  ]);
  return { auto, manual, pref, existing };
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

  return db.transaction("rw", [db.instruments, db.quoteCandidates, db.quotePreferences, db.quotes, db.settings], async () => {
    const existingInstrument = await db.instruments.get(isin);
    if (!existingInstrument) {
      await db.instruments.put(instrument);
    }
    await db.quoteCandidates.put(candidate);
    const pref = {
      id: preferenceId(isin, currency),
      instrumentIsin: isin,
      currency,
      mode: "manual" as const,
      createdAt: t,
      updatedAt: t,
    };
    await db.quotePreferences.put(pref);

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