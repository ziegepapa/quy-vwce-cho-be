import type { PlanPhase } from "../lib/types";

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  "GIỮ":      { bg: "var(--green-100,#dcfce7)",   fg: "var(--green-700,#15803d)" },
  "GIẢM":     { bg: "var(--amber-100,#fef3c7)",   fg: "var(--amber-700,#b45309)" },
  "DừNG":     { bg: "var(--orange-100,#ffedd5)",  fg: "var(--orange-700,#c2410c)" },
  "SỬ DỤNG": { bg: "var(--blue-100,#dbeafe)",    fg: "var(--blue-700,#1d4ed8)" },
};

const STATUS_ICON: Record<string, string> = {
  "GIỮ":      "📈",
  "GIẢM":     "⚖️",
  "DừNG":     "🛑",
  "SỬ DỤNG": "✅",
};

function formatDateVi(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function PlanPhaseCard({
  phase,
  targetDate,
  onViewFull,
  onDismissReminder,
}: {
  phase: PlanPhase;
  targetDate: string;
  onViewFull?: () => void;
  onDismissReminder?: () => void;
}) {
  const color = STATUS_COLOR[phase.status] ?? { bg: "var(--surface-2,#f3f4f6)", fg: "inherit" };
  const icon = STATUS_ICON[phase.status] ?? "📋";
  const dateLabel = formatDateVi(targetDate);

  return (
    <section
      className="settings-card"
      aria-label="Lộ trình kế hoạch đầu tư theo năm"
      style={{ marginBottom: 12 }}
    >
      <div className="settings-card-head">
        <div style={{ flex: 1 }}>
          <p className="settings-card-eyebrow">Lộ trình kế hoạch</p>
          <h3 style={{ margin: "4px 0 2px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-block",
                padding: "2px 10px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 700,
                background: color.bg,
                color: color.fg,
              }}
            >
              {phase.status}
            </span>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{phase.title}</span>
          </h3>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text-muted,#6b7280)" }}>
            Còn {phase.yearsLeft} năm · Đến {dateLabel}
          </p>
        </div>
        <span className="settings-icon-bubble" aria-hidden style={{ fontSize: 24 }}>
          {icon}
        </span>
      </div>

      <p style={{ margin: "8px 0 8px", lineHeight: 1.5 }}>
        {phase.summary}
      </p>

      <ul style={{ margin: "0 0 12px", paddingLeft: 20 }}>
        {phase.actions.map((action) => (
          <li key={action} className="muted" style={{ marginBottom: 4, fontSize: 14, lineHeight: 1.4 }}>
            {action}
          </li>
        ))}
      </ul>

      <p className="muted" style={{ fontSize: 12, lineHeight: 1.4, marginBottom: 12 }}>
        Đây là khung gợi ý theo số năm còn lại. Không phải lệnh giao dịch. Hãy kiểm tra số dư thật, phí và thuế trước khi chuyển tiền.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {onViewFull ? (
          <button type="button" className="secondary" onClick={onViewFull}>
            Xem lộ trình đầy đủ
          </button>
        ) : null}
        {phase.showReminder && onDismissReminder ? (
          <button type="button" className="secondary" onClick={onDismissReminder}>
            Đã hiểu · nhắc lại năm sau
          </button>
        ) : null}
      </div>
    </section>
  );
}
