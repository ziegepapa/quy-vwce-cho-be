import {
  applyTransaction,
  emptyPortfolio,
  portfolioMarketValue,
  type PortfolioState,
} from "./calc";
import { VWCE_ISIN, type Quote, type Transaction } from "./types";

export type TodayCenterPriceSource =
  | "manual_quote"
  | "auto_quote"
  | "legacy_quote"
  | "missing";

export type TodayCenterPortfolioProvenance = {
  holdings: "transactions_replay";
  marketValue: "portfolio_market_value";
  vwcePrice: TodayCenterPriceSource;
};

export type TodayCenterPortfolioSnapshot = {
  portfolio: PortfolioState;
  pricesByIsin: Record<string, number>;
  market: ReturnType<typeof portfolioMarketValue>;
  totalValue: number;
  totalQuantity: number;
  valueComplete: boolean;
  vwcePrice: number;
  vwceQuote: Quote | null;
  vwcePriceSource: TodayCenterPriceSource;
  provenance: TodayCenterPortfolioProvenance;
};

export type TodayCenterPortfolioInput = {
  transactions: Transaction[];
  quotes: Quote[];
  legacyVwcePrice?: number;
};

function normalizeIsin(value: string): string {
  return value.trim().toUpperCase();
}

function replayTransactions(transactions: Transaction[]): PortfolioState {
  const ordered = transactions
    .map((transaction, index) => ({ transaction, index }))
    .filter(({ transaction }) => !transaction.deletedAt)
    .sort((a, b) => a.transaction.date.localeCompare(b.transaction.date) || a.index - b.index);

  let portfolio = emptyPortfolio();
  for (const { transaction } of ordered) {
    portfolio = applyTransaction(portfolio, transaction);
  }
  return portfolio;
}

/** Maps the production ledger and effective Quote rows into one UI-safe snapshot. */
export function buildTodayCenterPortfolioSnapshot({
  transactions,
  quotes,
  legacyVwcePrice = 0,
}: TodayCenterPortfolioInput): TodayCenterPortfolioSnapshot {
  const portfolio = replayTransactions(transactions);
  const pricesByIsin: Record<string, number> = {};
  const effectiveQuotes: Record<string, Quote> = {};

  for (const quote of quotes) {
    const isin = normalizeIsin(quote.instrumentIsin);
    if (!isin || quote.currency !== "EUR" || !Number.isFinite(quote.price) || quote.price <= 0) {
      continue;
    }
    pricesByIsin[isin] = quote.price;
    effectiveQuotes[isin] = quote;
  }

  const vwceQuote = effectiveQuotes[VWCE_ISIN] ?? null;
  const legacyPrice = Number.isFinite(legacyVwcePrice) && legacyVwcePrice > 0
    ? legacyVwcePrice
    : 0;
  if (!vwceQuote && legacyPrice > 0) {
    pricesByIsin[VWCE_ISIN] = legacyPrice;
  }

  const market = portfolioMarketValue(portfolio, pricesByIsin);
  const totalQuantity = Object.values(portfolio.positions).reduce(
    (sum, position) => sum + Math.max(0, position.qty),
    0,
  );
  const vwcePrice = pricesByIsin[VWCE_ISIN] ?? 0;
  const vwcePriceSource: TodayCenterPriceSource = vwceQuote
    ? vwceQuote.source === "manual"
      ? "manual_quote"
      : "auto_quote"
    : vwcePrice > 0
      ? "legacy_quote"
      : "missing";

  return {
    portfolio,
    pricesByIsin,
    market,
    totalValue: market.total,
    totalQuantity,
    valueComplete: market.missingIsins.length === 0,
    vwcePrice,
    vwceQuote,
    vwcePriceSource,
    provenance: {
      holdings: "transactions_replay",
      marketValue: "portfolio_market_value",
      vwcePrice: vwcePriceSource,
    },
  };
}
