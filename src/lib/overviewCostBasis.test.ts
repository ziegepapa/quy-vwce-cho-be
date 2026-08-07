import { describe, expect, it } from "vitest";
import {
  buildCostBasisDisplay,
  describeCostBasis,
  describePnlSuppression,
  emptyCostBasisProvenance,
  summarizeCostBasisLedger,
  type CostBasisLedgerEntry,
} from "./overviewCostBasis";
import type { PnlSuppressedReason } from "./overviewNumbers";
import { VWCE_ISIN } from "./types";

/** A different real instrument, so the checksum guard accepts it. */
const OTHER_ISIN = "IE00B4L5Y983";

function buy(over: Partial<CostBasisLedgerEntry> = {}): CostBasisLedgerEntry {
  return { type: "buy_vwce", amount: 50, fee: 1, tax: 0, ...over };
}

function sell(over: Partial<CostBasisLedgerEntry> = {}): CostBasisLedgerEntry {
  return { type: "sell_vwce", amount: 40, fee: 1, tax: 0, ...over };
}

describe("summarizeCostBasisLedger", () => {
  it("counts every buy that added money to the cost basis", () => {
    const out = summarizeCostBasisLedger([buy(), buy({ amount: 30 })]);
    expect(out).toEqual({
      contributingBuys: 2,
      zeroValueBuys: 0,
      ignoredBuys: 0,
      sells: 0,
    });
  });

  it("resolves a legacy buy_vwce without an ISIN to VWCE", () => {
    const out = summarizeCostBasisLedger([buy({ instrumentIsin: undefined })]);
    expect(out.contributingBuys).toBe(1);
    expect(out.ignoredBuys).toBe(0);
  });

  it("counts an explicit buy_security for VWCE", () => {
    const out = summarizeCostBasisLedger([
      buy({ type: "buy_security", instrumentIsin: VWCE_ISIN }),
    ]);
    expect(out.contributingBuys).toBe(1);
  });

  it("leaves a buy for another instrument out of this ISIN", () => {
    const out = summarizeCostBasisLedger([
      buy({ type: "buy_security", instrumentIsin: OTHER_ISIN }),
    ]);
    expect(out).toEqual(emptyCostBasisProvenance());
  });

  it("counts a buy_security without an ISIN as ignored, mirroring the replay", () => {
    const out = summarizeCostBasisLedger([
      buy({ type: "buy_security", instrumentIsin: undefined }),
    ]);
    expect(out.ignoredBuys).toBe(1);
    expect(out.contributingBuys).toBe(0);
  });

  it("counts a malformed ISIN as ignored", () => {
    const out = summarizeCostBasisLedger([
      buy({ type: "buy_security", instrumentIsin: "IE00BK5BQT81" }),
    ]);
    expect(out.ignoredBuys).toBe(1);
    expect(out.contributingBuys).toBe(0);
  });

  it("skips soft deleted rows", () => {
    const out = summarizeCostBasisLedger([
      buy(),
      buy({ deletedAt: "2026-08-01T00:00:00.000Z" }),
    ]);
    expect(out.contributingBuys).toBe(1);
  });

  it("counts a buy with nothing left after fee and tax as zero value", () => {
    const out = summarizeCostBasisLedger([buy({ amount: 10, fee: 10 })]);
    expect(out.zeroValueBuys).toBe(1);
    expect(out.contributingBuys).toBe(0);
  });

  it("counts sells separately", () => {
    const out = summarizeCostBasisLedger([buy(), sell()]);
    expect(out.contributingBuys).toBe(1);
    expect(out.sells).toBe(1);
  });

  it("ignores cash and fee rows entirely", () => {
    const out = summarizeCostBasisLedger([
      { type: "cash_in", amount: 100 },
      { type: "fee", amount: 5 },
      { type: "adjust", amount: 1 },
    ]);
    expect(out).toEqual(emptyCostBasisProvenance());
  });

  it("survives an empty or missing ledger", () => {
    expect(summarizeCostBasisLedger([])).toEqual(emptyCostBasisProvenance());
    expect(summarizeCostBasisLedger(null)).toEqual(emptyCostBasisProvenance());
  });
});

describe("buildCostBasisDisplay", () => {
  it("states no average cost without a position", () => {
    const display = buildCostBasisDisplay({ costBasis: 100, quantity: 0 });
    expect(display.status).toBe("no_position");
    expect(display.avgCost).toBeNull();
  });

  it("states no average cost when the ledger has no money behind the units", () => {
    const display = buildCostBasisDisplay({ costBasis: 0, quantity: 2 });
    expect(display.status).toBe("no_cost_basis");
    expect(display.avgCost).toBeNull();
  });

  it("divides only when both sides exist", () => {
    const display = buildCostBasisDisplay({ costBasis: 100, quantity: 2 });
    expect(display.status).toBe("stated");
    expect(display.avgCost).toBeCloseTo(50);
  });

  it("never returns a zero average cost as a stand-in", () => {
    const cases = [
      { costBasis: 0, quantity: 0 },
      { costBasis: 0, quantity: 2 },
      { costBasis: 100, quantity: 0 },
    ];
    for (const input of cases) {
      const display = buildCostBasisDisplay(input);
      const copy = describeCostBasis(display);
      expect(display.avgCost).toBeNull();
      expect(copy.value).toBeTruthy();
    }
  });
});

describe("describeCostBasis", () => {
  it("names how many buys built the number", () => {
    const display = buildCostBasisDisplay({
      costBasis: 100,
      quantity: 2,
      provenance: summarizeCostBasisLedger([buy(), buy({ amount: 30 })]),
    });
    const copy = describeCostBasis(display);
    expect(copy.value).toBeNull();
    expect(copy.provenance).toMatch(/2 lệnh mua/);
    expect(copy.provenance).toMatch(/phí và thuế/);
  });

  it("names the sells that reduced the cost basis", () => {
    const display = buildCostBasisDisplay({
      costBasis: 60,
      quantity: 1,
      provenance: summarizeCostBasisLedger([buy(), buy({ amount: 30 }), sell()]),
    });
    expect(describeCostBasis(display).provenance).toMatch(/1 lệnh bán/);
  });

  it("names buys the replay ignored", () => {
    const display = buildCostBasisDisplay({
      costBasis: 49,
      quantity: 1,
      provenance: summarizeCostBasisLedger([
        buy(),
        buy({ type: "buy_security", instrumentIsin: undefined }),
        buy({ type: "buy_security", instrumentIsin: undefined }),
      ]),
    });
    expect(describeCostBasis(display).provenance).toMatch(/2 lệnh mua thiếu hoặc sai ISIN/);
  });

  it("admits a cost basis that matches no buy at all", () => {
    const display = buildCostBasisDisplay({ costBasis: 100, quantity: 2 });
    expect(describeCostBasis(display).provenance).toMatch(/không khớp lệnh mua nào/);
  });

  it("explains a position that was sold out", () => {
    const display = buildCostBasisDisplay({
      costBasis: 0,
      quantity: 0,
      provenance: summarizeCostBasisLedger([buy(), sell()]),
    });
    const copy = describeCostBasis(display);
    expect(copy.value).toBe("Chưa giữ đơn vị nào");
    expect(copy.provenance).toMatch(/1 lệnh bán/);
  });
});

describe("describePnlSuppression", () => {
  it("gives every withheld reason a sentence", () => {
    const reasons: PnlSuppressedReason[] = [
      "no_position",
      "missing_price",
      "no_cost_basis",
    ];
    for (const reason of reasons) {
      const text = describePnlSuppression(reason);
      expect(typeof text).toBe("string");
      expect(text).toBeTruthy();
    }
  });

  it("says nothing when profit and loss is actually shown", () => {
    expect(describePnlSuppression(null)).toBeNull();
  });

  it("names how many instruments are missing a price", () => {
    expect(describePnlSuppression("missing_price", { missingPriceCount: 2 })).toMatch(/2 mã/);
  });
});
