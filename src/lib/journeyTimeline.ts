import type { Transaction } from "./types";
import type { ValueHistoryPoint } from "./valueHistory";

export type JourneyEventKind = "start" | "milestone" | "now";

export type JourneyEvent = {
  kind: JourneyEventKind;
  /** Display date: YYYY-MM-DD for start/now, YYYY-MM for milestones (month precision). */
  date: string;
  /** Short date label, locale-aware (e.g. "8/2026" / "8.2026", or "T7" / "Jul"). */
  dateLabel: string;
  /** Event title, locale-aware. */
  title: string;
  /** One-line detail, locale-aware. */
  detail: string;
};

/** Value milestones worth marking on the journey. */
const MILESTONES = [1000, 2000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];

const CONTRIBUTION_TYPES = new Set<Transaction["type"]>([
  "cash_in",
  "buy_vwce",
  "buy_security",
]);

function formatDateLabel(iso: string, locale: "vi" | "de"): string {
  const [y, m, d] = iso.split("-").map(Number);
  return locale === "de" ? `${d}.${m}.${y}` : `${d}/${m}/${y}`;
}

function formatMoneyShort(value: number, locale: "vi" | "de"): string {
  const rounded = Math.round(value);
  const grouped = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return locale === "de" ? `${grouped} €` : `${grouped} €`;
}

/**
 * Journey timeline from REAL data only: the first contribution, the months
 * the portfolio first crossed value milestones, and the current state.
 * Returns null when there is nothing to tell (no contributions).
 * Pure: no Date.now() (pass `now`), no storage, no network.
 */
export function buildJourneyTimeline(input: {
  transactions: readonly Transaction[];
  valueHistory: readonly ValueHistoryPoint[] | null;
  locale: "vi" | "de";
  now?: Date;
}): JourneyEvent[] | null {
  const { transactions, valueHistory, locale } = input;
  const now = input.now ?? new Date();

  const eligible = transactions.filter(
    (t) => !t.deletedAt && CONTRIBUTION_TYPES.has(t.type) && /^\d{4}-\d{2}-\d{2}/.test(t.date) && t.amount > 0,
  );
  if (eligible.length === 0) return null;

  const sorted = [...eligible].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];

  const copy = {
    vi: {
      start: "Góp đầu tiên",
      startDetail: (amount: string) => `Bắt đầu hành trình với ${amount}`,
      milestone: (amount: string) => `Quỹ chạm ${amount}`,
      milestoneDetail: (dateLabel: string) => `Lần đầu đạt mốc · ${dateLabel}`,
      now: "Hiện tại",
      nowDetail: (value: string, contributed: string) => `${value} · đã góp ${contributed}`,
    },
    de: {
      start: "Erste Einzahlung",
      startDetail: (amount: string) => `Start mit ${amount}`,
      milestone: (amount: string) => `Fonds erreicht ${amount}`,
      milestoneDetail: (dateLabel: string) => `Erstmals erreicht · ${dateLabel}`,
      now: "Aktuell",
      nowDetail: (value: string, contributed: string) => `${value} · eingezahlt ${contributed}`,
    },
  }[locale];

  const events: JourneyEvent[] = [
    {
      kind: "start",
      date: first.date.slice(0, 10),
      dateLabel: formatDateLabel(first.date.slice(0, 10), locale),
      title: copy.start,
      detail: copy.startDetail(formatMoneyShort(first.amount, locale)),
    },
  ];

  // Milestones: first month the portfolio value crossed each threshold.
  // Month precision only — the valueHistory point is a month-end snapshot,
  // so the crossing happened sometime during that month.
  if (valueHistory && valueHistory.length > 0) {
    for (const threshold of MILESTONES) {
      const hit = valueHistory.find((p) => p.value >= threshold);
      if (!hit) break;
      events.push({
        kind: "milestone",
        date: hit.month,
        dateLabel: hit.label,
        title: copy.milestone(formatMoneyShort(threshold, locale)),
        detail: copy.milestoneDetail(hit.label),
      });
    }
  }

  const totalContributed = eligible.reduce((sum, t) => sum + t.amount, 0);
  const latestValue = valueHistory && valueHistory.length > 0
    ? valueHistory[valueHistory.length - 1].value
    : 0;
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  events.push({
    kind: "now",
    date: todayIso,
    dateLabel: formatDateLabel(todayIso, locale),
    title: copy.now,
    detail: copy.nowDetail(formatMoneyShort(latestValue, locale), formatMoneyShort(totalContributed, locale)),
  });

  return events;
}
