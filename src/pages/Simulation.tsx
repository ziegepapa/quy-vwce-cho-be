import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyTransaction,
  emptyPortfolio,
  formatMoney,
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

/**
 * Mô phỏng v2 — ba chế độ, một hàm tính cuối kỳ chung.
 *
 * A: góp X/tháng → sau N năm được bao nhiêu
 * B: muốn Y vào năm Z → phải góp bao nhiêu (chặt nhị phân trên A)
 * C: góp X/tháng → bao giờ đủ Y (chặt nhị phân trên A)
 *
 * Phần toán đã tách sang src/lib/simulation/engine.ts và có 16 phép thử riêng.
 * Tệp này chỉ còn giao diện.
 */

/** Chỉ các khóa đã ghi — hoàn tác không đụng trường khác. */
type UndoSnap = {
  values: Partial<Pick<AppSettings, "contributionY1" | "contributionY2" | "vwceReturn">>;
  message: string;
};

const UNDO_MS = 12_000;

/** Hiển thị tròn euro, không thập phân (UI). */
function formatMoneyRounded(n: number): string {
  const v = Math.round(n);
  const abs = Math.abs(v);
  const s = abs.toLocaleString("de-DE", { maximumFractionDigits: 0 });
  return (v < 0 ? "\u2212" : "") + s + " \u20ac";
}

export default function Simulation() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

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
        const y = Math.max(
          1,
          Math.min(MAX_YEARS, end.getFullYear() - now.getFullYear()),
        );
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
    // When trackInAppCash is false (securities-first), mirror the hero formula:
    // totalDisplay = securities + max(cash, 0). A negative cash balance the owner
    // never intended to track should not drag down a 20-year projection.
    const cash = settings?.trackInAppCash
      ? portfolio.cashBalance
      : Math.max(0, portfolio.cashBalance);
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

  const initialCostBasis =
    balanceOverride.trim() !== "" ? initialBalance : realCostBasis;

  const monthlyN = Math.max(0, parseDecimal(monthly));
  const growthN = growthOn
    ? Math.max(-0.2, Math.min(0.2, parseDecimal(growthPct) / 100))
    : 0;
  const lumpN = Math.max(0, parseDecimal(lumpSum));
  const inflationN = inflationOn ? Math.max(0, parseDecimal(inflationPct) / 100) : 0;
  const targetN = Math.max(0, parseDecimal(targetAmount));
  const ter = taxOn ? DEFAULT_TER : 0;

  const baseRate = clamp(parseDecimal(rateInput) / 100, 0, 0.5);
  const band = clamp(parseDecimal(bandInput) / 100, 0, 0.1);
  const scenarios = useMemo(
    () => [
      { id: "cautious", label: "Th\u1eadn tr\u1ecdng", rate: Math.max(0, baseRate - band) },
      { id: "base", label: "C\u01a1 s\u1edf", rate: baseRate },
      { id: "bull", label: "Thu\u1eadn l\u1ee3i", rate: baseRate + band },
    ],
    [baseRate, band],
  );

  const yearsB = useMemo(() => {
    const ty = Number(targetYear) || new Date().getFullYear();
    return Math.max(1, Math.min(MAX_YEARS, ty - new Date().getFullYear()));
  }, [targetYear]);

  const effectiveYears = mode === "B" ? yearsB : years;

  const baseCommon = useMemo(
    () => ({
      initialBalance,
      lumpSum: lumpN,
      annualContributionGrowth: growthN,
      ter,
    }),
    [initialBalance, lumpN, growthN, ter],
  );

  const requiredMonthlyBase = useMemo(() => {
    if (mode !== "B") return monthlyN;
    const br = scenarios.find((s) => s.id === "base")?.rate ?? 0.065;
    return findMonthlyForTarget(targetN, {
      ...baseCommon,
      years: yearsB,
      annualReturn: br,
    });
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
      const pp = inflationOn
        ? purchasingPower(out.terminal, inflationN, yearsForProject)
        : out.terminal;
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
        void applyPersist(
          { contributionY1: monthlyR },
          `\u0110\u00e3 \u0111\u1eb7t G\u00f3p n\u0103m 1 = ${formatMoney(monthlyR)}`,
        );
      } else if (y2Diff) {
        void applyPersist(
          { contributionY2: monthlyR },
          `\u0110\u00e3 \u0111\u1eb7t G\u00f3p t\u1eeb n\u0103m 2 = ${formatMoney(monthlyR)}`,
        );
      } else {
        void applyPersist(
          { vwceReturn: nR },
          `\u0110\u00e3 \u0111\u1eb7t L\u1ee3i nhu\u1eadn VWCE = ${(nR * 100).toFixed(2)}%`,
        );
      }
      return;
    }

    setWriteY1(y1Diff);
    setWriteY2(false);
    setWriteReturn(false);
    setSaveOpen(true);
  }

  async function confirmPersist() {
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
      parts.push(`G\u00f3p n\u0103m 1 = ${formatMoney(monthlyR)}`);
    }
    if (writeY2 && y2D) {
      partial.contributionY2 = monthlyR;
      parts.push(`G\u00f3p t\u1eeb n\u0103m 2 = ${formatMoney(monthlyR)}`);
    }
    if (writeReturn && retD) {
      partial.vwceReturn = nR;
      parts.push(`L\u1ee3i nhu\u1eadn VWCE = ${(nR * 100).toFixed(2)}%`);
    }

    if (parts.length === 0) {
      setSaveOpen(false);
      return;
    }

    const message =
      parts.length === 1
        ? `\u0110\u00e3 \u0111\u1eb7t ${parts[0]}`
        : `\u0110\u00e3 l\u01b0u ${parts.length} thay \u0111\u1ed5i`;
    await applyPersist(partial, message);
  }

  async function undoPersist() {
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
    return <p className="muted">\u0110ang t\u1ea3i\u2026</p>;
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
      ? "Ch\u01b0a ch\u1ecdn g\u00ec"
      : selectedCount === 1
        ? "L\u01b0u 1 thay \u0111\u1ed5i"
        : `L\u01b0u ${selectedCount} thay \u0111\u1ed5i`;

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
  if (useTax) headlineNoteParts.push("sau thu\u1ebf");
  if (usePP) headlineNoteParts.push("gi\u00e1 h\u00f4m nay");
  const headlineNote =
    headlineNoteParts.length > 0 ? headlineNoteParts.join(" \u00b7 ") : "tr\u01b0\u1edbc thu\u1ebf \u00b7 danh ngh\u0129a";

  // L3: lãi suy từ số đang hiện — ba ô cộng khớp
  const shownInterest = primary
    ? Math.max(0, headlineValue - primary.out.contributed - initialBalance)
    : 0;

  const cautiousRate = scenarios.find((s) => s.id === "cautious")?.rate ?? baseRate;
  const bullRate = scenarios.find((s) => s.id === "bull")?.rate ?? baseRate;
  const bandPctLabel = `${round2(cautiousRate * 100).toLocaleString("de-DE")} % \u2013 ${round2(bullRate * 100).toLocaleString("de-DE")} %`;

  const advParts: string[] = [];
  advParts.push(`bi\u00ean \u0111\u1ed9 \u00b1${round2(band * 100).toLocaleString("de-DE")}`);
  if (inflationOn) advParts.push(`l\u1ea1m ph\u00e1t ${inflationPct}%`);
  if (taxOn) advParts.push("c\u00f3 thu\u1ebf");
  else advParts.push("kh\u00f4ng thu\u1ebf");
  if (growthOn) advParts.push(`g\u00f3p ${growthPct}%/n\u0103m`);
  const advSummary = `T\u00f9y ch\u1ecdn n\u00e2ng cao \u00b7 ${advParts.join(" \u00b7 ")}`;

  return (
    <div className="stack" style={{ gap: 16, paddingBottom: 96 }}>
      <div
        role="tablist"
        aria-label="Ch\u1ebf \u0111\u1ed9 m\u00f4 ph\u1ecfng"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 6,
          background: "var(--surface-2, rgba(16,24,40,.04))",
          borderRadius: 12,
          padding: 4,
        }}
      >
        {(
          [
            ["A", "G\u00f3p \u2192 nh\u1eadn"],
            ["B", "Mu\u1ed1n \u2192 g\u00f3p"],
            ["C", "G\u00f3p \u2192 khi n\u00e0o"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            className={mode === id ? "btn" : "secondary"}
            style={{ minHeight: 44, fontSize: 13, padding: "8px 4px" }}
            onClick={() => setMode(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          background: "var(--bg, rgba(255,255,255,.82))",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          padding: "10px 0 12px",
          marginBottom: 4,
        }}
      >
        {planUnreachable ? (
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>
            Ch\u01b0a c\u00f3 m\u1ee9c g\u00f3p kh\u1ea3 thi cho m\u1ee5c ti\u00eau n\u00e0y.
          </p>
        ) : (
          <>
            <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
              {formatMoneyRounded(headlineValue)}
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              sau {yearsForProject} n\u0103m \u00b7 {formatMoneyRounded(monthlyForProject)}/th\u00e1ng
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {headlineNote}
            </div>
          </>
        )}
      </div>

      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        {mode === "A" && "G\u00f3p c\u1ed1 \u0111\u1ecbnh m\u1ed7i th\u00e1ng \u2014 xem t\u00e0i s\u1ea3n sau N n\u0103m."}
        {mode === "B" && "Nh\u1eadp m\u1ee5c ti\u00eau v\u00e0 n\u0103m \u2014 m\u00e1y t\u00ednh s\u1ed1 c\u1ea7n g\u00f3p m\u1ed7i th\u00e1ng."}
        {mode === "C" && "G\u00f3p c\u1ed1 \u0111\u1ecbnh \u2014 m\u00e1y t\u00ednh bao l\u00e2u \u0111\u1ec3 \u0111\u1ee7 m\u1ee5c ti\u00eau (t\u1ed1i \u0111a 40 n\u0103m)."}
      </p>

      {(mode === "A" || mode === "C") && (
        <div className="card">
          <div className="field">
            <label htmlFor="sim-years">
              Th\u1eddi h\u1ea1n: <strong>{years} n\u0103m</strong>
            </label>
            <input
              id="sim-years"
              type="range"
              min={1}
              max={MAX_YEARS}
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              style={{ width: "100%", minHeight: 44 }}
            />
          </div>
          {goals.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                \u0110\u1ebfn ng\u00e0y m\u1ee5c ti\u00eau
              </span>
              {goals.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="secondary"
                  style={{ minHeight: 44, textAlign: "left" }}
                  onClick={() => applyYearsFromGoal(g)}
                >
                  {g.name} \u00b7 {g.dueDate.slice(0, 4)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "B" && (
        <div className="card">
          <div className="field">
            <label htmlFor="sim-target">Mu\u1ed1n c\u00f3 (EUR)</label>
            <input
              id="sim-target"
              inputMode="decimal"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              style={{ minHeight: 44 }}
            />
          </div>
          <div className="field">
            <label htmlFor="sim-tyear">V\u00e0o n\u0103m</label>
            <input
              id="sim-tyear"
              inputMode="numeric"
              value={targetYear}
              onChange={(e) => setTargetYear(e.target.value)}
              style={{ minHeight: 44 }}
            />
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            C\u00f2n kho\u1ea3ng {yearsB} n\u0103m t\u1eeb hi\u1ec7n t\u1ea1i.
          </p>
          {goals.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {goals.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="secondary"
                  style={{ minHeight: 44, textAlign: "left" }}
                  onClick={() => applyYearsFromGoal(g)}
                >
                  D\u00f9ng m\u1ee5c ti\u00eau: {g.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "C" && (
        <div className="card">
          <div className="field">
            <label htmlFor="sim-target-c">M\u1ee5c ti\u00eau Y (EUR)</label>
            <input
              id="sim-target-c"
              inputMode="decimal"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              style={{ minHeight: 44 }}
            />
          </div>
        </div>
      )}

      <div className="card">
        {(mode === "A" || mode === "C") && (
          <div className="field">
            <label htmlFor="sim-monthly">G\u00f3p m\u1ed7i th\u00e1ng (EUR)</label>
            <input
              id="sim-monthly"
              inputMode="decimal"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
              style={{ minHeight: 44 }}
            />
          </div>
        )}
        {mode === "B" && requiredMonthlyBase < 0 && (
          <div className="banner" style={{ margin: "0 0 12px" }}>
            Kh\u00f4ng \u0111\u1ea1t \u0111\u01b0\u1ee3c m\u1ee5c ti\u00eau v\u1edbi m\u1ee9c gi\u1ea3m n\u00e0y.
          </div>
        )}
        {mode === "B" && requiredMonthlyBase >= 0 && (
          <p style={{ margin: "0 0 12px" }}>
            C\u1ea7n g\u00f3p kho\u1ea3ng{" "}
            <strong className="metric-value">{formatMoney(requiredMonthlyBase)}</strong>/th\u00e1ng
            (k\u1ecbch b\u1ea3n c\u01a1 s\u1edf).
          </p>
        )}

        <div className="field">
          <label htmlFor="sim-rate">L\u1ee3i nhu\u1eadn / n\u0103m (%)</label>
          <input
            id="sim-rate"
            inputMode="decimal"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            style={{ minHeight: 44 }}
          />
          {band > 0 && (
            <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
              kho\u1ea3ng {bandPctLabel}
            </p>
          )}
        </div>
      </div>

      <details className="card">
        <summary style={{ minHeight: 44, cursor: "pointer", fontSize: 14 }}>{advSummary}</summary>
        <div style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="sim-band">Bi\u00ean \u0111\u1ed9 dao \u0111\u1ed9ng (\u00b1 %)</label>
            <input
              id="sim-band"
              inputMode="decimal"
              value={bandInput}
              onChange={(e) => setBandInput(e.target.value)}
              style={{ minHeight: 44 }}
            />
          </div>

          <label className="row-between" style={{ minHeight: 44, alignItems: "center" }}>
            <span>G\u00f3p thay \u0111\u1ed5i theo n\u0103m</span>
            <input
              type="checkbox"
              checked={growthOn}
              onChange={(e) => setGrowthOn(e.target.checked)}
              style={{ width: 24, height: 24 }}
            />
          </label>
          {growthOn && (
            <div className="field">
              <label htmlFor="sim-growth">Thay \u0111\u1ed5i g\u00f3p m\u1ed7i n\u0103m (%)</label>
              <input
                id="sim-growth"
                inputMode="decimal"
                value={growthPct}
                onChange={(e) => setGrowthPct(e.target.value)}
                style={{ minHeight: 44 }}
              />
              <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
                S\u1ed1 \u00e2m = gi\u1ea3m d\u1ea7n. V\u00ed d\u1ee5: \u22125
              </p>
            </div>
          )}

          <div className="field">
            <label htmlFor="sim-lump">Kho\u1ea3n l\u1edbn ban \u0111\u1ea7u (EUR)</label>
            <input
              id="sim-lump"
              inputMode="decimal"
              value={lumpSum}
              onChange={(e) => setLumpSum(e.target.value)}
              style={{ minHeight: 44 }}
            />
          </div>

          <div className="field">
            <label htmlFor="sim-bal">
              S\u1ed1 d\u01b0 xu\u1ea5t ph\u00e1t \u2014 m\u1eb7c \u0111\u1ecbnh t\u1eeb danh m\u1ee5c ({formatMoney(Math.max(0, realBalance))})
            </label>
            <input
              id="sim-bal"
              inputMode="decimal"
              placeholder={String(Math.max(0, realBalance))}
              value={balanceOverride}
              onChange={(e) => setBalanceOverride(e.target.value)}
              style={{ minHeight: 44 }}
            />
            {realBalance < 0 && (
              <p style={{ fontSize: 12, color: "#c47a2c", margin: "4px 0 0" }}>
                Danh m\u1ee5c \u0111ang \u00e2m \u2014 t\u1ea1m t\u00ednh t\u1eeb 0 \u20ac.
              </p>
            )}
          </div>

          <label className="row-between" style={{ minHeight: 44, alignItems: "center" }}>
            <span>Hi\u1ec7n theo s\u1ee9c mua h\u00f4m nay</span>
            <input
              type="checkbox"
              checked={inflationOn}
              onChange={(e) => setInflationOn(e.target.checked)}
              style={{ width: 24, height: 24 }}
            />
          </label>
          {inflationOn && (
            <div className="field">
              <label htmlFor="sim-inf">L\u1ea1m ph\u00e1t %/n\u0103m</label>
              <input
                id="sim-inf"
                inputMode="decimal"
                value={inflationPct}
                onChange={(e) => setInflationPct(e.target.value)}
                style={{ minHeight: 44 }}
              />
            </div>
          )}
          <label className="row-between" style={{ minHeight: 44, alignItems: "center" }}>
            <span>Chi ph\u00ed \u0026 thu\u1ebf \u0110\u1ee9c (TER 0,22% + thu\u1ebf khi b\u00e1n)</span>
            <input
              type="checkbox"
              checked={taxOn}
              onChange={(e) => setTaxOn(e.target.checked)}
              style={{ width: 24, height: 24 }}
            />
          </label>
        </div>
      </details>

      {mode === "C" && !yearsC.reached && (
        <div className="banner" style={{ margin: 0 }}>
          Kh\u00f4ng \u0111\u1ea1t \u0111\u01b0\u1ee3c trong {MAX_YEARS} n\u0103m v\u1edbi m\u1ee9c g\u00f3p v\u00e0 l\u1ee3i nhu\u1eadn hi\u1ec7n t\u1ea1i.
        </div>
      )}

      {primary && !planUnreachable && (
        <div className="card">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {taxOn && (
              <button
                type="button"
                aria-pressed={showAfterTax}
                onClick={() => setShowAfterTax((v) => !v)}
                style={{
                  minHeight: 36,
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: showAfterTax ? "1px solid transparent" : "1px solid var(--border, rgba(16,24,40,.18))",
                  background: showAfterTax ? "var(--primary-600, #3b6ef5)" : "transparent",
                  color: showAfterTax ? "var(--on-primary, #fff)" : "var(--muted, rgba(16,24,40,.55))",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Sau thu\u1ebf
              </button>
            )}
            {inflationOn && (
              <button
                type="button"
                aria-pressed={showPP}
                onClick={() => setShowPP((v) => !v)}
                style={{
                  minHeight: 36,
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: showPP ? "1px solid transparent" : "1px solid var(--border, rgba(16,24,40,.18))",
                  background: showPP ? "var(--primary-600, #3b6ef5)" : "transparent",
                  color: showPP ? "var(--on-primary, #fff)" : "var(--muted, rgba(16,24,40,.55))",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Gi\u00e1 h\u00f4m nay
              </button>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              textAlign: "center",
            }}
          >
            <div>
              <div className="metric-label">Cu\u1ed1i k\u1ef3</div>
              <div className="metric-value" style={{ fontSize: 16 }}>
                {formatMoneyRounded(headlineValue)}
              </div>
            </div>
            <div>
              <div className="metric-label">\u0110\u00e3 g\u00f3p</div>
              <div className="metric-value" style={{ fontSize: 16 }}>
                {formatMoneyRounded(primary.out.contributed)}
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                ti\u1ec1n th\u1ef1c b\u1ecf ra
              </div>
            </div>
            <div>
              <div className="metric-label">L\u00e3i</div>
              <div className="metric-value" style={{ fontSize: 16 }}>
                {formatMoneyRounded(shownInterest)}
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                {headlineNote}
              </div>
            </div>
          </div>
          {initialBalance > 0 && (
            <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>
              S\u1ed1 d\u01b0 xu\u1ea5t ph\u00e1t: {formatMoney(initialBalance)}
            </p>
          )}
        </div>
      )}

      <div className="card">
        <p className="section-title" style={{ marginTop: 0 }}>
          Di\u1ec5n bi\u1ebfn theo n\u0103m
        </p>
        <ScenarioChart
          results={results}
          markers={goalMarkers}
          years={yearsForProject}
          band={band}
          baseRate={baseRate}
        />
      </div>

      <details className="card">
        <summary style={{ minHeight: 44, cursor: "pointer" }}>B\u1ea3ng theo n\u0103m</summary>
        <p className="muted" style={{ fontSize: 12, margin: "8px 0" }}>
          Tr\u01b0\u1edbc thu\u1ebf \u00b7 danh ngh\u0129a
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 6 }}>N\u0103m</th>
                <th style={{ textAlign: "right", padding: 6 }}>\u0110\u00e3 g\u00f3p</th>
                <th style={{ textAlign: "right", padding: 6 }}>S\u1ed1 d\u01b0</th>
                {band > 0 && (
                  <th style={{ textAlign: "right", padding: 6 }}>Kho\u1ea3ng</th>
                )}
              </tr>
            </thead>
            <tbody>
              {yearRows.map((yi) => {
                const basePt = baseMap.get(yi);
                const loPt = cautiousMap.get(yi);
                const hiPt = bullMap.get(yi);
                const isGoal = goalYearSet.has(yi);
                const isLast = yi === yearsForProject;
                const calYear = nowY + yi;
                return (
                  <tr
                    key={yi}
                    style={{
                      fontWeight: isLast ? 600 : undefined,
                      background: isGoal ? "var(--surface-2, rgba(16,24,40,.04))" : undefined,
                    }}
                  >
                    <td style={{ padding: 6 }}>
                      {yi === 0 ? (
                        "Hi\u1ec7n t\u1ea1i"
                      ) : (
                        <>
                          {calYear}
                          <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>
                            +{yi}
                          </span>
                        </>
                      )}
                      {isGoal && (
                        <span style={{ marginLeft: 6, fontSize: 11 }}>
                          <span aria-hidden style={{ color: "var(--primary-600, #3b6ef5)" }}>
                            \u25cf
                          </span>{" "}
                          <span className="muted">{goalNameByYear.get(yi)}</span>
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right", padding: 6 }}>
                      {formatMoneyRounded(basePt?.contributed ?? 0)}
                    </td>
                    <td style={{ textAlign: "right", padding: 6 }}>
                      {formatMoneyRounded(basePt?.total ?? 0)}
                    </td>
                    {band > 0 && (
                      <td style={{ textAlign: "right", padding: 6, whiteSpace: "nowrap" }}>
                        {formatMoneyRounded(loPt?.total ?? 0)} \u2013 {formatMoneyRounded(hiPt?.total ?? 0)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="secondary"
          style={{ minHeight: 44, marginTop: 10, width: "100%" }}
          onClick={() => setShowAllYears((v) => !v)}
        >
          {showAllYears ? "Thu g\u1ecdn" : "Hi\u1ec7n t\u1ea5t c\u1ea3 c\u00e1c n\u0103m"}
        </button>
      </details>

      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        \u01adc t\u00ednh, kh\u00f4ng ph\u1ea3i t\u01b0 v\u1ea5n \u0111\u1ea7u t\u01b0 hay thu\u1ebf.
      </p>

      <button
        type="button"
        className="secondary"
        style={{ minHeight: 44, opacity: planUnreachable ? 0.45 : 1 }}
        disabled={planUnreachable}
        onClick={openSaveConfirm}
      >
        L\u01b0u m\u1ee9c g\u00f3p \u0026 l\u1ee3i nhu\u1eadn c\u01a1 s\u1edf v\u00e0o k\u1ebf ho\u1ea1ch
      </button>

      {matchMsg && !undoVisible && (
        <div className="banner" style={{ margin: 0 }}>
          K\u1ebf ho\u1ea1ch \u0111\u00e3 kh\u1edbp v\u1edbi m\u00f4 ph\u1ecfng \u2014 kh\u00f4ng c\u00f3 g\u00ec \u0111\u1ec3 l\u01b0u.
        </div>
      )}

      {undoVisible && undoSnap && (
        <div className="banner" style={{ margin: 0, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>{undoSnap.message}</span>
          <button type="button" className="secondary" style={{ minHeight: 44 }} onClick={() => void undoPersist()}>
            Ho\u00e0n t\u00e1c
          </button>
        </div>
      )}

      {saveOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="sheet-handle" aria-hidden />
            <h2>L\u01b0u v\u00e0o k\u1ebf ho\u1ea1ch</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              Ch\u1ea1m \u0111\u1ec3 ch\u1ecdn m\u1ee5c mu\u1ed1n ghi.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0 8px" }}>
              {y1Diff && (
                <button
                  type="button"
                  aria-pressed={writeY1}
                  onClick={() => setWriteY1((v) => !v)}
                  style={{
                    minHeight: 44,
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: writeY1 ? "1px solid transparent" : "1px solid var(--border, rgba(16,24,40,.18))",
                    background: writeY1 ? "var(--primary-600, #3b6ef5)" : "transparent",
                    color: writeY1 ? "var(--on-primary, #fff)" : "var(--muted, rgba(16,24,40,.55))",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 2,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 12, opacity: 0.9 }}>N\u0103m 1</span>
                  <strong style={{ fontSize: 14 }}>{formatMoney(round2(monthlyForProject))}</strong>
                  <span
                    style={{
                      fontSize: 12,
                      color: writeY1
                        ? "inherit"
                        : round2(monthlyForProject) - round2(oldY1) >= 0
                          ? "#2f9e6b"
                          : "#c47a2c",
                      opacity: writeY1 ? 0.9 : 1,
                    }}
                  >
                    {round2(monthlyForProject) - round2(oldY1) >= 0 ? "\u2191 +" : "\u2193 \u2212"}
                    {formatMoney(Math.abs(round2(monthlyForProject) - round2(oldY1))).replace(" EUR", "")}
                  </span>
                </button>
              )}
              {y2Diff && (
                <button
                  type="button"
                  aria-pressed={writeY2}
                  onClick={() => setWriteY2((v) => !v)}
                  style={{
                    minHeight: 44,
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: writeY2 ? "1px solid transparent" : "1px solid var(--border, rgba(16,24,40,.18))",
                    background: writeY2 ? "var(--primary-600, #3b6ef5)" : "transparent",
                    color: writeY2 ? "var(--on-primary, #fff)" : "var(--muted, rgba(16,24,40,.55))",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 2,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 12, opacity: 0.9 }}>T\u1eeb n\u0103m 2</span>
                  <strong style={{ fontSize: 14 }}>{formatMoney(round2(monthlyForProject))}</strong>
                  <span
                    style={{
                      fontSize: 12,
                      color: writeY2
                        ? "inherit"
                        : round2(monthlyForProject) - round2(oldY2) >= 0
                          ? "#2f9e6b"
                          : "#c47a2c",
                      opacity: writeY2 ? 0.9 : 1,
                    }}
                  >
                    {round2(monthlyForProject) - round2(oldY2) >= 0 ? "\u2191 +" : "\u2193 \u2212"}
                    {formatMoney(Math.abs(round2(monthlyForProject) - round2(oldY2))).replace(" EUR", "")}
                  </span>
                </button>
              )}
              {retDiff && (
                <button
                  type="button"
                  aria-pressed={writeReturn}
                  onClick={() => setWriteReturn((v) => !v)}
                  style={{
                    minHeight: 44,
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: writeReturn ? "1px solid transparent" : "1px solid var(--border, rgba(16,24,40,.18))",
                    background: writeReturn ? "var(--primary-600, #3b6ef5)" : "transparent",
                    color: writeReturn ? "var(--on-primary, #fff)" : "var(--muted, rgba(16,24,40,.55))",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 2,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 12, opacity: 0.9 }}>L\u1ee3i nhu\u1eadn</span>
                  <strong style={{ fontSize: 14 }}>{(baseRateNew * 100).toFixed(2)}%</strong>
                  <span
                    style={{
                      fontSize: 12,
                      color: writeReturn
                        ? "inherit"
                        : baseRateNew - oldVwce >= 0
                          ? "#2f9e6b"
                          : "#c47a2c",
                      opacity: writeReturn ? 0.9 : 1,
                    }}
                  >
                    {baseRateNew - oldVwce >= 0 ? "\u2191 +" : "\u2193 \u2212"}
                    {Math.abs((baseRateNew - oldVwce) * 100).toFixed(2)}
                  </span>
                </button>
              )}
            </div>

            {selectedCount > 0 && (
              <p className="muted" style={{ fontSize: 12, margin: "0 0 12px" }}>
                T\u1eeb{" "}
                {[
                  writeY1 && y1Diff ? formatMoney(oldY1) : null,
                  writeY2 && y2Diff ? formatMoney(oldY2) : null,
                  writeReturn && retDiff ? `${(oldVwce * 100).toFixed(2)}%` : null,
                ]
                  .filter(Boolean)
                  .join(" \u00b7 ")}
                {" \u00b7 ho\u00e0n t\u00e1c \u0111\u01b0\u1ee3c trong 12 gi\u00e2y"}
              </p>
            )}

            <div className="stack" style={{ marginTop: 8 }}>
              <button
                type="button"
                style={{ minHeight: 44 }}
                disabled={selectedCount === 0}
                onClick={() => void confirmPersist()}
              >
                {saveLabel}
              </button>
              <button type="button" className="secondary" style={{ minHeight: 44 }} onClick={() => setSaveOpen(false)}>
                H\u1ee7y
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function scenarioColor(id: string): string {
  if (id === "cautious") return "#6b8cae";
  if (id === "bull") return "#2f9e6b";
  return "var(--primary-600, #3b6ef5)";
}

function buildSummary(opts: {
  mode: Mode;
  monthly: number;
  years: number;
  reached: boolean;
  terminal: number;
  pp: number;
  inflationOn: boolean;
  unreachable?: boolean;
}): string {
  if (opts.unreachable) {
    return "Ch\u01b0a c\u00f3 m\u1ee9c g\u00f3p kh\u1ea3 thi cho m\u1ee5c ti\u00eau n\u00e0y.";
  }
  if (opts.mode === "C" && !opts.reached) {
    return `V\u1edbi m\u1ee9c g\u00f3p ${formatMoney(opts.monthly)} m\u1ed7i th\u00e1ng, kh\u1ea3 n\u0103ng cao kh\u00f4ng \u0111\u1ea1t m\u1ee5c ti\u00eau trong 40 n\u0103m.`;
  }
  if (opts.mode === "B") {
    return `\u0110\u1ec3 \u0111\u1ea1t m\u1ee5c ti\u00eau, c\u1ea7n g\u00f3p kho\u1ea3ng ${formatMoney(opts.monthly)} m\u1ed7i th\u00e1ng trong ${opts.years} n\u0103m \u2014 kh\u1ea3 n\u0103ng cao nh\u1eadn kho\u1ea3ng ${formatMoney(opts.terminal)}${
      opts.inflationOn ? ` (t\u01b0\u01a1ng \u0111\u01b0\u01a1ng ${formatMoney(opts.pp)} ti\u1ec1n h\u00f4m nay)` : ""
    }.`;
  }
  if (opts.mode === "C") {
    return `G\u00f3p ${formatMoney(opts.monthly)} m\u1ed7i th\u00e1ng, kh\u1ea3 n\u0103ng cao \u0111\u1ee7 m\u1ee5c ti\u00eau sau kho\u1ea3ng ${opts.years} n\u0103m \u2014 kho\u1ea3ng ${formatMoney(opts.terminal)}${
      opts.inflationOn ? ` (t\u01b0\u01a1ng \u0111\u01b0\u01a1ng ${formatMoney(opts.pp)} ti\u1ec1n h\u00f4m nay)` : ""
    }.`;
  }
  return `G\u00f3p ${formatMoney(opts.monthly)} m\u1ed7i th\u00e1ng trong ${opts.years} n\u0103m, kh\u1ea3 n\u0103ng cao \u0111\u1ea1t ${formatMoney(opts.terminal)}${
    opts.inflationOn ? ` \u2014 t\u01b0\u01a1ng \u0111\u01b0\u01a1ng ${formatMoney(opts.pp)} ti\u1ec1n h\u00f4m nay` : ""
  }.`;
}

function ScenarioChart({
  results,
  markers,
  years,
  band,
  baseRate,
}: {
  results: {
    sc: Scenario;
    out: ProjectOutput;
  }[];
  markers: { name: string; yearIndex: number; amount: number }[];
  years: number;
  band: number;
  baseRate: number;
}) {
  const W = 320;
  const H = 168;
  const padL = 8;
  const padR = 52;
  const padT = 12;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const allVals = results.flatMap((r) => r.out.yearEnds.map((p) => p.total));
  const maxV = Math.max(1, ...allVals, ...markers.map((m) => m.amount));
  const maxX = Math.max(1, years);

  function x(yi: number): number {
    return padL + (yi / maxX) * innerW;
  }
  function y(v: number): number {
    return padT + innerH - (v / maxV) * innerH;
  }

  function pathFor(points: YearPoint[]): string {
    if (points.length === 0) return "";
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.yearIndex).toFixed(1)},${y(p.total).toFixed(1)}`)
      .join(" ");
  }

  function bandArea(low: YearPoint[], high: YearPoint[]): string {
    if (low.length === 0 || high.length === 0) return "";
    const forward = high
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.yearIndex).toFixed(1)},${y(p.total).toFixed(1)}`)
      .join(" ");
    const back = [...low]
      .reverse()
      .map((p) => `L${x(p.yearIndex).toFixed(1)},${y(p.total).toFixed(1)}`)
      .join(" ");
    return `${forward} ${back} Z`;
  }

  const cautious = results.find((r) => r.sc.id === "cautious");
  const base = results.find((r) => r.sc.id === "base");
  const bull = results.find((r) => r.sc.id === "bull");
  const showBand = band > 0 && !!cautious && !!bull;

  const baseEnd = base?.out.yearEnds[base.out.yearEnds.length - 1];
  const loPct = round2(Math.max(0, baseRate - band) * 100);
  const hiPct = round2((baseRate + band) * 100);
  const bandPctText = `${loPct.toLocaleString("de-DE")}% \u2013 ${hiPct.toLocaleString("de-DE")}%`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="Bi\u1ec3u \u0111\u1ed3 t\u00e0i s\u1ea3n theo n\u0103m"
      style={{ display: "block" }}
    >
      {showBand && cautious && bull && (
        <path
          d={bandArea(cautious.out.yearEnds, bull.out.yearEnds)}
          fill={scenarioColor("base")}
          opacity={0.14}
        />
      )}
      {base && (
        <path
          d={pathFor(base.out.yearEnds)}
          fill="none"
          stroke={scenarioColor("base")}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      )}
      {markers.map((m) => (
        <g key={m.name + m.yearIndex}>
          <line
            x1={x(m.yearIndex)}
            x2={x(m.yearIndex)}
            y1={padT}
            y2={padT + innerH}
            stroke="rgba(16,24,40,.35)"
            strokeDasharray="4 3"
          />
          <circle cx={x(m.yearIndex)} cy={y(m.amount)} r={3} fill="rgba(16,24,40,.55)" />
        </g>
      ))}
      {baseEnd && (
        <text
          x={W - 4}
          y={y(baseEnd.total)}
          fontSize={10}
          fill={scenarioColor("base")}
          textAnchor="end"
          dominantBaseline="middle"
        >
          {formatMoneyRounded(baseEnd.total)}
        </text>
      )}
      {showBand && (
        <text x={W - 4} y={padT + 10} fontSize={9} fill="rgba(16,24,40,.45)" textAnchor="end">
          {bandPctText}
        </text>
      )}
      <text x={padL} y={H - 6} fontSize={10} fill="rgba(16,24,40,.45)">
        0
      </text>
      <text x={W - padR} y={H - 6} fontSize={10} fill="rgba(16,24,40,.45)" textAnchor="end">
        {years}n
      </text>
    </svg>
  );
}
