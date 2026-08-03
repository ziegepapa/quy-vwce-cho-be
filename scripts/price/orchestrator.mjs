/**
 * Multi-asset quote orchestrator.
 * Per-instrument isolation: one failure keeps prior valid quote for that key
 * and never deletes other instruments' quotes.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry, quoteKey } from "./registry.mjs";
import {
  ContractError,
  readExistingQuotes,
  sameDocumentEconomics,
  validateQuotesDocument,
  writeJsonAtomic,
  quoteRowToLegacyV1,
  quotesToMap,
} from "./contract.mjs";
import { fetchYahooChart, parseYahooChart } from "./providers/yahoo.mjs";
import { crossCheckWithOnvista } from "./providers/onvista.mjs";
import { hourInTz, dateStringInTz } from "./time.mjs";

export class OrchestratorError extends Error {
  constructor(message) {
    super(message);
    this.name = "OrchestratorError";
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

/**
 * Decide whether to accept a candidate quote for one instrument.
 * Policies are per-instrument (from registry).
 */
export function decideQuoteWrite(prev, candidate, instrument, now = new Date()) {
  if (!candidate) {
    return { action: "keep", reason: "no_candidate", quote: prev || null };
  }
  if (!prev) {
    return { action: "write", reason: "first", quote: candidate };
  }
  // Stale regression: never go backwards on asOf
  if (candidate.asOf < prev.asOf) {
    return { action: "keep", reason: "stale_regression", quote: prev };
  }
  const policies = instrument.policies || {};
  const maxDayJumpPct = policies.maxDayJumpPct ?? 8;
  const sameDayChangeBeforeClosePct = policies.sameDayChangeBeforeClosePct ?? 3;
  const closeHourLocal = policies.closeHourLocal ?? 17;
  const tz = policies.timezone || "Europe/Berlin";

  if (candidate.asOf === prev.asOf) {
    const hour = hourInTz(now, tz);
    const diffPct = Math.abs((candidate.price - prev.price) / prev.price) * 100;
    if (hour < closeHourLocal && diffPct > sameDayChangeBeforeClosePct) {
      return { action: "keep", reason: "same_day_pre_close_jump", quote: prev };
    }
    // After close (or within tolerance): allow update if economics differ
    if (candidate.price === prev.price) {
      return { action: "keep", reason: "same_economics", quote: prev };
    }
    return { action: "write", reason: "same_day_update", quote: candidate };
  }

  // New day: check jump vs previous close
  const jumpPct = Math.abs((candidate.price - prev.price) / prev.price) * 100;
  if (jumpPct > maxDayJumpPct) {
    return { action: "keep", reason: "day_jump", quote: prev };
  }
  return { action: "write", reason: "new_day", quote: candidate };
}

async function resolveInstrumentQuote(instrument, fetchImpl, now) {
  const primary = instrument.providers?.primary;
  if (!primary || primary.kind !== "yahoo_finance_chart") {
    throw new OrchestratorError(`Unsupported primary provider for ${instrument.isin}`);
  }
  const symbol = primary.symbol;
  if (!symbol) throw new OrchestratorError(`Missing yahoo symbol for ${instrument.isin}`);

  let chart;
  try {
    chart = await fetchYahooChart(symbol, fetchImpl);
  } catch (e) {
    throw new OrchestratorError(`Yahoo fetch failed for ${instrument.isin}: ${e.message}`);
  }
  const parsed = parseYahooChart(chart, {
    symbol,
    isin: instrument.isin,
    currency: instrument.currency,
    venue: instrument.venue,
    now,
  });
  if (!parsed) {
    throw new OrchestratorError(`Yahoo parse empty for ${instrument.isin}`);
  }

  let crossCheckedWith;
  let crossCheckDifferencePct;
  const cross = instrument.providers?.crossCheck;
  if (cross && cross.kind === "onvista" && cross.symbol) {
    try {
      const cc = await crossCheckWithOnvista(cross.symbol, parsed.price, fetchImpl);
      if (cc) {
        crossCheckedWith = "onvista";
        crossCheckDifferencePct = cc.differencePct;
      }
    } catch {
      // cross-check is best-effort; do not fail the primary quote
    }
  }

  return {
    instrumentIsin: instrument.isin,
    currency: instrument.currency,
    venue: instrument.venue,
    price: parsed.price,
    asOf: parsed.asOf,
    fetchedAt: now.toISOString(),
    source: "auto",
    provider: "yahoo_finance_chart",
    providerUrl: primary.url || `https://finance.yahoo.com/quote/${symbol}`,
    crossCheckedWith,
    crossCheckDifferencePct,
  };
}

/**
 * Run multi-asset update.
 * @param {object} opts
 * @param {string} [opts.quotesPath]
 * @param {string} [opts.legacyPath]
 * @param {string} [opts.registryPath]
 * @param {Function} [opts.fetchImpl]
 * @param {Date} [opts.now]
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.includeTestOnly]
 */
export async function runMultiAssetUpdate(opts = {}) {
  const now = opts.now || new Date();
  const quotesPath = opts.quotesPath || path.join(ROOT, "public/data/quotes.json");
  const legacyPath = opts.legacyPath || path.join(ROOT, "public/data/vwce-price.json");
  const registryPath = opts.registryPath || path.join(ROOT, "scripts/price-instruments.json");
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const dryRun = !!opts.dryRun;

  const registry = loadRegistry(registryPath, { includeTestOnly: !!opts.includeTestOnly });
  const live = registry.instruments.filter((i) => !i.testOnly || opts.includeTestOnly);

  let existing;
  try {
    existing = readExistingQuotes(quotesPath, now);
  } catch (e) {
    if (e instanceof ContractError) throw e;
    throw new ContractError(`Cannot read existing quotes: ${e.message}`);
  }
  const prevMap = quotesToMap(existing);

  const nextQuotes = [];
  const decisions = [];

  for (const instrument of live) {
    const key = quoteKey(instrument.isin, instrument.currency);
    const prev = prevMap.get(key) || null;
    let candidate = null;
    let errMsg = null;
    try {
      candidate = await resolveInstrumentQuote(instrument, fetchImpl, now);
    } catch (e) {
      errMsg = e.message;
    }
    const decision = decideQuoteWrite(prev, candidate, instrument, now);
    decisions.push({
      key,
      action: decision.action,
      reason: decision.reason,
      error: errMsg,
    });
    if (decision.quote) {
      nextQuotes.push(decision.quote);
    }
  }

  // Preserve any previously valid quotes for instruments no longer in live set? No — only live.
  // But if an instrument failed and had no prev, it is simply absent (fail-closed for that key).

  const generatedAt =
    existing && sameDocumentEconomics(
      { schemaVersion: 2, generatedAt: existing.generatedAt, quotes: nextQuotes },
      existing
    )
      ? existing.generatedAt
      : now.toISOString();

  const doc = validateQuotesDocument(
    { schemaVersion: 2, generatedAt, quotes: nextQuotes },
    now
  );

  const economicChange = !existing || !sameDocumentEconomics(doc, existing);

  if (!dryRun && economicChange) {
    writeJsonAtomic(doc, quotesPath);
    // Legacy mirror for VWCE
    const vwce = doc.quotes.find((q) => q.instrumentIsin === "IE00BK5BQT80" && q.currency === "EUR");
    if (vwce) {
      const legacy = quoteRowToLegacyV1(vwce, "VWCE");
      writeJsonAtomic(legacy, legacyPath);
    }
  }

  return {
    economicChange,
    dryRun,
    document: doc,
    decisions,
    quotesPath,
    legacyPath,
  };
}
