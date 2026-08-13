import { useMemo } from "react";
import { getPlanPhase } from "../lib/planPhase";
import type { PlanPhase, PlanTarget } from "../lib/types";

function buildRoadmapRows(
  target: PlanTarget,
  now: Date,
): Array<{ year: number; phase: PlanPhase }> {
  const rows: Array<{ year: number; phase: PlanPhase }> = [];
  const currentYear = now.getFullYear();
  const targetYear = new Date(target.targetUseDate).getFullYear();
  // Show current year through target year + 1, at least current + 3
  const endYear = Math.max(targetYear + 1, currentYear + 3);
  for (let year = currentYear; year <= endYear; year++) {
    const fakeNow = new Date(year, 0, 1); // 01/01 of each year
    const phase = getPlanPhase(target, fakeNow);
    if (!phase) continue;
    rows.push({ year, phase });
  }
  return rows;
}

export default function PlanRoadmapSection({
  target,
  onTargetChange,
}: {
  target: PlanTarget;
  onTargetChange: (next: PlanTarget) => void;
}) {
  const now = useMemo(() => new Date(), []);
  const rows = useMemo(
    () => buildRoadmapRows(target, now),
    [target, now],
  );
  const currentYear = now.getFullYear();

  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <div>
          <p className="settings-card-eyebrow">Kế hoạch</p>
          <h3>Lộ trình theo năm (Glide Path)</h3>
          <p>
            Lịch giảm dần rủi ro tính từ ngày cần tiền. Số % cổ phiếu là khung tham chiếu
            — không phải lệnh giao dịch.
          </p>
        </div>
        <span className="settings-icon-bubble" aria-hidden>📅</span>
      </div>

      <div className="settings-field-grid" style={{ marginBottom: 16 }}>
        <label className="setting-field">
          <span>Ngày cần tiền (mốc sử dụng)</span>
          <input
            type="date"
            value={target.targetUseDate}
            min="2020-01-01"
            max="2100-12-31"
            onChange={(e) =>
              onTargetChange({ ...target, targetUseDate: e.target.value })
            }
          />
        </label>
      </div>

      <label className="switch-row" style={{ marginBottom: 20 }}>
        <span>Cần gần như toàn bộ số tiền ở mốc này</span>
        <input
          type="checkbox"
          className="ios-switch"
          checked={target.needFullAmount}
          onChange={(e) =>
            onTargetChange({ ...target, needFullAmount: e.target.checked })
          }
        />
      </label>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
          aria-label="Lộ trình giảm rủi ro theo từng năm"
        >
          <thead>
            <tr>
              {(["Năm", "Còn lại", "Trạng thái", "% CK"] as const).map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === "Năm" ? "left" : "center",
                    padding: "6px 8px 6px 0",
                    borderBottom: "1px solid var(--border,#e5e7eb)",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ year, phase }) => {
              const isCurrent = year === currentYear;
              const bdStyle = "1px solid var(--border-subtle,rgba(0,0,0,.06))";
              return (
                <tr
                  key={year}
                  style={{
                    background: isCurrent
                      ? "var(--surface-1,#f9fafb)"
                      : undefined,
                    fontWeight: isCurrent ? 600 : undefined,
                  }}
                >
                  <td style={{ padding: "6px 8px 6px 0", borderBottom: bdStyle, whiteSpace: "nowrap" }}>
                    {year}{isCurrent ? " ◀" : ""}
                  </td>
                  <td style={{ textAlign: "center", padding: "6px 8px", borderBottom: bdStyle, whiteSpace: "nowrap" }}>
                    {phase.yearsLeft > 0 ? `${phase.yearsLeft} năm` : "—"}
                  </td>
                  <td style={{ textAlign: "center", padding: "6px 8px", borderBottom: bdStyle }}>
                    {phase.status}
                  </td>
                  <td style={{ textAlign: "center", padding: "6px 8px", borderBottom: bdStyle }}>
                    {phase.equityPct}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.45 }}>
        Số % chỉ là khung tham chiếu giáo dục. Mọi quyết định chuyển bán cần kiểm tra số
        dư thực tế, nhu cầu gia đình và quy định thuế tại quốc gia cư trú.
      </p>
    </section>
  );
}
