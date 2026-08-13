import { describe, expect, it } from "vitest";
import { buildNhipInsights, type NhipInsightInput } from "./nhipInsights";

const BASE: NhipInsightInput = {
  portfolioEmpty: false,
  vwceAsOf: "2026-07-25",
  planEndDate: "2042-09-01",
  transactions: [],
  now: "2026-08-07T12:00:00.000Z",
};

describe("Nhịp quote-source freshness", () => {
  it("warns for an old auto quote", () => {
    const result = buildNhipInsights({ ...BASE, vwceSource: "auto_quote" });
    expect(result.insights.some((insight) => insight.kind === "stale_price")).toBe(true);
  });

  it("does not apply the auto-feed expiry rule to an old manual quote", () => {
    const result = buildNhipInsights({ ...BASE, vwceSource: "manual_quote" });
    expect(result.insights.some((insight) => insight.kind === "stale_price")).toBe(false);
  });

  it("keeps legacy compatibility prices under the stale warning policy", () => {
    const result = buildNhipInsights({ ...BASE, vwceSource: "legacy_quote" });
    expect(result.insights.some((insight) => insight.kind === "stale_price")).toBe(true);
  });
});
