import { useState } from "react";
import { useLocale } from "../../lib/locale";
import { formatMoney } from "../../lib/calc";
import type { PortfolioHeartbeat } from "../../pages/portfolioHeartbeat";
import type { PlanVsReality } from "../../pages/planVsReality";
import type { YearInReview } from "../../pages/yearInReview";
import "../../styles/demo-v10-overview.css";

type OverviewFrameProps = {
  assetsLabel: string;
  assets: string;
  pnl: string | null;
  pnlPositive: boolean;
  streakMonths: number;
  price: string | null;
  priceAsOf: string | null;
  stale: boolean;
  shares: string | null;
  savingsPlan: string | null;
  nextContribution: string | null;
  performance: string | null;
  performanceState: "gain" | "loss" | "flat" | "unavailable";
  contributionWidth: number;
  gainWidth: number;
  lossWidth: number;
  contributionTotal: string | null;
  gainTotal: string | null;
  averageBuyPrice: string | null;
  priceComparison: { averageBuyPrice: number; currentPrice: number } | null;
  heartbeat: PortfolioHeartbeat;
  planVsReality: PlanVsReality;
  yearInReview: YearInReview;
};

function overviewCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    pageLabel: "Übersicht",
    contributionMonths: "Beitragsmonate",
    price: "VWCE-Kurs",
    stalePrice: "ALTER KURS",
    priceHistoryUnavailable: "Nicht genügend Kursverlauf-Daten",
    priceVsAverage: "Aktueller Kurs gegenüber dem durchschnittlichen Kaufpreis",
    shares: "Anteile",
    savingsPlan: "Sparplan",
    perMonth: "/ Mon.",
    consecutiveMonths: "Monate in Folge",
    contributionStreak: "Einzahlungsserie",
    nextContribution: "Nächste Rate",
    streakAria: (months: number) => `${months} Beitragsmonate in Folge`,
    portfolioPerformance: "Portfolio-Performance",
    contributions: "Einzahlungen",
    gains: "Ertrag",
    loss: "Verlust",
    breakEven: "Unverändert",
    unvalued: "Noch nicht bewertbar",
    averageBuyPrice: "Ø Kaufpreis",
    details: "Details",
    collapse: "Einklappen",
    heartbeat: "Portfolio-Check",
    heartbeatNext: "Nächste Rate",
    heartbeatPerformance: "Performance",
    heartbeatAttention: "Aufmerksamkeit",
    heartbeatGain: "Im Plus",
    heartbeatLoss: "Im Minus",
    heartbeatFlat: "Unverändert",
    heartbeatUnavailable: "Noch nicht bewertbar",
    heartbeatQuality: (count: number) => `${count} Transaktionen prüfen`,
    heartbeatMissingPrices: (count: number) => `Preise für ${count} Wertpapiere fehlen`,
    heartbeatStalePrices: (count: number) => `Kurse für ${count} Wertpapiere aktualisieren`,
    heartbeatClear: "Alles im Blick",
    heartbeatReview: "Prüfen",
    planReality: "Plan und Realität",
    planRealityPlanned: "Sparplan bis heute",
    planRealityRecorded: "Erfasst",
    planRealityMonths: (planned: number, recorded: number) => `${recorded}/${planned} Monate erfasst`,
    planRealityMissing: (count: number) => `${count} Monat${count === 1 ? "" : "e"} ohne erfassten Beitrag`,
    planRealityNotStarted: "Der Plan startet noch nicht",
    planRealityOnTrack: "Planbetrag erreicht",
    planRealityBelowPlan: "Unter dem Planbetrag",
    yearReview: "Jahresrückblick",
    yearReviewExport: "Bericht exportieren",
    yearReviewContributed: "Eingezahlt",
    yearReviewFeesTaxes: "Gebühren & Steuern",
    yearReviewTransactions: "Erfasste Buchungen",
    yearReviewQuality: (count: number) => count === 0 ? "Keine Datenpunkte offen" : `${count} Datenpunkte prüfen`,
    yearReviewPriceSnapshot: "Preis-Snapshot",
    yearReviewNoSnapshot: "Kein Preis-Snapshot erfasst",
    yearReviewNoHistory: "Keine Preisreihe gespeichert; es wird keine Preisveränderung abgeleitet.",
  } : {
    pageLabel: "Tổng quan",
    contributionMonths: "tháng góp",
    price: "Giá VWCE",
    stalePrice: "GIÁ CŨ",
    priceHistoryUnavailable: "Chưa đủ dữ liệu lịch sử giá",
    priceVsAverage: "Giá hiện tại so với giá mua trung bình",
    shares: "Cổ phần",
    savingsPlan: "Sparplan",
    perMonth: "/th",
    consecutiveMonths: "tháng liên tiếp",
    contributionStreak: "Chuỗi Sparplan",
    nextContribution: "Mua tiếp",
    streakAria: (months: number) => `${months} tháng góp liên tiếp`,
    portfolioPerformance: "Hiệu suất danh mục",
    contributions: "Vốn góp",
    gains: "Lãi",
    loss: "Lỗ",
    breakEven: "Hòa vốn",
    unvalued: "Chưa định giá",
    averageBuyPrice: "Giá mua TB",
    details: "Chi tiết",
    collapse: "Thu gọn",
    heartbeat: "Nhịp danh mục",
    heartbeatNext: "Kỳ góp tiếp theo",
    heartbeatPerformance: "Hiệu suất hiện tại",
    heartbeatAttention: "Cần chú ý",
    heartbeatGain: "Đang lãi",
    heartbeatLoss: "Đang lỗ",
    heartbeatFlat: "Hòa vốn",
    heartbeatUnavailable: "Chưa định giá",
    heartbeatQuality: (count: number) => `${count} giao dịch cần rà soát`,
    heartbeatMissingPrices: (count: number) => `${count} mã thiếu giá`,
    heartbeatStalePrices: (count: number) => `Cập nhật giá cho ${count} mã`,
    heartbeatClear: "Không có việc cần xử lý",
    heartbeatReview: "Rà soát",
    planReality: "Kế hoạch & thực tế",
    planRealityPlanned: "Sparplan đến nay",
    planRealityRecorded: "Đã ghi nhận",
    planRealityMonths: (planned: number, recorded: number) => `Đã ghi nhận ${recorded}/${planned} tháng`,
    planRealityMissing: (count: number) => `${count} tháng chưa có khoản góp ghi nhận`,
    planRealityNotStarted: "Kế hoạch chưa bắt đầu",
    planRealityOnTrack: "Đã đạt mức kế hoạch",
    planRealityBelowPlan: "Chưa đạt mức kế hoạch",
    yearReview: "Tổng kết năm",
    yearReviewExport: "Xuất báo cáo",
    yearReviewContributed: "Đã góp",
    yearReviewFeesTaxes: "Phí & thuế",
    yearReviewTransactions: "Giao dịch đã ghi",
    yearReviewQuality: (count: number) => count === 0 ? "Không còn mục dữ liệu cần rà soát" : `${count} mục dữ liệu cần rà soát`,
    yearReviewPriceSnapshot: "Snapshot giá",
    yearReviewNoSnapshot: "Chưa có snapshot giá",
    yearReviewNoHistory: "Chưa lưu chuỗi giá; ứng dụng không suy diễn biến động giá.",
  };
}

function comparisonPath(comparison: { averageBuyPrice: number; currentPrice: number } | null) {
  if (!comparison) return null;
  const values = [comparison.averageBuyPrice, comparison.currentPrice];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, Math.max(max, 1) * 0.035);
  const y = (value: number) => 24 - ((value - min + spread * 0.15) / (spread * 1.3)) * 19;
  const start = y(comparison.averageBuyPrice).toFixed(1);
  const end = y(comparison.currentPrice).toFixed(1);
  return {
    line: `M2 ${start} C26 ${start}, 52 ${end}, 86 ${end}`,
    fill: `M2 ${start} C26 ${start}, 52 ${end}, 86 ${end} L86 30 L2 30 Z`,
    endY: end,
    positive: comparison.currentPrice >= comparison.averageBuyPrice,
  };
}

export default function OverviewFrame({
  assetsLabel,
  assets,
  pnl,
  pnlPositive,
  streakMonths,
  price,
  priceAsOf,
  stale,
  shares,
  savingsPlan,
  nextContribution,
  performance,
  performanceState,
  contributionWidth,
  gainWidth,
  lossWidth,
  contributionTotal,
  gainTotal,
  averageBuyPrice,
  priceComparison,
  heartbeat,
  planVsReality,
  yearInReview,
}: OverviewFrameProps) {
  const { locale } = useLocale();
  const text = overviewCopy(locale);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const months = Math.max(0, streakMonths);
  const circumference = 2 * Math.PI * 30;
  const dash = circumference * Math.min(1, months / 24);
  const dotCount = Math.min(12, Math.max(1, months));
  const comparison = comparisonPath(priceComparison);
  const performanceDeltaLabel = performanceState === "gain"
    ? text.gains
    : performanceState === "loss"
      ? text.loss
      : performanceState === "flat"
        ? text.breakEven
        : text.unvalued;
  const heartbeatPerformanceLabel = heartbeat.performanceState === "gain"
    ? text.heartbeatGain
    : heartbeat.performanceState === "loss"
      ? text.heartbeatLoss
      : heartbeat.performanceState === "flat"
        ? text.heartbeatFlat
        : text.heartbeatUnavailable;
  const heartbeatAttentionLabel = heartbeat.attention.kind === "quality"
    ? text.heartbeatQuality(heartbeat.attention.count)
    : heartbeat.attention.kind === "missing_prices"
      ? text.heartbeatMissingPrices(heartbeat.attention.count)
      : heartbeat.attention.kind === "stale_prices"
        ? text.heartbeatStalePrices(heartbeat.attention.count)
        : text.heartbeatClear;
  const planRealityStateLabel = planVsReality.state === "on_track"
    ? text.planRealityOnTrack
    : planVsReality.state === "below_plan"
      ? text.planRealityBelowPlan
      : text.planRealityNotStarted;
  const exportYearReview = () => {
    const lines = [
      `${text.yearReview} ${yearInReview.year}`,
      `${text.yearReviewContributed}: ${formatMoney(yearInReview.contributionAmount)}`,
      `${text.yearReviewFeesTaxes}: ${formatMoney(yearInReview.fees + yearInReview.taxes)}`,
      `${text.yearReviewTransactions}: ${yearInReview.transactionCount}`,
      `${text.yearReviewQuality(yearInReview.qualityIssueCount)}`,
      yearInReview.priceSnapshot ? `${text.yearReviewPriceSnapshot}: ${formatMoney(yearInReview.priceSnapshot.price)} · ${yearInReview.priceSnapshot.asOf}` : text.yearReviewNoSnapshot,
      text.yearReviewNoHistory,
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vwce-year-in-review-${yearInReview.year}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="demo-v10-screen" aria-label={text.pageLabel}>
      <div className="ov">
        <section className="gl hero">
          <div className="hero-flex">
            <div className="hero-left">
              <div className="h-eye">{assetsLabel}</div>
              <div className="h-num">{assets}</div>
              <div className="h-row">
                <span className={`bdg ${pnlPositive ? "bdg-up" : "bdg-down"}`}>{pnl ?? "—"}</span>
              </div>
            </div>
            <div className="hero-ring">
              <div className="hr-shell">
                <div className="hr-pulse" aria-hidden />
                <svg className="hr-svg" viewBox="0 0 76 76" aria-hidden>
                  <defs>
                    <linearGradient id="overview-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="var(--demo-vi)" />
                      <stop offset="100%" stopColor="var(--demo-em)" />
                    </linearGradient>
                  </defs>
                  <circle cx="38" cy="38" r="30" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="7" />
                  <circle
                    cx="38"
                    cy="38"
                    r="30"
                    fill="none"
                    stroke="url(#overview-ring-gradient)"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${circumference}`}
                    transform="rotate(-90 38 38)"
                  />
                </svg>
                <div className="hr-center"><div className="hr-pct">{months || "—"}</div></div>
              </div>
              <div className="hr-cap">{text.contributionMonths}</div>
            </div>
          </div>
        </section>

        <section className="gl">
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
              <span className={`pr-pill ${stale ? "old" : "live"}`}><span className={stale ? "da" : "dl"} />{stale ? text.stalePrice : price ? "LIVE" : "—"}</span>
              {comparison ? (
                <svg className={`sparkline-svg ${comparison.positive ? "up" : "down"}`} viewBox="0 0 88 30" preserveAspectRatio="none" aria-label={text.priceVsAverage}>
                  <defs>
                    <linearGradient id="overview-spark-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="currentColor" stopOpacity=".32" />
                      <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={comparison.fill} fill="url(#overview-spark-fill)" />
                  <path d={comparison.line} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="86" cy={comparison.endY} r="2.5" fill="currentColor" />
                </svg>
              ) : <span className="sparkline-empty" aria-label={text.priceHistoryUnavailable}>—</span>}
            </div>
          </div>
        </section>

        <section className="gl combo-row">
          <div className="cr-item"><div className="cr-lbl">{text.shares}</div><div className="cr-val cr-em">{shares ?? "—"}</div></div>
          <div className="cr-div" aria-hidden />
          <div className="cr-item"><div className="cr-lbl">{text.savingsPlan}</div><div className="cr-val cr-am">{savingsPlan ?? "—"}{savingsPlan ? <span className="cr-unit">{text.perMonth}</span> : null}</div></div>
        </section>

        <section className="gl streak-card">
          <div className="sc-top">
            <div className="sc-left">
              <span className="sc-flame" aria-hidden>🔥</span>
              <div><div className="sc-count-row"><span className="sc-count">{months || "—"}</span><span className="sc-unit">{text.consecutiveMonths}</span></div><div className="sc-title">{text.contributionStreak}</div></div>
            </div>
            <div className="sc-right"><div className="sc-next-lbl">{text.nextContribution}</div><div className="sc-next-date">{nextContribution ?? "—"}</div></div>
          </div>
          <div className="sc-dots" aria-label={text.streakAria(months)}>{Array.from({ length: dotCount }, (_, index) => <span key={index} className={months > 0 ? "dot done" : "dot"} />)}</div>
        </section>

        <section className={`gl heartbeat-card heartbeat-${heartbeat.attention.kind}`} data-heartbeat-attention={heartbeat.attention.kind} aria-label={text.heartbeat}>
          <div className="heartbeat-head"><span>{text.heartbeat}</span><span className={`heartbeat-status ${heartbeat.attention.kind === "none" ? "calm" : "needs-review"}`}>{heartbeat.attention.kind === "none" ? text.heartbeatClear : text.heartbeatAttention}</span></div>
          <div className="heartbeat-grid">
            <div className="heartbeat-item"><span className="heartbeat-label">{text.heartbeatNext}</span><strong className="heartbeat-value next">{heartbeat.nextContribution ?? "—"}</strong></div>
            <div className="heartbeat-item"><span className="heartbeat-label">{text.heartbeatPerformance}</span><strong className={`heartbeat-value performance ${heartbeat.performanceState}`}>{heartbeat.performance ?? heartbeatPerformanceLabel}</strong><small>{heartbeat.performance ? heartbeatPerformanceLabel : null}</small></div>
            <div className="heartbeat-item attention"><span className="heartbeat-label">{text.heartbeatAttention}</span>{heartbeat.attention.href ? <a className="heartbeat-action" href={heartbeat.attention.href}>{heartbeatAttentionLabel}<span>{text.heartbeatReview} ›</span></a> : <strong className="heartbeat-value calm">{heartbeatAttentionLabel}</strong>}</div>
          </div>
        </section>

        <section className={`gl plan-reality-card plan-reality-${planVsReality.state}`} data-plan-reality-state={planVsReality.state} aria-label={text.planReality}>
          <div className="plan-reality-head"><span>{text.planReality} · {planVsReality.year}</span><strong>{planRealityStateLabel}</strong></div>
          <div className="plan-reality-grid">
            <div><span>{text.planRealityPlanned}</span><strong>{formatMoney(planVsReality.plannedAmount)}</strong></div>
            <div><span>{text.planRealityRecorded}</span><strong>{formatMoney(planVsReality.actualAmount)}</strong></div>
          </div>
          <div className="plan-reality-track" aria-label={`${text.planReality}: ${planVsReality.progressPct.toFixed(0)}%`}><span style={{ width: `${planVsReality.progressPct}%` }} /></div>
          <p>{planVsReality.plannedMonths === 0 ? text.planRealityNotStarted : `${text.planRealityMonths(planVsReality.plannedMonths, planVsReality.recordedMonths)} · ${planVsReality.missingMonths > 0 ? text.planRealityMissing(planVsReality.missingMonths) : text.planRealityOnTrack}`}</p>
        </section>

        <section className="gl year-review-card" aria-label={text.yearReview}>
          <div className="year-review-head"><div><span>{text.yearReview} · {yearInReview.year}</span><strong>{text.yearReviewTransactions}: {yearInReview.transactionCount}</strong></div><button type="button" className="year-review-export" onClick={exportYearReview}>{text.yearReviewExport}</button></div>
          <div className="year-review-grid">
            <div><span>{text.yearReviewContributed}</span><strong>{formatMoney(yearInReview.contributionAmount)}</strong></div>
            <div><span>{text.yearReviewFeesTaxes}</span><strong>{formatMoney(yearInReview.fees + yearInReview.taxes)}</strong></div>
            <div><span>{text.yearReviewPriceSnapshot}</span><strong>{yearInReview.priceSnapshot ? formatMoney(yearInReview.priceSnapshot.price) : "—"}</strong></div>
            <div><span>{text.heartbeatAttention}</span><strong className={yearInReview.qualityIssueCount > 0 ? "needs-review" : "calm"}>{text.yearReviewQuality(yearInReview.qualityIssueCount)}</strong></div>
          </div>
          <p>{yearInReview.priceSnapshot ? `${text.yearReviewPriceSnapshot}: ${yearInReview.priceSnapshot.asOf} · ` : ""}{text.yearReviewNoHistory}</p>
        </section>

        <section className={`gl perf-card perf-card-${performanceState}`} data-performance-state={performanceState}>
          <div className="perf-top"><span className="perf-title">{text.portfolioPerformance}</span><span className={`perf-return ${performanceState}`}>{performance ?? "—"}</span></div>
          <div className="perf-bar-track" aria-label={`${text.portfolioPerformance}: ${performanceDeltaLabel}`}>
            {performanceState !== "unavailable" ? <div className="perf-bar-base" style={{ width: `${contributionWidth}%` }} /> : null}
            {performanceState === "gain" ? <div className="perf-bar-gain" style={{ left: `${contributionWidth}%`, width: `${gainWidth}%` }} /> : null}
            {performanceState === "loss" ? <div className="perf-bar-loss" style={{ width: `${lossWidth}%` }} /> : null}
          </div>
          <div className="perf-legend"><div className="pl-item"><span className="pl-dot base" /><span className="pl-txt">{text.contributions}</span></div><div className="pl-item"><span className={`pl-dot ${performanceState}`} /><span className="pl-txt">{performanceDeltaLabel}</span></div></div>
          <button type="button" className="perf-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}>{detailsOpen ? text.collapse : text.details} <span aria-hidden>›</span></button>
          {detailsOpen ? (
            <div className="perf-detail" aria-label={text.details}>
              <div className="pp-item"><div className="pp-lbl">{text.contributions}</div><div className="pp-val base">{contributionTotal ?? "—"}</div></div>
              <div className="pp-sep" aria-hidden />
              <div className="pp-item"><div className="pp-lbl">{performanceDeltaLabel}</div><div className={`pp-val ${performanceState}`}>{gainTotal ?? "—"}</div></div>
              <div className="pp-sep" aria-hidden />
              <div className="pp-item"><div className="pp-lbl">{text.averageBuyPrice}</div><div className="pp-val muted">{averageBuyPrice ?? "—"}</div></div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
