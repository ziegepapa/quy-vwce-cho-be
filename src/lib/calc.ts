/** Pure calculation helpers — no side effects */

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

export type PortfolioState = {
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
  unitPrice?: number;
  quantity?: number;
  fee?: number;
  tax?: number;
};

export function emptyPortfolio(): PortfolioState {
  return {
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

export function applyTransaction(state: PortfolioState, tx: TxInput): PortfolioState {
  const s = { ...state };
  const fee = isValidNumber(tx.fee) ? tx.fee : 0;
  const tax = isValidNumber(tx.tax) ? tx.tax : 0;
  const amount = isValidNumber(tx.amount) ? tx.amount : 0;

  switch (tx.type) {
    case "buy_vwce": {
      const unitPrice = tx.unitPrice ?? 0;
      let qty =
        tx.quantity != null && isValidNumber(tx.quantity) && tx.quantity > 0
          ? tx.quantity
          : calcQuantity(amount, unitPrice, fee, tax);
      if (!isValidNumber(qty) || qty < 0) qty = 0;
      const securitiesValue = Math.max(0, amount - fee - tax);
      s.vwceCostBasis += securitiesValue;
      s.vwceQty += qty;
      s.totalBought += securitiesValue;
      s.totalFees += fee;
      s.totalTax += tax;
      s.cashBalance -= amount;
      break;
    }
    case "sell_vwce": {
      let qty = tx.quantity ?? 0;
      if (!isValidNumber(qty) || qty < 0) qty = 0;
      if (qty > s.vwceQty) qty = s.vwceQty;
      if (qty > 0 && s.vwceQty > 0) {
        const avg = s.vwceCostBasis / s.vwceQty;
        s.vwceCostBasis = Math.max(0, s.vwceCostBasis - avg * qty);
        s.vwceQty = Math.max(0, s.vwceQty - qty);
        s.totalSold += amount;
        s.cashBalance += amount - fee - tax;
        s.totalFees += fee;
        s.totalTax += tax;
      }
      break;
    }
    case "cash_in":
      s.cashBalance += amount;
      s.totalContributed += amount;
      break;
    case "cash_out":
      s.cashBalance -= amount;
      s.totalWithdrawn += amount;
      break;
    case "tax":
      s.cashBalance -= amount;
      s.totalTax += amount;
      break;
    case "fee":
      s.cashBalance -= amount;
      s.totalFees += amount;
      break;
    case "safe_interest":
      s.cashBalance += amount;
      break;
    case "adjust":
      s.cashBalance += amount;
      break;
  }
  return s;
}

export function avgCost(state: PortfolioState): number {
  if (state.vwceQty <= 0) return 0;
  return state.vwceCostBasis / state.vwceQty;
}

/** Build equity time series from chronological transactions + current price. */
export function buildEquitySeries(
  transactions: { date: string; type: string; amount: number; unitPrice?: number; quantity?: number; fee?: number; tax?: number }[],
  currentPrice: number,
): { date: string; value: number }[] {
  const sorted = [...transactions].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (sorted.length === 0) return [];
  let s = emptyPortfolio();
  const out: { date: string; value: number }[] = [];
  for (const t of sorted) {
    s = applyTransaction(s, t);
    const price = t.unitPrice && t.unitPrice > 0 ? t.unitPrice : currentPrice;
    const total = s.vwceQty * (price || 0) + s.cashBalance;
    out.push({ date: t.date, value: round2(total) });
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
 * Đọc số do người dùng nhập, chấp nhận cả kiểu VN/DE và kiểu Anh–Mỹ:
 *   "123,446"   → 123.446
 *   "1.234,56"  → 1234.56
 *   "1,234.56"  → 1234.56
 *   "12 €"      → 12
 *   "" | rác    → 0
 * Quy tắc: dấu phân cách thập phân là dấu xuất hiện SAU CÙNG.
 */
export function parseDecimal(input: string | number | null | undefined): number {
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  const s = String(input ?? "")
    .trim()
    .replace(/[\s\u00A0€%]/g, "");
  if (!s) return 0;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = s;
  } else if (lastComma > lastDot) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = s.replace(/,/g, "");
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
