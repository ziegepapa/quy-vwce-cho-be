export type PortfolioHeartbeatAttentionKind = "none" | "quality" | "missing_prices" | "stale_prices";

export type PortfolioHeartbeat = {
  nextContribution: string | null;
  performanceState: "gain" | "loss" | "flat" | "unavailable";
  performance: string | null;
  attention: {
    kind: PortfolioHeartbeatAttentionKind;
    count: number;
    href: string | null;
  };
};

/**
 * Display-only Overview state. The heartbeat never recalculates portfolio
 * economics and never changes any transaction; it only prioritizes existing
 * audit and quote-reliability signals into one next action.
 */
export function buildPortfolioHeartbeat(input: {
  nextContribution: string | null;
  performanceState: PortfolioHeartbeat["performanceState"];
  performance: string | null;
  qualityIssueCount: number;
  missingPriceCount: number;
  stalePriceCount: number;
}): PortfolioHeartbeat {
  const qualityIssueCount = Math.max(0, Math.trunc(input.qualityIssueCount));
  const missingPriceCount = Math.max(0, Math.trunc(input.missingPriceCount));
  const stalePriceCount = Math.max(0, Math.trunc(input.stalePriceCount));

  if (qualityIssueCount > 0) {
    return {
      nextContribution: input.nextContribution,
      performanceState: input.performanceState,
      performance: input.performance,
      attention: { kind: "quality", count: qualityIssueCount, href: "#/transactions" },
    };
  }

  if (missingPriceCount > 0) {
    return {
      nextContribution: input.nextContribution,
      performanceState: input.performanceState,
      performance: input.performance,
      attention: { kind: "missing_prices", count: missingPriceCount, href: "#/settings" },
    };
  }

  if (stalePriceCount > 0) {
    return {
      nextContribution: input.nextContribution,
      performanceState: input.performanceState,
      performance: input.performance,
      attention: { kind: "stale_prices", count: stalePriceCount, href: "#/settings" },
    };
  }

  return {
    nextContribution: input.nextContribution,
    performanceState: input.performanceState,
    performance: input.performance,
    attention: { kind: "none", count: 0, href: null },
  };
}
