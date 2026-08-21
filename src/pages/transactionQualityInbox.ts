import { applyTransaction, emptyPortfolio } from "../lib/calc";
import { isSecurityBuy, isSecuritySell, resolveInstrumentIsin } from "../lib/instrument";
import {
  classifyTransaction,
  classifyTransactionAgainstHoldings,
  compareTransactionReplayOrder,
  type TransactionSemanticReason,
  type TransactionSemanticStatus,
} from "../lib/transactionValidation";
import type { Transaction } from "../lib/types";

/** Existing completeness labels plus canonical H2-B semantic reason codes. */
export type TransactionQualityCode =
  | "missing_isin"
  | "invalid_isin"
  | "invalid_amount"
  | "missing_quantity"
  | "missing_unit_price"
  | "missing_note"
  | Exclude<TransactionSemanticReason, "INVALID_ISIN" | "INVALID_AMOUNT" | "MISSING_BUY_QUANTITY_EVIDENCE">;

export type TransactionQualitySeverity = "action" | "review" | "tip";
export type TransactionQualitySource = "canonical_replay" | "completeness";
export type TransactionRecordSource = "manual" | "trade_republic_pdf" | "legacy_or_unknown";

export type TransactionQualityIssue = {
  transactionId: string;
  code: TransactionQualityCode;
  severity: TransactionQualitySeverity;
  /** The read-only fact layer that found the issue, never a mutation workflow. */
  source: TransactionQualitySource;
  /** Persisted importer source where available; absent provenance remains explicit. */
  recordSource: TransactionRecordSource;
  /** Present for H2-B semantic evidence; absent for optional completeness tips. */
  semanticStatus?: Exclude<TransactionSemanticStatus, "accepted">;
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

function recordSource(tx: Transaction): TransactionRecordSource {
  if (tx.source === "manual" || tx.source === "trade_republic_pdf") return tx.source;
  return "legacy_or_unknown";
}

function semanticCode(tx: Transaction, reason: TransactionSemanticReason): TransactionQualityCode {
  if (reason === "INVALID_ISIN") {
    return resolveInstrumentIsin(tx) ? "invalid_isin" : "missing_isin";
  }
  if (reason === "INVALID_AMOUNT") return "invalid_amount";
  if (reason === "MISSING_BUY_QUANTITY_EVIDENCE") return "missing_quantity";
  return reason;
}

function pushSemanticIssue(
  issues: TransactionQualityIssue[],
  tx: Transaction,
  status: Exclude<TransactionSemanticStatus, "accepted">,
  reason: TransactionSemanticReason,
): void {
  issues.push({
    transactionId: tx.id,
    code: semanticCode(tx, reason),
    severity: "action",
    source: "canonical_replay",
    recordSource: recordSource(tx),
    semanticStatus: status,
    date: tx.date,
  });
}

/**
 * Deterministic, display-only portfolio health audit. It replays only accepted
 * rows using the same H2-B ordering and holdings rule as the financial ledger.
 * Unsafe legacy evidence is named with source/reason/severity but is neither
 * repaired nor applied to the portfolio state.
 */
export function findTransactionQualityIssues(
  transactions: readonly Transaction[],
): TransactionQualityIssue[] {
  const issues: TransactionQualityIssue[] = [];
  const ordered = transactions
    .filter((tx) => !tx.deletedAt)
    .slice()
    .sort(compareTransactionReplayOrder);
  let portfolio = emptyPortfolio();

  for (const tx of ordered) {
    const initial = classifyTransaction(tx);
    let semantic = initial;
    if (initial.status === "accepted" && isSecuritySell(initial.normalized.type)) {
      const isin = initial.normalized.instrumentIsin!;
      semantic = classifyTransactionAgainstHoldings(tx, portfolio.positions[isin]?.qty);
    }

    if (semantic.status !== "accepted") {
      pushSemanticIssue(issues, tx, semantic.status, semantic.reasonCode);
      continue;
    }

    // Only canonical accepted evidence reaches the derived health/replay state.
    portfolio = applyTransaction(portfolio, tx);

    if (isSecurityBuy(tx.type) && positive(tx.quantity) && !positive(tx.unitPrice)) {
      issues.push({
        transactionId: tx.id,
        code: "missing_unit_price",
        severity: "review",
        source: "completeness",
        recordSource: recordSource(tx),
        date: tx.date,
      });
    }
    if (!tx.notes.trim()) {
      issues.push({
        transactionId: tx.id,
        code: "missing_note",
        severity: "tip",
        source: "completeness",
        recordSource: recordSource(tx),
        date: tx.date,
      });
    }
  }

  return issues.sort((a, b) => {
    const severity = severityRank[a.severity] - severityRank[b.severity];
    if (severity !== 0) return severity;
    const date = b.date.localeCompare(a.date);
    if (date !== 0) return date;
    const transaction = a.transactionId.localeCompare(b.transactionId);
    if (transaction !== 0) return transaction;
    return a.code.localeCompare(b.code);
  });
}
