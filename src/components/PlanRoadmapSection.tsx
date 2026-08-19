import { useMemo } from "react";
import { getPlanPhase, planDateYear } from "../lib/planPhase";
import type { PlanPhase, PlanTarget } from "../lib/types";
import { useLocale } from "../lib/locale";

function buildRoadmapRows(
  target: PlanTarget,
  now: Date,
): Array<{ year: number; phase: PlanPhase }> {
  const rows: Array<{ year: number; phase: PlanPhase }> = [];
  const currentYear = now.getFullYear();
  const targetYear = planDateYear(target.targetUseDate) ?? currentYear;
  const endYear = Math.max(targetYear + 1, currentYear + 3);
  for (let year = currentYear; year <= endYear && rows.length < 15; year++) {
    const fakeNow = new Date(year, 0, 1);
    const phase = getPlanPhase(target, fakeNow);
    if (!phase) continue;
    rows.push({ year, phase });
  }
  return rows;
}

export default function PlanRoadmapSection({
  target,
  onChangeTarget,
}: {
  target: PlanTarget;
  onChangeTarget: (next: PlanTarget) => void;
}) {
  const { locale } = useLocale();
  const text = locale === "de" ? {
    eyebrow: "Plan", title: "Jährlicher Ausstiegsplan", description: "Der Risikoabbau beginnt am vorgesehenen Verwendungsdatum. Die Aktienquote ist ein Orientierungsrahmen und keine Handelsanweisung.",
    current: "Aktuell", years: "Jahre", equityTarget: "Aktienziel", useDate: "Verwendungsdatum", needFull: "Nahezu das gesamte Geld wird zu diesem Zeitpunkt benötigt", table: "Jährlicher Risikoabbau", year: "Jahr", remaining: "Verbleibend", status: "Status", equity: "% Aktien", disclaimer: "Dieser Rahmen richtet sich nach den verbleibenden Jahren und ist keine Handelsanweisung. Prüfen Sie Kontostand, Gebühren und Steuern, bevor Sie Geld umschichten.",
  } : {
    eyebrow: "Kế hoạch", title: "Lộ trình theo năm (Glide Path)", description: "Lịch giảm dần rủi ro tính từ ngày cần tiền. Số % cổ phiếu là khung tham chiếu — không phải lệnh giao dịch.",
    current: "Hiện tại", years: "năm", equityTarget: "Mục tiêu cổ phiếu", useDate: "Ngày cần tiền (mốc sử dụng)", needFull: "Cần gần như toàn bộ số tiền ở mốc này", table: "Lộ trình giảm rủi ro theo từng năm", year: "Năm", remaining: "Còn lại", status: "Trạng thái", equity: "% CK", disclaimer: "Đây là khung gợi ý theo số năm còn lại. Không phải lệnh giao dịch. Hãy kiểm tra số dư thật, phí và thuế trước khi chuyển tiền.",
  };
  const statusLabel = (value: string) => locale === "de" ? ({ "GIỮ": "HALTEN", "GIẢM": "REDUZIEREN", "DỪNG": "STOPPEN" }[value] ?? value) : value;
  const now = useMemo(() => new Date(), []);
  const rows = useMemo(() => buildRoadmapRows(target, now), [target, now]);
  const currentYear = now.getFullYear();
  const currentPhase = useMemo(() => getPlanPhase(target, now), [target, now]);

  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <div>
          <p className="settings-card-eyebrow">{text.eyebrow}</p>
          <h3>{text.title}</h3>
          <p>{text.description}</p>
        </div>
        <span className="settings-icon-bubble" aria-hidden>📅</span>
      </div>

      {currentPhase ? (
        <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.5 }}>
          {text.current}: <strong>{statusLabel(currentPhase.status)}</strong>{" "}
          · {currentPhase.yearsLeft} {text.years}{" "}
          · {text.equityTarget} ~{currentPhase.equityPct}%
        </p>
      ) : null}

      <div className="settings-field-grid" style={{ marginBottom: 16 }}>
        <label className="setting-field">
          <span>{text.useDate}</span>
          <input
            type="date"
            value={target.targetUseDate}
            min="2020-01-01"
            max="2100-12-31"
            onChange={(e) =>
              onChangeTarget({ ...target, targetUseDate: e.target.value })
            }
          />
        </label>
      </div>

      <label className="switch-row" style={{ marginBottom: 20 }}>
        <span>{text.needFull}</span>
        <input
          type="checkbox"
          className="ios-switch"
          checked={target.needFullAmount}
          onChange={(e) =>
            onChangeTarget({ ...target, needFullAmount: e.target.checked })
          }
        />
      </label>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
          aria-label={text.table}
        >
          <thead>
            <tr>
              {([text.year, text.remaining, text.status, text.equity] as const).map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === text.year ? "left" : "center",
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
                    background: isCurrent ? "var(--surface-1,#f9fafb)" : undefined,
                    fontWeight: isCurrent ? 600 : undefined,
                  }}
                >
                  <td style={{ padding: "6px 8px 6px 0", borderBottom: bdStyle, whiteSpace: "nowrap" }}>
                    {year}{isCurrent ? " ◄" : ""}
                  </td>
                  <td style={{ textAlign: "center", padding: "6px 8px", borderBottom: bdStyle, whiteSpace: "nowrap" }}>
                    {phase.yearsLeft > 0 ? `${phase.yearsLeft} ${text.years}` : "—"}
                  </td>
                  <td style={{ textAlign: "center", padding: "6px 8px", borderBottom: bdStyle }}>
                    {statusLabel(phase.status)}
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
        {text.disclaimer}
      </p>
    </section>
  );
}
