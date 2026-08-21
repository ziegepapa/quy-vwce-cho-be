import { useMemo } from "react";
import { planDateYear, yearsUntil } from "../lib/planPhase";
import type { PlanTarget } from "../lib/types";
import { useLocale } from "../lib/locale";

export default function PlanRoadmapSection({
  target,
  onChangeTarget,
}: {
  target: PlanTarget;
  onChangeTarget: (next: PlanTarget) => void;
}) {
  const { locale } = useLocale();
  const text = locale === "de" ? {
    eyebrow: "Plan",
    title: "Verwendungszeitraum",
    description: "Dieses Feld hält das geplante Verwendungsdatum fest. Es löst keine Handels- oder Umschichtungsanweisung aus.",
    useDate: "Verwendungsdatum",
    needFull: "Nahezu das gesamte Geld wird zu diesem Zeitpunkt benötigt",
    timeHorizon: "Verbleibender Zeitraum",
    years: "Jahre",
    reviewTitle: "Prüfpunkt",
    review: "Überprüfen Sie das Ziel und Ihre Risikoeinschätzung in regelmäßigen Abständen. Diese Ansicht gibt keine Kauf-, Verkaufs- oder Allokationsanweisung.",
    notConfigured: "Noch nicht eingerichtet",
  } : {
    eyebrow: "Kế hoạch",
    title: "Mốc sử dụng tiền",
    description: "Trường này ghi nhận mốc sử dụng tiền dự kiến. Nó không tạo lệnh giao dịch hoặc hướng dẫn chuyển tỷ trọng.",
    useDate: "Ngày cần tiền (mốc sử dụng)",
    needFull: "Cần gần như toàn bộ số tiền ở mốc này",
    timeHorizon: "Thời gian còn lại",
    years: "năm",
    reviewTitle: "Điểm rà soát",
    review: "Hãy rà soát mốc sử dụng và mức rủi ro của bạn định kỳ. Màn hình này không đưa ra hướng dẫn mua, bán hoặc phân bổ.",
    notConfigured: "Chưa thiết lập",
  };
  const now = useMemo(() => new Date(), []);
  const targetConfigured = planDateYear(target.targetUseDate) != null;
  const horizon = targetConfigured ? yearsUntil(target.targetUseDate, now) : null;

  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <div>
          <p className="settings-card-eyebrow">{text.eyebrow}</p>
          <h3>{text.title}</h3>
          <p>{text.description}</p>
        </div>
        <span className="settings-icon-bubble" aria-hidden>📅</span>
      </div>

      <div className="settings-field-grid" style={{ marginBottom: 16 }}>
        <label className="setting-field">
          <span>{text.useDate}</span>
          <input
            type="date"
            value={target.targetUseDate}
            min="2020-01-01"
            max="2100-12-31"
            onChange={(event) =>
              onChangeTarget({ ...target, targetUseDate: event.target.value })
            }
          />
        </label>
      </div>

      <label className="switch-row" style={{ marginBottom: 16 }}>
        <span>{text.needFull}</span>
        <input
          type="checkbox"
          className="ios-switch"
          checked={target.needFullAmount}
          onChange={(event) =>
            onChangeTarget({ ...target, needFullAmount: event.target.checked })
          }
        />
      </label>

      <div className="settings-readonly-note" role="note">
        <strong>{text.timeHorizon}</strong>
        <span>{horizon == null ? text.notConfigured : `${horizon} ${text.years}`}</span>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.45 }}>
        <strong>{text.reviewTitle}: </strong>{text.review}
      </p>
    </section>
  );
}
