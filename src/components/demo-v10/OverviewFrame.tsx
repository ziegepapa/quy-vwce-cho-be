import { useMemo } from "react";
import { useLocale } from "../../lib/locale";
import { formatMoney } from "../../lib/calc";
import type { PortfolioHeartbeat } from "../../pages/portfolioHeartbeat";
import type { LifetimePlan } from "../../pages/planVsReality";
import type { YearInReview } from "../../pages/yearInReview";
import type { PortfolioDataHealth, PortfolioDataHealthIssue } from "../../pages/portfolioDataHealth";
import type { DailyBriefing } from "../../pages/dailyBriefing";
import "../../styles/overview-clean.css";

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
  briefing: DailyBriefing;
  lifetimePlan: LifetimePlan;
  goalTargetDate: string | null;
  goalHorizon: string | null;
  yearInReview: YearInReview;
  yearReviewYears: number[];
  onYearReviewYearChange: (year: number) => void;
};

function overviewCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    pageLabel: "Übersicht",
    price: "VWCE-Kurs",
    stalePrice: "Alter Kurs",
    shares: "Anteile",
    savingsPlan: "Sparplan",
    perMonth: "/Mon.",
    attention: "Zu beachten",
    rhythmQuality: (count: number) => `${count} Transaktion${count === 1 ? "" : "en"} prüfen`,
    rhythmMissingPrices: (count: number) => `Kurse für ${count} Wertpapier${count === 1 ? "" : "e"} fehlen`,
    rhythmStalePrices: (count: number) => `Kurse für ${count} Wertpapier${count === 1 ? "" : "e"} aktualisieren`,
    healthIssue: (issue: PortfolioDataHealthIssue) => issue.code === "transaction_quality"
      ? `${issue.count} Datenpunkte prüfen`
      : issue.code === "missing_quotes"
        ? `Kurse für ${issue.count} Wertpapiere fehlen`
        : issue.code === "stale_quotes"
          ? `Kurse für ${issue.count} Wertpapiere aktualisieren`
          : "Backup noch nicht erfasst",
    review: "Prüfen",
    performanceGain: "Im Plus",
    performanceLoss: "Im Minus",
    performanceFlat: "Unverändert",
    performanceUnavailable: "Noch nicht bewertbar",
    currentPlan: "Langfristplan",
    targetDate: "Zieltermin",
    timeHorizon: "Verbleibend",
    targetUnknown: "Noch kein Zieltermin erfasst",
    reviewYear: "Prüfjahr",
    planRecorded: "Erfasst",
    planOfTarget: "vom Plan",
    planNotStarted: "Der Plan startet noch nicht",
    planOnTrack: "Planbetrag erreicht",
    planBelowPlan: "Unter dem Planbetrag",
    planMonths: (planned: number, recorded: number) => `${recorded}/${planned} Monate erfasst`,
    planFrom: (label: string) => `seit ${label}`,
    planMissing: (count: number) => `${count} Monat${count === 1 ? "" : "e"} ohne erfassten Beitrag`,
    nextMilestone: "Nächster Meilenstein",
    milestoneRemaining: (remaining: string) => `Noch ${remaining}`,
    streakMonths: (count: number) => `${count} Monat${count === 1 ? "" : "e"} in Folge`,
    yearReview: "Jahresrückblick",
    yearReviewExport: "Bericht exportieren",
    yearReviewTransactions: "Buchungen",
    yearReviewContributed: "Eingezahlt",
    yearReviewQuality: (count: number) => count === 0 ? "Keine offenen Datenpunkte" : `${count} Datenpunkte prüfen`,
    yearReviewMissingNotes: (count: number) => count === 1 ? "1 Notiz fehlt" : `${count} Notizen fehlen`,
    yearReviewPriceSnapshot: "Neuester Preis",
    yearReviewNoSnapshot: "Noch kein aktueller Preis erfasst",
    todayTitle: "Heute",
    todayPriceMove: "Kursbewegung",
    todayVsYesterday: "vs. gestern",
    todayNextContribution: "Nächste Rate",
    todayNextContributionIn: (days: number) => days === 0 ? "Heute" : `in ${days} Tag${days === 1 ? "" : "en"}`,
  } : {
    pageLabel: "Tổng quan",
    price: "Giá VWCE",
    stalePrice: "Giá cũ",
    shares: "cổ phần",
    savingsPlan: "Khoản góp",
    perMonth: "/th",
    attention: "Cần chú ý",
    rhythmQuality: (count: number) => `${count} giao dịch cần rà soát`,
    rhythmMissingPrices: (count: number) => `Thiếu giá cho ${count} mã`,
    rhythmStalePrices: (count: number) => `Cần cập nhật giá cho ${count} mã`,
    healthIssue: (issue: PortfolioDataHealthIssue) => issue.code === "transaction_quality"
      ? `${issue.count} mục dữ liệu cần rà soát`
      : issue.code === "missing_quotes"
        ? `Thiếu giá cho ${issue.count} mã`
        : issue.code === "stale_quotes"
          ? `Cần cập nhật giá cho ${issue.count} mã`
          : "Chưa ghi nhận sao lưu",
    review: "Rà soát",
    performanceGain: "Đang lãi",
    performanceLoss: "Đang lỗ",
    performanceFlat: "Hòa vốn",
    performanceUnavailable: "Chưa định giá",
    currentPlan: "Kế hoạch dài hạn",
    targetDate: "Mục tiêu",
    timeHorizon: "Còn lại",
    targetUnknown: "Chưa có ngày mục tiêu",
    reviewYear: "Năm",
    planRecorded: "Đã góp",
    planOfTarget: "kế hoạch",
    planNotStarted: "Kế hoạch chưa bắt đầu",
    planOnTrack: "Đã đạt mức kế hoạch",
    planBelowPlan: "Chưa đạt mức kế hoạch",
    planMonths: (planned: number, recorded: number) => `Đã ghi nhận ${recorded}/${planned} tháng`,
    planFrom: (label: string) => `từ ${label}`,
    planMissing: (count: number) => `${count} tháng chưa có khoản góp`,
    nextMilestone: "Mốc tiếp theo",
    milestoneRemaining: (remaining: string) => `Còn ${remaining}`,
    streakMonths: (count: number) => `${count} tháng liên tiếp`,
    yearReview: "Tổng kết năm",
    yearReviewExport: "Xuất báo cáo",
    yearReviewTransactions: "giao dịch",
    yearReviewContributed: "Đã góp",
    yearReviewQuality: (count: number) => count === 0 ? "Không còn mục cần rà soát" : `${count} mục cần rà soát`,
    yearReviewMissingNotes: (count: number) => count === 1 ? "1 ghi chú còn thiếu" : `${count} ghi chú còn thiếu`,
    yearReviewPriceSnapshot: "Giá gần nhất",
    yearReviewNoSnapshot: "Chưa có giá gần nhất",
    todayTitle: "Hôm nay",
    todayPriceMove: "Biến động giá",
    todayVsYesterday: "so với hôm qua",
    todayNextContribution: "Kỳ góp tới",
    todayNextContributionIn: (days: number) => days === 0 ? "Hôm nay" : `Còn ${days} ngày`,
  };
}

type AttentionItem = {
  key: string;
  label: string;
  href: string | null;
  severity: "action" | "review" | "tip";
};

/**
 * One merged attention list. Heartbeat already prioritizes the top signal, so a
 * data-health issue describing the same underlying signal is folded into that
 * row instead of being shown twice. Data-health rows carry the more precise
 * destination (e.g. the quality review lens).
 */
function buildAttentionItems(
  heartbeat: PortfolioHeartbeat,
  dataHealth: PortfolioDataHealth,
  text: ReturnType<typeof overviewCopy>,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const seen = new Set<string>();
  const byCode = new Map(dataHealth.issues.map((issue) => [issue.code, issue]));
  const heartbeatCode = heartbeat.attention.kind === "quality"
    ? "transaction_quality"
    : heartbeat.attention.kind === "missing_prices"
      ? "missing_quotes"
      : heartbeat.attention.kind === "stale_prices"
        ? "stale_quotes"
        : null;
  const preciseLabel = (issue: PortfolioDataHealthIssue) =>
    issue.code === "transaction_quality" && dataHealth.missingNotesOnly
      ? text.yearReviewMissingNotes(dataHealth.missingNoteCount)
      : text.healthIssue(issue);
  if (heartbeat.attention.kind !== "none") {
    const issue = heartbeatCode ? byCode.get(heartbeatCode) : undefined;
    if (issue) {
      items.push({ key: issue.code, label: preciseLabel(issue), href: issue.href, severity: issue.severity });
      seen.add(issue.code);
    } else {
      const label = heartbeat.attention.kind === "quality"
        ? text.rhythmQuality(heartbeat.attention.count)
        : heartbeat.attention.kind === "missing_prices"
          ? text.rhythmMissingPrices(heartbeat.attention.count)
          : text.rhythmStalePrices(heartbeat.attention.count);
      items.push({
        key: `heartbeat-${heartbeat.attention.kind}`,
        label,
        href: heartbeat.attention.href,
        severity: "review",
      });
      if (heartbeatCode) seen.add(heartbeatCode);
    }
  }
  for (const issue of dataHealth.issues) {
    if (seen.has(issue.code)) continue;
    items.push({ key: issue.code, label: preciseLabel(issue), href: issue.href, severity: issue.severity });
  }
  return items;
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
  briefing,
  lifetimePlan,
  goalTargetDate,
  goalHorizon,
  yearInReview,
  yearReviewYears,
  onYearReviewYearChange,
}: OverviewFrameProps) {
  const { locale } = useLocale();
  const text = overviewCopy(locale);
  const attentionItems = useMemo(
    () => buildAttentionItems(heartbeat, dataHealth, text),
    [heartbeat, dataHealth, text],
  );
  const performanceLabel = heartbeat.performanceState === "gain"
    ? text.performanceGain
    : heartbeat.performanceState === "loss"
      ? text.performanceLoss
      : heartbeat.performanceState === "flat"
        ? text.performanceFlat
        : text.performanceUnavailable;
  const planStateLabel = lifetimePlan.state === "on_track"
    ? text.planOnTrack
    : lifetimePlan.state === "below_plan"
      ? text.planBelowPlan
      : text.planNotStarted;
  const planDetail = lifetimePlan.plannedMonths === 0
    ? text.planNotStarted
    : `${text.planMonths(lifetimePlan.plannedMonths, lifetimePlan.recordedMonths)} · ${text.planFrom(lifetimePlan.startLabel ?? "")}${lifetimePlan.missingMonths > 0 ? ` · ${text.planMissing(lifetimePlan.missingMonths)}` : ""}`;
  const todayPricePct = briefing.priceChange == null
    ? null
    : `${briefing.priceChange.pct > 0 ? "+" : ""}${briefing.priceChange.pct.toFixed(1).replace(".", ",")}%`;
  const todayPriceArrow = briefing.priceChange == null
    ? "—"
    : briefing.priceChange.direction === "up"
      ? "▲"
      : briefing.priceChange.direction === "down"
        ? "▼"
        : "■";
  const todayPriceDirectionClass = briefing.priceChange == null
    ? "flat"
    : briefing.priceChange.direction;
  const goalMeta = goalTargetDate
    ? `${text.targetDate}: ${goalTargetDate}${goalHorizon ? ` · ${text.timeHorizon} ${goalHorizon}` : ""}`
    : text.targetUnknown;
  const yearReviewQualityLabel = yearInReview.qualityIssueCount === 0
    ? text.yearReviewQuality(0)
    : yearInReview.missingNotesOnly
      ? text.yearReviewMissingNotes(yearInReview.missingNoteCount)
      : text.yearReviewQuality(yearInReview.qualityIssueCount);
  const yearReviewLine = useMemo(() => [
    `${text.yearReview} ${yearInReview.year}`,
    `${text.yearReviewContributed}: ${formatMoney(yearInReview.contributionAmount)}`,
    `${text.yearReviewTransactions}: ${yearInReview.transactionCount}`,
    yearReviewQualityLabel,
    yearInReview.priceSnapshot
      ? `${text.yearReviewPriceSnapshot}: ${formatMoney(yearInReview.priceSnapshot.price)} · ${yearInReview.priceSnapshot.asOf}`
      : text.yearReviewNoSnapshot,
  ].join("\n"), [text, yearInReview, yearReviewQualityLabel]);
  const exportYearReview = () => {
    const url = URL.createObjectURL(new Blob([`${yearReviewLine}\n`], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vwce-year-in-review-${yearInReview.year}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="ovc-screen" aria-label={text.pageLabel}>
      <div className="ov">
        {/* 1 — Hero: one number, one story */}
        <section className="ovc-hero" aria-label={assetsLabel}>
          <div className="ovc-eyebrow">{assetsLabel}</div>
          <div className="ovc-value">{assets}</div>
          <div className="ovc-pnl-row">
            <span className={`ovc-pnl ${pnlPositive ? "up" : "down"}`}>{pnl ?? "—"}</span>
            <span className={`ovc-pnl-pct ${heartbeat.performanceState}`}>
              {heartbeat.performance ?? performanceLabel}
            </span>
          </div>
          <div className="ovc-meta">
            <span>
              <span className="ovc-label">{text.price}</span>{" "}
              <span className="ovc-price">{price ?? "—"}</span>
            </span>
            {priceAsOf ? <span>{priceAsOf}</span> : null}
            {stale ? <span className="ovc-stale-tag">{text.stalePrice}</span> : null}
            <span>
              <span className="ovc-label">{text.shares}</span>{" "}
              <span>{shares ?? "—"}</span>
            </span>
          </div>
        </section>

        {/* 2 — Today: the daily hook, slim */}
        <section className="ovc-card" aria-label={text.todayTitle}>
          <h2 className="ovc-title">{text.todayTitle}</h2>
          <div className="ovc-today-grid">
            <div className="ovc-today-item">
              <span className="ovc-label">{text.todayPriceMove}</span>
              <strong className={`ovc-today-value ${todayPriceDirectionClass}`}>
                {todayPriceArrow} {todayPricePct ?? "—"}
              </strong>
              <small>{text.todayVsYesterday}</small>
            </div>
            <div className="ovc-today-item">
              <span className="ovc-label">{text.todayNextContribution}</span>
              <strong className="ovc-today-value calm">
                {briefing.daysToNextContribution == null ? "—" : text.todayNextContributionIn(briefing.daysToNextContribution)}
              </strong>
            </div>
          </div>
        </section>

        {/* 3 — Plan: milestone + lifetime progress + rhythm in one card */}
        <section className="ovc-card" aria-label={text.currentPlan}>
          <div className="ovc-card-head">
            <h2 className="ovc-title">{text.currentPlan}</h2>
          </div>
          {briefing.nextMilestone ? (
            <div className="ovc-milestone">
              <div className="ovc-row">
                <span>{text.nextMilestone}: <strong>{formatMoney(briefing.nextMilestone.target)}</strong></span>
                <span className="ovc-muted">{text.milestoneRemaining(formatMoney(briefing.nextMilestone.remaining))}</span>
              </div>
              <div className="ovc-bar" role="progressbar" aria-valuenow={Math.round(briefing.nextMilestone.progressPct)} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${briefing.nextMilestone.progressPct}%` }} />
              </div>
            </div>
          ) : null}
          <div className="ovc-plan-progress">
            <div className="ovc-row">
              <span>{text.planRecorded} <strong>{formatMoney(lifetimePlan.actualAmount)}</strong> / {text.planOfTarget} <strong>{formatMoney(lifetimePlan.plannedAmount)}</strong></span>
              <span className={`ovc-state ${lifetimePlan.state}`}>{planStateLabel}</span>
            </div>
            <div className="ovc-bar" role="progressbar" aria-valuenow={Math.round(lifetimePlan.progressPct)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${lifetimePlan.progressPct}%` }} />
            </div>
            <p className="ovc-muted">{planDetail}</p>
          </div>
          <div className="ovc-plan-meta">
            {savingsPlan ? (
              <span>
                <span>{text.savingsPlan}</span>{" "}
                <strong>{savingsPlan}{text.perMonth}</strong>
              </span>
            ) : null}
            {briefing.streakMonths > 0 ? <span>{text.streakMonths(briefing.streakMonths)}</span> : null}
            <span>{goalMeta}</span>
          </div>
        </section>

        {/* 4 — Attention: merged, only when there is something to do */}
        {attentionItems.length > 0 ? (
          <section className="ovc-card ovc-attention" aria-label={text.attention} data-attention-count={attentionItems.length}>
            <h2 className="ovc-title">{text.attention}</h2>
            <ul className="ovc-attention-list">
              {attentionItems.map((item) => (
                <li key={item.key}>
                  {item.href ? (
                    <a href={item.href}>
                      <span className={`ovc-sev sev-${item.severity}`} aria-hidden />
                      <span>{item.label}</span>
                      <span className="ovc-go">{text.review} ›</span>
                    </a>
                  ) : (
                    <span className="ovc-attention-static">
                      <span className={`ovc-sev sev-${item.severity}`} aria-hidden />
                      <span>{item.label}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* 5 — Year review: quiet footer row */}
        <section className="ovc-foot" aria-label={text.yearReview}>
          <div className="ovc-foot-head">
            <span className="ovc-title">{text.yearReview}</span>
            <label className="ovc-year-label">
              <select aria-label={text.reviewYear} value={yearInReview.year} onChange={(event) => onYearReviewYearChange(Number(event.target.value))}>
                {yearReviewYears.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <button type="button" className="ovc-export" onClick={exportYearReview}>{text.yearReviewExport}</button>
          </div>
          <p className="ovc-muted">
            {text.yearReviewContributed} {formatMoney(yearInReview.contributionAmount)} · {yearInReview.transactionCount} {text.yearReviewTransactions} · {yearReviewQualityLabel}
            {" · "}{yearInReview.priceSnapshot
              ? `${text.yearReviewPriceSnapshot} ${formatMoney(yearInReview.priceSnapshot.price)} · ${yearInReview.priceSnapshot.asOf}`
              : text.yearReviewNoSnapshot}
          </p>
        </section>
      </div>
    </main>
  );
}
