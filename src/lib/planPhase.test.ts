import { describe, expect, it } from "vitest";
import { defaultPlanTarget, getPlanPhase, yearsUntil } from "./planPhase";
import type { PlanTarget } from "./types";

// ──── yearsUntil ────

describe("yearsUntil", () => {
  it("returns 0 when target is the same day", () => {
    const now = new Date("2026-08-13");
    expect(yearsUntil("2026-08-13", now)).toBe(0);
  });

  it("returns 5 when exactly 5 years away", () => {
    const now = new Date("2026-01-01");
    expect(yearsUntil("2031-01-01", now)).toBe(5);
  });

  it("returns 6 when still in the 6th year (anniversary not yet reached)", () => {
    const now = new Date("2026-08-13");
    // 2033-01-01: hiệu năm = 7, anniversary 2033-08-13 > 2033-01-01 → giảm 1 = 6
    expect(yearsUntil("2033-01-01", now)).toBe(6);
  });

  it("returns 0 when target has already passed (clamp)", () => {
    const now = new Date("2026-08-13");
    expect(yearsUntil("2024-01-01", now)).toBe(0);
  });

  it("returns 15 for a far-future target", () => {
    const now = new Date("2026-01-01");
    expect(yearsUntil("2041-01-01", now)).toBe(15);
  });
});

// ──── getPlanPhase ────

const t = (targetUseDate: string, overrides: Partial<PlanTarget> = {}): PlanTarget => ({
  targetUseDate,
  needFullAmount: true,
  ...overrides,
});

describe("getPlanPhase", () => {
  it("returns null for null", () => {
    expect(getPlanPhase(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(getPlanPhase(undefined)).toBeNull();
  });

  it("returns null when targetUseDate is empty string", () => {
    expect(getPlanPhase({ targetUseDate: "", needFullAmount: true })).toBeNull();
  });

  // Phần spec H: test cases bắt buộc
  it("GIỮ + 100% when 10 years left", () => {
    const now = new Date("2026-01-01");
    const phase = getPlanPhase(t("2036-01-01"), now);
    expect(phase?.status).toBe("GIỮ");
    expect(phase?.equityPct).toBe(100);
  });

  it("GIỮ + 100% when exactly 6 years left", () => {
    const now = new Date("2026-01-01");
    const phase = getPlanPhase(t("2032-01-01"), now);
    expect(phase?.status).toBe("GIỮ");
    expect(phase?.equityPct).toBe(100);
  });

  it("GIẢM + 90% when 5 years left", () => {
    const now = new Date("2026-01-01");
    const phase = getPlanPhase(t("2031-01-01"), now);
    expect(phase?.status).toBe("GIẢM");
    expect(phase?.equityPct).toBe(90);
  });

  it("GIẢM + 75% when 4 years left", () => {
    const now = new Date("2026-01-01");
    const phase = getPlanPhase(t("2030-01-01"), now);
    expect(phase?.status).toBe("GIẢM");
    expect(phase?.equityPct).toBe(75);
  });

  it("GIẢM + 55% when 3 years left", () => {
    const now = new Date("2026-01-01");
    const phase = getPlanPhase(t("2029-01-01"), now);
    expect(phase?.status).toBe("GIẢM");
    expect(phase?.equityPct).toBe(55);
  });

  it("GIẢM + 30% when 2 years left", () => {
    const now = new Date("2026-01-01");
    const phase = getPlanPhase(t("2028-01-01"), now);
    expect(phase?.status).toBe("GIẢM");
    expect(phase?.equityPct).toBe(30);
  });

  it("DỮNG + 10% when 1 year left", () => {
    const now = new Date("2026-01-01");
    const phase = getPlanPhase(t("2027-01-01"), now);
    expect(phase?.status).toBe("DỮNG");
    expect(phase?.equityPct).toBe(10);
  });

  it("SỬ DỤNG + 0% when 0 years left (same year)", () => {
    const now = new Date("2026-01-01");
    const phase = getPlanPhase(t("2026-06-01"), now);
    expect(phase?.status).toBe("SỬ DỤNG");
    expect(phase?.equityPct).toBe(0);
  });

  it("SỬ DỤNG + 0% when target has already passed", () => {
    const now = new Date("2026-08-13");
    const phase = getPlanPhase(t("2025-01-01"), now);
    expect(phase?.status).toBe("SỬ DỤNG");
    expect(phase?.equityPct).toBe(0);
  });

  it("yearsLeft is 0 when target has passed (clamp)", () => {
    const now = new Date("2026-08-13");
    const phase = getPlanPhase(t("2020-01-01"), now);
    expect(phase?.yearsLeft).toBe(0);
  });

  // showReminder
  it("showReminder = true when 5 years left and not reminded", () => {
    const now = new Date("2026-01-01");
    const phase = getPlanPhase(t("2031-01-01"), now);
    expect(phase?.showReminder).toBe(true);
  });

  it("showReminder = true when exactly 6 years left and not reminded", () => {
    const now = new Date("2026-01-01");
    const phase = getPlanPhase(t("2032-01-01"), now);
    expect(phase?.showReminder).toBe(true);
  });

  it("showReminder = false when already reminded this year", () => {
    const now = new Date("2026-01-01");
    const phase = getPlanPhase(t("2031-01-01", { lastGlideReminderYear: 2026 }), now);
    expect(phase?.showReminder).toBe(false);
  });

  it("showReminder = false when > 6 years and GIỮ phase", () => {
    const now = new Date("2026-01-01");
    // 7 years → GIỮ, > 6 → showReminder = false
    const phase = getPlanPhase(t("2033-01-01"), now);
    expect(phase?.showReminder).toBe(false);
  });

  it("showReminder = true when reminded last year (different year = new year)", () => {
    const now = new Date("2026-01-01");
    const phase = getPlanPhase(t("2031-01-01", { lastGlideReminderYear: 2025 }), now);
    expect(phase?.showReminder).toBe(true);
  });
});

// ──── defaultPlanTarget ────

describe("defaultPlanTarget", () => {
  it("adds 18 years to birth date (spec H: 2024-01-01 → 2042)", () => {
    const pt = defaultPlanTarget("2024-01-01");
    expect(pt.targetUseDate).toBe("2042-01-01");
  });

  it("needFullAmount defaults to true", () => {
    const pt = defaultPlanTarget("2024-01-01");
    expect(pt.needFullAmount).toBe(true);
  });

  it("works for different birth months", () => {
    const pt = defaultPlanTarget("2010-06-15");
    expect(pt.targetUseDate).toBe("2028-06-15");
  });
});
