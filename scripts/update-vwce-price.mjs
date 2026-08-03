/**
 * C2 — Fetch VWCE Xetra closed market price (Yahoo primary + onvista cross-check).
 * Writes public/data/vwce-price.json only when safe. Never invents prices.
 * No secrets. No HTML scraping. Node 22 built-ins only.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(REPO_ROOT, "public", "data", "vwce-price.json");

export const YAHOO_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/VWCE.DE?interval=1d&range=10d";
export const ONVISTA_URL =
  "https://api.onvista.de/api/v1/funds/ISIN:IE00BK5BQT80/snapshot";

export const EXPECTED_ISIN = "IE00BK5BQT80";
export const EXPECTED_TICKER = "VWCE";
export const PRICE_MIN = 20;
export const PRICE_MAX = 400;
export const CROSS_CHECK_MAX_PCT = 2;
export const MAX_ASOF_AGE_DAYS = 7;
export const MAX_DAY_CHANGE_PCT = 20;
export const BERLIN_TZ = "Europe/Berlin";
export const CLOSE_HOUR_BERLIN = 18; // after this local hour, today's bar may be used

const UA =
  "quy-vwce-cho-be/1.0 (+https://github.com/ziegepapa/quy-vwce-cho-be; price-bot)";

export class PriceFeedError extends Error {
  constructor(message) {
    super(message);
    this.name = "PriceFeedError";
  }
}

/** Format Date (or ms) as YYYY-MM-DD in Europe/Berlin. */
export function berlinDateString(date) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BERLIN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;
  return `${y}-${m}-${day}`;
}

/** Hour 0–23 in Europe/Berlin. */
export function berlinHour(date) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BERLIN_TZ,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  return Number(parts.find((p) => p.type === "hour").value);
}

export function weekdayBerlin(date) {
  // 0=Sun .. 6=Sat in Berlin calendar
  const d = date instanceof Date ? date : new Date(date);
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: BERLIN_TZ,
    weekday: "short",
  }).format(d);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd];
}

/**
 * Pure: pick the closed daily bar from Yahoo series.
 * @param {{ timestamp: number, close: number }[]} bars  // already filtered positive finite close
 * @param {Date} now
 * @returns {{ timestamp: number, close: number, asOf: string }}
 */
export function selectClosedBar(bars, now) {
  if (!bars.length) {
    throw new PriceFeedError("No valid Yahoo bars with positive close");
  }
  const todayBerlin = berlinDateString(now);
  const hour = berlinHour(now);
  const allowToday = hour >= CLOSE_HOUR_BERLIN;

  // Sort ascending by timestamp
  const sorted = [...bars].sort((a, b) => a.timestamp - b.timestamp);

  /** @type {{ timestamp: number, close: number, asOf: string }[]} */
  const withAsOf = sorted.map((b) => ({
    ...b,
    asOf: berlinDateString(new Date(b.timestamp * 1000)),
  }));

  let candidates = withAsOf;
  if (!allowToday) {
    candidates = withAsOf.filter((b) => b.asOf < todayBerlin);
  } else {
    candidates = withAsOf.filter((b) => b.asOf <= todayBerlin);
  }
  if (!candidates.length) {
    throw new PriceFeedError(
      allowToday
        ? "No closed Yahoo bar on or before today (Berlin)"
        : "Before 18:00 Berlin: no Yahoo bar strictly before today",
    );
  }
  return candidates[candidates.length - 1];
}

export function longNameLooksLikeVwce(longName) {
  if (typeof longName !== "string") return false;
  const n = longName.toLowerCase();
  const hasVanguard = n.includes("vanguard");
  const hasFtse = n.includes("ftse") && n.includes("all-world");
  const hasAcc =
    n.includes("accumulation") ||
    n.includes("accumulating") ||
    n.includes("acc");
  return hasVanguard && hasFtse && hasAcc;
}

/**
 * Validate Yahoo JSON and return selected closed bar + meta.
 * @param {unknown} body
 * @param {Date} now
 */
export function parseAndValidateYahoo(body, now) {
  if (!body || typeof body !== "object") {
    throw new PriceFeedError("Yahoo: body is not an object");
  }
  const chart = /** @type {any} */ (body).chart;
  if (!chart || typeof chart !== "object") {
    throw new PriceFeedError("Yahoo: missing chart");
  }
  if (chart.error != null) {
    throw new PriceFeedError(`Yahoo: chart.error = ${JSON.stringify(chart.error)}`);
  }
  const results = chart.result;
  if (!Array.isArray(results) || results.length !== 1) {
    throw new PriceFeedError("Yahoo: expected exactly one result");
  }
  const result = results[0];
  const meta = result?.meta;
  if (!meta || typeof meta !== "object") {
    throw new PriceFeedError("Yahoo: missing meta");
  }
  if (meta.symbol !== "VWCE.DE") {
    throw new PriceFeedError(`Yahoo: bad symbol ${meta.symbol}`);
  }
  if (meta.currency !== "EUR") {
    throw new PriceFeedError(`Yahoo: bad currency ${meta.currency}`);
  }
  const venueOk =
    meta.fullExchangeName === "XETRA" || meta.exchangeName === "GER";
  if (!venueOk) {
    throw new PriceFeedError(
      `Yahoo: bad venue fullExchangeName=${meta.fullExchangeName} exchangeName=${meta.exchangeName}`,
    );
  }
  if (meta.instrumentType !== "ETF") {
    throw new PriceFeedError(`Yahoo: bad instrumentType ${meta.instrumentType}`);
  }
  if (!longNameLooksLikeVwce(meta.longName)) {
    throw new PriceFeedError(`Yahoo: longName not recognized: ${meta.longName}`);
  }

  const timestamps = result.timestamp;
  const closes = result.indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) {
    throw new PriceFeedError("Yahoo: missing timestamp/close arrays");
  }
  if (timestamps.length !== closes.length) {
    throw new PriceFeedError("Yahoo: timestamp/close length mismatch");
  }

  /** @type {{ timestamp: number, close: number }[]} */
  const bars = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const c = closes[i];
    if (typeof ts !== "number" || !Number.isFinite(ts)) continue;
    if (typeof c !== "number" || !Number.isFinite(c) || c <= 0) continue;
    bars.push({ timestamp: ts, close: c });
  }

  const selected = selectClosedBar(bars, now);
  if (selected.close < PRICE_MIN || selected.close > PRICE_MAX) {
    throw new PriceFeedError(
      `Yahoo: close ${selected.close} outside ${PRICE_MIN}–${PRICE_MAX}`,
    );
  }

  const asOf = selected.asOf;
  const today = berlinDateString(now);
  if (asOf > today) {
    throw new PriceFeedError(`Yahoo: asOf ${asOf} is in the future vs Berlin ${today}`);
  }
  // age in calendar days (Berlin)
  const asOfMs = Date.parse(`${asOf}T12:00:00+02:00`); // approximate; sufficient for age gate
  const nowMs = now.getTime();
  const ageDays = (nowMs - asOfMs) / (24 * 3600 * 1000);
  if (ageDays > MAX_ASOF_AGE_DAYS) {
    throw new PriceFeedError(
      `Yahoo: asOf ${asOf} older than ${MAX_ASOF_AGE_DAYS} calendar days`,
    );
  }

  return {
    price: roundPrice(selected.close),
    asOf,
    meta: {
      symbol: meta.symbol,
      currency: meta.currency,
      venue: "XETRA",
      longName: meta.longName,
    },
  };
}

export function roundPrice(n) {
  return Math.round(n * 10000) / 10000;
}

export function roundPct(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * Extract Xetra EUR quote from onvista snapshot.
 * @param {unknown} body
 */
export function parseAndValidateOnvista(body) {
  if (!body || typeof body !== "object") {
    throw new PriceFeedError("onvista: body is not an object");
  }
  const b = /** @type {any} */ (body);
  const isin = b.instrument?.isin;
  if (isin !== EXPECTED_ISIN) {
    throw new PriceFeedError(`onvista: ISIN mismatch ${isin}`);
  }
  const list = b.quoteList?.list;
  if (!Array.isArray(list) || !list.length) {
    throw new PriceFeedError("onvista: empty quoteList");
  }
  const xetra = list.find(
    (q) =>
      q?.market?.name === "Xetra" ||
      q?.market?.codeExchange === "GER" ||
      q?.market?.codeMarket === "_GER",
  );
  if (!xetra) {
    throw new PriceFeedError("onvista: no Xetra/GER quote in quoteList");
  }
  if (xetra.isoCurrency !== "EUR") {
    throw new PriceFeedError(`onvista: Xetra currency ${xetra.isoCurrency}`);
  }
  const last = xetra.last;
  const previousLast = xetra.previousLast;
  if (typeof last !== "number" || !Number.isFinite(last) || last <= 0) {
    throw new PriceFeedError(`onvista: bad last ${last}`);
  }
  const datetimeLast = xetra.datetimeLast;
  const datetimePreviousLast = xetra.datetimePreviousLast;
  if (typeof datetimeLast !== "string") {
    throw new PriceFeedError("onvista: missing datetimeLast");
  }
  return {
    isin,
    last: roundPrice(last),
    previousLast:
      typeof previousLast === "number" && Number.isFinite(previousLast) && previousLast > 0
        ? roundPrice(previousLast)
        : null,
    datetimeLast,
    datetimePreviousLast:
      typeof datetimePreviousLast === "string" ? datetimePreviousLast : null,
    lastAsOf: berlinDateString(new Date(datetimeLast)),
    previousAsOf: datetimePreviousLast
      ? berlinDateString(new Date(datetimePreviousLast))
      : null,
  };
}

/**
 * Cross-check Yahoo selected bar against onvista same-day price.
 * @returns {{ ok: true, onvistaPrice: number, differencePct: number } | never}
 */
export function crossCheckYahooWithOnvista(yahoo, onvista) {
  let onvistaPrice = null;
  if (onvista.lastAsOf === yahoo.asOf) {
    onvistaPrice = onvista.last;
  } else if (
    onvista.previousAsOf &&
    onvista.previousAsOf === yahoo.asOf &&
    onvista.previousLast != null
  ) {
    onvistaPrice = onvista.previousLast;
  } else {
    throw new PriceFeedError(
      `Cross-check: cannot align dates (yahoo asOf=${yahoo.asOf}, onvista lastAsOf=${onvista.lastAsOf}, previousAsOf=${onvista.previousAsOf})`,
    );
  }
  if (onvistaPrice < PRICE_MIN || onvistaPrice > PRICE_MAX) {
    throw new PriceFeedError(`Cross-check: onvista price ${onvistaPrice} out of range`);
  }
  const differencePct = roundPct(
    (Math.abs(yahoo.price - onvistaPrice) / yahoo.price) * 100,
  );
  if (differencePct > CROSS_CHECK_MAX_PCT) {
    throw new PriceFeedError(
      `Cross-check: difference ${differencePct}% > ${CROSS_CHECK_MAX_PCT}% (yahoo=${yahoo.price}, onvista=${onvistaPrice})`,
    );
  }
  return { ok: true, onvistaPrice, differencePct };
}

export function buildPayload(yahoo, cross, fetchedAt) {
  return {
    schemaVersion: 1,
    isin: EXPECTED_ISIN,
    ticker: EXPECTED_TICKER,
    venue: "XETRA",
    currency: "EUR",
    price: yahoo.price,
    asOf: yahoo.asOf,
    fetchedAt: fetchedAt.toISOString(),
    provider: "yahoo_finance_chart",
    providerUrl: "https://finance.yahoo.com/quote/VWCE.DE",
    crossCheckedWith: "onvista",
    crossCheckDifferencePct: cross.differencePct,
  };
}

export const EXPECTED_PROVIDER = "yahoo_finance_chart";
export const EXPECTED_PROVIDER_URL = "https://finance.yahoo.com/quote/VWCE.DE";
export const EXPECTED_CROSS_CHECKED_WITH = "onvista";

const ASOF_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate an on-disk price payload. Throws PriceFeedError on any defect.
 * Used so a corrupted/malformed file is never treated as "missing" and overwritten.
 */
export function validateExistingPayload(data) {
  if (!data || typeof data !== "object") {
    throw new PriceFeedError("Existing file: not a JSON object");
  }
  const d = /** @type {any} */ (data);
  if (d.schemaVersion !== 1) {
    throw new PriceFeedError(`Existing file: bad schemaVersion ${d.schemaVersion}`);
  }
  if (d.isin !== EXPECTED_ISIN) {
    throw new PriceFeedError(`Existing file: bad isin ${d.isin}`);
  }
  if (d.ticker !== EXPECTED_TICKER) {
    throw new PriceFeedError(`Existing file: bad ticker ${d.ticker}`);
  }
  if (d.venue !== "XETRA") {
    throw new PriceFeedError(`Existing file: bad venue ${d.venue}`);
  }
  if (d.currency !== "EUR") {
    throw new PriceFeedError(`Existing file: bad currency ${d.currency}`);
  }
  if (typeof d.price !== "number" || !Number.isFinite(d.price)) {
    throw new PriceFeedError(`Existing file: bad price ${d.price}`);
  }
  if (d.price < PRICE_MIN || d.price > PRICE_MAX) {
    throw new PriceFeedError(
      `Existing file: price ${d.price} outside ${PRICE_MIN}–${PRICE_MAX}`,
    );
  }
  if (typeof d.asOf !== "string" || !ASOF_RE.test(d.asOf)) {
    throw new PriceFeedError(`Existing file: bad asOf ${d.asOf}`);
  }
  if (typeof d.fetchedAt !== "string") {
    throw new PriceFeedError("Existing file: missing fetchedAt");
  }
  const fetchedMs = Date.parse(d.fetchedAt);
  if (!Number.isFinite(fetchedMs)) {
    throw new PriceFeedError(`Existing file: bad fetchedAt ${d.fetchedAt}`);
  }
  if (d.provider !== EXPECTED_PROVIDER) {
    throw new PriceFeedError(`Existing file: bad provider ${d.provider}`);
  }
  if (d.providerUrl !== EXPECTED_PROVIDER_URL) {
    throw new PriceFeedError(`Existing file: bad providerUrl ${d.providerUrl}`);
  }
  if (d.crossCheckedWith !== EXPECTED_CROSS_CHECKED_WITH) {
    throw new PriceFeedError(
      `Existing file: bad crossCheckedWith ${d.crossCheckedWith}`,
    );
  }
  if (
    typeof d.crossCheckDifferencePct !== "number" ||
    !Number.isFinite(d.crossCheckDifferencePct)
  ) {
    throw new PriceFeedError(
      `Existing file: bad crossCheckDifferencePct ${d.crossCheckDifferencePct}`,
    );
  }
  if (
    d.crossCheckDifferencePct < 0 ||
    d.crossCheckDifferencePct > CROSS_CHECK_MAX_PCT
  ) {
    throw new PriceFeedError(
      `Existing file: crossCheckDifferencePct ${d.crossCheckDifferencePct} outside 0–${CROSS_CHECK_MAX_PCT}`,
    );
  }
  return d;
}

/**
 * Read existing price file.
 * - Missing file → null (first seed is allowed)
 * - Present but unparseable / invalid schema → throw (never overwrite garbage silently)
 */
export function readExistingPayload(filePath = OUT_PATH) {
  if (!fs.existsSync(filePath)) return null;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    throw new PriceFeedError(
      `Existing file: JSON parse failed (${e?.message || e})`,
    );
  }
  return validateExistingPayload(parsed);
}

/** Schema fields that must match for a semantic no-op (fetchedAt is ignored). */
const SEMANTIC_FIELDS = [
  "schemaVersion",
  "isin",
  "ticker",
  "venue",
  "currency",
  "price",
  "asOf",
  "provider",
  "providerUrl",
  "crossCheckedWith",
  "crossCheckDifferencePct",
];

export function sameEconomics(existing, payload) {
  return SEMANTIC_FIELDS.every((k) => existing[k] === payload[k]);
}

/**
 * Decide whether to write. May throw PriceFeedError to abort.
 * Returns payload or null if no write needed.
 */
export function decideWrite(payload, existing, now) {
  if (!existing) return payload;

  // Never regress asOf to an older trading day
  if (
    typeof payload.asOf === "string" &&
    typeof existing.asOf === "string" &&
    payload.asOf < existing.asOf
  ) {
    throw new PriceFeedError(
      `Refusing stale price regression: payload asOf ${payload.asOf} is older than existing ${existing.asOf}`,
    );
  }

  if (sameEconomics(existing, payload)) {
    return null; // skip empty commit — only fetchedAt may differ
  }

  // Same asOf but different price: only after close hour
  if (existing.asOf === payload.asOf && existing.price !== payload.price) {
    if (berlinHour(now) < CLOSE_HOUR_BERLIN) {
      throw new PriceFeedError(
        `Refusing to change price for same asOf ${payload.asOf} before 18:00 Berlin`,
      );
    }
  }

  // Sudden jump >20% vs previous file price
  if (
    typeof existing.price === "number" &&
    existing.price > 0 &&
    Math.abs(payload.price - existing.price) / existing.price * 100 > MAX_DAY_CHANGE_PCT
  ) {
    throw new PriceFeedError(
      `Price jump >${MAX_DAY_CHANGE_PCT}% vs file (${existing.price} → ${payload.price})`,
    );
  }

  return payload;
}

export function writePayloadAtomic(payload, filePath = OUT_PATH) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, filePath);
}

async function fetchJson(url, timeoutMs = 20_000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
      },
    });
    if (res.status !== 200) {
      throw new PriceFeedError(`HTTP ${res.status} for ${url}`);
    }
    return await res.json();
  } catch (e) {
    if (e instanceof PriceFeedError) throw e;
    if (e?.name === "AbortError") {
      throw new PriceFeedError(`Timeout fetching ${url}`);
    }
    throw new PriceFeedError(`Fetch failed ${url}: ${e?.message || e}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Main update path (live). Returns { wrote: boolean, payload?: object, reason?: string }
 */
export async function runUpdate(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const yahooBody =
    options.yahooBody !== undefined
      ? options.yahooBody
      : await fetchJson(YAHOO_URL);
  const onvistaBody =
    options.onvistaBody !== undefined
      ? options.onvistaBody
      : await fetchJson(ONVISTA_URL);

  let yahoo;
  try {
    yahoo = parseAndValidateYahoo(yahooBody, now);
  } catch (e) {
    // C2: Yahoo failure always fails — onvista is NOT autonomous fallback
    throw e;
  }

  let onvista;
  try {
    onvista = parseAndValidateOnvista(onvistaBody);
  } catch (e) {
    throw e;
  }

  const cross = crossCheckYahooWithOnvista(yahoo, onvista);
  const fetchedAt = options.fetchedAt instanceof Date ? options.fetchedAt : new Date();
  const payload = buildPayload(yahoo, cross, fetchedAt);
  const existing = options.existing !== undefined
    ? options.existing
    : readExistingPayload(options.outPath || OUT_PATH);
  const toWrite = decideWrite(payload, existing, now);
  if (!toWrite) {
    return { wrote: false, reason: "No economic change", payload };
  }
  if (options.dryRun) {
    return { wrote: false, reason: "dry-run", payload: toWrite };
  }
  writePayloadAtomic(toWrite, options.outPath || OUT_PATH);
  return { wrote: true, payload: toWrite };
}

// CLI
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const dryRun = process.argv.includes("--dry-run");
  const fixture = process.argv.includes("--fixture");
  try {
    const opts = { dryRun };
    if (fixture) {
      opts.yahooBody = JSON.parse(
        fs.readFileSync(path.join(__dirname, "fixtures/yahoo-vwce.json"), "utf8"),
      );
      opts.onvistaBody = JSON.parse(
        fs.readFileSync(path.join(__dirname, "fixtures/onvista-vwce.json"), "utf8"),
      );
      // Simulate after close on 2026-08-03 so Aug 3 bar is allowed if desired;
      // For seed we use before-close so Jul 31 is selected — pass --after-close to allow today.
      if (process.argv.includes("--after-close")) {
        opts.now = new Date("2026-08-03T17:00:00.000Z"); // 19:00 Berlin (CEST=UTC+2)
      } else {
        opts.now = new Date("2026-08-03T09:00:00.000Z"); // 11:00 Berlin — before close
      }
      opts.fetchedAt = new Date();
    }
    const result = await runUpdate(opts);
    if (result.wrote) {
      console.log("Wrote", OUT_PATH);
      console.log(JSON.stringify(result.payload, null, 2));
      process.exit(0);
    }
    console.log(result.reason || "No write");
    if (result.payload) console.log(JSON.stringify(result.payload, null, 2));
    process.exit(0);
  } catch (e) {
    console.error("FAIL:", e.message || e);
    process.exit(1);
  }
}
