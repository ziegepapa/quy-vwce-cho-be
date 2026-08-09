import type { Transaction } from "./types";

/** Transaction types that count as a contribution to the fund. */
const CONTRIBUTION_TYPES = new Set<Transaction["type"]>([
  "cash_in",
  "buy_vwce",
  "buy_security",
]);

/** Extract YYYY-MM from an ISO date string (first 7 chars). */
function toYearMonth(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/**
 * Decrement a YYYY-MM string by one calendar month.
 * e.g. "2026-03" → "2026-02", "2026-01" → "2025-12".
 */
function prevMonth(ym: string): string {
  const year = parseInt(ym.slice(0, 4), 10);
  const month = parseInt(ym.slice(5, 7), 10); // 1-based
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

export type ContributionStreakResult = {
  /**
   * Number of consecutive calendar months (ending with mostRecentMonth),
   * each containing ≥1 active eligible transaction.
   * 0 when the ledger has no eligible contributions.
   */
  streakMonths: number;
  /** YYYY-MM of the most recent contributing month, or null if none. */
  mostRecentMonth: string | null;
  /** ISO date string of the most recent eligible transaction, or null if none. */
  lastContributionDate: string | null;
};

/**
 * Compute the contribution streak from a transaction ledger.
 *
 * ## Streak formula (OVERVIEW-RHYTHM-001 r1)
 *
 * **Granularity:** calendar month (YYYY-MM).
 *
 * **Eligible types:** cash_in | buy_vwce | buy_security.
 * buy_vwce and buy_security are included so securities-first users
 * (who fund the ETF directly without a prior cash_in in the app)
 * still accumulate a meaningful streak.
 *
 * **streak = number of consecutive calendar months, ending with the most
 * recent contributing month, each containing ≥1 active (non-deleted)
 * eligible transaction.**
 *
 * **Reset condition:** any calendar month with zero eligible transactions
 * breaks the streak. The algorithm starts at the most recent contributing
 * month and walks backward one month at a time until it finds a blank month.
 *
 * Soft-deleted rows (deletedAt set) are excluded.
 */
export function computeContributionStreak(
  transactions: ReadonlyArray<
    Pick<Transaction, "date" | "type" | "amount" | "deletedAt">
  >,
): ContributionStreakResult {
  const eligible = transactions.filter(
    (tx) => !tx.deletedAt && CONTRIBUTION_TYPES.has(tx.type),
  );

  if (eligible.length === 0) {
    return { streakMonths: 0, mostRecentMonth: null, lastContributionDate: null };
  }

  // Sort descending by date to find most recent
  const sorted = [...eligible].sort((a, b) => b.date.localeCompare(a.date));
  const lastContributionDate = sorted[0].date;

  // Build set of all contributing months
  const months = new Set(eligible.map((tx) => toYearMonth(tx.date)));

  const mostRecentMonth = toYearMonth(lastContributionDate);

  // Walk backward from mostRecentMonth counting consecutive months
  let streak = 0;
  let cursor = mostRecentMonth;
  while (months.has(cursor)) {
    streak++;
    cursor = prevMonth(cursor);
  }

  return { streakMonths: streak, mostRecentMonth, lastContributionDate };
}
