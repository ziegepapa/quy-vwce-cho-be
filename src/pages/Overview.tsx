import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getSettings,
  listGoals,
  listInstruments,
  listQuotes,
  listTransactions,
  saveSettings,
} from "../lib/db";
import type { AppSettings, Goal, Instrument, PlanTarget, Quote, Transaction } from "../lib/types";
import {
  formatMoney,
  inflate,
  monthsBetween,
  parseDate,
} from "../lib/calc";
import { buildOverviewHero, shouldShowContributionNudge } from "../lib/overviewNumbers";
import { buildAllocationDisplay, describeAllocation } from "../lib/overviewAllocation";
import {
  buildCostBasisDisplay,
  describeCostBasis,
  describePnlSuppression,
  summarizeCostBasisLedger,
} from "../lib/overviewCostBasis";
import { buildTodayCenterPortfolioSnapshot } from "../lib/todayCenterAdapter";
import { buildPortfolioTraceModel } from "../lib/todayCenterTrace";
import {
  buildNhipInsightInput,
  buildNhipInsights,
  CONTRIBUTION_WINDOW_DAYS,
  type NhipInsight,
} from "../lib/nhipInsights";
import { computeContributionStreak } from "../lib/contributionStreak";
import { computeHeroLifetimeContribution } from "../lib/heroLifetime";
import { getPlanPhase } from "../lib/planPhase";
import TodayCenter from "../components/TodayCenter";
import TraceSheet from "../components/TraceSheet";
import RhythmHero from "../components/RhythmHero";
import PlanPhaseCard from "../components/PlanPhaseCard";
import "../styles/rhythm-hero.css";

type Insight = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  why: string;
  cta: string;
  to: string;
};

export default function Overview({ refreshKey = 0 }: { displayName?: string; refreshKey?: number }) {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [moreActions, setMoreActions] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [statStripOpen, setStatStripOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    void (async () => {
      try {
        const [nextSettings, nextGoals, nextTransactions, nextInstruments, nextQuotes] =
          await Promise.all([
            getSettings(),
            listGoals(),
            listTransactions(),
            listInstruments(),
            listQuotes(),
          ]);
        if (!active) return;
        setSettings(nextSettings);
        setGoals(nextGoals);
        setTransactions(nextTransactions);
        setInstruments(nextInstruments);
        setQuotes(nextQuotes);
        setLoading(false);
      } catch {
        if (!active) return;
        setLoadError(true);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [refreshKey, loadAttempt]);

  const portfolioSnapshot = useMemo(
    () => buildTodayCenterPortfolioSnapshot({
      transactions,
      quotes,
      legacyVwcePrice: settings?.latestVwcePrice ?? 0,
      legacyVwcePriceAsOf: settings?.latestPriceDate ?? "",
    }),
    [transactions, quotes, settings?.latestVwcePrice, settings?.latestPriceDate],
  );
  const {
    portfolio,
    pricesByIsin,
    market,
    totalQuantity,
    vwcePrice,
    vwcePriceSource,
  } = portfolioSnapshot;

  const streakResult = useMemo(
    () => computeContributionStreak(transactions),
    [transactions],
  );

  const nhipWindowTotal = useMemo(() => {
    const cutoffMs = Date.now() - CONTRIBUTION_WINDOW_DAYS * 86_400_000;
    return transactions
      .filter((tx) => {
        if (tx.deletedAt) return false;
        const t = tx.type;
        if (t !== "cash_in" && t !== "buy_vwce" && t !== "buy_security") return false;
        const d = Date.parse(tx.date);
        return Number.isFinite(d) && d >= cutoffMs;
      })
      .reduce((s, tx) => s + (Number.isFinite(tx.amount) ? tx.amount : 0), 0);
  }, [transactions]);

  const heroLifetime = useMemo(
    () =>
      computeHeroLifetimeContribution({
        transactions,
        trackInAppCash: settings?.trackInAppCash === true,
      }),
    [transactions, settings?.trackInAppCash],
  );

  const nhipInsights = useMemo<NhipInsight[]>(() => {
    if (!settings) return [];
    return buildNhipInsights(
      buildNhipInsightInput(portfolioSnapshot, transactions, settings),
    ).insights;
  }, [portfolioSnapshot, transactions, settings]);

  const planPhase = useMemo(() => {
    if (!settings) return null;
    return getPlanPhase(settings.planTarget ?? null);
  }, [settings]);

  const planTargetDate = settings?.planTarget?.targetUseDate ?? "";

  const showPlanCard =
    settings?.planTarget != null &&
    planPhase != null &&
    (planPhase.showReminder || planPhase.yearsLeft <= 6);

  const handleDismissGlideReminder = useCallback(async () => {
    if (!settings || !settings.planTarget) return;
    const updated: PlanTarget = {
      ...settings.planTarget,
      lastGlideReminderYear: new Date().getFullYear(),
    };
    await saveSettings({ planTarget: updated });
    setSettings((prev) => (prev ? { ...prev, planTarget: updated } : prev));
  }, [settings]);

  if (loading) {
    return (
      <div className="ov" role="status" aria-live="polite" aria-busy="true">
        <p className="sr-only">Đang tải dữ liệu Tổng quan…</p>
        <div className="skeleton" style={{ height: 176, borderRadius: 22 }} />
        <div className="skeleton" style={{ height: 360, borderRadius: 24, marginTop: 16 }} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="ov">
        <section className="empty card" role="alert">
          <h1 className="page-title">Không tải được Tổng quan</h1>
          <p>Dữ liệu trên thiết bị vẫn được giữ nguyên. Hãy thử tải lại.</p>
          <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
            Thử lại
          </button>
        </section>
      </div>
    );
  }

  const hasMissingPrices = !portfolioSnapshot.valueComplete;
  const hasStalePrices = portfolioSnapshot.stalePriceIsins.length > 0;
  const securitiesKnown = market.securities;
  const cash = market.cash;
  const totalKnown = portfolioSnapshot.totalValue;
  const vwceValue = vwcePrice > 0 ? portfolio.vwceQty * vwcePrice : null;
  const trackInAppCash = settings?.trackInAppCash === true;
  const hero = buildOverviewHero({
    securitiesValue: securitiesKnown,
    cashBalance: portfolio.cashBalance,
    missingPriceCount: market.missingIsins.length,
    totalQuantity,
    costBasis: portfolio.vwceCostBasis,
    positionValue: vwceValue,
    transactionCount: transactions.length,
    trackInAppCash,
  });
  const today = new Date();
  const yearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const hasContributionThisMonth = transactions.some(
    (transaction) => transaction.type === "cash_in" && transaction.date.startsWith(yearMonth),
  );
  const mode: "empty" | "early" | "active" =
    hero.status === "empty"
      ? "empty"
      : transactions.length < 3
        ? "early"
        : "active";

  const insights: Insight[] = [];
  if (trackInAppCash && shouldShowContributionNudge({ status: hero.status, hasContributionThisMonth })) {
    insights.push({
      id: "contribution",
      priority: "high",
      title: "Chưa ghi nhận đóng góp tháng này",
      why: "Nhịp đóng góp đều giúp giữ đúng kế hoạch dài hạn.",
      cta: "Ghi nhận",
      to: "/transactions",
    });
  }
  if (hasMissingPrices) {
    insights.push({
      id: "price-missing",
      priority: "high",
      title: `Thiếu giá cho ${market.missingIsins.length} mã`,
      why: "Tổng tài sản chưa đầy đủ cho đến khi có giá từng ISIN.",
      cta: "Cập nhật",
      to: "/settings?tab=prices",
    });
  } else if (hasStalePrices) {
    insights.push({
      id: "price-stale",
      priority: "high",
      title: `Giá cũ cho ${portfolioSnapshot.stalePriceIsins.length} mã`,
      why: "Tổng tài sản đang là ước tính; Pulse giữ nguyên mốc tin cậy gần nhất.",
      cta: "Làm mới giá",
      to: "/settings?tab=prices",
    });
  } else if (!vwcePrice && mode !== "empty" && portfolio.vwceQty > 0) {
    insights.push({
      id: "price",
      priority: "high",
      title: "Chưa cập nhật giá VWCE",
      why: "Số liệu tài sản có thể lệch thực tế.",
      cta: "Cập nhật",
      to: "/settings?tab=prices",
    });
  }
  for (const goal of goals) {
    if (goal.amount <= 0) continue;
    const due = parseDate(goal.dueDate);
    const months = monthsBetween(today, due);
    const years = Math.max(0, due.getFullYear() - goal.baseYear);
    const adjusted = goal.mode === "purchasing_power"
      ? inflate(goal.amount, goal.inflationRate, years)
      : goal.amount;
    if (months <= 36 && months > 0 && goal.protectedAmount < adjusted * 0.5) {
      insights.push({
        id: `goal-${goal.id}`,
        priority: "high",
        title: `${goal.name}: chậm tiến độ`,
        why: `Còn ${months} tháng · đã bảo vệ ${Math.round((goal.protectedAmount / (adjusted || 1)) * 100)}%.`,
        cta: "Xem",
        to: "/goals",
      });
    }
  }

  const cashNegative = hero.setupIncomplete;
  const allocation = buildAllocationDisplay(hero);
  const allocationCopy = describeAllocation(allocation);
  const costBasis = buildCostBasisDisplay({
    costBasis: portfolio.vwceCostBasis,
    quantity: portfolio.vwceQty,
    provenance: summarizeCostBasisLedger(transactions),
  });
  const costBasisCopy = describeCostBasis(costBasis);
  const pnlSuppression = describePnlSuppression(hero.pnlSuppressedReason, {
    missingPriceCount: market.missingIsins.length,
  });
  const pnlPct = hero.pnlPct != null ? hero.pnlPct.toFixed(1) : null;

  const assetsLabel = hasMissingPrices
    ? "Tài sản đã định giá"
    : hasStalePrices
      ? "Tài sản ước tính · có giá cũ"
      : "Tổng tài sản";
  const pnlValue = hero.pnl;
  const showPnlPct = pnlPct != null && portfolioSnapshot.valueComplete;
  const heroPnlNote =
    hero.pnl == null ? describePnlSuppression(hero.pnlSuppressedReason) : null;

  let nearestGoal: Goal | null = null;
  let nearestMonths = Infinity;
  let nearestTarget = 0;
  let nearestGap = 0;
  for (const goal of goals) {
    const due = parseDate(goal.dueDate);
    const months = monthsBetween(today, due);
    if (months >= 0 && months < nearestMonths) {
      nearestMonths = months;
      nearestGoal = goal;
      const years = Math.max(0, due.getFullYear() - goal.baseYear);
      nearestTarget = goal.mode === "purchasing_power"
        ? inflate(goal.amount, goal.inflationRate, years)
        : goal.amount;
      nearestGap = Math.max(0, nearestTarget - goal.protectedAmount);
    }
  }

  const primary = insights[0];
  const remainingInsights = insights.slice(1);
  const instrumentName = (isin: string) => {
    const instrument = instruments.find((candidate) => candidate.isin === isin);
    return instrument?.ticker || instrument?.name || isin;
  };
  const sourceLabel = vwcePriceSource === "manual_quote"
    ? "Tay đang thắng"
    : vwcePriceSource === "auto_quote"
      ? "Auto"
      : vwcePriceSource === "legacy_quote"
        ? "Giá tương thích cũ"
        : "Chưa có giá";
  void sourceLabel;
  void allocationCopy;
  void nearestTarget;
  void pricesByIsin;
  const portfolioTraceModel = buildPortfolioTraceModel({
    totalValue: hero.assets,
    securities: securitiesKnown,
    cash,
    cashNegative,
    cashShortfall: hero.cashShortfall,
    valueComplete: portfolioSnapshot.valueComplete,
    missingIsins: market.missingIsins,
    vwcePrice,
    vwceAsOf: portfolioSnapshot.vwceAsOf ?? undefined,
    provenance: portfolioSnapshot.provenance,
  });

  return (
    <div className="ov v10-pixel">
      <section
        className={`v10-gl v10-hero${mode === "empty" ? " v10-hero--empty" : ""}`}
        aria-label="Tổng tài sản và nhịp đóng góp"
      >
        {mode !== "empty" ? (
          <div className="v10-hero-flex">
            <div className="v10-hero-left">
              <p className="v10-h-eye">{assetsLabel}</p>
              <button type="button" className="v10-h-num-btn" onClick={() => setTraceOpen(true)}>
                <span className="v10-h-num">{formatMoney(hero.assets)}</span>
              </button>
              {pnlValue != null && pnlValue !== 0 ? (
                <div className="v10-h-row">
                  <span className={`v10-bdg ${pnlValue >= 0 ? "v10-bdg-up" : "v10-bdg-down"}`}>
                    {pnlValue >= 0 ? "▲" : "▼"}{" "}
                    {pnlValue >= 0 ? "+" : "−"}
                    {formatMoney(Math.abs(pnlValue))}
                    {showPnlPct ? ` (${pnlPct}%)` : ""}
                  </span>
                </div>
              ) : null}
              {heroPnlNote ? <p className="v10-h-note">{heroPnlNote}</p> : null}
            </div>
            <div className="v10-hero-ring">
              <RhythmHero
                variant="ringOnly"
                streak={streakResult}
                goals={goals}
                totalContributed={portfolio.totalContributed}
                heroLifetimeContribution={heroLifetime.amount}
                nhipWindowTotal={nhipWindowTotal}
                nhipWindowDays={CONTRIBUTION_WINDOW_DAYS}
              />
              {streakResult.streakMonths > 0 ? <div className="v10-hr-cap">chuỗi góp</div> : null}
            </div>
          </div>
        ) : null}
      </section>

      {mode !== "empty" && vwcePrice > 0 ? (
        <section className="v10-gl v10-price" aria-label="Giá VWCE">
          <div className={`v10-price-row${hasStalePrices ? " stale" : ""}`}>
            <div className="v10-pr-left">
              <div className="v10-pr-label">GIÁ VWCE</div>
              <div className="v10-pr-num">
                <span className="v10-pr-cur">€</span>
                <span className={`v10-pr-big${hasStalePrices ? " dim" : ""}`}>
                  {vwcePrice.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="v10-pr-ts">
                {portfolioSnapshot.vwceAsOf
                  ? `Cập nhật ${portfolioSnapshot.vwceAsOf.slice(8, 10)}/${portfolioSnapshot.vwceAsOf.slice(5, 7)}`
                  : "Chưa có ngày phiên"}
              </div>
            </div>
            <div className="v10-pr-right">
              {hasStalePrices ? (
                <span className="v10-pr-pill old"><span className="v10-da" aria-hidden /> GIÁ CŨ</span>
              ) : (
                <span className="v10-pr-pill live"><span className="v10-dl" aria-hidden /> LIVE</span>
              )}
            </div>
          </div>
          {hasStalePrices ? (
            <div className="v10-stale-bar">
              <div className="v10-sb-txt">
                <strong>Dữ liệu có thể lỗi thời</strong>
                Giá đang dùng đã quá hạn tin cậy.
              </div>
              <Link to="/settings?tab=prices" className="v10-sb-btn">Cập nhật →</Link>
            </div>
          ) : null}
        </section>
      ) : null}

      {mode !== "empty" && portfolio.vwceQty > 0 ? (
        <section className="v10-gl v10-combo" aria-label="Cổ phần">
          <div className="v10-cr-item">
            <div className="v10-cr-lbl">Cổ phần</div>
            <div className="v10-cr-val v10-cr-em">
              {portfolio.vwceQty.toLocaleString("vi-VN", { maximumFractionDigits: 4 })}
            </div>
          </div>
        </section>
      ) : null}

      {mode !== "empty" && (streakResult.streakMonths > 0 || streakResult.lastContributionDate) ? (
        <section className="v10-gl v10-streak" aria-label="Chuỗi Sparplan">
          <div className="v10-sc-top">
            <div className="v10-sc-left">
              <span className="v10-sc-flame" aria-hidden>🔥</span>
              <div>
                <div className="v10-sc-count-row">
                  <span className="v10-sc-count">{streakResult.streakMonths}</span>
                  <span className="v10-sc-unit">tháng liên tiếp</span>
                </div>
                <div className="v10-sc-title">Chuỗi góp</div>
              </div>
            </div>
            {streakResult.mostRecentMonth ? (
              <div className="v10-sc-right">
                <div className="v10-sc-next-lbl">Gần nhất</div>
                <div className="v10-sc-next-date">
                  {streakResult.mostRecentMonth.slice(5, 7)}/{streakResult.mostRecentMonth.slice(0, 4)}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {mode !== "empty" && hero.pnl != null && portfolio.vwceCostBasis > 0 && portfolioSnapshot.valueComplete ? (
        <section className="v10-gl v10-perf" aria-label="Hiệu suất danh mục">
          <div className="v10-perf-top">
            <span className="v10-perf-title">Hiệu suất danh mục</span>
            <span className="v10-perf-return">
              {hero.pnlPct != null
                ? `${hero.pnlPct >= 0 ? "+" : ""}${hero.pnlPct.toFixed(1)}%`
                : formatMoney(hero.pnl)}
            </span>
          </div>
          {(() => {
            const cost = portfolio.vwceCostBasis;
            const val = cost + (hero.pnl ?? 0);
            const total = Math.max(cost, val, 1);
            const basePct = Math.min(100, (cost / total) * 100);
            const gainPct = Math.max(0, 100 - basePct);
            return (
              <>
                <div className="v10-perf-bar-track">
                  <div className="v10-perf-bar-base" style={{ width: `${basePct}%` }} />
                  {gainPct > 0.5 ? (
                    <div className="v10-perf-bar-gain" style={{ left: `${basePct}%`, width: `${gainPct}%` }} />
                  ) : null}
                </div>
                <div className="v10-perf-legend">
                  <div className="v10-pl-item"><div className="v10-pl-dot base" /><span className="v10-pl-txt">Vốn góp</span></div>
                  <div className="v10-pl-item"><div className="v10-pl-dot gain" /><span className="v10-pl-txt">Lãi</span></div>
                </div>
              </>
            );
          })()}
        </section>
      ) : null}

      {cashNegative ? (
        <section className="card">
          <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Sổ đang thiếu bút toán nạp tiền</p>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.45 }}>
            Đã ghi mua hoặc chi nhiều hơn số tiền nạp {formatMoney(hero.cashShortfall)}, nên số dư an toàn đang âm. Ghi khoản nạp tương ứng để tổng tài sản và lãi–lỗ khớp lại.
          </p>
          <Link to="/transactions" className="action-item" style={{ minHeight: 44 }}>Ghi nạp tiền</Link>
        </section>
      ) : null}

      {nearestGoal && !cashNegative ? (
        <Link to="/goals" className="pulse-goal-line">
          <span className="pulse-goal-label">Mốc kế tiếp</span>
          <strong>{nearestGoal.name}</strong>
          <span className="pulse-goal-meta">Còn {formatMoney(nearestGap)} · {nearestMonths} tháng</span>
          <span aria-hidden>›</span>
        </Link>
      ) : null}

      {settings ? (
        <TodayCenter
          totalValue={totalKnown}
          totalQuantity={totalQuantity}
          valueComplete={portfolioSnapshot.valueComplete}
          pulseEligible={portfolioSnapshot.pulseEligible}
          stalePriceIsins={portfolioSnapshot.stalePriceIsins}
          vwcePrice={vwcePrice}
          vwcePriceSource={vwcePriceSource}
          settings={settings}
          transactions={transactions}
          insights={nhipInsights}
        />
      ) : null}

      {mode !== "empty" ? (
        <section className={`stat-strip${statStripOpen ? "" : " stat-strip-collapsed"}`} aria-label="Chi tiết phân bổ">
          <button type="button" className="stat-detail-btn" onClick={() => setStatStripOpen((open) => !open)} aria-expanded={statStripOpen}>
            Số liệu {statStripOpen ? "▴" : "▾"}
          </button>
          {statStripOpen ? (
            <>
              <div className="stat-col"><span className="stat-label">CK đã định giá</span><span className="stat-val">{formatMoney(securitiesKnown)}</span></div>
              <div className="stat-rule" aria-hidden />
              <div className="stat-col">
                <span className="stat-label">An toàn</span>
                {trackInAppCash ? (
                  <span className={`stat-val${cashNegative ? " neg" : ""}`}>{formatMoney(portfolio.cashBalance)}</span>
                ) : (
                  <>
                    <span className="stat-val">—</span>
                    <span className="stat-label" style={{ fontSize: 11, opacity: 0.85 }}>Không theo dõi ví trong app</span>
                  </>
                )}
              </div>
              <div className="stat-rule" aria-hidden />
              <div className="stat-col">
                <span className="stat-label">Lãi–lỗ VWCE</span>
                <span className={`stat-val ${hero.pnl == null ? "" : hero.pnl >= 0 ? "pos" : "neg"}`}>{hero.pnl != null ? formatMoney(hero.pnl) : "—"}</span>
                {hero.pnl == null && pnlSuppression ? (
                  <span className="stat-label" style={{ fontSize: 11, opacity: 0.85 }}>{pnlSuppression}</span>
                ) : null}
              </div>
              <button type="button" className="stat-detail-btn" onClick={() => setDetailOpen((open) => !open)} aria-expanded={detailOpen}>
                Chi tiết {detailOpen ? "▴" : "▾"}
              </button>
              {detailOpen ? (
                <dl className="stat-detail-list">
                  {Object.entries(market.byIsin).map(([isin, row]) => {
                    const priceStatus = portfolioSnapshot.priceStatusByIsin[isin];
                    return (
                      <div key={isin}>
                        <dt>{instrumentName(isin)}<span className="muted" style={{ display: "block", fontSize: 11 }}>{isin}</span></dt>
                        <dd>
                          {row.qty.toFixed(4)} × {row.price != null ? formatMoney(row.price) : <span style={{ color: "var(--warning-600)" }}>Thiếu giá</span>}
                          {priceStatus === "stale" ? <span style={{ color: "var(--warning-600)" }}> · Giá cũ</span> : null}
                          {priceStatus === "manual" ? <span className="muted"> · Giá thủ công</span> : null}
                          {row.value != null ? ` = ${formatMoney(row.value)}` : ""}
                        </dd>
                      </div>
                    );
                  })}
                  <div>
                    <dt>Giá vốn TB VWCE{costBasisCopy.provenance ? <span className="muted" style={{ display: "block", fontSize: 11 }}>{costBasisCopy.provenance}</span> : null}</dt>
                    <dd>{costBasis.avgCost != null ? formatMoney(costBasis.avgCost) : <span className="muted">{costBasisCopy.value}</span>}</dd>
                  </div>
                  <div><dt>Vốn đã đóng</dt><dd>{formatMoney(portfolio.totalContributed)}</dd></div>
                  <div><dt>Đã rút</dt><dd>{formatMoney(portfolio.totalWithdrawn)}</dd></div>
                  <div><dt>Phí + thuế</dt><dd>{formatMoney(portfolio.totalFees + portfolio.totalTax)}</dd></div>
                </dl>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {primary && !cashNegative ? (
        <section className="action-stack">
          <Link to={primary.to} className="action-item">
            <div className={`action-icon pri-${primary.priority}`} aria-hidden>!</div>
            <div className="action-body">
              <p className="action-title">{primary.title}</p>
              <p className="action-why">{primary.why}</p>
              <span className="action-cta">{primary.cta} →</span>
            </div>
          </Link>
          {remainingInsights.length > 0 ? (
            <>
              <button type="button" className="action-more" onClick={() => setMoreActions((open) => !open)}>
                {moreActions ? "Thu gọn" : `+${remainingInsights.length} việc khác`}
              </button>
              {moreActions
                ? remainingInsights.map((insight) => (
                    <Link key={insight.id} to={insight.to} className="action-item action-item-sm">
                      <div className={`action-icon pri-${insight.priority}`} aria-hidden>i</div>
                      <div className="action-body">
                        <p className="action-title">{insight.title}</p>
                        <span className="action-cta">{insight.cta} →</span>
                      </div>
                    </Link>
                  ))
                : null}
            </>
          ) : null}
        </section>
      ) : null}

      {showPlanCard && planPhase ? (
        <PlanPhaseCard
          phase={planPhase}
          targetDate={planTargetDate}
          onViewFull={() => navigate("/settings?tab=data")}
          onDismissReminder={planPhase.showReminder ? () => { void handleDismissGlideReminder(); } : undefined}
        />
      ) : null}

      <p className="ov-foot">Không phải tư vấn đầu tư. What-if là ước tính; giao dịch vẫn lấy từ sổ local.</p>

      <TraceSheet open={traceOpen} onClose={() => setTraceOpen(false)} model={portfolioTraceModel} />
    </div>
  );
}
