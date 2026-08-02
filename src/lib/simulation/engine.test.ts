import { describe, expect, it } from "vitest";
import {
  projectEnd,
  findMonthlyForTarget,
  findYearsForTarget,
  estimateGermanExitTax,
  purchasingPower,
  clamp,
} from "./engine";

const baseInput = {
  years: 10,
  monthlyContribution: 100,
  annualReturn: 0.05,
  initialBalance: 1000,
  lumpSum: 0,
  annualContributionGrowth: 0,
  ter: 0,
};

describe("projectEnd", () => {
  it("zero rate, no growth, TER 0 → terminal = initial + lump + monthly*12*years", () => {
    const r = projectEnd({
      years: 5,
      monthlyContribution: 100,
      annualReturn: 0,
      initialBalance: 500,
      lumpSum: 200,
      annualContributionGrowth: 0,
      ter: 0,
    });
    expect(r.terminal).toBe(500 + 200 + 100 * 12 * 5);
  });

  it("years = 0 → terminal = initialBalance + lumpSum", () => {
    const r = projectEnd({
      ...baseInput,
      years: 0,
      initialBalance: 1234,
      lumpSum: 567,
      monthlyContribution: 999,
    });
    expect(r.terminal).toBe(1234 + 567);
  });

  it("contributed equals monthly * 12 * years when no growth", () => {
    const r = projectEnd({
      years: 3,
      monthlyContribution: 50,
      annualReturn: 0.07,
      initialBalance: 0,
      lumpSum: 0,
      annualContributionGrowth: 0,
      ter: 0.002,
    });
    expect(r.contributed).toBe(50 * 12 * 3);
  });

  it("higher rate → higher terminal", () => {
    const low = projectEnd({ ...baseInput, annualReturn: 0.03 });
    const high = projectEnd({ ...baseInput, annualReturn: 0.08 });
    expect(high.terminal).toBeGreaterThan(low.terminal);
  });

  it("higher TER → lower terminal", () => {
    const lowTer = projectEnd({ ...baseInput, ter: 0 });
    const highTer = projectEnd({ ...baseInput, ter: 0.01 });
    expect(highTer.terminal).toBeLessThan(lowTer.terminal);
  });

  it("yearEnds length is years+1 and last total matches terminal", () => {
    const years = 7;
    const r = projectEnd({ ...baseInput, years });
    expect(r.yearEnds.length).toBe(years + 1);
    expect(r.yearEnds[r.yearEnds.length - 1].total).toBe(r.terminal);
  });
});

describe("round-trip", () => {
  it("findMonthlyForTarget → projectEnd ≈ target", () => {
    const target = 50_000;
    const base = {
      years: 12,
      annualReturn: 0.06,
      initialBalance: 2000,
      lumpSum: 500,
      annualContributionGrowth: 0,
      ter: 0.0022,
    };
    const monthly = findMonthlyForTarget(target, base);
    expect(monthly).toBeGreaterThan(0);
    const r = projectEnd({ ...base, monthlyContribution: monthly });
    expect(r.terminal).toBeCloseTo(target, 0);
  });

  it("findYearsForTarget → projectEnd terminal >= target", () => {
    const target = 50_000;
    const base = {
      monthlyContribution: 300,
      annualReturn: 0.065,
      initialBalance: 1000,
      lumpSum: 0,
      annualContributionGrowth: 0,
      ter: 0.0022,
    };
    const { years, reached } = findYearsForTarget(target, base);
    expect(reached).toBe(true);
    const r = projectEnd({ ...base, years });
    expect(r.terminal).toBeGreaterThanOrEqual(target - 1);
  });
});

describe("estimateGermanExitTax", () => {
  it("zero gain → tax 0", () => {
    const { tax, afterTax } = estimateGermanExitTax(10_000, 8000, 2000);
    expect(tax).toBe(0);
    expect(afterTax).toBe(10_000);
  });

  it("tax always >= 0 and < terminal - costBasis when gain > 0", () => {
    const terminal = 80_000;
    const contributed = 30_000;
    const initialCostBasis = 5_000;
    const costBasis = contributed + initialCostBasis;
    const { tax } = estimateGermanExitTax(terminal, contributed, initialCostBasis);
    expect(tax).toBeGreaterThanOrEqual(0);
    expect(tax).toBeLessThan(terminal - costBasis);
  });
});

describe("purchasingPower", () => {
  it("zero inflation → same value", () => {
    expect(purchasingPower(10_000, 0, 10)).toBe(10_000);
  });

  it("years = 0 → same value", () => {
    expect(purchasingPower(10_000, 0.03, 0)).toBe(10_000);
  });

  it("positive inflation and years → smaller value", () => {
    const pp = purchasingPower(10_000, 0.02, 15);
    expect(pp).toBeLessThan(10_000);
  });
});

describe("clamp", () => {
  it("below lo", () => expect(clamp(-5, 0, 10)).toBe(0));
  it("above hi", () => expect(clamp(99, 0, 10)).toBe(10));
  it("in range", () => expect(clamp(4, 0, 10)).toBe(4));
});
