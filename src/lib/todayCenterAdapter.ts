import {
  applyTransaction,
  emptyPortfolio,
  portfolioMarketValue,
  type PortfolioState,
} from "./calc";
import {
  calendarDaysBetween,
  isValidAsOfDate,
  toDateOnly,
} from "./instrument";
import { classifyCandidate } from "./quoteResolve";
import { STALE_DAYS, VWCE_ISIN, type Quote, type Transaction } from "./types";

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
  /** Held positions valued with an auto/legacy quote older than STALE_DAYS. */
  stalePriceIsins: string[];
  vwcePrice: number;
  vwceQuote: Quote | null;
  vwceAsOf: string | null;
  vwceAgeDays: number | null;
  vwcePriceSource: TodayCenterPriceSource;
  provenance: TodayCenterPortfolioProvenance;
};

export type TodayCenterPortfolioInput = {
  transactions: Transaction[];
  quotes: Quote[];
  legacyVwcePrice?: number;
  legacyVwcePriceAsOf?: string;
  /** Local calendar date injected for deterministic tests. */
  nowDate?: string;
};

type UsableQuoteStatus = "valid-fresh" | "valid-stale";

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
  legacyVwcePriceAsOf = "",
  nowDate: rawNowDate,
}: TodayCenterPortfolioInput): TodayCenterPortfolioSnapshot {
  const nowDate = typeof rawNowDate === "string" ? rawNowDate.trim() : toDateOnly();
  const portfolio = replayTransactions(transactions);
  const pricesByIsin: Record<string, number> = {};
  const effectiveQuotes: Record<string, Quote> = {};
  const quoteStatuses: Record<string, UsableQuoteStatus> = {};
  const quoteAgeDays: Record<string, number> = {};

  for (const quote of quotes) {
    const isin = normalizeIsin(quote.instrumentIsin);
    if (!isin || quote.currency !== "EUR") continue;
    const status = classifyCandidate(quote, nowDate);
    if (status !== "valid-fresh" && status !== "valid-stale") continue;

    pricesByIsin[isin] = quote.price;
    effectiveQuotes[isin] = quote;
    quoteStatuses[isin] = status;
    quoteAgeDays[isin] = calendarDaysBetween(quote.asOf, nowDate);
  }

  const vwceQuote = effectiveQuotes[VWCE_ISIN] ?? null;
  const legacyPrice = Number.isFinite(legacyVwcePrice) && legacyVwcePrice > 0
    ? legacyVwcePrice
    : 0;
  const legacyAsOf = typeof legacyVwcePriceAsOf === "string"
    ? legacyVwcePriceAsOf.trim()
    : "";
  const legacyAgeDays = isValidAsOfDate(nowDate) && isValidAsOfDate(legacyAsOf)
    ? calendarDaysBetween(legacyAsOf, nowDate)
    : null;
  const legacyUsable =
    !vwceQuote
    && legacyPrice > 0
    && legacyAgeDays !== null
    && Number.isFinite(legacyAgeDays)
    && legacyAgeDays >= 0;

  if (legacyUsable) {
    pricesByIsin[VWCE_ISIN] = legacyPrice;
    quoteStatuses[VWCE_ISIN] = legacyAgeDays > STALE_DAYS ? "valid-stale" : "valid-fresh";
    quoteAgeDays[VWCE_ISIN] = legacyAgeDays;
  }

  const market = portfolioMarketValue(portfolio, pricesByIsin);
  const totalQuantity = Object.values(portfolio.positions).reduce(
    (sum, position) => sum + Math.max(0, position.qty),
    0,
  );
  const stalePriceIsins = Object.entries(market.byIsin)
    .filter(([isin, row]) => row.qty > 0 && quoteStatuses[isin] === "valid-stale")
    .map(([isin]) => isin)
    .sort((a, b) => a.localeCompare(b));
  const vwcePrice = pricesByIsin[VWCE_ISIN] ?? 0;
  const vwcePriceSource: TodayCenterPriceSource = vwceQuote
    ? vwceQuote.source === "manual"
      ? "manual_quote"
      : "auto_quote"
    : legacyUsable
      ? "legacy_quote"
      : "missing";

  return {
    portfolio,
    pricesByIsin,
    market,
    totalValue: market.total,
    totalQuantity,
    valueComplete: market.missingIsins.length === 0,
    stalePriceIsins,
    vwcePrice,
    vwceQuote,
    vwceAsOf: vwceQuote?.asOf ?? (legacyUsable ? legacyAsOf : null),
    vwceAgeDays: quoteAgeDays[VWCE_ISIN] ?? null,
    vwcePriceSource,
    provenance: {
      holdings: "transactions_replay",
      marketValue: "portfolio_market_value",
      vwcePrice: vwcePriceSource,
    },
  };
}
