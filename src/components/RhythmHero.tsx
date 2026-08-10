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
};

/** Format an ISO date string as dd.mm.yyyy. */
function formatDDMMYYYY(iso: string): string {
  const s = iso.slice(0, 10);
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

// SVG arc path: circle r=15.5 in viewBox 0 0 36 36.
const RING_PATH = "M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 1 1 0-31";

/**
 * Hero nhịp tối giản.
 *
 * - Ring chỉ biểu diễn chuỗi tháng góp liên tiếp.
 * - Text chỉ nói trạng thái nhịp và lần góp gần nhất.
 * - Không còn câu “X trong 35 ngày”, goal plan, phần trăm hay số năm.
 */
export default function RhythmHero({
  streak,
  totalContributed,
  heroLifetimeContribution,
}: RhythmHeroProps) {
  const streakMonths = Math.max(0, streak.streakMonths);
  const hasContributions =
    streak.lastContributionDate != null ||
    totalContributed > 0 ||
    heroLifetimeContribution > 0;
  const hasActiveStreak = streakMonths > 0;
  const arcPct = hasActiveStreak ? Math.min(100, (streakMonths / 12) * 100) : 0;
  const arcShown = arcPct > 0 ? Math.max(2, arcPct) : 0;

  const rhythmCopy = !hasContributions
    ? "Bắt đầu nhịp góp đầu tiên"
    : hasActiveStreak
      ? "Nhịp quỹ đang được giữ đều"
      : "Sẵn sàng cho nhịp góp tiếp theo";

  return (
    <section className="rhythm-hero">
      <div className="rhythm-hero-inner">
        <div className="rhythm-ring-wrap">
          <svg
            className="rhythm-ring-svg"
            viewBox="0 0 36 36"
            aria-label={
              hasActiveStreak
                ? `${streakMonths} tháng liên tiếp`
                : hasContributions
                  ? "Đang chờ nhịp góp tiếp theo"
                  : "Chưa có khoản góp"
            }
          >
            <path
              className="rhythm-ring-track"
              d={RING_PATH}
              strokeDasharray="100, 100"
            />
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

        <div className="rhythm-body">
          <p className="rhythm-line1">{rhythmCopy}</p>
          {streak.lastContributionDate != null ? (
            <p className="rhythm-caption">
              Lần góp gần nhất: {formatDDMMYYYY(streak.lastContributionDate)}
            </p>
          ) : (
            <p className="rhythm-caption">
              Ghi một khoản góp để mở vòng nhịp.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
