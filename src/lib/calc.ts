export function monthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

/** Present → future value with annual compounding. */
export function inflate(presentValue: number, inflationRate: number, years: number): number {
  if (years <= 0) return presentValue;
  return presentValue * Math.pow(1 + inflationRate, years);
}

/** Calendar months between two dates (approximate, day-of-month aware). */
export function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/** Parse ISO date string as local calendar date (avoids UTC shift). */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatDateVN(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** German-style money: 1.234,56 € */
export function formatMoney(n: number, currency = "EUR"): string {
  const v = Number.isFinite(n) ? n : 0;
  return (
    v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    (currency === "EUR" ? " €" : ` ${currency}`)
  );
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
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
  if (ratio >= 1) return "green";
  if (monthsRemaining <= 0) return ratio >= 0.95 ? "yellow" : "red";
  if (ratio >= 0.9) return "yellow";
  return "red";
}

export function statusLabel(s: ProgressStatus): string {
  if (s === "green") return "Đúng tiến độ";
  if (s === "yellow") return "Cần theo dõi";
  return "Thiếu";
}

/** Required safe (cash) amount for hard goals within horizon months. */
export function requiredSafeAmount(opts: {
  goals: { dueDate: string; amount: number; mode: string; baseYear: number; inflationRate: number; bufferPct: number; protectedAmount: number; urgency: string }[];
  asOf: Date;
  horizonMonths: number;
}): number {
  const { goals, asOf, horizonMonths } = opts;
  let need = 0;
  for (const g of goals) {
    if (g.urgency !== "hard") continue;
    const due = parseDate(g.dueDate);
    const months = monthsBetween(asOf, due);
    if (months < 0 || months > horizonMonths) continue;
    const years = Math.max(0, due.getFullYear() - g.baseYear);
    const adj =
      g.mode === "purchasing_power"
        ? inflate(g.amount, g.inflationRate, years) * (1 + g.bufferPct)
        : g.amount * (1 + g.bufferPct);
    need += Math.max(0, adj - (g.protectedAmount || 0));
  }
  return need;
}

export function etfToSell(opts: {
  cashNeeded: number;
  cashAvailable: number;
  unitPrice: number;
}): { sellCash: number; sellQty: number } {
  const gap = Math.max(0, opts.cashNeeded - opts.cashAvailable);
  if (gap <= 0 || opts.unitPrice <= 0) return { sellCash: 0, sellQty: 0 };
  return { sellCash: gap, sellQty: gap / opts.unitPrice };
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
      // Tiền bán / phí / thuế luôn ghi nhận — độc lập với số lượng trừ được
      s.totalSold += amount;
      s.cashBalance += amount - fee - tax;
      s.totalFees += fee;
      s.totalTax += tax;
      let qty = tx.quantity ?? 0;
      if (!isValidNumber(qty) || qty < 0) qty = 0;
      if (qty > s.vwceQty) qty = s.vwceQty;
      if (qty > 0 && s.vwceQty > 0) {
        const avg = s.vwceCostBasis / s.vwceQty;
        s.vwceCostBasis = Math.max(0, s.vwceCostBasis - avg * qty);
        s.vwceQty = Math.max(0, s.vwceQty - qty);
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
  const sorted = [...transactions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
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

export type SimParams = {
  months: number;
  monthlyContribution: number;
  annualReturn: number;
  initialBalance: number;
  initialCash: number;
  contributionGrowth?: number;
  withdrawals?: { monthIndex: number; amount: number }[];
};

export type SimMonth = {
  monthIndex: number;
  vwce: number;
  cash: number;
  total: number;
  contributed: number;
  withdrawn: number;
};

export function simulateMonthly(params: SimParams): SimMonth[] {
  const {
    months,
    monthlyContribution,
    annualReturn,
    initialBalance,
    initialCash,
    contributionGrowth = 0,
    withdrawals = [],
  } = params;
  const r = monthlyRate(annualReturn);
  let vwce = Math.max(0, initialBalance);
  let cash = Math.max(0, initialCash);
  let contributed = 0;
  let withdrawn = 0;
  const wdMap = new Map<number, number>();
  for (const w of withdrawals) {
    wdMap.set(w.monthIndex, (wdMap.get(w.monthIndex) || 0) + w.amount);
  }
  const out: SimMonth[] = [];
  for (let m = 1; m <= months; m++) {
    const growthFactor = contributionGrowth
      ? Math.pow(1 + contributionGrowth, Math.floor((m - 1) / 12))
      : 1;
    const contrib = monthlyContribution * growthFactor;
    if (contrib > 0) {
      vwce += contrib;
      contributed += contrib;
    }
    vwce *= 1 + r;
    const wd = wdMap.get(m) || 0;
    if (wd > 0) {
      if (cash >= wd) {
        cash -= wd;
      } else {
        const fromVwce = wd - cash;
        cash = 0;
        vwce = Math.max(0, vwce - fromVwce);
      }
      withdrawn += wd;
    }
    out.push({
      monthIndex: m,
      vwce: round2(vwce),
      cash: round2(cash),
      total: round2(vwce + cash),
      contributed: round2(contributed),
      withdrawn: round2(withdrawn),
    });
  }
  return out;
}

export function yearEndSnapshots(months: SimMonth[]): SimMonth[] {
  return months.filter((m) => m.monthIndex % 12 === 0);
}

export function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Accept DE/EN decimal strings: 1.234,56 or 1,234.56 or 1234.56 */
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
