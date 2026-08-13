import { describe, expect, it } from "vitest";

import {
  defaultPlanTarget,
  getPlanPhase,
  planDateYear,
  yearsUntil,
} from "./planPhase";
import type { PlanTarget } from "./types";

function t(targetUseDate: string, extra?: Partial<PlanTarget>): PlanTarget {
  return { targetUseDate, needFullAmount: true, ...extra };
}

function localDate(year: number, month: number, day: number, hour = 12): Date {
  return new Date(year, month - 1, day, hour);
}

describe("yearsUntil", () => {
  it("returns 0 on the target calendar day regardless of time", () => {
    expect(yearsUntil("2026-08-13", localDate(2026, 8, 13, 23))).toBe(0);
  });

  it("returns 5 when exactly 5 years away", () => {
    expect(yearsUntil("2031-08-13", localDate(2026, 8, 13))).toBe(5);
  });

  it("keeps 5 years one day before the anniversary", () => {
    expect(yearsUntil("2031-08-13", localDate(2026, 8, 12))).toBe(5);
  });

  it("drops to 4 years one day after the anniversary", () => {
    expect(yearsUntil("2031-08-13", localDate(2026, 8, 14))).toBe(4);
  });

  it("returns 6 when still in the 6th year (anniversary not yet reached)", () => {
    expect(yearsUntil("2033-01-01", localDate(2026, 8, 13))).toBe(6);
  });

  it("returns 0 when target has already passed (clamp)", () => {
    expect(yearsUntil("2024-01-01", localDate(2026, 8, 13))).toBe(0);
  });

  it("returns 15 for a far-future target", () => {
    expect(yearsUntil("2041-01-01", localDate(2026, 1, 1))).toBe(15);
  });

  it("returns a finite fail-closed value for malformed or impossible dates", () => {
    expect(yearsUntil("not-a-date", localDate(2026, 1, 1))).toBe(0);
    expect(yearsUntil("2031-02-29", localDate(2026, 1, 1))).toBe(0);
    expect(yearsUntil("2031-01-01", new Date(Number.NaN))).toBe(0);
  });
});

describe("planDateYear", () => {
  it("reads a valid date without UTC conversion", () => {
    expect(planDateYear("2042-01-01")).toBe(2042);
  });

  it("rejects malformed and impossible dates", () => {
    expect(planDateYear("2042-1-1")).toBeNull();
    expect(planDateYear("2042-02-29")).toBeNull();
  });
});

describe("getPlanPhase", () => {
  it("returns null for null target", () => {
    expect(getPlanPhase(null)).toBeNull();
  });

  it("returns null for undefined target", () => {
    expect(getPlanPhase(undefined)).toBeNull();
  });

  it("returns null for empty or invalid targetUseDate", () => {
    expect(getPlanPhase({ targetUseDate: "", needFullAmount: true })).toBeNull();
    expect(getPlanPhase(t("2031-02-29"), localDate(2026, 1, 1))).toBeNull();
  });

  // Phần spec H: test cases bắt buộc
  it("GIỮ + 100% when 10 years left", () => {
    const phase = getPlanPhase(t("2036-01-01"), localDate(2026, 1, 1));
    expect(phase?.status).toBe("GIỮ");
    expect(phase?.equityPct).toBe(100);
  });

  it("GIỮ + 100% when exactly 6 years left", () => {
    const phase = getPlanPhase(t("2032-01-01"), localDate(2026, 1, 1));
    expect(phase?.status).toBe("GIỮ");
    expect(phase?.equityPct).toBe(100);
  });

  it("GIẢM + 90% when 5 years left", () => {
    const phase = getPlanPhase(t("2031-01-01"), localDate(2026, 1, 1));
    expect(phase?.status).toBe("GIẢM");
    expect(phase?.equityPct).toBe(90);
  });

  it("GIẢM + 75% when 4 years left", () => {
    const phase = getPlanPhase(t("2030-01-01"), localDate(2026, 1, 1));
    expect(phase?.status).toBe("GIẢM");
    expect(phase?.equityPct).toBe(75);
  });

  it("GIẢM + 55% when 3 years left", () => {
    const phase = getPlanPhase(t("2029-01-01"), localDate(2026, 1, 1));
    expect(phase?.status).toBe("GIẢM");
    expect(phase?.equityPct).toBe(55);
  });

  it("GIẢM + 30% when 2 years left", () => {
    const phase = getPlanPhase(t("2028-01-01"), localDate(2026, 1, 1));
    expect(phase?.status).toBe("GIẢM");
    expect(phase?.equityPct).toBe(30);
  });

  it("DỪNG + 10% when 1 year left", () => {
    const phase = getPlanPhase(t("2027-01-01"), localDate(2026, 1, 1));
    expect(phase?.status).toBe("DỪNG");
    expect(phase?.equityPct).toBe(10);
  });

  it("SỬ DỤNG + 0% when same year as target", () => {
    const phase = getPlanPhase(t("2026-06-01"), localDate(2026, 1, 1));
    expect(phase?.status).toBe("SỬ DỤNG");
    expect(phase?.equityPct).toBe(0);
  });

  it("SỬ DỤNG + 0% when target has already passed", () => {
    const phase = getPlanPhase(t("2025-01-01"), localDate(2026, 8, 13));
    expect(phase?.status).toBe("SỬ DỤNG");
    expect(phase?.equityPct).toBe(0);
  });

  it("yearsLeft is 0 when target has passed (clamp)", () => {
    const phase = getPlanPhase(t("2020-01-01"), localDate(2026, 8, 13));
    expect(phase?.yearsLeft).toBe(0);
  });

  it("moves from the 5-year to 4-year row only after the anniversary", () => {
    const target = t("2031-08-13");
    const before = getPlanPhase(target, localDate(2026, 8, 12));
    const exact = getPlanPhase(target, localDate(2026, 8, 13));
    const after = getPlanPhase(target, localDate(2026, 8, 14));

    expect([before?.yearsLeft, before?.equityPct]).toEqual([5, 90]);
    expect([exact?.yearsLeft, exact?.equityPct]).toEqual([5, 90]);
    expect([after?.yearsLeft, after?.equityPct]).toEqual([4, 75]);
  });

  // showReminder
  it("showReminder = true when 5 years left and not reminded", () => {
    const phase = getPlanPhase(t("2031-01-01"), localDate(2026, 1, 1));
    expect(phase?.showReminder).toBe(true);
  });

  it("showReminder = false when reminded this year", () => {
    const phase = getPlanPhase(
      t("2031-01-01", { lastGlideReminderYear: 2026 }),
      localDate(2026, 1, 1),
    );
    expect(phase?.showReminder).toBe(false);
  });

  it("showReminder = false when > 6 years and GIỮ phase", () => {
    const phase = getPlanPhase(t("2033-01-01"), localDate(2026, 1, 1));
    expect(phase?.showReminder).toBe(false);
  });

  it("showReminder = true when reminded last year (different year = new year)", () => {
    const phase = getPlanPhase(
      t("2031-01-01", { lastGlideReminderYear: 2025 }),
      localDate(2026, 1, 1),
    );
    expect(phase?.showReminder).toBe(true);
  });
});

describe("defaultPlanTarget", () => {
  it("adds 18 years to birth date (spec H: 2024-01-01 → 2042)", () => {
    expect(defaultPlanTarget("2024-01-01").targetUseDate).toBe("2042-01-01");
  });

  it("clamps leap day deterministically without timezone conversion", () => {
    expect(defaultPlanTarget("2024-02-29").targetUseDate).toBe("2042-02-28");
  });

  it("rejects malformed birth dates explicitly", () => {
    expect(() => defaultPlanTarget("2024-02-30")).toThrow("Ngày sinh không hợp lệ");
  });
});
