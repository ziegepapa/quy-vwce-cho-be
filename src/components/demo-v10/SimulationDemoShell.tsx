import type { Mode, ProjectOutput, Scenario } from "../../lib/simulation/engine";
import type { Goal } from "../../lib/types";
import { MAX_YEARS } from "../../lib/simulation/engine";
import { SimulationDemoChart } from "./SimulationDemoChart";
import { formatDisplayMoney, type DisplayLocale } from "../../ui/localeFormatting";

function formatMoneyRounded(n: number, locale: DisplayLocale): string {
  return formatDisplayMoney(Math.round(n), locale);
}

function simulationCopy(locale: DisplayLocale) {
  return locale === "de" ? {
    aria: "Simulation", modeA: "Einzahlen → Erhalten", modeB: "Wunsch → Einzahlen", modeC: "Einzahlen → Wann", unavailable: "Keine umsetzbare Rate", unavailableNote: "Ziel / Rendite prüfen", afterYears: (years: number, monthly: string) => `nach ${years} Jahren · ${monthly}/Monat`, end: "Endwert", contributed: "Eingezahlt", gain: "Gewinn", chart: "Portfolioentwicklung", forecast: "Portfolio (Projektion)", monthly: "Monatlicher Beitrag (EUR)", target: "Zielbetrag (EUR)", duration: "Laufzeit", years: "Jahre", want: "Gewünschter Betrag (EUR)", inYear: "Im Jahr", aboutYears: (years: number, monthly: string) => `noch etwa ${years} Jahre · benötigt ca. ${monthly}/Monat`, annualReturn: "Rendite / Jahr (%)", around: "Spanne", year: "Jahr", forecastNav: "Prognostizierter NAV", current: "Heute", collapse: "Weniger anzeigen", showAll: "Alle Jahre anzeigen", disclaimer: "Schätzung — keine Anlageberatung", range: "Bandbreite ± (%)", contributionGrowth: "Beitrag ändert sich jährlich", perYear: "% / Jahr", initialLump: "Einmalbetrag zu Beginn", startingBalance: "Startguthaben", purchasingPower: "Kaufkraft von heute", inflation: "Inflation % / Jahr", germanTax: "DE-Steuern + TER", afterTax: "Aktuell: nach Steuern", beforeTax: "Aktuell: vor Steuern", presentValue: "Aktuell: heutige Kaufkraft", nominal: "Aktuell: nominal", goal: "Ziel", savePlan: "Beitrag und Basisrendite in den Plan übernehmen", noPlanChanges: "Der Plan stimmt bereits überein — nichts zu speichern.", undo: "Rückgängig", saveDialog: "Im Plan speichern", yearOne: "Jahr 1", fromYearTwo: "Ab Jahr 2", return: "Rendite", cancel: "Abbrechen",
  } : {
    aria: "Mô phỏng", modeA: "Góp → Nhận", modeB: "Muốn → Góp", modeC: "Góp → Bao giờ", unavailable: "Chưa có mức góp khả thi", unavailableNote: "kiểm tra mục tiêu / lợi nhuận", afterYears: (years: number, monthly: string) => `sau ${years} năm · ${monthly}/tháng`, end: "Cuối kỳ", contributed: "Đã góp", gain: "Lãi", chart: "Tăng trưởng danh mục", forecast: "Danh mục (dự báo)", monthly: "Góp mỗi tháng (EUR)", target: "Mục tiêu (EUR)", duration: "Thời hạn", years: "năm", want: "Muốn có (EUR)", inYear: "Vào năm", aboutYears: (years: number, monthly: string) => `Còn khoảng ${years} năm · cần ~${monthly}/tháng`, annualReturn: "Lợi nhuận / năm (%)", around: "khoảng", year: "Năm", forecastNav: "NAV dự báo", current: "Hiện tại", collapse: "Thu gọn", showAll: "Hiện tất cả các năm", disclaimer: "Ước tính — không phải tư vấn đầu tư", range: "Biên độ ± (%)", contributionGrowth: "Góp thay đổi theo năm", perYear: "% / năm", initialLump: "Khoản lớn ban đầu", startingBalance: "Số dư xuất phát", purchasingPower: "Sức mua hôm nay", inflation: "Lạm phát %/năm", germanTax: "Thuế DE + TER", afterTax: "Đang: sau thuế", beforeTax: "Đang: trước thuế", presentValue: "Đang: giá hôm nay", nominal: "Đang: danh nghĩa", goal: "Mục tiêu", savePlan: "Lưu mức góp & lợi nhuận cơ sở vào kế hoạch", noPlanChanges: "Kế hoạch đã khớp — không có gì để lưu.", undo: "Hoàn tác", saveDialog: "Lưu vào kế hoạch", yearOne: "Năm 1", fromYearTwo: "Từ năm 2", return: "Lợi nhuận", cancel: "Hủy",
  };
}

export type SimulationDemoShellProps = {
  locale: DisplayLocale;
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
  round2: (n: number) => number;
};

export default function SimulationDemoShell(p: SimulationDemoShellProps) {
  const {
    locale, mode, setMode, planUnreachable, headlineValue, yearsForProject, monthlyForProject,
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
    confirmPersist,
  } = p;
  const text = simulationCopy(locale);

  return (
    <main className="demo-v10-screen" aria-label={text.aria}>
      <div className="sim-wrap">
      <div className="mode-tabs" role="tablist" aria-label={text.aria}>
        {(
          [
            ["A", text.modeA, "Mode A"],
            ["B", text.modeB, "Mode B"],
            ["C", text.modeC, "Mode C"],
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
            <div className="sh-sub">{text.unavailable}</div>
            <div className="sh-note">{text.unavailableNote}</div>
          </>
        ) : (
          <>
            <div className="sh-big">{formatMoneyRounded(headlineValue, locale)}</div>
            <div className="sh-sub">
              {text.afterYears(yearsForProject, formatMoneyRounded(monthlyForProject, locale))}
            </div>
            <div className="sh-note">{headlineNote}</div>
          </>
        )}
      </section>

      <div className="sim-sum3">
        <div className="gl ss-c">
          <div className="ss-lbl">{text.end}</div>
          <div className="ss-val" style={{ color: "var(--demo-vi)" }}>
            {primary && !planUnreachable ? formatMoneyRounded(headlineValue, locale) : "—"}
          </div>
        </div>
        <div className="gl ss-c">
          <div className="ss-lbl">{text.contributed}</div>
          <div className="ss-val" style={{ color: "var(--demo-sub)" }}>
            {primary && !planUnreachable
              ? formatMoneyRounded(primary.out.contributed + initialBalance, locale)
              : "—"}
          </div>
        </div>
        <div className="gl ss-c">
          <div className="ss-lbl">{text.gain}</div>
          <div className="ss-val" style={{ color: "var(--demo-em)" }}>
            {primary && !planUnreachable ? formatMoneyRounded(shownInterest, locale) : "—"}
          </div>
        </div>
      </div>

      <section className="gl sim-chart-card">
        <div className="sim-chart-title">{text.chart}</div>
        <SimulationDemoChart
          results={results}
          markers={goalMarkers}
          years={yearsForProject}
          band={band}
          baseRate={baseRate}
          locale={locale}
        />
        <div className="chart-legend">
          <span><i style={{ background: "var(--demo-vi)" }} /> {text.contributed}</span>
          <span><i style={{ background: "var(--demo-em)" }} /> {text.forecast}</span>
        </div>
      </section>

      {(mode === "A" || mode === "C") && (
        <section className="gl sim-inputs">
          {mode === "A" && (
            <div className="inp-row">
              <span className="inp-lbl">{text.monthly}</span>
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
                <span className="inp-lbl">{text.target}</span>
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
                <span className="inp-lbl">{text.monthly}</span>
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
              <span className="yr-lbl">{text.duration}</span>
              <span className="yr-val">{years} {text.years}</span>
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
            <span className="inp-lbl">{text.want}</span>
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
            <span className="inp-lbl">{text.inYear}</span>
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
            {text.aboutYears(yearsB, requiredMonthlyBase >= 0 ? formatMoneyRounded(requiredMonthlyBase, locale) : "—")}
          </p>
        </section>
      )}

      <section className="gl sim-inputs">
        <div className="inp-row">
          <span className="inp-lbl">{text.annualReturn}</span>
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
            {text.around} {bandPctLabel}
          </p>
        ) : null}
      </section>

      <section className="gl yr-table">
        <div className="yr-table-head">
          <span>{text.year}</span>
          <span>{text.forecastNav}</span>
          <span>{text.contributed}</span>
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
                {yi === 0 ? text.current : String(calYear)}
                {goalYearSet.has(yi) ? (
                  <small style={{ marginLeft: 4, color: "var(--demo-vi)" }}>
                    {goalNameByYear.get(yi)}
                  </small>
                ) : null}
              </span>
              <span style={{ textAlign: "center" }}>
                {basePt ? formatMoneyRounded(basePt.total, locale) : "—"}
              </span>
              <span style={{ textAlign: "right" }}>
                {basePt ? formatMoneyRounded(basePt.contributed, locale) : "—"}
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
        {showAllYears ? text.collapse : text.showAll}
      </button>

      <div className="sim-note">ⓘ {text.disclaimer}</div>

      <details className="gl" style={{ padding: 14 }}>
        <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--demo-dim)" }}>
          {advSummary}
        </summary>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="inp-row">
            <span className="inp-lbl">{text.range}</span>
            <input className="inp" value={bandInput} onChange={(e) => setBandInput(e.target.value)} disabled={readOnly} />
          </div>
          <label className="inp-row">
            <span className="inp-lbl">{text.contributionGrowth}</span>
            <input type="checkbox" checked={growthOn} onChange={(e) => setGrowthOn(e.target.checked)} disabled={readOnly} />
          </label>
          {growthOn ? (
            <div className="inp-row">
              <span className="inp-lbl">{text.perYear}</span>
              <input className="inp" value={growthPct} onChange={(e) => setGrowthPct(e.target.value)} disabled={readOnly} />
            </div>
          ) : null}
          <div className="inp-row">
            <span className="inp-lbl">{text.initialLump}</span>
            <input className="inp" value={lumpSum} onChange={(e) => setLumpSum(e.target.value)} disabled={readOnly} />
          </div>
          <div className="inp-row">
            <span className="inp-lbl">{text.startingBalance}</span>
            <input
              className="inp"
              placeholder={String(Math.max(0, realBalance))}
              value={balanceOverride}
              onChange={(e) => setBalanceOverride(e.target.value)}
              disabled={readOnly}
            />
          </div>
          <label className="inp-row">
            <span className="inp-lbl">{text.purchasingPower}</span>
            <input type="checkbox" checked={inflationOn} onChange={(e) => setInflationOn(e.target.checked)} disabled={readOnly} />
          </label>
          {inflationOn ? (
            <div className="inp-row">
              <span className="inp-lbl">{text.inflation}</span>
              <input className="inp" value={inflationPct} onChange={(e) => setInflationPct(e.target.value)} disabled={readOnly} />
            </div>
          ) : null}
          <label className="inp-row">
            <span className="inp-lbl">{text.germanTax}</span>
            <input type="checkbox" checked={taxOn} onChange={(e) => setTaxOn(e.target.checked)} disabled={readOnly} />
          </label>
          {taxOn ? (
            <button type="button" className="show-all-btn" onClick={() => setShowAfterTax((v) => !v)}>
              {showAfterTax ? text.afterTax : text.beforeTax}
            </button>
          ) : null}
          {inflationOn ? (
            <button type="button" className="show-all-btn" onClick={() => setShowPP((v) => !v)}>
              {showPP ? text.presentValue : text.nominal}
            </button>
          ) : null}
          {goals.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {goals.map((g) => (
                <button key={g.id} type="button" className="show-all-btn" onClick={() => applyYearsFromGoal(g)}>
                  {text.goal}: {g.name}
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
            {text.savePlan}
          </button>
        </div>
      </details>

      {matchMsg && !undoVisible ? (
        <div className="gl" style={{ padding: 12, fontSize: 13 }}>
          {text.noPlanChanges}
        </div>
      ) : null}

      {undoVisible && undoSnap ? (
        <div className="gl" style={{ padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 13 }}>{undoSnap.message}</span>
          <button type="button" className="show-all-btn" onClick={() => void undoPersist()}>
            {text.undo}
          </button>
        </div>
      ) : null}

      {saveOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="sheet-handle" aria-hidden />
            <h2>{text.saveDialog}</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0" }}>
              {y1Diff ? (
                <button type="button" aria-pressed={writeY1} onClick={() => setWriteY1((v) => !v)} className="show-all-btn">
                  {text.yearOne} · {formatDisplayMoney(monthlyForProjectRounded, locale)}
                </button>
              ) : null}
              {y2Diff ? (
                <button type="button" aria-pressed={writeY2} onClick={() => setWriteY2((v) => !v)} className="show-all-btn">
                  {text.fromYearTwo} · {formatDisplayMoney(monthlyForProjectRounded, locale)}
                </button>
              ) : null}
              {retDiff ? (
                <button type="button" aria-pressed={writeReturn} onClick={() => setWriteReturn((v) => !v)} className="show-all-btn">
                  {text.return} · {(baseRateNew * 100).toFixed(2)}%
                </button>
              ) : null}
            </div>
            <button type="button" disabled={selectedCount === 0} onClick={() => void confirmPersist()}>
              {saveLabel}
            </button>
            <button type="button" className="secondary" onClick={() => setSaveOpen(false)}>
              {text.cancel}
            </button>
          </div>
        </div>
      ) : null}
      </div>
    </main>
  );
}
