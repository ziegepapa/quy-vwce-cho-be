import { describe, expect, it } from "vitest";
import {
  formatDisplayDate,
  formatDisplayMoney,
  formatDisplayQuantity,
} from "./localeFormatting";

describe("locale display formatting", () => {
  it("formats calendar dates without a timezone shift", () => {
    expect(formatDisplayDate("2026-08-20", "vi")).toBe("20/08/2026");
    expect(formatDisplayDate("2026-08-20", "de")).toBe("20.08.2026");
  });

  it("formats EUR and quantities for the active display locale", () => {
    expect(formatDisplayMoney(1234.5, "vi")).toContain("1.234,5");
    expect(formatDisplayMoney(1234.5, "de")).toContain("1.234,50");
    expect(formatDisplayQuantity(12.34567, "vi")).toBe("12,3457");
    expect(formatDisplayQuantity(12.34567, "de")).toBe("12,3457");
  });

  it("returns a safe fallback for invalid or unavailable display values", () => {
    expect(formatDisplayDate("not-a-date", "de")).toBe("not-a-date");
    expect(formatDisplayMoney(Number.NaN, "de")).toBe("—");
    expect(formatDisplayQuantity(Number.POSITIVE_INFINITY, "vi")).toBe("—");
  });
});
