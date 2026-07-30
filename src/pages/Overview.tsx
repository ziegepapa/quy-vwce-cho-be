import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSettings, listGoals, listTransactions } from "../lib/db";
import type { AppSettings, Goal, Transaction } from "../lib/types";
import {
  applyTransaction,
  avgCost,
  buildEquitySeries,
  emptyPortfolio,
  formatMoney,
  goalProgressStatus,
  inflate,
  monthsBetween,
  parseDate,
} from "../lib/calc";

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
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const coords = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * 120;
      const y = 36 - ((v - min) / span) * 28;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const area = `0,40 ${coords} 120,40`;
  return (
    <svg className="sparkline" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden>
      <polygon points={area} fill="url(#spFade)" />
      <polyline points={coords} fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2" strokeLinejoin="round" />
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
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c - (shown / 100) * c;
  return (
    <svg className="mini-ring" width="44" height="44" viewBox="0 0 44 44" aria-hidden>
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(16,24,40,.08)" strokeWidth="4" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="var(--primary-600)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 22 22)"
      />
      <text x="22" y="25" textAnchor="middle" className="mini-ring-pct">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

export default function Overview(_props: { displayName?: string }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [moreActions, setMoreActions] = useState(false);

  useEffect(() => {
    (async () => {
      setSettings(await getSettings());
      setGoals(await listGoals());
      setTxs(await listTransactions());
      setLoading(false);
    })();
  }, []);

  const portfolio = useMemo(() => {
    let s = emptyPortfolio();
    for (const t of [...txs].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      s = applyTransaction(s, t);
    }
    return s;
  }, [txs]);

  const series = useMemo(
    () => buildEquitySeries(txs, settings?.latestVwcePrice ?? 0),
    [txs, settings?.latestVwcePrice],
  );

  if (loading) {
    return (
      <div className="ov">
        <div className="skeleton" style={{ height: 176, borderRadius: 18 }} />
        <div className="skeleton" style={{ height: 64, borderRadius: 10, marginTop: 20 }} />
      </div>
    );
  }

  const price = settings?.latestVwcePrice ?? 0;
  const vwceValue = portfolio.vwceQty * price;
  const total = vwceValue + portfolio.cashBalance;
  const pnl = vwceValue - portfolio.vwceCostBasis;
  const today = new Date();
  const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const hasContribThisMonth = txs.some((t) => t.type === "cash_in" && t.date.startsWith(ym));

  const mode: "empty" | "early" | "active" =
    txs.length === 0 && total === 0 ? "empty" : txs.length < 3 ? "early" : "active";

  const insights: Insight[] = [];
  if (!hasContribThisMonth && mode !== "empty") {
    insights.push({
      id: "contrib",
      priority: "high",
      title: "Chưa ghi nhận đóng góp tháng này",
      why: "Nhịp đóng góp đều giúp giữ đúng kế hoạch dài hạn.",
      cta: "Ghi nhận",
      to: "/transactions",
    });
  }
  if (!price && mode !== "empty") {
    insights.push({
      id: "price",
      priority: "high",
      title: "Chưa cập nhật giá VWCE",
      why: "Số liệu tài sản có thể lệch thực tế.",
      cta: "Cập nhật",
      to: "/settings",
    });
  }
  for (const g of goals) {
    if (g.amount <= 0) continue;
    const due = parseDate(g.dueDate);
    const months = monthsBetween(today, due);
    const years = Math.max(0, due.getFullYear() - g.baseYear);
    const adjusted =
      g.mode === "purchasing_power" ? inflate(g.amount, g.inflationRate, years) : g.amount;
    if (months <= 36 && months > 0 && g.protectedAmount < adjusted * 0.5) {
      insights.push({
        id: `g-${g.id}`,
        priority: "high",
        title: `${g.name}: chậm tiến độ`,
        why: `Còn ${months} tháng · đã bảo vệ ${Math.round((g.protectedAmount / (adjusted || 1)) * 100)}%.`,
        cta: "Xem",
        to: "/goals",
      });
    }
  }

  const ratio = total > 0 ? Math.round((vwceValue / total) * 100) : 0;
  const pnlPct =
    portfolio.vwceCostBasis > 0 ? ((pnl / portfolio.vwceCostBasis) * 100).toFixed(1) : null;

  // Nearest goal only
  let nearest: Goal | null = null;
  let nearestMonths = Infinity;
  let nearestPct = 0;
  let nearestPerMonth = 0;
  for (const g of goals) {
    const due = parseDate(g.dueDate);
    const m = monthsBetween(today, due);
    if (m >= 0 && m < nearestMonths) {
      nearestMonths = m;
      nearest = g;
      const years = Math.max(0, due.getFullYear() - g.baseYear);
      const adj =
        g.mode === "purchasing_power" ? inflate(g.amount, g.inflationRate, years) : g.amount;
      nearestPct = adj > 0 ? Math.min(100, (g.protectedAmount / adj) * 100) : 0;
      const gap = Math.max(0, adj - g.protectedAmount);
      nearestPerMonth = m > 0 ? gap / m : gap;
    }
  }

  const primary = insights[0];
  const rest = insights.slice(1);

  return (
    <div className="ov">
      {/* Block 1 — Hero */}
      <section className={`hero-v8 hero-${mode}`}>
        <div className="hero-noise" aria-hidden />
        {mode === "empty" ? (
          <div className="hero-empty-inner">
            <p className="hero-label">Tổng tài sản</p>
            <p className="hero-empty-copy">Bắt đầu bằng giao dịch đầu tiên</p>
            <Link to="/transactions" className="hero-cta">
              Thêm giao dịch đầu tiên
            </Link>
          </div>
        ) : (
          <>
            <p className="hero-label">Tổng tài sản</p>
            <p className="hero-amount">
              <span className="hero-num">{formatMoney(total).replace(/\s*€$/, "")}</span>
              <span className="hero-eur">€</span>
            </p>
            {pnl !== 0 && price > 0 && (
              <span className="hero-delta">
                {pnl >= 0 ? "↑" : "↓"} {formatMoney(Math.abs(pnl))}
                {pnlPct ? ` (${pnlPct}%)` : ""}
              </span>
            )}
            <Sparkline points={series} />
            <div className="alloc-v8" role="img" aria-label={`VWCE ${ratio}%, an toàn ${100 - ratio}%`}>
              <div className="alloc-seg-v8 vwce" style={{ flex: Math.max(ratio, 1) }} />
              <div className="alloc-seg-v8 cash" style={{ flex: Math.max(100 - ratio, 1) }} />
            </div>
            <div className="alloc-legend-v8">
              <span>VWCE {ratio}%</span>
              <span>An toàn {100 - ratio}%</span>
            </div>
            {mode === "early" && (
              <p className="hero-early">Còn {Math.max(0, 3 - txs.length)} bước để hoàn tất thiết lập · · ·</p>
            )}
          </>
        )}
      </section>

      {/* Block 2 — StatStrip (skip zeros spam on empty) */}
      {mode !== "empty" && (
        <section className="stat-strip">
          <div className="stat-col">
            <span className="stat-label">VWCE</span>
            <span className="stat-val">{formatMoney(vwceValue)}</span>
          </div>
          <div className="stat-rule" aria-hidden />
          <div className="stat-col">
            <span className="stat-label">An toàn</span>
            <span className="stat-val">{formatMoney(portfolio.cashBalance)}</span>
          </div>
          <div className="stat-rule" aria-hidden />
          <div className="stat-col">
            <span className="stat-label">Lãi–lỗ</span>
            <span className={`stat-val ${pnl >= 0 ? "pos" : "neg"}`}>{formatMoney(pnl)}</span>
          </div>
          <button
            type="button"
            className="stat-detail-btn"
            onClick={() => setDetailOpen((v) => !v)}
            aria-expanded={detailOpen}
          >
            Chi tiết {detailOpen ? "▴" : "▾"}
          </button>
          {detailOpen && (
            <dl className="stat-detail-list">
              <div>
                <dt>SL VWCE</dt>
                <dd>{portfolio.vwceQty.toFixed(4)}</dd>
              </div>
              <div>
                <dt>Giá vốn TB</dt>
                <dd>{formatMoney(avgCost(portfolio))}</dd>
              </div>
              <div>
                <dt>Vốn đã đóng</dt>
                <dd>{formatMoney(portfolio.totalContributed)}</dd>
              </div>
              <div>
                <dt>Đã rút</dt>
                <dd>{formatMoney(portfolio.totalWithdrawn)}</dd>
              </div>
              <div>
                <dt>Phí + thuế</dt>
                <dd>{formatMoney(portfolio.totalFees + portfolio.totalTax)}</dd>
              </div>
            </dl>
          )}
        </section>
      )}

      {/* Block 3 — ActionStack */}
      {primary && (
        <section className="action-stack">
          <Link to={primary.to} className="action-item">
            <div className={`action-icon pri-${primary.priority}`} aria-hidden>
              !
            </div>
            <div className="action-body">
              <p className="action-title">{primary.title}</p>
              <p className="action-why">{primary.why}</p>
              <span className="action-cta">{primary.cta} →</span>
            </div>
          </Link>
          {rest.length > 0 && (
            <>
              <button
                type="button"
                className="action-more"
                onClick={() => setMoreActions((v) => !v)}
              >
                {moreActions ? "Thu gọn" : `+${rest.length} việc khác`}
              </button>
              {moreActions &&
                rest.map((ins) => (
                  <Link key={ins.id} to={ins.to} className="action-item action-item-sm">
                    <div className={`action-icon pri-${ins.priority}`} aria-hidden>
                      i
                    </div>
                    <div className="action-body">
                      <p className="action-title">{ins.title}</p>
                      <span className="action-cta">{ins.cta} →</span>
                    </div>
                  </Link>
                ))}
            </>
          )}
        </section>
      )}

      {/* Block 4 — NextGoal (1 row) */}
      {nearest && (
        <section className="next-goal">
          <Link to="/goals" className="next-goal-row">
            <MiniRing pct={nearestPct} />
            <div className="next-goal-body">
              <p className="next-goal-name">{nearest.name}</p>
              <p className="next-goal-meta">
                Còn {nearestMonths} tháng
                {nearestPerMonth > 0 ? ` · cần thêm ${formatMoney(nearestPerMonth)}/tháng` : ""}
              </p>
            </div>
            <span className="next-goal-chev" aria-hidden>
              ›
            </span>
          </Link>
          {goals.length > 1 && (
            <Link to="/goals" className="next-goal-all">
              Xem cả {goals.length} mục tiêu →
            </Link>
          )}
        </section>
      )}

      {/* Block 5 — Footnote */}
      <p className="ov-foot">Không phải tư vấn đầu tư. Lãi/lỗ chỉ theo dõi nội bộ.</p>
    </div>
  );
}
