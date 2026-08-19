import type { Quote, Transaction } from "./types";
import { calcQuantity } from "./calc";
import { isSecuritySell, isSecurityTx, resolveInstrumentIsin } from "./instrument";
import { computeHeroLifetimeContribution, type HeroLifetimeMode } from "./heroLifetime";

type Position = { quantity: number; costBasis: number };

export type TransactionAnalytics = {
  /** User money put into the fund under the active ledger mode. */
  contributed: number;
  contributionMode: HeroLifetimeMode;
  withdrawn: number;
  buyCount: number;
  buyVolume: number;
  feesAndTax: number;
  holdingsValue: number | null;
  realizedPnl: number;
  unrealizedPnl: number | null;
  totalPnl: number | null;
  openPositions: number;
  missingQuotes: string[];
  incompleteLots: string[];
};

function latestQuotes(quotes: Quote[]): Map<string, Quote> {
  const selected = new Map<string, Quote>();
  for (const quote of quotes) {
    const previous = selected.get(quote.instrumentIsin);
    if (!previous || `${quote.asOf}|${quote.updatedAt}` > `${previous.asOf}|${previous.updatedAt}`) {
      selected.set(quote.instrumentIsin, quote);
    }
  }
  return selected;
}

export function analyzeTransactions(
  transactions: Transaction[],
  quotes: Quote[],
  trackInAppCash?: boolean | null,
): TransactionAnalytics {
  const lifetimeContribution = computeHeroLifetimeContribution({ transactions, trackInAppCash });
  const positions = new Map<string, Position>();
  let withdrawn = 0;
  let buyCount = 0;
  let buyVolume = 0;
  let feesAndTax = 0;
  let realizedPnl = 0;
  const incompleteLots = new Set<string>();

  const sorted = [...transactions]
    .filter((tx) => !tx.deletedAt)
    .sort((a, b) => `${a.date}|${a.createdAt}|${a.id}`.localeCompare(`${b.date}|${b.createdAt}|${b.id}`));

  for (const tx of sorted) {
    const feeTax = Math.max(0, tx.fee ?? 0) + Math.max(0, tx.tax ?? 0);
    if (tx.type === "cash_out") withdrawn += tx.amount;
    if (tx.type === "fee" || tx.type === "tax") feesAndTax += Math.max(0, tx.amount);
    feesAndTax += feeTax;
    if (!isSecurityTx(tx.type)) continue;

    const isin = resolveInstrumentIsin(tx);
    if (!isin) {
      incompleteLots.add("Giao dịch không có ISIN");
      continue;
    }
    const inferredQuantity = tx.quantity ?? (tx.unitPrice ? calcQuantity(tx.amount, tx.unitPrice, tx.fee ?? 0, tx.tax ?? 0) : 0);
    if (!Number.isFinite(inferredQuantity) || inferredQuantity <= 0) {
      incompleteLots.add(isin);
      continue;
    }
    const current = positions.get(isin) ?? { quantity: 0, costBasis: 0 };
    if (!isSecuritySell(tx.type)) {
      positions.set(isin, {
        quantity: current.quantity + inferredQuantity,
        costBasis: current.costBasis + Math.max(0, tx.amount),
      });
      buyCount += 1;
      buyVolume += Math.max(0, tx.amount);
      continue;
    }

    if (current.quantity + 1e-8 < inferredQuantity) {
      incompleteLots.add(isin);
      positions.set(isin, { quantity: 0, costBasis: 0 });
      continue;
    }
    const averageCost = current.quantity > 0 ? current.costBasis / current.quantity : 0;
    const soldCost = averageCost * inferredQuantity;
    const netProceeds = Math.max(0, tx.amount - feeTax);
    realizedPnl += netProceeds - soldCost;
    positions.set(isin, {
      quantity: Math.max(0, current.quantity - inferredQuantity),
      costBasis: Math.max(0, current.costBasis - soldCost),
    });
  }

  const quotesByIsin = latestQuotes(quotes);
  const missingQuotes = new Set<string>();
  let holdingsValue = 0;
  let remainingCost = 0;
  for (const [isin, position] of positions) {
    if (position.quantity <= 1e-8) continue;
    remainingCost += position.costBasis;
    const quote = quotesByIsin.get(isin);
    if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) {
      missingQuotes.add(isin);
      continue;
    }
    holdingsValue += position.quantity * quote.price;
  }

  const valuationComplete = missingQuotes.size === 0 && incompleteLots.size === 0;
  const unrealizedPnl = valuationComplete ? holdingsValue - remainingCost : null;
  return {
    contributed: lifetimeContribution.amount,
    contributionMode: lifetimeContribution.mode,
    withdrawn,
    buyCount,
    buyVolume,
    feesAndTax,
    holdingsValue: valuationComplete ? holdingsValue : null,
    realizedPnl,
    unrealizedPnl,
    totalPnl: valuationComplete ? realizedPnl + (unrealizedPnl ?? 0) : null,
    openPositions: [...positions.values()].filter((position) => position.quantity > 1e-8).length,
    missingQuotes: [...missingQuotes].sort(),
    incompleteLots: [...incompleteLots].sort(),
  };
}
