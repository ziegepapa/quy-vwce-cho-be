import { useMemo, type CSSProperties } from "react";
import type { PlanTarget, Transaction } from "../lib/types";
import { planDateYear, yearsUntil } from "../lib/planPhase";
import { buildPlanVsReality } from "../pages/planVsReality";
import { useLocale } from "../lib/locale";
import { IconGoal } from "./Icons";

type AnnualRow = {
  year: number;
  kind: "recorded" | "current" | "future" | "use";
  planned: number;
  actual: number | null;
  recordedMonths: number | null;
  plannedMonths: number;
};

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T12:00:00`).getTime());
}

function formatMoney(value: number, locale: "vi" | "de"): string {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "vi-VN", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string, locale: "vi" | "de"): string | null {
  if (!isDate(value)) return null;
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function plannedMonthsInYear(year: number, startDate: string, targetDate: string): number {
  if (!isDate(startDate) || !isDate(targetDate)) return 0;
  const start = new Date(`${startDate}T12:00:00`);
  const target = new Date(`${targetDate}T12:00:00`);
  const from = new Date(Math.max(start.getTime(), new Date(year, 0, 1, 12, 0, 0).getTime()));
  const end = new Date(Math.min(target.getTime(), new Date(year, 11, 31, 12, 0, 0).getTime()));
  if (from > end) return 0;
  return Math.max(0, end.getMonth() - from.getMonth() + 1);
}

function buildRows(input: {
  startDate: string;
  targetDate: string;
  contributionY1: number;
  contributionY2: number;
  trackInAppCash?: boolean;
  transactions: readonly Transaction[];
  today: Date;
}): AnnualRow[] {
  const targetYear = planDateYear(input.targetDate);
  if (!targetYear || !isDate(input.startDate)) return [];
  const startYear = new Date(`${input.startDate}T12:00:00`).getFullYear();
  const currentYear = input.today.getFullYear();
  if (targetYear < startYear || targetYear - startYear > 30) return [];
  const today = `${input.today.getFullYear()}-${String(input.today.getMonth() + 1).padStart(2, "0")}-${String(input.today.getDate()).padStart(2, "0")}`;
  const firstYearMonthly = Number.isFinite(input.contributionY1) && input.contributionY1 > 0 ? input.contributionY1 : 0;
  const laterYearMonthly = Number.isFinite(input.contributionY2) && input.contributionY2 > 0 ? input.contributionY2 : 0;

  return Array.from({ length: targetYear - startYear + 1 }, (_, index) => {
    const year = startYear + index;
    const plannedMonths = plannedMonthsInYear(year, input.startDate, input.targetDate);
    const monthly = index === 0 ? firstYearMonthly : laterYearMonthly;
    const planned = plannedMonths * monthly;
    if (year <= currentYear) {
      const reality = buildPlanVsReality({
        startDate: input.startDate,
        contributionY1: input.contributionY1,
        contributionY2: input.contributionY2,
        trackInAppCash: input.trackInAppCash,
        transactions: input.transactions,
        today,
        year,
      });
      return {
        year,
        kind: year === currentYear ? "current" : "recorded",
        planned: reality.plannedAmount,
        actual: reality.actualAmount,
        recordedMonths: reality.recordedMonths,
        plannedMonths: reality.plannedMonths,
      };
    }
    return {
      year,
      kind: year === targetYear ? "use" : "future",
      planned,
      actual: null,
      recordedMonths: null,
      plannedMonths,
    };
  });
}

export default function AnnualPlanStudio({
  target,
  startDate,
  contributionY1,
  contributionY2,
  trackInAppCash,
  transactions,
  onChangeTarget,
}: {
  target: PlanTarget;
  startDate: string;
  contributionY1: number;
  contributionY2: number;
  trackInAppCash?: boolean;
  transactions: readonly Transaction[];
  onChangeTarget: (next: PlanTarget) => void;
}) {
  const { locale } = useLocale();
  const copy = locale === "de" ? {
    eyebrow: "Jahresplan",
    title: "Ein Plan, Jahr für Jahr sichtbar.",
    description: "Die Beiträge werden aus dem vorhandenen Sparplan und den erfassten Buchungen abgeleitet. Diese Ansicht gibt keine Kauf-, Verkaufs- oder Umschichtungsanweisung.",
    useDate: "Verwendungsdatum",
    horizon: "Verbleibende Zeit",
    useAll: "Nahezu gesamtes Vermögen vorgesehen",
    usePart: "Teilbedarf vorgesehen",
    amountUnknown: "Zielbetrag nicht gespeichert",
    recorded: "Erfasst",
    current: "Dieses Jahr",
    future: "Vorgemerkt",
    use: "Verwendung",
    planned: "Geplant",
    recordedAmount: "Erfasst",
    monthCount: "Monate",
    contributionEvidence: "Beitrag je erfasstem Monat",
    noPlan: "Noch keine Grundlage für einen Jahresplan",
    noPlanDescription: "Tragen Sie einen gültigen Start- und Verwendungstermin ein. Bis dahin erzeugt die App keine Beträge.",
    ownerReview: "Eigentümer-Check",
    ownerReviewText: "Prüfen Sie den Zweck und die verfügbaren Mittel für dieses Jahr. Änderungen am Sparplan oder an Anlagen werden nicht automatisch ausgeführt.",
    missingContribution: "Kein monatlicher Sparplan hinterlegt",
    editPlan: "Planbasis bearbeiten",
    dateInput: "Verwendungsdatum",
    allInput: "Nahezu gesamtes Vermögen wird verwendet",
    partInput: "Vorgesehener Teilbetrag",
  } : {
    eyebrow: "Kế hoạch theo năm",
    title: "Một kế hoạch nhìn rõ từng năm.",
    description: "Mức góp được suy ra từ Sparplan hiện có và giao dịch đã ghi nhận. Màn hình không tạo lệnh mua, bán hoặc chuyển tỷ trọng.",
    useDate: "Mốc sử dụng tiền",
    horizon: "Thời gian còn lại",
    useAll: "Dự kiến dùng gần như toàn bộ danh mục",
    usePart: "Dự kiến dùng một phần danh mục",
    amountUnknown: "Chưa lưu số tiền mục tiêu",
    recorded: "Đã ghi nhận",
    current: "Năm hiện tại",
    future: "Dự kiến",
    use: "Sử dụng tiền",
    planned: "Theo Sparplan",
    recordedAmount: "Đã ghi nhận",
    monthCount: "Tháng",
    contributionEvidence: "Góp bình quân/tháng đã ghi nhận",
    noPlan: "Chưa đủ nền tảng để lập kế hoạch theo năm",
    noPlanDescription: "Hãy nhập ngày bắt đầu và mốc sử dụng hợp lệ. Trước đó ứng dụng không tự tạo số tiền.",
    ownerReview: "Kiểm tra của chủ sở hữu",
    ownerReviewText: "Xem lại mục đích sử dụng và nguồn tiền của năm này. Ứng dụng không tự thực hiện thay đổi Sparplan hay danh mục.",
    missingContribution: "Chưa có mức góp hằng tháng trong Sparplan",
    editPlan: "Điều chỉnh nền tảng kế hoạch",
    dateInput: "Mốc sử dụng tiền",
    allInput: "Dùng gần như toàn bộ danh mục tại mốc này",
    partInput: "Số tiền dự kiến cần dùng",
  };

  const today = useMemo(() => new Date(), []);
  const targetYear = planDateYear(target.targetUseDate);
  const rows = useMemo(() => buildRows({
    startDate,
    targetDate: target.targetUseDate,
    contributionY1,
    contributionY2,
    trackInAppCash,
    transactions,
    today,
  }), [startDate, target.targetUseDate, contributionY1, contributionY2, trackInAppCash, transactions, today]);
  const horizon = targetYear ? yearsUntil(target.targetUseDate, today) : null;
  const targetDate = formatDate(target.targetUseDate, locale);
  const partialNeed = Number.isFinite(target.partialNeedEuro) && (target.partialNeedEuro ?? 0) > 0
    ? target.partialNeedEuro ?? null
    : null;
  const currentRow = rows.find((row) => row.kind === "current") ?? null;
  const monthlyEvidence = currentRow && currentRow.actual !== null && currentRow.recordedMonths && currentRow.recordedMonths > 0
    ? currentRow.actual / currentRow.recordedMonths
    : null;
  const configuredMonthly = contributionY2 > 0 ? contributionY2 : contributionY1;

  if (!rows.length || !targetDate) {
    return (
      <section className="annual-plan-studio annual-plan-studio-empty" aria-label={copy.eyebrow}>
        <span className="annual-plan-studio-icon" aria-hidden><IconGoal /></span>
        <div><span>{copy.eyebrow}</span><h2>{copy.noPlan}</h2><p>{copy.noPlanDescription}</p></div>
      </section>
    );
  }

  return (
    <section className="annual-plan-studio" aria-label={copy.eyebrow}>
      <header className="annual-plan-studio-head">
        <span className="annual-plan-studio-icon" aria-hidden><IconGoal /></span>
        <div>
          <span>{copy.eyebrow}</span>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
      </header>

      <div className="annual-plan-summary" role="list">
        <div role="listitem"><span>{copy.useDate}</span><strong>{targetDate}</strong></div>
        <div role="listitem"><span>{copy.horizon}</span><strong>{horizon == null ? "—" : `${horizon} ${locale === "de" ? "Jahre" : "năm"}`}</strong></div>
        <div role="listitem"><span>{target.needFullAmount ? copy.useAll : copy.usePart}</span><strong>{partialNeed ? formatMoney(partialNeed, locale) : copy.amountUnknown}</strong></div>
      </div>

      <div className="annual-plan-evidence">
        <div><span>{copy.planned}</span><strong>{configuredMonthly > 0 ? `${formatMoney(configuredMonthly, locale)}/${locale === "de" ? "Monat" : "tháng"}` : copy.missingContribution}</strong></div>
        <div><span>{copy.contributionEvidence}</span><strong>{monthlyEvidence ? `${formatMoney(monthlyEvidence, locale)}/${locale === "de" ? "Monat" : "tháng"}` : "—"}</strong></div>
      </div>

      <section className="annual-plan-config" aria-label={copy.editPlan}>
        <strong>{copy.editPlan}</strong>
        <label><span>{copy.dateInput}</span><input aria-label={copy.dateInput} type="date" value={target.targetUseDate} onChange={(event) => onChangeTarget({ ...target, targetUseDate: event.target.value })} /></label>
        <label className="annual-plan-config-toggle"><input aria-label={copy.allInput} type="checkbox" checked={target.needFullAmount} onChange={(event) => onChangeTarget({ ...target, needFullAmount: event.target.checked, partialNeedEuro: event.target.checked ? undefined : target.partialNeedEuro })} /><span>{copy.allInput}</span></label>
        {!target.needFullAmount ? <label><span>{copy.partInput}</span><input aria-label={copy.partInput} inputMode="decimal" min="0" type="number" value={target.partialNeedEuro ?? ""} onChange={(event) => { const raw = event.target.value; onChangeTarget({ ...target, partialNeedEuro: raw === "" ? undefined : Math.max(0, Number(raw) || 0) }); }} /></label> : null}
      </section>

      <ol className="annual-plan-rail">
        {rows.map((row) => {
          const label = row.kind === "recorded" ? copy.recorded : row.kind === "current" ? copy.current : row.kind === "use" ? copy.use : copy.future;
          const actual = row.actual === null ? null : formatMoney(row.actual, locale);
          const planned = row.planned > 0 ? formatMoney(row.planned, locale) : "—";
          const ratio = row.actual !== null && row.planned > 0 ? Math.min(100, Math.max(0, Math.round((row.actual / row.planned) * 100))) : null;
          return (
            <li key={row.year} className={`annual-plan-row ${row.kind}`}>
              <div className="annual-plan-year"><span>{label}</span><strong>{row.year}</strong></div>
              <div className="annual-plan-track" aria-hidden><i style={{ "--annual-progress": `${ratio ?? 0}%` } as CSSProperties} /></div>
              <div className="annual-plan-data">
                <div><span>{copy.planned}</span><strong>{planned}</strong></div>
                <div><span>{copy.recordedAmount}</span><strong>{actual ?? "—"}</strong></div>
                <small>{row.actual === null ? `${row.plannedMonths} ${copy.monthCount.toLowerCase()}` : `${row.recordedMonths ?? 0}/${row.plannedMonths} ${copy.monthCount.toLowerCase()}`}</small>
              </div>
            </li>
          );
        })}
      </ol>

      <aside className="annual-plan-review"><strong>{copy.ownerReview}</strong><p>{copy.ownerReviewText}</p></aside>
    </section>
  );
}
