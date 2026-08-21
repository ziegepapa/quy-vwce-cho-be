import { describe, expect, it } from "vitest";
import { replayTransactions } from "./calc";
import { VWCE_ISIN } from "./types";
import type { Transaction } from "./types";

function tx(partial: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    date: "2026-08-21",
    type: "cash_in",
    amount: 100,
    notes: "replay fixture",
    createdAt: "2026-08-21T08:00:00.000Z",
    updatedAt: "2026-08-21T08:00:00.000Z",
    source: "manual",
    ...partial,
  };
}

describe("H2-B canonical replay", () => {
  it("quarantines legacy unsafe sales without rewriting raw evidence", () => {
    const legacyOversell = tx({
      id: "legacy-oversell",
      type: "sell_vwce",
      amount: 1_000,
      quantity: 10,
      instrumentIsin: VWCE_ISIN,
    });
    const before = structuredClone(legacyOversell);
    const state = replayTransactions([
      tx({ id: "cash", type: "cash_in", amount: 100 }),
      tx({
        id: "buy",
        type: "buy_vwce",
        amount: 100,
        quantity: 2,
        unitPrice: 50,
        instrumentIsin: VWCE_ISIN,
      }),
      legacyOversell,
    ]);

    expect(legacyOversell).toEqual(before);
    expect(state.vwceQty).toBe(2);
    expect(state.vwceCostBasis).toBe(100);
    expect(state.cashBalance).toBe(0);
    expect(state.totalSold).toBe(0);
  });

  it("quarantines missing sale quantity with zero economic effect", () => {
    const state = replayTransactions([
      tx({ id: "cash", type: "cash_in", amount: 100 }),
      tx({
        id: "missing-sale",
        type: "sell_vwce",
        amount: 100,
        quantity: undefined,
        instrumentIsin: VWCE_ISIN,
      }),
    ]);
    expect(state.cashBalance).toBe(100);
    expect(state.totalSold).toBe(0);
    expect(state.vwceQty).toBe(0);
  });

  it("ignores deleted evidence entirely", () => {
    const state = replayTransactions([
      tx({ id: "live", type: "cash_in", amount: 100 }),
      tx({ id: "deleted", type: "cash_in", amount: 999, deletedAt: "2026-08-22T00:00:00.000Z" }),
    ]);
    expect(state.cashBalance).toBe(100);
    expect(state.totalContributed).toBe(100);
  });

  it("replays same-date transactions through createdAt then stable id rather than input order", () => {
    const buy = tx({
      id: "b-buy",
      type: "buy_vwce",
      amount: 100,
      quantity: 2,
      unitPrice: 50,
      instrumentIsin: VWCE_ISIN,
      createdAt: "2026-08-21T09:00:00.000Z",
    });
    const cash = tx({
      id: "a-cash",
      type: "cash_in",
      amount: 100,
      createdAt: "2026-08-21T08:00:00.000Z",
    });
    const first = replayTransactions([buy, cash]);
    const second = replayTransactions([cash, buy]);
    expect(first).toEqual(second);
    expect(first.vwceQty).toBe(2);
    expect(first.cashBalance).toBe(0);
  });
});
