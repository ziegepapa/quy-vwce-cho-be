import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getSettings,
  listGoals,
  listInstruments,
  listQuotes,
  listTransactions,
  saveManualQuoteForIsin,
} from "../lib/db";
import type { AppSettings, Goal, Instrument, Quote, Transaction } from "../lib/types";
import { VWCE_ISIN } from "../lib/types";
import {
  applyTransaction,
  avgCost,
  buildEquitySeries,
  emptyPortfolio,
  formatDateVN,
  formatMoney,
  inflate,
  monthsBetween,
  parseDate,
  parseDecimal,
  portfolioMarketValue,
} from "../lib/calc";
import { useNavAction } from "../lib/navActions";

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
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [moreActions, setMoreActions] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [priceErr, setPriceErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setSettings(await getSettings());
      setGoals(await listGoals());
      setTxs(await listTransactions());
      setInstruments(await listInstruments());
      setQuotes(await listQuotes());
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

  /** Prices keyed by ISIN — never borrow VWCE for another ISIN. */
  const pricesByIsin = useMemo(() => {
    const map: Record<string, number | undefined> = {};
    for (const q of quotes) {
      if (q.currency === "EUR" && q.price > 0) map[q.instrumentIsin] = q.price;
    }
    // Legacy fallback only for VWCE when quote table empty
    const legacy = settings?.latestVwcePrice ?? 0;
    if (legacy > 0 && map[VWCE_ISIN] == null) map[VWCE_ISIN] = legacy;
    return map;
  }, [quotes, settings?.latestVwcePrice]);

  const market = useMemo(
    () => portfolioMarketValue(portfolio, pricesByIsin),
    [portfolio, pricesByIsin],
  );

  const series = useMemo(
    () => buildEquitySeries(txs, pricesByIsin[VWCE_ISIN] ?? 0, pricesByIsin as Record<string, number>),
    [txs, pricesByIsin],
  );

  function openPriceSheet() {
    const current = pricesByIsin[VWCE_ISIN] ?? 0;
    setPriceInput(current > 0 ? String(current) : "");
    setPriceErr(null);
    setPriceOpen(true);
  }

  useNavAction("updatePrice", openPriceSheet);

  async function savePrice() {
    setPriceErr(null);
    const value = parseDecimal(priceInput);
    const asOf = new Date().toISOString().slice(0, 10);
    if (!(value > 0)) {
      setPriceErr("Giá phải > 0.");
      return;
    }
    try {
      await saveManualQuoteForIsin({
        instrumentIsin: VWCE_ISIN,
        price: value,
        asOf,
        venue: "XETRA",
      });
      setPriceOpen(false);
      setSettings(await getSettings());
      setQuotes(await listQuotes());
      setInstruments(await listInstruments());
    } catch (e) {
      setPriceErr(e instanceof Error ? e.message : "Không lưu được giá");
      setSettings(await getSettings());
      setQuotes(await listQuotes());
    }
  }

  if (loading) {
    return (
      <div className="ov">
        <div className="skeleton" style={{ height: 176, borderRadius: 18 }} />
        <div className="skeleton" style={{ height: 64, borderRadius: 10, marginTop: 20 }} />
      </div>
    );
  }

  const hasMissingPrices = market.missingIsins.length > 0;
  const securitiesKnown = market.securities;
  const cash = market.cash;
  // Total of priced parts only — do not present as complete if missingIsins
  const totalKnown = securitiesKnown + cash;
  const vwcePrice = pricesByIsin[VWCE_ISIN] ?? 0;
  const vwceValue =
    typeof pricesByIsin[VWCE_ISIN] === "number" ? portfolio.vwceQty * pricesByIsin[VWCE_ISIN]! : null;
  const pnl =
    vwceValue != null && portfolio.vwceCostBasis > 0 ? vwceValue - portfolio.vwceCostBasis : 0;
  const today = new Date();
  const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const hasContribThisMonth = txs.some((t) => t.type === "cash_in" && t.date.startsWith(ym));

  const mode: "empty" | "early" | "active" =
    txs.length === 0 && totalKnown === 0 && !hasMissingPrices ? "empty" : txs.length < 3 ? "early" : "active";

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
  if (hasMissingPrices) {
    insights.push({
      id: "price-missing",
      priority: "high",
      title: `Thiếu giá cho ${market.missingIsins.length} mã`,
      why: "Tổng tài sản chưa đầy đủ cho đến khi có giá từng ISIN.",
      cta: "Cập nhật",
      to: "/settings",
    });
  } else if (!vwcePrice && mode !== "empty" && portfolio.vwceQty > 0) {
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

  const cashNegative = portfolio.cashBalance < 0;
  const ratio =
    totalKnown > 0 && securitiesKnown >= 0
      ? Math.min(100, Math.max(0, Math.round((securitiesKnown / totalKnown) * 100)))
      : 0;
  const pnlPct =
    portfolio.vwceCostBasis > 0 && vwceValue != null
      ? ((pnl / portfolio.vwceCostBasis) * 100).toFixed(1)
      : null;

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

  const instName = (isin: string) => {
    const inst = instruments.find((i) => i.isin === isin);
    if (inst?.ticker) return `${inst.ticker}`;
    if (inst?.name) return inst.name;
    return isin;
  };

  return (
    <div className="ov">
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
            <p className="hero-label">
              {hasMissingPrices ? "Tài sản đã định giá" : "Tổng tài sản"}
            </p>
            <p className="hero-amount">
              <span className="hero-num">{formatMoney(totalKnown).replace(/\s*€$/, "")}</span>
              <span className="hero-eur">€</span>
            </p>
            {hasMissingPrices && (
              <span className="hero-delta" style={{ opacity: 0.9 }}>
                + {market.missingIsins.length} mã thiếu giá (chưa cộng vào tổng)
              </span>
            )}
            {pnl !== 0 && vwceValue != null && (
              <span className="hero-delta">
                {pnl >= 0 ? "↑" : "↓"} {formatMoney(Math.abs(pnl))}
                {pnlPct ? ` (${pnlPct}%)` : ""}
              </span>
            )}
            <Sparkline points={series} />
            {cashNegative ? (
              <div className="alloc-legend-v8">
                <span className="neg">Tỉ lệ chưa tính được — số dư âm</span>
              </div>
            ) : (
              <>
                <div className="alloc-v8" role="img" aria-label={`Chứng khoán ${ratio}%, an toàn ${100 - ratio}%`}>
                  <div className="alloc-seg-v8 vwce" style={{ flex: Math.max(ratio, 1) }} />
                  <div className="alloc-seg-v8 cash" style={{ flex: Math.max(100 - ratio, 1) }} />
                </div>
                <div className="alloc-legend-v8">
                  <span>Chứng khoán {ratio}%</span>
                  <span>An toàn {100 - ratio}%</span>
                </div>
              </>
            )}
            {mode === "early" && (
              <p className="hero-early">Còn {Math.max(0, 3 - txs.length)} bước để hoàn tất thiết lập · · ·</p>
            )}
          </>
        )}
      </section>

      {mode !== "empty" && (
        <section className="stat-strip">
          <div className="stat-col">
            <span className="stat-label">CK đã định giá</span>
            <span className="stat-val">{formatMoney(securitiesKnown)}</span>
          </div>
          <div className="stat-rule" aria-hidden />
          <div className="stat-col">
            <span className="stat-label">An toàn</span>
            <span className={`stat-val${cashNegative ? " neg" : ""}`}>
              {formatMoney(portfolio.cashBalance)}
            </span>
          </div>
          <div className="stat-rule" aria-hidden />
          <div className="stat-col">
            <span className="stat-label">Lãi–lỗ VWCE</span>
            <span className={`stat-val ${pnl >= 0 ? "pos" : "neg"}`}>
              {vwceValue != null ? formatMoney(pnl) : "—"}
            </span>
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
              {Object.entries(market.byIsin).map(([isin, row]) => (
                <div key={isin}>
                  <dt>
                    {instName(isin)}
                    <span className="muted" style={{ display: "block", fontSize: 11 }}>
                      {isin}
                    </span>
                  </dt>
                  <dd>
                    {row.qty.toFixed(4)} ×{" "}
                    {row.price != null ? formatMoney(row.price) : (
                      <span style={{ color: "var(--warning-600, #b45309)" }}>Thiếu giá</span>
                    )}
                    {row.value != null ? ` = ${formatMoney(row.value)}` : ""}
                  </dd>
                </div>
              ))}
              <div>
                <dt>Giá vốn TB VWCE</dt>
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

      {cashNegative && (
        <section className="card" style={{ marginTop: 12 }}>
          <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Số dư an toàn đang âm</p>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.45 }}>
            Nghĩa là có giao dịch mua hoặc chi nhiều hơn số tiền đã nạp. Hãy kiểm tra xem có thiếu
            giao dịch nạp tiền nào không.
          </p>
          <Link to="/transactions" className="action-item" style={{ minHeight: 44 }}>
            Xem giao dịch
          </Link>
        </section>
      )}

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

      <p className="ov-foot">Không phải tư vấn đầu tư. Lãi/lỗ chỉ theo dõi nội bộ.</p>

      {priceOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setPriceOpen(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" aria-hidden />
            <h2>Cập nhật giá VWCE</h2>
            <p className="muted" style={{ fontSize: 13 }}>
              Chỉ áp dụng cho {VWCE_ISIN}. Mã khác: Cài đặt → quote thủ công.
            </p>
            <div className="field">
              <label htmlFor="ov-price">Giá gần nhất (€)</label>
              <input
                id="ov-price"
                inputMode="decimal"
                autoFocus
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
              />
              {settings?.latestPriceDate ? (
                <p className="field-hint">
                  Lần cập nhật trước: {formatDateVN(settings.latestPriceDate)}
                </p>
              ) : null}
            </div>
            {priceErr && (
              <p role="alert" style={{ color: "var(--danger-600, #b91c1c)", fontSize: 13 }}>
                {priceErr}
              </p>
            )}
            <div className="stack">
              <button type="button" onClick={savePrice}>
                Lưu
              </button>
              <button type="button" className="secondary" onClick={() => setPriceOpen(false)}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
