import { describe, expect, it } from "vitest";
import { buildOverviewHero, type OverviewHeroInput } from "./overviewNumbers";
import {
  buildAllocationDisplay,
  describeAllocation,
  type AllocationInput,
} from "./overviewAllocation";

/** Buy recorded, matching cash_in missing: the reported production state. */
const partialPortfolio: OverviewHeroInput = {
  securitiesValue: 101.65,
  cashBalance: -100,
  missingPriceCount: 0,
  totalQuantity: 0.6049,
  costBasis: 100,
  positionValue: 101.65,
  transactionCount: 1,
};

const emptyPortfolio: OverviewHeroInput = {
  securitiesValue: 0,
  cashBalance: 0,
  missingPriceCount: 0,
  totalQuantity: 0,
  costBasis: 0,
  positionValue: null,
  transactionCount: 0,
};

/** The hero is the only allowed source of the denominator. */
function allocationOf(input: OverviewHeroInput) {
  return buildAllocationDisplay(buildOverviewHero(input));
}

describe("buildAllocationDisplay", () => {
  it("divides on the public denominator instead of hiding the ratio", () => {
    const display = allocationOf(partialPortfolio);

    expect(display.status).toBe("partial");
    expect(display.showBar).toBe(true);
    expect(display.denominator).toBeCloseTo(101.65, 2);
    expect(display.securitiesPct).toBe(100);
    expect(display.cashPct).toBe(0);
    expect(display.caveats).toEqual(["missing_funding"]);
  });

  it("splits a funded depot on the same denominator the hero shows", () => {
    const display = allocationOf({
      ...partialPortfolio,
      cashBalance: 100,
      transactionCount: 2,
    });

    expect(display.status).toBe("complete");
    expect(display.denominator).toBeCloseTo(201.65, 2);
    expect(display.securitiesPct).toBe(50);
    expect(display.cashPct).toBe(50);
    expect(display.caveats).toEqual([]);
  });

  it("keeps a small cash slice visible instead of rounding it away", () => {
    const display = allocationOf({
      ...partialPortfolio,
      securitiesValue: 10000,
      cashBalance: 1,
    });

    expect(display.securitiesPct).toBe(99);
    expect(display.cashPct).toBe(1);
  });

  it("keeps a small securities slice visible too", () => {
    const display = allocationOf({
      ...partialPortfolio,
      securitiesValue: 1,
      cashBalance: 10000,
    });

    expect(display.securitiesPct).toBe(1);
    expect(display.cashPct).toBe(99);
  });

  it("names missing prices as a separate caveat", () => {
    const display = allocationOf({
      ...partialPortfolio,
      securitiesValue: 50,
      cashBalance: 50,
      missingPriceCount: 1,
    });

    expect(display.status).toBe("partial");
    expect(display.caveats).toEqual(["missing_price"]);
    expect(display.securitiesPct).toBe(50);
  });

  it("reports both gaps when funding and a price are missing", () => {
    const display = allocationOf({
      ...partialPortfolio,
      securitiesValue: 50,
      cashBalance: -20,
      missingPriceCount: 2,
    });

    expect(display.caveats).toEqual(["missing_funding", "missing_price"]);
    expect(display.securitiesPct).toBe(100);
  });

  it("refuses to divide only when there is nothing to divide", () => {
    const display = allocationOf(emptyPortfolio);

    expect(display.status).toBe("unavailable");
    expect(display.showBar).toBe(false);
    expect(display.securitiesPct).toBe(0);
    expect(display.cashPct).toBe(0);
  });

  it("stays unavailable when the ledger holds nothing but a funding gap", () => {
    const display = allocationOf({
      ...partialPortfolio,
      securitiesValue: 0,
      positionValue: null,
      totalQuantity: 0,
    });

    expect(display.status).toBe("unavailable");
    expect(display.caveats).toEqual(["missing_funding"]);
  });

  it("survives invalid numbers from the ledger", () => {
    const rawInput: AllocationInput = {
      securitiesValue: Number.NaN,
      cashAsset: Number.NaN,
      cashShortfall: Number.NaN,
      missingPriceCount: Number.NaN,
    };
    const display = buildAllocationDisplay(rawInput);

    expect(display.status).toBe("unavailable");
    expect(display.denominator).toBe(0);
    expect(display.caveats).toEqual([]);
  });

  it("always adds up to 100 percent whenever the bar is shown", () => {
    const inputs: OverviewHeroInput[] = [
      partialPortfolio,
      { ...partialPortfolio, cashBalance: 100 },
      { ...partialPortfolio, securitiesValue: 10000, cashBalance: 1 },
      { ...partialPortfolio, securitiesValue: 1, cashBalance: 10000 },
      { ...partialPortfolio, securitiesValue: 33.33, cashBalance: 66.67 },
    ];

    for (const input of inputs) {
      const display = allocationOf(input);
      expect(display.showBar).toBe(true);
      expect(display.securitiesPct + display.cashPct).toBe(100);
    }
  });
});

describe("describeAllocation", () => {
  it("never states a bare 100% while a deposit is missing", () => {
    const copy = describeAllocation(allocationOf(partialPortfolio));

    expect(copy.securitiesLabel).toBe("Chứng khoán 100%");
    expect(copy.cashLabel).toBe("An toàn 0%");
    expect(copy.caveat).toBe("Tỉ lệ tính trên phần đã có — chưa gồm khoản nạp còn thiếu");
    expect(copy.ariaLabel).toContain("chưa gồm khoản nạp còn thiếu");
    expect(copy.unavailable).toBeNull();
  });

  it("never falls back to the r1 sentence while the bar is on screen", () => {
    const copy = describeAllocation(allocationOf(partialPortfolio));

    expect(copy.unavailable).toBeNull();
    expect(copy.caveat).not.toMatch(/chưa tính được/i);
  });

  it("drops the caveat once the ledger is consistent", () => {
    const copy = describeAllocation(
      allocationOf({ ...partialPortfolio, cashBalance: 100, transactionCount: 2 }),
    );

    expect(copy.caveat).toBeNull();
    expect(copy.ariaLabel).toBe("Chứng khoán 50%, An toàn 50%");
  });

  it("counts the instruments that are still missing a price", () => {
    const copy = describeAllocation(
      allocationOf({
        ...partialPortfolio,
        securitiesValue: 50,
        cashBalance: 50,
        missingPriceCount: 2,
      }),
    );

    expect(copy.caveat).toBe("Tỉ lệ tính trên phần đã có — chưa gồm 2 mã thiếu giá");
  });

  it("joins both gaps in one sentence", () => {
    const copy = describeAllocation(
      allocationOf({
        ...partialPortfolio,
        securitiesValue: 50,
        cashBalance: -20,
        missingPriceCount: 2,
      }),
    );

    expect(copy.caveat).toBe(
      "Tỉ lệ tính trên phần đã có — chưa gồm khoản nạp còn thiếu và 2 mã thiếu giá",
    );
  });

  it("keeps the honest sentence when the funding gap leaves nothing to divide", () => {
    const copy = describeAllocation(
      allocationOf({
        ...partialPortfolio,
        securitiesValue: 0,
        positionValue: null,
        totalQuantity: 0,
      }),
    );

    expect(copy.unavailable).toBe("Chưa tính được tỉ lệ — sổ còn thiếu bút toán nạp");
    expect(copy.caveat).toBeNull();
  });

  it("says there is no balance yet when the ledger is simply empty", () => {
    const copy = describeAllocation(allocationOf(emptyPortfolio));

    expect(copy.unavailable).toBe("Chưa có số dư để tính tỉ lệ");
  });
});
