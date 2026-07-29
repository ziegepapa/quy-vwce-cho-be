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

  useEffect(() => {
    (async () => {
      setSettings(await getSettings());
      setGoals(await listGoals());
      setTxs(await listTransactions());
      setLastBackup((await db.appMetadata.get("meta"))?.lastBackupAt ?? "");
    })();
  }, []);

  const portfolio = useMemo(() => {
    let s = emptyPortfolio();
    for (const t of [...txs].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      s = applyTransaction(s, t);
    }
    return s;
  }, [txs]);

  const price = settings?.latestVwcePrice ?? 0;
  const vwceValue = portfolio.vwceQty * price;
  const total = vwceValue + portfolio.cashBalance;
  const today = new Date();
  const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const hasContribThisMonth = txs.some(
    (t) => t.type === "cash_in" && t.date.startsWith(ym),
  );
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
      g.mode === "purchasing_power"
        ? inflate(g.amount, g.inflationRate, years)
        : g.amount;
    if (months <= 36 && months > 0 && g.protectedAmount < adjusted * 0.5) {
      todos.push(`${g.name}: cash bucket chưa đủ tiến độ (<36 tháng)`);
    }
    if (months < 12 && months > 0 && g.protectedAmount < adjusted) {
      todos.push(`${g.name}: còn <12 tháng nhưng chưa bảo vệ đủ`);
    }
    if (g.mode === "nominal" && g.amount > 0) {
      todos.push(`${g.name}: chưa bật điều chỉnh lạm phát`);
    }
  }

  const metrics: [string, string][] = [
    ["Tổng tài sản", formatMoney(total)],
    ["Giá trị VWCE", formatMoney(vwceValue)],
    ["Tiền an toàn", formatMoney(portfolio.cashBalance)],
    ["Vốn đã đóng", formatMoney(portfolio.totalContributed)],
    ["Đã rút", formatMoney(portfolio.totalWithdrawn)],
    ["Lãi/lỗ tạm tính", formatMoney(vwceValue - portfolio.vwceCostBasis)],
    ["Đã mua (CK)", formatMoney(portfolio.totalBought)],
    ["Đã bán", formatMoney(portfolio.totalSold)],
    ["Tổng phí", formatMoney(portfolio.totalFees)],
    ["Tổng thuế", formatMoney(portfolio.totalTax)],
    ["Số lượng VWCE", portfolio.vwceQty.toFixed(4)],
    ["Giá vốn TB", formatMoney(avgCost(portfolio))],
  ];

  const ratio =
    total > 0 ? Math.round((vwceValue / total) * 100) : 0;

  return (
    <div>
      <h1 className="page-title">Tổng quan</h1>
      <p className="muted">
        {ETF.ticker} · {ETF.isin}
        {settings?.latestPriceDate
          ? ` · Giá ${formatMoney(price)} (${formatDateVN(settings.latestPriceDate)})`
          : ""}
      </p>

      {todos.length > 0 && (
        <div className="card" role="region" aria-label="Việc cần làm">
          <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>Việc cần làm tháng này</h2>
          <ul className="muted" style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {todos.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid2">
        {metrics.map(([label, value]) => (
          <div className="card" key={label}>
            <div className="metric-label">{label}</div>
            <div className="metric-value">{value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="metric-label">Tỷ lệ VWCE / tổng</div>
        <div className="metric-value">{ratio}%</div>
        <div className="progress-track" style={{ marginTop: 8 }}>
          <span style={{ width: `${ratio}%` }} />
        </div>
      </div>

      <h2 style={{ fontSize: "1.05rem" }}>Tiến độ mục tiêu</h2>
      {goals.map((g) => {
        if (g.amount <= 0 && !g.name.includes("2042")) return null;
        const due = parseDate(g.dueDate);
        const years = Math.max(0, due.getFullYear() - g.baseYear);
        const adjusted =
          g.mode === "purchasing_power"
            ? inflate(g.amount, g.inflationRate, years)
            : g.amount;
        const months = monthsBetween(today, due);
        const status = goalProgressStatus({
          targetAdjusted: adjusted || 1,
          protectedAmount: g.protectedAmount,
          monthsRemaining: months,
        });
        const pct =
          adjusted > 0
            ? Math.min(100, (g.protectedAmount / adjusted) * 100)
            : 0;
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
          <div className="card" key={g.id}>
            <div className="row-between">
              <strong>{g.name}</strong>
              <span className={`pill ${status}`} title={status}>
                {statusLabel(status)}
              </span>
            </div>
            <p className="muted">
              Hạn {formatDateVN(g.dueDate)} · {months} tháng còn lại
            </p>
            {adjusted > 0 && (
              <>
                <div className="progress-track">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <p className="muted">
                  Bảo vệ {formatMoney(g.protectedAmount)} / {formatMoney(adjusted)}
                  {" "}
                  (gốc {formatMoney(g.amount)})
                </p>
                <p className="muted">
                  Còn thiếu: {formatMoney(Math.max(0, adjusted - g.protectedAmount))} · Cần an
                  toàn (có buffer): {formatMoney(need)}
                </p>
              </>
            )}
            {g.amount <= 0 && (
              <p className="muted">Mục tiêu cuối — theo dõi tỷ lệ an toàn theo lộ trình 2040/41/42.</p>
            )}
          </div>
        );
      })}

      <p className="disclaimer">
        Không phải tư vấn đầu tư. Lãi/lỗ và giá vốn chỉ theo dõi nội bộ (không phải FIFO thuế Đức).
      </p>
    </div>
  );
}
