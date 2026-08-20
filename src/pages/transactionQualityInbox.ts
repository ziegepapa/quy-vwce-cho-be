import type { Transaction } from "../lib/types";
import { isSecurityTx, isValidIsin, resolveInstrumentIsin } from "../lib/instrument";

export type TransactionQualityCode =
  | "missing_isin"
  | "invalid_isin"
  | "invalid_amount"
  | "missing_quantity"
  | "missing_unit_price"
  | "missing_note";

export type TransactionQualitySeverity = "action" | "review" | "tip";

export type TransactionQualityIssue = {
  transactionId: string;
  code: TransactionQualityCode;
  severity: TransactionQualitySeverity;
  date: string;
};

const severityRank: Record<TransactionQualitySeverity, number> = {
  action: 0,
  review: 1,
  tip: 2,
};

function positive(value: number | undefined) {
  return Number.isFinite(value) && (value ?? 0) > 0;
}

/**
 * Display-only quality audit. The inbox names incomplete data but never mutates
 * the ledger or changes analytics. A security quantity can be inferred from a
 * valid unit price and amount, matching the existing analytics contract.
 */
export function findTransactionQualityIssues(
  transactions: readonly Transaction[],
): TransactionQualityIssue[] {
  const issues: TransactionQualityIssue[] = [];

  for (const tx of transactions) {
    if (tx.deletedAt) continue;

    if (!positive(tx.amount)) {
      issues.push({ transactionId: tx.id, code: "invalid_amount", severity: "action", date: tx.date });
    }

    if (isSecurityTx(tx.type)) {
      const resolvedIsin = resolveInstrumentIsin(tx);
      if (!resolvedIsin) {
        issues.push({ transactionId: tx.id, code: "missing_isin", severity: "action", date: tx.date });
      } else if (!isValidIsin(resolvedIsin)) {
        issues.push({ transactionId: tx.id, code: "invalid_isin", severity: "action", date: tx.date });
      } else {
        const quantityPresent = positive(tx.quantity);
        const unitPricePresent = positive(tx.unitPrice);
        if (!quantityPresent && !unitPricePresent) {
          issues.push({ transactionId: tx.id, code: "missing_quantity", severity: "action", date: tx.date });
        } else if (quantityPresent && !unitPricePresent) {
          issues.push({ transactionId: tx.id, code: "missing_unit_price", severity: "review", date: tx.date });
        }
      }
    }

    if (!tx.notes.trim()) {
      issues.push({ transactionId: tx.id, code: "missing_note", severity: "tip", date: tx.date });
    }
  }

  return issues.sort((a, b) => {
    const severity = severityRank[a.severity] - severityRank[b.severity];
    if (severity !== 0) return severity;
    const date = b.date.localeCompare(a.date);
    if (date !== 0) return date;
    return a.transactionId.localeCompare(b.transactionId);
  });
}
