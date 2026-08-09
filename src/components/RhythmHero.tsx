import type { Goal } from "../lib/types";
import type { ContributionStreakResult } from "../lib/contributionStreak";
import { formatMoney, inflate, parseDate } from "../lib/calc";

export type RhythmHeroProps = {
  streak: ContributionStreakResult;
  goals: Goal[];
  /**
   * portfolio.totalContributed from calc.ts — cash that entered the in-app
   * wallet (grows on `cash_in` only). Read here purely as one signal for the
   * empty-state guard.
   *
   * OVERVIEW-HERO-LIFETIME-001 r1: this is NO LONGER X_lifetime. In
   * securities-first mode it is legitimately 0 while the fund holds real
   * shares, which is exactly how the hero ended up printing
   * "\u0110\u00e3 g\u00f3p 0,00 \u20ac / Y \u20ac". Use heroLifetimeContribution for anything the
   * user reads as "how much have I contributed".
   */
  totalContributed: number;
  /**
   * OVERVIEW-HERO-LIFETIME-001 r1: X_lifetime for the goal lines, already
   * resolved for the active fund mode by lib/heroLifetime.ts.
   *
   *   cash-first        → Σ cash_in            (equals totalContributed)
   *   securities-first  → Σ buy_vwce + buy_security
   *
   * Lifetime, not windowed. Never mixed with nhipWindowTotal.
   */
  heroLifetimeContribution: number;
  /**
   * OVERVIEW-RHYTHM-001 r2: X_nhip = total contributions within the Nhịp Quỹ
   * reporting window (nhipWindowDays). Hero displays this value so X_hero and
   * X_nhip are always the same number from the same period.
   */
  nhipWindowTotal: number;
  /**
   * The window length in days used by Nhịp Quỹ (= CONTRIBUTION_WINDOW_DAYS
   * from nhipInsights.ts). Passed explicitly so copy stays in sync if the
   * constant ever changes.
   */
  nhipWindowDays: number;
};

/** Format an ISO date string as dd.mm.yyyy */
function formatDDMMYYYY(iso: string): string {
  const s = iso.slice(0, 10);
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * OVERVIEW-RHYTHM-001 r3 — the goal plan behind the two optional hero lines.
 *
 * A goal only counts when the data really carries both halves of the promise:
 * a positive target amount AND a parseable due date. Anything missing either
 * one is skipped entirely rather than defaulted, because a fabricated Y or a
 * guessed horizon would be a number the owner cannot check against the Goals
 * table. If nothing survives the filter this returns null and the hero shows
 * no X/Y and no journey percentage at all.
 */
type GoalPlan = {
  /** Y — sum of inflation-adjusted targets across every usable goal. */
  targetY: number;
  /** Journey length in whole years, or null when it cannot be derived. */
  horizonYears: number | null;
};

function buildGoalPlan(goals: Goal[]): GoalPlan | null {
  let targetY = 0;
  let usable = 0;
  let minBaseYear = Number.POSITIVE_INFINITY;
  let maxDueYear = Number.NEGATIVE_INFINITY;

  for (const g of goals) {
    if (g.deletedAt) continue;
    if (!Number.isFinite(g.amount) || g.amount <= 0) continue;
    if (!g.dueDate) continue;

    const due = parseDate(g.dueDate);
    const dueTime = due instanceof Date ? due.getTime() : Number.NaN;
    if (!Number.isFinite(dueTime)) continue;

    const dueYear = due.getFullYear();
    if (!Number.isFinite(dueYear)) continue;

    const baseYear =
      Number.isFinite(g.baseYear) && g.baseYear > 0 ? g.baseYear : dueYear;
    const years = Math.max(0, dueYear - baseYear);
    const adjusted =
      g.mode === "purchasing_power"
        ? inflate(g.amount, g.inflationRate, years)
        : g.amount;
    if (!Number.isFinite(adjusted) || adjusted <= 0) continue;

    targetY += adjusted;
    usable += 1;
    if (baseYear < minBaseYear) minBaseYear = baseYear;
    if (dueYear > maxDueYear) maxDueYear = dueYear;
  }

  if (usable === 0 || targetY <= 0) return null;

  const span = maxDueYear - minBaseYear;
  return {
    targetY,
    horizonYears: Number.isFinite(span) && span > 0 ? span : null,
  };
}

// SVG arc path: circle r=15.5 in viewBox 0 0 36 36
// Same geometry as Goals.tsx Ring component for visual consistency.
const RING_PATH = "M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 1 1 0-31";

/**
 * OVERVIEW-RHYTHM-001 r3 — Hero "Nhịp & Hành trình"
 *
 * Layout is unchanged: ring on the left, text on the right.
 *
 * The text column is now additive rather than either/or. r2 branched: either
 * the goal sentence OR the 35-day sentence. r3 always leads with the 35-day
 * sentence (the one Nhịp Quỹ agrees with) and appends the journey lines only
 * when a real goal exists. That way removing a goal never changes what the
 * primary line means.
 *
 *   never contributed      → "Chưa có khoản góp nào cho quỹ này"
 *   contributed            → "Bạn đã góp {X_nhip} trong {N} ngày qua"
 *     + real goal          → "Đã góp {X_lifetime} / {Y} kế hoạch"
 *                            "≈ {Z}% hành trình"
 *     + last contribution  → "Lần góp gần nhất: dd.mm.yyyy"
 *
 * OVERVIEW-HERO-LIFETIME-001 r1 — X_lifetime is now heroLifetimeContribution,
 * resolved per fund mode upstream. Only the two goal lines change; the primary
 * 35-day sentence, the ring, and the streak are byte-for-byte the same.
 */
export default function RhythmHero({
  streak,
  goals,
  totalContributed,
  heroLifetimeContribution,
  nhipWindowTotal,
  nhipWindowDays,
}: RhythmHeroProps) {
  // X_lifetime, guarded against a corrupt upstream value.
  const xLifetime =
    Number.isFinite(heroLifetimeContribution) && heroLifetimeContribution > 0
      ? heroLifetimeContribution
      : 0;

  // hasContributions: true if the ledger ever recorded a contribution.
  // xLifetime joins the test so a securities-first ledger is recognised even
  // when totalContributed is 0 by design.
  const hasContributions =
    streak.streakMonths > 0 || totalContributed > 0 || xLifetime > 0;

  const goalPlan = buildGoalPlan(goals);

  /**
   * OVERVIEW-HERO-LIFETIME-001 r1 — the "never print 0,00 \u20ac / Y \u20ac" rule.
   *
   * The goal lines require BOTH a real plan and a real X. If X is 0 while the
   * streak says contributions exist, that is a mapping fault, not a fact about
   * the fund — so the hero stays silent about the plan instead of publishing a
   * zero it cannot justify. The 35-day line above still carries the truth.
   */
  const showGoalLines = goalPlan != null && xLifetime > 0;

  // Z — money progress against the plan target, clamped to 0..100.
  // Deliberately NOT blended with elapsed time: a time-weighted figure would
  // move on its own every month without the owner doing anything, which is
  // the opposite of what a contribution tracker should reward.
  const Z: number | null =
    showGoalLines && goalPlan != null
      ? Math.min(100, Math.max(0, (xLifetime / goalPlan.targetY) * 100))
      : null;

  // ── Ring fill: streak capped at 12 months = full circle ──
  const streakMonths = streak.streakMonths;
  const arcPct = streakMonths > 0 ? Math.min(100, (streakMonths / 12) * 100) : 0;
  // Minimum visible arc of 2 when streak > 0 so there's always some fill
  const arcShown = arcPct > 0 ? Math.max(2, arcPct) : 0;
  const isEmpty = streakMonths === 0;

  // Period label mirrors Nhịp Quỹ copy exactly.
  const periodLabel = `trong ${nhipWindowDays} ng\u00e0y qua`;

  return (
    <section className="rhythm-hero">
      <div className="rhythm-hero-inner">
        {/* ── Left: streak ring ── */}
        <div className="rhythm-ring-wrap">
          <svg
            className="rhythm-ring-svg"
            viewBox="0 0 36 36"
            aria-label={isEmpty ? "Ch\u01b0a c\u00f3 kho\u1ea3n g\u00f3p" : `${streakMonths} th\u00e1ng li\u00ean ti\u1ebfp`}
          >
            {/* Track */}
            <path
              className="rhythm-ring-track"
              d={RING_PATH}
              strokeDasharray="100, 100"
            />
            {/* Fill arc */}
            <path
              className={`rhythm-ring-fill${isEmpty ? " empty" : ""}`}
              d={RING_PATH}
              strokeDasharray={`${arcShown}, 100`}
            />
            {/* Center label */}
            {isEmpty ? (
              <text
                x="18"
                y="18.5"
                className="rhythm-ring-num empty"
              >
                {"\u2014"}
              </text>
            ) : (
              <>
                <text
                  x="18"
                  y="16"
                  className="rhythm-ring-num"
                >
                  {streakMonths}
                </text>
                <text
                  x="18"
                  y="22"
                  className="rhythm-ring-sub"
                >
                  {"th\u00e1ng"}
                </text>
              </>
            )}
          </svg>
        </div>

        {/* ── Right: text body ── */}
        <div className="rhythm-body">
          {!hasContributions ? (
            // Empty ledger: never contributed. No zero, no X/Y, no percentage.
            <p className="rhythm-empty-copy">
              {"Ch\u01b0a c\u00f3 kho\u1ea3n g\u00f3p n\u00e0o cho qu\u1ef9 n\u00e0y"}
            </p>
          ) : (
            <>
              {/* Primary line — always the Nhịp Quỹ window, so hero and block agree. */}
              <p className="rhythm-line1">
                {"B\u1ea1n \u0111\u00e3 g\u00f3p "}
                <span className="rhythm-x">{formatMoney(nhipWindowTotal)}</span>
                {" "}
                {periodLabel}
              </p>

              {/* Journey lines — a real goal (Y + due date) AND a real X. */}
              {showGoalLines && goalPlan != null && (
                <>
                  <p className="rhythm-goal">
                    {"\u0110\u00e3 g\u00f3p "}
                    {formatMoney(xLifetime)}
                    {" / "}
                    {formatMoney(goalPlan.targetY)}
                    {" k\u1ebf ho\u1ea1ch"}
                  </p>
                  {Z != null && (
                    <p className="rhythm-goal">
                      {"\u2248 "}
                      {Z.toFixed(1)}
                      {"% h\u00e0nh tr\u00ecnh"}
                      {goalPlan.horizonYears != null
                        ? ` ${goalPlan.horizonYears} n\u0103m`
                        : ""}
                    </p>
                  )}
                </>
              )}

              {streak.lastContributionDate != null && (
                <p className="rhythm-caption">
                  {"L\u1ea7n g\u00f3p g\u1ea7n nh\u1ea5t: "}
                  {formatDDMMYYYY(streak.lastContributionDate)}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
