import { useEffect, useMemo, useState } from "react";
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
      <div>
        <div className="skeleton" style={{ height: 28, width: "40%", marginBottom: 12 }} />
        <div className="card" style={{ height: 120 }} />
        <div className="grid2">
          <div className="card" style={{ height: 72 }} />
          <div className="card" style={{ height: 72 }} />
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

  const todos: string[] = [];
  if (!hasContribThisMonth) todos.push("Chưa ghi nhận đóng góp tháng này");
  if (!price) todos.push("Chưa cập nhật giá VWCE");
  if (daysSinceBackup > 90) todos.push("Chưa backup trong 90 ngày");

  for (const g of goals) {
    if (g.amount <= 0) continue;
    const due = parseDate(g.dueDate);
    const months = monthsBetween(today, due);
    const years = Math.max(0, due.getFullYear() - g.baseYear);
    const adjusted =
      g.mode === "purchasing_power" ? inflate(g.amount, g.inflationRate, years) : g.amount;
    if (months <= 36 && months > 0 && g.protectedAmount < adjusted * 0.5) {
      todos.push(`${g.name}: cash bucket chưa đủ tiến độ (<36 tháng)`);
    }
    if (months < 12 && months > 0 && g.protectedAmount < adjusted) {
      todos.push(`${g.name}: còn <12 tháng nhưng chưa bảo vệ đủ`);
    }
  }

  const ratio = total > 0 ? Math.round((vwceValue / total) * 100) : 0;

  return (
    <div>
      <h1 className="page-title">Tổng quan</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {ETF.ticker} · {ETF.isin}
        {settings?.latestPriceDate
          ? ` · Giá ${formatMoney(price)} (${formatDateVN(settings.latestPriceDate)})`
          : ""}
      </p>

      <div className="card card-hero">
        <div className="metric-label">Tổng tài sản</div>
        <div className="metric-value">{formatMoney(total)}</div>
        <p className="muted" style={{ marginBottom: 0, marginTop: 8 }}>
          VWCE {ratio}% · An toàn {100 - ratio}%
        </p>
        <div className="progress-track" style={{ background: "rgba(255,255,255,.25)", marginTop: 10 }}>
          <span style={{ width: `${ratio}%`, background: "#fff" }} />
        </div>
      </div>

      {todos.length > 0 && (
        <div className="card" role="region" aria-label="Việc cần làm">
          <h2>Việc cần làm</h2>
          <ul className="muted" style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {todos.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid2">
        <div className="card">
          <div className="metric-label">Giá trị VWCE</div>
          <div className="metric-value">{formatMoney(vwceValue)}</div>
        </div>
        <div className="card">
          <div className="metric-label">Tiền an toàn</div>
          <div className="metric-value">{formatMoney(portfolio.cashBalance)}</div>
        </div>
        <div className="card">
          <div className="metric-label">Vốn đã đóng</div>
          <div className="metric-value">{formatMoney(portfolio.totalContributed)}</div>
        </div>
        <div className="card">
          <div className="metric-label">Đã rút</div>
          <div className="metric-value">{formatMoney(portfolio.totalWithdrawn)}</div>
        </div>
        <div className="card">
          <div className="metric-label">SL VWCE</div>
          <div className="metric-value">{portfolio.vwceQty.toFixed(4)}</div>
        </div>
        <div className="card">
          <div className="metric-label">Giá vốn TB</div>
          <div className="metric-value">{formatMoney(avgCost(portfolio))}</div>
        </div>
        <div className="card">
          <div className="metric-label">Lãi/lỗ tạm</div>
          <div className={`metric-value ${pnl >= 0 ? "positive" : "negative"}`}>
            {formatMoney(pnl)}
          </div>
        </div>
        <div className="card">
          <div className="metric-label">Phí + thuế</div>
          <div className="metric-value">
            {formatMoney(portfolio.totalFees + portfolio.totalTax)}
          </div>
        </div>
      </div>

      <h2 className="section-title">Tiến độ mục tiêu</h2>
      {goals.length === 0 && (
        <div className="empty card">
          <div className="empty-icon" aria-hidden>
            ○
          </div>
          <p>Chưa có mục tiêu. Thêm ở tab Mục tiêu.</p>
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
          return (
            <div className="timeline-item" key={g.id}>
              <div className={`timeline-dot ${status}`} aria-hidden />
              <div className="card" style={{ marginBottom: 0 }}>
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
                    <p className="muted" style={{ margin: 0 }}>
                      Bảo vệ {formatMoney(g.protectedAmount)} / {formatMoney(adjusted)}
                    </p>
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                      Còn thiếu {formatMoney(Math.max(0, adjusted - g.protectedAmount))} · Cần an
                      toàn {formatMoney(need)}
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
