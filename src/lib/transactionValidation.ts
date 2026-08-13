import type { Transaction } from "./types";

const OPTIONAL_NUMERIC_FIELDS = [
  "unitPrice",
  "quantity",
  "fee",
  "tax",
  "sourceVersion",
  "version",
] as const;

export type TransactionNumberValidation =
  | { ok: true }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

  if (typeof value.quantity === "number" && value.quantity < 0) {
    return { ok: false, error: "quantity không được âm" };
  }

  return { ok: true };
}

export function assertValidTransactionNumbers(transaction: Transaction): void {
  const validation = validateTransactionNumbers(transaction);
  if (!validation.ok) {
    throw new Error(`Giao dịch không hợp lệ: ${validation.error}`);
  }
}
