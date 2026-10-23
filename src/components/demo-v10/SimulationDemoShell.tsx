import { useState } from "react";
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
    aria: "Simulation", adjust: "Annahmen anpassen", close: "Schließen", parameters: "Parameter", modeA: "Einzahlen → Ergebnis", modeB: "Ziel → Sparrate", modeC: "Sparrate → Zeitraum", modeASub: "Startwert → Ergebnis", modeBSub: "Zielbetrag → Monatsrate", modeCSub: "Monatsrate → Zeitbedarf", badgeA: "Modus A · Endwert", badgeB: "Modus B · Monatsrate", badgeC: "Modus C · Zeitbedarf", targetBy: (amount: string, year: string) => `Ziel ${amount} bis ${year}`, goalWithMonthly: (amount: string, monthly: string) => `Ziel ${amount} bei ${monthly}/Monat`, unavailable: "Keine umsetzbare Rate", unavailableNote: "Ziel / Rendite prüfen", targetUnreachable: "Ziel innerhalb von 40 Jahren nicht erreichbar", afterYears: (years: number, monthly: string) => `nach ${years} Jahren · ${monthly}/Monat`, end: "Endwert", contributed: "Eingezahlt", gain: "Gewinn / Verlust (nominal)", summary: "Simulationsergebnis", yearTable: "Jährliche Projektion", chart: "Portfolioentwicklung", scenarioCompare: "Szenariovergleich", scenarioEnd: "Endwert nominal", returnAssumption: "Renditeannahme", scenarioNote: "Rechenbeispiele, keine Wahrscheinlichkeiten oder Prognose.", baseScenario: "Basis", forecast: "Portfolio (Projektion)", monthly: "Monatlicher Beitrag (EUR)", target: "Zielbetrag (EUR)", duration: "Laufzeit", years: "Jahre", want: "Gewünschter Betrag (EUR)", inYear: "Im Jahr", aboutYears: (years: number, monthly: string) => `noch etwa ${years} Jahre · benötigt ca. ${monthly}/Monat`, annualReturn: "Rendite / Jahr (%)", around: "Spanne", year: "Jahr", forecastNav: "Prognostizierter NAV", current: "Heute", collapse: "Weniger anzeigen", showAll: "Alle Jahre anzeigen", disclaimer: "Schätzung — keine Anlageberatung", range: "Bandbreite ± (%)", contributionGrowth: "Beitrag ändert sich jährlich", perYear: "% / Jahr", initialLump: "Einmalbetrag zu Beginn", startingBalance: "Startguthaben", purchasingPower: "Kaufkraft von heute", inflation: "Inflation % / Jahr", presentValue: "Aktuell: heutige Kaufkraft", nominal: "Aktuell: nominal", goal: "Ziel", savePlan: "In Plan übernehmen", noPlanChanges: "Der Plan stimmt bereits überein — nichts zu speichern.", undo: "Rückgängig", saveDialog: "Im Plan speichern", yearOne: "Jahr 1", fromYearTwo: "Ab Jahr 2", return: "Rendite", cancel: "Abbrechen",
  } : {
    aria: "Mô phỏng", adjust: "Điều chỉnh giả định", close: "Đóng", parameters: "Thông số", modeA: "Góp → Nhận", modeB: "Mục tiêu → Góp", modeC: "Góp → Khi nào", modeASub: "Số dư → Kết quả", modeBSub: "Số tiền → Mức góp", modeCSub: "Mức góp → Thời gian", badgeA: "Chế độ A · Giá trị cuối kỳ", badgeB: "Chế độ B · Mức góp/tháng", badgeC: "Chế độ C · Thời gian cần", targetBy: (amount: string, year: string) => `Mục tiêu ${amount} vào năm ${year}`, goalWithMonthly: (amount: string, monthly: string) => `Mục tiêu ${amount} với mức góp ${monthly}/tháng`, unavailable: "Chưa có mức góp khả thi", unavailableNote: "kiểm tra mục tiêu / lợi nhuận", targetUnreachable: "Chưa thể đạt mục tiêu trong 40 năm", afterYears: (years: number, monthly: string) => `sau ${years} năm · ${monthly}/tháng`, end: "Cuối kỳ", contributed: "Đã góp", gain: "Lãi / lỗ (danh nghĩa)", summary: "Tóm tắt kết quả mô phỏng", yearTable: "Bảng mô phỏng theo năm", chart: "Tăng trưởng danh mục", scenarioCompare: "So sánh kịch bản", scenarioEnd: "Giá trị cuối kỳ danh nghĩa", returnAssumption: "Giả định lợi suất", scenarioNote: "Các phép tính minh họa, không phải xác suất hay dự báo.", baseScenario: "Cơ sở", forecast: "Danh mục (dự báo)", monthly: "Góp mỗi tháng (EUR)", target: "Mục tiêu (EUR)", duration: "Thời hạn", years: "năm", want: "Muốn có (EUR)", inYear: "Vào năm", aboutYears: (years: number, monthly: string) => `Còn khoảng ${years} năm · cần ~${monthly}/tháng`, annualReturn: "Lợi nhuận / năm (%)", around: "khoảng", year: "Năm", forecastNav: "NAV dự báo", current: "Hiện tại", collapse: "Thu gọn", showAll: "Hiện tất cả các năm", disclaimer: "Ước tính — không phải tư vấn đầu tư", range: "Biên độ ± (%)", contributionGrowth: "Góp thay đổi theo năm", perYear: "% / năm", initialLump: "Khoản lớn ban đầu", startingBalance: "Số dư xuất phát", purchasingPower: "Sức mua hôm nay", inflation: "Lạm phát %/năm", presentValue: "Đang: giá hôm nay", nominal: "Đang: danh nghĩa", goal: "Mục tiêu", savePlan: "Lưu vào kế hoạch", noPlanChanges: "Kế hoạch đã khớp — không có gì để lưu.", undo: "Hoàn tác", saveDialog: "Lưu vào kế hoạch", yearOne: "Năm 1", fromYearTwo: "Từ năm 2", return: "Lợi nhuận", cancel: "Hủy",
  };
}

export type SimulationDemoShellProps = {
  locale: DisplayLocale;
  mode: Mode;
  setMode: (m: Mode) => void;
  planUnreachable: boolean;
  targetUnreachable: boolean;
  headlineValue: number;
  yearsForProject: number;
  monthlyForProject: number;
  headlineNote: string;
  startingBalanceWarning: string;
  primary: { out: ProjectOutput; pp: number } | undefined;
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
    locale, mode, setMode, planUnreachable, targetUnreachable, headlineValue, yearsForProject, monthlyForProject,
    headlineNote, startingBalanceWarning, primary, initialBalance, shownInterest, results, goalMarkers, band, baseRate,
    monthly, setMonthly, years, setYears, targetAmount, setTargetAmount, targetYear, setTargetYear,
    yearsB, requiredMonthlyBase, yearsC, rateInput, setRateInput, bandPctLabel, readOnly, goals,
    applyYearsFromGoal, advSummary, bandInput, setBandInput, growthOn, setGrowthOn, growthPct,
    setGrowthPct, lumpSum, setLumpSum, balanceOverride, setBalanceOverride, realBalance,
    inflationOn, setInflationOn, inflationPct, setInflationPct, showPP, setShowPP, yearRows, baseMap, goalYearSet, goalNameByYear,
    nowY, showAllYears, setShowAllYears, openSaveConfirm, matchMsg, undoVisible, undoSnap, undoPersist,
    saveOpen, setSaveOpen, y1Diff, y2Diff, retDiff, writeY1, setWriteY1, writeY2, setWriteY2,
    writeReturn, setWriteReturn, monthlyForProjectRounded, baseRateNew, selectedCount, saveLabel,
    confirmPersist,
  } = p;
  const text = simulationCopy(locale);
  const [paramsOpen, setParamsOpen] = useState(false);

  return (
    <main className="demo-v10-screen sim-screen" aria-label={text.aria}>
      <div className="sim-wrap">
      <div className="mode-tabs" data-testid="simulation-mode-switch" role="group" aria-label={text.aria}>
        {(
          [
            ["A", text.modeA, text.modeASub],
            ["B", text.modeB, text.modeBSub],
            ["C", text.modeC, text.modeCSub],
          ] as const
        ).map(([id, label, sub]) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            className={"mtab" + (mode === id ? " on" : "")}
            onClick={() => setMode(id)}
          >
            {label}
            <small>{sub}</small>
          </button>
        ))}
      </div>

      <section key={mode} className="sim-headline">
        <span className="sim-mode-badge">{mode === "A" ? text.badgeA : mode === "B" ? text.badgeB : text.badgeC}</span>
        {planUnreachable ? (
          <>
            <div className="sh-big sim-hero-amount" data-testid="simulation-hero-amount">—</div>
            <div className="sh-sub">{text.unavailable}</div>
            <div className="sh-note">{text.unavailableNote}</div>
          </>
        ) : (
          <>
            <div className="sh-big sim-hero-amount" data-testid="simulation-hero-amount">{mode === "C" ? `${headlineValue.toLocaleString(locale === "de" ? "de-DE" : "vi-VN", { maximumFractionDigits: 0 })} ${text.years}` : formatMoneyRounded(headlineValue, locale)}</div>
            <div className="sh-sub">
              {mode === "B"
                ? text.targetBy(formatMoneyRounded(Number(targetAmount) || 0, locale), targetYear)
                : mode === "C"
                  ? text.goalWithMonthly(formatMoneyRounded(Number(targetAmount) || 0, locale), formatMoneyRounded(monthlyForProject, locale))
                  : text.afterYears(yearsForProject, formatMoneyRounded(monthlyForProject, locale))}
            </div>
            <div className="sh-note">{headlineNote}</div>
          </>
        )}
      <div className="summary-strip" role="group" aria-label={text.summary}>
        <span><strong>{primary && !planUnreachable ? formatMoneyRounded(primary.out.contributed + initialBalance, locale) : "—"}</strong> {text.contributed}</span>
        <span><strong className={shownInterest < -0.005 ? "loss" : "gain"}>{primary && !planUnreachable ? formatMoneyRounded(shownInterest, locale) : "—"}</strong> {text.gain}</span>
      </div>
        <div className="sim-hero-actions">
          <button type="button" className="sim-parameters-trigger" aria-haspopup="dialog" onClick={() => setParamsOpen(true)}>
            <span aria-hidden="true">☷</span><span>{text.adjust}</span><span className="sim-trigger-chevron" aria-hidden="true">↗</span>
          </button>
        </div>
      </section>

      {targetUnreachable ? <p className="sh-note sim-valuation-warning" role="status">{text.targetUnreachable}</p> : null}
      {startingBalanceWarning ? <p className="sh-note sim-valuation-warning" role="status">{startingBalanceWarning}</p> : null}

      <section className="gl sim-chart-card" data-testid="simulation-growth-chart">
        <div className="sim-chart-heading">
          <div className="sim-chart-title">{text.chart}</div>
          <span className="sim-live-tag">{text.baseScenario}</span>
        </div>
        <SimulationDemoChart
          results={results}
          markers={goalMarkers}
          years={yearsForProject}
          band={band}
          baseRate={baseRate}
          locale={locale}
        />
        <div className="chart-legend">
          <span><i style={{ background: "var(--primary-600)" }} /> {text.contributed}</span>
          <span><i style={{ background: "var(--success-600)" }} /> {text.forecast}</span>
        </div>
      </section>

      <section className="scenario-comparison" aria-labelledby="scenario-comparison-title">
        <div className="scenario-heading">
          <h2 id="scenario-comparison-title">{text.scenarioCompare}</h2>
          <p>{text.scenarioNote}</p>
        </div>
        <div className="scenario-chips" role="list" aria-label={text.scenarioCompare}>
          {results.map(({ sc, out }) => (
            <div key={sc.id} role="listitem" className={"scenario-chip scenario-chip-" + sc.id}>
              <span className="scenario-chip-name">
                <i className={"scenario-dot scenario-dot-" + sc.id} aria-hidden="true" />
                {sc.label}
              </span>
              <span className="scenario-chip-rate">
                {sc.rate.toLocaleString(locale === "de" ? "de-DE" : "vi-VN", { style: "percent", maximumFractionDigits: 1 })}
              </span>
              <strong className="scenario-chip-value">{formatMoneyRounded(out.terminal, locale)}</strong>
            </div>
          ))}
        </div>
      </section>

      <details className="gl sim-year-disclosure">
        <summary>{text.yearTable}</summary>
      <section className="yr-table" role="table" aria-label={text.yearTable}>
        <div className="yr-table-head" role="row">
          <span role="columnheader">{text.year}</span>
          <span role="columnheader">{text.forecastNav}</span>
          <span role="columnheader">{text.contributed}</span>
        </div>
        {yearRows.map((yi) => {
          const basePt = baseMap.get(yi);
          const isLast = yi === yearsForProject;
          const calYear = nowY + yi;
          return (
            <div
              key={yi}
              className="yr-row-item"
              role="row"
              style={{ fontWeight: isLast ? 700 : undefined }}
            >
              <span role="cell">
                {yi === 0 ? text.current : String(calYear)}
                {goalYearSet.has(yi) ? (
                  <small style={{ marginLeft: 4, color: "var(--primary-600)" }}>
                    {goalNameByYear.get(yi)}
                  </small>
                ) : null}
              </span>
              <span role="cell" style={{ textAlign: "center" }}>
                {basePt ? formatMoneyRounded(basePt.total, locale) : "—"}
              </span>
              <span role="cell" style={{ textAlign: "right" }}>
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
      </details>

      <div className="sim-note">ⓘ {text.disclaimer}</div>

      {paramsOpen ? (
        <div className="sim-sheet-backdrop">
          <section className="sim-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sim-parameters-title">
            <div className="sheet-handle" aria-hidden="true" />
            <header className="sim-sheet-header">
              <div>
                <p className="sim-sheet-eyebrow">{text.parameters}</p>
                <h2 id="sim-parameters-title">{text.adjust}</h2>
              </div>
              <button type="button" className="sim-sheet-close" aria-label={text.close} onClick={() => setParamsOpen(false)}>×</button>
            </header>
      {(mode === "A" || mode === "C") && (
        <section className="gl sim-inputs">
          {mode === "A" && (
            <div className="inp-row">
              <label className="inp-lbl" htmlFor="sim-monthly-contribution">{text.monthly}</label>
              <input
                className="inp"
                id="sim-monthly-contribution"
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
                <label className="inp-lbl" htmlFor="sim-target-amount">{text.target}</label>
                <input
                  className="inp"
                  id="sim-target-amount"
                  type="number"
                  inputMode="decimal"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  disabled={readOnly}
                />
              </div>
              <div className="inp-row">
                <label className="inp-lbl" htmlFor="sim-monthly-contribution">{text.monthly}</label>
                <input
                  className="inp"
                  id="sim-monthly-contribution"
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
              <label className="yr-lbl" htmlFor="sim-duration">{text.duration}</label>
              <span className="yr-val">{years} {text.years}</span>
            </div>
            <input
              className="yr-slider"
              id="sim-duration"
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
            <label className="inp-lbl" htmlFor="sim-target-amount">{text.want}</label>
            <input
              className="inp"
              id="sim-target-amount"
              type="number"
              inputMode="decimal"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              disabled={readOnly}
            />
          </div>
          <div className="inp-row">
            <label className="inp-lbl" htmlFor="sim-target-year">{text.inYear}</label>
            <input
              className="inp"
              id="sim-target-year"
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
          <label className="inp-lbl" htmlFor="sim-annual-return">{text.annualReturn}</label>
          <input
            className="inp"
            id="sim-annual-return"
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

      <details className="gl">
        <summary>
          {advSummary}
        </summary>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="inp-row">
            <label className="inp-lbl" htmlFor="sim-return-band">{text.range}</label>
            <input className="inp" id="sim-return-band" value={bandInput} onChange={(e) => setBandInput(e.target.value)} disabled={readOnly} />
          </div>
          <label className="inp-row">
            <span className="inp-lbl">{text.contributionGrowth}</span>
            <input id="sim-growth-enabled" type="checkbox" checked={growthOn} onChange={(e) => setGrowthOn(e.target.checked)} disabled={readOnly} />
          </label>
          {growthOn ? (
            <div className="inp-row">
              <label className="inp-lbl" htmlFor="sim-growth-percent">{text.perYear}</label>
              <input className="inp" id="sim-growth-percent" value={growthPct} onChange={(e) => setGrowthPct(e.target.value)} disabled={readOnly} />
            </div>
          ) : null}
          <div className="inp-row">
            <label className="inp-lbl" htmlFor="sim-initial-lump-sum">{text.initialLump}</label>
            <input className="inp" id="sim-initial-lump-sum" value={lumpSum} onChange={(e) => setLumpSum(e.target.value)} disabled={readOnly} />
          </div>
          <div className="inp-row">
            <label className="inp-lbl" htmlFor="sim-starting-balance">{text.startingBalance}</label>
            <input
              className="inp"
              id="sim-starting-balance"
              placeholder={String(Math.max(0, realBalance))}
              value={balanceOverride}
              onChange={(e) => setBalanceOverride(e.target.value)}
              disabled={readOnly}
            />
          </div>
          <label className="inp-row">
            <span className="inp-lbl">{text.purchasingPower}</span>
            <input id="sim-inflation-enabled" type="checkbox" checked={inflationOn} onChange={(e) => setInflationOn(e.target.checked)} disabled={readOnly} />
          </label>
          {inflationOn ? (
            <div className="inp-row">
              <label className="inp-lbl" htmlFor="sim-inflation-percent">{text.inflation}</label>
              <input className="inp" id="sim-inflation-percent" value={inflationPct} onChange={(e) => setInflationPct(e.target.value)} disabled={readOnly} />
            </div>
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
        </div>
      </details>

          </section>
        </div>
      ) : null}

      {(y1Diff || y2Diff || retDiff) ? (
        <button
          type="button"
          className="sim-save-cta"
          disabled={planUnreachable || readOnly}
          onClick={openSaveConfirm}
        >
          {text.savePlan}
        </button>
      ) : null}

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
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="sim-save-dialog-title">
          <div className="modal">
            <div className="sheet-handle" aria-hidden />
            <h2 id="sim-save-dialog-title">{text.saveDialog}</h2>
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
            <button type="button" data-dialog-close className="secondary" onClick={() => setSaveOpen(false)}>
              {text.cancel}
            </button>
          </div>
        </div>
      ) : null}
      </div>
    </main>
  );
}
