import { describe, expect, it } from "vitest";
import { buildTodayCenterPortfolioSnapshot } from "./todayCenterAdapter";
import { VWCE_ISIN, type Quote, type Transaction, type TxType } from "./types";

const now = "2026-08-05T08:00:00.000Z";

function transaction(
  id: string,
  type: TxType,
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    date: "2026-08-05",
    type,
    amount,
    notes: "",
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

function quote(
  id: string,
  instrumentIsin: string,
  price: number,
  source: "manual" | "auto" = "auto",
  extra: Partial<Quote> = {},
): Quote {
  return {
    id,
    instrumentIsin,
    currency: "EUR",
    price,
    source,
    asOf: "2026-08-05",
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

describe("buildTodayCenterPortfolioSnapshot", () => {
  it("returns a complete empty snapshot", () => {
    const result = buildTodayCenterPortfolioSnapshot({ transactions: [], quotes: [] });
    expect(result.totalValue).toBe(0);
    expect(result.totalQuantity).toBe(0);
    expect(result.valueComplete).toBe(true);
    expect(result.vwcePriceSource).toBe("missing");
  });

  it("keeps a cash-only portfolio complete", () => {
    const result = buildTodayCenterPortfolioSnapshot({
      transactions: [transaction("cash", "cash_in", 500)],
      quotes: [],
    });
    expect(result.totalValue).toBe(500);
    expect(result.market.cash).toBe(500);
    expect(result.market.missingIsins).toEqual([]);
  });

  it("aggregates multiple ISIN holdings from the transaction ledger", () => {
    const isinA = "IE00B4L5Y983";
    const isinB = "IE00B3RBWM25";
    const result = buildTodayCenterPortfolioSnapshot({
      transactions: [
        transaction("cash", "cash_in", 1_000),
        transaction("buy-a", "buy_security", 200, { instrumentIsin: isinA, quantity: 2 }),
        transaction("buy-b", "buy_security", 300, { instrumentIsin: isinB, quantity: 3 }),
      ],
      quotes: [quote("a", isinA, 110), quote("b", isinB, 90)],
    });

    expect(result.totalQuantity).toBe(5);
    expect(result.market.securities).toBe(490);
    expect(result.market.cash).toBe(500);
    expect(result.totalValue).toBe(990);
    expect(result.valueComplete).toBe(true);
  });

  it("reports missing prices instead of valuing the position at zero", () => {
    const isin = "IE00B4L5Y983";
    const result = buildTodayCenterPortfolioSnapshot({
      transactions: [
        transaction("cash", "cash_in", 200),
        transaction("buy", "buy_security", 100, { instrumentIsin: isin, quantity: 1 }),
      ],
      quotes: [],
    });

    expect(result.totalQuantity).toBe(1);
    expect(result.market.cash).toBe(100);
    expect(result.market.securities).toBe(0);
    expect(result.market.byIsin[isin].value).toBeNull();
    expect(result.market.missingIsins).toEqual([isin]);
    expect(result.valueComplete).toBe(false);
  });

  it("preserves the legacy VWCE price fallback", () => {
    const result = buildTodayCenterPortfolioSnapshot({
      transactions: [
        transaction("cash", "cash_in", 100),
        transaction("buy", "buy_vwce", 100, { quantity: 1 }),
      ],
      quotes: [],
      legacyVwcePrice: 123,
    });

    expect(result.vwcePrice).toBe(123);
    expect(result.vwcePriceSource).toBe("legacy_quote");
    expect(result.totalValue).toBe(123);
  });

  it("uses the same effective quote for price and provenance", () => {
    const result = buildTodayCenterPortfolioSnapshot({
      transactions: [
        transaction("cash", "cash_in", 100),
        transaction("buy", "buy_vwce", 100, { quantity: 1 }),
      ],
      quotes: [
        quote("old", VWCE_ISIN, 120, "auto"),
        quote("effective", VWCE_ISIN, 130, "manual"),
      ],
      legacyVwcePrice: 999,
    });

    expect(result.vwcePrice).toBe(130);
    expect(result.vwceQuote?.id).toBe("effective");
    expect(result.vwcePriceSource).toBe("manual_quote");
    expect(result.provenance.vwcePrice).toBe("manual_quote");
  });

  it("ignores invalid, non-EUR and deleted inputs safely", () => {
    const deleted = transaction("deleted", "cash_in", 999, { deletedAt: now });
    const result = buildTodayCenterPortfolioSnapshot({
      transactions: [deleted],
      quotes: [
        quote("invalid", VWCE_ISIN, Number.NaN),
        quote("usd", VWCE_ISIN, 200, "auto", { currency: "USD" }),
      ],
      legacyVwcePrice: Number.NaN,
    });

    expect(result.totalValue).toBe(0);
    expect(result.vwcePrice).toBe(0);
    expect(result.valueComplete).toBe(true);
  });
});
