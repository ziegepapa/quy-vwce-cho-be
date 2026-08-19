import { useEffect, useMemo, useState } from "react";
import { getSettings, listQuotes, listTransactions } from "../lib/db";
import { formatMoney } from "../lib/calc";
import { buildOverviewHero } from "../lib/overviewNumbers";
import { buildTodayCenterPortfolioSnapshot } from "../lib/todayCenterAdapter";
import { computeContributionStreak } from "../lib/contributionStreak";
import OverviewFrame from "../components/demo-v10/OverviewFrame";
import { useLocale } from "../lib/locale";

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

export default function Overview({ refreshKey = 0 }: { refreshKey?: number }) {
  const { locale } = useLocale();
  const text = useMemo(() => overviewPageCopy(locale), [locale]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof getSettings>> | null>(null);
  const [transactions, setTransactions] = useState<Awaited<ReturnType<typeof listTransactions>>>([]);
  const [quotes, setQuotes] = useState<Awaited<ReturnType<typeof listQuotes>>>([]);

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
    const latest = streak.mostRecentMonth
      ? `${streak.mostRecentMonth.slice(5, 7)}/${streak.mostRecentMonth.slice(0, 4)}`
      : null;
    const pnl = hero.pnl;
    const performance =
      hero.pnlPct == null
        ? null
        : `${hero.pnlPct >= 0 ? "+" : ""}${hero.pnlPct.toFixed(1).replace(".", ",")}%`;
    const total = Math.max(1, portfolio.vwceCostBasis + Math.max(0, pnl ?? 0));
    return {
      assetsLabel: snapshot.valueComplete ? "Portfolio VWCE" : text.valuedAssets,
      assets: formatMoney(hero.assets),
      pnl: pnl == null || pnl === 0 ? null : `${pnl > 0 ? "▲ +" : "▼ −"}${formatMoney(Math.abs(pnl))}`,
      pnlPositive: (pnl ?? 0) >= 0,
      streakMonths: streak.streakMonths,
      price:
        vwcePrice > 0
          ? `€${vwcePrice.toLocaleString(locale === "de" ? "de-DE" : "vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : null,
      priceAsOf: snapshot.vwceAsOf
        ? `${text.updated} ${snapshot.vwceAsOf.slice(8, 10)}/${snapshot.vwceAsOf.slice(5, 7)}`
        : null,
      stale: snapshot.stalePriceIsins.length > 0,
      shares:
        portfolio.vwceQty > 0
          ? portfolio.vwceQty.toLocaleString("vi-VN", { maximumFractionDigits: 4 })
          : null,
      latestContribution: latest,
      performance,
      contributionWidth: Math.min(100, Math.max(0, (portfolio.vwceCostBasis / total) * 100)),
    };
  }, [locale, settings, text, transactions, quotes]);

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
