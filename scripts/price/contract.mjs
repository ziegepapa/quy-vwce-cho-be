/**
 * quotes.json schema v2 + legacy vwce-price.json schema 1 validation.
 */

import fs from "node:fs";
import { isValidIsin, normalizeIsin } from "./isin.mjs";
import { ASOF_RE, isValidAsOfDate } from "./time.mjs";
import { quoteKey } from "./registry.mjs";

export class ContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "ContractError";
  }
}

const MAX_FUTURE_MS = 15 * 60 * 1000; // 15 min clock skew

function assertIsoNotFarFuture(label, iso, now = new Date()) {
  if (typeof iso !== "string") {
    throw new ContractError(`${label}: missing or not a string`);
  }
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    throw new ContractError(`${label}: not parseable ISO: ${iso}`);
  }
  if (ms - now.getTime() > MAX_FUTURE_MS) {
    throw new ContractError(`${label}: unreasonably in the future: ${iso}`);
  }
  return ms;
}

/**
 * Validate one quote row (schema v2 item).
 * @returns {object} normalized quote
 */
export function validateQuoteRow(q, now = new Date()) {
  if (!q || typeof q !== "object") {
    throw new ContractError("Quote row is not an object");
  }
  const isin = normalizeIsin(q.instrumentIsin);
  if (!isValidIsin(isin)) {
    throw new ContractError(`Invalid instrumentIsin checksum: ${q.instrumentIsin}`);
  }
  const currency = String(q.currency || "").toUpperCase();
  if (!currency || currency.length < 3) {
    throw new ContractError(`Invalid currency for ${isin}: ${q.currency}`);
  }
  if (typeof q.price !== "number" || !Number.isFinite(q.price) || q.price <= 0) {
    throw new ContractError(`Invalid price for ${isin}: ${q.price}`);
  }
  if (!isValidAsOfDate(q.asOf)) {
    throw new ContractError(`Invalid asOf for ${isin}: ${q.asOf}`);
  }
  // Future-skew check always uses wall clock so fixture `now` cannot reject valid timestamps
  assertIsoNotFarFuture(`fetchedAt (${isin})`, q.fetchedAt, new Date());
  if (q.source !== "auto") {
    throw new ContractError(`Feed quote source must be "auto" (${isin}): ${q.source}`);
  }
  if (typeof q.provider !== "string" || !q.provider) {
    throw new ContractError(`Missing provider for ${isin}`);
  }
  if (typeof q.providerUrl !== "string" || !q.providerUrl) {
    throw new ContractError(`Missing providerUrl for ${isin}`);
  }
  return {
    instrumentIsin: isin,
    currency,
    venue: q.venue != null ? String(q.venue) : undefined,
    price: q.price,
    asOf: String(q.asOf).trim(),
    fetchedAt: q.fetchedAt,
    source: "auto",
    provider: q.provider,
    providerUrl: q.providerUrl,
    crossCheckedWith: q.crossCheckedWith != null ? String(q.crossCheckedWith) : undefined,
    crossCheckDifferencePct:
      typeof q.crossCheckDifferencePct === "number" && Number.isFinite(q.crossCheckDifferencePct)
        ? q.crossCheckDifferencePct
        : undefined,
  };
}

/**
 * Validate full quotes.json document (schema v2).
 * Deterministic sort by ISIN then currency. Rejects duplicates.
 */
export function validateQuotesDocument(doc, now = new Date()) {
  if (!doc || typeof doc !== "object") {
    throw new ContractError("Document is not an object");
  }
  if (doc.schemaVersion !== 2) {
    throw new ContractError(`Expected schemaVersion 2, got ${doc.schemaVersion}`);
  }
  assertIsoNotFarFuture("generatedAt", doc.generatedAt, new Date());
  if (!Array.isArray(doc.quotes)) {
    throw new ContractError("quotes must be an array");
  }
  const seen = new Set();
  const normalized = [];
  for (const raw of doc.quotes) {
    const q = validateQuoteRow(raw, now);
    const key = quoteKey(q.instrumentIsin, q.currency);
    if (seen.has(key)) {
      throw new ContractError(`Duplicate quote key: ${key}`);
    }
    seen.add(key);
    normalized.push(q);
  }
  normalized.sort((a, b) => {
    const c = a.instrumentIsin.localeCompare(b.instrumentIsin);
    return c !== 0 ? c : a.currency.localeCompare(b.currency);
  });
  return {
    schemaVersion: 2,
    generatedAt: doc.generatedAt,
    quotes: normalized,
  };
}

/** Read existing quotes.json; return null if missing. Fail closed on malformed. */
export function readExistingQuotes(filePath, now = new Date()) {
  if (!fs.existsSync(filePath)) return null;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    throw new ContractError(`Malformed quotes.json (fail closed): ${e.message}`);
  }
  return validateQuotesDocument(raw, now);
}

/** Map of quoteKey -> quote for convenient lookup. */
export function quotesToMap(doc) {
  const map = new Map();
  if (!doc) return map;
  for (const q of doc.quotes) {
    map.set(quoteKey(q.instrumentIsin, q.currency), q);
  }
  return map;
}

/**
 * Economic equality of two quote rows (ignore fetchedAt).
 */
export function sameQuoteEconomics(a, b) {
  if (!a || !b) return false;
  const fields = [
    "instrumentIsin",
    "currency",
    "venue",
    "price",
    "asOf",
    "source",
    "provider",
    "providerUrl",
    "crossCheckedWith",
    "crossCheckDifferencePct",
  ];
  return fields.every((k) => a[k] === b[k]);
}

/**
 * Whether two full documents are economically identical (ignore generatedAt/fetchedAt).
 */
export function sameDocumentEconomics(a, b) {
  if (!a || !b) return false;
  if (a.quotes.length !== b.quotes.length) return false;
  const ma = quotesToMap(a);
  const mb = quotesToMap(b);
  if (ma.size !== mb.size) return false;
  for (const [k, qa] of ma) {
    const qb = mb.get(k);
    if (!qb || !sameQuoteEconomics(qa, qb)) return false;
  }
  return true;
}

/** Legacy schema 1 → one v2 quote row (VWCE). */
export function legacyV1ToQuoteRow(v1) {
  return {
    instrumentIsin: normalizeIsin(v1.isin),
    currency: String(v1.currency).toUpperCase(),
    venue: v1.venue,
    price: v1.price,
    asOf: v1.asOf,
    fetchedAt: v1.fetchedAt,
    source: "auto",
    provider: v1.provider,
    providerUrl: v1.providerUrl,
    crossCheckedWith: v1.crossCheckedWith,
    crossCheckDifferencePct: v1.crossCheckDifferencePct,
  };
}

/** V2 VWCE quote → legacy schema 1 payload. */
export function quoteRowToLegacyV1(q, ticker = "VWCE") {
  return {
    schemaVersion: 1,
    isin: q.instrumentIsin,
    ticker,
    venue: q.venue || "XETRA",
    currency: q.currency,
    price: q.price,
    asOf: q.asOf,
    fetchedAt: q.fetchedAt,
    provider: q.provider,
    providerUrl: q.providerUrl,
    crossCheckedWith: q.crossCheckedWith ?? "onvista",
    crossCheckDifferencePct:
      typeof q.crossCheckDifferencePct === "number" ? q.crossCheckDifferencePct : 0,
  };
}

export function writeJsonAtomic(payload, filePath) {
  const dir = pathDirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, filePath);
}

function pathDirname(p) {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(0, i) : ".";
}
