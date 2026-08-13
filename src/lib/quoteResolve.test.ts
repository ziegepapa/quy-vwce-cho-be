import { describe, expect, it } from "vitest";
import { classifyCandidate, resolveEffective } from "./quoteResolve";
import { VWCE_ISIN, type QuoteCandidate } from "./types";

function candidate(
  source: "auto" | "manual",
  asOf: string,
  price = source === "auto" ? 200 : 150,
): QuoteCandidate {
  return {
    id: `${source}-${asOf}`,
    instrumentIsin: VWCE_ISIN,
    currency: "EUR",
    source,
    price,
    asOf,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("quote resolver boundary", () => {
  it("fails closed when nowDate is malformed or impossible", () => {
    const auto = candidate("auto", "2026-08-01");
    for (const nowDate of ["", "not-a-date", "2026-02-30"]) {
      expect(classifyCandidate(auto, nowDate)).toBe("unusable");
      const resolved = resolveEffective({ mode: "auto", auto, nowDate });
      expect(resolved.chosen).toBeNull();
      expect(resolved.effective).toBeNull();
    }
  });

  it("prefers a fresh auto quote in auto mode", () => {
    const resolved = resolveEffective({
      mode: "auto",
      auto: candidate("auto", "2026-08-04", 200),
      manual: candidate("manual", "2026-08-01", 150),
      nowDate: "2026-08-05",
    });
    expect(resolved.chosen?.source).toBe("auto");
    expect(resolved.effective?.price).toBe(200);
  });

  it("falls back from stale auto to a valid manual quote", () => {
    const resolved = resolveEffective({
      mode: "auto",
      auto: candidate("auto", "2026-07-01", 200),
      manual: candidate("manual", "2026-08-01", 150),
      nowDate: "2026-08-05",
    });
    expect(resolved.chosen?.source).toBe("manual");
    expect(resolved.effective?.price).toBe(150);
  });

  it("retains stale auto only when no manual fallback exists", () => {
    const resolved = resolveEffective({
      mode: "auto",
      auto: candidate("auto", "2026-07-01", 200),
      nowDate: "2026-08-05",
    });
    expect(resolved.chosen?.source).toBe("auto");
    expect(resolved.effective?.price).toBe(200);
    expect(resolved.reason).toContain("auto stale, no manual");
  });

  it("does not expire an explicitly selected old manual quote", () => {
    const manual = candidate("manual", "2020-01-01", 123);
    expect(classifyCandidate(manual, "2026-08-05")).toBe("valid-fresh");
    const resolved = resolveEffective({ mode: "manual", manual, nowDate: "2026-08-05" });
    expect(resolved.effective?.source).toBe("manual");
    expect(resolved.effective?.price).toBe(123);
  });
});
