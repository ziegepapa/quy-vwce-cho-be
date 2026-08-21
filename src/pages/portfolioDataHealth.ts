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

export type PortfolioDataHealthIssue = {
  code: PortfolioDataHealthCode;
  source: PortfolioDataHealthSource;
  severity: PortfolioDataHealthSeverity;
  count: number;
  /** Route to the existing owner-controlled review surface; never an auto-fix. */
  href: "#/transactions" | "#/settings";
};

export type PortfolioDataHealth = {
  issues: PortfolioDataHealthIssue[];
  actionCount: number;
  reviewCount: number;
  tipCount: number;
};

const severityRank: Record<PortfolioDataHealthSeverity, number> = {
  action: 0,
  review: 1,
  tip: 2,
};

function countBySeverity(
  transactionIssues: readonly TransactionQualityIssue[],
  severity: TransactionQualitySeverity,
): number {
  return transactionIssues.filter((issue) => issue.severity === severity).length;
}

type TransactionQualitySeverity = TransactionQualityIssue["severity"];

/**
 * Local factual health summary. The model groups existing signals for display but
 * never computes a score, changes sync state, imports data or repairs records.
 * `lastBackupAt: null` means metadata was unavailable and deliberately produces
 * no claim; an empty string is a recorded fact that no backup export exists yet.
 */
export function buildPortfolioDataHealth(input: {
  transactionIssues: readonly TransactionQualityIssue[];
  missingQuoteIsins: readonly string[];
  staleQuoteIsins: readonly string[];
  lastBackupAt: string | null;
}): PortfolioDataHealth {
  const issues: PortfolioDataHealthIssue[] = [];
  const actionTransactions = countBySeverity(input.transactionIssues, "action");
  const reviewTransactions = countBySeverity(input.transactionIssues, "review");
  const tipTransactions = countBySeverity(input.transactionIssues, "tip");

  if (actionTransactions > 0) {
    issues.push({ code: "transaction_quality", source: "transaction_ledger", severity: "action", count: actionTransactions, href: "#/transactions" });
  } else if (reviewTransactions > 0) {
    issues.push({ code: "transaction_quality", source: "transaction_ledger", severity: "review", count: reviewTransactions, href: "#/transactions" });
  } else if (tipTransactions > 0) {
    issues.push({ code: "transaction_quality", source: "transaction_ledger", severity: "tip", count: tipTransactions, href: "#/transactions" });
  }

  const missingQuoteIsins = new Set(input.missingQuoteIsins.filter(Boolean));
  if (missingQuoteIsins.size > 0) {
    issues.push({ code: "missing_quotes", source: "quote_snapshot", severity: "review", count: missingQuoteIsins.size, href: "#/settings" });
  }

  const staleQuoteIsins = new Set(input.staleQuoteIsins.filter(Boolean));
  if (staleQuoteIsins.size > 0) {
    issues.push({ code: "stale_quotes", source: "quote_snapshot", severity: "tip", count: staleQuoteIsins.size, href: "#/settings" });
  }

  if (input.lastBackupAt === "") {
    issues.push({ code: "backup_not_recorded", source: "backup_metadata", severity: "review", count: 1, href: "#/settings" });
  }

  const ordered = issues.sort((left, right) => {
    const severity = severityRank[left.severity] - severityRank[right.severity];
    if (severity !== 0) return severity;
    const source = left.source.localeCompare(right.source);
    if (source !== 0) return source;
    return left.code.localeCompare(right.code);
  });

  return {
    issues: ordered,
    actionCount: ordered.filter((issue) => issue.severity === "action").reduce((sum, issue) => sum + issue.count, 0),
    reviewCount: ordered.filter((issue) => issue.severity === "review").reduce((sum, issue) => sum + issue.count, 0),
    tipCount: ordered.filter((issue) => issue.severity === "tip").reduce((sum, issue) => sum + issue.count, 0),
  };
}
