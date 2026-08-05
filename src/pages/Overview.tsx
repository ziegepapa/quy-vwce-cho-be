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
  applyTransaction,
  avgCost,
  buildEquitySeries,
  emptyPortfolio,
  formatMoney,
  inflate,
  monthsBetween,
  parseDate,
  portfolioMarketValue,
} from "../lib/calc";
import TodayCenter from "../components/TodayCenter";

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

function MiniRing({ pct }: { pct: number }) {
  const shown = pct <= 0 ? 3 : Math.min(100, pct);
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg className="mini-ring" width="44" height="44" viewBox="0 0 44 44" aria-hidden>
      <circle cx="22" cy="22" r={radius} fill="none" stroke="rgba(16,24,40,.08)" strokeWidth="4" />
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke="var(--primary-600)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference - (shown / 100) * circumference}
        transform="rotate(-90 22 22)"
      />
      <text x="22" y="25" textAnchor="middle" className="mini-ring-pct">{Math.round(pct)}%</text>
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

  const portfolio = useMemo(() => {
    let state = emptyPortfolio();
    for (const transaction of [...transactions].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      state = applyTransaction(state, transaction);
    }
    return state;
  }, [transactions]);

  const pricesByIsin = useMemo(() => {
    const map: Record<string, number | undefined> = {};
    for (const quote of quotes) {
      if (quote.currency === "EUR" && quote.price > 0) map[quote.instrumentIsin] = quote.price;
    }
    const legacy = settings?.latestVwcePrice ?? 0;
    if (legacy > 0 && map[VWCE_ISIN] == null) map[VWCE_ISIN] = legacy;
    return map;
  }, [quotes, settings?.latestVwcePrice]);

  const market = useMemo(
    () => portfolioMarketValue(portfolio, pricesByIsin),
    [portfolio, pricesByIsin],
  );
  const series = useMemo(
    () => buildEquitySeries(transactions, pricesByIsin[VWCE_ISIN] ?? 0, pricesByIsin as Record<string, number>),
    [transactions, pricesByIsin],
  );

  if (loading) {
    return (
      <div className="ov">
        <div className="skeleton" style={{ height: 176, borderRadius: 18 }} />
        <div className="skeleton" style={{ height: 260, borderRadius: 20, marginTop: 20 }} />
      </div>
    );
  }

  const hasMissingPrices = market.missingIsins.length > 0;
  const securitiesKnown = market.securities;
  const cash = market.cash;
  const totalKnown = securitiesKnown + cash;
  const totalQuantity = Object.values(market.byIsin).reduce(
    (sum, row) => sum + Math.max(0, row.qty),
    0,
  );
  const vwcePrice = pricesByIsin[VWCE_ISIN] ?? 0;
  const vwceValue = vwcePrice > 0 ? portfolio.vwceQty * vwcePrice : null;
  const pnl = vwceValue != null && portfolio.vwceCostBasis > 0 ? vwceValue - portfolio.vwceCostBasis : 0;
  const today = new Date();
  const yearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const hasContributionThisMonth = transactions.some(
    (transaction) => transaction.type === "cash_in" && transaction.date.startsWith(yearMonth),
  );
  const mode: "empty" | "early" | "active" =
    transactions.length === 0 && totalKnown === 0 && !hasMissingPrices
      ? "empty"
      : transactions.length < 3
        ? "early"
        : "active";

  const insights: Insight[] = [];
  if (!hasContributionThisMonth && mode !== "empty") {
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
    const adjusted =
      goal.mode === "purchasing_power"
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

  const cashNegative = portfolio.cashBalance < 0;
  const ratio =
    totalKnown > 0 && securitiesKnown >= 0
      ? Math.min(100, Math.max(0, Math.round((securitiesKnown / totalKnown) * 100)))
      : 0;
  const pnlPct =
    portfolio.vwceCostBasis > 0 && vwceValue != null
      ? ((pnl / portfolio.vwceCostBasis) * 100).toFixed(1)
      : null;

  let nearestGoal: Goal | null = null;
  let nearestMonths = Infinity;
  let nearestPct = 0;
  let nearestPerMonth = 0;
  for (const goal of goals) {
    const due = parseDate(goal.dueDate);
    const months = monthsBetween(today, due);
    if (months >= 0 && months < nearestMonths) {
      nearestMonths = months;
      nearestGoal = goal;
      const years = Math.max(0, due.getFullYear() - goal.baseYear);
      const adjusted =
        goal.mode === "purchasing_power"
          ? inflate(goal.amount, goal.inflationRate, years)
          : goal.amount;
      nearestPct = adjusted > 0 ? Math.min(100, (goal.protectedAmount / adjusted) * 100) : 0;
      nearestPerMonth = months > 0 ? Math.max(0, adjusted - goal.protectedAmount) / months : 0;
    }
  }

  const primary = insights[0];
  const remainingInsights = insights.slice(1);
  const instrumentName = (isin: string) => {
    const instrument = instruments.find((candidate) => candidate.isin === isin);
    return instrument?.ticker || instrument?.name || isin;
  };

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
            <p className="hero-label">{hasMissingPrices ? "Tài sản đã định giá" : "Tổng tài sản"}</p>
            <p className="hero-amount">
              <span className="hero-num">{formatMoney(totalKnown).replace(/\s*€$/, "")}</span>
              <span className="hero-eur">€</span>
            </p>
            {hasMissingPrices ? (
              <span className="hero-delta">+ {market.missingIsins.length} mã thiếu giá</span>
            ) : pnl !== 0 && vwceValue != null ? (
              <span className="hero-delta">
                {pnl >= 0 ? "↑" : "↓"} {formatMoney(Math.abs(pnl))}{pnlPct ? ` (${pnlPct}%)` : ""}
              </span>
            ) : null}
            <Sparkline points={series} />
            {cashNegative ? (
              <div className="alloc-legend-v8"><span className="neg">Tỉ lệ chưa tính được — số dư âm</span></div>
            ) : (
              <>
                <div className="alloc-v8" role="img" aria-label={`Chứng khoán ${ratio}%, an toàn ${100 - ratio}%`}>
                  <div className="alloc-seg-v8 vwce" style={{ flex: Math.max(ratio, 1) }} />
                  <div className="alloc-seg-v8 cash" style={{ flex: Math.max(100 - ratio, 1) }} />
                </div>
                <div className="alloc-legend-v8"><span>Chứng khoán {ratio}%</span><span>An toàn {100 - ratio}%</span></div>
              </>
            )}
            {mode === "early" ? <p className="hero-early">Còn {Math.max(0, 3 - transactions.length)} bước để hoàn tất thiết lập · · ·</p> : null}
          </>
        )}
      </section>

      {mode !== "empty" ? (
        <section className="stat-strip">
          <div className="stat-col"><span className="stat-label">CK đã định giá</span><span className="stat-val">{formatMoney(securitiesKnown)}</span></div>
          <div className="stat-rule" aria-hidden />
          <div className="stat-col"><span className="stat-label">An toàn</span><span className={`stat-val${cashNegative ? " neg" : ""}`}>{formatMoney(portfolio.cashBalance)}</span></div>
          <div className="stat-rule" aria-hidden />
          <div className="stat-col"><span className="stat-label">Lãi–lỗ VWCE</span><span className={`stat-val ${pnl >= 0 ? "pos" : "neg"}`}>{vwceValue != null ? formatMoney(pnl) : "—"}</span></div>
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
              <div><dt>Giá vốn TB VWCE</dt><dd>{formatMoney(avgCost(portfolio))}</dd></div>
              <div><dt>Vốn đã đóng</dt><dd>{formatMoney(portfolio.totalContributed)}</dd></div>
              <div><dt>Đã rút</dt><dd>{formatMoney(portfolio.totalWithdrawn)}</dd></div>
              <div><dt>Phí + thuế</dt><dd>{formatMoney(portfolio.totalFees + portfolio.totalTax)}</dd></div>
            </dl>
          ) : null}
        </section>
      ) : null}

      {settings ? (
        <TodayCenter
          totalValue={totalKnown}
          totalQuantity={totalQuantity}
          valueComplete={!hasMissingPrices}
          vwcePrice={vwcePrice}
          settings={settings}
          transactions={transactions}
        />
      ) : null}

      {cashNegative ? (
        <section className="card">
          <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Số dư an toàn đang âm</p>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.45 }}>Có giao dịch mua hoặc chi nhiều hơn số tiền đã nạp. Hãy kiểm tra giao dịch nạp tiền.</p>
          <Link to="/transactions" className="action-item" style={{ minHeight: 44 }}>Xem giao dịch</Link>
        </section>
      ) : null}

      {primary ? (
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

      {nearestGoal ? (
        <section className="next-goal">
          <Link to="/goals" className="next-goal-row">
            <MiniRing pct={nearestPct} />
            <div className="next-goal-body"><p className="next-goal-name">{nearestGoal.name}</p><p className="next-goal-meta">Còn {nearestMonths} tháng{nearestPerMonth > 0 ? ` · cần thêm ${formatMoney(nearestPerMonth)}/tháng` : ""}</p></div>
            <span className="next-goal-chev" aria-hidden>›</span>
          </Link>
          {goals.length > 1 ? <Link to="/goals" className="next-goal-all">Xem cả {goals.length} mục tiêu →</Link> : null}
        </section>
      ) : null}

      <p className="ov-foot">Không phải tư vấn đầu tư. What-if là ước tính, dữ liệu giao dịch vẫn lấy từ sổ local.</p>
    </div>
  );
}
