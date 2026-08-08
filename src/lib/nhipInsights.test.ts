import { describe, expect, it } from "vitest";
import {
  buildNhipInsightInput,
  buildNhipInsights,
  isLedgerEmpty,
  type NhipInsightInput,
} from "./nhipInsights";
import { buildTodayCenterPortfolioSnapshot } from "./todayCenterAdapter";
import { VWCE_ISIN, type Quote, type Transaction } from "./types";

// All dates are fixed so the suite is fully deterministic.
const NOW = "2026-08-07T12:00:00.000Z";
const FAR_END = "2042-09-01";   // 5900+ days away — NOT within 365
const NEAR_END = "2026-09-01";  // ~25 days from NOW — within 365
const PAST_END = "2026-01-01";  // already past
const STALE_ASOF = "2026-07-25"; // 13 days before NOW  (> STALE_DAYS = 7)
const FRESH_ASOF = "2026-08-06"; // 1 day before NOW   (< STALE_DAYS)
const RECENT_DATE = "2026-07-25"; // 13 days before NOW — within 35-day window
const OLD_DATE = "2026-06-01";    // 67 days before NOW — outside window

function base(): NhipInsightInput {
  return {
    portfolioEmpty: false,
    vwceAsOf: FRESH_ASOF,
    planEndDate: FAR_END,
    transactions: [],
    now: NOW,
  };
}

describe("buildNhipInsights", () => {
  it("returns empty_start alone when portfolio is empty", () => {
    const r = buildNhipInsights({ ...base(), portfolioEmpty: true });
    expect(r.insights).toHaveLength(1);
    expect(r.insights[0].kind).toBe("empty_start");
  });

  it("empty_start suppresses all other insights even when price is stale", () => {
    const r = buildNhipInsights({
      ...base(),
      portfolioEmpty: true,
      vwceAsOf: STALE_ASOF,
      planEndDate: NEAR_END,
    });
    expect(r.insights).toHaveLength(1);
    expect(r.insights[0].kind).toBe("empty_start");
  });

  it("stale_price fires when asOf is older than STALE_DAYS", () => {
    const r = buildNhipInsights({ ...base(), vwceAsOf: STALE_ASOF });
    expect(r.insights.some((i) => i.kind === "stale_price")).toBe(true);
  });

  it("stale_price does not fire when asOf is within STALE_DAYS", () => {
    const r = buildNhipInsights({ ...base(), vwceAsOf: FRESH_ASOF });
    expect(r.insights.some((i) => i.kind === "stale_price")).toBe(false);
  });

  it("stale_price does not fire when vwceAsOf is null", () => {
    const r = buildNhipInsights({ ...base(), vwceAsOf: null });
    expect(r.insights.some((i) => i.kind === "stale_price")).toBe(false);
  });

  it("days_to_goal fires when plan end is within 365 days", () => {
    const r = buildNhipInsights({ ...base(), planEndDate: NEAR_END });
    expect(r.insights.some((i) => i.kind === "days_to_goal")).toBe(true);
  });

  it("days_to_goal does not fire when plan end is more than 365 days away", () => {
    const r = buildNhipInsights({ ...base(), planEndDate: FAR_END });
    expect(r.insights.some((i) => i.kind === "days_to_goal")).toBe(false);
  });

  it("days_to_goal does not fire when plan end is in the past", () => {
    const r = buildNhipInsights({ ...base(), planEndDate: PAST_END });
    expect(r.insights.some((i) => i.kind === "days_to_goal")).toBe(false);
  });

  it("on_track fires when there are recent contribution transactions", () => {
    const r = buildNhipInsights({
      ...base(),
      transactions: [
        { date: RECENT_DATE, type: "cash_in", amount: 100, deletedAt: undefined },
        { date: RECENT_DATE, type: "buy_vwce", amount: 100, deletedAt: undefined },
      ],
    });
    expect(r.insights.some((i) => i.kind === "on_track")).toBe(true);
  });

  it("contribution_rhythm fires when the only transactions are outside the window", () => {
    const r = buildNhipInsights({
      ...base(),
      transactions: [{ date: OLD_DATE, type: "cash_in", amount: 100, deletedAt: undefined }],
    });
    expect(r.insights.some((i) => i.kind === "contribution_rhythm")).toBe(true);
  });

  it("soft-deleted transactions are excluded from rhythm count", () => {
    const r = buildNhipInsights({
      ...base(),
      transactions: [
        { date: RECENT_DATE, type: "cash_in", amount: 100, deletedAt: "2026-08-01T00:00:00.000Z" },
      ],
    });
    expect(r.insights.some((i) => i.kind === "contribution_rhythm")).toBe(true);
  });

  it("non-contribution tx types (fee, tax) are excluded from rhythm count", () => {
    const r = buildNhipInsights({
      ...base(),
      transactions: [
        { date: RECENT_DATE, type: "fee", amount: 5, deletedAt: undefined },
        { date: RECENT_DATE, type: "tax", amount: 3, deletedAt: undefined },
      ],
    });
    expect(r.insights.some((i) => i.kind === "contribution_rhythm")).toBe(true);
  });

  it("never returns more than 3 insights", () => {
    const r = buildNhipInsights({
      ...base(),
      vwceAsOf: STALE_ASOF,
      planEndDate: NEAR_END,
      transactions: [],
    });
    expect(r.insights.length).toBeLessThanOrEqual(3);
  });

  it("all insight texts are non-empty strings", () => {
    const r = buildNhipInsights({ ...base(), vwceAsOf: STALE_ASOF });
    for (const insight of r.insights) {
      expect(typeof insight.text).toBe("string");
      expect(insight.text.length).toBeGreaterThan(0);
    }
  });

  it("same input always produces the same output (deterministic)", () => {
    const input = base();
    expect(buildNhipInsights(input)).toEqual(buildNhipInsights(input));
  });
});

// NHIP-UI-001 r1 — the wire itself. An all-zero snapshot is built through the
// real adapter so these tests never hard-code calc internals.
const zeroSnapshot = buildTodayCenterPortfolioSnapshot({ transactions: [], quotes: [] });

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    date: RECENT_DATE,
    type: "cash_in",
    amount: 100,
    notes: "",
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    ...overrides,
  };
}

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: "quote-1",
    instrumentIsin: VWCE_ISIN,
    currency: "EUR",
    price: 168.38,
    asOf: FRESH_ASOF,
    source: "auto",
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("isLedgerEmpty", () => {
  it("is true when nothing was recorded and the numbers are zero", () => {
    expect(isLedgerEmpty({ transactions: [], totalValue: 0, totalQuantity: 0 })).toBe(true);
  });

  it("is false when an active transaction exists even if the numbers net to zero", () => {
    expect(isLedgerEmpty({ transactions: [tx()], totalValue: 0, totalQuantity: 0 })).toBe(false);
  });

  it("ignores soft-deleted transactions", () => {
    expect(
      isLedgerEmpty({
        transactions: [tx({ deletedAt: "2026-08-01T00:00:00.000Z" })],
        totalValue: 0,
        totalQuantity: 0,
      }),
    ).toBe(true);
  });

  it("is false while value or quantity is still held", () => {
    expect(isLedgerEmpty({ transactions: [], totalValue: 120, totalQuantity: 0 })).toBe(false);
    expect(isLedgerEmpty({ transactions: [], totalValue: 0, totalQuantity: 0.5 })).toBe(false);
  });
});

describe("buildNhipInsightInput", () => {
  it("never claims an empty start for a ledger that has activity", () => {
    const input = buildNhipInsightInput(zeroSnapshot, [tx()], { endDate: FAR_END }, NOW);
    expect(input.portfolioEmpty).toBe(false);
    expect(buildNhipInsights(input).insights.some((i) => i.kind === "empty_start")).toBe(false);
  });

  it("claims an empty start only for an untouched ledger", () => {
    const input = buildNhipInsightInput(zeroSnapshot, [], { endDate: FAR_END }, NOW);
    expect(input.portfolioEmpty).toBe(true);
    expect(buildNhipInsights(input).insights[0].kind).toBe("empty_start");
  });

  it("passes the quote date through so stale_price can fire", () => {
    const snapshot = { ...zeroSnapshot, vwceQuote: quote({ asOf: STALE_ASOF }) };
    const input = buildNhipInsightInput(snapshot, [tx()], { endDate: FAR_END }, NOW);
    expect(input.vwceAsOf).toBe(STALE_ASOF);
    expect(buildNhipInsights(input).insights.some((i) => i.kind === "stale_price")).toBe(true);
  });

  it("reports a null quote date when no quote is effective", () => {
    const input = buildNhipInsightInput(zeroSnapshot, [tx()], { endDate: FAR_END }, NOW);
    expect(input.vwceAsOf).toBeNull();
  });

  it("reads the plan end date straight from settings", () => {
    const input = buildNhipInsightInput(zeroSnapshot, [tx()], { endDate: NEAR_END }, NOW);
    expect(input.planEndDate).toBe(NEAR_END);
    expect(buildNhipInsights(input).insights.some((i) => i.kind === "days_to_goal")).toBe(true);
  });
});
