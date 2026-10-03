import { useEffect, useMemo, useState } from "react";
import { db, getSettings, listQuotes, listTransactions } from "../lib/db";
import { formatMoney } from "../lib/calc";
import { buildOverviewHero } from "../lib/overviewNumbers";
import { buildTodayCenterPortfolioSnapshot } from "../lib/todayCenterAdapter";
import { computeHeroLifetimeContribution } from "../lib/heroLifetime";
import { computeContributionStreak } from "../lib/contributionStreak";
import OverviewFrame from "../components/demo-v10/OverviewFrame";
import { useLocale } from "../lib/locale";
import { findTransactionQualityIssues } from "./transactionQualityInbox";
import { buildPortfolioHeartbeat } from "./portfolioHeartbeat";
import { buildLifetimePlan, buildPlanVsReality } from "./planVsReality";
import { buildYearInReview, yearInReviewYears } from "./yearInReview";
import { buildPortfolioDataHealth } from "./portfolioDataHealth";
import { buildDailyBriefing, type BriefingPricePoint, type DailyBriefing } from "./dailyBriefing";

function priceHistoryUrl(): string {
  const baseUrl = import.meta.env.BASE_URL as string | undefined;
  const base = baseUrl && baseUrl.endsWith("/") ? baseUrl : `${baseUrl || "/"}/`;
  return `${base}data/price-history/IE00BK5BQT80.json`;
}

function readPriceHistory(payload: unknown): BriefingPricePoint[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = (payload as { points?: unknown }).points;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (row): row is { date: string; price: number } =>
        !!row &&
        typeof row === "object" &&
        typeof (row as { date?: unknown }).date === "string" &&
        Number.isFinite((row as { price?: unknown }).price),
    )
    .map((row) => ({ date: row.date, price: row.price as number }));
}

function overviewPageCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    valuedAssets: "Bewertetes Vermögen",
    updated: "Stand",
    priceToday: "Schlusskurs heute",
    priceYesterday: "Schlusskurs gestern",
    loading: "Übersicht wird geladen",
    unavailable: "Übersicht konnte nicht geladen werden",
    deviceDataSafe: "Ihre Gerätedaten bleiben unverändert.",
    retry: "Erneut versuchen",
  } : {
    valuedAssets: "Tài sản đã định giá",
    updated: "Cập nhật",
    priceToday: "Giá đóng cửa hôm nay",
    priceYesterday: "Giá đóng cửa hôm qua",
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

function formatGoalTargetDate(value: string | null | undefined, locale: "vi" | "de"): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function goalHorizon(value: string | null | undefined, locale: "vi" | "de", now = new Date()): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const target = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(target.getTime())) return null;
  const months = (target.getFullYear() - now.getFullYear()) * 12 + target.getMonth() - now.getMonth() - (target.getDate() < now.getDate() ? 1 : 0);
  if (months < 0) return locale === "de" ? "Zieltermin erreicht" : "Đã đến mốc mục tiêu";
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return locale === "de" ? `${years} J. ${remainingMonths} Mon.` : `${years} năm ${remainingMonths} tháng`;
}

/**
 * Freshness label for the quote: the feed only ever publishes CLOSED Xetra
 * sessions (see scripts/price), so "today"/"yesterday" always means the last
 * close — never an intraday guess.
 */
function relativePriceAsOf(
  asOf: string | null | undefined,
  text: { updated: string; priceToday: string; priceYesterday: string },
  now = new Date(),
): string | null {
  if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (asOf === day(now)) return text.priceToday;
  if (asOf === day(yesterday)) return text.priceYesterday;
  return `${text.updated} ${asOf.slice(8, 10)}/${asOf.slice(5, 7)}`;
}

function nextPlanDate(startDate: string, locale: "vi" | "de", now = new Date()): string | null {  const day = Number(startDate.slice(8, 10));
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
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<BriefingPricePoint[]>([]);
  const [yearReviewYear, setYearReviewYear] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    void Promise.all([getSettings(), listTransactions(), listQuotes(), db.appMetadata.get("meta").catch(() => null)])
      .then(([nextSettings, nextTransactions, nextQuotes, backupMeta]) => {
        if (!alive) return;
        setSettings(nextSettings);
        setTransactions(nextTransactions);
        setQuotes(nextQuotes);
        setLastBackupAt(typeof backupMeta?.lastBackupAt === "string" ? backupMeta.lastBackupAt : null);
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    // Daily briefing price history: best effort, never blocks the overview.
    void fetch(priceHistoryUrl())
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (alive) setPriceHistory(readPriceHistory(payload));
      })
      .catch(() => {
        if (alive) setPriceHistory([]);
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
    const qualityIssues = findTransactionQualityIssues(transactions);
    const heartbeat = buildPortfolioHeartbeat({
      nextContribution: nextPlanDate(settings.startDate, locale, currentDate),
      performanceState,
      performance,
      qualityIssueCount: qualityIssues.length,
      missingPriceCount: market.missingIsins.length,
      stalePriceCount: snapshot.stalePriceIsins.length,
    });
    const dataHealth = buildPortfolioDataHealth({
      transactionIssues: qualityIssues,
      missingQuoteIsins: market.missingIsins,
      staleQuoteIsins: snapshot.stalePriceIsins,
      lastBackupAt,
    });
    // Daily briefing: display-only, feeds on already computed numbers.
    const streak = computeContributionStreak(transactions);
    const contributionDay = Number(settings.startDate.slice(8, 10));
    const briefing: DailyBriefing = buildDailyBriefing({
      priceHistory,
      vwceQty: portfolio.vwceQty,
      assets: hero.assets,
      streakMonths: streak.streakMonths,
      contributionDay:
        Number.isInteger(contributionDay) && contributionDay >= 1 && contributionDay <= 28
          ? contributionDay
          : null,
      now: currentDate,
    });
    const planToday = currentDate.toISOString().slice(0, 10);
    const yearReviewYears = yearInReviewYears({
      today: planToday,
      transactions,
      qualityIssues,
    });
    const selectedYearReviewYear = yearReviewYear && yearReviewYears.includes(yearReviewYear)
      ? yearReviewYear
      : yearReviewYears[0] ?? currentDate.getFullYear();
    // Yearly slice only feeds the year-in-review internals; the plan card
    // itself shows the lifetime horizon.
    const planVsReality = buildPlanVsReality({
      startDate: settings.startDate,
      contributionY1: settings.contributionY1,
      contributionY2: settings.contributionY2,
      trackInAppCash: settings.trackInAppCash,
      transactions,
      today: planToday,
      year: selectedYearReviewYear,
    });
    const lifetimePlan = buildLifetimePlan({
      startDate: settings.startDate,
      contributionY1: settings.contributionY1,
      contributionY2: settings.contributionY2,
      trackInAppCash: settings.trackInAppCash,
      transactions,
      today: planToday,
    });
    const yearInReview = buildYearInReview({
      today: planToday,
      trackInAppCash: settings.trackInAppCash,
      transactions,
      qualityIssues,
      planProgress: planVsReality,
      latestPrice: vwcePrice,
      latestPriceDate: snapshot.vwceAsOf ?? "",
      year: selectedYearReviewYear,
    });

    return {
      assetsLabel: snapshot.valueComplete ? "Portfolio VWCE" : text.valuedAssets,
      assets: formatMoney(hero.assets),
      pnl: pnl == null || pnl === 0 ? null : `${pnl > 0 ? "▲ +" : "▼ −"}${formatMoney(Math.abs(pnl))}`,
      pnlPositive: (pnl ?? 0) >= 0,
      price: vwcePrice > 0
        ? `€${vwcePrice.toLocaleString(locale === "de" ? "de-DE" : "vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : null,
      priceAsOf: relativePriceAsOf(snapshot.vwceAsOf, text, currentDate),
      stale: snapshot.stalePriceIsins.length > 0,
      shares: portfolio.vwceQty > 0
        ? portfolio.vwceQty.toLocaleString(locale === "de" ? "de-DE" : "vi-VN", { maximumFractionDigits: 4 })
        : null,
      savingsPlan: Number.isFinite(plannedContribution) && plannedContribution > 0 ? formatMoney(plannedContribution) : null,
      heartbeat,
      dataHealth,
      briefing,
      lifetimePlan,
      yearInReview,
      yearReviewYears,
      onYearReviewYearChange: setYearReviewYear,
      goalTargetDate: formatGoalTargetDate(settings.endDate, locale),
      goalHorizon: goalHorizon(settings.endDate, locale, currentDate),
    };
  }, [lastBackupAt, locale, yearReviewYear, settings, text, transactions, quotes, priceHistory]);

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
