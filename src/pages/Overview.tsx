import { useEffect, useMemo, useState } from "react";
import { getSettings, listQuotes, listTransactions } from "../lib/db";
import { formatMoney } from "../lib/calc";
import { buildOverviewHero } from "../lib/overviewNumbers";
import { buildTodayCenterPortfolioSnapshot } from "../lib/todayCenterAdapter";
import { computeContributionStreak } from "../lib/contributionStreak";
import { computeHeroLifetimeContribution } from "../lib/heroLifetime";
import OverviewFrame from "../components/demo-v10/OverviewFrame";
import { useLocale } from "../lib/locale";
import { findTransactionQualityIssues } from "./transactionQualityInbox";
import { buildPortfolioHeartbeat } from "./portfolioHeartbeat";
import { buildPlanVsReality, planRealityReviewYears } from "./planVsReality";
import { buildYearInReview } from "./yearInReview";

function overviewPageCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    valuedAssets: "Bewertetes Vermögen",
    updated: "Stand",
    loading: "Übersicht wird geladen",
    unavailable: "Übersicht konnte nicht geladen werden",
    deviceDataSafe: "Ihre Gerätedaten bleiben unverändert.",
    retry: "Erneut versuchen",
  } : {
    valuedAssets: "Tài sản đã định giá",
    updated: "Cập nhật",
    loading: "Đang tải Tổng quan",
    unavailable: "Không tải được Tổng quan",
    deviceDataSafe: "Dữ liệu trên thiết bị vẫn được giữ nguyên.",
    retry: "Thử lại",
  };
}

function monthsFromStart(startDate: string, now: Date): number {
  const start = new Date(`${startDate}T12:00:00`);
  if (!Number.isFinite(start.getTime())) return 0;
  return (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
}

function nextPlanDate(startDate: string, locale: "vi" | "de", now = new Date()): string | null {
  const day = Number(startDate.slice(8, 10));
  if (!Number.isInteger(day) || day < 1 || day > 28) return null;
  const next = new Date(now.getFullYear(), now.getMonth(), day, 12, 0, 0);
  if (next.getTime() <= now.getTime()) next.setMonth(next.getMonth() + 1);
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", {
    day: "2-digit",
    month: "2-digit",
  }).format(next);
}

export default function Overview({ refreshKey = 0 }: { refreshKey?: number }) {
  const { locale } = useLocale();
  const text = useMemo(() => overviewPageCopy(locale), [locale]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof getSettings>> | null>(null);
  const [transactions, setTransactions] = useState<Awaited<ReturnType<typeof listTransactions>>>([]);
  const [quotes, setQuotes] = useState<Awaited<ReturnType<typeof listQuotes>>>([]);
  const [planReviewYear, setPlanReviewYear] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    void Promise.all([getSettings(), listTransactions(), listQuotes()])
      .then(([nextSettings, nextTransactions, nextQuotes]) => {
        if (!alive) return;
        setSettings(nextSettings);
        setTransactions(nextTransactions);
        setQuotes(nextQuotes);
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refreshKey, loadAttempt]);

  const view = useMemo(() => {
    if (!settings) return null;
    const snapshot = buildTodayCenterPortfolioSnapshot({
      transactions,
      quotes,
      legacyVwcePrice: settings.latestVwcePrice ?? 0,
      legacyVwcePriceAsOf: settings.latestPriceDate ?? "",
    });
    const { portfolio, market, totalQuantity, vwcePrice } = snapshot;
    const vwceValue = vwcePrice > 0 ? portfolio.vwceQty * vwcePrice : null;
    const hero = buildOverviewHero({
      securitiesValue: market.securities,
      cashBalance: portfolio.cashBalance,
      missingPriceCount: market.missingIsins.length,
      totalQuantity,
      costBasis: portfolio.vwceCostBasis,
      positionValue: vwceValue,
      transactionCount: transactions.length,
      trackInAppCash: settings.trackInAppCash ?? true,
    });
    const streak = computeContributionStreak(transactions);
    const lifetime = computeHeroLifetimeContribution({
      transactions,
      trackInAppCash: settings.trackInAppCash,
    });
    const pnl = hero.pnl;
    const performanceState: "gain" | "loss" | "flat" | "unavailable" = pnl == null || lifetime.amount <= 0
      ? "unavailable"
      : pnl > 0
        ? "gain"
        : pnl < 0
          ? "loss"
          : "flat";
    const performance = hero.pnlPct == null
      ? null
      : `${hero.pnlPct > 0 ? "+" : ""}${hero.pnlPct.toFixed(1).replace(".", ",")}%`;
    const currentDate = new Date();
    const plannedContribution = monthsFromStart(settings.startDate, currentDate) >= 12
      ? settings.contributionY2
      : settings.contributionY1;
    const contributionTotal = lifetime.amount > 0 ? formatMoney(lifetime.amount) : null;
    const performanceBase = Math.max(1, lifetime.amount + Math.max(0, pnl ?? 0));
    const lossWidth = lifetime.amount > 0 && pnl != null && pnl < 0
      ? Math.min(100, Math.max(0, (Math.abs(pnl) / lifetime.amount) * 100))
      : 0;
    const averageBuyPrice = portfolio.vwceQty > 0 && portfolio.vwceCostBasis > 0
      ? portfolio.vwceCostBasis / portfolio.vwceQty
      : null;
    const qualityIssues = findTransactionQualityIssues(transactions);
    const heartbeat = buildPortfolioHeartbeat({
      nextContribution: nextPlanDate(settings.startDate, locale, currentDate),
      performanceState,
      performance,
      qualityIssueCount: qualityIssues.length,
      missingPriceCount: market.missingIsins.length,
      stalePriceCount: snapshot.stalePriceIsins.length,
    });
    const planToday = currentDate.toISOString().slice(0, 10);
    const planReviewYears = planRealityReviewYears({
      startDate: settings.startDate,
      transactions,
      today: planToday,
    });
    const selectedPlanReviewYear = planReviewYear && planReviewYears.includes(planReviewYear)
      ? planReviewYear
      : planReviewYears[0] ?? currentDate.getFullYear();
    const planVsReality = buildPlanVsReality({
      startDate: settings.startDate,
      contributionY1: settings.contributionY1,
      contributionY2: settings.contributionY2,
      trackInAppCash: settings.trackInAppCash,
      transactions,
      today: planToday,
      year: selectedPlanReviewYear,
    });
    const yearInReview = buildYearInReview({
      today: currentDate.toISOString().slice(0, 10),
      trackInAppCash: settings.trackInAppCash,
      transactions,
      qualityIssues,
      latestPrice: vwcePrice,
      latestPriceDate: snapshot.vwceAsOf ?? "",
    });

    return {
      assetsLabel: snapshot.valueComplete ? "Portfolio VWCE" : text.valuedAssets,
      assets: formatMoney(hero.assets),
      pnl: pnl == null || pnl === 0 ? null : `${pnl > 0 ? "▲ +" : "▼ −"}${formatMoney(Math.abs(pnl))}`,
      pnlPositive: (pnl ?? 0) >= 0,
      streakMonths: streak.streakMonths,
      price: vwcePrice > 0
        ? `€${vwcePrice.toLocaleString(locale === "de" ? "de-DE" : "vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : null,
      priceAsOf: snapshot.vwceAsOf
        ? `${text.updated} ${snapshot.vwceAsOf.slice(8, 10)}/${snapshot.vwceAsOf.slice(5, 7)}`
        : null,
      stale: snapshot.stalePriceIsins.length > 0,
      shares: portfolio.vwceQty > 0
        ? portfolio.vwceQty.toLocaleString(locale === "de" ? "de-DE" : "vi-VN", { maximumFractionDigits: 4 })
        : null,
      savingsPlan: Number.isFinite(plannedContribution) && plannedContribution > 0 ? formatMoney(plannedContribution) : null,
      nextContribution: heartbeat.nextContribution,
      performance,
      heartbeat,
      planVsReality,
      planReviewYears,
      onPlanReviewYearChange: setPlanReviewYear,
      yearInReview,
      performanceState,
      contributionWidth: performanceState === "unavailable"
        ? 0
        : lifetime.amount > 0 ? Math.min(100, Math.max(0, (lifetime.amount / performanceBase) * 100)) : 0,
      gainWidth: performanceState === "gain" && lifetime.amount > 0 && pnl != null
        ? Math.min(100, Math.max(0, 100 - (lifetime.amount / performanceBase) * 100))
        : 0,
      lossWidth,
      contributionTotal,
      gainTotal: pnl == null ? null : formatMoney(pnl),
      averageBuyPrice: averageBuyPrice == null ? null : formatMoney(averageBuyPrice),
      priceComparison: vwcePrice > 0 && averageBuyPrice != null ? { averageBuyPrice, currentPrice: vwcePrice } : null,
    };
  }, [locale, planReviewYear, settings, text, transactions, quotes]);

  if (loading) return <main className="demo-v10-screen" role="status" aria-label={text.loading} aria-busy="true" />;
  if (failed || !view) {
    return (
      <main className="demo-v10-screen">
        <section className="demo-v10-gl" style={{ padding: 18 }} role="alert">
          <h1 className="demo-v10-section-title">{text.unavailable}</h1>
          <p>{text.deviceDataSafe}</p>
          <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>{text.retry}</button>
        </section>
      </main>
    );
  }
  return <OverviewFrame {...view} />;
}
