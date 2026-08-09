/**
 * PRICE-HISTORY-PERSIST-001 r1 -- one-time manual backfill script.
 *
 * Fetches up to 5 years of daily closing prices for VWCE.DE from Yahoo
 * Finance and merges them into public/data/price-history/IE00BK5BQT80.json.
 *
 * HOW TO RUN (once, manually):
 *   node scripts/backfill-price-history.mjs [--dry-run]
 *
 * After a successful run, commit the updated file:
 *   git add public/data/price-history/IE00BK5BQT80.json
 *   git commit -m "chore(data): backfill VWCE price history from Yahoo"
 *   git push
 *
 * WHY MANUAL AND NOT A CRON:
 *   This site is static GitHub Pages. There is no server to trigger this
 *   script automatically on a schedule. The daily cron already appends new
 *   points going forward; this script only fills in the past, and only needs
 *   to run once (or occasionally to extend the window).
 *
 * ENDPOINT:
 *   https://query1.finance.yahoo.com/v8/finance/chart/VWCE.DE?range=5y&interval=1d
 *   Same Yahoo Finance v8 chart API the daily cron uses (see orchestrator.mjs),
 *   with range=5y instead of the default. Returns up to ~1250 trading days.
 *
 * SAFETY:
 *   - Bars with null/zero/negative close are silently skipped.
 *   - Future dates are rejected.
 *   - If the fetch fails, exits non-zero and writes nothing.
 *   - No interpolation for gaps: a missing day stays missing.
 *   - Existing cron points are preserved; only dates in the Yahoo range can
 *     be overwritten (backfill source tag will overwrite cron tag for the
 *     same date -- use --dry-run to preview before committing).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { dateStringInTz, isValidAsOfDate, roundPrice } from "./price/time.mjs";
import { bulkUpsertHistoryPoints } from "./price/history.mjs";
import { HISTORY_PATH, VWCE_ISIN } from "./price/orchestrator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const YAHOO_SYMBOL = "VWCE.DE";
const YAHOO_TZ = "Europe/Berlin";
const CURRENCY = "EUR";

// Yahoo Finance v8 chart API -- range=5y, 1-day interval, no pre/post market.
// Same domain and API version as the daily cron (query1.finance.yahoo.com/v8/finance/chart/).
const YAHOO_URL =
  `https://query1.finance.yahoo.com/v8/finance/chart/${YAHOO_SYMBOL}` +
  `?range=5y&interval=1d&includePrePost=false`;

const UA =
  "quy-vwce-cho-be/1.0 (+https://github.com/ziegepapa/quy-vwce-cho-be; backfill-bot)";

const isDryRun = process.argv.includes("--dry-run");

async function fetchYahooHistory() {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  try {
    const res = await fetch(YAHOO_URL, {
      signal: ac.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (res.status !== 200) {
      throw new Error(`HTTP ${res.status} from Yahoo Finance`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseBars(body) {
  const chart = body?.chart;
  if (!chart) {
    throw new Error("Yahoo: response missing chart object");
  }
  if (chart.error != null) {
    throw new Error(`Yahoo chart error: ${JSON.stringify(chart.error)}`);
  }
  const results = chart.result;
  if (!Array.isArray(results) || results.length !== 1) {
    throw new Error("Yahoo: expected exactly one chart result");
  }
  const result = results[0];
  const meta = result?.meta;
  if (!meta || typeof meta !== "object") {
    throw new Error("Yahoo: missing meta object");
  }
  if (meta.symbol !== YAHOO_SYMBOL) {
    throw new Error(`Yahoo: unexpected symbol ${meta.symbol} (want ${YAHOO_SYMBOL})`);
  }
  if (meta.currency !== "EUR") {
    throw new Error(`Yahoo: unexpected currency ${meta.currency} (want EUR)`);
  }

  const timestamps = result.timestamp;
  const closes = result.indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) {
    throw new Error("Yahoo: missing timestamp or close arrays");
  }
  if (timestamps.length !== closes.length) {
    throw new Error("Yahoo: timestamp/close length mismatch");
  }

  const today = dateStringInTz(new Date(), YAHOO_TZ);
  const points = [];
  let skippedNull = 0;
  let skippedFuture = 0;

  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const c = closes[i];
    if (typeof ts !== "number" || !Number.isFinite(ts)) {
      skippedNull++;
      continue;
    }
    if (typeof c !== "number" || !Number.isFinite(c) || c <= 0) {
      skippedNull++;
      continue;
    }
    const date = dateStringInTz(new Date(ts * 1000), YAHOO_TZ);
    if (!isValidAsOfDate(date)) {
      skippedNull++;
      continue;
    }
    if (date > today) {
      skippedFuture++;
      continue;
    }
    points.push({ date, price: roundPrice(c), source: "backfill" });
  }

  if (skippedNull > 0) console.log(`Skipped ${skippedNull} bars with null/invalid close.`);
  if (skippedFuture > 0) console.log(`Skipped ${skippedFuture} future-dated bars.`);

  return points;
}

try {
  console.log(`Fetching Yahoo Finance range=5y for ${YAHOO_SYMBOL}`);
  console.log(`URL: ${YAHOO_URL}`);
  const body = await fetchYahooHistory();
  const points = parseBars(body);

  if (points.length === 0) {
    console.error("FAIL: No valid bars returned from Yahoo Finance");
    process.exit(1);
  }

  // Sort for display purposes (normalizePoints will re-sort on write)
  points.sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = points[0].date;
  const last = points[points.length - 1].date;
  console.log(`Parsed ${points.length} valid trading-day bars`);
  console.log(`Date range: ${first} ... ${last}`);

  if (isDryRun) {
    console.log("[dry-run] Would write to:", HISTORY_PATH);
    console.log("[dry-run] First point:", JSON.stringify(points[0]));
    console.log("[dry-run] Last point: ", JSON.stringify(points[points.length - 1]));
    console.log("[dry-run] No files written.");
    process.exit(0);
  }

  bulkUpsertHistoryPoints(HISTORY_PATH, VWCE_ISIN, CURRENCY, points);
  console.log(`Done. Wrote ${points.length} points to ${HISTORY_PATH}`);
  console.log("Next step: git add + commit + push the updated file.");
  process.exit(0);
} catch (e) {
  console.error("FAIL:", e.message || e);
  process.exit(1);
}
