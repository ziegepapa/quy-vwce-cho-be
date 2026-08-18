import type { Goal } from "../lib/types";
import type { ContributionStreakResult } from "../lib/contributionStreak";

export type RhythmHeroProps = {
  streak: ContributionStreakResult;
  /**
   * Các input dưới đây vẫn nằm trong adapter của Overview để revision UI này
   * không đụng vào calculation wiring. Hero cố ý không hiển thị goal, amount
   * theo cửa sổ 35 ngày, X/Y kế hoạch hoặc horizon nữa: goal là tùy chọn và
   * ring đã đủ để kể câu chuyện về nhịp.
   */
  goals: Goal[];
  totalContributed: number;
  heroLifetimeContribution: number;
  nhipWindowTotal: number;
  nhipWindowDays: number;
  /**
   * ringOnly — chỉ SVG streak + center HTML khớp demo visual-abc, không body/status, không shell card.
   * full — giữ layout cũ nếu nơi khác còn cần (mặc định full).
   */
  variant?: "full" | "ringOnly";
};

/** Circumference of r=30 circle ≈ 188.496 */
const RING_C = 2 * Math.PI * 30;

/**
 * Hero nhịp: ring là streak (không phải % goal).
 * variant=ringOnly không render body — Overview đặt ring đồng cấp với NAV.
 * Geometry + DOM khớp demo visual-abc (76 viewBox, stroke 7, r=30, .hr-center HTML).
 */
export default function RhythmHero({
  streak,
  totalContributed,
  heroLifetimeContribution,
  variant = "full",
}: RhythmHeroProps) {
  const streakMonths = Math.max(0, streak.streakMonths);
  const hasContributions =
    streak.lastContributionDate != null ||
    totalContributed > 0 ||
    heroLifetimeContribution > 0;
  const hasActiveStreak = streakMonths > 0;
  /* Cap visual at 24 months so a long streak still fills meaningfully. */
  const arcPct = hasActiveStreak ? Math.min(100, (streakMonths / 24) * 100) : 0;
  const arcLen = hasActiveStreak ? Math.max(RING_C * 0.02, (RING_C * arcPct) / 100) : 0;

  const ariaLabel = hasActiveStreak
    ? `${streakMonths} tháng liên tiếp`
    : hasContributions
      ? "Đang chờ nhịp góp tiếp theo"
      : "Chưa có khoản góp";

  /* Literal demo DOM: .hr-shell > .hr-pulse + svg + .hr-center > .hr-pct */
  const ringDemo = (
    <div className="v10-hr-shell">
      <div className="v10-hr-pulse" aria-hidden />
      <svg className="v10-hr-svg" viewBox="0 0 76 76" aria-hidden>
        <defs>
          <linearGradient id="v10RingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--vi, #8b5cf6)" />
            <stop offset="100%" stopColor="var(--em, #10b981)" />
          </linearGradient>
        </defs>
        <circle
          cx="38"
          cy="38"
          r="30"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="7"
        />
        <circle
          cx="38"
          cy="38"
          r="30"
          fill="none"
          stroke="url(#v10RingGrad)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${RING_C}`}
          transform="rotate(-90 38 38)"
          className={hasActiveStreak ? "v10-hr-arc" : "v10-hr-arc empty"}
        />
      </svg>
      <div className="v10-hr-center" role="img" aria-label={ariaLabel}>
        {hasActiveStreak ? (
          <div className="v10-hr-pct">
            {streakMonths}
            <span className="v10-hr-pct-unit">tháng</span>
          </div>
        ) : (
          <div className="v10-hr-pct v10-hr-pct--empty">—</div>
        )}
      </div>
    </div>
  );

  /* Legacy compact path for full variant (other call sites). */
  const RING_PATH = "M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 1 1 0-31";
  const legacyPct = hasActiveStreak ? Math.min(100, (streakMonths / 12) * 100) : 0;
  const legacyShown = legacyPct > 0 ? Math.max(2, legacyPct) : 0;
  const ringLegacy = (
    <div className="rhythm-ring-wrap">
      <svg className="rhythm-ring-svg" viewBox="0 0 36 36" aria-label={ariaLabel}>
        <path className="rhythm-ring-track" d={RING_PATH} strokeDasharray="100, 100" />
        <path
          className={`rhythm-ring-fill${hasActiveStreak ? "" : " empty"}`}
          d={RING_PATH}
          strokeDasharray={`${legacyShown}, 100`}
        />
        {hasActiveStreak ? (
          <>
            <text x="18" y="16" className="rhythm-ring-num">
              {streakMonths}
            </text>
            <text x="18" y="22" className="rhythm-ring-sub">
              tháng
            </text>
          </>
        ) : (
          <text x="18" y="18.5" className="rhythm-ring-num empty">
            —
          </text>
        )}
      </svg>
    </div>
  );

  if (variant === "ringOnly") {
    return <div className="v10-ring-only">{ringDemo}</div>;
  }

  const rhythmCopy = !hasContributions
    ? "Chưa có nhịp góp"
    : hasActiveStreak
      ? "Đang giữ nhịp đều"
      : "Chờ nhịp góp tiếp theo";
  const rhythmCaption = !hasContributions
    ? "Ghi khoản góp đầu tiên để bắt đầu."
    : null;

  return (
    <section className="rhythm-hero v10-rhythm">
      <div className="rhythm-hero-inner">
        {ringLegacy}
        <div className="rhythm-body">
          <p className="rhythm-line1">{rhythmCopy}</p>
          {rhythmCaption && <p className="rhythm-caption">{rhythmCaption}</p>}
        </div>
      </div>
    </section>
  );
}
