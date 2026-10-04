import { describe, expect, it } from "vitest";
import { buildContributionHeatmap } from "./contributionHeatmap";
import type { Transaction } from "./types";

function tx(date: string, type: Transaction["type"], amount: number): Transaction {
  return {
    id: `t-${date}-${type}`, date, type, amount, notes: "",
    createdAt: date, updatedAt: date,
  };
}

const NOW = new Date("2026-10-03T12:00:00");

describe("buildContributionHeatmap", () => {
  it("returns null with no contributions", () => {
    expect(buildContributionHeatmap({ transactions: [], locale: "vi", now: NOW })).toBeNull();
  });

  it("returns null with a single month of range", () => {
    const txs = [tx("2026-10-01", "cash_in", 100)];
    expect(buildContributionHeatmap({ transactions: txs, locale: "vi", now: NOW })).toBeNull();
  });

  it("builds one cell per month with intensity levels", () => {
    const txs = [
      tx("2026-08-05", "cash_in", 100),
      tx("2026-08-20", "cash_in", 100), // Aug: 200 (max → level 4)
      tx("2026-09-10", "buy_vwce", 100), // Sep: 100 → level 2
      // Oct: 0 → level 0
    ];
    const heat = buildContributionHeatmap({ transactions: txs, locale: "vi", now: NOW });
    expect(heat).not.toBeNull();
    expect(heat!.totalMonths).toBe(3);
    expect(heat!.activeMonths).toBe(2);
    expect(heat!.months.map((m) => [m.month, m.amount, m.level])).toEqual([
      ["2026-08", 200, 4],
      ["2026-09", 100, 3],
      ["2026-10", 0, 0],
    ]);
  });

  it("ignores deleted, non-contribution and non-positive rows", () => {
    const txs = [
      tx("2026-08-05", "cash_in", 100),
      { ...tx("2026-08-06", "cash_in", 500), deletedAt: "2026-08-07" },
      tx("2026-08-07", "cash_out", 50),
      tx("2026-09-10", "fee", 10),
    ];
    const heat = buildContributionHeatmap({ transactions: txs, locale: "de", now: NOW });
    expect(heat!.months[0].amount).toBe(100);
    expect(heat!.months[1].label).toBe("Sep");
  });
});
