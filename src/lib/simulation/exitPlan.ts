/**
 * Read-only mathematical Exit Plan illustration. This never executes sales,
 * predicts future holdings, alters protectedAmount or calculates tax.
 */
export type ExitWindowMonths = 12 | 18 | 24;
export type ReviewHorizonYears = 3 | 5 | 7;
export type ExitInstallment = {
  date: string;
  ordinal: number;
  plannedCents: number;
  remainingBudgetCents: number;
};

export function validExitDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2100) return false;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** Calendar months; month-end dates clamp to the last valid day. UTC avoids DST. */
export function monthsBefore(date: string, months: number): string | null {
  if (!validExitDate(date) || !Number.isSafeInteger(months) || months < 0 || months > 1200) return null;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1;
  const day = Number(date.slice(8, 10));
  const firstOfTarget = new Date(Date.UTC(year, month - months, 1));
  const targetYear = firstOfTarget.getUTCFullYear();
  const targetMonth = firstOfTarget.getUTCMonth();
  if (targetYear < 1900 || targetYear > 2100) return null;
  const monthEnd = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return [
    String(targetYear).padStart(4, "0"),
    String(targetMonth + 1).padStart(2, "0"),
    String(Math.min(day, monthEnd)).padStart(2, "0"),
  ].join("-");
}

/** Only a user-entered positive nominal EUR budget is accepted. No default. */
export function parseIllustrationBudgetCents(raw: string): number | null {
  const normalized = raw.trim();
  if (!/^(?:0|[1-9][0-9]{0,8})(?:[.,][0-9]{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.replace(",", ".").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return cents > 0 && Number.isSafeInteger(cents) ? cents : null;
}

/**
 * N equal-budget quarterly installments, starting N months ahead of Goal use.
 * Remainder cents assigned to final installment: exact sum, never invented prices.
 * The remainder is the user's *illustration budget*, NOT a portfolio balance.
 */
export function buildExitInstallments(
  goalDate: string | null | undefined,
  userBudget: string,
  windowMonths: ExitWindowMonths,
): ExitInstallment[] {
  if (!goalDate || !validExitDate(goalDate) || !([12, 18, 24] as number[]).includes(windowMonths)) return [];
  const budgetCents = parseIllustrationBudgetCents(userBudget);
  if (budgetCents === null) return [];
  const count = windowMonths / 3;
  const baseCents = Math.floor(budgetCents / count);
  let remaining = budgetCents;
  const rows: ExitInstallment[] = [];
  for (let i = 0; i < count; i++) {
    const date = monthsBefore(goalDate, windowMonths - i * 3);
    if (!date) return [];
    const plannedCents = i === count - 1 ? remaining : baseCents;
    remaining -= plannedCents;
    rows.push({ date, ordinal: i + 1, plannedCents, remainingBudgetCents: remaining });
  }
  return rows;
}
