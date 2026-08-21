import type { Transaction, TxType } from "./types";
import {
  isSecurityBuy,
  isSecuritySell,
  isValidAsOfDate,
  isValidIsin,
  normalizeIsin,
  resolveInstrumentIsin,
} from "./instrument";

const OPTIONAL_NUMERIC_FIELDS = [
  "unitPrice",
  "quantity",
  "fee",
  "tax",
  "sourceVersion",
  "version",
] as const;

const TRANSACTION_TYPES = new Set<TxType>([
  "buy_vwce",
  "sell_vwce",
  "buy_security",
  "sell_security",
  "cash_in",
  "cash_out",
  "tax",
  "fee",
  "safe_interest",
  "adjust",
]);

export type TransactionNumberValidation =
  | { ok: true }
  | { ok: false; error: string };

export type TransactionSemanticStatus = "accepted" | "incomplete" | "invalid";

export type TransactionSemanticReason =
  | "INVALID_RECORD"
  | "INVALID_TYPE"
  | "INVALID_DATE"
  | "INVALID_AMOUNT"
  | "INVALID_FEE"
  | "INVALID_TAX"
  | "INVALID_QUANTITY"
  | "ZERO_QUANTITY"
  | "INVALID_UNIT_PRICE"
  | "INVALID_ISIN"
  | "INVALID_ECONOMICS"
  | "MISSING_BUY_QUANTITY_EVIDENCE"
  | "MISSING_SALE_QUANTITY"
  | "MISSING_ADJUSTMENT_NOTE"
  | "OVERSOLD";

export type QuantityOrigin = "explicit" | "derived" | "not_applicable";

export type CanonicalTransaction = {
  type: TxType;
  date: string;
  amount: number;
  unitPrice?: number;
  quantity?: number;
  fee?: number;
  tax?: number;
  instrumentIsin?: string;
  notes?: string;
};

export type TransactionSemanticResult =
  | {
      status: "accepted";
      reasonCode: null;
      normalized: CanonicalTransaction;
      quantityOrigin: QuantityOrigin;
    }
  | {
      status: "incomplete" | "invalid";
      reasonCode: TransactionSemanticReason;
      normalized: null;
      quantityOrigin: QuantityOrigin;
    };

export class TransactionSemanticError extends Error {
  readonly result: Exclude<TransactionSemanticResult, { status: "accepted" }>;

  constructor(result: Exclude<TransactionSemanticResult, { status: "accepted" }>) {
    super(`Transaction ${result.status.toUpperCase()}: ${result.reasonCode}`);
    this.name = "TransactionSemanticError";
    this.result = result;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function invalid(
  reasonCode: TransactionSemanticReason,
  quantityOrigin: QuantityOrigin = "not_applicable",
): Exclude<TransactionSemanticResult, { status: "accepted" }> {
  return { status: "invalid", reasonCode, normalized: null, quantityOrigin };
}

function incomplete(
  reasonCode: TransactionSemanticReason,
  quantityOrigin: QuantityOrigin = "not_applicable",
): Exclude<TransactionSemanticResult, { status: "accepted" }> {
  return { status: "incomplete", reasonCode, normalized: null, quantityOrigin };
}

function accepted(
  normalized: CanonicalTransaction,
  quantityOrigin: QuantityOrigin,
): TransactionSemanticResult {
  return { status: "accepted", reasonCode: null, normalized, quantityOrigin };
}

function finiteOptional(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  return isFiniteNumber(value) ? value : null;
}

function canonicalBase(value: Record<string, unknown>): CanonicalTransaction | null {
  if (typeof value.type !== "string" || !TRANSACTION_TYPES.has(value.type as TxType)) return null;
  if (typeof value.date !== "string" || !isValidAsOfDate(value.date)) return null;
  if (!isFiniteNumber(value.amount)) return null;

  const unitPrice = finiteOptional(value.unitPrice);
  const quantity = finiteOptional(value.quantity);
  const fee = finiteOptional(value.fee);
  const tax = finiteOptional(value.tax);
  if (unitPrice === null || quantity === null || fee === null || tax === null) return null;

  return {
    type: value.type as TxType,
    date: value.date,
    amount: value.amount,
    ...(unitPrice === undefined ? {} : { unitPrice }),
    ...(quantity === undefined ? {} : { quantity }),
    ...(fee === undefined ? {} : { fee }),
    ...(tax === undefined ? {} : { tax }),
    ...(typeof value.instrumentIsin === "string" ? { instrumentIsin: value.instrumentIsin } : {}),
    ...(typeof value.notes === "string" ? { notes: value.notes } : {}),
  };
}

/**
 * Retains the old physical-store safety contract: malformed numeric values and
 * negative quantities are rejected before Dexie can persist them. H2-B adds
 * richer semantic classification below without using this numeric helper as a
 * substitute for financial validation.
 */
export function validateTransactionNumbers(value: unknown): TransactionNumberValidation {
  if (!isRecord(value)) {
    return { ok: false, error: "giao dịch phải là object" };
  }

  if (typeof value.amount !== "number" || !Number.isFinite(value.amount)) {
    return { ok: false, error: "amount phải là số hữu hạn" };
  }

  for (const field of OPTIONAL_NUMERIC_FIELDS) {
    const numericValue = value[field];
    if (
      numericValue !== undefined &&
      (typeof numericValue !== "number" || !Number.isFinite(numericValue))
    ) {
      return { ok: false, error: `${field} phải là số hữu hạn` };
    }
  }

  // Sign is an H2-B semantic decision, not a structural numeric condition.
  // Keeping finite legacy values here lets backup/sync preserve raw evidence;
  // public new ingestion and canonical replay use classifyTransaction instead.
  return { ok: true };
}

/**
 * Pure canonical semantic classifier. It never writes, repairs or deletes raw
 * evidence. The replay layer can apply its result to legacy rows; the new
 * ingestion boundary uses `assertAcceptedTransactionForNewIngestion`.
 */
export function classifyTransaction(value: unknown): TransactionSemanticResult {
  if (!isRecord(value)) return invalid("INVALID_RECORD");
  if (typeof value.type !== "string" || !TRANSACTION_TYPES.has(value.type as TxType)) {
    return invalid("INVALID_TYPE");
  }
  if (typeof value.date !== "string" || !isValidAsOfDate(value.date)) {
    return invalid("INVALID_DATE");
  }
  if (!isFiniteNumber(value.amount)) return invalid("INVALID_AMOUNT");

  const unitPrice = finiteOptional(value.unitPrice);
  if (unitPrice === null || (unitPrice !== undefined && unitPrice <= 0)) {
    return invalid("INVALID_UNIT_PRICE");
  }
  const quantity = finiteOptional(value.quantity);
  if (quantity === null || (quantity !== undefined && quantity < 0)) {
    return invalid("INVALID_QUANTITY");
  }
  const fee = finiteOptional(value.fee);
  if (fee === null || (fee !== undefined && fee < 0)) return invalid("INVALID_FEE");
  const tax = finiteOptional(value.tax);
  if (tax === null || (tax !== undefined && tax < 0)) return invalid("INVALID_TAX");

  const base = canonicalBase(value);
  if (!base) return invalid("INVALID_RECORD");
  const type = base.type;
  const isBuy = isSecurityBuy(type);
  const isSell = isSecuritySell(type);

  if (isBuy || isSell) {
    const isin = normalizeIsin(resolveInstrumentIsin(base));
    if (!isin || !isValidIsin(isin)) return invalid("INVALID_ISIN");
    if (base.amount <= 0) return invalid("INVALID_AMOUNT");
    const totalCharges = (base.fee ?? 0) + (base.tax ?? 0);
    if (totalCharges > base.amount) return invalid("INVALID_ECONOMICS");

    if (isSell) {
      if (base.quantity === undefined) return incomplete("MISSING_SALE_QUANTITY");
      if (base.quantity === 0) return invalid("ZERO_QUANTITY", "explicit");
      return accepted({ ...base, instrumentIsin: isin }, "explicit");
    }

    if (base.quantity !== undefined) {
      if (base.quantity === 0) return invalid("ZERO_QUANTITY", "explicit");
      return accepted({ ...base, instrumentIsin: isin }, "explicit");
    }
    if (base.unitPrice === undefined) {
      return incomplete("MISSING_BUY_QUANTITY_EVIDENCE");
    }
    const derivedQuantity = (base.amount - totalCharges) / base.unitPrice;
    if (!Number.isFinite(derivedQuantity) || derivedQuantity <= 0) {
      return incomplete("MISSING_BUY_QUANTITY_EVIDENCE", "derived");
    }
    return accepted(
      { ...base, instrumentIsin: isin, quantity: derivedQuantity },
      "derived",
    );
  }

  if (type === "adjust") {
    if (!base.notes?.trim()) return invalid("MISSING_ADJUSTMENT_NOTE");
    return accepted(base, "not_applicable");
  }

  if (base.amount <= 0) return invalid("INVALID_AMOUNT");
  return accepted(base, "not_applicable");
}

/** State-dependent financial rule used by canonical replay and new writes. */
export function classifyTransactionAgainstHoldings(
  value: unknown,
  heldQuantity: number | undefined,
): TransactionSemanticResult {
  const result = classifyTransaction(value);
  if (result.status !== "accepted" || !isSecuritySell(result.normalized.type)) return result;
  const available = typeof heldQuantity === "number" && Number.isFinite(heldQuantity)
    ? Math.max(0, heldQuantity)
    : 0;
  if ((result.normalized.quantity ?? 0) > available) {
    return invalid("OVERSOLD", result.quantityOrigin);
  }
  return result;
}

/** Strict gate for manual/import edits; legacy raw evidence is not rewritten here. */
export function assertAcceptedTransactionForNewIngestion(transaction: Transaction): CanonicalTransaction {
  const result = classifyTransaction(transaction);
  if (result.status !== "accepted") throw new TransactionSemanticError(result);
  return result.normalized;
}

/** Stable, deterministic replay ordering: date → createdAt → id. */
export function compareTransactionReplayOrder(
  left: Pick<Transaction, "date" | "createdAt" | "id">,
  right: Pick<Transaction, "date" | "createdAt" | "id">,
): number {
  const date = left.date.localeCompare(right.date);
  if (date !== 0) return date;
  const createdAt = left.createdAt.localeCompare(right.createdAt);
  if (createdAt !== 0) return createdAt;
  return left.id.localeCompare(right.id);
}

export function assertValidTransactionNumbers(transaction: Transaction): void {
  const validation = validateTransactionNumbers(transaction);
  if (!validation.ok) {
    throw new Error(`Giao dịch không hợp lệ: ${validation.error}`);
  }
}
