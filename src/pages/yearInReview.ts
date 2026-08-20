import {
  CASH_FIRST_CONTRIBUTION_TYPES,
  SECURITIES_FIRST_CONTRIBUTION_TYPES,
  heroLifetimeMode,
  type HeroLifetimeMode,
} from "../lib/heroLifetime";
import type { TransactionQualityIssue } from "./transactionQualityInbox";

export type YearReviewTransaction = {
  date: string;
  type: string;
  amount: number;
  fee?: number;
  tax?: number;
  deletedAt?: string | null;
};

export type YearInReview = {
  year: number;
  contributionMode: HeroLifetimeMode;
  contributionAmount: number;
  transactionCount: number;
  fees: number;
  taxes: number;
  qualityIssueCount: number;
  actionIssueCount: number;
  reviewIssueCount: number;
  priceSnapshot: { price: number; asOf: string } | null;
  priceHistoryAvailable: false;
};

function yearOf(value: string): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value);
  return match ? Number(match[1]) : null;
}

function positiveFinite(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Read-only year summary. The current data model stores an effective quote
 * snapshot, not a historical price series; therefore priceHistoryAvailable is
 * intentionally always false and no price change is inferred from one quote.
 */
export function buildYearInReview(input: {
  today: string;
  trackInAppCash: boolean | null | undefined;
  transactions: readonly YearReviewTransaction[];
  qualityIssues: readonly TransactionQualityIssue[];
  latestPrice: number;
  latestPriceDate: string;
}): YearInReview {
  const year = yearOf(input.today) ?? new Date().getFullYear();
  const contributionMode = heroLifetimeMode(input.trackInAppCash);
  const countedTypes = contributionMode === "cash_first" ? CASH_FIRST_CONTRIBUTION_TYPES : SECURITIES_FIRST_CONTRIBUTION_TYPES;
  let contributionAmount = 0;
  let transactionCount = 0;
  let fees = 0;
  let taxes = 0;

  for (const tx of input.transactions ?? []) {
    if (!tx || tx.deletedAt || yearOf(tx.date) !== year) continue;
    transactionCount += 1;
    fees += positiveFinite(tx.fee);
    taxes += positiveFinite(tx.tax);
    if (countedTypes.includes(tx.type)) contributionAmount += positiveFinite(tx.amount);
  }

  const issues = (input.qualityIssues ?? []).filter((issue) => yearOf(issue.date) === year);
  const price = positiveFinite(input.latestPrice);
  const priceSnapshot = price > 0 && yearOf(input.latestPriceDate) != null
    ? { price, asOf: input.latestPriceDate }
    : null;

  return {
    year,
    contributionMode,
    contributionAmount,
    transactionCount,
    fees,
    taxes,
    qualityIssueCount: issues.length,
    actionIssueCount: issues.filter((issue) => issue.severity === "action").length,
    reviewIssueCount: issues.filter((issue) => issue.severity === "review").length,
    priceSnapshot,
    priceHistoryAvailable: false,
  };
}
