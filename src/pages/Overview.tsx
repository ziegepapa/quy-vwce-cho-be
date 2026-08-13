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
  const [detailOpen, setDetailOpen] = useState(false);
  const [moreActions, setMoreActions] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [statStripOpen, setStatStripOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
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
    })();
    return () => { active = false; };
  }, [refreshKey]);

  const portfolioSnapshot = useMemo(
    () => buildTodayCenterPortfolioSnapshot({
      transactions,
      quotes,
      legacyVwcePrice: settings?.latestVwcePrice ?? 0,
    }),
    [transactions, quotes, settings?.latestVwcePrice],
  );
  const {
    portfolio,
    pricesByIsin,
    market,
    totalQuantity,
    vwcePrice,
    vwceQuote,
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

  // ── Plan Phase (Glide Path) ────────────────────────────────────────────
  // Card chỉ hiện khi user đã set planTarget rõ ràng (không fallback endDate)
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
  // ──────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="ov">
        <div className="skeleton" style={{ height: 176, borderRadius: 22 }} />
        <div className="skeleton" style={{ height: 360, borderRadius: 24, marginTop: 16 }} />
      </div>
    );
  }

  const hasMissingPrices = !portfolioSnapshot.valueComplete;
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
    vwceAsOf: vwceQuote?.asOf,
    provenance: portfolioSnapshot.provenance,
  });

  return (
    <div className="ov">
      <section
        className={`overview-money-stage${mode === "empty" ? " overview-money-stage--empty" : ""}`}
        aria-label="Tổng tài sản và nhịp đóng góp"
      >
        {mode !== "empty" ? (
          <div className="rhythm-assets">
            <p className="rhythm-assets-label">
              {hasMissingPrices ? "Tài sản đã định giá" : "Tổng tài sản"}
            </p>
            <button
              type="button"
              className="rhythm-assets-btn"
              onClick={() => setTraceOpen(true)}
            >
              <span className="rhythm-assets-value">
                {formatMoney(hero.assets)}
                {hero.pnl != null && hero.pnl !== 0 ? (
                  <span className={hero.pnl >= 0 ? "pos" : "neg"}>
                    {hero.pnl >= 0 ? "+" : ""}{formatMoney(Math.abs(hero.pnl))}
                    {pnlPct ? ` (${pnlPct}%)` : ""}
                  </span>
                ) : null}
              </span>
            </button>
          </div>
        ) : null}

        <RhythmHero
          streak={streakResult}
          goals={goals}
          totalContributed={portfolio.totalContributed}
          heroLifetimeContribution={heroLifetime.amount}
          nhipWindowTotal={nhipWindowTotal}
          nhipWindowDays={CONTRIBUTION_WINDOW_DAYS}
        />
      </section>

      {cashNegative ? (
        <section className="card">
          <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Sổ đang thiếu bút toán nạp tiền</p>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.45 }}>Đã ghi mua hoặc chi nhiều hơn số tiền nạp {formatMoney(hero.cashShortfall)}, nên số dư an toàn đang âm. Ghi khoản nạp tương ứng để tổng tài sản và lãi–lỗ khớp lại.</p>
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
          vwcePrice={vwcePrice}
          vwcePriceSource={vwcePriceSource}
          settings={settings}
          transactions={transactions}
          insights={nhipInsights}
        />
      ) : null}

      {mode !== "empty" ? (
        <section
          className={`stat-strip${statStripOpen ? "" : " stat-strip-collapsed"}`}
          aria-label="Chi tiết phân bổ"
        >
          <button
            type="button"
            className="stat-detail-btn"
            onClick={() => setStatStripOpen((open) => !open)}
            aria-expanded={statStripOpen}
          >
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
                  {Object.entries(market.byIsin).map(([isin, row]) => (
                    <div key={isin}>
                      <dt>{instrumentName(isin)}<span className="muted" style={{ display: "block", fontSize: 11 }}>{isin}</span></dt>
                      <dd>{row.qty.toFixed(4)} × {row.price != null ? formatMoney(row.price) : <span style={{ color: "var(--warning-600)" }}>Thiếu giá</span>}{row.value != null ? ` = ${formatMoney(row.value)}` : ""}</dd>
                    </div>
                  ))}
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
            <div className="action-body"><p className="action-title">{primary.title}</p><p className="action-why">{primary.why}</p><span className="action-cta">{primary.cta} →</span></div>
          </Link>
          {remainingInsights.length > 0 ? (
            <>
              <button type="button" className="action-more" onClick={() => setMoreActions((open) => !open)}>{moreActions ? "Thu gọn" : `+${remainingInsights.length} việc khác`}</button>
              {moreActions ? remainingInsights.map((insight) => (
                <Link key={insight.id} to={insight.to} className="action-item action-item-sm">
                  <div className={`action-icon pri-${insight.priority}`} aria-hidden>i</div>
                  <div className="action-body"><p className="action-title">{insight.title}</p><span className="action-cta">{insight.cta} →</span></div>
                </Link>
              )) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {showPlanCard && planPhase ? (
        <PlanPhaseCard
          phase={planPhase}
          targetDate={planTargetDate}
          onViewFull={() => navigate("/settings?tab=data")}
          onDismissReminder={
            planPhase.showReminder
              ? () => { void handleDismissGlideReminder(); }
              : undefined
          }
        />
      ) : null}

      <p className="ov-foot">Không phải tư vấn đầu tư. What-if là ước tính; giao dịch vẫn lấy từ sổ local.</p>

      <TraceSheet
        open={traceOpen}
        onClose={() => setTraceOpen(false)}
        model={portfolioTraceModel}
      />
    </div>
  );
}
