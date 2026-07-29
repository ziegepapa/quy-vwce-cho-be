import { describe, expect, it } from "vitest";
import {
  applyTransaction,
  avgCost,
  calcQuantity,
  csvEscape,
  emptyPortfolio,
  etfToSell,
  goalProgressStatus,
  inflate,
  monthlyRate,
  requiredSafeAmount,
  simulateMonthly,
} from "./calc";

describe("monthlyRate", () => {
  it("5%", () => {
    const r = monthlyRate(0.05);
    expect(r).toBeGreaterThan(0.004);
    expect(r).toBeLessThan(0.005);
  });
  it("neg", () => expect(monthlyRate(-0.1)).toBeLessThan(0));
  it("blocks <= -100%", () => expect(monthlyRate(-1)).toBe(0));
});

describe("inflate", () => {
  it("12y", () => expect(Math.round(inflate(10000, 0.02, 12))).toBe(12682));
  it("13y", () => expect(Math.round(inflate(2000, 0.02, 13))).toBe(2587));
  it("0", () => expect(inflate(10000, 0, 12)).toBe(10000));
  it("past years clamped", () => expect(inflate(1000, 0.02, -5)).toBe(1000));
});

describe("qty", () => {
  it("ok", () => {
    expect(calcQuantity(100, 50)).toBe(2);
    expect(calcQuantity(100, 0)).toBe(0);
  });
  it("fee tax", () => expect(calcQuantity(100, 50, 5, 5)).toBe(1.8));
});

describe("tx cash flow rules", () => {
  it("cash_in then buy does NOT double-count contribution", () => {
    let s = emptyPortfolio();
    s = applyTransaction(s, { type: "cash_in", amount: 200 });
    expect(s.totalContributed).toBe(200);
    expect(s.cashBalance).toBe(200);
    s = applyTransaction(s, { type: "buy_vwce", amount: 100, unitPrice: 50 });
    expect(s.totalContributed).toBe(200); // not 300
    expect(s.vwceQty).toBe(2);
    expect(s.cashBalance).toBe(100);
    expect(s.vwceCostBasis).toBe(100);
  });

  it("buy with fee: cost basis is securities value", () => {
    let s = emptyPortfolio();
    s = applyTransaction(s, { type: "cash_in", amount: 110 });
    s = applyTransaction(s, { type: "buy_vwce", amount: 110, unitPrice: 50, fee: 10 });
    expect(s.vwceQty).toBe(2);
    expect(s.vwceCostBasis).toBe(100);
    expect(s.totalFees).toBe(10);
    expect(s.cashBalance).toBe(0);
    expect(s.totalContributed).toBe(110);
  });

  it("sell partial keeps avg cost", () => {
    let s = emptyPortfolio();
    s = applyTransaction(s, { type: "cash_in", amount: 200 });
    s = applyTransaction(s, { type: "buy_vwce", amount: 100, unitPrice: 50 });
    s = applyTransaction(s, { type: "buy_vwce", amount: 100, unitPrice: 50 });
    expect(s.vwceQty).toBe(4);
    s = applyTransaction(s, { type: "sell_vwce", amount: 60, quantity: 1 });
    expect(s.vwceQty).toBe(3);
    expect(avgCost(s)).toBeCloseTo(50, 5);
    expect(s.cashBalance).toBe(60);
  });

  it("cannot sell more than owned", () => {
    let s = emptyPortfolio();
    s = applyTransaction(s, { type: "cash_in", amount: 100 });
    s = applyTransaction(s, { type: "buy_vwce", amount: 100, unitPrice: 50 });
    s = applyTransaction(s, { type: "sell_vwce", amount: 200, quantity: 10 });
    expect(s.vwceQty).toBe(0);
    expect(s.cashBalance).toBe(200);
  });

  it("sell all", () => {
    let s = emptyPortfolio();
    s = applyTransaction(s, { type: "cash_in", amount: 100 });
    s = applyTransaction(s, { type: "buy_vwce", amount: 100, unitPrice: 50 });
    s = applyTransaction(s, { type: "sell_vwce", amount: 110, quantity: 2, fee: 5, tax: 5 });
    expect(s.vwceQty).toBe(0);
    expect(s.vwceCostBasis).toBe(0);
    expect(s.cashBalance).toBe(100); // 0 + 110 - 5 - 5
  });

  it("cash out / fee / tax / interest / adjust", () => {
    let s = applyTransaction(emptyPortfolio(), { type: "cash_in", amount: 100 });
    s = applyTransaction(s, { type: "cash_out", amount: 20 });
    s = applyTransaction(s, { type: "fee", amount: 5 });
    s = applyTransaction(s, { type: "tax", amount: 5 });
    s = applyTransaction(s, { type: "safe_interest", amount: 3 });
    s = applyTransaction(s, { type: "adjust", amount: -1 });
    expect(s.cashBalance).toBe(72);
    expect(s.totalContributed).toBe(100);
    expect(s.totalWithdrawn).toBe(20);
    expect(s.totalFees).toBe(5);
    expect(s.totalTax).toBe(5);
  });

  it("zero buy", () =>
    expect(applyTransaction(emptyPortfolio(), { type: "buy_vwce", amount: 0, unitPrice: 10 }).vwceQty).toBe(0));
});

describe("status", () => {
  it("g", () =>
    expect(goalProgressStatus({ targetAdjusted: 100, protectedAmount: 100, monthsRemaining: 24 })).toBe("green"));
  it("y", () =>
    expect(goalProgressStatus({ targetAdjusted: 100, protectedAmount: 92, monthsRemaining: 24 })).toBe("yellow"));
  it("r", () =>
    expect(goalProgressStatus({ targetAdjusted: 100, protectedAmount: 80, monthsRemaining: 24 })).toBe("red"));
  it("near", () =>
    expect(goalProgressStatus({ targetAdjusted: 100, protectedAmount: 99, monthsRemaining: 6 })).toBe("red"));
});

describe("safe", () => {
  it("buf", () =>
    expect(
      requiredSafeAmount({
        targetAmount: 10000,
        inflationRate: 0.02,
        baseYear: 2026,
        targetYear: 2038,
        useInflation: true,
        bufferPct: 0.1,
      }),
    ).toBeGreaterThan(12682));
  it("floor", () => expect(etfToSell({ requiredSafe: 100, currentSafe: 80, expectedFutureCash: 50 })).toBe(0));
  it("past", () =>
    expect(
      requiredSafeAmount({
        targetAmount: 1000,
        inflationRate: 0.02,
        baseYear: 2026,
        targetYear: 2020,
        useInflation: true,
        bufferPct: 0,
      }),
    ).toBe(1000));
});

describe("sim", () => {
  it("12m end-of-month contrib", () => {
    const rows = simulateMonthly({
      startYear: 2026,
      startMonth: 7,
      endYear: 2027,
      endMonth: 6,
      initialVwce: 0,
      initialCash: 0,
      contributionYear1: 100,
      contributionFromYear2: 120,
      vwceAnnualReturn: 0.05,
      safeAnnualReturn: 0.015,
    });
    expect(rows.length).toBe(12);
    expect(rows.at(-1)!.contributed).toBe(1200);
  });

  it("withdrawal reduces total", () => {
    const rows = simulateMonthly({
      startYear: 2026,
      startMonth: 7,
      endYear: 2026,
      endMonth: 8,
      initialVwce: 1000,
      initialCash: 500,
      contributionYear1: 0,
      contributionFromYear2: 0,
      vwceAnnualReturn: 0,
      safeAnnualReturn: 0,
      withdrawals: [{ year: 2026, month: 8, amount: 200 }],
    });
    expect(rows[1].withdrawn).toBe(200);
    expect(rows[1].total).toBe(1300);
  });

  it("transfer etf to cash", () => {
    const rows = simulateMonthly({
      startYear: 2026,
      startMonth: 7,
      endYear: 2026,
      endMonth: 7,
      initialVwce: 1000,
      initialCash: 0,
      contributionYear1: 0,
      contributionFromYear2: 0,
      vwceAnnualReturn: 0,
      safeAnnualReturn: 0,
      transfers: [{ year: 2026, month: 7, amount: 400 }],
    });
    expect(rows[0].vwce).toBe(600);
    expect(rows[0].cash).toBe(400);
  });
});

describe("csvEscape", () => {
  it("plain", () => expect(csvEscape("hello")).toBe("hello"));
  it("comma", () => expect(csvEscape("a,b")).toBe('"a,b"'));
  it("quote", () => expect(csvEscape('say "hi"')).toBe('"say ""hi"""'));
  it("newline", () => expect(csvEscape("a\nb")).toBe('"a\nb"'));
});
