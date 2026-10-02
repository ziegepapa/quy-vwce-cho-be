export type BriefingPricePoint = {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Close price in EUR. */
  price: number;
};

export type PriceDirection = "up" | "down" | "flat";

export type DailyBriefing = {
  /** Latest price point from history, or null when history is unavailable. */
  priceToday: { date: string; price: number } | null;
  /** Change of the latest close vs the previous close. */
  priceChange: { direction: PriceDirection; pct: number } | null;
  /**
   * Display-only estimate of how the VWCE position value moved since the
   * previous close (vwceQty * price delta). Never feeds the ledger.
   */
  valueDeltaEstimate: number | null;
  /** Consecutive contribution months (see lib/contributionStreak). */
  streakMonths: number;
  /** Next round milestone above current assets, or null when unknown. */
  nextMilestone: { target: number; remaining: number; progressPct: number } | null;
  /** Calendar days until the next monthly contribution date, or null. */
  daysToNextContribution: number | null;
};

/** Round milestones in EUR used for the "next milestone" nudge. */
const MILESTONES = [1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];

function isValidPoint(point: BriefingPricePoint): boolean {
  return (
    typeof point?.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(point.date) &&
    Number.isFinite(point.price) &&
    point.price > 0
  );
}

function nextContributionDate(dayOfMonth: number, now: Date): Date | null {
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) return null;
  const next = new Date(now.getFullYear(), now.getMonth(), dayOfMonth, 12, 0, 0);
  if (next.getTime() <= now.getTime()) next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Display-only daily briefing view-model. Pure: no IO, no ledger writes,
 * no economics recomputation. All money figures are derived from already
 * computed inputs (position qty, total assets).
 */
export function buildDailyBriefing(input: {
  priceHistory: ReadonlyArray<BriefingPricePoint>;
  vwceQty: number;
  assets: number;
  streakMonths: number;
  contributionDay: number | null;
  now?: Date;
}): DailyBriefing {
  const now = input.now ?? new Date();
  const streakMonths = Math.max(0, Math.trunc(input.streakMonths));

  const points = [...input.priceHistory].filter(isValidPoint).sort((a, b) => a.date.localeCompare(b.date));
  const latest = points.length > 0 ? points[points.length - 1] : null;
  const previous = points.length > 1 ? points[points.length - 2] : null;

  let priceChange: DailyBriefing["priceChange"] = null;
  let valueDeltaEstimate: number | null = null;
  if (latest && previous) {
    const delta = latest.price - previous.price;
    const pct = previous.price > 0 ? (delta / previous.price) * 100 : 0;
    priceChange = {
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      pct,
    };
    if (Number.isFinite(input.vwceQty) && input.vwceQty > 0) {
      valueDeltaEstimate = input.vwceQty * delta;
    }
  }

  let nextMilestone: DailyBriefing["nextMilestone"] = null;
  if (Number.isFinite(input.assets)) {
    const target = MILESTONES.find((m) => m > input.assets);
    if (target !== undefined) {
      nextMilestone = {
        target,
        remaining: target - input.assets,
        progressPct: Math.min(100, Math.max(0, (input.assets / target) * 100)),
      };
    }
  }

  let daysToNextContribution: number | null = null;
  if (input.contributionDay != null) {
    const next = nextContributionDate(input.contributionDay, now);
    if (next) {
      const msPerDay = 86_400_000;
      daysToNextContribution = Math.max(
        0,
        Math.ceil((next.getTime() - now.getTime()) / msPerDay),
      );
    }
  }

  return {
    priceToday: latest ? { date: latest.date, price: latest.price } : null,
    priceChange,
    valueDeltaEstimate,
    streakMonths,
    nextMilestone,
    daysToNextContribution,
  };
}
