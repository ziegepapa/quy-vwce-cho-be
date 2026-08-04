/**
 * Load instrument registry. Live instruments require verified provider mapping.
 * testOnlyInstruments exist only for fixtures / multi-ISIN unit tests — never live fetch.
 *
 * Canonical provider shape at runtime:
 *   { id, url, providerUrl?, symbol?, ...adapter-specific metadata }
 * Orchestrator must not read kind/chartUrl/pageUrl/snapshotUrl.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidIsin, normalizeIsin } from "./isin.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REGISTRY_PATH = path.join(__dirname, "..", "price-instruments.json");

/** Supported provider ids — reject anything else at registry boundary. */
export const SUPPORTED_PROVIDER_IDS = new Set([
  "yahoo_finance_chart",
  "onvista",
]);

export class RegistryError extends Error {
  constructor(message) {
    super(message);
    this.name = "RegistryError";
  }
}

/**
 * Normalize a provider object to the canonical runtime contract.
 * @param {unknown} raw
 * @param {{ role: string, isin: string, requireUrl: boolean }} opts
 */
function normalizeProvider(raw, opts) {
  if (raw == null) return null;
  if (typeof raw !== "object") {
    throw new RegistryError(`${opts.role} for ${opts.isin} is not an object`);
  }
  const r = /** @type {Record<string, unknown>} */ (raw);
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!id) {
    throw new RegistryError(`${opts.role} for ${opts.isin} missing id`);
  }
  if (!SUPPORTED_PROVIDER_IDS.has(id)) {
    throw new RegistryError(
      `${opts.role} for ${opts.isin}: unsupported provider id "${id}"`,
    );
  }
  // Canonical request URL: only `url` (never chartUrl/snapshotUrl aliases)
  const url = typeof r.url === "string" ? r.url.trim() : "";
  if (opts.requireUrl && !url) {
    throw new RegistryError(`${opts.role} for ${opts.isin} missing required url`);
  }
  const providerUrl =
    typeof r.providerUrl === "string" && r.providerUrl.trim()
      ? r.providerUrl.trim()
      : undefined;
  const symbol =
    typeof r.symbol === "string" && r.symbol.trim()
      ? r.symbol.trim()
      : undefined;

  // Pass through adapter-specific metadata; strip legacy aliases so consumers
  // cannot accidentally depend on them.
  const {
    id: _id,
    url: _url,
    providerUrl: _pu,
    symbol: _sym,
    kind: _kind,
    chartUrl: _cu,
    pageUrl: _page,
    snapshotUrl: _su,
    ...rest
  } = r;

  return {
    id,
    url: url || undefined,
    providerUrl,
    symbol,
    ...rest,
  };
}

function normalizeInstrument(raw, { allowTestOnly = false } = {}) {
  if (!raw || typeof raw !== "object") {
    throw new RegistryError("Instrument entry is not an object");
  }
  const isin = normalizeIsin(raw.isin);
  if (!isValidIsin(isin)) {
    throw new RegistryError(`Invalid ISIN in registry: ${raw.isin}`);
  }
  const currency = String(raw.currency || "").toUpperCase();
  if (!currency || currency.length < 3) {
    throw new RegistryError(`Invalid currency for ${isin}`);
  }

  const isLive = Boolean(raw.live);
  const primaryProvider = normalizeProvider(raw.primaryProvider, {
    role: "primaryProvider",
    isin,
    requireUrl: isLive,
  });
  const crossCheckProvider = normalizeProvider(raw.crossCheckProvider, {
    role: "crossCheckProvider",
    isin,
    requireUrl: Boolean(raw.crossCheckProvider),
  });

  if (isLive && !primaryProvider?.symbol) {
    throw new RegistryError(`Live instrument ${isin} missing primaryProvider.symbol`);
  }
  if (isLive && !primaryProvider?.url) {
    throw new RegistryError(`Live instrument ${isin} missing primaryProvider.url`);
  }
  // Never invent provider symbols from ISIN
  return {
    isin,
    ticker: raw.ticker ? String(raw.ticker).trim().toUpperCase() : undefined,
    displayName: raw.displayName ? String(raw.displayName).trim() : isin,
    currency,
    venue: raw.venue ? String(raw.venue).trim() : undefined,
    timezone: raw.timezone || "Europe/Berlin",
    closeHourLocal: typeof raw.closeHourLocal === "number" ? raw.closeHourLocal : 18,
    enabled: raw.enabled !== false,
    live: isLive,
    testOnly: Boolean(allowTestOnly),
    priceMin: typeof raw.priceMin === "number" ? raw.priceMin : 1,
    priceMax: typeof raw.priceMax === "number" ? raw.priceMax : 1e6,
    maxDayChangePct: typeof raw.maxDayChangePct === "number" ? raw.maxDayChangePct : 20,
    maxAsOfAgeDays: typeof raw.maxAsOfAgeDays === "number" ? raw.maxAsOfAgeDays : 7,
    crossCheckMaxPct: typeof raw.crossCheckMaxPct === "number" ? raw.crossCheckMaxPct : 2,
    primaryProvider,
    crossCheckProvider,
  };
}

/**
 * @param {string} [filePath]
 * @param {{ includeTestOnly?: boolean }} [opts]
 */
export function loadRegistry(filePath = DEFAULT_REGISTRY_PATH, opts = {}) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!raw || raw.schemaVersion !== 1) {
    throw new RegistryError(`Bad registry schemaVersion ${raw?.schemaVersion}`);
  }
  if (!Array.isArray(raw.instruments) || !raw.instruments.length) {
    throw new RegistryError("Registry must list at least one instrument");
  }
  const instruments = raw.instruments.map((i) => normalizeInstrument(i));
  const byIsin = new Map();
  for (const inst of instruments) {
    if (byIsin.has(inst.isin)) {
      throw new RegistryError(`Duplicate ISIN in live registry: ${inst.isin}`);
    }
    byIsin.set(inst.isin, inst);
  }
  /** @type {ReturnType<typeof normalizeInstrument>[]} */
  let testOnly = [];
  if (opts.includeTestOnly && Array.isArray(raw.testOnlyInstruments)) {
    testOnly = raw.testOnlyInstruments.map((i) =>
      normalizeInstrument(i, { allowTestOnly: true }),
    );
    for (const inst of testOnly) {
      if (byIsin.has(inst.isin)) {
        throw new RegistryError(`testOnly ISIN collides with live: ${inst.isin}`);
      }
      byIsin.set(inst.isin, inst);
    }
  }
  const liveEnabled = instruments.filter((i) => i.enabled && i.live);
  return {
    schemaVersion: 1,
    instruments,
    testOnlyInstruments: testOnly,
    all: [...instruments, ...testOnly],
    liveEnabled,
    byIsin,
  };
}

export function quoteKey(isin, currency) {
  return `${normalizeIsin(isin)}|${String(currency).toUpperCase()}`;
}
