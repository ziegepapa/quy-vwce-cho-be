import { describe, expect, it } from "vitest";
import { buildYearInReview } from "./yearInReview";

const base = {
  today: "2026-08-20",
  trackInAppCash: false,
  transactions: [],
  qualityIssues: [],
  latestPrice: 166.5,
  latestPriceDate: "2026-08-19",
};

describe("buildYearInReview", () => {
  it("reports only live transactions in the selected calendar year", () => {
    const review = buildYearInReview({
      ...base,
      transactions: [
        { date: "2025-12-31", type: "buy_vwce", amount: 90, fee: 1, tax: 2 },
        { date: "2026-01-02", type: "buy_vwce", amount: 100, fee: 1.5, tax: 0.5 },
        { date: "2026-03-05", type: "sell_vwce", amount: 50, fee: 0.25, tax: 2 },
        { date: "2026-04-05", type: "buy_vwce", amount: 120, deletedAt: "2026-04-06" },
      ],
    });
    expect(review).toMatchObject({ year: 2026, contributionMode: "securities_first", contributionAmount: 100, transactionCount: 2, fees: 1.75, taxes: 2.5 });
  });

  it("uses the same cash-first mode guard as Overview instead of double-counting a funding/buy pair", () => {
    const transactions = [
      { date: "2026-01-02", type: "cash_in", amount: 100 },
      { date: "2026-01-02", type: "buy_vwce", amount: 100 },
    ];
    expect(buildYearInReview({ ...base, transactions, trackInAppCash: false }).contributionAmount).toBe(100);
    expect(buildYearInReview({ ...base, transactions, trackInAppCash: true }).contributionAmount).toBe(100);
  });

  it("counts quality issues only from the review year and preserves an honest no-history price state", () => {
    const review = buildYearInReview({
      ...base,
      qualityIssues: [
        { transactionId: "a", code: "missing_isin", severity: "action", date: "2026-03-01" },
        { transactionId: "b", code: "missing_unit_price", severity: "review", date: "2026-04-01" },
        { transactionId: "c", code: "missing_note", severity: "tip", date: "2025-12-31" },
      ],
    });
    expect(review).toMatchObject({ qualityIssueCount: 2, actionIssueCount: 1, reviewIssueCount: 1, priceSnapshot: { price: 166.5, asOf: "2026-08-19" }, priceHistoryAvailable: false });
  });

  it("does not invent a price snapshot from missing, invalid or undated values", () => {
    expect(buildYearInReview({ ...base, latestPrice: 0, latestPriceDate: "" }).priceSnapshot).toBeNull();
  });
});
