/**
 * PRICE-HISTORY-PERSIST-001 r1 -- per-ISIN daily price history file.
 *
 * One JSON file per ISIN under public/data/price-history/.
 * Accumulates one point per trading day from the cron, plus optional
 * backfill points from a one-time manual script.
 *
 * DEDUP RULE: `date` field = `asOf` from quotes.json (YYYY-MM-DD,
 * Berlin/Xetra calendar). Last write wins per calendar date.
 * When the morning catch-up cron (06:00 UTC) and the evening cron
 * (18:30 UTC, after Xetra closes at 18:00 Berlin) both succeed for
 * the same trading date, the evening run overwrites the morning snapshot.
 * This is intentional: the evening price is the final settlement price.
 *
 * No interpolation. No invented points. A missing day stays missing.
 */

import fs from "node:fs";
import path from "node:path";
import { isValidAsOfDate } from "./time.mjs";
import { isValidIsin, normalizeIsin } from "./isin.mjs";

export const HISTORY_SCHEMA_VERSION = 1;

/**
 * @typedef {{ date: string; price: number; source: string }} HistoryPoint
 * @typedef {{
 *   schemaVersion: number;
 *   isin: string;
 *   currency: string;
 *   points: HistoryPoint[];
 * }} HistoryFile
 */

/**
 * Read an existing history file; return a default skeleton if missing.
 * Throws on malformed JSON (fail closed).
 * @param {string} filePath
 * @param {string} isin
 * @param {string} currency
 * @returns {HistoryFile}
 */
export function readHistoryFile(filePath, isin, currency) {
  if (!fs.existsSync(filePath)) {
    return { schemaVersion: HISTORY_SCHEMA_VERSION, isin, currency, points: [] };
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    throw new Error(`Malformed history file at ${filePath}: ${e.message}`);
  }
  if (!Array.isArray(raw.points)) {
    throw new Error(`History file at ${filePath} missing points array`);
  }
  return raw;
}

/**
 * Validate and sort points: YYYY-MM-DD ascending, dedup by date.
 * Last entry wins for duplicate dates (see module header for dedup rationale).
 * Silently drops malformed points so a bad existing entry never blocks a new
 * valid write.
 * @param {HistoryPoint[]} incoming
 * @returns {HistoryPoint[]}
 */
export function normalizePoints(incoming) {
  const map = new Map();
  for (const p of incoming) {
    if (!isValidAsOfDate(p.date)) continue;
    if (typeof p.price !== "number" || !Number.isFinite(p.price) || p.price <= 0) continue;
    if (typeof p.source !== "string" || !p.source) continue;
    map.set(p.date, { date: p.date, price: p.price, source: p.source });
  }
  return [...map.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

/**
 * Write a validated history document atomically.
 * @param {string} historyPath
 * @param {HistoryFile} doc
 */
function writeHistoryAtomic(historyPath, doc) {
  const dir = path.dirname(historyPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${historyPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, historyPath);
}

/**
 * Upsert one data point into the history file for the given ISIN.
 * Creates the directory and file if they do not exist.
 * Dedup: same date -> last write wins (see module header).
 *
 * @param {string} historyPath - full path to the history JSON file
 * @param {string} isin - e.g. "IE00BK5BQT80"
 * @param {string} currency - e.g. "EUR"
 * @param {string} date - YYYY-MM-DD (asOf from quotes.json)
 * @param {number} price - closing price
 * @param {string} source - "cron" from daily workflow, "backfill" from one-time script
 */
export function upsertHistoryPoint(historyPath, isin, currency, date, price, source) {
  const normIsin = normalizeIsin(isin);
  if (!isValidIsin(normIsin)) throw new Error(`Invalid ISIN: ${isin}`);
  if (!isValidAsOfDate(date)) throw new Error(`Invalid date: ${date}`);
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0)
    throw new Error(`Invalid price: ${price}`);
  if (typeof source !== "string" || !source) throw new Error(`Invalid source: ${source}`);

  const existing = readHistoryFile(historyPath, normIsin, currency);
  const merged = [...existing.points, { date, price, source }];
  const normalized = normalizePoints(merged);

  writeHistoryAtomic(historyPath, {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    isin: normIsin,
    currency,
    points: normalized,
  });
}

/**
 * Bulk-write many points at once (for one-time backfill).
 * Merges with any existing points in the file; same dedup/sort rules.
 *
 * @param {string} historyPath
 * @param {string} isin
 * @param {string} currency
 * @param {{ date: string; price: number; source: string }[]} newPoints
 */
export function bulkUpsertHistoryPoints(historyPath, isin, currency, newPoints) {
  const normIsin = normalizeIsin(isin);
  if (!isValidIsin(normIsin)) throw new Error(`Invalid ISIN: ${isin}`);
  if (!Array.isArray(newPoints)) throw new Error("newPoints must be an array");

  const existing = readHistoryFile(historyPath, normIsin, currency);
  const merged = [...existing.points, ...newPoints];
  const normalized = normalizePoints(merged);

  writeHistoryAtomic(historyPath, {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    isin: normIsin,
    currency,
    points: normalized,
  });
}
