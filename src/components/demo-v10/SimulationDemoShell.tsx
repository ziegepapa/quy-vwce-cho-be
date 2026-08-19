import type { Mode, ProjectOutput, Scenario } from "../../lib/simulation/engine";
import type { Goal } from "../../lib/types";
import { MAX_YEARS } from "../../lib/simulation/engine";
import { SimulationDemoChart } from "./SimulationDemoChart";

function formatMoneyRounded(n: number): string {
  const v = Math.round(n);
  const abs = Math.abs(v);
  const s = abs.toLocaleString("de-DE", { maximumFractionDigits: 0 });
  return (v < 0 ? "\u2212" : "") + s + " \u20ac";
}

export type SimulationDemoShellProps = {
  mode: Mode;
  setMode: (m: Mode) => void;
  planUnreachable: boolean;
  headlineValue: number;
  yearsForProject: number;
  monthlyForProject: number;
  headlineNote: string;
  primary: { out: ProjectOutput; tax: { afterTax: number }; pp: number; ppAfter: number } | undefined;
  initialBalance: number;
  shownInterest: number;
  results: { sc: Scenario; out: ProjectOutput }[];
  goalMarkers: { name: string; yearIndex: number; amount: number }[];
  band: number;
  baseRate: number;
  monthly: string;
  setMonthly: (v: string) => void;
  years: number;
  setYears: (v: number) => void;
  targetAmount: string;
  setTargetAmount: (v: string) => void;
  targetYear: string;
  setTargetYear: (v: string) => void;
  yearsB: number;
  requiredMonthlyBase: number;
  yearsC: { years: number; reached: boolean };
  rateInput: string;
  setRateInput: (v: string) => void;
  bandPctLabel: string;
  readOnly: boolean;
  goals: Goal[];
  applyYearsFromGoal: (g: Goal) => void;
  advSummary: string;
  bandInput: string;
  setBandInput: (v: string) => void;
  growthOn: boolean;
  setGrowthOn: (v: boolean) => void;
  growthPct: string;
  setGrowthPct: (v: string) => void;
  lumpSum: string;
  setLumpSum: (v: string) => void;
  balanceOverride: string;
  setBalanceOverride: (v: string) => void;
  realBalance: number;
  inflationOn: boolean;
  setInflationOn: (v: boolean) => void;
  inflationPct: string;
  setInflationPct: (v: string) => void;
  taxOn: boolean;
  setTaxOn: (v: boolean) => void;
  showAfterTax: boolean;
  setShowAfterTax: (v: boolean | ((x: boolean) => boolean)) => void;
  showPP: boolean;
  setShowPP: (v: boolean | ((x: boolean) => boolean)) => void;
  yearRows: number[];
  baseMap: Map<number, { yearIndex: number; total: number; contributed: number }>;
  cautiousMap: Map<number, { yearIndex: number; total: number; contributed: number }>;
  bullMap: Map<number, { yearIndex: number; total: number; contributed: number }>;
  goalYearSet: Set<number>;
  goalNameByYear: Map<number, string>;
  nowY: number;
  showAllYears: boolean;
  setShowAllYears: (v: boolean | ((x: boolean) => boolean)) => void;
  openSaveConfirm: () => void;
  matchMsg: boolean;
  undoVisible: boolean;
  undoSnap: { message: string } | null;
  undoPersist: () => void;
  saveOpen: boolean;
  setSaveOpen: (v: boolean) => void;
  y1Diff: boolean;
  y2Diff: boolean;
  retDiff: boolean;
  writeY1: boolean;
  setWriteY1: (v: boolean | ((x: boolean) => boolean)) => void;
  writeY2: boolean;
  setWriteY2: (v: boolean | ((x: boolean) => boolean)) => void;
  writeReturn: boolean;
  setWriteReturn: (v: boolean | ((x: boolean) => boolean)) => void;
  monthlyForProjectRounded: number;
  oldY1: number;
  oldY2: number;
  oldVwce: number;
  baseRateNew: number;
  selectedCount: number;
  saveLabel: string;
  confirmPersist: () => void;
  formatMoney: (n: number) => string;
  round2: (n: number) => number;
};

export default function SimulationDemoShell(p: SimulationDemoShellProps) {
  const {
    mode, setMode, planUnreachable, headlineValue, yearsForProject, monthlyForProject,
    headlineNote, primary, initialBalance, shownInterest, results, goalMarkers, band, baseRate,
    monthly, setMonthly, years, setYears, targetAmount, setTargetAmount, targetYear, setTargetYear,
    yearsB, requiredMonthlyBase, yearsC, rateInput, setRateInput, bandPctLabel, readOnly, goals,
    applyYearsFromGoal, advSummary, bandInput, setBandInput, growthOn, setGrowthOn, growthPct,
    setGrowthPct, lumpSum, setLumpSum, balanceOverride, setBalanceOverride, realBalance,
    inflationOn, setInflationOn, inflationPct, setInflationPct, taxOn, setTaxOn,
    showAfterTax, setShowAfterTax, showPP, setShowPP, yearRows, baseMap, goalYearSet, goalNameByYear,
    nowY, showAllYears, setShowAllYears, openSaveConfirm, matchMsg, undoVisible, undoSnap, undoPersist,
    saveOpen, setSaveOpen, y1Diff, y2Diff, retDiff, writeY1, setWriteY1, writeY2, setWriteY2,
    writeReturn, setWriteReturn, monthlyForProjectRounded, baseRateNew, selectedCount, saveLabel,
    confirmPersist, formatMoney,
  } = p;

  return (
    <main className="demo-v10-screen" aria-label="Mô phỏng">
      <div className="sim-wrap">
      <div className="mode-tabs" role="tablist" aria-label="Chế độ mô phỏng">
        {(
          [
            ["A", "Góp → Nhận", "Mode A"],
            ["B", "Muốn → Góp", "Mode B"],
            ["C", "Góp → Bao giờ", "Mode C"],
          ] as const
        ).map(([id, label, sub]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            className={"mtab" + (mode === id ? " on" : "")}
            onClick={() => setMode(id)}
          >
            {label}
            <small>{sub}</small>
          </button>
        ))}
      </div>

      <section className="sim-headline">
        {planUnreachable ? (
          <>
            <div className="sh-big">—</div>
            <div className="sh-sub">Chưa có mức góp khả thi</div>
            <div className="sh-note">kiểm tra mục tiêu / lợi nhuận</div>
          </>
        ) : (
          <>
            <div className="sh-big">{formatMoneyRounded(headlineValue)}</div>
            <div className="sh-sub">
              {`sau ${yearsForProject} năm · ${formatMoneyRounded(monthlyForProject)}/tháng`}
            </div>
            <div className="sh-note">{headlineNote}</div>
          </>
        )}
      </section>

      <div className="sim-sum3">
        <div className="gl ss-c">
          <div className="ss-lbl">Cuối kỳ</div>
          <div className="ss-val" style={{ color: "var(--demo-vi)" }}>
            {primary && !planUnreachable ? formatMoneyRounded(headlineValue) : "—"}
          </div>
        </div>
        <div className="gl ss-c">
          <div className="ss-lbl">Đã góp</div>
          <div className="ss-val" style={{ color: "var(--demo-sub)" }}>
            {primary && !planUnreachable
              ? formatMoneyRounded(primary.out.contributed + initialBalance)
              : "—"}
          </div>
        </div>
        <div className="gl ss-c">
          <div className="ss-lbl">Lãi</div>
          <div className="ss-val" style={{ color: "var(--demo-em)" }}>
            {primary && !planUnreachable ? formatMoneyRounded(shownInterest) : "—"}
          </div>
        </div>
      </div>

      <section className="gl sim-chart-card">
        <div className="sim-chart-title">Tăng trưởng danh mục</div>
        <SimulationDemoChart
          results={results}
          markers={goalMarkers}
          years={yearsForProject}
          band={band}
          baseRate={baseRate}
        />
        <div className="chart-legend">
          <span><i style={{ background: "var(--demo-vi)" }} /> Đã góp</span>
          <span><i style={{ background: "var(--demo-em)" }} /> Danh mục (dự báo)</span>
        </div>
      </section>

      {(mode === "A" || mode === "C") && (
        <section className="gl sim-inputs">
          {mode === "A" && (
            <div className="inp-row">
              <span className="inp-lbl">Góp mỗi tháng (EUR)</span>
              <input
                className="inp"
                type="number"
                inputMode="decimal"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
                disabled={readOnly}
              />
            </div>
          )}
          {mode === "C" && (
            <>
              <div className="inp-row">
                <span className="inp-lbl">Mục tiêu (EUR)</span>
                <input
                  className="inp"
                  type="number"
                  inputMode="decimal"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  disabled={readOnly}
                />
              </div>
              <div className="inp-row">
                <span className="inp-lbl">Góp mỗi tháng (EUR)</span>
                <input
                  className="inp"
                  type="number"
                  inputMode="decimal"
                  value={monthly}
                  onChange={(e) => setMonthly(e.target.value)}
                  disabled={readOnly}
                />
              </div>
            </>
          )}
          <div className="yr-row2">
            <div className="yr-top">
              <span className="yr-lbl">Thời hạn</span>
              <span className="yr-val">{years} năm</span>
            </div>
            <input
              className="yr-slider"
              type="range"
              min={1}
              max={MAX_YEARS}
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              disabled={readOnly || mode === "C"}
            />
          </div>
        </section>
      )}

      {mode === "B" && (
        <section className="gl sim-inputs">
          <div className="inp-row">
            <span className="inp-lbl">Muốn có (EUR)</span>
            <input
              className="inp"
              type="number"
              inputMode="decimal"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              disabled={readOnly}
            />
          </div>
          <div className="inp-row">
            <span className="inp-lbl">Vào năm</span>
            <input
              className="inp"
              type="number"
              inputMode="numeric"
              value={targetYear}
              onChange={(e) => setTargetYear(e.target.value)}
              disabled={readOnly}
            />
          </div>
          <p className="sh-note" style={{ margin: 0 }}>
            {`Còn khoảng ${yearsB} năm · cần ~${requiredMonthlyBase >= 0 ? formatMoneyRounded(requiredMonthlyBase) : "—"}/tháng`}
          </p>
        </section>
      )}

      <section className="gl sim-inputs">
        <div className="inp-row">
          <span className="inp-lbl">Lợi nhuận / năm (%)</span>
          <input
            className="inp"
            type="text"
            inputMode="decimal"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            disabled={readOnly}
          />
        </div>
        {band > 0 ? (
          <p className="sh-note" style={{ margin: 0 }}>
            khoảng {bandPctLabel}
          </p>
        ) : null}
      </section>

      <section className="gl yr-table">
        <div className="yr-table-head">
          <span>Năm</span>
          <span>NAV dự báo</span>
          <span>Đã góp</span>
        </div>
        {yearRows.map((yi) => {
          const basePt = baseMap.get(yi);
          const isLast = yi === yearsForProject;
          const calYear = nowY + yi;
          return (
            <div
              key={yi}
              className="yr-row-item"
              style={{ fontWeight: isLast ? 700 : undefined }}
            >
              <span>
                {yi === 0 ? "Hiện tại" : String(calYear)}
                {goalYearSet.has(yi) ? (
                  <small style={{ marginLeft: 4, color: "var(--demo-vi)" }}>
                    {goalNameByYear.get(yi)}
                  </small>
                ) : null}
              </span>
              <span style={{ textAlign: "center" }}>
                {basePt ? formatMoneyRounded(basePt.total) : "—"}
              </span>
              <span style={{ textAlign: "right" }}>
                {basePt ? formatMoneyRounded(basePt.contributed) : "—"}
              </span>
            </div>
          );
        })}
      </section>

      <button
        type="button"
        className="show-all-btn"
        onClick={() => setShowAllYears((v) => !v)}
      >
        {showAllYears ? "Thu gọn" : "Hiện tất cả các năm"}
      </button>

      <div className="sim-note">ⓘ Ước tính — không phải tư vấn đầu tư</div>

      <details className="gl" style={{ padding: 14 }}>
        <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--demo-dim)" }}>
          {advSummary}
        </summary>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="inp-row">
            <span className="inp-lbl">Biên độ ± (%)</span>
            <input className="inp" value={bandInput} onChange={(e) => setBandInput(e.target.value)} disabled={readOnly} />
          </div>
          <label className="inp-row">
            <span className="inp-lbl">Góp thay đổi theo năm</span>
            <input type="checkbox" checked={growthOn} onChange={(e) => setGrowthOn(e.target.checked)} disabled={readOnly} />
          </label>
          {growthOn ? (
            <div className="inp-row">
              <span className="inp-lbl">% / năm</span>
              <input className="inp" value={growthPct} onChange={(e) => setGrowthPct(e.target.value)} disabled={readOnly} />
            </div>
          ) : null}
          <div className="inp-row">
            <span className="inp-lbl">Khoản lớn ban đầu</span>
            <input className="inp" value={lumpSum} onChange={(e) => setLumpSum(e.target.value)} disabled={readOnly} />
          </div>
          <div className="inp-row">
            <span className="inp-lbl">Số dư xuất phát</span>
            <input
              className="inp"
              placeholder={String(Math.max(0, realBalance))}
              value={balanceOverride}
              onChange={(e) => setBalanceOverride(e.target.value)}
              disabled={readOnly}
            />
          </div>
          <label className="inp-row">
            <span className="inp-lbl">Sức mua hôm nay</span>
            <input type="checkbox" checked={inflationOn} onChange={(e) => setInflationOn(e.target.checked)} disabled={readOnly} />
          </label>
          {inflationOn ? (
            <div className="inp-row">
              <span className="inp-lbl">Lạm phát %/năm</span>
              <input className="inp" value={inflationPct} onChange={(e) => setInflationPct(e.target.value)} disabled={readOnly} />
            </div>
          ) : null}
          <label className="inp-row">
            <span className="inp-lbl">Thuế DE + TER</span>
            <input type="checkbox" checked={taxOn} onChange={(e) => setTaxOn(e.target.checked)} disabled={readOnly} />
          </label>
          {taxOn ? (
            <button type="button" className="show-all-btn" onClick={() => setShowAfterTax((v) => !v)}>
              {showAfterTax ? "Đang: sau thuế" : "Đang: trước thuế"}
            </button>
          ) : null}
          {inflationOn ? (
            <button type="button" className="show-all-btn" onClick={() => setShowPP((v) => !v)}>
              {showPP ? "Đang: giá hôm nay" : "Đang: danh nghĩa"}
            </button>
          ) : null}
          {goals.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {goals.map((g) => (
                <button key={g.id} type="button" className="show-all-btn" onClick={() => applyYearsFromGoal(g)}>
                  Mục tiêu: {g.name}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            className="show-all-btn"
            style={{ opacity: planUnreachable ? 0.45 : 1 }}
            disabled={planUnreachable || readOnly}
            onClick={openSaveConfirm}
          >
            Lưu mức góp & lợi nhuận cơ sở vào kế hoạch
          </button>
        </div>
      </details>

      {matchMsg && !undoVisible ? (
        <div className="gl" style={{ padding: 12, fontSize: 13 }}>
          Kế hoạch đã khớp — không có gì để lưu.
        </div>
      ) : null}

      {undoVisible && undoSnap ? (
        <div className="gl" style={{ padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 13 }}>{undoSnap.message}</span>
          <button type="button" className="show-all-btn" onClick={() => void undoPersist()}>
            Hoàn tác
          </button>
        </div>
      ) : null}

      {saveOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="sheet-handle" aria-hidden />
            <h2>Lưu vào kế hoạch</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0" }}>
              {y1Diff ? (
                <button type="button" aria-pressed={writeY1} onClick={() => setWriteY1((v) => !v)} className="show-all-btn">
                  Năm 1 · {formatMoney(monthlyForProjectRounded)}
                </button>
              ) : null}
              {y2Diff ? (
                <button type="button" aria-pressed={writeY2} onClick={() => setWriteY2((v) => !v)} className="show-all-btn">
                  Từ năm 2 · {formatMoney(monthlyForProjectRounded)}
                </button>
              ) : null}
              {retDiff ? (
                <button type="button" aria-pressed={writeReturn} onClick={() => setWriteReturn((v) => !v)} className="show-all-btn">
                  Lợi nhuận · {(baseRateNew * 100).toFixed(2)}%
                </button>
              ) : null}
            </div>
            <button type="button" disabled={selectedCount === 0} onClick={() => void confirmPersist()}>
              {saveLabel}
            </button>
            <button type="button" className="secondary" onClick={() => setSaveOpen(false)}>
              Hủy
            </button>
          </div>
        </div>
      ) : null}
      </div>
    </main>
  );
}
