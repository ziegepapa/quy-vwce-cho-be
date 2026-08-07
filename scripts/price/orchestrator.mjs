/**
 * Multi-asset quote orchestrator.
 * Per-instrument isolation: one failure keeps prior valid quote for that key
 * and never deletes other instruments' quotes.
 *
 * Price source policy (PRICE-FALLBACK-001):
 *   - each instrument has an ordered chain: primary, declared fallbacks, then
 *     the cross-check provider if it can stand on its own
 *   - the first source that parses wins and is recorded honestly in `provider`
 *   - a cross-check that cannot be read only drops the cross-check stamp
 *   - a cross-check that disagrees beyond the tolerance stops the write
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
 * Resolve one instrument quote by walking its price source chain, then
 * cross-checking the winner against a different provider when possible.
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

  /** @type {string[]} */
  const warnings = [];
  let picked = null;

  for (const { cfg, role } of chain) {
    const adapter = getPrimaryAdapter(cfg.id);
    try {
      if (adapter.requiresSymbol && !cfg.symbol) {
        throw new OrchestratorError(
          `No verified ${cfg.id} symbol for ${instrument.isin}`,
        );
      }
      let body = options[adapter.bodyKey];
      if (!body) {
        // Canonical contract: the request URL always comes from the registry
        body = await fetchJson(cfg.url);
      }
      const parsed = adapter.parse(body, now, instrument);
      picked = { cfg, role, parsed };
      break;
    } catch (e) {
      warnings.push(`${cfg.id} (${role}) unusable: ${e?.message || e}`);
    }
  }

  if (!picked) {
    throw new OrchestratorError(
      `All price sources failed for ${instrument.isin}: ${warnings.join(" | ")}`,
    );
  }

  const chosenId = picked.cfg.id;
  let crossCheckedWith;
  let crossCheckDifferencePct;
  const ccCfg = instrument.crossCheckProvider;

  if (ccCfg?.id && ccCfg.id === chosenId) {
    // Never validate a source against itself: that proves nothing.
    warnings.push(`cross-check skipped: ${chosenId} is already the price source`);
  } else if (ccCfg?.id) {
    // Canonical discriminator is provider.id (never kind)
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
      let onvistaBody = options.onvistaBody;
      if (!onvistaBody) {
        // Canonical contract: use configured funds/stocks endpoint
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

  return {
    wrote: true,
    degraded: errors.length > 0 || warnings.length > 0,
    quotesDoc,
    errors,
    warnings,
    legacyWrote,
  };
}
