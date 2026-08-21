import { useMemo } from "react";
import { useLocale } from "../../lib/locale";
import { formatMoney } from "../../lib/calc";
import type { PortfolioHeartbeat } from "../../pages/portfolioHeartbeat";
import type { PlanVsReality } from "../../pages/planVsReality";
import type { YearInReview } from "../../pages/yearInReview";
import type { PortfolioDataHealth } from "../../pages/portfolioDataHealth";
import "../../styles/demo-v10-overview.css";

type OverviewFrameProps = {
  assetsLabel: string;
  assets: string;
  pnl: string | null;
  pnlPositive: boolean;
  price: string | null;
  priceAsOf: string | null;
  stale: boolean;
  shares: string | null;
  savingsPlan: string | null;
  heartbeat: PortfolioHeartbeat;
  dataHealth: PortfolioDataHealth;
  goalTargetDate: string | null;
  goalHorizon: string | null;
  planVsReality: PlanVsReality;
  planReviewYears: number[];
  onPlanReviewYearChange: (year: number) => void;
  yearInReview: YearInReview;
  yearReviewYears: number[];
  onYearReviewYearChange: (year: number) => void;
};

function overviewCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    pageLabel: "Übersicht",
    price: "VWCE-Kurs",
    currentPrice: "AKTUELL",
    stalePrice: "ALTER KURS",
    shares: "Anteile",
    savingsPlan: "Sparplan",
    perMonth: "/ Mon.",
    rhythm: "Portfoliorhythmus",
    rhythmNext: "Nächste Rate",
    rhythmPerformance: "Aktueller Stand",
    rhythmAttention: "Aufmerksamkeit",
    performanceGain: "Im Plus",
    performanceLoss: "Im Minus",
    performanceFlat: "Unverändert",
    performanceUnavailable: "Noch nicht bewertbar",
    rhythmQuality: (count: number) => `${count} Transaktion${count === 1 ? "" : "en"} prüfen`,
    rhythmMissingPrices: (count: number) => `Kurse für ${count} Wertpapier${count === 1 ? "" : "e"} fehlen`,
    rhythmStalePrices: (count: number) => `Kurse für ${count} Wertpapier${count === 1 ? "" : "e"} aktualisieren`,
    rhythmClear: "Alles im Blick",
    review: "Prüfen",
    dataHealth: "Datenstatus",
    dataHealthClear: "Keine Datenhinweise",
    dataHealthSummary: (count: number) => `${count} Datenpunkt${count === 1 ? "" : "e"} prüfen`,
    dataHealthAction: "Aktion erforderlich",
    dataHealthReview: "Prüfen",
    dataHealthTip: "Hinweis",
    currentPlan: "Aktueller Langfristplan",
    targetDate: "Zieltermin",
    timeHorizon: "Zeitraum",
    targetUnknown: "Noch kein Zieltermin erfasst",
    reviewYear: "Prüfjahr",
    planPlanned: "Sparplan bis heute",
    planRecorded: "Erfasst",
    planNotStarted: "Der Plan startet noch nicht",
    planOnTrack: "Planbetrag erreicht",
    planBelowPlan: "Unter dem Planbetrag",
    planMonths: (planned: number, recorded: number) => `${recorded}/${planned} Monate erfasst`,
    planMissing: (count: number) => `${count} Monat${count === 1 ? "" : "e"} ohne erfassten Beitrag`,
    yearReview: "Jahresrückblick",
    yearReviewYear: "Prüfjahr",
    yearReviewExport: "Bericht exportieren",
    yearReviewTransactions: "Erfasste Buchungen",
    yearReviewQuality: (count: number) => count === 0 ? "Keine Datenpunkte offen" : `${count} Datenpunkte prüfen`,
    yearReviewContributed: "Eingezahlt",
    yearReviewWithdrawn: "Ausgezahlt",
    yearReviewPriceSnapshot: "Preis-Snapshot",
    yearReviewNoSnapshot: "Kein Preis-Snapshot erfasst",
  } : {
    pageLabel: "Tổng quan",
    price: "Giá VWCE",
    currentPrice: "MỚI NHẤT",
    stalePrice: "GIÁ CŨ",
    shares: "Cổ phần",
    savingsPlan: "Khoản góp hằng tháng",
    perMonth: "/th",
    rhythm: "Nhịp danh mục",
    rhythmNext: "Kỳ góp tiếp theo",
    rhythmPerformance: "Hiệu suất hiện tại",
    rhythmAttention: "Cần chú ý",
    performanceGain: "Đang lãi",
    performanceLoss: "Đang lỗ",
    performanceFlat: "Hòa vốn",
    performanceUnavailable: "Chưa định giá",
    rhythmQuality: (count: number) => `${count} giao dịch cần rà soát`,
    rhythmMissingPrices: (count: number) => `Thiếu giá cho ${count} mã`,
    rhythmStalePrices: (count: number) => `Cần cập nhật giá cho ${count} mã`,
    rhythmClear: "Không có việc cần xử lý",
    review: "Rà soát",
    dataHealth: "Tình trạng dữ liệu",
    dataHealthClear: "Không có mục dữ liệu cần chú ý",
    dataHealthSummary: (count: number) => `${count} mục dữ liệu cần rà soát`,
    dataHealthAction: "Cần xử lý",
    dataHealthReview: "Cần kiểm tra",
    dataHealthTip: "Gợi ý",
    currentPlan: "Kế hoạch dài hạn hiện tại",
    targetDate: "Ngày mục tiêu",
    timeHorizon: "Thời gian còn lại",
    targetUnknown: "Chưa có ngày mục tiêu",
    reviewYear: "Năm rà soát",
    planPlanned: "Kế hoạch góp đến nay",
    planRecorded: "Đã ghi nhận",
    planNotStarted: "Kế hoạch chưa bắt đầu",
    planOnTrack: "Đã đạt mức kế hoạch",
    planBelowPlan: "Chưa đạt mức kế hoạch",
    planMonths: (planned: number, recorded: number) => `Đã ghi nhận ${recorded}/${planned} tháng`,
    planMissing: (count: number) => `${count} tháng chưa có khoản góp ghi nhận`,
    yearReview: "Tổng kết năm",
    yearReviewYear: "Năm rà soát",
    yearReviewExport: "Xuất báo cáo",
    yearReviewTransactions: "Giao dịch đã ghi",
    yearReviewQuality: (count: number) => count === 0 ? "Không còn mục dữ liệu cần rà soát" : `${count} mục dữ liệu cần rà soát`,
    yearReviewContributed: "Đã góp",
    yearReviewWithdrawn: "Đã rút",
    yearReviewPriceSnapshot: "Snapshot giá",
    yearReviewNoSnapshot: "Chưa có snapshot giá",
  };
}

export default function OverviewFrame({
  assetsLabel,
  assets,
  pnl,
  pnlPositive,
  price,
  priceAsOf,
  stale,
  shares,
  savingsPlan,
  heartbeat,
  dataHealth,
  goalTargetDate,
  goalHorizon,
  planVsReality,
  planReviewYears,
  onPlanReviewYearChange,
  yearInReview,
  yearReviewYears,
  onYearReviewYearChange,
}: OverviewFrameProps) {
  const { locale } = useLocale();
  const text = overviewCopy(locale);
  const primaryHealthIssue = dataHealth.issues[0] ?? null;
  const performanceLabel = heartbeat.performanceState === "gain"
    ? text.performanceGain
    : heartbeat.performanceState === "loss"
      ? text.performanceLoss
      : heartbeat.performanceState === "flat"
        ? text.performanceFlat
        : text.performanceUnavailable;
  const rhythmAttentionLabel = heartbeat.attention.kind === "quality"
    ? text.rhythmQuality(heartbeat.attention.count)
    : heartbeat.attention.kind === "missing_prices"
      ? text.rhythmMissingPrices(heartbeat.attention.count)
      : heartbeat.attention.kind === "stale_prices"
        ? text.rhythmStalePrices(heartbeat.attention.count)
        : text.rhythmClear;
  const planStateLabel = planVsReality.state === "on_track"
    ? text.planOnTrack
    : planVsReality.state === "below_plan"
      ? text.planBelowPlan
      : text.planNotStarted;
  const planDetail = planVsReality.plannedMonths === 0
    ? text.planNotStarted
    : `${text.planMonths(planVsReality.plannedMonths, planVsReality.recordedMonths)} · ${planVsReality.missingMonths > 0 ? text.planMissing(planVsReality.missingMonths) : text.planOnTrack}`;
  const yearReviewLine = useMemo(() => [
    `${text.yearReview} ${yearInReview.year}`,
    `${text.yearReviewContributed}: ${formatMoney(yearInReview.contributionAmount)}`,
    `${text.yearReviewWithdrawn}: ${formatMoney(yearInReview.withdrawnAmount)}`,
    `${text.yearReviewTransactions}: ${yearInReview.transactionCount}`,
    text.yearReviewQuality(yearInReview.qualityIssueCount),
    yearInReview.priceSnapshot
      ? `${text.yearReviewPriceSnapshot}: ${formatMoney(yearInReview.priceSnapshot.price)} · ${yearInReview.priceSnapshot.asOf}`
      : text.yearReviewNoSnapshot,
  ].join("\n"), [text, yearInReview]);
  const exportYearReview = () => {
    const url = URL.createObjectURL(new Blob([`${yearReviewLine}\n`], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vwce-year-in-review-${yearInReview.year}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="demo-v10-screen" aria-label={text.pageLabel}>
      <div className="ov overview-state-surface">
        <section className="gl hero">
          <div className="hero-flex">
            <div className="hero-left">
              <div className="h-eye">{assetsLabel}</div>
              <div className="h-num">{assets}</div>
              <div className="h-row">
                <span className={`bdg ${pnlPositive ? "bdg-up" : "bdg-down"}`}>{pnl ?? "—"}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="gl" aria-label={text.price}>
          <div className={`price-row${stale ? " stale" : ""}`}>
            <div className="pr-left">
              <div className="pr-label">{text.price}</div>
              <div className="pr-num">
                {stale ? <span className="pr-tilde show">~</span> : null}
                <span className="pr-cur">€</span>
                <span className={`pr-big${price ? "" : " dim"}`}>{price ? price.replace(/^€/, "") : "—"}</span>
              </div>
              <div className="pr-ts">{priceAsOf ?? "—"}</div>
            </div>
            <div className="pr-right">
              <span className={`pr-pill ${stale ? "old" : "live"}`}>
                <span className={stale ? "da" : "dl"} />
                {stale ? text.stalePrice : price ? text.currentPrice : "—"}
              </span>
            </div>
          </div>
        </section>

        <section className="gl combo-row" aria-label={`${text.shares} · ${text.savingsPlan}`}>
          <div className="cr-item"><div className="cr-lbl">{text.shares}</div><div className="cr-val cr-em">{shares ?? "—"}</div></div>
          <div className="cr-div" aria-hidden />
          <div className="cr-item"><div className="cr-lbl">{text.savingsPlan}</div><div className="cr-val cr-am">{savingsPlan ?? "—"}{savingsPlan ? <span className="cr-unit">{text.perMonth}</span> : null}</div></div>
        </section>

        <section className={`gl heartbeat-card heartbeat-${heartbeat.attention.kind}`} data-heartbeat-attention={heartbeat.attention.kind} aria-label={text.rhythm}>
          <div className="heartbeat-head"><span>{text.rhythm}</span><span className={`heartbeat-status ${heartbeat.attention.kind === "none" ? "calm" : "needs-review"}`}>{heartbeat.attention.kind === "none" ? text.rhythmClear : text.rhythmAttention}</span></div>
          <div className="heartbeat-grid">
            <div className="heartbeat-item"><span className="heartbeat-label">{text.rhythmNext}</span><strong className="heartbeat-value next">{heartbeat.nextContribution ?? "—"}</strong></div>
            <div className="heartbeat-item"><span className="heartbeat-label">{text.rhythmPerformance}</span><strong className={`heartbeat-value performance ${heartbeat.performanceState}`}>{heartbeat.performance ?? performanceLabel}</strong><small>{heartbeat.performance ? performanceLabel : null}</small></div>
            <div className="heartbeat-item attention"><span className="heartbeat-label">{text.rhythmAttention}</span>{heartbeat.attention.href ? <a className="heartbeat-action" href={heartbeat.attention.href}>{rhythmAttentionLabel}<span>{text.review} ›</span></a> : <strong className="heartbeat-value calm">{rhythmAttentionLabel}</strong>}</div>
          </div>
        </section>

        <section className={`gl data-health-card data-health-${primaryHealthIssue?.severity ?? "clear"}`} aria-label={text.dataHealth}>
          <div className="data-health-head"><span>{text.dataHealth}</span><strong>{dataHealth.issues.length ? text.dataHealthSummary(dataHealth.issues.length) : text.dataHealthClear}</strong></div>
          {primaryHealthIssue ? (
            <a className={`data-health-item data-health-summary ${primaryHealthIssue.severity}`} href={primaryHealthIssue.href}>
              <span className="data-health-copy"><strong>{text.dataHealthSummary(dataHealth.issues.length)}</strong><small>{primaryHealthIssue.severity === "action" ? text.dataHealthAction : primaryHealthIssue.severity === "review" ? text.dataHealthReview : text.dataHealthTip}</small></span>
              <span className={`data-health-severity ${primaryHealthIssue.severity}`}>{text.review} ›</span>
            </a>
          ) : null}
        </section>

        <section className={`gl plan-reality-card plan-reality-${planVsReality.state}`} data-plan-reality-state={planVsReality.state} aria-label={text.currentPlan}>
          <div className="plan-reality-head overview-goal-head">
            <div className="overview-goal-title"><span>{text.currentPlan}</span><small>{text.targetDate}: <strong>{goalTargetDate ?? text.targetUnknown}</strong>{goalHorizon ? ` · ${text.timeHorizon}: ${goalHorizon}` : ""}</small></div>
            <label className="plan-reality-year-label">
              <span>{text.reviewYear}</span>
              <select aria-label={text.reviewYear} value={planVsReality.year} onChange={(event) => onPlanReviewYearChange(Number(event.target.value))}>
                {planReviewYears.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <strong>{planStateLabel}</strong>
          </div>
          <div className="plan-reality-grid">
            <div><span>{text.planPlanned}</span><strong>{formatMoney(planVsReality.plannedAmount)}</strong></div>
            <div><span>{text.planRecorded}</span><strong>{formatMoney(planVsReality.actualAmount)}</strong></div>
          </div>
          <div className="plan-reality-track" aria-label={`${text.currentPlan}: ${planVsReality.progressPct.toFixed(0)}%`}><span style={{ width: `${planVsReality.progressPct}%` }} /></div>
          <p>{planDetail}</p>
        </section>

        <section className="gl year-review-card" aria-label={text.yearReview}>
          <div className="year-review-head">
            <div>
              <span>{text.yearReview}</span>
              <label className="year-review-year-label">
                <span>{text.yearReviewYear}</span>
                <select aria-label={text.yearReviewYear} value={yearInReview.year} onChange={(event) => onYearReviewYearChange(Number(event.target.value))}>
                  {yearReviewYears.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
            </div>
            <button type="button" className="year-review-export" onClick={exportYearReview}>{text.yearReviewExport}</button>
          </div>
          <div className="year-review-grid year-review-compact">
            <div><span>{text.yearReviewTransactions}</span><strong>{yearInReview.transactionCount}</strong></div>
            <div><span>{text.rhythmAttention}</span><strong className={yearInReview.qualityIssueCount > 0 ? "needs-review" : "calm"}>{text.yearReviewQuality(yearInReview.qualityIssueCount)}</strong></div>
          </div>
        </section>
      </div>
    </main>
  );
}
