/** Pure calculation helpers — no side effects */

import { resolveInstrumentIsin, isSecurityBuy, isSecuritySell, hasResolvableInstrumentIsin, isValidIsin } from "./instrument";
import { VWCE_ISIN } from "./types";
import type { Transaction } from "./types";
import {
  classifyTransactionAgainstHoldings,
  compareTransactionReplayOrder,
} from "./transactionValidation";

export function monthlyRate(annualRate: number): number {
  if (!Number.isFinite(annualRate) || annualRate <= -1) return 0;
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

export function inflate(presentValue: number, inflationRate: number, years: number): number {
  if (!Number.isFinite(presentValue) || !Number.isFinite(inflationRate)) return presentValue;
  const y = Math.max(0, years);
  return presentValue * Math.pow(1 + inflationRate, y);
}

export function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/** Parse YYYY-MM-DD as local calendar date (no UTC shift). */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatDateVN(iso: string): string {
  if (!iso) return "—";
  const parts = iso.slice(0, 10).split("-");
  if (parts.length < 3) return iso;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

export function formatMoney(n: number, currency = "EUR"): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isValidNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** quantity = (amount - fee - tax) / unitPrice when amount is total payment */
export function calcQuantity(amount: number, unitPrice: number, fee = 0, tax = 0): number {
  if (!isValidNumber(unitPrice) || unitPrice <= 0) return 0;
  if (!isValidNumber(amount)) return 0;
  const net = amount - (fee || 0) - (tax || 0);
  if (net <= 0) return 0;
  return net / unitPrice;
}

export type ProgressStatus = "green" | "yellow" | "red";

export function goalProgressStatus(opts: {
  targetAdjusted: number;
  protectedAmount: number;
  monthsRemaining: number;
}): ProgressStatus {
  const { targetAdjusted, protectedAmount, monthsRemaining } = opts;
  if (targetAdjusted <= 0) return "green";
  const ratio = protectedAmount / targetAdjusted;
  if (monthsRemaining < 12 && ratio < 1) return "red";
  if (ratio >= 1) return "green";
  if (ratio >= 0.9) return "yellow";
  return "red";
}

export function statusLabel(s: ProgressStatus): string {
  if (s === "green") return "Đúng tiến độ";
  if (s === "yellow") return "Cần chú ý";
  return "Nguy cơ thiếu";
}

export function requiredSafeAmount(opts: {
  targetAmount: number;
  inflationRate: number;
  baseYear: number;
  targetYear: number;
  useInflation: boolean;
  bufferPct: number;
  estimatedTax?: number;
  estimatedFees?: number;
}): number {
  let amount = opts.targetAmount;
  if (opts.useInflation) {
    const years = Math.max(0, opts.targetYear - opts.baseYear);
    amount = inflate(amount, opts.inflationRate, years);
  }
  return amount + amount * opts.bufferPct + (opts.estimatedTax ?? 0) + (opts.estimatedFees ?? 0);
}

export function etfToSell(opts: {
  requiredSafe: number;
  currentSafe: number;
  expectedFutureCash: number;
}): number {
  return Math.max(0, opts.requiredSafe - opts.currentSafe - opts.expectedFutureCash);
}

export type PositionState = {
  qty: number;
  costBasis: number;
  totalBought: number;
  totalSold: number;
};

export type PortfolioState = {
  /** Holdings keyed by normalized ISIN. */
  positions: Record<string, PositionState>;
  /**
   * Legacy convenience mirrors of VWCE position (IE00BK5BQT80).
   * Kept so existing UI/tests reading vwceQty continue to work.
   */
  vwceQty: number;
  vwceCostBasis: number;
  totalBought: number;
  totalSold: number;
  totalFees: number;
  totalTax: number;
  cashBalance: number;
  totalContributed: number;
  totalWithdrawn: number;
};

export type TxInput = {
  type: string;
  amount: number;
  date?: string;
  unitPrice?: number;
  quantity?: number;
  fee?: number;
  tax?: number;
  notes?: string;
  /** Multi-asset: ISIN for buy/sell security. */
  instrumentIsin?: string;
};

function emptyPosition(): PositionState {
  return { qty: 0, costBasis: 0, totalBought: 0, totalSold: 0 };
}

function syncVwceMirror(s: PortfolioState): void {
  const p = s.positions[VWCE_ISIN];
  s.vwceQty = p?.qty ?? 0;
  s.vwceCostBasis = p?.costBasis ?? 0;
  let bought = 0;
  let sold = 0;
  for (const pos of Object.values(s.positions)) {
    bought += pos.totalBought;
    sold += pos.totalSold;
  }
  s.totalBought = bought;
  s.totalSold = sold;
}

export function emptyPortfolio(): PortfolioState {
  return {
    positions: {},
    vwceQty: 0,
    vwceCostBasis: 0,
    totalBought: 0,
    totalSold: 0,
    totalFees: 0,
    totalTax: 0,
    cashBalance: 0,
    totalContributed: 0,
    totalWithdrawn: 0,
  };
}

export function getPosition(state: PortfolioState, isin: string): PositionState {
  const key = isin.trim().toUpperCase();
  return state.positions[key] ?? emptyPosition();
}

export function applyTransaction(state: PortfolioState, tx: TxInput): PortfolioState {
  const s: PortfolioState = {
    ...state,
    positions: { ...state.positions },
  };
  const fee = isValidNumber(tx.fee) ? tx.fee : 0;
  const tax = isValidNumber(tx.tax) ? tx.tax : 0;
  const amount = isValidNumber(tx.amount) ? tx.amount : 0;
  const hasSafeEconomics = amount > 0 && fee >= 0 && tax >= 0 && fee + tax <= amount;

  if (isSecurityBuy(tx.type)) {
    if (!hasSafeEconomics || !hasResolvableInstrumentIsin(tx)) return state;
    const isin = resolveInstrumentIsin(tx);
    if (!isin || !isValidIsin(isin)) return state;
    const unitPrice = tx.unitPrice ?? 0;
    const qty =
      tx.quantity != null && isValidNumber(tx.quantity) && tx.quantity > 0
        ? tx.quantity
        : calcQuantity(amount, unitPrice, fee, tax);
    if (!isValidNumber(qty) || qty <= 0) return state;
    const securitiesValue = amount - fee - tax;
    const prev = s.positions[isin] ?? emptyPosition();
    s.positions[isin] = {
      qty: prev.qty + qty,
      costBasis: prev.costBasis + securitiesValue,
      totalBought: prev.totalBought + securitiesValue,
      totalSold: prev.totalSold,
    };
    s.totalFees += fee;
    s.totalTax += tax;
    s.cashBalance -= amount;
    syncVwceMirror(s);
    return s;
  }

  if (isSecuritySell(tx.type)) {
    if (!hasSafeEconomics || !hasResolvableInstrumentIsin(tx)) return state;
    const isin = resolveInstrumentIsin(tx);
    if (!isin || !isValidIsin(isin)) return state;
    const qty = tx.quantity;
    if (!isValidNumber(qty) || qty <= 0) return state;
    const prev = s.positions[isin] ?? emptyPosition();
    // H2-B: never silently clamp an oversell and then credit the original proceeds.
    if (prev.qty <= 0 || qty > prev.qty) return state;
    const avg = prev.costBasis / prev.qty;
    s.positions[isin] = {
      qty: Math.max(0, prev.qty - qty),
      costBasis: Math.max(0, prev.costBasis - avg * qty),
      totalBought: prev.totalBought,
      totalSold: prev.totalSold + amount,
    };
    s.cashBalance += amount - fee - tax;
    s.totalFees += fee;
    s.totalTax += tax;
    syncVwceMirror(s);
    return s;
  }

  switch (tx.type) {
    case "cash_in":
      if (amount <= 0) return state;
      s.cashBalance += amount;
      s.totalContributed += amount;
      break;
    case "cash_out":
      if (amount <= 0) return state;
      s.cashBalance -= amount;
      s.totalWithdrawn += amount;
      break;
    case "tax":
      if (amount <= 0) return state;
      s.cashBalance -= amount;
      s.totalTax += amount;
      break;
    case "fee":
      if (amount <= 0) return state;
      s.cashBalance -= amount;
      s.totalFees += amount;
      break;
    case "safe_interest":
      if (amount <= 0) return state;
      s.cashBalance += amount;
      break;
    case "adjust":
      if (!isValidNumber(amount)) return state;
      s.cashBalance += amount;
      break;
  }
  return s;
}

/**
 * Canonical H2-B replay: stable date → createdAt → id ordering and derived
 * quarantine. Raw rows remain untouched; only accepted rows reach the ledger.
 */
export function replayTransactions(transactions: readonly Transaction[]): PortfolioState {
  let state = emptyPortfolio();
  const ordered = transactions
    .filter((transaction) => !transaction.deletedAt)
    .slice()
    .sort(compareTransactionReplayOrder);

  for (const transaction of ordered) {
    const isin = resolveInstrumentIsin(transaction);
    const held = isin ? getPosition(state, isin).qty : undefined;
    const classification = classifyTransactionAgainstHoldings(transaction, held);
    if (classification.status !== "accepted") continue;
    state = applyTransaction(state, classification.normalized);
  }
  return state;
}

export function avgCost(state: PortfolioState, isin: string = VWCE_ISIN): number {
  const p = getPosition(state, isin);
  if (p.qty <= 0) return 0;
  return p.costBasis / p.qty;
}

/**
 * Mark-to-market portfolio value.
 * prices: map ISIN → price. Missing price → position counted as missing (not 0 in detail).
 */
export function portfolioMarketValue(
  state: PortfolioState,
  prices: Record<string, number | undefined>,
): {
  total: number;
  cash: number;
  securities: number;
  missingIsins: string[];
  byIsin: Record<string, { qty: number; price: number | null; value: number | null }>;
} {
  const byIsin: Record<string, { qty: number; price: number | null; value: number | null }> = {};
  const missingIsins: string[] = [];
  let securities = 0;
  for (const [isin, pos] of Object.entries(state.positions)) {
    if (pos.qty <= 0) continue;
    const price = prices[isin];
    if (typeof price === "number" && Number.isFinite(price) && price > 0) {
      const value = pos.qty * price;
      securities += value;
      byIsin[isin] = { qty: pos.qty, price, value };
    } else {
      missingIsins.push(isin);
      byIsin[isin] = { qty: pos.qty, price: null, value: null };
    }
  }
  return {
    total: securities + state.cashBalance,
    cash: state.cashBalance,
    securities,
    missingIsins,
    byIsin,
  };
}

/** Build equity time series from chronological transactions + current price. */
export function buildEquitySeries(
  transactions: Array<
    Pick<Transaction, "date" | "type" | "amount"> &
      Partial<Pick<Transaction, "id" | "createdAt" | "notes" | "unitPrice" | "quantity" | "fee" | "tax" | "instrumentIsin" | "deletedAt">>
  >,
  currentPrice: number,
  pricesByIsin?: Record<string, number>,
): { date: string; value: number }[] {
  const ordered = transactions
    .filter((transaction) => !transaction.deletedAt)
    .map((transaction) => ({
      transaction,
      // Actual persisted rows always carry id/createdAt. The pure fallback keeps
      // lightweight historical chart callers deterministic without array order.
      id: transaction.id ?? JSON.stringify([
        transaction.date, transaction.type, transaction.amount, transaction.unitPrice,
        transaction.quantity, transaction.fee, transaction.tax, transaction.instrumentIsin,
      ]),
      createdAt: transaction.createdAt ?? "",
    }))
    .sort((left, right) => compareTransactionReplayOrder(
      { date: left.transaction.date, createdAt: left.createdAt, id: left.id },
      { date: right.transaction.date, createdAt: right.createdAt, id: right.id },
    ));
  if (ordered.length === 0) return [];
  let s = emptyPortfolio();
  const out: { date: string; value: number }[] = [];
  for (const { transaction, id, createdAt } of ordered) {
    const isin = resolveInstrumentIsin(transaction);
    const held = isin ? getPosition(s, isin).qty : undefined;
    const classification = classifyTransactionAgainstHoldings(
      { ...transaction, id, createdAt, updatedAt: createdAt },
      held,
    );
    if (classification.status === "accepted") {
      s = applyTransaction(s, classification.normalized);
    }
    const prices: Record<string, number | undefined> = { ...(pricesByIsin ?? {}) };
    if (prices[VWCE_ISIN] == null && currentPrice > 0) prices[VWCE_ISIN] = currentPrice;
    if (isin && transaction.unitPrice && transaction.unitPrice > 0) prices[isin] = transaction.unitPrice;
    const mv = portfolioMarketValue(s, prices);
    out.push({ date: transaction.date, value: round2(mv.total) });
  }
  return out;
}

export type SimMonth = {
  year: number;
  month: number;
  vwce: number;
  cash: number;
  total: number;
  contributed: number;
  withdrawn: number;
};

export type SimWithdrawal = { year: number; month: number; amount: number };
export type SimTransfer = { year: number; month: number; amount: number };

export type SimParams = {
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
  initialVwce: number;
  initialCash: number;
  contributionYear1: number;
  contributionFromYear2: number;
  vwceAnnualReturn: number;
  safeAnnualReturn: number;
  contributionAtEndOfMonth?: boolean;
  contributionGrowthPct?: number;
  withdrawals?: SimWithdrawal[];
  transfers?: SimTransfer[];
};

export function simulateMonthly(params: SimParams): SimMonth[] {
  const rVwce = monthlyRate(params.vwceAnnualReturn);
  const rSafe = monthlyRate(params.safeAnnualReturn);
  let vwce = params.initialVwce;
  let cash = params.initialCash;
  let contributed = 0;
  let withdrawn = 0;
  const out: SimMonth[] = [];
  let y = params.startYear;
  let m = params.startMonth;
  const atEnd = params.contributionAtEndOfMonth !== false;
  const growth = params.contributionGrowthPct ?? 0;

  while (y < params.endYear || (y === params.endYear && m <= params.endMonth)) {
    vwce *= 1 + rVwce;
    cash *= 1 + rSafe;

    const yearIndex = (y - params.startYear) * 12 + (m - params.startMonth);
    const yearsSinceStart = Math.floor(Math.max(0, yearIndex) / 12);
    let contrib =
      yearsSinceStart <= 0 ? params.contributionYear1 : params.contributionFromYear2;
    if (yearsSinceStart >= 2 && growth !== 0) {
      contrib = params.contributionFromYear2 * Math.pow(1 + growth, yearsSinceStart - 1);
    }

    if (!atEnd && contrib > 0) {
      vwce += contrib;
      contributed += contrib;
    }

    for (const t of params.transfers ?? []) {
      if (t.year === y && t.month === m && t.amount > 0) {
        const move = Math.min(vwce, t.amount);
        vwce -= move;
        cash += move;
      }
    }

    for (const w of params.withdrawals ?? []) {
      if (w.year === y && w.month === m && w.amount > 0) {
        let need = w.amount;
        const fromCash = Math.min(cash, need);
        cash -= fromCash;
        need -= fromCash;
        if (need > 0) {
          const fromVwce = Math.min(vwce, need);
          vwce -= fromVwce;
          need -= fromVwce;
        }
        withdrawn += w.amount - need;
      }
    }

    if (atEnd && contrib > 0) {
      vwce += contrib;
      contributed += contrib;
    }

    out.push({
      year: y,
      month: m,
      vwce: round2(vwce),
      cash: round2(cash),
      total: round2(vwce + cash),
      contributed: round2(contributed),
      withdrawn: round2(withdrawn),
    });

    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function yearEndSnapshots(months: SimMonth[]): SimMonth[] {
  const map = new Map<number, SimMonth>();
  for (const row of months) map.set(row.year, row);
  return [...map.values()].sort((a, b) => a.year - b.year);
}

export function csvEscape(value: string | number): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Đọc số người dùng gõ tay, chấp nhận dấu phẩy thập phân kiểu VN/DE.
 * Quy tắc: dấu phân cách thập phân là dấu xuất hiện SAU CÙNG.
 * "123,446" -> 123.446 · "1.234,56" -> 1234.56 · "1,234.56" -> 1234.56 · "12 €" -> 12
 */
export function parseDecimal(input: string | number | null | undefined): number {
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  const raw = String(input ?? "").replace(/[\s\u00A0€%]/g, "");
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = raw.replace(/,/g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
