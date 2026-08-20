import { describe, expect, it } from "vitest";
import { buildPlanVsReality, planRealityReviewYears } from "./planVsReality";

const base = {
  startDate: "2026-01-15",
  contributionY1: 100,
  contributionY2: 120,
  trackInAppCash: false,
  transactions: [],
  today: "2026-03-20",
};

describe("buildPlanVsReality", () => {
  it("counts only due contribution months in the current calendar year", () => {
    expect(buildPlanVsReality(base)).toMatchObject({
      year: 2026,
      mode: "securities_first",
      plannedMonths: 3,
      plannedAmount: 300,
      actualAmount: 0,
      missingMonths: 3,
      state: "below_plan",
    });
  });

  it("uses the same mode guard as Overview and never double-counts funding with a security buy", () => {
    const transactions = [
      { date: "2026-01-15", type: "cash_in", amount: 100 },
      { date: "2026-01-15", type: "buy_vwce", amount: 100 },
      { date: "2026-02-15", type: "buy_vwce", amount: 100 },
      { date: "2026-03-15", type: "buy_vwce", amount: 100, deletedAt: "2026-03-16" },
    ];
    const securitiesFirst = buildPlanVsReality({ ...base, transactions });
    const cashFirst = buildPlanVsReality({ ...base, transactions, trackInAppCash: true });
    expect(securitiesFirst).toMatchObject({ actualAmount: 200, recordedMonths: 2, missingMonths: 1, state: "below_plan" });
    expect(cashFirst).toMatchObject({ actualAmount: 100, recordedMonths: 1, missingMonths: 2, state: "below_plan" });
  });

  it("uses the later monthly contribution after the first twelve planned months", () => {
    const view = buildPlanVsReality({ ...base, today: "2027-02-20", transactions: [{ date: "2027-01-15", type: "buy_vwce", amount: 240 }] });
    expect(view).toMatchObject({ year: 2027, plannedMonths: 2, plannedAmount: 240, actualAmount: 240, recordedMonths: 1, missingMonths: 1, progressPct: 100, state: "on_track" });
  });

  it("returns a calm not-started state when the plan starts in the future", () => {
    expect(buildPlanVsReality({ ...base, startDate: "2026-05-01" })).toMatchObject({ plannedMonths: 0, actualAmount: 0, state: "not_started" });
  });

  it("rebuilds an earlier calendar year without counting later records", () => {
    const view = buildPlanVsReality({
      ...base,
      today: "2027-08-20",
      year: 2026,
      transactions: [
        { date: "2026-01-15", type: "buy_vwce", amount: 100 },
        { date: "2026-12-15", type: "buy_vwce", amount: 100 },
        { date: "2027-01-15", type: "buy_vwce", amount: 120 },
      ],
    });
    expect(view).toMatchObject({
      year: 2026,
      plannedMonths: 12,
      plannedAmount: 1200,
      actualAmount: 200,
      recordedMonths: 2,
      missingMonths: 10,
      state: "below_plan",
    });
  });

  it("offers review years from the active plan through today and excludes deleted records", () => {
    expect(planRealityReviewYears({
      startDate: "2026-06-15",
      today: "2028-04-20",
      transactions: [
        { date: "2025-12-15", type: "buy_vwce", amount: 100 },
        { date: "2027-03-15", type: "buy_vwce", amount: 120 },
        { date: "2028-01-15", type: "buy_vwce", amount: 120 },
        { date: "2029-01-15", type: "buy_vwce", amount: 120 },
        { date: "2026-08-15", type: "buy_vwce", amount: 100, deletedAt: "2026-08-16" },
      ],
    })).toEqual([2028, 2027, 2026]);
  });

  it("never selects a future review year", () => {
    expect(buildPlanVsReality({ ...base, today: "2026-03-20", year: 2030 })).toMatchObject({ year: 2026, plannedMonths: 3 });
  });
});
