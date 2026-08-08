import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getSettings,
  listGoals,
  listInstruments,
  listQuotes,
  listTransactions,
} from "../lib/db";
import type { AppSettings, Goal, Instrument, Quote, Transaction } from "../lib/types";
import { VWCE_ISIN } from "../lib/types";
import {
  buildEquitySeries,
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
  type NhipInsight,
} from "../lib/nhipInsights";
import TodayCenter from "../components/TodayCenter";
import TraceSheet from "../components/TraceSheet";

type Insight = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  why: string;
  cta: string;
  to: string;
};

function Sparkline({ points }: { points: { value: number }[] }) {
  if (points.length < 2) {
    return (
      <svg className="sparkline" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden>
        <path d="M0 28 Q30 20 60 24 T120 18" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
    );
  }
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coordinates = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 120;
      const y = 36 - ((value - min) / span) * 28;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden>
      <polygon points={`0,40 ${coordinates} 120,40`} fill="url(#spFade)" />
      <polyline points={coordinates} fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2" strokeLinejoin="round" />
      <defs>
        <linearGradient id="spFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,.25)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Overview({ refreshKey = 0 }: { displayName?: string; refreshKey?: number }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [moreActions, setMoreActions] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);

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
    return () => {
      active = false;
    };
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
  const series = useMemo(
    () => buildEquitySeries(transactions, pricesByIsin[VWCE_ISIN] ?? 0, pricesByIsin),
    [transactions, pricesByIsin],
  );
  // NHIP-UI-001 r1: the engine runs here because this is the only place that
  // holds both the ledger and the effective quote date.
  const nhipInsights = useMemo<NhipInsight[]>(() => {
    if (!settings) return [];
    return buildNhipInsights(
      buildNhipInsightInput(portfolioSnapshot, transactions, settings),
    ).insights;
  }, [portfolioSnapshot, transactions, settings]);

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
  const hero = buildOverviewHero({
    securitiesValue: securitiesKnown,
    cashBalance: portfolio.cashBalance,
    missingPriceCount: market.missingIsins.length,
    totalQuantity,
    costBasis: portfolio.vwceCostBasis,
    positionValue: vwceValue,
    transactionCount: transactions.length,
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
  if (shouldShowContributionNudge({ status: hero.status, hasContributionThisMonth })) {
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
  // DEBT_1: the ratio is taken on the same denominator the hero shows, and the
  // copy always names what it does not include yet.
  const allocation = buildAllocationDisplay(hero);
  const allocationCopy = describeAllocation(allocation);
  // DEBT_2: the cost basis names the ledger entries behind it, and a withheld
  // profit and loss names its reason instead of showing a bare dash.
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
      <section className={`hero-v8 hero-${mode}`}>
        <div className="hero-noise" aria-hidden />
        {mode === "empty" ? (
          <div className="hero-empty-inner">
            <p className="hero-label">Tổng tài sản</p>
            <p className="hero-empty-copy">Bắt đầu bằng giao dịch đầu tiên</p>
            <Link to="/transactions" className="hero-cta">Thêm giao dịch đầu tiên</Link>
          </div>
        ) : (
          <>
            <button type="button" className="hero-trace-trigger" onClick={() => setTraceOpen(true)}>
              <span className="hero-label">{hasMissingPrices ? "Tài sản đã định giá" : "Tổng tài sản"}</span>
              <span className="hero-amount">
                <span className="hero-num">{formatMoney(hero.assets).replace(/\s*€$/, "")}</span>
                <span className="hero-eur">€</span>
              </span>
            </button>
            {hero.setupIncomplete ? (
              <span className="hero-delta">Chưa ghi nạp tiền {formatMoney(hero.cashShortfall)}</span>
            ) : hasMissingPrices ? (
              <span className="hero-delta">+ {market.missingIsins.length} mã thiếu giá</span>
            ) : hero.pnl != null && hero.pnl !== 0 ? (
              <span className="hero-delta">
                {hero.pnl >= 0 ? "↑" : "↓"} {formatMoney(Math.abs(hero.pnl))}{pnlPct ? ` (${pnlPct}%)` : ""}
              </span>
            ) : null}
            <button type="button" className="hero-provenance" onClick={() => setTraceOpen(true)}>
              <span aria-hidden />
              {sourceLabel}{vwceQuote?.asOf ? ` · ${vwceQuote.asOf}` : ""}
            </button>
            <Sparkline points={series} />
            {allocation.showBar ? (
              <>
                <div className="alloc-v8" role="img" aria-label={allocationCopy.ariaLabel}>
                  <div className="alloc-seg-v8 vwce" style={{ flex: Math.max(allocation.securitiesPct, 1) }} />
                  <div className="alloc-seg-v8 cash" style={{ flex: Math.max(allocation.cashPct, 1) }} />
                </div>
                <div className="alloc-legend-v8"><span>{allocationCopy.securitiesLabel}</span><span>{allocationCopy.cashLabel}</span></div>
                {allocationCopy.caveat ? (
                  <p className="alloc-caveat-v8" style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.4, color: "inherit", opacity: 0.85 }}>{allocationCopy.caveat}</p>
                ) : null}
              </>
            ) : (
              <div className="alloc-legend-v8"><span className="neg">{allocationCopy.unavailable}</span></div>
            )}
            {mode === "early" ? <p className="hero-early">Còn {Math.max(0, 3 - transactions.length)} bước để hoàn tất thiết lập</p> : null}
          </>
        )}
      </section>

      {/* OVERVIEW-SIMPLIFY-001: when the ledger is unfunded this is the only
          call to action on the page. Nothing competes with it. */}
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
        <section className="stat-strip" aria-label="Chi tiết phân bổ">
          <div className="stat-col"><span className="stat-label">CK đã định giá</span><span className="stat-val">{formatMoney(securitiesKnown)}</span></div>
          <div className="stat-rule" aria-hidden />
          <div className="stat-col"><span className="stat-label">An toàn</span><span className={`stat-val${cashNegative ? " neg" : ""}`}>{formatMoney(portfolio.cashBalance)}</span></div>
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

      <p className="ov-foot">Không phải tư vấn đầu tư. What-if là ước tính; giao dịch vẫn lấy từ sổ local.</p>

      <TraceSheet
        open={traceOpen}
        onClose={() => setTraceOpen(false)}
        model={portfolioTraceModel}
      />
    </div>
  );
}
