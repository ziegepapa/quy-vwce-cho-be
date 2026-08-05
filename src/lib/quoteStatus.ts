import type {
  Instrument,
  Quote,
  QuoteCandidate,
  QuotePreferenceMode,
} from "./types";
import { db } from "./db.m01a";
import { ensureQuoteFoundationMigrated } from "./db.m02";
import { normalizeIsin, toDateOnly } from "./instrument";
import {
  classifyCandidate,
  defaultPreferenceMode,
  type CandidateStatus,
} from "./quoteResolve";

export type QuoteSelectionState = {
  key: string;
  instrumentIsin: string;
  currency: string;
  instrument?: Instrument;
  mode: QuotePreferenceMode;
  effective?: Quote;
  auto?: QuoteCandidate;
  manual?: QuoteCandidate;
  autoStatus: CandidateStatus;
  manualStatus: CandidateStatus;
  /** True only when the effective row itself is a stale auto candidate. */
  isStale: boolean;
};

function normalizeCurrency(raw: string | null | undefined): string {
  return String(raw || "EUR").trim().toUpperCase();
}

function stateKey(isin: string, currency: string): string {
  return `${normalizeIsin(isin)}|${normalizeCurrency(currency)}`;
}

/** Read-only UI model; candidates remain stored even when stale or unusable. */
export async function listQuoteSelectionStates(options?: {
  nowDate?: string;
}): Promise<QuoteSelectionState[]> {
  await ensureQuoteFoundationMigrated();
  const nowDate = options?.nowDate ?? toDateOnly();
  const [instruments, candidates, preferences, quotes] = await Promise.all([
    db.instruments.toArray(),
    db.quoteCandidates.toArray(),
    db.quotePreferences.toArray(),
    db.quotes.toArray(),
  ]);

  const instrumentsByKey = new Map<string, Instrument>();
  const autoByKey = new Map<string, QuoteCandidate>();
  const manualByKey = new Map<string, QuoteCandidate>();
  const preferencesByKey = new Map<string, { mode?: QuotePreferenceMode }>();
  const quotesByKey = new Map<string, Quote>();
  const keys = new Set<string>();

  for (const instrument of instruments) {
    const key = stateKey(instrument.isin, instrument.currency);
    keys.add(key);
    instrumentsByKey.set(key, instrument);
  }
  for (const candidate of candidates) {
    const key = stateKey(candidate.instrumentIsin, candidate.currency);
    keys.add(key);
    if (candidate.source === "auto") autoByKey.set(key, candidate);
    else if (candidate.source === "manual") manualByKey.set(key, candidate);
  }
  for (const preference of preferences) {
    const key = stateKey(preference.instrumentIsin, preference.currency);
    keys.add(key);
    preferencesByKey.set(key, preference);
  }
  for (const quote of quotes) {
    const key = stateKey(quote.instrumentIsin, quote.currency);
    keys.add(key);
    quotesByKey.set(key, quote);
  }

  return [...keys]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => {
      const [instrumentIsin, currency] = key.split("|");
      const auto = autoByKey.get(key);
      const manual = manualByKey.get(key);
      const effective = quotesByKey.get(key);
      const autoStatus = classifyCandidate(auto, nowDate);
      const manualStatus = classifyCandidate(manual, nowDate);
      return {
        key,
        instrumentIsin,
        currency,
        instrument: instrumentsByKey.get(key),
        mode: defaultPreferenceMode(preferencesByKey.get(key)),
        effective,
        auto,
        manual,
        autoStatus,
        manualStatus,
        isStale: effective?.source === "auto" && autoStatus === "valid-stale",
      };
    });
}

export function candidateStatusLabel(status: CandidateStatus): string {
  if (status === "valid-fresh") return "mới";
  if (status === "valid-stale") return "cũ";
  if (status === "unusable") return "không dùng được";
  return "chưa có";
}