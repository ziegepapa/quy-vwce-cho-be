import { describe, expect, it } from "vitest";
import { buildPlanVsReality } from "./planVsReality";

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
});
