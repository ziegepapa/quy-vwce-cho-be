import {
  CASH_FIRST_CONTRIBUTION_TYPES,
  SECURITIES_FIRST_CONTRIBUTION_TYPES,
  heroLifetimeMode,
  type HeroLifetimeMode,
} from "../lib/heroLifetime";
import type { TransactionQualityIssue } from "./transactionQualityInbox";

type YearReviewQualityIssue = Pick<TransactionQualityIssue, "transactionId" | "code" | "date" | "severity">;

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
  contributionMonths: number;
  withdrawnAmount: number;
  /** Null means no same-year plan fact was supplied; it is not inferred. */
  plannedContributionMonths: number | null;
  missingContributionMonths: number | null;
  transactionCount: number;
  fees: number;
  taxes: number;
  qualityIssueCount: number;
  actionIssueCount: number;
  reviewIssueCount: number;
  priceSnapshot: { price: number; asOf: string } | null;
  priceHistoryAvailable: false;
};

/**
 * Lists only past/current review years represented by live local records or the
 * current calendar year. It is a pure display helper and stores no preference.
 */
export function yearInReviewYears(input: {
  today: string;
  transactions: readonly YearReviewTransaction[];
  qualityIssues: readonly YearReviewQualityIssue[];
}): number[] {
  const todayYear = yearOf(input.today) ?? new Date().getFullYear();
  const years = new Set<number>([todayYear]);
  for (const tx of input.transactions ?? []) {
    if (!tx || tx.deletedAt) continue;
    const year = yearOf(tx.date);
    if (year != null && year <= todayYear) years.add(year);
  }
  for (const issue of input.qualityIssues ?? []) {
    const year = yearOf(issue.date);
    if (year != null && year <= todayYear) years.add(year);
  }
  return [...years].sort((left, right) => right - left);
}

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
  qualityIssues: readonly YearReviewQualityIssue[];
  planProgress?: { year: number; plannedMonths: number; missingMonths: number } | null;
  latestPrice: number;
  latestPriceDate: string;
  year?: number;
}): YearInReview {
  const currentYear = yearOf(input.today) ?? new Date().getFullYear();
  const year = Number.isInteger(input.year) && (input.year as number) <= currentYear
    ? input.year as number
    : currentYear;
  const contributionMode = heroLifetimeMode(input.trackInAppCash);
  const countedTypes = contributionMode === "cash_first" ? CASH_FIRST_CONTRIBUTION_TYPES : SECURITIES_FIRST_CONTRIBUTION_TYPES;
  let contributionAmount = 0;
  const contributionMonths = new Set<string>();
  let withdrawnAmount = 0;
  let transactionCount = 0;
  let fees = 0;
  let taxes = 0;

  for (const tx of input.transactions ?? []) {
    if (!tx || tx.deletedAt || yearOf(tx.date) !== year) continue;
    transactionCount += 1;
    fees += positiveFinite(tx.fee);
    taxes += positiveFinite(tx.tax);
    if (countedTypes.includes(tx.type)) {
      contributionAmount += positiveFinite(tx.amount);
      if (positiveFinite(tx.amount) > 0) contributionMonths.add(tx.date.slice(0, 7));
    }
    if (tx.type === "cash_out") withdrawnAmount += positiveFinite(tx.amount);
  }

  const planProgress = input.planProgress?.year === year ? input.planProgress : null;
  const issues = (input.qualityIssues ?? []).filter((issue) => yearOf(issue.date) === year);
  const price = positiveFinite(input.latestPrice);
  const priceSnapshot = price > 0 && yearOf(input.latestPriceDate) === year
    ? { price, asOf: input.latestPriceDate }
    : null;

  return {
    year,
    contributionMode,
      contributionAmount,
      contributionMonths: contributionMonths.size,
      withdrawnAmount,
      plannedContributionMonths: planProgress?.plannedMonths ?? null,
      missingContributionMonths: planProgress?.missingMonths ?? null,
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
