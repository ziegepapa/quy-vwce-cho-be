import { describe, expect, it } from "vitest";
import {
  buildTodayCenterSafety,
  buildTodayCenterWhatIf,
} from "./todayCenterEngine";
import {
  DEFAULT_TER,
  projectEnd,
  purchasingPower,
} from "./simulation/engine";

describe("buildTodayCenterWhatIf", () => {
  it("matches the canonical simulation engine including TER", () => {
    const result = buildTodayCenterWhatIf({
      amount: 250,
      vwcePrice: 125,
      priceSource: "manual_quote",
      years: 12,
      annualReturn: 0.07,
      inflation: 0.02,
    });
    const canonical = projectEnd({
      years: 12,
      monthlyContribution: 0,
      annualReturn: 0.07,
      initialBalance: 0,
      lumpSum: 250,
      annualContributionGrowth: 0,
      ter: DEFAULT_TER,
    });

    expect(result.status).toBe("ready");
    expect(result.extraUnits).toBe(2);
    expect(result.futureNominal).toBe(canonical.terminal);
    expect(result.futureReal).toBe(purchasingPower(canonical.terminal, 0.02, 12));
    expect(result.ter).toBe(DEFAULT_TER);
    expect(result.trace.vwcePrice.source).toBe("manual_quote");
    expect(result.trace.formula).toBe("simulation.projectEnd+purchasingPower");
  });

  it("keeps a missing quote explicit instead of converting it to zero units", () => {
    const result = buildTodayCenterWhatIf({
      amount: 100,
      vwcePrice: 0,
      priceSource: "missing",
      years: 5,
      annualReturn: 0.05,
      inflation: 0.02,
    });
    expect(result.status).toBe("missing_price");
    expect(result.vwcePrice).toBeNull();
    expect(result.extraUnits).toBeNull();
    expect(result.trace.vwcePrice.source).toBe("missing");
  });

  it("sanitizes invalid inputs and caps the horizon", () => {
    const result = buildTodayCenterWhatIf({
      amount: Number.NaN,
      vwcePrice: Number.NaN,
      years: 999,
      annualReturn: Number.POSITIVE_INFINITY,
      inflation: -1,
      ter: Number.NaN,
    });
    expect(result.status).toBe("empty_amount");
    expect(result.amount).toBe(0);
    expect(result.years).toBe(40);
    expect(result.annualReturn).toBe(0);
    expect(result.inflation).toBe(0);
    expect(result.ter).toBe(DEFAULT_TER);
    expect(result.futureReal).toBe(0);
  });

  it("uses an explicit TER when provided", () => {
    const defaultTer = buildTodayCenterWhatIf({
      amount: 1_000,
      vwcePrice: 100,
      years: 20,
      annualReturn: 0.07,
      inflation: 0,
    });
    const highTer = buildTodayCenterWhatIf({
      amount: 1_000,
      vwcePrice: 100,
      years: 20,
      annualReturn: 0.07,
      inflation: 0,
      ter: 0.01,
    });
    expect(highTer.futureNominal).toBeLessThan(defaultTer.futureNominal);
    expect(highTer.trace.ter.source).toBe("explicit_input");
  });
});

describe("buildTodayCenterSafety", () => {
  const now = "2026-08-05T12:00:00.000Z";

  it("treats a backup at the 30-day boundary as ready", () => {
    const result = buildTodayCenterSafety({
      backupAt: "2026-07-06T12:00:00.000Z",
      restoreAt: "2026-08-01T12:00:00.000Z",
      offlineReady: true,
      lastPrintedAt: "2026-07-01T12:00:00.000Z",
      now,
    });
    expect(result.score).toBe(4);
    expect(result.backupAgeDays).toBe(30);
    expect(result.highestRisk).toBeNull();
  });

  it("flags a stale backup before lower-priority gaps", () => {
    const result = buildTodayCenterSafety({
      backupAt: "2026-07-05T12:00:00.000Z",
      restoreAt: "",
      offlineReady: false,
      lastPrintedAt: "",
      now,
    });
    expect(result.score).toBe(0);
    expect(result.backupAgeDays).toBe(31);
    expect(result.highestRisk).toBe("backup");
    expect(result.items[0].reason).toBe("backup_stale");
  });

  it("does not treat malformed timestamps as completed safeguards", () => {
    const result = buildTodayCenterSafety({
      backupAt: "invalid",
      restoreAt: "invalid",
      offlineReady: true,
      lastPrintedAt: "invalid",
      now,
    });
    expect(result.score).toBe(1);
    expect(result.backupAgeDays).toBeNull();
    expect(result.items.find((item) => item.key === "restore")?.ready).toBe(false);
    expect(result.items.find((item) => item.key === "print")?.ready).toBe(false);
  });
});
