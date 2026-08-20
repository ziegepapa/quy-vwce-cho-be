import {
  CASH_FIRST_CONTRIBUTION_TYPES,
  SECURITIES_FIRST_CONTRIBUTION_TYPES,
  heroLifetimeMode,
  type HeroLifetimeMode,
} from "../lib/heroLifetime";

export type PlanRealityTransaction = {
  date: string;
  type: string;
  amount: number;
  deletedAt?: string | null;
};

export type PlanVsReality = {
  year: number;
  mode: HeroLifetimeMode;
  plannedMonths: number;
  recordedMonths: number;
  missingMonths: number;
  plannedAmount: number;
  actualAmount: number;
  progressPct: number;
  state: "not_started" | "on_track" | "below_plan";
};

function validDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function planAmountForMonth(monthIndex: number, firstYearMonthly: number, laterMonthly: number): number {
  return monthIndex < 12 ? firstYearMonthly : laterMonthly;
}

/**
 * View-only progress for the calendar year containing `today`. Planned amounts
 * use the existing month-one/month-two Sparplan settings. Recorded amounts use
 * the same authoritative transaction set as the Overview hero, so cash-first
 * and securities-first ledgers never double-count a funding/buy pair.
 */
export function buildPlanVsReality(input: {
  startDate: string;
  contributionY1: number;
  contributionY2: number;
  trackInAppCash: boolean | null | undefined;
  transactions: readonly PlanRealityTransaction[];
  today: string;
}): PlanVsReality {
  const today = validDate(input.today) ?? new Date(0);
  const start = validDate(input.startDate);
  const year = today.getFullYear();
  const mode = heroLifetimeMode(input.trackInAppCash);
  const countedTypes = mode === "cash_first" ? CASH_FIRST_CONTRIBUTION_TYPES : SECURITIES_FIRST_CONTRIBUTION_TYPES;
  const firstYearMonthly = Number.isFinite(input.contributionY1) && input.contributionY1 > 0 ? input.contributionY1 : 0;
  const laterMonthly = Number.isFinite(input.contributionY2) && input.contributionY2 > 0 ? input.contributionY2 : 0;

  if (!start || start > today) {
    return { year, mode, plannedMonths: 0, recordedMonths: 0, missingMonths: 0, plannedAmount: 0, actualAmount: 0, progressPct: 0, state: "not_started" };
  }

  let plannedMonths = 0;
  let plannedAmount = 0;
  const monthCursor = new Date(start.getFullYear(), start.getMonth(), 1, 12, 0, 0);
  const dueDay = Math.min(28, Math.max(1, start.getDate()));
  let monthIndex = 0;
  while (monthCursor <= today) {
    const due = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), dueDay, 12, 0, 0);
    if (due > today) break;
    if (due.getFullYear() === year) {
      plannedMonths += 1;
      plannedAmount += planAmountForMonth(monthIndex, firstYearMonthly, laterMonthly);
    }
    monthCursor.setMonth(monthCursor.getMonth() + 1);
    monthIndex += 1;
  }

  const recordedMonths = new Set<string>();
  let actualAmount = 0;
  for (const tx of input.transactions ?? []) {
    if (!tx || tx.deletedAt || !countedTypes.includes(tx.type)) continue;
    const date = validDate(tx.date);
    if (!date || date.getFullYear() !== year || date > today) continue;
    if (!Number.isFinite(tx.amount) || tx.amount <= 0) continue;
    actualAmount += tx.amount;
    recordedMonths.add(tx.date.slice(0, 7));
  }

  const missingMonths = Math.max(0, plannedMonths - recordedMonths.size);
  const progressPct = plannedAmount > 0 ? Math.min(100, Math.max(0, (actualAmount / plannedAmount) * 100)) : 0;
  const state = plannedMonths === 0 ? "not_started" : actualAmount >= plannedAmount ? "on_track" : "below_plan";
  return { year, mode, plannedMonths, recordedMonths: recordedMonths.size, missingMonths, plannedAmount, actualAmount, progressPct, state };
}
