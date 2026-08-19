import { useState } from "react";
import { useLocale } from "../../lib/locale";
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
  contributionWidth: number;
  gainWidth: number;
  contributionTotal: string | null;
  gainTotal: string | null;
  averageBuyPrice: string | null;
  priceComparison: { averageBuyPrice: number; currentPrice: number } | null;
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
    averageBuyPrice: "Ø Kaufpreis",
    details: "Details",
    collapse: "Einklappen",
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
    averageBuyPrice: "Giá mua TB",
    details: "Chi tiết",
    collapse: "Thu gọn",
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
  contributionWidth,
  gainWidth,
  contributionTotal,
  gainTotal,
  averageBuyPrice,
  priceComparison,
}: OverviewFrameProps) {
  const { locale } = useLocale();
  const text = overviewCopy(locale);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const months = Math.max(0, streakMonths);
  const circumference = 2 * Math.PI * 30;
  const dash = circumference * Math.min(1, months / 24);
  const dotCount = Math.min(12, Math.max(1, months));
  const comparison = comparisonPath(priceComparison);

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

        <section className="gl perf-card">
          <div className="perf-top"><span className="perf-title">{text.portfolioPerformance}</span><span className={`perf-return ${pnlPositive ? "pos" : "neg"}`}>{performance ?? "—"}</span></div>
          <div className="perf-bar-track" aria-hidden><div className="perf-bar-base" style={{ width: `${contributionWidth}%` }} /><div className="perf-bar-gain" style={{ left: `${contributionWidth}%`, width: `${gainWidth}%` }} /></div>
          <div className="perf-legend"><div className="pl-item"><span className="pl-dot base" /><span className="pl-txt">{text.contributions}</span></div><div className="pl-item"><span className="pl-dot gain" /><span className="pl-txt">{text.gains}</span></div></div>
          <button type="button" className="perf-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}>{detailsOpen ? text.collapse : text.details} <span aria-hidden>›</span></button>
          {detailsOpen ? (
            <div className="perf-detail" aria-label={text.details}>
              <div className="pp-item"><div className="pp-lbl">{text.contributions}</div><div className="pp-val base">{contributionTotal ?? "—"}</div></div>
              <div className="pp-sep" aria-hidden />
              <div className="pp-item"><div className="pp-lbl">{text.gains}</div><div className={`pp-val ${pnlPositive ? "gain" : "loss"}`}>{gainTotal ?? "—"}</div></div>
              <div className="pp-sep" aria-hidden />
              <div className="pp-item"><div className="pp-lbl">{text.averageBuyPrice}</div><div className="pp-val muted">{averageBuyPrice ?? "—"}</div></div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
