import type { Instrument, Quote } from "./types";
import { VWCE_ISIN } from "./types";
import { defaultVwceInstrument, nowIso } from "./defaults";
import {
  candidateId,
  calendarDaysBetween,
  isValidAsOfDate,
  isValidIsin,
  normalizeIsin,
  preferenceId,
  quoteId,
  toDateOnly,
} from "./instrument";
import { db } from "./db.m01a";
import { assertQuoteWritesUnlocked, ensureQuoteFoundationMigrated } from "./db.m01b";
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

async function loadCurrentCandidates(isin: string, currency: string) {
  const [auto, manual, pref, existing] = await Promise.all([
    db.quoteCandidates.get(candidateId(isin, currency, "auto")),
    db.quoteCandidates.get(candidateId(isin, currency, "manual")),
    db.quotePreferences.get(preferenceId(isin, currency)),
    db.quotes.get(quoteId(isin, currency)),
  ]);
  return { auto, manual, pref, existing };
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
  if (calendarDaysBetween(input.asOf, nowDate) < 0) {
    throw new Error(`Invalid quote asOf is in the future: ${input.asOf}`);
  }

  const currency = normalizeCurrency(input.currency);
  const t = nowIso();
  const instrument = buildInstrument(input, t);
  const candidate = {
    id: candidateId(isin, currency, "auto"),
    instrumentIsin: isin,
    currency,
    source: "auto" as const,
    price: input.price,
    asOf: String(input.asOf).trim(),
    venue: input.venue,
    provider: input.provider,
    providerUrl: input.providerUrl,
    crossCheckedWith: input.crossCheckedWith,
    crossCheckDifferencePct: input.crossCheckDifferencePct,
    fetchedAt: input.fetchedAt,
    createdAt: t,
    updatedAt: t,
  };

  return db.transaction("rw", [db.instruments, db.quoteCandidates, db.quotePreferences, db.quotes, db.settings], async () => {
    const existingInstrument = await db.instruments.get(isin);
    if (!existingInstrument) {
      await db.instruments.put(instrument);
    }
    const prior = await db.quoteCandidates.get(candidate.id);
    await db.quoteCandidates.put({ ...candidate, createdAt: prior?.createdAt ?? t });

    const { manual, pref, existing } = await loadCurrentCandidates(isin, currency);
    const mode = pref?.mode === "manual" ? "manual" : "auto";
    const resolved = resolveEffective({
      mode,
      auto: candidate,
      manual: manual ?? null,
      existingEffective: existing ?? null,
      nowDate,
    });
    await applyResolvedEffective(isin, currency, resolved.effective, { t, syncSettings: true });
    return resolved.effective;
  });
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

  return db.transaction("rw", [db.quotePreferences, db.quoteCandidates, db.quotes, db.settings], async () => {
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