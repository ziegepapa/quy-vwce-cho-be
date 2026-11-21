import { replayTransactions } from "./calc";
import { computeHeroLifetimeContribution } from "./heroLifetime";
import { VWCE_ISIN } from "./types";
import type { Quote, Transaction } from "./types";

export type ValueHistoryPoint = {
  /** YYYY-MM */
  month: string;
  /** Short locale-aware label, e.g. "T7" / "Jul". */
  label: string;
  /** Portfolio value at month end (securities + non-negative cash). */
  value: number;
  /**
   * Cumulative contributions up to month end — the SAME definition as the
   * hero's "Đã góp" (computeHeroLifetimeContribution). The honest chart draws
   * this next to `value`; the gap between the two lines is the real gain.
   */
  contributed: number;
  /**
   * ISINs held at month end with NO quote known on or before the cutoff.
   * Such positions are EXCLUDED from `value` for that month — never priced
   * with a later (future) quote — and listed here instead of silently
   * contributing 0. Always set by buildValueHistory.
   */
  unpricedIsins: string[];
  /** Held positions whose latest known price comes from an earlier month. */
  carriedForwardIsins: string[];
};

const MONTH_LABEL_VI = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];
const MONTH_LABEL_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function lastDayOfMonth(year: number, monthIndex: number): string {
  const last = new Date(year, monthIndex + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

/**
 * Monthly portfolio value history from REAL data only: replayed transactions
 * plus recorded quotes. Returns null when there are fewer than 2 months of
 * history — a chart with one point tells no story.
 * Pure: no Date.now() (pass `now`), no storage, no network.
 */
export function buildValueHistory(input: {
  transactions: readonly Transaction[];
  quotes: readonly Pick<Quote, "instrumentIsin" | "price" | "asOf">[];
  locale: "vi" | "de";
  /** settings.trackInAppCash — picks the contribution mode, same as the hero. */
  trackInAppCash?: boolean | null;
  now?: Date;
}): ValueHistoryPoint[] | null {
  const { transactions, quotes, locale, trackInAppCash } = input;
  const now = input.now ?? new Date();

  const dated = transactions.filter((t) => !t.deletedAt && /^\d{4}-\d{2}-\d{2}/.test(t.date));
  if (dated.length === 0) return null;

  const first = dated.map((t) => t.date.slice(0, 7)).sort()[0];
  const [firstYear, firstMonth] = first.split("-").map(Number);
  const endYear = now.getFullYear();
  const endMonth = now.getMonth();

  const months: { year: number; monthIndex: number }[] = [];
  let y = firstYear;
  let m = firstMonth - 1;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    months.push({ year: y, monthIndex: m });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  if (months.length < 2) return null;

  const sortedQuotes = quotes
    .filter((q) => Number.isFinite(q.price) && q.price > 0 && /^\d{4}-\d{2}-\d{2}/.test(q.asOf))
    .slice()
    .sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0));

  // Group quotes by ISIN (each group stays sorted by asOf). Legacy quotes
  // without an ISIN are VWCE, matching the transaction alias rule.
  const quotesByIsin = new Map<string, typeof sortedQuotes>();
  for (const q of sortedQuotes) {
    const isin = q.instrumentIsin || VWCE_ISIN;
    const list = quotesByIsin.get(isin);
    if (list) list.push(q);
    else quotesByIsin.set(isin, [q]);
  }

  const today = `${monthKey(endYear, endMonth)}-${String(now.getDate()).padStart(2, "0")}`;
  const labels = locale === "de" ? MONTH_LABEL_DE : MONTH_LABEL_VI;
  const points: ValueHistoryPoint[] = [];

  for (const { year, monthIndex } of months) {
    const month = monthKey(year, monthIndex);
    const cutoff = month === today.slice(0, 7) ? today : lastDayOfMonth(year, monthIndex);
    const state = replayTransactions(dated.filter((t) => t.date <= cutoff));
    // Sum every held position at the latest price KNOWN on the cutoff date
    // (carry-forward). NEVER use a quote dated after the cutoff: a position
    // held before its first quote is excluded from this month's value and
    // listed in `unpricedIsins` instead of silently contributing 0.
    let value = Math.max(0, state.cashBalance);
    const unpricedIsins: string[] = [];
    const carriedForwardIsins: string[] = [];
    for (const [isin, pos] of Object.entries(state.positions)) {
      if (pos.qty <= 0) continue;
      const series = quotesByIsin.get(isin) ?? [];
      let latest;
      for (const q of series) {
        if (q.asOf <= cutoff) latest = q;
        else break;
      }
      if (!latest) {
        unpricedIsins.push(isin);
        continue;
      }
      if (latest.asOf.slice(0, 7) !== month) carriedForwardIsins.push(isin);
      value += pos.qty * latest.price;
    }
    // Cumulative contributions up to this cutoff — same definition as the
    // hero's lifetime figure, so the chart's "Đã góp" line always agrees
    // with the hero.
    const contributed = computeHeroLifetimeContribution({
      transactions: dated.filter((t) => t.date <= cutoff),
      trackInAppCash,
    }).amount;
    points.push({
      month,
      label: labels[monthIndex],
      value: Math.round(value * 100) / 100,
      contributed: Math.round(contributed * 100) / 100,
      unpricedIsins,
      carriedForwardIsins,
    });
  }

  return points;
}
