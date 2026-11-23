import { describe, expect, it } from "vitest";
import { buildExitInstallments, monthsBefore, parseIllustrationBudgetCents, validExitDate } from "./exitPlan";

describe("Exit Plan: no implicit date or amount", () => {
  it("does not invent a date when no Goal has been selected", () => {
    expect(buildExitInstallments(null, "600", 18)).toEqual([]);
    expect(buildExitInstallments("", "600", 18)).toEqual([]);
    expect(buildExitInstallments(undefined, "600", 18)).toEqual([]);
  });
  it("does not invent money when user has not entered a model budget", () => {
    expect(buildExitInstallments("2049-10-28", "", 18)).toEqual([]);
    expect(buildExitInstallments("2049-10-28", "0", 18)).toEqual([]);
    expect(buildExitInstallments("2049-10-28", "-100", 18)).toEqual([]);
    expect(buildExitInstallments("2049-10-28", "1,234.55", 18)).toEqual([]);
  });
  it("validates actual calendar dates", () => {
    expect(validExitDate("2042-02-29")).toBe(false);
    expect(validExitDate("2040-02-29")).toBe(true);
    expect(validExitDate("2050-01-28")).toBe(true);
    expect(validExitDate("2042-02-30")).toBe(false);
    expect(validExitDate("2042-2-01")).toBe(false);
    expect(buildExitInstallments("2042-02-30", "120", 18)).toEqual([]);
  });
});

describe("Exit Plan: owner-entered model and exact cents", () => {
  it.each([12, 18, 24] as const)("has %i-month quarter windows, never includes the use date", (months) => {
    const rows = buildExitInstallments("2050-01-28", "600", months);
    expect(rows).toHaveLength(months / 3);
    expect(rows[0].date).toBe(monthsBefore("2050-01-28", months));
    expect(rows.at(-1)?.date).toBe("2049-10-28");
    expect(rows.at(-1)?.remainingBudgetCents).toBe(0);
    expect(rows.reduce((sum, row) => sum + row.plannedCents, 0)).toBe(60000);
    expect(rows.every((row, i) => row.ordinal === i + 1)).toBe(true);
  });
  it("preserves every cent of a non-divisible owner budget", () => {
    const rows = buildExitInstallments("2050-01-28", "100,01", 18);
    expect(rows.map((r) => r.plannedCents)).toEqual([1666,1666,1666,1666,1666,1671]);
    expect(rows.at(-1)?.remainingBudgetCents).toBe(0);
    expect(rows.reduce((a, r) => a + r.plannedCents, 0)).toBe(10001);
  });
  it("uses calendar-month clamping around leap and month ends", () => {
    expect(monthsBefore("2040-02-29", 12)).toBe("2039-02-28");
    expect(monthsBefore("2050-03-31", 1)).toBe("2050-02-28");
    expect(monthsBefore("2040-03-31", 1)).toBe("2040-02-29");
  });
  it("accepts de-DE and dot decimal notation, rejects float errors and noise", () => {
    expect(parseIllustrationBudgetCents("120,50")).toBe(12050);
    expect(parseIllustrationBudgetCents("120.50")).toBe(12050);
    expect(parseIllustrationBudgetCents("0,01")).toBe(1);
    expect(parseIllustrationBudgetCents("1e8")).toBeNull();
    expect(parseIllustrationBudgetCents("120.555")).toBeNull();
    expect(parseIllustrationBudgetCents("NaN")).toBeNull();
    expect(parseIllustrationBudgetCents(" ")).toBeNull();
  });
  it("does not consume a Goal amount, protectedAmount or equity quote", () => {
    const rows = buildExitInstallments("2049-12-31", "120", 12);
    expect(rows.reduce((a, r) => a + r.plannedCents, 0)).toBe(12000);
    expect(rows.every((row) => Object.keys(row).sort().join("|") ===
      ["date", "ordinal", "plannedCents", "remainingBudgetCents"].sort().join("|"))).toBe(true);
  });
});
