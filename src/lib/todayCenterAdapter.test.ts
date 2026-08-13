import { describe, expect, it } from "vitest";
import {
  buildTodayCenterPortfolioSnapshot,
  type TodayCenterPortfolioInput,
} from "./todayCenterAdapter";
import { VWCE_ISIN, type Quote, type Transaction, type TxType } from "./types";

const NOW = "2026-08-05T08:00:00.000Z";
const NOW_DATE = "2026-08-05";

function transaction(
  id: string,
  type: TxType,
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    date: NOW_DATE,
    type,
    amount,
    notes: "",
    createdAt: NOW,
    updatedAt: NOW,
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
    asOf: NOW_DATE,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

function build(input: Omit<TodayCenterPortfolioInput, "nowDate"> & { nowDate?: string }) {
  return buildTodayCenterPortfolioSnapshot({ nowDate: NOW_DATE, ...input });
}

describe("buildTodayCenterPortfolioSnapshot", () => {
  it("returns a complete empty snapshot", () => {
    const result = build({ transactions: [], quotes: [] });
    expect(result.totalValue).toBe(0);
    expect(result.totalQuantity).toBe(0);
    expect(result.valueComplete).toBe(true);
    expect(result.priceStatusByIsin).toEqual({});
    expect(result.valuationStatus).toBe("fresh");
    expect(result.pulseEligible).toBe(true);
    expect(result.stalePriceIsins).toEqual([]);
    expect(result.vwcePriceSource).toBe("missing");
  });

  it("keeps a cash-only portfolio complete", () => {
    const result = build({
      transactions: [transaction("cash", "cash_in", 500)],
      quotes: [],
    });
    expect(result.totalValue).toBe(500);
    expect(result.market.cash).toBe(500);
    expect(result.market.missingIsins).toEqual([]);
    expect(result.pulseEligible).toBe(true);
  });

  it("aggregates multiple ISIN holdings from the transaction ledger", () => {
    const isinA = "IE00B4L5Y983";
    const isinB = "IE00B3RBWM25";
    const result = build({
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
    expect(result.priceStatusByIsin).toEqual({ [isinA]: "fresh", [isinB]: "fresh" });
    expect(result.valuationStatus).toBe("fresh");
    expect(result.pulseEligible).toBe(true);
  });

  it("reports missing prices instead of valuing the position at zero", () => {
    const isin = "IE00B4L5Y983";
    const result = build({
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
    expect(result.priceStatusByIsin).toEqual({ [isin]: "missing" });
    expect(result.valuationStatus).toBe("missing");
    expect(result.pulseEligible).toBe(false);
  });

  it("uses a dated legacy VWCE fallback", () => {
    const result = build({
      transactions: [
        transaction("cash", "cash_in", 100),
        transaction("buy", "buy_vwce", 100, { quantity: 1 }),
      ],
      quotes: [],
      legacyVwcePrice: 123,
      legacyVwcePriceAsOf: "2026-08-01",
    });

    expect(result.vwcePrice).toBe(123);
    expect(result.vwceAsOf).toBe("2026-08-01");
    expect(result.vwceAgeDays).toBe(4);
    expect(result.vwcePriceSource).toBe("legacy_quote");
    expect(result.totalValue).toBe(123);
    expect(result.priceStatusByIsin[VWCE_ISIN]).toBe("fresh");
    expect(result.pulseEligible).toBe(true);
  });

  it("rejects a legacy fallback with a missing, malformed or future date", () => {
    for (const legacyVwcePriceAsOf of [undefined, "not-a-date", "2026-08-06"]) {
      const result = build({
        transactions: [transaction("buy", "buy_vwce", 100, { quantity: 1 })],
        quotes: [],
        legacyVwcePrice: 123,
        legacyVwcePriceAsOf,
      });
      expect(result.vwcePrice).toBe(0);
      expect(result.vwcePriceSource).toBe("missing");
      expect(result.market.missingIsins).toEqual([VWCE_ISIN]);
      expect(result.valuationStatus).toBe("missing");
      expect(result.pulseEligible).toBe(false);
    }
  });

  it("keeps stale auto valuation visible and excludes it from Pulse", () => {
    const result = build({
      transactions: [transaction("buy", "buy_vwce", 100, { quantity: 1 })],
      quotes: [quote("stale-auto", VWCE_ISIN, 150, "auto", { asOf: "2026-07-01" })],
    });

    expect(result.totalValue).toBe(50);
    expect(result.valueComplete).toBe(true);
    expect(result.stalePriceIsins).toEqual([VWCE_ISIN]);
    expect(result.priceStatusByIsin[VWCE_ISIN]).toBe("stale");
    expect(result.valuationStatus).toBe("stale");
    expect(result.pulseEligible).toBe(false);
    expect(result.vwceAgeDays).toBe(35);
    expect(result.vwcePriceSource).toBe("auto_quote");
  });

  it("keeps an explicitly selected old manual valuation Pulse-eligible", () => {
    const result = build({
      transactions: [transaction("buy", "buy_vwce", 100, { quantity: 1 })],
      quotes: [quote("old-manual", VWCE_ISIN, 150, "manual", { asOf: "2020-01-01" })],
    });

    expect(result.totalValue).toBe(50);
    expect(result.stalePriceIsins).toEqual([]);
    expect(result.priceStatusByIsin[VWCE_ISIN]).toBe("manual");
    expect(result.valuationStatus).toBe("fresh");
    expect(result.pulseEligible).toBe(true);
    expect(result.vwcePriceSource).toBe("manual_quote");
  });

  it("marks an old legacy fallback stale when it values a held position", () => {
    const result = build({
      transactions: [transaction("buy", "buy_vwce", 100, { quantity: 1 })],
      quotes: [],
      legacyVwcePrice: 123,
      legacyVwcePriceAsOf: "2026-07-01",
    });
    expect(result.vwcePriceSource).toBe("legacy_quote");
    expect(result.stalePriceIsins).toEqual([VWCE_ISIN]);
    expect(result.priceStatusByIsin[VWCE_ISIN]).toBe("stale");
    expect(result.pulseEligible).toBe(false);
  });

  it("classifies every held ISIN independently", () => {
    const freshIsin = "IE00B4L5Y983";
    const manualIsin = "IE00B3RBWM25";
    const staleIsin = "IE00BK5BQT80";
    const missingIsin = "IE00B6R52259";
    const result = build({
      transactions: [
        transaction("fresh", "buy_security", 10, { instrumentIsin: freshIsin, quantity: 1 }),
        transaction("manual", "buy_security", 10, { instrumentIsin: manualIsin, quantity: 1 }),
        transaction("stale", "buy_security", 10, { instrumentIsin: staleIsin, quantity: 1 }),
        transaction("missing", "buy_security", 10, { instrumentIsin: missingIsin, quantity: 1 }),
      ],
      quotes: [
        quote("fresh", freshIsin, 11),
        quote("manual", manualIsin, 12, "manual", { asOf: "2020-01-01" }),
        quote("stale", staleIsin, 13, "auto", { asOf: "2026-07-01" }),
      ],
    });

    expect(result.priceStatusByIsin).toEqual({
      [manualIsin]: "manual",
      [freshIsin]: "fresh",
      [missingIsin]: "missing",
      [staleIsin]: "stale",
    });
    expect(result.valuationStatus).toBe("missing");
    expect(result.pulseEligible).toBe(false);
  });

  it("rejects malformed and future effective quote dates", () => {
    for (const asOf of ["2026-02-30", "not-a-date", "2026-08-06"]) {
      const result = build({
        transactions: [transaction("buy", "buy_vwce", 100, { quantity: 1 })],
        quotes: [quote(`bad-${asOf}`, VWCE_ISIN, 150, "auto", { asOf })],
      });
      expect(result.vwcePrice).toBe(0);
      expect(result.market.missingIsins).toEqual([VWCE_ISIN]);
      expect(result.valueComplete).toBe(false);
      expect(result.pulseEligible).toBe(false);
    }
  });

  it("fails closed when the valuation date is invalid", () => {
    const result = build({
      transactions: [transaction("buy", "buy_vwce", 100, { quantity: 1 })],
      quotes: [quote("fresh", VWCE_ISIN, 150)],
      legacyVwcePrice: 123,
      legacyVwcePriceAsOf: NOW_DATE,
      nowDate: "not-a-date",
    });
    expect(result.vwcePrice).toBe(0);
    expect(result.vwcePriceSource).toBe("missing");
    expect(result.market.missingIsins).toEqual([VWCE_ISIN]);
    expect(result.pulseEligible).toBe(false);
  });

  it("uses the same effective quote for price and provenance", () => {
    const result = build({
      transactions: [
        transaction("cash", "cash_in", 100),
        transaction("buy", "buy_vwce", 100, { quantity: 1 }),
      ],
      quotes: [
        quote("old", VWCE_ISIN, 120, "auto"),
        quote("effective", VWCE_ISIN, 130, "manual"),
      ],
      legacyVwcePrice: 999,
      legacyVwcePriceAsOf: NOW_DATE,
    });

    expect(result.vwcePrice).toBe(130);
    expect(result.vwceQuote?.id).toBe("effective");
    expect(result.vwcePriceSource).toBe("manual_quote");
    expect(result.provenance.vwcePrice).toBe("manual_quote");
  });

  it("ignores invalid, non-EUR and deleted inputs safely", () => {
    const deleted = transaction("deleted", "cash_in", 999, { deletedAt: NOW });
    const result = build({
      transactions: [deleted],
      quotes: [
        quote("invalid", VWCE_ISIN, Number.NaN),
        quote("usd", VWCE_ISIN, 200, "auto", { currency: "USD" }),
      ],
      legacyVwcePrice: Number.NaN,
      legacyVwcePriceAsOf: NOW_DATE,
    });

    expect(result.totalValue).toBe(0);
    expect(result.vwcePrice).toBe(0);
    expect(result.valueComplete).toBe(true);
    expect(result.pulseEligible).toBe(true);
  });
});
