import { describe, expect, it } from "vitest";
import { analyzeTransactions } from "./transactionAnalytics";
import type { Quote, Transaction } from "./types";

const stamp = "2026-08-19T10:00:00.000Z";
const isin = "IE00BK5BQT80";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? "tx",
    date: overrides.date ?? "2026-08-01",
    type: overrides.type ?? "cash_in",
    amount: overrides.amount ?? 0,
    notes: overrides.notes ?? "",
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

function quote(price: number): Quote {
  return {
    id: isin,
    instrumentIsin: isin,
    currency: "EUR",
    price,
    asOf: "2026-08-19",
    source: "manual",
    createdAt: stamp,
    updatedAt: stamp,
  };
}

describe("analyzeTransactions", () => {
  it("calculates marked-to-market and total PnL only from a complete position and quote", () => {
    const result = analyzeTransactions([
      tx({ id: "cash", type: "cash_in", amount: 1_000 }),
      tx({ id: "buy", type: "buy_vwce", amount: 900, unitPrice: 90, quantity: 10, instrumentIsin: isin }),
    ], [quote(100)]);

    expect(result.contributed).toBe(1_000);
    expect(result.buyCount).toBe(1);
    expect(result.holdingsValue).toBe(1_000);
    expect(result.unrealizedPnl).toBe(100);
    expect(result.totalPnl).toBe(100);
  });

  it("does not invent a portfolio return when an open position has no quote", () => {
    const result = analyzeTransactions([
      tx({ id: "buy", type: "buy_vwce", amount: 900, unitPrice: 90, quantity: 10, instrumentIsin: isin }),
    ], []);

    expect(result.holdingsValue).toBeNull();
    expect(result.unrealizedPnl).toBeNull();
    expect(result.totalPnl).toBeNull();
    expect(result.missingQuotes).toEqual([isin]);
  });

  it("uses average cost for realized PnL and keeps the remaining position for valuation", () => {
    const result = analyzeTransactions([
      tx({ id: "buy", type: "buy_vwce", amount: 1_000, unitPrice: 100, quantity: 10, instrumentIsin: isin }),
      tx({ id: "sell", date: "2026-08-02", type: "sell_vwce", amount: 660, unitPrice: 132, quantity: 5, instrumentIsin: isin, fee: 10 }),
    ], [quote(120)]);

    expect(result.realizedPnl).toBe(150);
    expect(result.holdingsValue).toBe(600);
    expect(result.unrealizedPnl).toBe(100);
    expect(result.totalPnl).toBe(250);
    expect(result.feesAndTax).toBe(10);
  });
});
