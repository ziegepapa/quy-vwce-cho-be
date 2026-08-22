import { useMemo } from "react";
import { planDateYear, yearsUntil } from "../lib/planPhase";
import type { PlanTarget } from "../lib/types";
import { useLocale } from "../lib/locale";
import { IconGoal } from "./Icons";

function formatTargetDate(value: string, locale: "vi" | "de") {
  const year = planDateYear(value);
  if (!year) return null;
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function SettingsPlanStudio({
  target,
  onChangeTarget,
}: {
  target: PlanTarget;
  onChangeTarget: (next: PlanTarget) => void;
}) {
  const { locale } = useLocale();
  const copy = locale === "de" ? {
    label: "Zielraum",
    title: "Plan mit klarer Ausgangslage",
    description: "Der Plan speichert nur Ihren gewünschten Verwendungszeitpunkt. Er berechnet keine Kauf-, Verkaufs- oder Umschichtungsanweisung.",
    date: "Verwendungsdatum",
    horizon: "Verbleibender Zeitraum",
    horizonUnavailable: "Noch nicht eingerichtet",
    years: "Jahre",
    use: "Bedarf am Zieltermin",
    full: "Nahezu das gesamte Vermögen",
    partial: "Teilweiser Bedarf",
    review: "Nächster Schritt",
    reviewText: "Prüfen Sie Zeitpunkt und familiären Bedarf in Ruhe. Beträge und Allokationen werden hier nicht geschätzt.",
    dataNote: "Kein Geldbetrag als Plan-Ziel gespeichert",
  } : {
    label: "Mục tiêu sử dụng",
    title: "Kế hoạch với điểm xuất phát rõ ràng",
    description: "Kế hoạch chỉ lưu mốc sử dụng tiền do bạn đặt. Màn hình không tính lệnh mua, bán hoặc hướng dẫn chuyển tỷ trọng.",
    date: "Ngày cần tiền",
    horizon: "Thời gian còn lại",
    horizonUnavailable: "Chưa thiết lập",
    years: "năm",
    use: "Nhu cầu tại mốc này",
    full: "Gần như toàn bộ danh mục",
    partial: "Một phần danh mục",
    review: "Bước tiếp theo",
    reviewText: "Rà soát lại mốc thời gian và nhu cầu gia đình. Ứng dụng không tự ước tính số tiền hay tỷ trọng tại đây.",
    dataNote: "Chưa lưu số tiền mục tiêu cho kế hoạch",
  };

  const now = useMemo(() => new Date(), []);
  const targetConfigured = planDateYear(target.targetUseDate) != null;
  const horizon = targetConfigured ? yearsUntil(target.targetUseDate, now) : null;
  const formattedDate = targetConfigured ? formatTargetDate(target.targetUseDate, locale) : null;

  return (
    <section className="settings-plan-studio" aria-label={copy.label}>
      <header className="settings-plan-studio-head">
        <span className="settings-plan-studio-icon" aria-hidden><IconGoal /></span>
        <div>
          <span>{copy.label}</span>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
      </header>

      <dl className="settings-plan-studio-metrics">
        <div>
          <dt>{copy.date}</dt>
          <dd>{formattedDate ?? copy.horizonUnavailable}</dd>
        </div>
        <div>
          <dt>{copy.horizon}</dt>
          <dd>{horizon == null ? copy.horizonUnavailable : `${horizon} ${copy.years}`}</dd>
        </div>
        <div>
          <dt>{copy.use}</dt>
          <dd>{target.needFullAmount ? copy.full : copy.partial}</dd>
        </div>
      </dl>

      <div className="settings-plan-studio-edit">
        <label>
          <span>{copy.date}</span>
          <input
            type="date"
            value={target.targetUseDate}
            min="2020-01-01"
            max="2100-12-31"
            onChange={(event) => onChangeTarget({ ...target, targetUseDate: event.target.value })}
          />
        </label>
        <label className="settings-plan-studio-switch">
          <input
            type="checkbox"
            checked={target.needFullAmount}
            onChange={(event) => onChangeTarget({ ...target, needFullAmount: event.target.checked })}
          />
          <span>
            <strong>{target.needFullAmount ? copy.full : copy.partial}</strong>
            <small>{copy.dataNote}</small>
          </span>
        </label>
      </div>

      <aside className="settings-plan-studio-note">
        <span>{copy.review}</span>
        <p>{copy.reviewText}</p>
      </aside>
    </section>
  );
}
