import { describe, expect, it } from "vitest";
import {
  buildOverviewHero,
  buildPulseDisplay,
  shouldShowContributionNudge,
  type OverviewHeroInput,
} from "./overviewNumbers";

/**
 * Buy recorded, matching cash_in missing: the reported production state.
 * trackInAppCash is true here so every assertion below keeps its original
 * meaning, which is the double-entry ledger.
 */
const partialPortfolio: OverviewHeroInput = {
  securitiesValue: 101.65,
  cashBalance: -100,
  missingPriceCount: 0,
  totalQuantity: 0.6049,
  costBasis: 100,
  positionValue: 101.65,
  transactionCount: 1,
  trackInAppCash: true,
};

/** Same depot after the deposit is recorded. */
const fundedPortfolio: OverviewHeroInput = {
  ...partialPortfolio,
  cashBalance: 100,
  transactionCount: 2,
};

const emptyPortfolio: OverviewHeroInput = {
  securitiesValue: 0,
  cashBalance: 0,
  missingPriceCount: 0,
  totalQuantity: 0,
  costBasis: 0,
  positionValue: null,
  transactionCount: 0,
  trackInAppCash: false,
};

describe("buildOverviewHero", () => {
  it("never subtracts a missing deposit from the assets it reports", () => {
    const hero = buildOverviewHero(partialPortfolio);

    expect(hero.status).toBe("unfunded");
    expect(hero.assets).toBeCloseTo(101.65, 2);
    expect(hero.cashAsset).toBe(0);
    expect(hero.cashShortfall).toBeCloseTo(100, 2);
    expect(hero.setupIncomplete).toBe(true);
    // The old hero showed this number as "Tong tai san".
    expect(hero.ledgerNet).toBeCloseTo(1.65, 2);
  });

  it("reports profit and loss against the cost basis, not against a target", () => {
    const hero = buildOverviewHero(partialPortfolio);

    expect(hero.pnl).toBeCloseTo(1.65, 2);
    expect(hero.pnlPct).toBeCloseTo(1.65, 2);
    expect(hero.pnlSuppressedReason).toBeNull();
  });

  it("adds positive cash to the assets and clears the setup flag", () => {
    const hero = buildOverviewHero(fundedPortfolio);

    expect(hero.status).toBe("ready");
    expect(hero.assets).toBeCloseTo(201.65, 2);
    expect(hero.cashAsset).toBeCloseTo(100, 2);
    expect(hero.cashShortfall).toBe(0);
    expect(hero.setupIncomplete).toBe(false);
  });

  it("suppresses profit and loss when there is no position", () => {
    const hero = buildOverviewHero(emptyPortfolio);

    expect(hero.status).toBe("empty");
    expect(hero.pnl).toBeNull();
    expect(hero.pnlPct).toBeNull();
    expect(hero.pnlSuppressedReason).toBe("no_position");
  });

  it("suppresses profit and loss while a price is missing", () => {
    const hero = buildOverviewHero({
      ...partialPortfolio,
      cashBalance: 50,
      securitiesValue: 0,
      missingPriceCount: 1,
      positionValue: null,
    });

    expect(hero.status).toBe("incomplete_prices");
    expect(hero.assets).toBeCloseTo(50, 2);
    expect(hero.pnl).toBeNull();
    expect(hero.pnlSuppressedReason).toBe("missing_price");
  });

  it("suppresses the percentage when no cost basis was ever recorded", () => {
    const hero = buildOverviewHero({
      ...fundedPortfolio,
      costBasis: 0,
      positionValue: 168.04,
      totalQuantity: 1,
    });

    expect(hero.pnl).toBeNull();
    expect(hero.pnlPct).toBeNull();
    expect(hero.pnlSuppressedReason).toBe("no_cost_basis");
  });

  it("keeps working when the ledger hands over invalid numbers", () => {
    const hero = buildOverviewHero({
      ...partialPortfolio,
      securitiesValue: Number.NaN,
      totalQuantity: Number.NaN,
      positionValue: Number.NaN,
    });

    expect(hero.assets).toBe(0);
    expect(hero.pnl).toBeNull();
    expect(hero.pnlSuppressedReason).toBe("no_position");
  });
});

/**
 * CASH-MODEL-OPTIONAL-001 r1 — the same ledger read with the owner's real
 * funding model: one buy, no cash_in, because the money left a bank account
 * this app never sees. Nothing here is allowed to move the assets line.
 */
describe("buildOverviewHero — securities-first mode", () => {
  const securitiesFirst: OverviewHeroInput = {
    ...partialPortfolio,
    trackInAppCash: false,
  };

  it("does not report a missing deposit for money that never entered the app", () => {
    const hero = buildOverviewHero(securitiesFirst);

    expect(hero.status).toBe("ready");
    expect(hero.cashShortfall).toBe(0);
    expect(hero.setupIncomplete).toBe(false);
    expect(hero.cashTracked).toBe(false);
  });

  it("leaves the assets line, the cost basis and the profit and loss untouched", () => {
    const hero = buildOverviewHero(securitiesFirst);
    const doubleEntry = buildOverviewHero(partialPortfolio);

    expect(hero.assets).toBeCloseTo(101.65, 2);
    expect(hero.assets).toBeCloseTo(doubleEntry.assets, 2);
    expect(hero.securitiesValue).toBeCloseTo(101.65, 2);
    expect(hero.cashAsset).toBe(0);
    expect(hero.pnl).toBeCloseTo(1.65, 2);
    expect(hero.pnlPct).toBeCloseTo(1.65, 2);
    expect(hero.pnlSuppressedReason).toBeNull();
  });

  it("still hands the raw ledger balance to the trace sheet", () => {
    // Dropping the demand is not the same as hiding the number: "Xem nguon"
    // must keep showing what the ledger really holds.
    expect(buildOverviewHero(securitiesFirst).ledgerNet).toBeCloseTo(1.65, 2);
  });

  it("counts real positive cash as an asset even when cash is not tracked", () => {
    const hero = buildOverviewHero({
      ...securitiesFirst,
      cashBalance: 100,
      transactionCount: 2,
    });

    expect(hero.assets).toBeCloseTo(201.65, 2);
    expect(hero.cashAsset).toBeCloseTo(100, 2);
    expect(hero.status).toBe("ready");
  });

  it("leaves a missing price as the only remaining reason to interrupt", () => {
    const hero = buildOverviewHero({
      ...securitiesFirst,
      missingPriceCount: 1,
      positionValue: null,
    });

    expect(hero.status).toBe("incomplete_prices");
    expect(hero.setupIncomplete).toBe(false);
  });

  it("returns to the funding gap the moment double-entry is switched on", () => {
    const hero = buildOverviewHero({ ...securitiesFirst, trackInAppCash: true });

    expect(hero.status).toBe("unfunded");
    expect(hero.cashShortfall).toBeCloseTo(100, 2);
    expect(hero.setupIncomplete).toBe(true);
    expect(hero.cashTracked).toBe(true);
  });
});

describe("buildPulseDisplay", () => {
  it("shows no percentage before a baseline exists", () => {
    const display = buildPulseDisplay(null);

    expect(display.basis).toBe("no_baseline");
    expect(display.showPercent).toBe(false);
    expect(display.percent).toBeNull();
  });

  it("refuses the -99,9% claim when the ledger changed between visits", () => {
    const display = buildPulseDisplay(
      { value: -1593.1, quantity: -9.7765, valuePct: -99.9 },
      { baselineValue: 1594.75 },
    );

    expect(display.basis).toBe("ledger_changed");
    expect(display.quantityChanged).toBe(true);
    expect(display.showPercent).toBe(false);
    expect(display.percent).toBeNull();
    expect(display.value).toBeCloseTo(-1593.1, 2);
  });

  it("keeps the percentage for a price-only move of the same holdings", () => {
    const display = buildPulseDisplay(
      { value: 1.2, quantity: 0 },
      { baselineValue: 100 },
    );

    expect(display.basis).toBe("price_only");
    expect(display.showPercent).toBe(true);
    expect(display.percent).toBeCloseTo(1.2, 4);
  });

  it("drops the percentage when the baseline is too small to divide by", () => {
    const display = buildPulseDisplay(
      { value: 5, quantity: 0 },
      { baselineValue: 0.4 },
    );

    expect(display.basis).toBe("baseline_too_small");
    expect(display.showPercent).toBe(false);
  });

  it("drops the percentage when no baseline value is available", () => {
    const display = buildPulseDisplay({ value: 5, quantity: 0 });

    expect(display.basis).toBe("baseline_too_small");
    expect(display.percent).toBeNull();
  });
});

describe("shouldShowContributionNudge", () => {
  it("stands down while the funding call to action is on screen", () => {
    expect(
      shouldShowContributionNudge({ status: "unfunded", hasContributionThisMonth: false }),
    ).toBe(false);
  });

  it("stays quiet on an empty portfolio", () => {
    expect(
      shouldShowContributionNudge({ status: "empty", hasContributionThisMonth: false }),
    ).toBe(false);
  });

  it("nudges once the ledger is consistent", () => {
    expect(
      shouldShowContributionNudge({ status: "ready", hasContributionThisMonth: false }),
    ).toBe(true);
    expect(
      shouldShowContributionNudge({ status: "ready", hasContributionThisMonth: true }),
    ).toBe(false);
  });

  it("treats a securities-first month with a purchase as a contribution", () => {
    // The caller decides what counts as a contribution. In securities-first
    // mode a buy is one, otherwise killing the "unfunded" status would turn
    // this nudge into a permanent monthly false alarm.
    expect(
      shouldShowContributionNudge({ status: "ready", hasContributionThisMonth: true }),
    ).toBe(false);
  });
});
