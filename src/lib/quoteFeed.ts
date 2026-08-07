import type { QuoteCandidate } from "./types";
import type { AutoQuoteInput } from "./db.m06";
import { db } from "./db.m01a";
import { isSameAutoQuoteSemantics, putAutoCandidateAndResolve } from "./db.m06";
import {
  calendarDaysBetween,
  candidateId,
  isValidAsOfDate,
  isValidIsin,
  normalizeIsin,
  toDateOnly,
} from "./instrument";

const FEED_SCHEMA_VERSION = 2;
const DEFAULT_TIMEOUT_MS = 10_000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

export type QuoteFeedRowIssue = {
  index: number;
  key?: string;
  reason: string;
};

export type QuoteFeedValidationResult = {
  generatedAt: string;
  rows: AutoQuoteInput[];
  skipped: QuoteFeedRowIssue[];
};

export type QuoteFeedIngestStatus = "ok" | "partial" | "offline" | "error";

export type QuoteFeedIngestResult = {
  status: QuoteFeedIngestStatus;
  url: string;
  totalRows: number;
  acceptedRows: number;
  updated: number;
  unchanged: number;
  skipped: QuoteFeedRowIssue[];
  errors: string[];
  /** Envelope timestamp of the feed that was read, when one could be parsed. */
  feedGeneratedAt?: string | undefined;
  /** Newest closed session among accepted rows (YYYY-MM-DD). */
  newestAsOf?: string | undefined;
  /** Newest price-bot fetch timestamp among accepted rows (ISO-8601). */
  newestFetchedAt?: string | undefined;
};

export type QuoteFeedFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type IngestQuotesFeedOptions = {
  url?: string;
  fetchImpl?: QuoteFeedFetch;
  now?: Date;
  timeoutMs?: number;
  online?: boolean;
};

export class QuoteFeedEnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteFeedEnvelopeError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function cleanOptionalString(value: unknown, field: string): string | undefined {
  if (value == null) return undefined;
  return cleanRequiredString(value, field);
}

function parseTimestamp(value: unknown, field: string, nowMs: number): string {
  const raw = cleanRequiredString(value, field);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be ISO-8601`);
  if (parsed > nowMs + FUTURE_TOLERANCE_MS) {
    throw new Error(`${field} is unreasonably in the future`);
  }
  return raw;
}

function cleanProviderUrl(value: unknown): string | undefined {
  const raw = cleanOptionalString(value, "providerUrl");
  if (!raw) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("providerUrl must be an absolute URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("providerUrl must use http or https");
  }
  return raw;
}

function rowKeyFromUnknown(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.instrumentIsin !== "string" || typeof value.currency !== "string") {
    return undefined;
  }
  const isin = normalizeIsin(value.instrumentIsin);
  const currency = value.currency.trim().toUpperCase();
  if (!isin || !currency) return undefined;
  return `${isin}|${currency}`;
}

function validateRow(value: unknown, now: Date): AutoQuoteInput {
  if (!isRecord(value)) throw new Error("row must be an object");
  const instrumentIsin = normalizeIsin(cleanRequiredString(value.instrumentIsin, "instrumentIsin"));
  if (!isValidIsin(instrumentIsin)) throw new Error("instrumentIsin checksum is invalid");

  const currency = cleanRequiredString(value.currency, "currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency must be a 3-letter code");

  const venue = cleanRequiredString(value.venue, "venue");
  if (typeof value.price !== "number" || !Number.isFinite(value.price) || value.price <= 0) {
    throw new Error("price must be finite and greater than zero");
  }

  const asOf = cleanRequiredString(value.asOf, "asOf");
  if (!isValidAsOfDate(asOf)) throw new Error("asOf must be a valid YYYY-MM-DD date");
  const nowDate = toDateOnly(now);
  if (calendarDaysBetween(asOf, nowDate) < 0) throw new Error("asOf is in the future");

  if (value.source !== "auto") throw new Error("source must be auto");
  const provider = cleanRequiredString(value.provider, "provider");
  const providerUrl = cleanProviderUrl(value.providerUrl);
  const fetchedAt = parseTimestamp(value.fetchedAt, "fetchedAt", now.getTime());
  const crossCheckedWith = cleanOptionalString(value.crossCheckedWith, "crossCheckedWith");

  let crossCheckDifferencePct: number | undefined;
  if (value.crossCheckDifferencePct != null) {
    if (
      typeof value.crossCheckDifferencePct !== "number" ||
      !Number.isFinite(value.crossCheckDifferencePct) ||
      value.crossCheckDifferencePct < 0
    ) {
      throw new Error("crossCheckDifferencePct must be finite and non-negative");
    }
    crossCheckDifferencePct = value.crossCheckDifferencePct;
  }

  return {
    instrumentIsin,
    currency,
    venue,
    price: value.price,
    asOf,
    provider,
    providerUrl,
    crossCheckedWith,
    crossCheckDifferencePct,
    fetchedAt,
  };
}

/** Validate the complete envelope before any IndexedDB write. */
export function validateQuoteFeed(
  value: unknown,
  options?: { now?: Date },
): QuoteFeedValidationResult {
  const now = options?.now ?? new Date();
  if (!isRecord(value)) throw new QuoteFeedEnvelopeError("feed must be an object");
  if (value.schemaVersion !== FEED_SCHEMA_VERSION) {
    throw new QuoteFeedEnvelopeError(`schemaVersion must be ${FEED_SCHEMA_VERSION}`);
  }

  let generatedAt: string;
  try {
    generatedAt = parseTimestamp(value.generatedAt, "generatedAt", now.getTime());
  } catch (error) {
    throw new QuoteFeedEnvelopeError(error instanceof Error ? error.message : String(error));
  }
  if (!Array.isArray(value.quotes)) {
    throw new QuoteFeedEnvelopeError("quotes must be an array");
  }

  const seen = new Set<string>();
  for (const rawRow of value.quotes) {
    const key = rowKeyFromUnknown(rawRow);
    if (!key) continue;
    if (seen.has(key)) {
      throw new QuoteFeedEnvelopeError(`duplicate quote key: ${key}`);
    }
    seen.add(key);
  }

  const rows: AutoQuoteInput[] = [];
  const skipped: QuoteFeedRowIssue[] = [];
  value.quotes.forEach((rawRow, index) => {
    try {
      rows.push(validateRow(rawRow, now));
    } catch (error) {
      skipped.push({
        index,
        key: rowKeyFromUnknown(rawRow),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return { generatedAt, rows, skipped };
}

export function defaultQuoteFeedUrl(baseUrl = import.meta.env.BASE_URL): string {
  const base = baseUrl && baseUrl.endsWith("/") ? baseUrl : `${baseUrl || "/"}/`;
  return `${base}data/quotes.json`;
}

function emptyResult(
  status: QuoteFeedIngestStatus,
  url: string,
  error?: string,
): QuoteFeedIngestResult {
  return {
    status,
    url,
    totalRows: 0,
    acceptedRows: 0,
    updated: 0,
    unchanged: 0,
    skipped: [],
    errors: error ? [error] : [],
  };
}

async function fetchFeedJson(
  url: string,
  fetchImpl: QuoteFeedFetch,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`quote feed HTTP ${response.status}`);
    return await response.json();
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

/** Newest session among accepted rows — what the feed can honestly claim. */
function newestSession(rows: AutoQuoteInput[]): string | undefined {
  return rows.reduce<string | undefined>(
    (newest, row) => (newest && newest >= row.asOf ? newest : row.asOf),
    undefined,
  );
}

/** Newest bot fetch among accepted rows, used to report real feed latency. */
function newestFetch(rows: AutoQuoteInput[]): string | undefined {
  return rows.reduce<string | undefined>((newest, row) => {
    if (!row.fetchedAt) return newest;
    if (!newest) return row.fetchedAt;
    return Date.parse(row.fetchedAt) > Date.parse(newest) ? row.fetchedAt : newest;
  }, undefined);
}

async function ingestQuotesFeedInternal(
  options: IngestQuotesFeedOptions,
): Promise<QuoteFeedIngestResult> {
  const url = options.url ?? defaultQuoteFeedUrl();
  const online =
    options.online ?? (typeof navigator === "undefined" ? true : navigator.onLine);
  if (!online) return emptyResult("offline", url);

  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const now = options.now ?? new Date();
  let raw: unknown;
  try {
    raw = await fetchFeedJson(url, fetchImpl, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  } catch (error) {
    return emptyResult("error", url, error instanceof Error ? error.message : String(error));
  }

  let validation: QuoteFeedValidationResult;
  try {
    validation = validateQuoteFeed(raw, { now });
  } catch (error) {
    return emptyResult("error", url, error instanceof Error ? error.message : String(error));
  }

  let updated = 0;
  let unchanged = 0;
  const errors: string[] = [];
  const nowDate = toDateOnly(now);

  for (const row of validation.rows) {
    const currency = String(row.currency || "EUR").toUpperCase();
    const key = `${normalizeIsin(row.instrumentIsin)}|${currency}`;
    try {
      const current: QuoteCandidate | undefined = await db.quoteCandidates.get(
        candidateId(row.instrumentIsin, currency, "auto"),
      );
      const isNoOp = current ? isSameAutoQuoteSemantics(current, row) : false;
      await putAutoCandidateAndResolve(row, { nowDate });
      if (isNoOp) unchanged += 1;
      else updated += 1;
    } catch (error) {
      errors.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    status: errors.length > 0 ? "partial" : "ok",
    url,
    totalRows: validation.rows.length + validation.skipped.length,
    acceptedRows: validation.rows.length,
    updated,
    unchanged,
    skipped: validation.skipped,
    errors,
    feedGeneratedAt: validation.generatedAt,
    newestAsOf: newestSession(validation.rows),
    newestFetchedAt: newestFetch(validation.rows),
  };
}

let activeIngestion: Promise<QuoteFeedIngestResult> | null = null;

/** Startup/manual refresh share one promise so they cannot race. */
export function ingestQuotesFeed(
  options: IngestQuotesFeedOptions = {},
): Promise<QuoteFeedIngestResult> {
  if (activeIngestion) return activeIngestion;
  const run = ingestQuotesFeedInternal(options);
  const tracked = run.finally(() => {
    if (activeIngestion === tracked) activeIngestion = null;
  });
  activeIngestion = tracked;
  return tracked;
}
