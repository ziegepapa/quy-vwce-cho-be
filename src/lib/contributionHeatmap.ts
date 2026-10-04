import type { Transaction } from "./types";

export type HeatmapMonth = {
  /** YYYY-MM */
  month: string;
  /** Short locale-aware label, e.g. "T7" / "Jul". */
  label: string;
  /** Total contributed in this month. */
  amount: number;
  /** 0 = no contribution, 1..4 = intensity quartiles vs the max month. */
  level: 0 | 1 | 2 | 3 | 4;
};

export type ContributionHeatmap = {
  months: HeatmapMonth[];
  /** Months with at least one contribution. */
  activeMonths: number;
  /** Total months in range. */
  totalMonths: number;
};

const MONTH_LABEL_VI = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];
const MONTH_LABEL_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** Transaction types that count as a contribution — same as contributionStreak. */
const CONTRIBUTION_TYPES = new Set<Transaction["type"]>([
  "cash_in",
  "buy_vwce",
  "buy_security",
]);

/**
 * Monthly contribution heatmap from REAL transactions only.
 * One cell per calendar month from the first contribution month to now.
 * Returns null when there are fewer than 2 months of range — a single
 * cell tells no rhythm story.
 * Pure: no Date.now() (pass `now`), no storage, no network.
 */
export function buildContributionHeatmap(input: {
  transactions: readonly Transaction[];
  locale: "vi" | "de";
  now?: Date;
}): ContributionHeatmap | null {
  const { transactions, locale } = input;
  const now = input.now ?? new Date();

  const eligible = transactions.filter(
    (t) => !t.deletedAt && CONTRIBUTION_TYPES.has(t.type) && /^\d{4}-\d{2}-\d{2}/.test(t.date) && t.amount > 0,
  );
  if (eligible.length === 0) return null;

  const first = eligible.map((t) => t.date.slice(0, 7)).sort()[0];
  const [firstYear, firstMonth] = first.split("-").map(Number);
  const endYear = now.getFullYear();
  const endMonth = now.getMonth();

  const monthKeys: string[] = [];
  let y = firstYear;
  let m = firstMonth - 1;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    monthKeys.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  if (monthKeys.length < 2) return null;

  const byMonth = new Map<string, number>();
  for (const t of eligible) {
    const key = t.date.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + t.amount);
  }

  const max = Math.max(...monthKeys.map((k) => byMonth.get(k) ?? 0), 0);
  const labels = locale === "de" ? MONTH_LABEL_DE : MONTH_LABEL_VI;

  const months: HeatmapMonth[] = monthKeys.map((key) => {
    const amount = byMonth.get(key) ?? 0;
    const monthIndex = Number(key.slice(5, 7)) - 1;
    let level: HeatmapMonth["level"] = 0;
    if (amount > 0 && max > 0) {
      const ratio = amount / max;
      level = ratio >= 0.75 ? 4 : ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1;
    }
    return { month: key, label: labels[monthIndex], amount: Math.round(amount * 100) / 100, level };
  });

  return {
    months,
    activeMonths: months.filter((mo) => mo.amount > 0).length,
    totalMonths: months.length,
  };
}
