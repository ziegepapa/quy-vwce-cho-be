import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { formatMoney, computeGain } from "../lib/calc";
import { useLiveQuery } from "dexie-react-hooks";
import { db, readMeta } from "../lib/db";
import { computeProgress } from "../lib/plan";
import type { Settings, Transaction, Quote, Goal } from "../lib/types";
import { useAuth } from "../auth/useAuth";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { CashNegativeWarning } from "../components/CashNegativeWarning";
import { TransactionsImportBanner } from "../components/TransactionsImportBanner";
import { normalizeTxType } from "../lib/txType";
import { TodayCenter } from "../components/TodayCenter";
import { TraceSheet } from "../components/TraceSheet";
import { buildTodayCenterPortfolioSnapshot } from "../lib/todayCenterAdapter";
import { buildPortfolioTraceModel } from "../lib/todayCenterTrace";

const EURO = "EUR";

function monthsBetween(start: string, now: Date): number {
  const s = new Date(start);
  const years = now.getUTCFullYear() - s.getUTCFullYear();
  const months = now.getUTCMonth() - s.getUTCMonth();
  return Math.max(0, years * 12 + months);
}

function lastMonthsLabels(count: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({
      key: date.toISOString().slice(0, 7),
      label: `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`,
    });
  }
  return out;
}

function buildCashflowSeries(transactions: Transaction[], months: { key: string }[]): number[] {
  const byMonth = new Map<string, number>();
  for (const tx of transactions) {
    const key = tx.date.slice(0, 7);
    const normalizedType = normalizeTxType(tx.type);
    const direction = normalizedType === "withdrawal" ? -1 : normalizedType === "deposit" ? 1 : 0;
    byMonth.set(key, (byMonth.get(key) ?? 0) + direction * tx.amount);
  }
  let running = 0;
  return months.map(({ key }) => {
    running += byMonth.get(key) ?? 0;
    return running;
  });
}

function sparklinePoints(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function Overview() {
  const { session } = useAuth();
  const location = useLocation();
  const ownerId = session?.user.id ?? "";

  const transactions = useLiveQuery(
    async () => (ownerId ? db.transactions.where("ownerId").equals(ownerId).toArray() : []),
    [ownerId],
  );
  const settings = useLiveQuery(
    async () => (ownerId ? db.settings.where("ownerId").equals(ownerId).first() : undefined),
    [ownerId],
  );
  const quotes = useLiveQuery(
    async () => (ownerId ? db.quotes.where("ownerId").equals(ownerId).toArray() : []),
    [ownerId],
  );
  const goals = useLiveQuery(
    async () => (ownerId ? db.goals.where("ownerId").equals(ownerId).toArray() : []),
    [ownerId],
  );

  const [refreshing, setRefreshing] = useState(false);
  const [showAllocation, setShowAllocation] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [flashChange, setFlashChange] = useState(false);

  useEffect(() => {
    const state = location.state as { changeFocus?: boolean } | null;
    if (!state?.changeFocus) return;
    setFlashChange(true);
    window.setTimeout(() => setFlashChange(false), 1800);
    window.history.replaceState({}, document.title);
  }, [location.state]);

  const activeTx = useMemo(
    () => (transactions ?? []).filter((tx: Transaction) => !tx.deletedAt),
    [transactions],
  );
  const portfolioSnapshot = useMemo(() => buildTodayCenterPortfolioSnapshot({
    transactions: (transactions ?? []) as Transaction[],
    quotes: (quotes ?? []) as Quote[],
    legacyVwcePrice: settings?.latestVwcePrice,
  }), [transactions, quotes, settings?.latestVwcePrice]);

  if (transactions === undefined || settings === undefined || quotes === undefined || goals === undefined) {
    return <LoadingState message="Đang tải tổng quan..." />;
  }

  const activeSettings = settings as Settings | undefined;
  const activeGoals = (goals ?? []).filter((goal: Goal) => !goal.deletedAt);
  const marketValue = portfolioSnapshot.totalValue;
  const breakdown = portfolioSnapshot.market;
  const invested = activeTx.reduce((sum: number, tx: Transaction) => {
    const normalizedType = normalizeTxType(tx.type);
    if (normalizedType === "deposit") return sum + tx.amount;
    if (normalizedType === "withdrawal") return sum - tx.amount;
    return sum;
  }, 0);
  const gain = computeGain(marketValue, invested);
  const monthsElapsed = activeSettings?.planStartDate ? monthsBetween(activeSettings.planStartDate, new Date()) : 0;
  const plannedContributions = activeSettings ? activeSettings.monthlyContribution * monthsElapsed : 0;
  const progress = activeSettings ? computeProgress(marketValue, {
    startDate: activeSettings.planStartDate,
    endDate: activeSettings.planEndDate,
    baseMonthlyContribution: activeSettings.monthlyContribution,
    annualIncreasePct: activeSettings.annualIncreasePct,
    assumedReturnPct: activeSettings.assumedReturnPct,
  }) : null;

  const netCashflow = activeTx.reduce((sum: number, tx: Transaction) => {
    const normalizedType = normalizeTxType(tx.type);
    if (normalizedType === "deposit") return sum + tx.amount;
    if (normalizedType === "withdrawal") return sum - tx.amount;
    return sum;
  }, 0);
  const txThisMonth = activeTx.filter((tx: Transaction) => tx.date.slice(0, 7) === new Date().toISOString().slice(0, 7)).length;
  const months = lastMonthsLabels(6);
  const series = buildCashflowSeries(activeTx, months);
  const spark = sparklinePoints(series, 320, 72);
  const ownerLabel = session?.user.email ?? "Local device";
  const assetTotal = Math.max(0, breakdown.securities) + Math.max(0, breakdown.cash);
  const securityPct = assetTotal > 0 ? (Math.max(0, breakdown.securities) / assetTotal) * 100 : 0;
  const cashPct = assetTotal > 0 ? (Math.max(0, breakdown.cash) / assetTotal) * 100 : 0;
  const allocationStyle = {
    background: assetTotal > 0
      ? `conic-gradient(var(--accent) 0 ${securityPct}%, rgba(22, 163, 74, 0.72) ${securityPct}% ${securityPct + cashPct}%, var(--border) ${securityPct + cashPct}% 100%)`
      : "var(--surface-2)",
  };
  const portfolioEmpty = portfolioSnapshot.totalQuantity <= 0 && marketValue <= 0;

  const primaryGoal = activeGoals[0];
  const goalPct = primaryGoal ? Math.max(0, Math.min(100, (marketValue / Math.max(1, primaryGoal.targetAmount)) * 100)) : 0;
  const consistency = monthsElapsed > 0 ? Math.min(100, Math.round((txThisMonth > 0 ? 1 : 0) * 35 + Math.min(65, activeTx.length / Math.max(1, monthsElapsed) * 65))) : 0;
  const nextMilestone = Math.max(0, (primaryGoal?.targetAmount ?? Math.max(1000, marketValue + 1000)) - marketValue);

  const lastSync = activeSettings?.lastQuoteSyncAt
    ? new Date(activeSettings.lastQuoteSyncAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "Chưa đồng bộ";

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      db.transactions.where("ownerId").equals(ownerId).toArray(),
      db.quotes.where("ownerId").equals(ownerId).toArray(),
    ]);
    window.setTimeout(() => setRefreshing(false), 420);
  };

  const portfolioTraceModel = buildPortfolioTraceModel({
    totalValue: marketValue,
    securities: breakdown.securities,
    cash: breakdown.cash,
    cashNegative: Boolean(breakdown.cashNegative),
    valueComplete: portfolioSnapshot.valueComplete,
    missingIsins: breakdown.missingIsins,
    vwcePrice: portfolioSnapshot.vwcePrice,
    vwceAsOf: portfolioSnapshot.vwceQuote?.asOf,
    provenance: portfolioSnapshot.provenance,
  });

  const pulseCards = [
    {
      label: "Tiến độ mục tiêu",
      value: primaryGoal ? `${goalPct.toFixed(1)}%` : "Chưa có",
      hint: primaryGoal ? primaryGoal.name : "Tạo mục tiêu đầu tiên",
      tone: goalPct >= 75 ? "positive" : "neutral",
    },
    {
      label: "Kỷ luật",
      value: `${consistency}%`,
      hint: `${txThisMonth} giao dịch tháng này`,
      tone: consistency >= 70 ? "positive" : "neutral",
    },
    {
      label: "Mốc kế tiếp",
      value: formatMoney(nextMilestone, EURO),
      hint: "Khoảng cách tới mục tiêu gần nhất",
      tone: "neutral",
    },
    {
      label: "Lợi nhuận",
      value: formatMoney(gain.amount, EURO),
      hint: `${gain.percent.toFixed(2)}% trên vốn ròng`,
      tone: gain.amount >= 0 ? "positive" : "negative",
    },
  ];

  return (
    <div className="page overview-page">
      <TransactionsImportBanner ownerId={ownerId} />
      {breakdown.cashNegative && <CashNegativeWarning cash={breakdown.cash} />}

      <section className={`overview-hero ${portfolioEmpty ? "overview-hero-empty" : ""}`}>
        <div className="overview-hero-head">
          <div>
            <p className="eyebrow">Tổng quan local-first</p>
            <h1>Chào buổi tối, Ziegepapa</h1>
            <p className="muted">{ownerLabel} · dữ liệu nằm trên thiết bị này</p>
          </div>
          <div className="overview-hero-actions">
            <button
              className="btn ghost"
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label="Làm mới dữ liệu"
            >
              {refreshing ? "Đang làm mới…" : "↻ Làm mới"}
            </button>
            <Link className="overview-avatar" to="/settings" aria-label="Mở cài đặt tài khoản">
              Z
            </Link>
          </div>
        </div>

        <button className="overview-total" type="button" onClick={() => setTraceOpen(true)}>
          <span>Tổng tài sản</span>
          <strong>{formatMoney(marketValue, EURO)}</strong>
          <small>{portfolioSnapshot.valueComplete ? "Chạm để xem nguồn số" : `Đã định giá · thiếu ${breakdown.missingIsins.length} mã`}</small>
        </button>

        {portfolioEmpty ? (
          <div className="overview-empty-state">
            <div className="overview-empty-copy">
              <strong>Sổ quỹ chưa có giao dịch</strong>
              <p>Bắt đầu bằng một khoản nộp hoặc giao dịch VWCE. Mô phỏng bên dưới chỉ là phép thử, chưa phải tài sản thật.</p>
            </div>
            <Link className="btn" to="/transactions">＋ Thêm giao dịch đầu tiên</Link>
          </div>
        ) : (
          <div className="overview-hero-metrics">
            <div>
              <span>Vốn ròng</span>
              <strong>{formatMoney(invested, EURO)}</strong>
            </div>
            <div>
              <span>Lãi / lỗ</span>
              <strong className={gain.amount >= 0 ? "positive" : "negative"}>
                {formatMoney(gain.amount, EURO)} · {gain.percent.toFixed(2)}%
              </strong>
            </div>
            <div>
              <span>So với kế hoạch</span>
              <strong>{plannedContributions > 0 ? `${formatMoney(invested - plannedContributions, EURO)}` : "Chưa đủ dữ liệu"}</strong>
            </div>
          </div>
        )}
      </section>

      <TodayCenter
        ownerKey={ownerId}
        totalValue={marketValue}
        totalQuantity={portfolioSnapshot.totalQuantity}
        valueComplete={portfolioSnapshot.valueComplete}
        vwcePrice={portfolioSnapshot.vwcePrice}
        vwcePriceSource={portfolioSnapshot.vwcePriceSource}
        years={activeSettings?.planEndDate
          ? Math.max(1, new Date(activeSettings.planEndDate).getUTCFullYear() - new Date().getUTCFullYear())
          : 15}
        annualReturn={(activeSettings?.assumedReturnPct ?? 7) / 100}
        inflation={0.02}
        onRecordPulse={handleRefresh}
        focusControl={(
          <Link className={`change-focus ${flashChange ? "is-new" : ""}`} to="/settings?tab=overview">
            Thay đổi tiêu điểm
            {flashChange && <span>Mới</span>}
          </Link>
        )}
      />

      <section className="overview-section" aria-labelledby="portfolio-pulse-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Change Focus</p>
            <h2 id="portfolio-pulse-title">Tín hiệu dài hạn</h2>
          </div>
          <Link className="text-link" to="/settings?tab=overview">Tuỳ chỉnh</Link>
        </div>
        <div className="overview-pulse-grid">
          {pulseCards.map((card) => (
            <article key={card.label} className={`overview-pulse-card tone-${card.tone}`}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.hint}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="overview-section overview-insight-grid">
        <article className="card overview-card">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Dòng tiền</p>
              <h2>6 tháng gần nhất</h2>
            </div>
            <strong>{formatMoney(netCashflow, EURO)}</strong>
          </div>
          {activeTx.length === 0 ? (
            <div className="overview-mini-empty">
              <strong>Chưa có dòng tiền</strong>
              <span>Thêm giao dịch đầu tiên để bắt đầu đường xu hướng.</span>
            </div>
          ) : (
            <>
              <svg className="overview-sparkline" viewBox="0 0 320 72" role="img" aria-label="Xu hướng dòng tiền sáu tháng">
                <polyline points={spark} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="overview-months">
                {months.map((month) => <span key={month.key}>{month.label.slice(0, 2)}</span>)}
              </div>
            </>
          )}
          <div className="overview-card-footer">
            <span>Giá: {lastSync}</span>
            <Link className="text-link" to="/transactions">Mở sổ</Link>
          </div>
        </article>

        <article className="card overview-card">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Phân bổ</p>
              <h2>Quỹ hiện tại</h2>
            </div>
            <button className="text-link button-link" type="button" onClick={() => setShowAllocation(true)}>Chi tiết</button>
          </div>
          <div className="overview-allocation">
            <div className="overview-donut" style={allocationStyle} aria-label={`${securityPct.toFixed(1)} phần trăm chứng khoán`}>
              <span>{assetTotal > 0 ? `${securityPct.toFixed(0)}%` : "—"}</span>
            </div>
            <div className="overview-allocation-legend">
              <div><span className="legend-dot securities" />VWCE / ETF<strong>{formatMoney(breakdown.securities, EURO)}</strong></div>
              <div><span className="legend-dot cash" />An toàn<strong>{formatMoney(breakdown.cash, EURO)}</strong></div>
              {breakdown.missingIsins.length > 0 && <small>Thiếu giá: {breakdown.missingIsins.join(", ")}</small>}
            </div>
          </div>
        </article>
      </section>

      <section className="overview-section overview-quick-actions" aria-labelledby="quick-actions-title">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Thao tác nhanh</p>
            <h2 id="quick-actions-title">Làm việc tiếp</h2>
          </div>
        </div>
        <div className="overview-action-grid">
          <Link to="/transactions">＋ Thêm giao dịch</Link>
          <Link to="/settings?tab=prices">↻ Cập nhật giá</Link>
          <Link to="/simulation">⌁ Mô phỏng</Link>
          <Link to="/settings?tab=data">⇩ Backup dữ liệu</Link>
        </div>
      </section>

      {progress && (
        <section className="card overview-progress-card">
          <h2>Tiến độ kế hoạch</h2>
          <div className="progress" aria-label="Tiến độ kế hoạch">
            <span style={{ width: `${Math.min(100, Math.max(0, progress.progress * 100))}%` }} />
          </div>
          <div className="row muted">
            <span>Thực tế: {formatMoney(progress.actual, EURO)}</span>
            <span>Mục tiêu hôm nay: {formatMoney(progress.expected, EURO)}</span>
          </div>
          <p className={progress.delta >= 0 ? "positive" : "negative"}>
            {progress.delta >= 0 ? "Đang vượt kế hoạch" : "Đang thấp hơn kế hoạch"} {formatMoney(Math.abs(progress.delta), EURO)}
          </p>
        </section>
      )}

      <TraceSheet
        open={traceOpen}
        onClose={() => setTraceOpen(false)}
        model={portfolioTraceModel}
      />

      {showAllocation && (
        <div className="trace-sheet-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setShowAllocation(false);
        }}>
          <section className="trace-sheet" role="dialog" aria-modal="true" aria-label="Chi tiết phân bổ">
            <button className="trace-sheet-close" type="button" onClick={() => setShowAllocation(false)} aria-label="Đóng">×</button>
            <p className="trace-sheet-eyebrow">Phân bổ hiện tại</p>
            <h2>Danh mục local</h2>
            <dl className="trace-sheet-rows">
              <div><dt>Chứng khoán</dt><dd>{formatMoney(breakdown.securities, EURO)}</dd></div>
              <div><dt>An toàn</dt><dd>{formatMoney(breakdown.cash, EURO)}</dd></div>
              <div><dt>Tổng</dt><dd>{formatMoney(marketValue, EURO)}</dd></div>
              <div><dt>Mã thiếu giá</dt><dd>{breakdown.missingIsins.join(", ") || "Không có"}</dd></div>
            </dl>
            <div className="trace-sheet-actions">
              <Link className="btn" to="/settings?tab=prices" onClick={() => setShowAllocation(false)}>Cập nhật giá</Link>
              <button className="btn ghost" type="button" onClick={() => setShowAllocation(false)}>Đóng</button>
            </div>
          </section>
        </div>
      )}

      {activeSettings === undefined && (
        <ErrorState message="Chưa có cấu hình kế hoạch. Mở Cài đặt để bắt đầu." />
      )}
    </div>
  );
}
