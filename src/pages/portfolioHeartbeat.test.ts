import { describe, expect, it } from "vitest";
import { buildPortfolioHeartbeat } from "./portfolioHeartbeat";

const base = {
  nextContribution: "01/09",
  performanceState: "gain" as const,
  performance: "+4,2%",
  qualityIssueCount: 0,
  missingPriceCount: 0,
  stalePriceCount: 0,
};

describe("buildPortfolioHeartbeat", () => {
  it("keeps the planned date and performance while reporting a calm state when data is healthy", () => {
    expect(buildPortfolioHeartbeat(base)).toEqual({
      nextContribution: "01/09",
      performanceState: "gain",
      performance: "+4,2%",
      attention: { kind: "none", count: 0, href: null },
    });
  });

  it("prioritizes transaction quality before quote reliability and provides the existing review route", () => {
    const heartbeat = buildPortfolioHeartbeat({ ...base, qualityIssueCount: 2, missingPriceCount: 3, stalePriceCount: 1 });
    expect(heartbeat.attention).toEqual({ kind: "quality", count: 2, href: "#/transactions" });
  });

  it("prioritizes missing prices before stale prices once transactions are complete", () => {
    expect(buildPortfolioHeartbeat({ ...base, missingPriceCount: 2, stalePriceCount: 4 }).attention)
      .toEqual({ kind: "missing_prices", count: 2, href: "#/settings" });
    expect(buildPortfolioHeartbeat({ ...base, stalePriceCount: 4 }).attention)
      .toEqual({ kind: "stale_prices", count: 4, href: "#/settings" });
  });

  it("normalizes invalid attention counts without changing performance state", () => {
    const heartbeat = buildPortfolioHeartbeat({ ...base, performanceState: "unavailable", performance: null, qualityIssueCount: -1.2, missingPriceCount: Number.NaN, stalePriceCount: -5 });
    expect(heartbeat.performanceState).toBe("unavailable");
    expect(heartbeat.attention).toEqual({ kind: "none", count: 0, href: null });
  });
});
