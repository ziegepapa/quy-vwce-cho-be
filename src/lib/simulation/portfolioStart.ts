import { round2 } from "../calc";
import { buildTodayCenterPortfolioSnapshot } from "../todayCenterAdapter";
import type { Quote, Transaction } from "../types";

export type SimulationStartValueInput = {
  transactions: Transaction[];
  quotes: Quote[];
  legacyVwcePrice?: number;
  legacyVwcePriceAsOf?: string;
  nowDate?: string;
};

export type SimulationStartValue = {
  /** Matches Overview: valued securities plus non-negative cash assets. */
  balance: number;
  /** Holdings whose current value is unknown because no usable quote exists. */
  missingIsins: string[];
  staleIsins: string[];
  valuationStatus: "fresh" | "stale" | "missing";
};

/**
 * Keep Simulation's starting balance on the same deterministic valuation path
 * as Overview. Never fabricate a price for an unpriced holding; return its ISIN
 * so the UI can disclose that the starting balance is partial.
 */
export function buildSimulationStartValue(input: SimulationStartValueInput): SimulationStartValue {
  const snapshot = buildTodayCenterPortfolioSnapshot(input);
  return {
    balance: round2(snapshot.market.securities + Math.max(0, snapshot.portfolio.cashBalance)),
    missingIsins: [...snapshot.market.missingIsins],
    staleIsins: [...snapshot.stalePriceIsins],
    valuationStatus: snapshot.valuationStatus,
  };
}
