import { DEFAULT_TER, projectEnd } from "../lib/simulation/engine";
import {
  CASH_FIRST_CONTRIBUTION_TYPES,
  SECURITIES_FIRST_CONTRIBUTION_TYPES,
  heroLifetimeMode,
} from "../lib/heroLifetime";

export type TrajectoryTransaction = {
  date: string;
  type: string;
  amount: number;
  deletedAt?: string | null;
};

export type Trajectory = {
  /** Average monthly contribution over the recent window — actual behavior. */
  pace: number;
  /** Calendar months covered by the recent window (max 12). */
  windowMonths: number;
  /** Projected portfolio value at the target date. */
  projected: number;
  /** Current portfolio value — the bar's start. */
  current: number;
  /** 0-100 progress of current vs projected. */
  progressPct: number;
  /** Target year, taken from the user's (changeable) target date. */
  targetYear: number;
  /** Annual return assumption used for the projection. */
  annualReturn: number;
};

function validDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Forward-looking trajectory for the long-term card. The old card judged
 * reality against contribution settings the user typed once ("below plan") —
 * but those settings are a soft guess, not a commitment, so the verdict was
 * dishonest. This builds from ACTUAL behavior instead: the recent monthly
 * pace, compounded to the user's target date with the configured return
 * assumption. The target date is soft too — it follows settings.endDate, so
 * changing the target year reshapes the projection instead of breaking it.
 * Pure: no Date.now(), no storage, no network.
 */
export function buildTrajectory(input: {
  transactions: readonly TrajectoryTransaction[];
  trackInAppCash: boolean | null | undefined;
  currentValue: number;
  annualReturn: number;
  targetDate: string;
  today: string;
}): Trajectory | null {
  const today = validDate(input.today);
  const target = validDate(input.targetDate);
  if (!today || !target || target <= today) return null;
  const mode = heroLifetimeMode(input.trackInAppCash);
  const countedTypes =
    mode === "cash_first" ? CASH_FIRST_CONTRIBUTION_TYPES : SECURITIES_FIRST_CONTRIBUTION_TYPES;

  const points: { date: Date; amount: number }[] = [];
  for (const tx of input.transactions ?? []) {
    if (!tx || tx.deletedAt || !countedTypes.includes(tx.type)) continue;
    const date = validDate(tx.date);
    if (!date || date > today) continue;
    if (!Number.isFinite(tx.amount) || tx.amount <= 0) continue;
    points.push({ date, amount: tx.amount });
  }
  if (points.length === 0) return null;

  // Recent window: up to 12 COMPLETED calendar months (the current month is
  // still in progress and would dilute the pace), anchored at the first
  // contribution when history is shorter.
  const firstTx = points.reduce((a, b) => (a.date < b.date ? a : b)).date;
  const lastCompleted = new Date(today.getFullYear(), today.getMonth() - 1, 1, 12, 0, 0);
  const windowFloor = new Date(lastCompleted.getFullYear(), lastCompleted.getMonth() - 11, 1, 12, 0, 0);
  const firstTxMonth = new Date(firstTx.getFullYear(), firstTx.getMonth(), 1, 12, 0, 0);
  const startMonth = firstTxMonth > windowFloor ? firstTxMonth : windowFloor;
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);
  const windowMonths = Math.max(
    1,
    (lastCompleted.getFullYear() - startMonth.getFullYear()) * 12 +
      (lastCompleted.getMonth() - startMonth.getMonth()) +
      1,
  );
  let windowSum = 0;
  for (const p of points) {
    if (p.date >= startMonth && p.date < thisMonth) windowSum += p.amount;
  }
  // Paused longer than the window: fall back to the whole-history average
  // instead of showing a €0 pace.
  let pace: number;
  let months: number;
  if (windowSum > 0) {
    pace = windowSum / windowMonths;
    months = windowMonths;
  } else {
    const total = points.reduce((sum, p) => sum + p.amount, 0);
    const spanMonths = Math.max(
      1,
      (lastCompleted.getFullYear() - firstTxMonth.getFullYear()) * 12 +
        (lastCompleted.getMonth() - firstTxMonth.getMonth()) +
        1,
    );
    pace = total / spanMonths;
    months = spanMonths;
  }

  const msPerYear = 365.25 * 86_400_000;
  const years = (target.getTime() - today.getTime()) / msPerYear;
  if (!(years > 0)) return null;
  const annualReturn =
    Number.isFinite(input.annualReturn) && input.annualReturn > -1 ? input.annualReturn : 0;
  const current = Math.max(0, Number.isFinite(input.currentValue) ? input.currentValue : 0);
  const result = projectEnd({
    years,
    monthlyContribution: pace,
    annualReturn,
    initialBalance: current,
    lumpSum: 0,
    annualContributionGrowth: 0,
    ter: DEFAULT_TER,
  });
  const projected = Math.max(0, result.terminal);
  const progressPct =
    projected > 0 ? Math.min(100, Math.max(0, (current / projected) * 100)) : 0;
  return {
    pace,
    windowMonths: months,
    projected,
    current,
    progressPct,
    targetYear: target.getFullYear(),
    annualReturn,
  };
}
