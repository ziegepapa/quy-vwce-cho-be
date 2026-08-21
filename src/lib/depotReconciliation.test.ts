import { describe, expect, it } from "vitest";
import {
  buildDepotReconciliation,
  describeDepotReconciliation,
  formatUnits,
  replayLedgerQuantities,
  signedUnits,
  statementAgeDays,
  statementUnitPrice,
  type DepotReconciliationDisplay,
  type ReconciliationLedgerEntry,
} from "./depotReconciliation";
import type { DepotPosition } from "./types";
import { VWCE_ISIN } from "./types";

const OTHER_ISIN = "IE00B4L5Y983";
const MALFORMED_ISIN = "IE00BK5BQT81";
const STATEMENT_DATE = "2026-07-31";

function entry(overrides: Partial<ReconciliationLedgerEntry> = {}): ReconciliationLedgerEntry {
  return {
    date: "2026-07-01",
    type: "buy_security",
    amount: 100,
    quantity: 2,
    unitPrice: 50,
    instrumentIsin: VWCE_ISIN,
    ...overrides,
  };
}

/** A buy whose quantity must be derived exactly the way the ledger derives it. */
function derivedBuy(overrides: Partial<ReconciliationLedgerEntry> = {}): ReconciliationLedgerEntry {
  return {
    date: "2026-07-01",
    type: "buy_security",
    amount: 100,
    unitPrice: 50,
    instrumentIsin: VWCE_ISIN,
    ...overrides,
  };
}

function position(overrides: Partial<DepotPosition> = {}): DepotPosition {
  return {
    instrumentIsin: VWCE_ISIN,
    quantity: 2,
    unitPrice: 50,
    currency: "EUR",
    ...overrides,
  };
}

function build(
  positions: DepotPosition[],
  transactions: ReconciliationLedgerEntry[],
  today = STATEMENT_DATE,
): DepotReconciliationDisplay {
  return buildDepotReconciliation({
    statement: { date: STATEMENT_DATE, positions },
    transactions,
    today,
  });
}

describe("buildDepotReconciliation", () => {
  it("says there is no statement instead of pretending everything matches", () => {
    const display = buildDepotReconciliation({ transactions: [entry()] });
    expect(display.status).toBe("no_statement");
    expect(display.lines).toHaveLength(0);
    expect(display.ageDays).toBeNull();
    expect(describeDepotReconciliation(display).headline).toBe("Chưa có sao kê");
  });

  it("treats a statement without positions as no statement", () => {
    const display = buildDepotReconciliation({
      statement: { date: STATEMENT_DATE, positions: [] },
      transactions: [entry()],
    });
    expect(display.status).toBe("no_statement");
  });

  it("reports a match with the statement date and its age", () => {
    const display = build([position()], [entry()]);
    expect(display.status).toBe("all_match");
    expect(display.lines[0].status).toBe("match");
    expect(display.lines[0].quantityGap).toBe(0);
    const copy = describeDepotReconciliation(display);
    expect(copy.headline).toBe("Khớp 1/1 mã");
    expect(copy.dateLabel).toBe("Sao kê 31/07/2026 · hôm nay");
    expect(copy.detail).toBeNull();
  });

  it("states the gap in units and in money at the statement price", () => {
    const display = build([position({ quantity: 3 })], [entry()]);
    expect(display.status).toBe("has_gap");
    expect(display.lines[0].quantityGap).toBe(1);
    expect(display.lines[0].moneyGap).toBe(50);
    expect(display.totalMoneyGap).toBe(50);
    expect(display.moneyGapComplete).toBe(true);
    const copy = describeDepotReconciliation(display);
    expect(copy.headline).toBe("1 mã lệch");
    expect(copy.detail).toContain("lệch +1 đơn vị");
  });

  it("names an instrument the statement holds and the ledger does not", () => {
    const display = build([position({ instrumentIsin: OTHER_ISIN, quantity: 5, unitPrice: 10 })], []);
    expect(display.lines[0].status).toBe("missing_in_ledger");
    expect(display.lines[0].ledgerQuantity).toBe(0);
    expect(describeDepotReconciliation(display).detail).toContain("sổ chưa có mã này");
  });

  it("names an instrument the ledger holds and the statement does not", () => {
    const display = build(
      [position({ instrumentIsin: OTHER_ISIN, quantity: 1, unitPrice: 10 })],
      [entry()],
    );
    expect(display.lines).toHaveLength(2);
    expect(display.lines[0].instrumentIsin).toBe(OTHER_ISIN);
    expect(display.lines[1].instrumentIsin).toBe(VWCE_ISIN);
    expect(display.lines[1].status).toBe("missing_on_statement");
    expect(display.lines[1].quantityGap).toBe(-2);
    expect(describeDepotReconciliation(display).detail).toContain("sao kê không liệt kê mã này");
  });

  it("never counts a buy the ledger itself refuses because the ISIN is malformed", () => {
    const display = build([position()], [entry({ instrumentIsin: MALFORMED_ISIN })]);
    expect(display.admission.ignoredInvalidIsin).toBe(1);
    expect(display.admission.counted).toBe(0);
    expect(display.lines[0].ledgerQuantity).toBe(0);
    expect(display.lines[0].status).toBe("missing_in_ledger");
    expect(describeDepotReconciliation(display).detail).toContain(
      "bỏ qua 1 bút toán chứng khoán thiếu hoặc sai ISIN",
    );
  });

  it("skips a soft-deleted entry and says so is not needed for the count", () => {
    const display = build([position()], [entry({ deletedAt: "2026-07-02T00:00:00.000Z" })]);
    expect(display.admission.skippedDeleted).toBe(1);
    expect(display.lines[0].ledgerQuantity).toBe(0);
  });

  it("excludes entries dated after the statement and names how many", () => {
    const display = build([position()], [entry({ date: "2026-08-05" })]);
    expect(display.admission.skippedAfterStatement).toBe(1);
    expect(display.lines[0].ledgerQuantity).toBe(0);
    expect(describeDepotReconciliation(display).detail).toContain(
      "1 bút toán sau ngày sao kê chưa được tính",
    );
  });

  it("lets a sell reduce the ledger quantity", () => {
    const display = build(
      [position()],
      [
        entry({ quantity: 3, amount: 150 }),
        entry({ type: "sell_security", quantity: 1, amount: 60, date: "2026-07-10" }),
      ],
    );
    expect(display.status).toBe("all_match");
    expect(display.lines[0].ledgerQuantity).toBe(2);
  });

  it("quarantines an oversell so reconciliation retains the accepted holding", () => {
    const display = build(
      [position({ quantity: 1 })],
      [
        entry({ quantity: 1, amount: 50 }),
        entry({ type: "sell_security", quantity: 5, amount: 250, date: "2026-07-10" }),
      ],
    );
    expect(display.lines[0].ledgerQuantity).toBe(1);
    expect(display.lines[0].status).toBe("match");
  });

  it("derives a missing quantity from amount and unit price like the ledger does", () => {
    const display = build([position()], [derivedBuy()]);
    expect(display.status).toBe("all_match");
    expect(display.lines[0].ledgerQuantity).toBe(2);
  });

  it("subtracts fees before deriving the quantity, like the ledger does", () => {
    const display = build([position()], [derivedBuy({ amount: 100, fee: 10, unitPrice: 45 })]);
    expect(display.status).toBe("all_match");
    expect(display.lines[0].ledgerQuantity).toBe(2);
  });

  it("counts a buy that fees ate down to nothing instead of hiding it", () => {
    const display = build([position()], [derivedBuy({ amount: 10, fee: 10 })]);
    expect(display.admission.zeroQuantityBuys).toBe(1);
    expect(display.lines[0].ledgerQuantity).toBe(0);
    expect(describeDepotReconciliation(display).detail).toContain(
      "1 lệnh mua không ra đơn vị nào",
    );
  });

  it("resolves the legacy VWCE alias without an explicit ISIN", () => {
    const display = build(
      [position()],
      [{ date: "2026-07-01", type: "buy_vwce", amount: 100, quantity: 2, unitPrice: 50 }],
    );
    expect(display.status).toBe("all_match");
    expect(display.lines[0].ledgerQuantity).toBe(2);
  });

  it("treats a difference below tolerance as a match", () => {
    const display = build([position({ quantity: 2.0000005 })], [entry()]);
    expect(display.status).toBe("all_match");
  });

  it("leaves the money gap empty when the statement prints no price", () => {
    const display = build([{ instrumentIsin: VWCE_ISIN, quantity: 3, currency: "EUR" }], [entry()]);
    expect(display.lines[0].statementUnitPrice).toBeNull();
    expect(display.lines[0].moneyGap).toBeNull();
    expect(display.totalMoneyGap).toBeNull();
    expect(display.moneyGapComplete).toBe(false);
  });

  it("derives the statement price from the statement total when needed", () => {
    const display = build(
      [{ instrumentIsin: VWCE_ISIN, quantity: 4, marketValue: 400, currency: "EUR" }],
      [entry()],
    );
    expect(display.lines[0].statementUnitPrice).toBe(100);
    expect(display.lines[0].moneyGap).toBe(200);
  });

  it("marks the money gap incomplete when one gap line has no price", () => {
    const display = build(
      [
        position({ quantity: 3 }),
        { instrumentIsin: OTHER_ISIN, quantity: 5, currency: "EUR" },
      ],
      [entry()],
    );
    expect(display.gapLines).toHaveLength(2);
    expect(display.totalMoneyGap).toBe(50);
    expect(display.moneyGapComplete).toBe(false);
  });

  it("sorts lines by ISIN so the order never wanders", () => {
    const display = build(
      [position({ instrumentIsin: OTHER_ISIN, quantity: 1, unitPrice: 10 }), position()],
      [entry()],
    );
    expect(display.lines.map((line) => line.instrumentIsin)).toEqual([OTHER_ISIN, VWCE_ISIN]);
  });

  it("sums duplicated statement positions for the same ISIN", () => {
    const display = build([position({ quantity: 1 }), position({ quantity: 1 })], [entry()]);
    expect(display.lines).toHaveLength(1);
    expect(display.lines[0].statementQuantity).toBe(2);
    expect(display.status).toBe("all_match");
  });

  it("always produces a sentence, whatever the status is", () => {
    const displays = [
      buildDepotReconciliation({ transactions: [] }),
      build([position()], [entry()], "2026-08-01"),
      build([position({ quantity: 9 })], [entry()], "2026-08-07"),
    ];
    for (const display of displays) {
      const copy = describeDepotReconciliation(display);
      expect(copy.headline.length).toBeGreaterThan(0);
      expect(copy.dateLabel ?? copy.detail).toBeTruthy();
    }
  });
});

describe("statement age and formatting", () => {
  it("counts whole days and never goes negative", () => {
    expect(statementAgeDays("2026-07-31", "2026-08-07")).toBe(7);
    expect(statementAgeDays("2026-07-31", "2026-07-31")).toBe(0);
    expect(statementAgeDays("2026-08-10", "2026-08-07")).toBe(0);
  });

  it("says yesterday and days ago in Vietnamese", () => {
    expect(describeDepotReconciliation(build([position()], [entry()], "2026-08-01")).dateLabel).toBe(
      "Sao kê 31/07/2026 · hôm qua",
    );
    expect(describeDepotReconciliation(build([position()], [entry()], "2026-08-07")).dateLabel).toBe(
      "Sao kê 31/07/2026 · 7 ngày trước",
    );
  });

  it("formats units with a Vietnamese decimal comma and no trailing zeros", () => {
    expect(formatUnits(2)).toBe("2");
    expect(formatUnits(0.6049)).toBe("0,6049");
    expect(formatUnits(1234.5)).toBe("1234,5");
    expect(signedUnits(1)).toBe("+1");
    expect(signedUnits(-0.5)).toBe("−0,5");
    expect(signedUnits(0)).toBe("0");
  });

  it("refuses a zero or negative statement price", () => {
    expect(statementUnitPrice({ instrumentIsin: VWCE_ISIN, quantity: 2, unitPrice: 0, currency: "EUR" })).toBeNull();
    expect(
      statementUnitPrice({
        instrumentIsin: VWCE_ISIN,
        quantity: 2,
        marketValue: 0,
        currency: "EUR",
      }),
    ).toBeNull();
  });
});

describe("replayLedgerQuantities", () => {
  it("drops positions the replay left at zero", () => {
    const { quantities } = replayLedgerQuantities(
      [
        entry({ quantity: 2, amount: 100 }),
        entry({ type: "sell_security", quantity: 2, amount: 110, date: "2026-07-20" }),
      ],
      STATEMENT_DATE,
    );
    expect(quantities[VWCE_ISIN]).toBeUndefined();
  });

  it("replays out-of-order entries in date order", () => {
    const { quantities, admission } = replayLedgerQuantities(
      [
        entry({ type: "sell_security", quantity: 1, amount: 60, date: "2026-07-20" }),
        entry({ quantity: 3, amount: 150, date: "2026-07-01" }),
      ],
      STATEMENT_DATE,
    );
    expect(quantities[VWCE_ISIN]).toBe(2);
    expect(admission.counted).toBe(2);
  });
});
