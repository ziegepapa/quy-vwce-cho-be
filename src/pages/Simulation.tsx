import { useState } from "react";
import { formatMoney, simulateMonthly, yearEndSnapshots } from "../lib/calc";
import { saveSettings } from "../lib/db";

export default function Simulation() {
  const [c1, setC1] = useState(100);
  const [c2, setC2] = useState(120);
  const [ran, setRan] = useState(false);
  const scenarios = [{ label: "Thận trọng 3%", rate: 0.03 }, { label: "Cơ sở 5%", rate: 0.05 }, { label: "Tích cực 7%", rate: 0.07 }];
  const results = scenarios.map((s) => {
    const months = simulateMonthly({ startYear: 2026, startMonth: 7, endYear: 2042, endMonth: 6, initialVwce: 0, initialCash: 0, contributionYear1: c1, contributionFromYear2: c2, vwceAnnualReturn: s.rate, safeAnnualReturn: 0.015 });
    return { ...s, last: months[months.length - 1], years: yearEndSnapshots(months) };
  });
  return (
    <div>
      <h1 className="page-title">Mô phỏng</h1>
      <p className="muted">Đóng góp cuối tháng. Không phải dự báo.</p>
      <div className="card">
        <div className="grid2">
          <div className="field"><label>Đóng góp năm 1</label><input type="number" value={c1} onChange={(e) => setC1(+e.target.value)} /></div>
          <div className="field"><label>Từ năm 2</label><input type="number" value={c2} onChange={(e) => setC2(+e.target.value)} /></div>
        </div>
        <button type="button" onClick={() => setRan(true)}>Chạy mô phỏng</button>
      </div>
      {ran && results.map((r) => (
        <div className="card" key={r.label}>
          <h2>{r.label}</h2>
          <div className="grid2">
            <div><div className="metric-label">Tổng đóng</div><div className="metric-value">{formatMoney(r.last?.contributed ?? 0)}</div></div>
            <div><div className="metric-label">Cuối kỳ</div><div className="metric-value">{formatMoney(r.last?.total ?? 0)}</div></div>
          </div>
          <details><summary className="muted">Theo năm</summary>
            <table style={{ width: "100%", fontSize: ".8rem" }}><thead><tr><th>Năm</th><th>Tổng</th></tr></thead>
              <tbody>{r.years.map((y) => <tr key={y.year}><td>{y.year}</td><td>{formatMoney(y.total)}</td></tr>)}</tbody>
            </table>
          </details>
        </div>
      ))}
      {ran && <button type="button" className="secondary" onClick={async () => { if (confirm("Áp dụng đóng góp?")) { await saveSettings({ contributionY1: c1, contributionY2: c2 }); alert("Đã lưu"); } }}>Áp dụng làm kế hoạch chính</button>}
    </div>
  );
}
