import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyTransaction,
  emptyPortfolio,
  parseDate,
  parseDecimal,
  round2,
} from "../lib/calc";
import { getSettings, listGoals, listTransactions, saveSettings } from "../lib/db";
import {
  DEFAULT_TER,
  MAX_YEARS,
  clamp,
  estimateGermanExitTax,
  findMonthlyForTarget,
  findYearsForTarget,
  projectEnd,
  purchasingPower,
} from "../lib/simulation/engine";
import type { Mode, ProjectOutput, Scenario, YearPoint } from "../lib/simulation/engine";
import type { AppSettings, Goal, Transaction } from "../lib/types";
import { useRecoveryReadOnly } from "../lib/recoveryReadOnly";
import { useLocale } from "../lib/locale";
import { formatDisplayMoney } from "../ui/localeFormatting";
import SimulationDemoShell from "../components/demo-v10/SimulationDemoShell";
import "../styles/demo-v10-simulation.css";

type UndoSnap = {
  values: Partial<Pick<AppSettings, "contributionY1" | "contributionY2" | "vwceReturn">>;
  message: string;
};

const UNDO_MS = 12_000;

function simulationPageCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    cautious: "Vorsichtig", base: "Basis", bull: "Günstig", setYearOne: (value: string) => `Jahr 1 wurde auf ${value} gesetzt`, setFromYearTwo: (value: string) => `Beitrag ab Jahr 2 wurde auf ${value} gesetzt`, setReturn: (value: string) => `VWCE-Rendite wurde auf ${value} gesetzt`, yearOne: (value: string) => `Jahr 1 = ${value}`, fromYearTwo: (value: string) => `Beitrag ab Jahr 2 = ${value}`, return: (value: string) => `VWCE-Rendite = ${value}`, savedChanges: (count: number) => `${count} Änderungen wurden gespeichert`, noSelection: "Keine Auswahl", saveOne: "1 Änderung speichern", saveMany: (count: number) => `${count} Änderungen speichern`, afterTax: "nach Steuern", presentValue: "heutige Kaufkraft", beforeTaxNominal: "vor Steuern · nominal", range: "Bandbreite", inflation: (value: string) => `Inflation ${value}%`, tax: "mit Steuern", noTax: "ohne Steuern", contributionGrowth: (value: string) => `Beitrag ${value}% / Jahr`, advanced: (parts: string) => `Erweiterte Optionen · ${parts}`,
  } : {
    cautious: "Thận trọng", base: "Cơ sở", bull: "Thuận lợi", setYearOne: (value: string) => `Đã đặt Góp năm 1 = ${value}`, setFromYearTwo: (value: string) => `Đã đặt Góp từ năm 2 = ${value}`, setReturn: (value: string) => `Đã đặt Lợi nhuận VWCE = ${value}`, yearOne: (value: string) => `Góp năm 1 = ${value}`, fromYearTwo: (value: string) => `Góp từ năm 2 = ${value}`, return: (value: string) => `Lợi nhuận VWCE = ${value}`, savedChanges: (count: number) => `Đã lưu ${count} thay đổi`, noSelection: "Chưa chọn gì", saveOne: "Lưu 1 thay đổi", saveMany: (count: number) => `Lưu ${count} thay đổi`, afterTax: "sau thuế", presentValue: "giá hôm nay", beforeTaxNominal: "trước thuế · danh nghĩa", range: "biên độ", inflation: (value: string) => `lạm phát ${value}%`, tax: "có thuế", noTax: "không thuế", contributionGrowth: (value: string) => `góp ${value}%/năm`, advanced: (parts: string) => `Tùy chọn nâng cao · ${parts}`,
  };
}

export default function Simulation() {
  const { locale } = useLocale();
  const text = useMemo(() => simulationPageCopy(locale), [locale]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { readOnly, showBlocked } = useRecoveryReadOnly();

  const [mode, setMode] = useState<Mode>("A");
  const [years, setYears] = useState(15);
  const [monthly, setMonthly] = useState("200");
  const [growthOn, setGrowthOn] = useState(false);
  const [growthPct, setGrowthPct] = useState("2");
  const [lumpSum, setLumpSum] = useState("0");
  const [balanceOverride, setBalanceOverride] = useState("");
  const [rateInput, setRateInput] = useState("6,5");
  const [bandInput, setBandInput] = useState("2");
  const [inflationOn, setInflationOn] = useState(true);
  const [inflationPct, setInflationPct] = useState("2");
  const [taxOn, setTaxOn] = useState(true);
  const [showAfterTax, setShowAfterTax] = useState(true);
  const [showPP, setShowPP] = useState(false);
  const [showAllYears, setShowAllYears] = useState(false);
  const [targetAmount, setTargetAmount] = useState("50000");
  const [targetYear, setTargetYear] = useState(String(new Date().getFullYear() + 15));

  const [saveOpen, setSaveOpen] = useState(false);
  const [writeY1, setWriteY1] = useState(true);
  const [writeY2, setWriteY2] = useState(false);
  const [writeReturn, setWriteReturn] = useState(false);
  const [undoSnap, setUndoSnap] = useState<UndoSnap | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const [matchMsg, setMatchMsg] = useState(false);
  const undoTimerRef = useRef<number | null>(null);
  const matchTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current != null) window.clearTimeout(undoTimerRef.current);
      if (matchTimerRef.current != null) window.clearTimeout(matchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setSettings(s);
      setGoals(await listGoals());
      setTxs(await listTransactions());
      if (s.contributionY1 > 0) setMonthly(String(s.contributionY1));
      if (s.inflationRate > 0) setInflationPct(String(round2(s.inflationRate * 100)));
      if (s.endDate) {
        const end = parseDate(s.endDate);
        const now = new Date();
        const y = Math.max(1, Math.min(MAX_YEARS, end.getFullYear() - now.getFullYear()));
        setYears(y);
        setTargetYear(String(end.getFullYear()));
      }
      setLoading(false);
    })();
  }, []);

  const portfolio = useMemo(() => {
    let p = emptyPortfolio();
    for (const t of [...txs].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      p = applyTransaction(p, t);
    }
    return p;
  }, [txs]);

  const realBalance = useMemo(() => {
    const price = settings?.latestVwcePrice ?? 0;
    const cash = settings?.trackInAppCash ? portfolio.cashBalance : Math.max(0, portfolio.cashBalance);
    return round2(portfolio.vwceQty * price + cash);
  }, [portfolio, settings]);

  const realCostBasis = useMemo(
    () => round2(Math.max(0, portfolio.vwceCostBasis) + Math.max(0, portfolio.cashBalance)),
    [portfolio],
  );

  const initialBalance = useMemo(() => {
    if (balanceOverride.trim() !== "") return Math.max(0, parseDecimal(balanceOverride));
    return Math.max(0, realBalance);
  }, [balanceOverride, realBalance]);

  const initialCostBasis = balanceOverride.trim() !== "" ? initialBalance : realCostBasis;

  const monthlyN = Math.max(0, parseDecimal(monthly));
  const growthN = growthOn ? Math.max(-0.2, Math.min(0.2, parseDecimal(growthPct) / 100)) : 0;
  const lumpN = Math.max(0, parseDecimal(lumpSum));
  const inflationN = inflationOn ? Math.max(0, parseDecimal(inflationPct) / 100) : 0;
  const targetN = Math.max(0, parseDecimal(targetAmount));
  const ter = taxOn ? DEFAULT_TER : 0;

  const baseRate = clamp(parseDecimal(rateInput) / 100, 0, 0.5);
  const band = clamp(parseDecimal(bandInput) / 100, 0, 0.1);
  const scenarios = useMemo(
    () => [
      { id: "cautious", label: text.cautious, rate: Math.max(0, baseRate - band) },
      { id: "base", label: text.base, rate: baseRate },
      { id: "bull", label: text.bull, rate: baseRate + band },
    ],
    [baseRate, band, text],
  );

  const yearsB = useMemo(() => {
    const ty = Number(targetYear) || new Date().getFullYear();
    return Math.max(1, Math.min(MAX_YEARS, ty - new Date().getFullYear()));
  }, [targetYear]);

  const effectiveYears = mode === "B" ? yearsB : years;

  const baseCommon = useMemo(
    () => ({ initialBalance, lumpSum: lumpN, annualContributionGrowth: growthN, ter }),
    [initialBalance, lumpN, growthN, ter],
  );

  const requiredMonthlyBase = useMemo(() => {
    if (mode !== "B") return monthlyN;
    const br = scenarios.find((s) => s.id === "base")?.rate ?? 0.065;
    return findMonthlyForTarget(targetN, { ...baseCommon, years: yearsB, annualReturn: br });
  }, [mode, targetN, baseCommon, yearsB, scenarios, monthlyN]);

  const monthlyForProject = mode === "B" ? Math.max(0, requiredMonthlyBase) : monthlyN;
  const planUnreachable = mode === "B" && requiredMonthlyBase < 0;

  const yearsC = useMemo(() => {
    if (mode !== "C") return { years: effectiveYears, reached: true };
    const br = scenarios.find((s) => s.id === "base")?.rate ?? 0.065;
    return findYearsForTarget(targetN, {
      ...baseCommon,
      monthlyContribution: monthlyN,
      annualReturn: br,
    });
  }, [mode, targetN, baseCommon, monthlyN, scenarios, effectiveYears]);

  const yearsForProject = mode === "C" ? yearsC.years : effectiveYears;

  const results = useMemo(() => {
    return scenarios.map((sc) => {
      const out = projectEnd({
        ...baseCommon,
        years: yearsForProject,
        monthlyContribution: monthlyForProject,
        annualReturn: sc.rate,
      });
      const tax = taxOn
        ? estimateGermanExitTax(out.terminal, out.contributed, initialCostBasis)
        : { tax: 0, afterTax: out.terminal };
      const pp = inflationOn ? purchasingPower(out.terminal, inflationN, yearsForProject) : out.terminal;
      const ppAfter = inflationOn
        ? purchasingPower(tax.afterTax, inflationN, yearsForProject)
        : tax.afterTax;
      return { sc, out, tax, pp, ppAfter };
    });
  }, [
    scenarios,
    baseCommon,
    yearsForProject,
    monthlyForProject,
    taxOn,
    inflationOn,
    inflationN,
    initialCostBasis,
  ]);

  const primary = results.find((r) => r.sc.id === "base") ?? results[1] ?? results[0];

  const goalMarkers = useMemo(() => {
    const nowY = new Date().getFullYear();
    return goals
      .map((g) => {
        const due = parseDate(g.dueDate);
        const yi = due.getFullYear() - nowY;
        return { name: g.name, yearIndex: yi, amount: g.amount };
      })
      .filter((m) => m.yearIndex >= 0 && m.yearIndex <= MAX_YEARS);
  }, [goals]);

  function applyYearsFromGoal(g: Goal) {
    const due = parseDate(g.dueDate);
    const y = Math.max(1, Math.min(MAX_YEARS, due.getFullYear() - new Date().getFullYear()));
    setYears(y);
    setTargetYear(String(due.getFullYear()));
    if (g.amount > 0) setTargetAmount(String(g.amount));
  }

  function moneyEq(a: number, b: number): boolean {
    return round2(a) === round2(b);
  }

  function rateEq(a: number, b: number): boolean {
    return Math.abs(a - b) < 1e-4;
  }

  async function applyPersist(
    partial: Partial<Pick<AppSettings, "contributionY1" | "contributionY2" | "vwceReturn">>,
    message: string,
  ) {
    if (readOnly) {
      showBlocked();
      return;
    }
    const keys = Object.keys(partial) as (keyof typeof partial)[];
    if (keys.length === 0) return;

    const current = settings ?? (await getSettings());
    const snapValues: UndoSnap["values"] = {};
    for (const k of keys) {
      if (k === "contributionY1") snapValues.contributionY1 = current.contributionY1;
      if (k === "contributionY2") snapValues.contributionY2 = current.contributionY2;
      if (k === "vwceReturn") snapValues.vwceReturn = current.vwceReturn;
    }

    await saveSettings(partial);
    setSettings(await getSettings());
    setSaveOpen(false);

    setMatchMsg(false);
    if (matchTimerRef.current != null) {
      window.clearTimeout(matchTimerRef.current);
      matchTimerRef.current = null;
    }

    setUndoSnap({ values: snapValues, message });
    setUndoVisible(true);
    if (undoTimerRef.current != null) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => {
      setUndoVisible(false);
      setUndoSnap(null);
      undoTimerRef.current = null;
    }, UNDO_MS);
  }

  function openSaveConfirm() {
    if (readOnly) {
      showBlocked();
      return;
    }
    if (planUnreachable) return;

    const o1 = settings?.contributionY1 ?? 0;
    const o2 = settings?.contributionY2 ?? 0;
    const oR = settings?.vwceReturn ?? 0;
    const nR = scenarios.find((s) => s.id === "base")?.rate ?? 0.065;
    const monthlyR = round2(monthlyForProject);
    const y1Diff = !moneyEq(o1, monthlyR);
    const y2Diff = !moneyEq(o2, monthlyR);
    const retDiff = !rateEq(oR, nR);
    const diffCount = (y1Diff ? 1 : 0) + (y2Diff ? 1 : 0) + (retDiff ? 1 : 0);

    if (diffCount === 0) {
      setUndoVisible(false);
      setUndoSnap(null);
      if (undoTimerRef.current != null) {
        window.clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
      setMatchMsg(true);
      if (matchTimerRef.current != null) window.clearTimeout(matchTimerRef.current);
      matchTimerRef.current = window.setTimeout(() => {
        setMatchMsg(false);
        matchTimerRef.current = null;
      }, 4000);
      return;
    }

    if (diffCount === 1) {
      if (y1Diff) {
        void applyPersist({ contributionY1: monthlyR }, text.setYearOne(formatDisplayMoney(monthlyR, locale)));
      } else if (y2Diff) {
        void applyPersist({ contributionY2: monthlyR }, text.setFromYearTwo(formatDisplayMoney(monthlyR, locale)));
      } else {
        void applyPersist({ vwceReturn: nR }, text.setReturn(`${(nR * 100).toFixed(2)}%`));
      }
      return;
    }

    setWriteY1(y1Diff);
    setWriteY2(false);
    setWriteReturn(false);
    setSaveOpen(true);
  }

  async function confirmPersist() {
    if (readOnly) {
      showBlocked();
      return;
    }
    const current = settings ?? (await getSettings());
    const nR = scenarios.find((s) => s.id === "base")?.rate ?? 0.065;
    const monthlyR = round2(monthlyForProject);
    const y1D = !moneyEq(current.contributionY1, monthlyR);
    const y2D = !moneyEq(current.contributionY2, monthlyR);
    const retD = !rateEq(current.vwceReturn, nR);

    const partial: Partial<Pick<AppSettings, "contributionY1" | "contributionY2" | "vwceReturn">> = {};
    const parts: string[] = [];
    if (writeY1 && y1D) {
      partial.contributionY1 = monthlyR;
      parts.push(text.yearOne(formatDisplayMoney(monthlyR, locale)));
    }
    if (writeY2 && y2D) {
      partial.contributionY2 = monthlyR;
      parts.push(text.fromYearTwo(formatDisplayMoney(monthlyR, locale)));
    }
    if (writeReturn && retD) {
      partial.vwceReturn = nR;
      parts.push(text.return(`${(nR * 100).toFixed(2)}%`));
    }

    if (parts.length === 0) {
      setSaveOpen(false);
      return;
    }

    const message =
      parts.length === 1 ? parts[0] : text.savedChanges(parts.length);
    await applyPersist(partial, message);
  }

  async function undoPersist() {
    if (readOnly) {
      showBlocked();
      return;
    }
    if (!undoSnap) return;
    await saveSettings(undoSnap.values);
    setSettings(await getSettings());
    setUndoVisible(false);
    setUndoSnap(null);
    if (undoTimerRef.current != null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }

  const nowY = new Date().getFullYear();
  const baseMap = useMemo(() => {
    const base = results.find((r) => r.sc.id === "base");
    return new Map((base?.out.yearEnds ?? []).map((p) => [p.yearIndex, p]));
  }, [results]);
  const cautiousMap = useMemo(() => {
    const r = results.find((x) => x.sc.id === "cautious");
    return new Map((r?.out.yearEnds ?? []).map((p) => [p.yearIndex, p]));
  }, [results]);
  const bullMap = useMemo(() => {
    const r = results.find((x) => x.sc.id === "bull");
    return new Map((r?.out.yearEnds ?? []).map((p) => [p.yearIndex, p]));
  }, [results]);

  const goalYearSet = useMemo(() => {
    const s = new Set<number>();
    for (const m of goalMarkers) s.add(m.yearIndex);
    return s;
  }, [goalMarkers]);

  const goalNameByYear = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of goalMarkers) {
      const prev = m.get(g.yearIndex);
      m.set(g.yearIndex, prev ? `${prev}, ${g.name}` : g.name);
    }
    return m;
  }, [goalMarkers]);

  const yearRows = useMemo(() => {
    const milestones = new Set<number>([1, 3, 5, 10, 15, yearsForProject]);
    for (const yi of goalYearSet) milestones.add(yi);
    if (initialBalance > 0) milestones.add(0);
    const all: number[] = [];
    for (let yi = 0; yi <= yearsForProject; yi++) {
      if (yi === 0 && initialBalance <= 0) continue;
      if (showAllYears || milestones.has(yi)) all.push(yi);
    }
    return all;
  }, [yearsForProject, goalYearSet, initialBalance, showAllYears]);

  if (loading) {
    return <main className="demo-v10-screen" aria-busy="true" />;
  }

  const baseRateNew = scenarios.find((s) => s.id === "base")?.rate ?? 0.065;
  const oldY1 = settings?.contributionY1 ?? 0;
  const oldY2 = settings?.contributionY2 ?? 0;
  const oldVwce = settings?.vwceReturn ?? 0;
  const y1Diff = !moneyEq(oldY1, monthlyForProject);
  const y2Diff = !moneyEq(oldY2, monthlyForProject);
  const retDiff = !rateEq(oldVwce, baseRateNew);
  const selectedCount =
    (writeY1 && y1Diff ? 1 : 0) + (writeY2 && y2Diff ? 1 : 0) + (writeReturn && retDiff ? 1 : 0);
  const saveLabel =
    selectedCount === 0
      ? text.noSelection
      : selectedCount === 1
        ? text.saveOne
        : text.saveMany(selectedCount);

  const useTax = taxOn && showAfterTax;
  const usePP = inflationOn && showPP;
  let headlineValue = primary?.out.terminal ?? 0;
  if (primary) {
    if (useTax && usePP) headlineValue = primary.ppAfter;
    else if (useTax) headlineValue = primary.tax.afterTax;
    else if (usePP) headlineValue = primary.pp;
    else headlineValue = primary.out.terminal;
  }
  const headlineNoteParts: string[] = [];
  if (useTax) headlineNoteParts.push(text.afterTax);
  if (usePP) headlineNoteParts.push(text.presentValue);
  const headlineNote =
    headlineNoteParts.length > 0 ? headlineNoteParts.join(" · ") : text.beforeTaxNominal;

  const shownInterest = primary
    ? Math.max(0, headlineValue - primary.out.contributed - initialBalance)
    : 0;

  const cautiousRate = scenarios.find((s) => s.id === "cautious")?.rate ?? baseRate;
  const bullRate = scenarios.find((s) => s.id === "bull")?.rate ?? baseRate;
  const bandPctLabel = `${round2(cautiousRate * 100).toLocaleString(locale === "de" ? "de-DE" : "vi-VN")} % – ${round2(bullRate * 100).toLocaleString(locale === "de" ? "de-DE" : "vi-VN")} %`;

  const advParts: string[] = [];
  advParts.push(`${text.range} ±${round2(band * 100).toLocaleString(locale === "de" ? "de-DE" : "vi-VN")}`);
  if (inflationOn) advParts.push(text.inflation(inflationPct));
  if (taxOn) advParts.push(text.tax);
  else advParts.push(text.noTax);
  if (growthOn) advParts.push(text.contributionGrowth(growthPct));
  const advSummary = text.advanced(advParts.join(" · "));

  return (
    <SimulationDemoShell
      locale={locale}
      mode={mode}
      setMode={setMode}
      planUnreachable={planUnreachable}
      headlineValue={headlineValue}
      yearsForProject={yearsForProject}
      monthlyForProject={monthlyForProject}
      headlineNote={headlineNote}
      primary={primary}
      initialBalance={initialBalance}
      shownInterest={shownInterest}
      results={results}
      goalMarkers={goalMarkers}
      band={band}
      baseRate={baseRate}
      monthly={monthly}
      setMonthly={setMonthly}
      years={years}
      setYears={setYears}
      targetAmount={targetAmount}
      setTargetAmount={setTargetAmount}
      targetYear={targetYear}
      setTargetYear={setTargetYear}
      yearsB={yearsB}
      requiredMonthlyBase={requiredMonthlyBase}
      yearsC={yearsC}
      rateInput={rateInput}
      setRateInput={setRateInput}
      bandPctLabel={bandPctLabel}
      readOnly={readOnly}
      goals={goals}
      applyYearsFromGoal={applyYearsFromGoal}
      advSummary={advSummary}
      bandInput={bandInput}
      setBandInput={setBandInput}
      growthOn={growthOn}
      setGrowthOn={setGrowthOn}
      growthPct={growthPct}
      setGrowthPct={setGrowthPct}
      lumpSum={lumpSum}
      setLumpSum={setLumpSum}
      balanceOverride={balanceOverride}
      setBalanceOverride={setBalanceOverride}
      realBalance={realBalance}
      inflationOn={inflationOn}
      setInflationOn={setInflationOn}
      inflationPct={inflationPct}
      setInflationPct={setInflationPct}
      taxOn={taxOn}
      setTaxOn={setTaxOn}
      showAfterTax={showAfterTax}
      setShowAfterTax={setShowAfterTax}
      showPP={showPP}
      setShowPP={setShowPP}
      yearRows={yearRows}
      baseMap={baseMap}
      cautiousMap={cautiousMap}
      bullMap={bullMap}
      goalYearSet={goalYearSet}
      goalNameByYear={goalNameByYear}
      nowY={nowY}
      showAllYears={showAllYears}
      setShowAllYears={setShowAllYears}
      openSaveConfirm={openSaveConfirm}
      matchMsg={matchMsg}
      undoVisible={undoVisible}
      undoSnap={undoSnap}
      undoPersist={() => void undoPersist()}
      saveOpen={saveOpen}
      setSaveOpen={setSaveOpen}
      y1Diff={y1Diff}
      y2Diff={y2Diff}
      retDiff={retDiff}
      writeY1={writeY1}
      setWriteY1={setWriteY1}
      writeY2={writeY2}
      setWriteY2={setWriteY2}
      writeReturn={writeReturn}
      setWriteReturn={setWriteReturn}
      monthlyForProjectRounded={round2(monthlyForProject)}
      oldY1={oldY1}
      oldY2={oldY2}
      oldVwce={oldVwce}
      baseRateNew={baseRateNew}
      selectedCount={selectedCount}
      saveLabel={saveLabel}
      confirmPersist={() => void confirmPersist()}
      round2={round2}
    />
  );
}
