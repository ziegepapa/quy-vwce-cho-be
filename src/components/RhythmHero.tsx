import type { Goal } from "../lib/types";
import type { ContributionStreakResult } from "../lib/contributionStreak";
import { formatMoney, inflate, parseDate } from "../lib/calc";

export type RhythmHeroProps = {
  streak: ContributionStreakResult;
  goals: Goal[];
  /**
   * portfolio.totalContributed from calc.ts — authoritative cost-basis total.
   * Shown as X in "Đã góp X / Y € kế hoạch".
   */
  totalContributed: number;
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
 * OVERVIEW-RHYTHM-001 r1 — Hero "Nhịp & Hành trình"
 *
 * Left: streak ring (consecutive contributing months).
 * Right: X / Y / Z text with full fallbacks (no fabricated numbers).
 */
export default function RhythmHero({
  streak,
  goals,
  totalContributed,
}: RhythmHeroProps) {
  // ── Compute Y (total goal target) from real Goals table only ──
  const today = new Date();
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
  const X = totalContributed;
  const hasContributions = streak.streakMonths > 0 || X > 0;

  // Z = contribution progress, only when Y > 0 and X > 0
  const Z: number | null =
    Y != null && Y > 0 && X > 0
      ? Math.min(100, (X / Y) * 100)
      : null;

  // ── Ring fill: streak capped at 12 months = full circle ──
  const streakMonths = streak.streakMonths;
  const arcPct = streakMonths > 0 ? Math.min(100, (streakMonths / 12) * 100) : 0;
  // Minimum visible arc of 2 when streak > 0 so there's always some fill
  const arcShown = arcPct > 0 ? Math.max(2, arcPct) : 0;
  const isEmpty = streakMonths === 0;

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
            // Empty ledger: no contributions at all
            <p className="rhythm-empty-copy">
              {"Ch\u01b0a c\u00f3 kho\u1ea3n g\u00f3p n\u00e0o"}
            </p>
          ) : Y != null ? (
            // Has goals → show X / Y (± Z)
            <>
              <p className="rhythm-line1">
                {"\u0110\u00e3 g\u00f3p "}
                <span className="rhythm-x">{formatMoney(X)}</span>
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
            // No goals → show X only
            <>
              <p className="rhythm-line1">
                {"B\u1ea1n \u0111\u00e3 g\u00f3p "}
                <span className="rhythm-x">{formatMoney(X)}</span>
                {" cho qu\u1ef9 n\u00e0y"}
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
