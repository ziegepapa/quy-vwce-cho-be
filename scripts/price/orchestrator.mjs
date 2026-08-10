/**
 * Multi-asset quote orchestrator.
 * Per-instrument isolation: one failure keeps prior valid quote for that key
 * and never deletes other instruments' quotes.
 *
 * Price source policy (PRICE-SOURCE-FRESHEST-001):
 *   - each instrument has an ordered chain: primary, declared fallbacks, then
 *     the cross-check provider if it can stand on its own
 *   - every usable source is fetched and parsed on each workflow run
 *   - the newest CLOSED session wins; chain order breaks same-day ties
 *   - a same-day cross-check disagreement beyond tolerance stops the write
 *   - a missing second opinion only marks the winning quote degraded
 *   - every source down means keep the previous quote, never an empty feed
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
  parseOnvistaAsPrimary,
  crossCheckWithOnvista,
  ONVISTA_MISMATCH,
} from "./providers/onvista.mjs";
import { hourInTz } from "./time.mjs";
import { upsertHistoryPoint } from "./history.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
export const QUOTES_PATH = path.join(REPO_ROOT, "public", "data", "quotes.json");
export const LEGACY_VWCE_PATH = path.join(
  REPO_ROOT,
  "public",
  "data",
  "vwce-price.json",
);
/**
 * PRICE-HISTORY-PERSIST-001 r1: daily price series for VWCE.
 * One point per trading day, appended by the cron after each successful write.
 * Served as a static file from gh-pages; no Dexie bump required.
 */
export const HISTORY_PATH = path.join(
  REPO_ROOT,
  "public",
  "data",
  "price-history",
  "IE00BK5BQT80.json",
);
export const VWCE_ISIN = "IE00BK5BQT80";

/** Human readable Yahoo quote page, used only when the registry pins no providerUrl. */
export const YAHOO_QUOTE_URL_BASE = "https://finance.yahoo.com/quote/";

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
 * Price adapters keyed by provider id. Supporting a new provider means adding
 * one entry here plus the id in registry SUPPORTED_PROVIDER_IDS. No other file
 * may branch on a provider id.
 *
 * bodyKey        which options key carries a pre-fetched body (tests, fixtures)
 * requiresSymbol whether the registry must pin an exchange symbol
 * parse          body -> { price, asOf, meta }
 * providerUrl    human readable source URL recorded in the quote row
 */
export const PRIMARY_ADAPTERS = {
  yahoo_finance_chart: {
    bodyKey: "yahooBody",
    requiresSymbol: true,
    parse: (body, now, instrument) => parseYahooChart(body, now, instrument),
    providerUrl: (cfg) => {
      if (cfg.providerUrl) return cfg.providerUrl;
      return cfg.symbol ? YAHOO_QUOTE_URL_BASE + cfg.symbol : cfg.url;
    },
  },
  onvista: {
    bodyKey: "onvistaBody",
    requiresSymbol: false,
    parse: (body, now, instrument) => parseOnvistaAsPrimary(body, now, instrument),
    providerUrl: (cfg) => cfg.providerUrl || cfg.url,
  },
};

/** @returns {null | typeof PRIMARY_ADAPTERS[keyof typeof PRIMARY_ADAPTERS]} */
export function getPrimaryAdapter(id) {
  if (typeof id !== "string") return null;
  return Object.prototype.hasOwnProperty.call(PRIMARY_ADAPTERS, id)
    ? PRIMARY_ADAPTERS[id]
    : null;
}

/**
 * Ordered price sources for one instrument.
 * Primary first, then declared fallbacks, then the cross-check provider as a
 * standby. A provider only joins the chain if it has an adapter and a url.
 */
export function resolvePriceSourceChain(instrument) {
  const chain = [];
  const seen = new Set();
  const push = (cfg, role) => {
    if (!cfg?.id || !cfg.url) return;
    if (seen.has(cfg.id)) return;
    if (!getPrimaryAdapter(cfg.id)) return;
    seen.add(cfg.id);
    chain.push({ cfg, role });
  };
  push(instrument.primaryProvider, "primary");
  for (const fallback of instrument.fallbackProviders || []) {
    push(fallback, "fallback");
  }
  push(instrument.crossCheckProvider, "fallback");
  return chain;
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
 * Resolve one instrument by reading every configured source. The freshest
 * closed-session candidate wins; the registry order is only a same-date
 * tie-breaker. This prevents a stale-but-schema-valid primary from hiding a
 * newer closed quote already available from the fallback provider.
 *
 * Returned object carries `degraded` and `warnings` for logging only; the
 * contract validator drops them before anything reaches disk.
 */
export async function resolveInstrumentQuote(instrument, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const fetchedAt =
    options.fetchedAt instanceof Date ? options.fetchedAt : new Date();

  const chain = resolvePriceSourceChain(instrument);
  if (!chain.length) {
    throw new OrchestratorError(
      `No usable price source for ${instrument.isin}: need a supported provider id with a url`,
    );
  }

  // Start every request in registry order, but do not let network completion
  // order choose the winner. Promise.all keeps the result array deterministic.
  const attempts = await Promise.all(
    chain.map(async ({ cfg, role }, index) => {
      const adapter = getPrimaryAdapter(cfg.id);
      let body;
      try {
        if (adapter.requiresSymbol && !cfg.symbol) {
          throw new OrchestratorError(
            `No verified ${cfg.id} symbol for ${instrument.isin}`,
          );
        }
        body = options[adapter.bodyKey];
        if (body === undefined) {
          // Canonical contract: every request URL comes from the registry.
          body = await fetchJson(cfg.url);
        }
        const parsed = adapter.parse(body, now, instrument);
        return { ok: true, cfg, role, index, adapter, body, parsed };
      } catch (error) {
        return { ok: false, cfg, role, index, adapter, body, error };
      }
    }),
  );

  /** @type {string[]} */
  const warnings = [];
  for (const attempt of attempts) {
    if (!attempt.ok) {
      warnings.push(
        `${attempt.cfg.id} (${attempt.role}) unusable: ${attempt.error?.message || attempt.error}`,
      );
    }
  }

  const successful = attempts.filter((attempt) => attempt.ok);
  if (!successful.length) {
    throw new OrchestratorError(
      `All price sources failed for ${instrument.isin}: ${warnings.join(" | ")}`,
    );
  }

  // Attempts stay in chain order. Replace the current winner only for a newer
  // date, never for an equal date, so primary/fallback priority remains stable.
  let picked = successful[0];
  for (const candidate of successful.slice(1)) {
    if (candidate.parsed.asOf > picked.parsed.asOf) picked = candidate;
  }

  for (const candidate of successful) {
    if (
      candidate.cfg.id !== picked.cfg.id &&
      candidate.parsed.asOf < picked.parsed.asOf
    ) {
      warnings.push(
        `${picked.cfg.id} selected: closed session ${picked.parsed.asOf} is newer than ${candidate.cfg.id} ${candidate.parsed.asOf}`,
      );
    }
  }

  const chosenId = picked.cfg.id;
  let crossCheckedWith;
  let crossCheckDifferencePct;
  const ccCfg = instrument.crossCheckProvider;

  if (ccCfg?.id && ccCfg.id === chosenId) {
    // Never validate a source against itself: that proves nothing.
    warnings.push(`cross-check skipped: ${chosenId} is already the price source`);
  } else if (ccCfg?.id) {
    if (ccCfg.id !== "onvista") {
      throw new OrchestratorError(
        `Unsupported crossCheckProvider.id "${ccCfg.id}" for ${instrument.isin}`,
      );
    }
    if (!ccCfg.url) {
      throw new OrchestratorError(
        `crossCheckProvider.onvista missing url for ${instrument.isin}`,
      );
    }
    try {
      // Reuse the body already fetched for candidate selection. A failed fetch
      // is not retried inside the same run; the morning schedule is the retry.
      const ccAttempt = attempts.find((attempt) => attempt.cfg.id === ccCfg.id);
      let onvistaBody;
      if (ccAttempt?.body !== undefined) {
        onvistaBody = ccAttempt.body;
      } else if (ccAttempt?.error) {
        throw ccAttempt.error;
      } else if (options.onvistaBody !== undefined) {
        onvistaBody = options.onvistaBody;
      } else {
        onvistaBody = await fetchJson(ccCfg.url);
      }
      const onvista = parseOnvistaSnapshot(onvistaBody, instrument, ccCfg);
      const cc = crossCheckWithOnvista(picked.parsed, onvista, instrument);
      crossCheckedWith = "onvista";
      crossCheckDifferencePct = cc.differencePct;
    } catch (e) {
      // Two sources that genuinely disagree is a data quality stop.
      if (e?.code === ONVISTA_MISMATCH) throw e;
      // Anything else only means the second opinion was not available.
      warnings.push(`cross-check onvista unusable: ${e?.message || e}`);
    }
  }

  return {
    instrumentIsin: instrument.isin,
    currency: instrument.currency,
    venue: instrument.venue || picked.parsed.meta?.venue,
    price: picked.parsed.price,
    asOf: picked.parsed.asOf,
    fetchedAt: fetchedAt.toISOString(),
    source: "auto",
    provider: chosenId,
    providerUrl: getPrimaryAdapter(chosenId).providerUrl(picked.cfg),
    crossCheckedWith,
    crossCheckDifferencePct,
    // Diagnostics only. validateQuoteRow strips these before the file is written.
    degraded: picked.role !== "primary" || crossCheckedWith == null,
    warnings,
  };
}

/**
 * Run multi-asset update across registry instruments.
 * @param {object} [options]
 * @param {string} [options.quotesPath]
 * @param {string} [options.legacyPath]
 * @param {string} [options.historyPath] - overrides HISTORY_PATH (tests)
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
  const warnings = [];
  let anyEconomicChange = false;

  const worklist = options.includeTestOnly
    ? registry.all.filter((i) => i.enabled)
    : registry.liveEnabled;

  for (const inst of worklist) {
    if (!inst.enabled) continue;
    // Live path requires a verified mapping for adapters that need a symbol
    const primaryAdapter = getPrimaryAdapter(inst.primaryProvider?.id);
    if (inst.live && primaryAdapter?.requiresSymbol && !inst.primaryProvider?.symbol) {
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
      for (const w of resolved.warnings || []) {
        warnings.push({ isin: inst.isin, message: w });
      }
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
      // Say which of the two very different silences this is.
      reason: errors.length
        ? "All price sources failed; kept previous quotes"
        : "No economic change",
      degraded: errors.length > 0,
      quotesDoc: existingDoc,
      errors,
      warnings,
      legacyWrote: false,
    };
  }

  if (options.dryRun) {
    return {
      wrote: false,
      reason: "dry-run",
      degraded: errors.length > 0,
      quotesDoc,
      errors,
      warnings,
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

  // PRICE-HISTORY-PERSIST-001 r1: upsert one point per trading day for VWCE.
  // Non-fatal: the quote write already succeeded. If history fails, log and
  // continue -- the cron result is the quote file, not the history file.
  if (vwceQuote) {
    const hPath = options.historyPath || HISTORY_PATH;
    try {
      upsertHistoryPoint(
        hPath,
        VWCE_ISIN,
        "EUR",
        vwceQuote.asOf,
        vwceQuote.price,
        "cron",
      );
    } catch (histErr) {
      console.warn(
        "History persist failed (non-fatal):",
        histErr?.message || histErr,
      );
    }
  }

  return {
    wrote: true,
    degraded: errors.length > 0 || warnings.length > 0,
    quotesDoc,
    errors,
    warnings,
    legacyWrote,
  };
}
