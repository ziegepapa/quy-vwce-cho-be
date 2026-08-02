import { round2 } from "../calc";

export type Mode = "A" | "B" | "C";

export type Scenario = {
  id: string;
  label: string;
  rate: number;
};

export type YearPoint = {
  yearIndex: number;
  total: number;
  contributed: number;
};

export type ProjectInput = {
  years: number;
  monthlyContribution: number;
  annualReturn: number;
  initialBalance: number;
  lumpSum: number;
  annualContributionGrowth: number;
  ter: number;
};

export type ProjectOutput = {
  yearEnds: YearPoint[];
  terminal: number;
  contributed: number;
  interest: number;
};

export const TAX_RATE = 0.26375;
export const TEILFREISTELLUNG = 0.3;
export const SPARERPAUSCH = 1000;
export const DEFAULT_TER = 0.0022;
export const MAX_YEARS = 40;

export function projectEnd(input: ProjectInput): ProjectOutput {
  const years = Math.max(0, Math.min(MAX_YEARS, Math.floor(input.years)));
  const months = years * 12;
  const rMonth =
    input.annualReturn > -1
      ? Math.pow(1 + input.annualReturn, 1 / 12) - 1
      : 0;

  let balance = Math.max(0, input.initialBalance) + Math.max(0, input.lumpSum);
  let contributed = Math.max(0, input.lumpSum);
  let monthly = Math.max(0, input.monthlyContribution);
  const growth = input.annualContributionGrowth;
  const ter = Math.max(0, input.ter);

  const yearEnds: YearPoint[] = [{ yearIndex: 0, total: round2(balance), contributed: round2(contributed) }];

  if (months === 0) {
    return {
      yearEnds,
      terminal: round2(balance),
      contributed: round2(contributed),
      interest: 0,
    };
  }

  for (let m = 1; m <= months; m++) {
    balance *= 1 + rMonth;
    if (monthly > 0) {
      balance += monthly;
      contributed += monthly;
    }
    if (m % 12 === 0) {
      if (ter > 0 && balance > 0) {
        balance *= 1 - ter;
      }
      if (growth !== 0) {
        monthly = Math.max(0, monthly * (1 + growth));
      }
      yearEnds.push({
        yearIndex: m / 12,
        total: round2(balance),
        contributed: round2(contributed),
      });
    }
  }

  const terminal = round2(balance);
  const contrib = round2(contributed);
  return {
    yearEnds,
    terminal,
    contributed: contrib,
    interest: round2(terminal - contrib - Math.max(0, input.initialBalance)),
  };
}

export function estimateGermanExitTax(
  terminal: number,
  contributed: number,
  initialCostBasis: number,
): { afterTax: number; tax: number } {
  const costBasis = Math.max(0, contributed + Math.max(0, initialCostBasis));
  const gain = Math.max(0, terminal - costBasis);
  const afterTeil = gain * (1 - TEILFREISTELLUNG);
  const taxable = Math.max(0, afterTeil - SPARERPAUSCH);
  const tax = round2(taxable * TAX_RATE);
  return { tax, afterTax: round2(terminal - tax) };
}

export function findMonthlyForTarget(
  target: number,
  base: Omit<ProjectInput, "monthlyContribution">,
): number {
  if (target <= 0 || base.years <= 0) return 0;
  const zero = projectEnd({ ...base, monthlyContribution: 0 });
  if (zero.terminal >= target) return 0;

  let lo = 0;
  let hi = Math.max(target, 1);
  let reached = false;
  for (let i = 0; i < 20; i++) {
    const r = projectEnd({ ...base, monthlyContribution: hi });
    if (r.terminal >= target) {
      reached = true;
      break;
    }
    hi *= 2;
    if (hi > 1e7) break;
  }
  if (!reached) {
    const atMax = projectEnd({ ...base, monthlyContribution: hi });
    if (atMax.terminal < target) return -1;
  }
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const r = projectEnd({ ...base, monthlyContribution: mid });
    if (r.terminal >= target) hi = mid;
    else lo = mid;
  }
  return round2(hi);
}

export function findYearsForTarget(
  target: number,
  base: Omit<ProjectInput, "years">,
): { years: number; reached: boolean } {
  if (target <= 0) return { years: 0, reached: true };
  const at0 = projectEnd({ ...base, years: 0 });
  if (at0.terminal >= target) return { years: 0, reached: true };

  let lo = 0;
  let hi = MAX_YEARS;
  const atMax = projectEnd({ ...base, years: MAX_YEARS });
  if (atMax.terminal < target) return { years: MAX_YEARS, reached: false };

  for (let i = 0; i < 32; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const r = projectEnd({ ...base, years: mid });
    if (r.terminal >= target) hi = mid;
    else lo = mid + 1;
  }
  return { years: hi, reached: true };
}

export function purchasingPower(nominal: number, inflation: number, years: number): number {
  if (inflation <= -1 || years <= 0) return nominal;
  return round2(nominal / Math.pow(1 + inflation, years));
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function moneyEq(a: number, b: number): boolean {
  return round2(a) === round2(b);
}

export function rateEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-4;
}
