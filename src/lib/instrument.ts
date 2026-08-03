/**
 * Multi-asset pure helpers — ISIN normalization, legacy resolve, quote id.
 * No I/O.
 */
import { VWCE_ISIN } from "./types";
import type { TxType } from "./types";

/** Normalize ISIN: trim + uppercase. Empty → "". */
export function normalizeIsin(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toUpperCase();
}

/** Basic ISIN shape check (12 alnum). Does not checksum. */
export function isValidIsinShape(isin: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(normalizeIsin(isin));
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

/** Deterministic quote primary key: quote_<ISIN>_<currency>. */
export function quoteId(instrumentIsin: string, currency = "EUR"): string {
  return `quote_${normalizeIsin(instrumentIsin)}_${currency}`;
}

export function mapLegacyTxTypeToGeneric(type: TxType): TxType {
  if (type === "buy_vwce") return "buy_security";
  if (type === "sell_vwce") return "sell_security";
  return type;
}
