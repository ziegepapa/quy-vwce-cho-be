import { useEffect, useMemo, useState } from "react";
import { getSettings, listGoals, listTransactions } from "../lib/db";
import type { AppSettings, Goal, Transaction } from "../lib/types";
import {
  applyTransaction,
  emptyPortfolio,
  formatDateVN,
  formatMoney,
  goalProgressStatus,
  inflate,
  monthsBetween,
  parseDate,
  requiredSafeAmount,
} from "../lib/calc";
import { ETF } from "../lib/defaults";

export default function Overview() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);

  useEffect(() => {
    (async () => {
      setSettings(await getSettings());
      setGoals(await listGoals());
      setTxs(await listTransactions());
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

  const metrics: [string, number][] = [
    ["Tổng tài sản", total],
    ["Giá trị VWCE", vwceValue],
    ["Tiền an toàn", portfolio.cashBalance],
    ["Vốn đã đóng", portfolio.totalContributed],
    ["Đã rút", portfolio.totalWithdrawn],
    ["Lãi/lỗ tạm tính", vwceValue - portfolio.vwceCostBasis],
  ];

  return (
    <div>
      <h1 className="page-title">Tổng quan</h1>
      <p className="muted">
        {ETF.ticker} · {ETF.isin}
      </p>
      {!price && (
        <div className="banner" role="status">
          Chưa cập nhật giá VWCE.
        </div>
      )}
      <div className="grid2">
        {metrics.map(([label, value]) => (
          <div className="card" key={label}>
            <div className="metric-label">{label}</div>
            <div className="metric-value">{formatMoney(value)}</div>
          </div>
        ))}
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
        return (
          <div className="card" key={g.id}>
            <div className="row-between">
              <strong>{g.name}</strong>
              <span className={`pill ${status}`}>{status}</span>
            </div>
            <p className="muted">
              Hạn {formatDateVN(g.dueDate)} · {months} tháng
            </p>
            {adjusted > 0 && (
              <>
                <div className="progress-track">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <p className="muted">
                  {formatMoney(g.protectedAmount)} / {formatMoney(adjusted)}
                </p>
              </>
            )}
          </div>
        );
      })}

      {goals[0]?.amount > 0 && (
        <div className="card">
          <h2>Cash bucket</h2>
          <p className="muted">
            Cần bảo vệ:{" "}
            {formatMoney(
              requiredSafeAmount({
                targetAmount: goals[0].amount,
                inflationRate: goals[0].inflationRate,
                baseYear: goals[0].baseYear,
                targetYear: parseDate(goals[0].dueDate).getFullYear(),
                useInflation: goals[0].mode === "purchasing_power",
                bufferPct: goals[0].bufferPct,
              }),
            )}
          </p>
        </div>
      )}

      <p className="disclaimer">
        Không phải tư vấn đầu tư. Lãi/lỗ theo giá bạn nhập.
      </p>
    </div>
  );
}
