import { useEffect, useMemo, useState } from "react";
import { db, getSettings, listQuotes, listTransactions } from "../lib/db";
import { formatMoney } from "../lib/calc";
import { VALL_ISIN, VWCE_ISIN } from "../lib/types";
import { buildOverviewHero } from "../lib/overviewNumbers";
import { buildTodayCenterPortfolioSnapshot } from "../lib/todayCenterAdapter";
import { computeHeroLifetimeContribution } from "../lib/heroLifetime";
import { computeContributionStreak } from "../lib/contributionStreak";
import OverviewFrame, { type AllocationSlice, type UpdateItem } from "../components/demo-v10/OverviewFrame";
import { useLocale } from "../lib/locale";
import { findTransactionQualityIssues } from "./transactionQualityInbox";
import { buildPortfolioHeartbeat } from "./portfolioHeartbeat";
import { buildPlanVsReality } from "./planVsReality";
import { buildYearInReview, yearInReviewYears } from "./yearInReview";
import { buildPortfolioDataHealth } from "./portfolioDataHealth";
import { buildDailyBriefing, type BriefingPricePoint, type DailyBriefing } from "./dailyBriefing";
import { buildValueHistory } from "../lib/valueHistory";
import { computeRecentPace } from "./trajectory";

function priceHistoryUrl(isin: string): string {
  const baseUrl = import.meta.env.BASE_URL as string | undefined;
  const base = baseUrl && baseUrl.endsWith("/") ? baseUrl : `${baseUrl || "/"}/`;
  return `${base}data/price-history/${isin}.json`;
}

function readPriceHistory(payload: unknown): BriefingPricePoint[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = (payload as { points?: unknown }).points;
  if (!Array.isArray(raw)) return [];
  const valid = raw
    .filter(
      (row): row is { date: string; price: number } =>
        !!row &&
        typeof row === "object" &&
        typeof (row as { date?: unknown }).date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test((row as { date: string }).date) &&
        Number.isFinite((row as { price?: unknown }).price) &&
        (row as { price: number }).price > 0,
    )
    .map((row) => ({ date: row.date, price: row.price as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map<string, BriefingPricePoint>();
  for (const point of valid) byDate.set(point.date, point);
  return [...byDate.values()];
}

/** Latest known close versus the previous close; display-only, never affects assets. */
function dailyMoveFromHistory(
  history: ReadonlyArray<BriefingPricePoint>,
  quantity: number,
): { absolute: number; relative: number } | null {
  const points = [...history]
    .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.price) && point.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const unique = points.filter((point, index) => index === points.length - 1 || points[index + 1].date !== point.date);
  if (unique.length < 2 || !Number.isFinite(quantity) || quantity <= 0) return null;
  const previous = unique[unique.length - 2];
  const latest = unique[unique.length - 1];
  const priceDelta = latest.price - previous.price;
  return {
    absolute: priceDelta * quantity,
    relative: (priceDelta / previous.price) * 100,
  };
}

function overviewPageCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    loading: "Übersicht wird geladen",
    unavailable: "Übersicht konnte nicht geladen werden",
    deviceDataSafe: "Ihre Gerätedaten bleiben unverändert.",
    retry: "Erneut versuchen",
    valuedAssets: "Bewertetes Vermögen",
    portfolioLabel: "Gesamtportfolio",
    quoteUpdated: "Kursupdate erfolgreich",
    txBuy: (ticker: string) => `Kauf ${ticker} ausgeführt`,
    txBuyDetail: (shares: string, amount: string) => `Kauf ${shares} Ant. · ${amount}`,
    txOther: "Buchung erfasst",
  } : {
    loading: "Đang tải Tổng quan",
    unavailable: "Không tải được Tổng quan",
    deviceDataSafe: "Dữ liệu trên thiết bị vẫn được giữ nguyên.",
    retry: "Thử lại",
    valuedAssets: "Tài sản đã định giá",
    portfolioLabel: "Tổng danh mục",
    quoteUpdated: "Cập nhật giá thành công",
    txBuy: (ticker: string) => `Lệnh ${ticker} khớp`,
    txBuyDetail: (shares: string, amount: string) => `Mua ${shares} cp · ${amount}`,
    txOther: "Đã ghi nhận giao dịch",
  };
}

// Display ticker for a held ISIN. Unknown ISINs fall back to the ISIN itself
// so a new fund never renders as a blank label.
function instrumentTicker(isin: string): string {
  if (isin === VWCE_ISIN) return "VWCE";
  if (isin === VALL_ISIN) return "VALL";
  return isin;
}

/** Full fund name for a held ISIN. Unknown ISINs fall back to the ticker. */
function instrumentName(isin: string): string {
  if (isin === VWCE_ISIN) return "Vanguard FTSE All-World";
  if (isin === VALL_ISIN) return "Vanguard FTSE Global All-Cap";
  return instrumentTicker(isin);
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

/** "2026-10-16" → "16/10/2026". */
function formatDateLabel(iso: string, locale: "vi" | "de"): string | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d);
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
  const [priceHistories, setPriceHistories] = useState<Map<string, BriefingPricePoint[]>>(new Map());
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
    return () => {
      alive = false;
    };
  }, [refreshKey, loadAttempt]);

  // Historical closes for supported funds power the per-fund day-trend metric.
  // This stays best-effort and never blocks the overview or changes the total.
  useEffect(() => {
    let alive = true;
    const historyIsins = [VWCE_ISIN, VALL_ISIN] as const;
    void Promise.all(historyIsins.map(async (isin) => {
      try {
        const response = await fetch(priceHistoryUrl(isin), { cache: "no-store" });
        const history = response.ok ? readPriceHistory(await response.json()) : [];
        return [isin, history] as const;
      } catch {
        return [isin, []] as const;
      }
    })).then((entries) => {
      if (alive) setPriceHistories(new Map(entries));
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
    const totalCostBasis = Object.values(portfolio.positions).reduce(
      (sum, pos) => sum + Math.max(0, pos.costBasis),
      0,
    );
    const positionValue = market.missingIsins.length === 0 ? market.securities : null;
    const hero = buildOverviewHero({
      securitiesValue: market.securities,
      cashBalance: portfolio.cashBalance,
      missingPriceCount: market.missingIsins.length,
      totalQuantity,
      costBasis: totalCostBasis,
      positionValue,
      transactionCount: transactions.length,
      trackInAppCash: settings.trackInAppCash ?? true,
    });
    const lifetime = computeHeroLifetimeContribution({
      transactions,
      trackInAppCash: settings.trackInAppCash,
    });
    const pnl = hero.pnl;
    const gainLabel = pnl == null || pnl === 0
      ? null
      : `${pnl > 0 ? "+" : "−"}${formatMoney(Math.abs(pnl))}`;
    const gainPctLabel = hero.pnlPct == null
      ? null
      : `${hero.pnlPct > 0 ? "+" : ""}${hero.pnlPct.toFixed(1).replace(".", ",")}%`;
    const currentDate = new Date();
    // Nhịp góp = tháng gần nhất có góp (actual behavior), not the settings.
    const recentPace = computeRecentPace({
      transactions,
      trackInAppCash: settings.trackInAppCash,
      today: currentDate,
    });
    const qualityIssues = findTransactionQualityIssues(transactions);
    const heartbeat = buildPortfolioHeartbeat({
      nextContribution: nextPlanDate(settings.startDate, locale, currentDate),
      performanceState: pnl == null || lifetime.amount <= 0
        ? "unavailable"
        : pnl > 0 ? "gain" : pnl < 0 ? "loss" : "flat",
      performance: gainPctLabel,
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
    const priceHistory = priceHistories.get(VWCE_ISIN) ?? [];
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

    // Allocation: one slice per held ISIN, numeric for the donut.
    const numberFormat = new Intl.NumberFormat(locale === "de" ? "de-DE" : "vi-VN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
    const sharesFormat = new Intl.NumberFormat(locale === "de" ? "de-DE" : "vi-VN", {
      maximumFractionDigits: 4,
    });
    const percentageFormat = new Intl.NumberFormat(locale === "de" ? "de-DE" : "vi-VN", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    const dailyPercentageFormat = new Intl.NumberFormat(locale === "de" ? "de-DE" : "vi-VN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const allocation: AllocationSlice[] = Object.entries(market.byIsin)
      .filter(([, row]) => row.qty > 0 && (row.value ?? 0) > 0)
      .sort(([, a], [, b]) => (b.value ?? 0) - (a.value ?? 0))
      .map(([isin, row]) => {
        const value = row.value ?? 0;
        const costBasis = portfolio.positions[isin]?.costBasis ?? 0;
        const pnl = Number.isFinite(costBasis) && costBasis > 0 ? value - costBasis : null;
        const pnlPct = pnl == null ? null : (pnl / costBasis) * 100;
        const dailyMove = dailyMoveFromHistory(priceHistories.get(isin) ?? [], row.qty);
        return {
          isin,
          ticker: instrumentTicker(isin),
          name: instrumentName(isin),
          value,
          weightPct: hero.assets > 0 ? (value / hero.assets) * 100 : 0,
          shares: sharesFormat.format(row.qty),
          pricePerShare: row.price != null
            ? `${numberFormat.format(row.price)} €/${locale === "de" ? "Ant." : "cp"}`
            : null,
          valueLabel: formatMoney(value),
          pnlLabel: pnl == null ? null : (pnl > 0 ? "+" : pnl < 0 ? "−" : "") + formatMoney(Math.abs(pnl)),
          pnlPctLabel: pnlPct == null ? null : (pnlPct > 0 ? "+" : pnlPct < 0 ? "−" : "") + percentageFormat.format(Math.abs(pnlPct)) + "%",
          dayChangeLabel: dailyMove == null ? null : (dailyMove.absolute > 0 ? "+" : dailyMove.absolute < 0 ? "−" : "") + formatMoney(Math.abs(dailyMove.absolute)),
          dayChangePctLabel: dailyMove == null ? null : (dailyMove.relative > 0 ? "+" : dailyMove.relative < 0 ? "−" : "") + dailyPercentageFormat.format(Math.abs(dailyMove.relative)) + "%",
          pnlPositive: pnl == null ? null : pnl >= 0,
          dayChangePositive: dailyMove == null ? null : dailyMove.absolute >= 0,
        };
      });

    // Recent updates: latest quote per ISIN (max 2) + latest transaction.
    const updates: UpdateItem[] = [];
    const latestByIsin = new Map<string, { price: number; asOf: string }>();
    for (const q of quotes) {
      if (!Number.isFinite(q.price) || q.price <= 0 || !/^\d{4}-\d{2}-\d{2}/.test(q.asOf)) continue;
      const isin = q.instrumentIsin || VWCE_ISIN;
      const prev = latestByIsin.get(isin);
      if (!prev || q.asOf > prev.asOf) latestByIsin.set(isin, { price: q.price, asOf: q.asOf });
    }
    const latestQuotes = [...latestByIsin.entries()]
      .sort((a, b) => b[1].asOf.localeCompare(a[1].asOf))
      .slice(0, 2);
    for (const [isin, q] of latestQuotes) {
      const dateLabel = formatDateLabel(q.asOf, locale);
      if (!dateLabel) continue;
      updates.push({
        key: `quote-${isin}`,
        dateLabel,
        title: text.quoteUpdated,
        detail: `${instrumentTicker(isin)}: ${numberFormat.format(q.price)} €`,
      });
    }
    const latestTx = transactions
      .filter((t) => !t.deletedAt && /^\d{4}-\d{2}-\d{2}/.test(t.date))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (latestTx) {
      const dateLabel = formatDateLabel(latestTx.date, locale);
      const isBuy = latestTx.type === "buy_vwce" || latestTx.type === "buy_security";
      const ticker = instrumentTicker(
        (latestTx as { instrumentIsin?: string }).instrumentIsin || (isBuy ? VWCE_ISIN : ""),
      );
      if (dateLabel) {
        updates.push({
          key: `tx-${latestTx.id}`,
          dateLabel,
          title: isBuy ? text.txBuy(ticker) : text.txOther,
          detail: isBuy
            ? text.txBuyDetail(sharesFormat.format(Math.abs(latestTx.quantity ?? 0)), formatMoney(Math.abs(latestTx.amount)))
            : formatMoney(Math.abs(latestTx.amount)),
        });
      }
    }

    const latestAsOf = [...latestByIsin.values()]
      .map((q) => q.asOf)
      .sort()
      .pop();
    const planToday = currentDate.toISOString().slice(0, 10);
    const yearReviewYears = yearInReviewYears({
      today: planToday,
      transactions,
      qualityIssues,
    });
    const selectedYearReviewYear = yearReviewYear && yearReviewYears.includes(yearReviewYear)
      ? yearReviewYear
      : yearReviewYears[0] ?? currentDate.getFullYear();
    const planVsReality = buildPlanVsReality({
      startDate: settings.startDate,
      contributionY1: settings.contributionY1,
      contributionY2: settings.contributionY2,
      trackInAppCash: settings.trackInAppCash,
      transactions,
      today: planToday,
      year: selectedYearReviewYear,
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
    const valueHistory = buildValueHistory({
      transactions,
      quotes,
      locale,
      trackInAppCash: settings.trackInAppCash,
    });

    return {
      assetsLabel: snapshot.valueComplete ? text.portfolioLabel : text.valuedAssets,
      assets: formatMoney(hero.assets),
      contributedLabel: formatMoney(lifetime.amount),
      gainLabel,
      gainPctLabel,
      gainPositive: (pnl ?? 0) >= 0,
      priceDateLabel: latestAsOf ? formatDateLabel(latestAsOf, locale) : null,
      stale: snapshot.stalePriceIsins.length > 0,
      fundCount: allocation.length,
      paceLabel: recentPace != null && recentPace > 0
        ? `${formatMoney(recentPace)}/${locale === "de" ? "Mon." : "tháng"}`
        : null,
      daysToNext: briefing.daysToNextContribution,
      milestone: briefing.nextMilestone
        ? {
            targetLabel: formatMoney(briefing.nextMilestone.target),
            progressPct: briefing.nextMilestone.progressPct,
            remainingLabel: formatMoney(briefing.nextMilestone.remaining),
          }
        : null,
      allocation,
      valueHistory,
      updates,
      heartbeat,
      dataHealth,
      yearInReview,
      yearReviewYears,
      onYearReviewYearChange: setYearReviewYear,
    };
  }, [lastBackupAt, locale, yearReviewYear, settings, text, transactions, quotes, priceHistories]);

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
