import type { Goal } from "../lib/types";
import type { ContributionStreakResult } from "../lib/contributionStreak";
import { formatMoney, inflate, parseDate } from "../lib/calc";

export type RhythmHeroProps = {
  streak: ContributionStreakResult;
  goals: Goal[];
  /**
   * portfolio.totalContributed from calc.ts — used ONLY to detect whether
   * the ledger has ever had a contribution (empty-state guard).
   * NOT used as the displayed X amount in hero copy.
   */
  totalContributed: number;
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

// SVG arc path: circle r=15.5 in viewBox 0 0 36 36
// Same geometry as Goals.tsx Ring component for visual consistency.
const RING_PATH = "M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 1 1 0-31";

/**
 * OVERVIEW-RHYTHM-001 r2 — Hero "Nhịp & Hành trình"
 *
 * X_hero is now defined as the same value Nhịp Quỹ reports:
 * total contributions within nhipWindowDays (currently 35 days).
 *
 * Fallback matrix:
 *   nhipWindowTotal > 0   → "Bạn đã góp X € trong N ngày qua"
 *   nhipWindowTotal = 0 but totalContributed > 0
 *     (history outside window) → "Bạn đã góp 0,00 € trong N ngày qua"
 *                                  + caption with last contribution date
 *   totalContributed = 0 (never contributed) → r1 empty fallback
 */
export default function RhythmHero({
  streak,
  goals,
  totalContributed,
  nhipWindowTotal,
  nhipWindowDays,
}: RhythmHeroProps) {
  // ── Compute Y (total goal target) from real Goals table only ──
  let goalTotalY = 0;
  for (const g of goals) {
    if (!g.amount || g.amount <= 0) continue;
    const due = parseDate(g.dueDate);
    const years = Math.max(0, due.getFullYear() - g.baseYear);
    const adj =
      g.mode === "purchasing_power"
        ? inflate(g.amount, g.inflationRate, years)
        : g.amount;
    goalTotalY += adj;
  }
  const hasGoals = goals.length > 0 && goalTotalY > 0;
  const Y: number | null = hasGoals ? goalTotalY : null;

  // hasContributions: true if ledger ever recorded a contribution (lifetime).
  // Determines whether to show empty-state or active-state copy.
  const hasContributions = streak.streakMonths > 0 || totalContributed > 0;

  // Z = goal progress (uses lifetime totalContributed; correct for journey %).
  const Z: number | null =
    Y != null && Y > 0 && totalContributed > 0
      ? Math.min(100, (totalContributed / Y) * 100)
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
            // Empty ledger: never contributed
            <p className="rhythm-empty-copy">
              {"Ch\u01b0a c\u00f3 kho\u1ea3n g\u00f3p n\u00e0o cho qu\u1ef9 n\u00e0y"}
            </p>
          ) : Y != null ? (
            // Has goals → show lifetime X / Y (goal progress uses lifetime total)
            <>
              <p className="rhythm-line1">
                {"\u0110\u00e3 g\u00f3p "}
                <span className="rhythm-x">{formatMoney(totalContributed)}</span>
                {" / "}
                {formatMoney(Y)}
                {" k\u1ebf ho\u1ea1ch"}
              </p>
              {Z != null && (
                <p className="rhythm-line2">
                  {"\u2248 "}{Z.toFixed(1)}{"% h\u00e0nh tr\u00ecnh"}
                </p>
              )}
              {streak.lastContributionDate != null && (
                <p className="rhythm-caption">
                  {"L\u1ea7n g\u00f3p g\u1ea7n nh\u1ea5t: "}
                  {formatDDMMYYYY(streak.lastContributionDate)}
                </p>
              )}
            </>
          ) : (
            // No goals → show X_nhip with same period as Nhịp Quỹ
            // OVERVIEW-RHYTHM-001 r2: X = nhipWindowTotal (not totalContributed)
            <>
              <p className="rhythm-line1">
                {"B\u1ea1n \u0111\u00e3 g\u00f3p "}
                <span className="rhythm-x">{formatMoney(nhipWindowTotal)}</span>
                {" "}
                {periodLabel}
              </p>
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
