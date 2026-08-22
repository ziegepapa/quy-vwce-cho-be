import type { TransactionQualityIssue } from "./transactionQualityInbox";

export type PortfolioDataHealthCode =
  | "transaction_quality"
  | "missing_quotes"
  | "stale_quotes"
  | "backup_not_recorded";

export type PortfolioDataHealthSource =
  | "transaction_ledger"
  | "quote_snapshot"
  | "backup_metadata";

export type PortfolioDataHealthSeverity = "action" | "review" | "tip";

/** Deep-link into the Transactions quality lens; never mutates ledger data. */
export const TRANSACTIONS_QUALITY_REVIEW_HREF = "#/transactions?quality=needs_review" as const;

export type PortfolioDataHealthIssue = {
  code: PortfolioDataHealthCode;
  source: PortfolioDataHealthSource;
  severity: PortfolioDataHealthSeverity;
  count: number;
  href: typeof TRANSACTIONS_QUALITY_REVIEW_HREF | "#/settings";
};

export type PortfolioDataHealth = {
  issues: PortfolioDataHealthIssue[];
  actionCount: number;
  reviewCount: number;
  tipCount: number;
  missingNotesOnly: boolean;
  missingNoteCount: number;
};

const severityRank: Record<PortfolioDataHealthSeverity, number> = {
  action: 0,
  review: 1,
  tip: 2,
};

function countBySeverity(
  transactionIssues: readonly TransactionQualityIssue[],
  severity: TransactionQualityIssue["severity"],
): number {
  return transactionIssues.filter((issue) => issue.severity === severity).length;
}

/**
 * Local factual health summary. Groups existing signals for display; never scores,
 * mutates sync, imports, or repairs records.
 */
export function buildPortfolioDataHealth(input: {
  transactionIssues: readonly TransactionQualityIssue[];
  missingQuoteIsins: readonly string[];
  staleQuoteIsins: readonly string[];
  lastBackupAt: string | null;
}): PortfolioDataHealth {
  const issues: PortfolioDataHealthIssue[] = [];
  const transactionIssues = input.transactionIssues ?? [];
  const actionTransactions = countBySeverity(transactionIssues, "action");
  const reviewTransactions = countBySeverity(transactionIssues, "review");
  const tipTransactions = countBySeverity(transactionIssues, "tip");
  const missingNoteCount = transactionIssues.filter((i) => i.code === "missing_note").length;

  if (actionTransactions > 0) {
    issues.push({
      code: "transaction_quality",
      source: "transaction_ledger",
      severity: "action",
      count: actionTransactions,
      href: TRANSACTIONS_QUALITY_REVIEW_HREF,
    });
  } else if (reviewTransactions > 0) {
    issues.push({
      code: "transaction_quality",
      source: "transaction_ledger",
      severity: "review",
      count: reviewTransactions,
      href: TRANSACTIONS_QUALITY_REVIEW_HREF,
    });
  } else if (tipTransactions > 0) {
    issues.push({
      code: "transaction_quality",
      source: "transaction_ledger",
      severity: "tip",
      count: tipTransactions,
      href: TRANSACTIONS_QUALITY_REVIEW_HREF,
    });
  }

  const missingQuoteIsins = new Set(input.missingQuoteIsins.filter(Boolean));
  if (missingQuoteIsins.size > 0) {
    issues.push({
      code: "missing_quotes",
      source: "quote_snapshot",
      severity: "review",
      count: missingQuoteIsins.size,
      href: "#/settings",
    });
  }

  const staleQuoteIsins = new Set(input.staleQuoteIsins.filter(Boolean));
  if (staleQuoteIsins.size > 0) {
    issues.push({
      code: "stale_quotes",
      source: "quote_snapshot",
      severity: "tip",
      count: staleQuoteIsins.size,
      href: "#/settings",
    });
  }

  if (input.lastBackupAt === "") {
    issues.push({
      code: "backup_not_recorded",
      source: "backup_metadata",
      severity: "review",
      count: 1,
      href: "#/settings",
    });
  }

  const ordered = issues.sort((left, right) => {
    const severity = severityRank[left.severity] - severityRank[right.severity];
    if (severity !== 0) return severity;
    const source = left.source.localeCompare(right.source);
    if (source !== 0) return source;
    return left.code.localeCompare(right.code);
  });

  const onlyLedger =
    ordered.length > 0 && ordered.every((issue) => issue.source === "transaction_ledger");
  const missingNotesOnly =
    onlyLedger &&
    missingNoteCount > 0 &&
    transactionIssues.length > 0 &&
    transactionIssues.every((issue) => issue.code === "missing_note");

  return {
    issues: ordered,
    actionCount: ordered.filter((i) => i.severity === "action").reduce((s, i) => s + i.count, 0),
    reviewCount: ordered.filter((i) => i.severity === "review").reduce((s, i) => s + i.count, 0),
    tipCount: ordered.filter((i) => i.severity === "tip").reduce((s, i) => s + i.count, 0),
    missingNotesOnly,
    missingNoteCount,
  };
}
