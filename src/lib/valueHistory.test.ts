import { describe, expect, it } from "vitest";
import { buildValueHistory } from "./valueHistory";
import type { Quote, Transaction } from "./types";

function tx(id: string, date: string, type: Transaction["type"], amount: number, extra: Partial<Transaction> = {}): Transaction {
  return {
    id, date, type, amount, notes: "",
    createdAt: `${date}T00:00:00Z`, updatedAt: `${date}T00:00:00Z`, source: "manual",
    ...extra,
  } as Transaction;
}

function quote(asOf: string, price: number): Quote {
  return { id: `q-${asOf}`, instrumentIsin: "IE00BK5BQT80", currency: "EUR", price, asOf, source: "auto", createdAt: `${asOf}T00:00:00Z`, updatedAt: `${asOf}T00:00:00Z` };
}

describe("buildValueHistory", () => {
  it("returns null with no transactions", () => {
    expect(buildValueHistory({ transactions: [], quotes: [], locale: "vi", now: new Date("2026-10-03") })).toBeNull();
  });

  it("returns null with a single month of history", () => {
    const txs = [tx("t1", "2026-10-02", "cash_in", 120)];
    expect(buildValueHistory({ transactions: txs, quotes: [], locale: "vi", now: new Date("2026-10-03") })).toBeNull();
  });

  it("builds monthly values from real transactions and quotes", () => {
    const txs = [
      tx("t1", "2026-08-05", "cash_in", 120),
      tx("t2", "2026-08-06", "buy_vwce", 118.5, { unitPrice: 118.5, quantity: 1, fee: 1 }),
      tx("t3", "2026-09-05", "cash_in", 120),
    ];
    const quotes = [quote("2026-08-29", 118), quote("2026-09-30", 121)];
    const points = buildValueHistory({ transactions: txs, quotes, locale: "vi", now: new Date("2026-10-03") });
    expect(points).not.toBeNull();
    expect(points!.map((p) => p.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(points![0].label).toBe("T8");
    // Aug: 1 share @118 + leftover cash (120 - 118.5 = 1.5; fee tracked separately)
    expect(points![0].value).toBeCloseTo(118 + 1.5, 2);
    // Sep: 1 share @121 + cash (1.5 + 120)
    expect(points![1].value).toBeCloseTo(121 + 121.5, 2);
    // Oct: no new quote -> falls back to latest (121)
    expect(points![2].value).toBeCloseTo(121 + 121.5, 2);
    // Contributed (securities-first default): only the buy_vwce counts
    expect(points![0].contributed).toBeCloseTo(118.5, 2);
    expect(points![1].contributed).toBeCloseTo(118.5, 2);
    expect(points![2].contributed).toBeCloseTo(118.5, 2);
  });

  it("contributed follows the hero definition per mode", () => {
    const txs = [
      tx("t1", "2026-08-05", "cash_in", 120),
      tx("t2", "2026-08-06", "buy_vwce", 118.5, { unitPrice: 118.5, quantity: 1, fee: 1 }),
      tx("t3", "2026-09-05", "cash_in", 120),
    ];
    const quotes = [quote("2026-08-29", 118), quote("2026-09-30", 121)];
    // cash-first: cash_in only
    const cashFirst = buildValueHistory({ transactions: txs, quotes, locale: "vi", trackInAppCash: true, now: new Date("2026-10-03") });
    expect(cashFirst![0].contributed).toBeCloseTo(120, 2);
    expect(cashFirst![1].contributed).toBeCloseTo(240, 2);
    expect(cashFirst![2].contributed).toBeCloseTo(240, 2);
    // securities-first: buys only
    const secFirst = buildValueHistory({ transactions: txs, quotes, locale: "vi", trackInAppCash: false, now: new Date("2026-10-03") });
    expect(secFirst![0].contributed).toBeCloseTo(118.5, 2);
    expect(secFirst![1].contributed).toBeCloseTo(118.5, 2);
    expect(secFirst![2].contributed).toBeCloseTo(118.5, 2);
  });

  it("sums VWCE + VALL positions at their own prices", () => {
    const txs = [
      tx("t1", "2026-08-05", "cash_in", 120),
      tx("t2", "2026-08-06", "buy_vwce", 118.5, { unitPrice: 118.5, quantity: 1, fee: 1 }),
      tx("t3", "2026-09-05", "cash_in", 120),
      tx("t4", "2026-09-06", "buy_security", 44.5, { instrumentIsin: "IE000VAHT5T0", unitPrice: 4.45, quantity: 10, fee: 0 }),
    ];
    const quotes = [
      quote("2026-08-29", 118),
      quote("2026-09-30", 121),
      { ...quote("2026-09-30", 4.5), id: "q-vall-2026-09-30", instrumentIsin: "IE000VAHT5T0" },
    ];
    const points = buildValueHistory({ transactions: txs, quotes, locale: "vi", now: new Date("2026-10-03") });
    expect(points).not.toBeNull();
    expect(points!.map((p) => p.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
    // Aug: VWCE only (VALL not bought yet): 1 @118 + cash (120 - 118.5 = 1.5)
    expect(points![0].value).toBeCloseTo(118 + 1.5, 2);
    // Sep: VWCE 1 @121 + VALL 10 @4.5 + cash (1.5 + 120 - 44.5 = 77)
    expect(points![1].value).toBeCloseTo(121 + 45 + 77, 2);
    // Oct: no new quote -> each instrument falls back to its own latest price
    expect(points![2].value).toBeCloseTo(121 + 45 + 77, 2);
  });

  it("ignores deleted transactions", () => {
    const txs = [
      tx("t1", "2026-08-05", "cash_in", 120, { deletedAt: "2026-09-01T00:00:00Z" }),
      tx("t2", "2026-09-05", "cash_in", 120),
    ];
    const points = buildValueHistory({ transactions: txs, quotes: [], locale: "de", now: new Date("2026-10-03") });
    expect(points).not.toBeNull();
    expect(points![0].label).toBe("Sep");
    expect(points![0].value).toBe(120);
    expect(points![1].value).toBe(120);
  });
});
