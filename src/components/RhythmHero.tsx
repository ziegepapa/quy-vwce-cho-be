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
  heroOwnedContribution: number;
  nhipWindowTotal: number;
  nhipWindowDays: number;
  /**
   * ringOnly — chỉ SVG streak, không body/status, không shell card.
   * Dùng trong money stage (NAV | ring) khớp hierarchy demo visual-abc.
   * full — giữ layout cũ nếu nơi khác còn cần (mặc định full).
   */
  variant?: "full" | "ringOnly";
};

// SVG arc path: circle r=15.5 in viewBox 0 0 36 36.
const RING_PATH = "M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 1 1 0-31";

/**
 * Hero nhịp: ring là streak.
 * variant=ringOnly không render body — Overview đặt ring đồng cấp với NAV.
 */
export default function RhythmHero({
  streak,
  totalContributed,
  heroOwnedContribution,
  variant = "full",
}: RhythmHeroProps) {
  const streakMonths = Math.max(0, streak.streakMonths);
  const hasContributions =
    streak.lastContributionDate != null ||
    totalContributed > 0 ||
    heroOwnedContribution > 0;
  const hasActiveStreak = streakMonths > 0;
  const arcPct = hasActiveStreak ? Math.min(100, (streakMonths / 12) * 100) : 0;
  const arcShown = arcPct > 0 ? Math.max(2, arcPct) : 0;

  const ariaLabel = hasActiveStreak
    ? `${streakMonths} tháng liên tiếp`
    : hasContributions
      ? "Đang chờ nhịp góp tiếp theo"
      : "Chưa có khoản góp";

  const ring = (
    <div className="rhythm-ring-wrap">
      <svg className="rhythm-ring-svg" viewBox="0 0 36 36" aria-label={ariaLabel}>
        <path className="rhythm-ring-track" d={RING_PATH} strokeDasharray="100, 100" />
        <path
          className={`rhythm-ring-fill${hasActiveStreak ? "" : " empty"}`}
          d={RING_PATH}
          strokeDasharray={`${arcShown}, 100`}
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
    return <div className="v10-ring-only">{ring}</div>;
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
        {ring}
        <div className="rhythm-body">
          <p className="rhythm-line1">{rhythmCopy}</p>
          {rhythmCaption && <p className="rhythm-caption">{rhythmCaption}</p>}
        </div>
      </div>
    </section>
  );
}
