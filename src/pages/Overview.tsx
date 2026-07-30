import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db, getSettings, listGoals, listTransactions } from "../lib/db";
import type { AppSettings, Goal, Transaction } from "../lib/types";
import {
  applyTransaction,
  avgCost,
  emptyPortfolio,
  formatDateVN,
  formatMoney,
  goalProgressStatus,
  inflate,
  monthsBetween,
  parseDate,
  requiredSafeAmount,
  statusLabel,
} from "../lib/calc";
import { ETF } from "../lib/defaults";

type Insight = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  why: string;
  cta: string;
  to: string;
};

export default function Overview() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [lastBackup, setLastBackup] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setSettings(await getSettings());
      setGoals(await listGoals());
      setTxs(await listTransactions());
      setLastBackup((await db.appMetadata.get("meta"))?.lastBackupAt ?? "");
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

  if (loading) {
    return (
      <div className="bento">
        <div className="skeleton bento-hero" style={{ minHeight: 140 }} />
        <div className="skeleton" style={{ height: 88, borderRadius: 20 }} />
        <div className="bento-row">
          <div className="skeleton" style={{ height: 80, borderRadius: 18 }} />
          <div className="skeleton" style={{ height: 80, borderRadius: 18 }} />
        </div>
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
  const daysSinceBackup = lastBackup
    ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000)
    : 999;

  const insights: Insight[] = [];
  if (!hasContribThisMonth) {
    insights.push({
      id: "contrib",
      priority: "high",
      title: "Chưa ghi nhận đóng góp tháng này",
      why: "Nhịp đóng góp đều đặn giúp giữ đúng kế hoạch dài hạn.",
      cta: "Ghi nhận",
      to: "/transactions",
    });
  }
  if (!price) {
    insights.push({
      id: "price",
      priority: "high",
      title: "Chưa cập nhật giá VWCE",
      why: "Số liệu tài sản đang thiếu giá thị trường — có thể lệch thực tế.",
      cta: "Cập nhật giá",
      to: "/settings",
    });
  } else if (settings?.latestPriceDate) {
    const age = Math.floor(
      (Date.now() - new Date(settings.latestPriceDate).getTime()) / 86400000,
    );
    if (age > 7) {
      insights.push({
        id: "stale-price",
        priority: "medium",
        title: `Giá VWCE cũ ${age} ngày`,
        why: `Đang dùng giá ngày ${formatDateVN(settings.latestPriceDate)} — nên cập nhật.`,
        cta: "Cập nhật",
        to: "/settings",
      });
    }
  }
  if (daysSinceBackup > 90) {
    insights.push({
      id: "backup",
      priority: "medium",
      title: "Chưa backup trong 90 ngày",
      why: "Xuất JSON định kỳ bảo vệ dữ liệu nếu mất thiết bị.",
      cta: "Sao lưu",
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
        id: `goal-${g.id}`,
        priority: "high",
        title: `${g.name}: cash bucket chậm tiến độ`,
        why: `Còn ${months} tháng nhưng mới bảo vệ ${Math.round((g.protectedAmount / adjusted) * 100)}% mục tiêu.`,
        cta: "Xem mục tiêu",
        to: "/goals",
      });
    }
  }

  const ratio = total > 0 ? Math.round((vwceValue / total) * 100) : 0;
  const pnlPct =
    portfolio.vwceCostBasis > 0 ? ((pnl / portfolio.vwceCostBasis) * 100).toFixed(1) : null;

  return (
    <div>
      <header className="page-header">
        <h1 className="page-title">Tổng quan</h1>
        <p className="muted page-sub">
          {ETF.ticker} · {ETF.isin}
          {settings?.latestPriceDate
            ? ` · Giá ${formatMoney(price)} (${formatDateVN(settings.latestPriceDate)})`
            : ""}
        </p>
      </header>

      {total === 0 && txs.length === 0 ? (
        <div className="card surface-raised empty-hero">
          <div className="empty-icon" aria-hidden>
            ◇
          </div>
          <h2 className="empty-title">Bắt đầu quỹ của bé</h2>
          <p className="muted">
            Ghi nhận khoản nạp đầu tiên để theo dõi tài sản, mục tiêu và mô phỏng.
          </p>
          <Link to="/transactions" className="btn-link">
            Thêm giao dịch đầu tiên
          </Link>
        </div>
      ) : (
        <div className="bento-hero surface-raised">
          <div className="metric-label">Tổng tài sản</div>
          <div className="metric-value financial-display">{formatMoney(total)}</div>
          <p className="story-caption">
            {pnl !== 0 && price
              ? `Lãi/lỗ tạm ${pnl >= 0 ? "+" : ""}${formatMoney(pnl)}${pnlPct ? ` (${pnlPct}%)` : ""} so với giá vốn.`
              : "Nhập giá VWCE và giao dịch để thấy biến động."}
          </p>
          <div
            className="alloc-bar"
            role="img"
            aria-label={`VWCE ${ratio}%, an toàn ${100 - ratio}%`}
          >
            <div className="alloc-seg alloc-vwce" style={{ width: `${ratio}%` }} />
            <div className="alloc-seg alloc-cash" style={{ width: `${100 - ratio}%` }} />
          </div>
          <div className="alloc-legend">
            <span>
              <i className="dot vwce" /> VWCE {ratio}%
            </span>
            <span>
              <i className="dot cash" /> An toàn {100 - ratio}%
            </span>
          </div>
        </div>
      )}

      {insights.length > 0 && (
        <section className="insight-stack" aria-label="Việc cần làm">
          {insights.slice(0, 4).map((ins) => (
            <article key={ins.id} className={`insight-card priority-${ins.priority}`}>
              <div className="insight-top">
                <span className={`priority-chip ${ins.priority}`}>
                  {ins.priority === "high"
                    ? "Ưu tiên cao"
                    : ins.priority === "medium"
                      ? "Trung bình"
                      : "Thấp"}
                </span>
              </div>
              <h3 className="insight-title">{ins.title}</h3>
              <p className="insight-why">{ins.why}</p>
              <Link to={ins.to} className="insight-cta">
                {ins.cta} →
              </Link>
            </article>
          ))}
        </section>
      )}

      <div className="bento">
        <div className="bento-tile span-2 surface-raised">
          <div className="metric-label">Giá trị VWCE</div>
          <div className="metric-value">{formatMoney(vwceValue)}</div>
          <p className="story-caption">
            {portfolio.vwceQty.toFixed(4)} SL · giá vốn TB {formatMoney(avgCost(portfolio))}
          </p>
        </div>
        <div className="bento-tile surface-raised">
          <div className="metric-label">Tiền an toàn</div>
          <div className="metric-value">{formatMoney(portfolio.cashBalance)}</div>
          <p className="story-caption">Cash bucket</p>
        </div>
        <div className="bento-tile surface-raised">
          <div className="metric-label">Vốn đã đóng</div>
          <div className="metric-value">{formatMoney(portfolio.totalContributed)}</div>
          <p className="story-caption">Tổng nạp vào quỹ</p>
        </div>
        <div className="bento-tile surface-raised">
          <div className="metric-label">Đã rút</div>
          <div className="metric-value">{formatMoney(portfolio.totalWithdrawn)}</div>
          <p className="story-caption">Tổng rút ra</p>
        </div>
        <div className="bento-tile span-2 surface-raised">
          <div className="metric-label">Lãi/lỗ chưa thực hiện</div>
          <div className={`metric-value ${pnl >= 0 ? "positive" : "negative"}`}>
            {formatMoney(pnl)}
          </div>
          <p className="story-caption">Chỉ mang tính theo dõi nội bộ, chưa tính thuế thực tế.</p>
        </div>
        <div className="bento-tile surface-raised tile-sm">
          <div className="metric-label">Phí + thuế</div>
          <div className="metric-value" style={{ fontSize: "1.05rem" }}>
            {formatMoney(portfolio.totalFees + portfolio.totalTax)}
          </div>
        </div>
      </div>

      <h2 className="section-title">Tiến độ mục tiêu</h2>
      {goals.length === 0 && (
        <div className="empty card surface-raised">
          <p>Chưa có mục tiêu. Thêm ở tab Mục tiêu.</p>
          <Link to="/goals" className="btn-link">
            Thêm mục tiêu
          </Link>
        </div>
      )}
      <div className="timeline">
        {goals.map((g) => {
          if (g.amount <= 0 && !g.name.includes("2042")) return null;
          const due = parseDate(g.dueDate);
          const years = Math.max(0, due.getFullYear() - g.baseYear);
          const adjusted =
            g.mode === "purchasing_power" ? inflate(g.amount, g.inflationRate, years) : g.amount;
          const months = monthsBetween(today, due);
          const status = goalProgressStatus({
            targetAdjusted: adjusted || 1,
            protectedAmount: g.protectedAmount,
            monthsRemaining: months,
          });
          const pct = adjusted > 0 ? Math.min(100, (g.protectedAmount / adjusted) * 100) : 0;
          const need =
            adjusted > 0
              ? requiredSafeAmount({
                  targetAmount: g.amount,
                  inflationRate: g.inflationRate,
                  baseYear: g.baseYear,
                  targetYear: due.getFullYear(),
                  useInflation: g.mode === "purchasing_power",
                  bufferPct: g.bufferPct,
                })
              : 0;
          const gap = Math.max(0, adjusted - g.protectedAmount);
          const perMonth = months > 0 ? gap / months : gap;
          return (
            <div className="timeline-item" key={g.id}>
              <div className={`timeline-dot ${status}`} aria-hidden />
              <div className="card surface-raised" style={{ marginBottom: 0 }}>
                <div className="row-between">
                  <strong>{g.name}</strong>
                  <span className={`pill ${status}`}>{statusLabel(status)}</span>
                </div>
                <p className="muted" style={{ margin: "4px 0" }}>
                  Hạn {formatDateVN(g.dueDate)} · {months} tháng còn lại
                </p>
                {adjusted > 0 && (
                  <>
                    <div className="progress-track">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                    <p className="story-caption">
                      Bảo vệ {formatMoney(g.protectedAmount)} / {formatMoney(adjusted)}
                      {gap > 0 && months > 0
                        ? ` — cần thêm ~${formatMoney(perMonth)}/tháng.`
                        : "."}
                    </p>
                    <p className="muted" style={{ margin: "4px 0 0", fontSize: ".75rem" }}>
                      Cần an toàn {formatMoney(need)}
                    </p>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="disclaimer" style={{ marginTop: 16 }}>
        Không phải tư vấn đầu tư. Lãi/lỗ và giá vốn chỉ theo dõi nội bộ.
      </p>
    </div>
  );
}
