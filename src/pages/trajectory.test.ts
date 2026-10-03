import { describe, expect, it } from "vitest";
import { buildTrajectory } from "./trajectory";

const base = {
  trackInAppCash: false,
  currentValue: 10000,
  annualReturn: 0.05,
  targetDate: "2042-06-30",
  today: "2026-10-03",
};

function monthly(id: string, year: number, month: number, amount = 100) {
  return {
    date: `${year}-${String(month).padStart(2, "0")}-15`,
    type: "buy_vwce",
    amount,
  };
}

describe("buildTrajectory", () => {
  // 12 contributions of 100 across the 12 months ending last month
  // (a contribution dated after "today" is correctly ignored).
  const recentYear = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(2026, 9 - 12 + i, 15);
    return monthly(`tx-${i}`, d.getFullYear(), d.getMonth() + 1, 100);
  });

  it("derives the pace from the recent window, not from settings", () => {
    const t = buildTrajectory({ ...base, transactions: recentYear });
    expect(t).not.toBeNull();
    expect(t!.pace).toBeCloseTo(100, 8);
    expect(t!.windowMonths).toBe(12);
    expect(t!.targetYear).toBe(2042);
    expect(t!.annualReturn).toBe(0.05);
  });

  it("compounds the pace to the target date", () => {
    const t = buildTrajectory({ ...base, transactions: recentYear, currentValue: 0 });
    // 12 x 100 at 5% over ~15.7y must exceed raw contributions of 1200,
    // and land near the closed-form future value of a 180-month annuity
    // (engine floors to whole years and deducts TER).
    const rMonth = Math.pow(1.05, 1 / 12) - 1;
    const closed = 100 * ((Math.pow(1 + rMonth, 180) - 1) / rMonth);
    expect(t!.projected).toBeGreaterThan(1200);
    expect(t!.projected).toBeGreaterThan(closed * 0.85);
    expect(t!.projected).toBeLessThan(closed * 1.05);
  });

  it("returns null without contribution history", () => {
    expect(buildTrajectory({ ...base, transactions: [] })).toBeNull();
  });

  it("returns null when the target date is not in the future", () => {
    const transactions = [monthly("tx-1", 2026, 1)];
    expect(buildTrajectory({ ...base, transactions, targetDate: "2026-10-03" })).toBeNull();
    expect(buildTrajectory({ ...base, transactions, targetDate: "2020-01-01" })).toBeNull();
    expect(buildTrajectory({ ...base, transactions, targetDate: "not-a-date" })).toBeNull();
  });

  it("falls back to whole-history pace after a pause longer than a year", () => {
    const transactions = [monthly("tx-old", 2024, 1, 200)];
    const t = buildTrajectory({ ...base, transactions });
    expect(t).not.toBeNull();
    // One 200 contribution over 33 completed months of history (Jan 2024–Sep 2026).
    expect(t!.pace).toBeCloseTo(200 / 33, 8);
  });

  it("never double-counts a funding leg with its security buy", () => {
    const transactions = [
      { date: "2026-09-15", type: "cash_in", amount: 100 },
      { date: "2026-09-15", type: "buy_vwce", amount: 100 },
    ];
    const t = buildTrajectory({ ...base, transactions });
    // securities-first: only the buy counts -> pace over the single
    // completed month of history (Sep 2026).
    expect(t!.pace).toBeCloseTo(100, 8);
    expect(t!.windowMonths).toBe(1);
  });

  it("reports progress of current value vs projected", () => {
    const t = buildTrajectory({ ...base, transactions: recentYear, currentValue: 5000 });
    expect(t!.progressPct).toBeCloseTo((5000 / t!.projected) * 100, 8);
  });
});
