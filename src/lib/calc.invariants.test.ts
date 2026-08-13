import { describe, expect, it } from "vitest";
import {
  applyTransaction,
  emptyPortfolio,
  portfolioMarketValue,
} from "./calc";
import type { PortfolioState, TxInput } from "./calc";
import { VWCE_ISIN } from "./types";

function numericStateValues(state: PortfolioState): number[] {
  return [
    state.vwceQty,
    state.vwceCostBasis,
    state.totalBought,
    state.totalSold,
    state.totalFees,
    state.totalTax,
    state.cashBalance,
    state.totalContributed,
    state.totalWithdrawn,
    ...Object.values(state.positions).flatMap((position) => [
      position.qty,
      position.costBasis,
      position.totalBought,
      position.totalSold,
    ]),
  ];
}

describe("local-first portfolio numeric invariants", () => {
  it("keeps aggregates finite and security quantities non-negative", () => {
    const inputs: TxInput[] = [
      { type: "cash_in", amount: 200 },
      { type: "buy_vwce", amount: 100, unitPrice: 50, quantity: 2 },
      {
        type: "buy_vwce",
        amount: Number.POSITIVE_INFINITY,
        unitPrice: Number.NaN,
        quantity: -5,
        fee: Number.POSITIVE_INFINITY,
        tax: Number.NaN,
      },
      {
        type: "sell_vwce",
        amount: Number.NaN,
        quantity: Number.POSITIVE_INFINITY,
        fee: Number.NaN,
        tax: Number.NEGATIVE_INFINITY,
      },
      { type: "adjust", amount: -25 },
    ];

    const state = inputs.reduce(applyTransaction, emptyPortfolio());
    expect(numericStateValues(state).every(Number.isFinite)).toBe(true);
    expect(
      Object.values(state.positions).every((position) => position.qty >= 0),
    ).toBe(true);

    const market = portfolioMarketValue(state, {
      [VWCE_ISIN]: Number.POSITIVE_INFINITY,
    });
    expect(Number.isFinite(market.cash)).toBe(true);
    expect(Number.isFinite(market.securities)).toBe(true);
    expect(Number.isFinite(market.total)).toBe(true);
    expect(market.missingIsins).toContain(VWCE_ISIN);
  });
});
