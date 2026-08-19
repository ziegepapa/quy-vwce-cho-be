import { useEffect, useMemo, useState } from "react";
import { getSettings, listQuotes, listTransactions } from "../lib/db";
import { formatMoney } from "../lib/calc";
import { buildOverviewHero } from "../lib/overviewNumbers";
import { buildTodayCenterPortfolioSnapshot } from "../lib/todayCenterAdapter";
import { computeContributionStreak } from "../lib/contributionStreak";
import OverviewFrame from "../components/demo-v10/OverviewFrame";

export default function Overview({ refreshKey = 0 }: { refreshKey?: number }) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
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
    return () => { alive = false; };
  }, [refreshKey]);

  const view = useMemo(() => {
    if (!settings) return null;
    const snapshot = buildTodayCenterPortfolioSnapshot(
      transactions,
      quotes,
      settings.latestVwcePrice ?? 0,
      settings.latestPriceDate ?? "",
    );
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
    const performance = hero.pnlPct == null ? null : `${hero.pnlPct >= 0 ? "+" : ""}${hero.pnlPct.toFixed(1).replace(".", ",")}%`;
    const total = Math.max(1, portfolio.vwceCostBasis + Math.max(0, pnl ?? 0));
    return {
      assetsLabel: snapshot.valueComplete ? "Portfolio VWCE" : "Tài sản đã định giá",
      assets: formatMoney(hero.assets),
      pnl: pnl == null || pnl === 0 ? null : `${pnl > 0 ? "▲ +" : "▼ −"}${formatMoney(Math.abs(pnl))}`,
      pnlPositive: (pnl ?? 0) >= 0,
      ringLabel: "chuỗi góp",
      ringPct: Math.min(100, Math.max(0, streak.streakMonths / 12 * 100)),
      price: vwcePrice > 0 ? `€${vwcePrice.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null,
      priceAsOf: snapshot.vwceAsOf ? `Cập nhật ${snapshot.vwceAsOf.slice(8, 10)}/${snapshot.vwceAsOf.slice(5, 7)}` : null,
      stale: snapshot.stalePriceIsins.length > 0,
      shares: portfolio.vwceQty > 0 ? portfolio.vwceQty.toLocaleString("vi-VN", { maximumFractionDigits: 4 }) : null,
      streakMonths: streak.streakMonths > 0 ? streak.streakMonths : null,
      latestContribution: latest,
      performance,
      contributionWidth: Math.min(100, Math.max(0, portfolio.vwceCostBasis / total * 100)),
    };
  }, [settings, transactions, quotes]);

  if (loading) return <main className="demo-v10-screen" aria-busy="true" />;
  if (failed || !view) return <main className="demo-v10-screen"><section className="demo-v10-gl" style={{ padding: 18 }}>Không tải được Tổng quan.</section></main>;
  return <OverviewFrame {...view} />;
}
