/**
 * Multi-asset quote orchestrator.
 * Per-instrument isolation: one failure keeps prior valid quote for that key
 * and never deletes other instruments' quotes.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readExistingQuotes,
  validateQuotesDocument,
  quotesToMap,
  sameQuoteEconomics,
  sameDocumentEconomics,
  quoteRowToLegacyV1,
  writeJsonAtomic,
  ContractError,
} from "./contract.mjs";
import { loadRegistry, quoteKey } from "./registry.mjs";
import { parseYahooChart } from "./providers/yahoo.mjs";
import {
  parseOnvistaSnapshot,
  crossCheckWithOnvista,
} from "./providers/onvista.mjs";
import { hourInTz } from "./time.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
export const QUOTES_PATH = path.join(REPO_ROOT, "public", "data", "quotes.json");
export const LEGACY_VWCE_PATH = path.join(
  REPO_ROOT,
  "public",
  "data",
  "vwce-price.json",
);
export const VWCE_ISIN = "IE00BK5BQT80";

const UA =
  "quy-vwce-cho-be/1.0 (+https://github.com/ziegepapa/quy-vwce-cho-be; price-bot)";

export class OrchestratorError extends Error {
  constructor(message) {
    super(message);
    this.name = "OrchestratorError";
  }
}

export async function fetchJson(url, timeoutMs = 20_000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (res.status !== 200) {
      throw new OrchestratorError(`HTTP ${res.status} for ${url}`);
    }
    return await res.json();
  } catch (e) {
    if (e instanceof OrchestratorError) throw e;
    if (e?.name === "AbortError") {
      throw new OrchestratorError(`Timeout fetching ${url}`);
    }
    throw new OrchestratorError(`Fetch failed ${url}: ${e?.message || e}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Decide whether a new quote may replace existing for the same key.
 * Throws on stale regression / jump / same-day pre-close change.
 * Returns null if economic no-op.
 */
export function decideQuoteWrite(next, existing, instrument, now) {
  if (!existing) return next;

  if (
    typeof next.asOf === "string" &&
    typeof existing.asOf === "string" &&
    next.asOf < existing.asOf
  ) {
    throw new OrchestratorError(
      `Refusing stale regression for ${next.instrumentIsin}: ${next.asOf} < ${existing.asOf}`,
    );
  }

  if (sameQuoteEconomics(next, existing)) {
    return null;
  }

  const maxPct = instrument.maxDayChangePct ?? 20;
  if (
    typeof existing.price === "number" &&
    existing.price > 0 &&
    typeof next.price === "number"
  ) {
    const pct = (Math.abs(next.price - existing.price) / existing.price) * 100;
    if (pct > maxPct) {
      throw new OrchestratorError(
        `Refusing jump ${pct.toFixed(2)}% > ${maxPct}% for ${next.instrumentIsin}`,
      );
    }
  }

  // Same calendar day: block large change before local close
  if (next.asOf === existing.asOf) {
    const tz = instrument.timezone || "Europe/Berlin";
    const closeHour = instrument.closeHourLocal ?? 18;
    const hour = hourInTz(now, tz);
    if (hour < closeHour) {
      const pct =
        existing.price > 0
          ? (Math.abs(next.price - existing.price) / existing.price) * 100
          : 0;
      const sameDayMax = Math.min(maxPct, 3);
      if (pct > sameDayMax) {
        throw new OrchestratorError(
          `Refusing same-day pre-close change ${pct.toFixed(2)}% for ${next.instrumentIsin}`,
        );
      }
    }
  }

  return next;
}

/**
 * Resolve one instrument quote via primary + optional cross-check.
 */
export async function resolveInstrumentQuote(instrument, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const fetchedAt =
    options.fetchedAt instanceof Date ? options.fetchedAt : new Date();

  if (!instrument.primaryProvider?.symbol) {
    throw new OrchestratorError(
      `No verified primaryProvider.symbol for ${instrument.isin}`,
    );
  }

  let yahooBody = options.yahooBody;
  if (!yahooBody) {
    const url =
      instrument.primaryProvider.chartUrl ||
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        instrument.primaryProvider.symbol,
      )}?interval=1d&range=10d`;
    yahooBody = await fetchJson(url);
  }

  const primary = parseYahooChart(yahooBody, now, instrument);

  let crossCheckedWith;
  let crossCheckDifferencePct;
  if (instrument.crossCheckProvider?.kind === "onvista") {
    let onvistaBody = options.onvistaBody;
    if (!onvistaBody) {
      const url =
        instrument.crossCheckProvider.snapshotUrl ||
        `https://api.onvista.de/api/v1/stocks/ISIN:${instrument.isin}/snapshot`;
      onvistaBody = await fetchJson(url);
    }
    const onvista = parseOnvistaSnapshot(onvistaBody, instrument);
    const cc = crossCheckWithOnvista(primary, onvista, instrument);
    crossCheckedWith = "onvista";
    crossCheckDifferencePct = cc.differencePct;
  }

  return {
    instrumentIsin: instrument.isin,
    currency: instrument.currency,
    venue: instrument.venue || primary.meta?.venue,
    price: primary.price,
    asOf: primary.asOf,
    fetchedAt: fetchedAt.toISOString(),
    source: "auto",
    provider: "yahoo_finance_chart",
    providerUrl:
      instrument.primaryProvider.pageUrl ||
      `https://finance.yahoo.com/quote/${instrument.primaryProvider.symbol}`,
    crossCheckedWith,
    crossCheckDifferencePct,
  };
}

/**
 * Run multi-asset update across registry instruments.
 * @param {object} [options]
 * @param {string} [options.quotesPath]
 * @param {string} [options.legacyPath]
 * @param {string} [options.registryPath]
 * @param {Date} [options.now]
 * @param {Date} [options.fetchedAt]
 * @param {boolean} [options.dryRun]
 * @param {boolean} [options.includeTestOnly]
 * @param {Record<string,{yahooBody?:unknown,onvistaBody?:unknown}>} [options.bodiesByIsin]
 */
export async function runMultiAssetUpdate(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const quotesPath = options.quotesPath || QUOTES_PATH;
  const legacyPath = options.legacyPath || LEGACY_VWCE_PATH;
  const registryPath =
    options.registryPath ||
    path.join(REPO_ROOT, "scripts", "price-instruments.json");

  const registry = loadRegistry(registryPath, {
    includeTestOnly: !!options.includeTestOnly,
  });

  /** @type {import("./contract.mjs").validateQuotesDocument extends Function ? any : any} */
  let existingDoc = null;
  try {
    existingDoc = readExistingQuotes(quotesPath, now);
  } catch (e) {
    if (e instanceof ContractError) throw e;
    throw new ContractError(`Cannot read existing quotes: ${e?.message || e}`);
  }

  const existingMap = quotesToMap(existingDoc);
  const nextMap = new Map(existingMap);
  const errors = [];
  let anyEconomicChange = false;

  const worklist = options.includeTestOnly
    ? registry.all.filter((i) => i.enabled)
    : registry.liveEnabled;

  for (const inst of worklist) {
    if (!inst.enabled) continue;
    // Live path requires verified primary mapping
    if (inst.live && !inst.primaryProvider?.symbol) {
      errors.push({
        isin: inst.isin,
        message: "skip live instrument without verified provider symbol",
      });
      continue;
    }

    const key = quoteKey(inst.isin, inst.currency);
    const bodies = options.bodiesByIsin?.[inst.isin] || {};

    try {
      const resolved = await resolveInstrumentQuote(inst, {
        now,
        fetchedAt: options.fetchedAt,
        yahooBody: bodies.yahooBody,
        onvistaBody: bodies.onvistaBody,
      });
      const decided = decideQuoteWrite(
        resolved,
        existingMap.get(key) || null,
        inst,
        now,
      );
      if (decided) {
        nextMap.set(key, decided);
        anyEconomicChange = true;
      }
      // economic no-op: keep existing row (preserves fetchedAt)
    } catch (e) {
      errors.push({ isin: inst.isin, message: e?.message || String(e) });
      // Keep prior valid quote for this key; never delete others
    }
  }

  const quotes = [...nextMap.values()].sort((a, b) => {
    if (a.instrumentIsin !== b.instrumentIsin) {
      return a.instrumentIsin < b.instrumentIsin ? -1 : 1;
    }
    return a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0;
  });

  const generatedAt =
    anyEconomicChange || !existingDoc
      ? (options.fetchedAt instanceof Date
          ? options.fetchedAt
          : new Date()
        ).toISOString()
      : existingDoc.generatedAt;

  const quotesDoc = validateQuotesDocument(
    { schemaVersion: 2, generatedAt, quotes },
    now,
  );

  if (!anyEconomicChange && existingDoc && sameDocumentEconomics(existingDoc, quotesDoc)) {
    return {
      wrote: false,
      reason: "No economic change",
      quotesDoc: existingDoc,
      errors,
      legacyWrote: false,
    };
  }

  if (options.dryRun) {
    return {
      wrote: false,
      reason: "dry-run",
      quotesDoc,
      errors,
      legacyWrote: false,
    };
  }

  writeJsonAtomic(quotesDoc, quotesPath);

  // Legacy VWCE mirror from resolved VWCE quote
  let legacyWrote = false;
  const vwceQuote = quotesDoc.quotes.find(
    (q) => q.instrumentIsin === VWCE_ISIN && q.currency === "EUR",
  );
  if (vwceQuote) {
    const legacy = quoteRowToLegacyV1(vwceQuote, "VWCE");
    writeJsonAtomic(legacy, legacyPath);
    legacyWrote = true;
  }

  return {
    wrote: true,
    quotesDoc,
    errors,
    legacyWrote,
  };
}
