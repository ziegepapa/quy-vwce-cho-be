/** Pure calculation helpers */
export function monthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}
export function inflate(presentValue: number, inflationRate: number, years: number): number {
  return presentValue * Math.pow(1 + inflationRate, years);
}
export function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function formatDateVN(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
export function formatMoney(n: number, currency = "EUR"): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
export function calcQuantity(amount: number, unitPrice: number, fee = 0, tax = 0): number {
  if (unitPrice <= 0) return 0;
  return (amount - fee - tax) / unitPrice;
}
export type ProgressStatus = "green" | "yellow" | "red";
export function goalProgressStatus(opts: {
  targetAdjusted: number; protectedAmount: number; monthsRemaining: number;
}): ProgressStatus {
  const { targetAdjusted, protectedAmount, monthsRemaining } = opts;
  if (targetAdjusted <= 0) return "green";
  const ratio = protectedAmount / targetAdjusted;
  if (monthsRemaining < 12 && ratio < 1) return "red";
  if (ratio >= 1) return "green";
  if (ratio >= 0.9) return "yellow";
  return "red";
}
export function requiredSafeAmount(opts: {
  targetAmount: number; inflationRate: number; baseYear: number; targetYear: number;
  useInflation: boolean; bufferPct: number; estimatedTax?: number; estimatedFees?: number;
}): number {
  let amount = opts.targetAmount;
  if (opts.useInflation) {
    const years = Math.max(0, opts.targetYear - opts.baseYear);
    amount = inflate(amount, opts.inflationRate, years);
  }
  return amount + amount * opts.bufferPct + (opts.estimatedTax ?? 0) + (opts.estimatedFees ?? 0);
}
export function etfToSell(opts: { requiredSafe: number; currentSafe: number; expectedFutureCash: number }): number {
  return Math.max(0, opts.requiredSafe - opts.currentSafe - opts.expectedFutureCash);
}
export type PortfolioState = {
  vwceQty: number; vwceCostBasis: number; totalBought: number; totalSold: number;
  totalFees: number; totalTax: number; cashBalance: number; totalContributed: number; totalWithdrawn: number;
};
export type TxInput = { type: string; amount: number; unitPrice?: number; quantity?: number; fee?: number; tax?: number };
export function emptyPortfolio(): PortfolioState {
  return { vwceQty: 0, vwceCostBasis: 0, totalBought: 0, totalSold: 0, totalFees: 0, totalTax: 0, cashBalance: 0, totalContributed: 0, totalWithdrawn: 0 };
}
export function applyTransaction(state: PortfolioState, tx: TxInput): PortfolioState {
  const s = { ...state };
  const fee = tx.fee ?? 0;
  const tax = tx.tax ?? 0;
  switch (tx.type) {
    case "buy_vwce": {
      const qty = tx.quantity ?? calcQuantity(tx.amount, tx.unitPrice ?? 0, fee, tax);
      s.vwceCostBasis += tx.amount; s.vwceQty += qty; s.totalBought += tx.amount;
      s.totalFees += fee; s.totalTax += tax; s.cashBalance -= tx.amount; s.totalContributed += tx.amount;
      break;
    }
    case "sell_vwce": {
      const qty = tx.quantity ?? 0;
      if (qty > 0 && s.vwceQty > 0) {
        const avg = s.vwceCostBasis / s.vwceQty;
        s.vwceCostBasis = Math.max(0, s.vwceCostBasis - avg * qty);
        s.vwceQty = Math.max(0, s.vwceQty - qty);
        s.totalSold += tx.amount; s.cashBalance += tx.amount - fee - tax;
        s.totalFees += fee; s.totalTax += tax;
      }
      break;
    }
    case "cash_in": s.cashBalance += tx.amount; s.totalContributed += tx.amount; break;
    case "cash_out": s.cashBalance -= tx.amount; s.totalWithdrawn += tx.amount; break;
    case "tax": s.cashBalance -= tx.amount; s.totalTax += tx.amount; break;
    case "fee": s.cashBalance -= tx.amount; s.totalFees += tx.amount; break;
    case "safe_interest": s.cashBalance += tx.amount; break;
    case "adjust": s.cashBalance += tx.amount; break;
  }
  return s;
}
export type SimMonth = { year: number; month: number; vwce: number; cash: number; total: number; contributed: number; withdrawn: number };
export type SimParams = {
  startYear: number; startMonth: number; endYear: number; endMonth: number;
  initialVwce: number; initialCash: number; contributionYear1: number; contributionFromYear2: number;
  vwceAnnualReturn: number; safeAnnualReturn: number; contributionAtEndOfMonth?: boolean;
};
export function simulateMonthly(params: SimParams): SimMonth[] {
  const rVwce = monthlyRate(params.vwceAnnualReturn);
  const rSafe = monthlyRate(params.safeAnnualReturn);
  let vwce = params.initialVwce, cash = params.initialCash, contributed = 0, withdrawn = 0;
  const out: SimMonth[] = [];
  let y = params.startYear, m = params.startMonth;
  while (y < params.endYear || (y === params.endYear && m <= params.endMonth)) {
    vwce *= 1 + rVwce; cash *= 1 + rSafe;
    const yearIndex = y - params.startYear + (m < params.startMonth ? -1 : 0);
    const contrib = yearIndex <= 0 ? params.contributionYear1 : params.contributionFromYear2;
    if (params.contributionAtEndOfMonth !== false) { vwce += contrib; contributed += contrib; }
    out.push({ year: y, month: m, vwce: round2(vwce), cash: round2(cash), total: round2(vwce + cash), contributed: round2(contributed), withdrawn: round2(withdrawn) });
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
export function yearEndSnapshots(months: SimMonth[]): SimMonth[] {
  const map = new Map<number, SimMonth>();
  for (const row of months) map.set(row.year, row);
  return [...map.values()].sort((a, b) => a.year - b.year);
}
