import { describe, expect, it } from "vitest";

import {
  CASH_FIRST_CONTRIBUTION_TYPES,
  SECURITIES_FIRST_CONTRIBUTION_TYPES,
  computeHeroLifetimeContribution,
  heroLifetimeMode,
} from "./heroLifetime";

describe("heroLifetimeMode", () => {
  it("only treats an explicit true as cash-first", () => {
    expect(heroLifetimeMode(true)).toBe("cash_first");
    expect(heroLifetimeMode(false)).toBe("securities_first");
    expect(heroLifetimeMode(undefined)).toBe("securities_first");
    expect(heroLifetimeMode(null)).toBe("securities_first");
  });
});

describe("computeHeroLifetimeContribution", () => {
  it("securities-first: sums buys, which is the bug this task exists for", () => {
    // The exact shape of a ledger built by the Trade Republic importer:
    // purchases only, no cash_in, because the money never passed through
    // this app. Before r1 the hero read totalContributed here and printed
    // "\u0110\u00e3 g\u00f3p 0,00 \u20ac / Y \u20ac".
    const result = computeHeroLifetimeContribution({
      trackInAppCash: false,
      transactions: [
        { type: "buy_vwce", amount: 100 },
        { type: "buy_vwce", amount: 100 },
        { type: "buy_security", amount: 50 },
      ],
    });

    expect(result.mode).toBe("securities_first");
    expect(result.amount).toBe(250);
    expect(result.countedRows).toBe(3);
  });

  it("securities-first: ignores cash_in so a double entry counts once", () => {
    // Same 100 \u20ac recorded twice: once as the deposit, once as the purchase.
    const result = computeHeroLifetimeContribution({
      trackInAppCash: false,
      transactions: [
        { type: "cash_in", amount: 100 },
        { type: "buy_vwce", amount: 100 },
      ],
    });

    expect(result.amount).toBe(100);
    expect(result.countedRows).toBe(1);
  });

  it("cash-first: sums cash_in only, matching totalContributed", () => {
    const result = computeHeroLifetimeContribution({
      trackInAppCash: true,
      transactions: [
        { type: "cash_in", amount: 100 },
        { type: "cash_in", amount: 120 },
        { type: "buy_vwce", amount: 100 },
      ],
    });

    expect(result.mode).toBe("cash_first");
    expect(result.amount).toBe(220);
    expect(result.countedRows).toBe(2);
  });

  it("keeps the two mode type sets disjoint", () => {
    // This is the double-count guard itself, asserted directly: no ledger
    // row can ever be eligible under both modes at once.
    const overlap = CASH_FIRST_CONTRIBUTION_TYPES.filter((type) =>
      SECURITIES_FIRST_CONTRIBUTION_TYPES.includes(type),
    );
    expect(overlap).toEqual([]);
  });

  it("skips soft-deleted rows, like the streak engine does", () => {
    const result = computeHeroLifetimeContribution({
      trackInAppCash: false,
      transactions: [
        { type: "buy_vwce", amount: 100 },
        { type: "buy_vwce", amount: 999, deletedAt: "2026-08-01T00:00:00.000Z" },
      ],
    });

    expect(result.amount).toBe(100);
  });

  it("never returns NaN when a row carries a corrupt amount", () => {
    const result = computeHeroLifetimeContribution({
      trackInAppCash: false,
      transactions: [
        { type: "buy_vwce", amount: Number.NaN },
        { type: "buy_vwce", amount: Number.POSITIVE_INFINITY },
        { type: "buy_vwce", amount: -30 },
        { type: "buy_vwce", amount: 0 },
        { type: "buy_vwce", amount: 100 },
      ],
    });

    expect(Number.isFinite(result.amount)).toBe(true);
    expect(result.amount).toBe(100);
  });

  it("returns 0 for an empty ledger without inventing a value", () => {
    expect(
      computeHeroLifetimeContribution({ trackInAppCash: false, transactions: [] }).amount,
    ).toBe(0);
    expect(
      computeHeroLifetimeContribution({ trackInAppCash: true, transactions: [] }).amount,
    ).toBe(0);
  });

  it("ignores ledger types that are not contributions", () => {
    const result = computeHeroLifetimeContribution({
      trackInAppCash: false,
      transactions: [
        { type: "sell_security", amount: 500 },
        { type: "cash_out", amount: 200 },
        { type: "fee", amount: 1 },
        { type: "buy_vwce", amount: 100 },
      ],
    });

    expect(result.amount).toBe(100);
  });
});
