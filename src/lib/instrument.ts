/**
 * Multi-asset pure helpers — ISIN normalization, checksum, legacy resolve, quote id.
 * No I/O.
 */
import { VWCE_ISIN } from "./types";
import type { QuoteSourceKind, TxType } from "./types";

/** Normalize ISIN: trim + uppercase. Empty → "". */
export function normalizeIsin(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toUpperCase();
}

/** Basic ISIN shape check (12 alnum). Does not checksum. */
export function isValidIsinShape(isin: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(normalizeIsin(isin));
}

/**
 * ISO 6166 mod-10 checksum (letters A=10 … Z=35).
 * Returns false for empty/malformed input.
 */
export function isValidIsinChecksum(raw: string): boolean {
  const isin = normalizeIsin(raw);
  if (!isValidIsinShape(isin)) return false;
  let digits = "";
  for (const ch of isin.slice(0, 11)) {
    if (ch >= "0" && ch <= "9") digits += ch;
    else digits += String(ch.charCodeAt(0) - 55); // A=10
  }
  // Double every other digit from the right
  let sum = 0;
  let alt = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(isin[11]);
}

/** Shape + checksum. Use for new instruments / user input. */
export function isValidIsin(raw: string): boolean {
  return isValidIsinChecksum(raw);
}

export function isSecurityBuy(type: string): boolean {
  return type === "buy_vwce" || type === "buy_security";
}

export function isSecuritySell(type: string): boolean {
  return type === "sell_vwce" || type === "sell_security";
}

export function isSecurityTx(type: string): boolean {
  return isSecurityBuy(type) || isSecuritySell(type);
}

/**
 * Resolve instrument ISIN for a transaction.
 * - Explicit instrumentIsin wins (normalized).
 * - Legacy buy_vwce/sell_vwce without ISIN → VWCE.
 * - buy_security/sell_security without ISIN → "".
 */
export function resolveInstrumentIsin(tx: {
  type: string;
  instrumentIsin?: string;
}): string {
  const explicit = normalizeIsin(tx.instrumentIsin);
  if (explicit) return explicit;
  if (tx.type === "buy_vwce" || tx.type === "sell_vwce") return VWCE_ISIN;
  return "";
}

/**
 * True when a security tx has a usable ISIN (legacy VWCE default or explicit).
 * buy_security/sell_security with empty ISIN → false.
 */
export function hasResolvableInstrumentIsin(tx: {
  type: string;
  instrumentIsin?: string;
}): boolean {
  if (!isSecurityTx(tx.type)) return true;
  return resolveInstrumentIsin(tx).length > 0;
}

/** Effective quote primary key: quote_<ISIN>_<currency>. */
export function quoteId(instrumentIsin: string, currency = "EUR"): string {
  return `quote_${normalizeIsin(instrumentIsin)}_${String(currency || "EUR").toUpperCase()}`;
}

/** Candidate primary key: qc_<ISIN>_<CCY>_<manual|auto>. */
export function candidateId(
  instrumentIsin: string,
  currency: string,
  source: QuoteSourceKind,
): string {
  return `qc_${normalizeIsin(instrumentIsin)}_${String(currency || "EUR").toUpperCase()}_${source}`;
}

/** Preference primary key: pref_<ISIN>_<CCY>. */
export function preferenceId(instrumentIsin: string, currency = "EUR"): string {
  return `pref_${normalizeIsin(instrumentIsin)}_${String(currency || "EUR").toUpperCase()}`;
}

export function mapLegacyTxTypeToGeneric(type: TxType): TxType {
  if (type === "buy_vwce") return "buy_security";
  if (type === "sell_vwce") return "sell_security";
  return type;
}

/** YYYY-MM-DD calendar date (no time). */
export function isValidAsOfDate(raw: string | null | undefined): boolean {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Local calendar YYYY-MM-DD from a Date (default: now). */
export function toDateOnly(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Calendar-day difference nowDate - asOf (both YYYY-MM-DD). */
export function calendarDaysBetween(asOf: string, nowDate: string): number {
  const [y1, m1, d1] = asOf.split("-").map(Number);
  const [y2, m2, d2] = nowDate.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86_400_000);
}
