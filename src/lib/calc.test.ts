import { describe, expect, it } from "vitest";
import { applyTransaction, calcQuantity, emptyPortfolio, etfToSell, goalProgressStatus, inflate, monthlyRate, requiredSafeAmount, simulateMonthly } from "./calc";
describe("monthlyRate", () => {
  it("5%", () => { const r = monthlyRate(0.05); expect(r).toBeGreaterThan(0.004); expect(r).toBeLessThan(0.005); });
  it("neg", () => expect(monthlyRate(-0.1)).toBeLessThan(0));
});
describe("inflate", () => {
  it("12y", () => expect(Math.round(inflate(10000, 0.02, 12))).toBe(12682));
  it("13y", () => expect(Math.round(inflate(2000, 0.02, 13))).toBe(2587));
  it("0", () => expect(inflate(10000, 0, 12)).toBe(10000));
});
describe("qty", () => {
  it("ok", () => { expect(calcQuantity(100, 50)).toBe(2); expect(calcQuantity(100, 0)).toBe(0); });
});
describe("tx", () => {
  it("buy", () => { let s = emptyPortfolio(); s.cashBalance = 200; s = applyTransaction(s, { type: "buy_vwce", amount: 100, unitPrice: 50 }); expect(s.vwceQty).toBe(2); });
  it("sell", () => { let s = emptyPortfolio(); s.cashBalance = 200; s = applyTransaction(s, { type: "buy_vwce", amount: 100, unitPrice: 50 }); s = applyTransaction(s, { type: "sell_vwce", amount: 60, quantity: 1 }); expect(s.vwceQty).toBe(1); });
  it("cash", () => { let s = applyTransaction(emptyPortfolio(), { type: "cash_in", amount: 50 }); s = applyTransaction(s, { type: "cash_out", amount: 20 }); expect(s.cashBalance).toBe(30); });
  it("zero", () => expect(applyTransaction(emptyPortfolio(), { type: "buy_vwce", amount: 0, unitPrice: 10 }).vwceQty).toBe(0));
});
describe("status", () => {
  it("g", () => expect(goalProgressStatus({ targetAdjusted: 100, protectedAmount: 100, monthsRemaining: 24 })).toBe("green"));
  it("y", () => expect(goalProgressStatus({ targetAdjusted: 100, protectedAmount: 92, monthsRemaining: 24 })).toBe("yellow"));
  it("r", () => expect(goalProgressStatus({ targetAdjusted: 100, protectedAmount: 80, monthsRemaining: 24 })).toBe("red"));
  it("near", () => expect(goalProgressStatus({ targetAdjusted: 100, protectedAmount: 99, monthsRemaining: 6 })).toBe("red"));
});
describe("safe", () => {
  it("buf", () => expect(requiredSafeAmount({ targetAmount: 10000, inflationRate: 0.02, baseYear: 2026, targetYear: 2038, useInflation: true, bufferPct: 0.1 })).toBeGreaterThan(12682));
  it("floor", () => expect(etfToSell({ requiredSafe: 100, currentSafe: 80, expectedFutureCash: 50 })).toBe(0));
  it("past", () => expect(requiredSafeAmount({ targetAmount: 1000, inflationRate: 0.02, baseYear: 2026, targetYear: 2020, useInflation: true, bufferPct: 0 })).toBe(1000));
});
describe("sim", () => {
  it("12m", () => { const rows = simulateMonthly({ startYear: 2026, startMonth: 7, endYear: 2027, endMonth: 6, initialVwce: 0, initialCash: 0, contributionYear1: 100, contributionFromYear2: 120, vwceAnnualReturn: 0.05, safeAnnualReturn: 0.015 }); expect(rows.length).toBe(12); expect(rows.at(-1)!.contributed).toBe(1200); });
});
