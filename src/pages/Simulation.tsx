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
import type { AppSettings, Goal, Transaction } from "../lib/types";

/**
 * Mô phỏng v2 — ba chế độ, một hàm tính cuối kỳ chung.
 *
 * A: góp X/tháng → sau N năm được bao nhiêu
 * B: muốn Y vào năm Z → phải góp bao nhiêu (chặt nhị phân trên A)
 * C: góp X/tháng → bao giờ đủ Y (chặt nhị phân trên A)
 */

type Mode = "A" | "B" | "C";

type Scenario = {
  id: string;
  label: string;
  rate: number;
};

type YearPoint = {
  yearIndex: number;
  total: number;
  contributed: number;
};

type ProjectInput = {
  years: number;
  monthlyContribution: number;
  annualReturn: number;
  initialBalance: number;
  lumpSum: number;
  annualContributionGrowth: number;
  ter: number;
};

type ProjectOutput = {
  yearEnds: YearPoint[];
  terminal: number;
  contributed: number;
  interest: number;
};

/** Chỉ các khóa đã ghi — hoàn tác không đụng trường khác. */
type UndoSnap = {
  values: Partial<Pick<AppSettings, "contributionY1" | "contributionY2" | "vwceReturn">>;
  message: string;
};

const TAX_RATE = 0.26375;
const TEILFREISTELLUNG = 0.3;
const SPARERPAUSCH = 1000;
const DEFAULT_TER = 0.0022;
const MAX_YEARS = 40;
const UNDO_MS = 12_000;

function projectEnd(input: ProjectInput): ProjectOutput {
  const years = Math.max(0, Math.min(MAX_YEARS, Math.floor(input.years)));
  const months = years * 12;
  const rMonth =
    input.annualReturn > -1
      ? Math.pow(1 + input.annualReturn, 1 / 12) - 1
      : 0;

  let balance = Math.max(0, input.initialBalance) + Math.max(0, input.lumpSum);
  let contributed = Math.max(0, input.lumpSum);
  let monthly = Math.max(0, input.monthlyContribution);
  const growth = input.annualContributionGrowth;
  const ter = Math.max(0, input.ter);

  const yearEnds: YearPoint[] = [{ yearIndex: 0, total: round2(balance), contributed: round2(contributed) }];

  if (months === 0) {
    return {
      yearEnds,
      terminal: round2(balance),
      contributed: round2(contributed),
      interest: 0,
    };
  }

  for (let m = 1; m <= months; m++) {
    balance *= 1 + rMonth;
    if (monthly > 0) {
      balance += monthly;
      contributed += monthly;
    }
    if (m % 12 === 0) {
      if (ter > 0 && balance > 0) {
        balance *= 1 - ter;
      }
      if (growth !== 0) {
        // Không để mức góp âm khi tăng trưởng âm kéo dài
        monthly = Math.max(0, monthly * (1 + growth));
      }
      yearEnds.push({
        yearIndex: m / 12,
        total: round2(balance),
        contributed: round2(contributed),
      });
    }
  }

  const terminal = round2(balance);
  const contrib = round2(contributed);
  return {
    yearEnds,
    terminal,
    contributed: contrib,
    interest: round2(terminal - contrib - Math.max(0, input.initialBalance)),
  };
}

function estimateGermanExitTax(
  terminal: number,
  contributed: number,
  initialCostBasis: number,
): { afterTax: number; tax: number } {
  const costBasis = Math.max(0, contributed + Math.max(0, initialCostBasis));
  const gain = Math.max(0, terminal - costBasis);
  const afterTeil = gain * (1 - TEILFREISTELLUNG);
  const taxable = Math.max(0, afterTeil - SPARERPAUSCH);
  const tax = round2(taxable * TAX_RATE);
  return { tax, afterTax: round2(terminal - tax) };
}

function findMonthlyForTarget(
  target: number,
  base: Omit<ProjectInput, "monthlyContribution">,
): number {
  if (target <= 0 || base.years <= 0) return 0;
  const zero = projectEnd({ ...base, monthlyContribution: 0 });
  if (zero.terminal >= target) return 0;

  let lo = 0;
  let hi = Math.max(target, 1);
  let reached = false;
  for (let i = 0; i < 20; i++) {
    const r = projectEnd({ ...base, monthlyContribution: hi });
    if (r.terminal >= target) {
      reached = true;
      break;
    }
    hi *= 2;
    if (hi > 1e7) break;
  }
  // Tăng trưởng âm mạnh: dù góp rất lớn vẫn không đủ
  if (!reached) {
    const atMax = projectEnd({ ...base, monthlyContribution: hi });
    if (atMax.terminal < target) return -1;
  }
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const r = projectEnd({ ...base, monthlyContribution: mid });
    if (r.terminal >= target) hi = mid;
    else lo = mid;
  }
  return round2(hi);
}

function findYearsForTarget(
  target: number,
  base: Omit<ProjectInput, "years">,
): { years: number; reached: boolean } {
  if (target <= 0) return { years: 0, reached: true };
  const at0 = projectEnd({ ...base, years: 0 });
  if (at0.terminal >= target) return { years: 0, reached: true };

  let lo = 0;
  let hi = MAX_YEARS;
  const atMax = projectEnd({ ...base, years: MAX_YEARS });
  if (atMax.terminal < target) return { years: MAX_YEARS, reached: false };

  for (let i = 0; i < 32; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const r = projectEnd({ ...base, years: mid });
    if (r.terminal >= target) hi = mid;
    else lo = mid + 1;
  }
  return { years: hi, reached: true };
}

function purchasingPower(nominal: number, inflation: number, years: number): number {
  if (inflation <= -1 || years <= 0) return nominal;
  return round2(nominal / Math.pow(1 + inflation, years));
}

const QUICK_YEARS = [5, 10, 15, 20, 25, 30] as const;

const DEFAULT_SCENARIOS: Scenario[] = [
  { id: "cautious", label: "Thận trọng", rate: 0.04 },
  { id: "base", label: "Cơ sở", rate: 0.065 },
  { id: "bull", label: "Thuận lợi", rate: 0.085 },
];

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
  const [scenarios, setScenarios] = useState<Scenario[]>(DEFAULT_SCENARIOS);
  const [inflationOn, setInflationOn] = useState(true);
  const [inflationPct, setInflationPct] = useState("2");
  const [taxOn, setTaxOn] = useState(true);
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
    return round2(portfolio.vwceQty * price + portfolio.cashBalance);
  }, [portfolio, settings]);

  const realCostBasis = useMemo(
    () => round2(Math.max(0, portfolio.vwceCostBasis) + Math.max(0, portfolio.cashBalance)),
    [portfolio],
  );

  const initialBalance = useMemo(() => {
    if (balanceOverride.trim() !== "") return Math.max(0, parseDecimal(balanceOverride));
    return Math.max(0, realBalance);
  }, [balanceOverride, realBalance]);

  // Ghi đè số dư: giả định, coi toàn bộ là vốn (không có lãi tiềm ẩn).
  // Không ghi đè: dùng giá vốn thật (vwceCostBasis + cash).
  const initialCostBasis =
    balanceOverride.trim() !== "" ? initialBalance : realCostBasis;

  const monthlyN = Math.max(0, parseDecimal(monthly));
  // Cho phép giảm dần: kẹp [-20%, +20%]/năm
  const growthN = growthOn
    ? Math.max(-0.2, Math.min(0.2, parseDecimal(growthPct) / 100))
    : 0;
  const lumpN = Math.max(0, parseDecimal(lumpSum));
  const inflationN = inflationOn ? Math.max(0, parseDecimal(inflationPct) / 100) : 0;
  const targetN = Math.max(0, parseDecimal(targetAmount));
  const ter = taxOn ? DEFAULT_TER : 0;

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
    const baseRate = scenarios.find((s) => s.id === "base")?.rate ?? 0.065;
    return findMonthlyForTarget(targetN, {
      ...baseCommon,
      years: yearsB,
      annualReturn: baseRate,
    });
  }, [mode, targetN, baseCommon, yearsB, scenarios, monthlyN]);

  const monthlyForProject =
    mode === "B" ? Math.max(0, requiredMonthlyBase) : monthlyN;
  // Chế độ B không hội tụ: requiredMonthlyBase = -1 — chặn lưu / tóm tắt
  const planUnreachable = mode === "B" && requiredMonthlyBase < 0;

  const yearsC = useMemo(() => {
    if (mode !== "C") return { years: effectiveYears, reached: true };
    const baseRate = scenarios.find((s) => s.id === "base")?.rate ?? 0.065;
    return findYearsForTarget(targetN, {
      ...baseCommon,
      monthlyContribution: monthlyN,
      annualReturn: baseRate,
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

  function setScenarioRate(id: string, pctStr: string) {
    const rate = Math.max(0, parseDecimal(pctStr) / 100);
    setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, rate } : s)));
  }

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

  /** Ghi partial + băng hoàn tác. Snapshot CHỈ các khóa đã ghi. */
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

    // D3: hai băng loại trừ nhau
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
    // Không ghi khi chế độ B không có mức góp khả thi
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

    // 0 khác biệt
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

    // Đúng 1 khác biệt → ghi luôn, không mở sheet
    if (diffCount === 1) {
      if (y1Diff) {
        void applyPersist(
          { contributionY1: monthlyR },
          `Đã đặt Góp năm 1 = ${formatMoney(monthlyR)}`,
        );
      } else if (y2Diff) {
        void applyPersist(
          { contributionY2: monthlyR },
          `Đã đặt Góp từ năm 2 = ${formatMoney(monthlyR)}`,
        );
      } else {
        void applyPersist(
          { vwceReturn: nR },
          `Đã đặt Lợi nhuận VWCE = ${(nR * 100).toFixed(2)}%`,
        );
      }
      return;
    }

    // ≥ 2 → mở sheet, mặc định tích năm 1 nếu khác
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
      parts.push(`Góp năm 1 = ${formatMoney(monthlyR)}`);
    }
    if (writeY2 && y2D) {
      partial.contributionY2 = monthlyR;
      parts.push(`Góp từ năm 2 = ${formatMoney(monthlyR)}`);
    }
    if (writeReturn && retD) {
      partial.vwceReturn = nR;
      parts.push(`Lợi nhuận VWCE = ${(nR * 100).toFixed(2)}%`);
    }

    if (parts.length === 0) {
      setSaveOpen(false);
      return;
    }

    const message =
      parts.length === 1
        ? `Đã đặt ${parts[0]}`
        : `Đã lưu ${parts.length} thay đổi`;
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

  if (loading) {
    return <p className="muted">Đang tải…</p>;
  }

  const summaryText = buildSummary({
    mode,
    monthly: monthlyForProject,
    years: yearsForProject,
    reached: mode === "C" ? yearsC.reached : true,
    terminal: primary?.out.terminal ?? 0,
    pp: primary?.pp ?? 0,
    inflationOn,
    unreachable: planUnreachable,
  });

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
      ? "Chưa chọn gì"
      : selectedCount === 1
        ? "Lưu 1 thay đổi"
        : `Lưu ${selectedCount} thay đổi`;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div
        role="tablist"
        aria-label="Chế độ mô phỏng"
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
            ["A", "Góp → nhận"],
            ["B", "Muốn → góp"],
            ["C", "Góp → khi nào"],
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

      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        {mode === "A" && "Góp cố định mỗi tháng — xem tài sản sau N năm."}
        {mode === "B" && "Nhập mục tiêu và năm — máy tính số cần góp mỗi tháng."}
        {mode === "C" && "Góp cố định — máy tính bao lâu để đủ mục tiêu (tối đa 40 năm)."}
      </p>

      {(mode === "A" || mode === "C") && (
        <div className="card">
          <div className="field">
            <label htmlFor="sim-years">
              Thời hạn: <strong>{years} năm</strong>
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {QUICK_YEARS.map((y) => (
              <button
                key={y}
                type="button"
                className={years === y ? "btn" : "secondary"}
                style={{ minHeight: 44, minWidth: 52 }}
                onClick={() => setYears(y)}
              >
                {y}n
              </button>
            ))}
          </div>
          {goals.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                Đến ngày mục tiêu
              </span>
              {goals.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="secondary"
                  style={{ minHeight: 44, textAlign: "left" }}
                  onClick={() => applyYearsFromGoal(g)}
                >
                  {g.name} · {g.dueDate.slice(0, 4)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "B" && (
        <div className="card">
          <div className="field">
            <label htmlFor="sim-target">Muốn có (EUR)</label>
            <input
              id="sim-target"
              inputMode="decimal"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              style={{ minHeight: 44 }}
            />
          </div>
          <div className="field">
            <label htmlFor="sim-tyear">Vào năm</label>
            <input
              id="sim-tyear"
              inputMode="numeric"
              value={targetYear}
              onChange={(e) => setTargetYear(e.target.value)}
              style={{ minHeight: 44 }}
            />
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            Còn khoảng {yearsB} năm từ hiện tại.
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
                  Dùng mục tiêu: {g.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "C" && (
        <div className="card">
          <div className="field">
            <label htmlFor="sim-target-c">Mục tiêu Y (EUR)</label>
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
            <label htmlFor="sim-monthly">Góp mỗi tháng (EUR)</label>
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
            Không đạt được mục tiêu với mức giảm này.
          </div>
        )}
        {mode === "B" && requiredMonthlyBase >= 0 && (
          <p style={{ margin: "0 0 12px" }}>
            Cần góp khoảng{" "}
            <strong className="metric-value">{formatMoney(requiredMonthlyBase)}</strong>/tháng
            (kịch bản cơ sở).
          </p>
        )}

        <label className="row-between" style={{ minHeight: 44, alignItems: "center" }}>
          <span>Góp thay đổi theo năm</span>
          <input
            type="checkbox"
            checked={growthOn}
            onChange={(e) => setGrowthOn(e.target.checked)}
            style={{ width: 24, height: 24 }}
          />
        </label>
        {growthOn && (
          <div className="field">
            <label htmlFor="sim-growth">Thay đổi góp mỗi năm (%)</label>
            <input
              id="sim-growth"
              inputMode="decimal"
              value={growthPct}
              onChange={(e) => setGrowthPct(e.target.value)}
              style={{ minHeight: 44 }}
            />
            <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
              Số âm = giảm dần. Ví dụ: −5
            </p>
          </div>
        )}

        <div className="field">
          <label htmlFor="sim-lump">Khoản lớn ban đầu (EUR)</label>
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
            Số dư xuất phát — mặc định từ danh mục ({formatMoney(realBalance)})
          </label>
          <input
            id="sim-bal"
            inputMode="decimal"
            placeholder={String(realBalance)}
            value={balanceOverride}
            onChange={(e) => setBalanceOverride(e.target.value)}
            style={{ minHeight: 44 }}
          />
        </div>
      </div>

      <div className="card">
        <p className="section-title" style={{ marginTop: 0 }}>
          Lợi nhuận / năm (sửa được)
        </p>
        {scenarios.map((sc) => (
          <div key={sc.id} className="field">
            <label htmlFor={`rate-${sc.id}`}>{sc.label}</label>
            <input
              id={`rate-${sc.id}`}
              inputMode="decimal"
              value={String(round2(sc.rate * 100))}
              onChange={(e) => setScenarioRate(sc.id, e.target.value)}
              style={{ minHeight: 44 }}
            />
          </div>
        ))}
      </div>

      <div className="card">
        <label className="row-between" style={{ minHeight: 44, alignItems: "center" }}>
          <span>Hiện theo sức mua hôm nay</span>
          <input
            type="checkbox"
            checked={inflationOn}
            onChange={(e) => setInflationOn(e.target.checked)}
            style={{ width: 24, height: 24 }}
          />
        </label>
        {inflationOn && (
          <div className="field">
            <label htmlFor="sim-inf">Lạm phát %/năm</label>
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
          <span>Chi phí & thuế Đức (TER 0,22% + thuế khi bán)</span>
          <input
            type="checkbox"
            checked={taxOn}
            onChange={(e) => setTaxOn(e.target.checked)}
            style={{ width: 24, height: 24 }}
          />
        </label>
      </div>

      {mode === "C" && !yearsC.reached && (
        <div className="banner" style={{ margin: 0 }}>
          Không đạt được trong {MAX_YEARS} năm với mức góp và lợi nhuận hiện tại.
        </div>
      )}

      {primary && (
        <div className="card">
          <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
            Kịch bản {primary.sc.label} · {yearsForProject} năm
            {mode === "B" && requiredMonthlyBase >= 0 && ` · góp ${formatMoney(monthlyForProject)}/tháng`}
          </p>
          <div className="grid2" style={{ gap: 12 }}>
            <div>
              <div className="metric-label">Tổng cuối kỳ</div>
              <div className="metric-value">{formatMoney(primary.out.terminal)}</div>
            </div>
            <div>
              <div className="metric-label">Tổng đã góp</div>
              <div className="metric-value">{formatMoney(primary.out.contributed)}</div>
            </div>
            {initialBalance > 0 && (
              <div>
                <div className="metric-label">Số dư xuất phát</div>
                <div className="metric-value">{formatMoney(initialBalance)}</div>
              </div>
            )}
            <div>
              <div className="metric-label">Phần lãi</div>
              <div className="metric-value">{formatMoney(Math.max(0, primary.out.interest))}</div>
            </div>
            <div>
              <div className="metric-label">Sức mua hôm nay</div>
              <div className="metric-value">{formatMoney(primary.pp)}</div>
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 14 }}>
            <div className="row-between">
              <span className="muted">Trước thuế</span>
              <strong>{formatMoney(primary.out.terminal)}</strong>
            </div>
            <div className="row-between">
              <span className="muted">Sau thuế (ước lượng)</span>
              <strong>{formatMoney(primary.tax.afterTax)}</strong>
            </div>
            {inflationOn && (
              <div className="row-between">
                <span className="muted">Sau thuế · sức mua hôm nay</span>
                <strong>{formatMoney(primary.ppAfter)}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <p className="section-title" style={{ marginTop: 0 }}>
          Diễn biến theo năm
        </p>
        <ScenarioChart results={results} markers={goalMarkers} years={yearsForProject} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, fontSize: 12 }}>
          {results.map((r) => (
            <span key={r.sc.id} className="muted">
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: scenarioColor(r.sc.id),
                  marginRight: 4,
                }}
              />
              {r.sc.label}: {formatMoney(r.out.terminal)}
            </span>
          ))}
        </div>
      </div>

      <details className="card">
        <summary style={{ minHeight: 44, cursor: "pointer" }}>Bảng theo năm</summary>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 6 }}>Năm</th>
                {results.map((r) => (
                  <th key={r.sc.id} style={{ textAlign: "right", padding: 6 }}>
                    {r.sc.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: yearsForProject + 1 }, (_, yi) => (
                <tr key={yi}>
                  <td style={{ padding: 6 }}>{yi === 0 ? "Hiện tại" : `+${yi}`}</td>
                  {results.map((r) => {
                    const pt = r.out.yearEnds.find((p) => p.yearIndex === yi);
                    return (
                      <td key={r.sc.id} style={{ textAlign: "right", padding: 6 }}>
                        {formatMoney(pt?.total ?? 0)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p style={{ fontSize: 15, lineHeight: 1.45, margin: 0 }}>{summaryText}</p>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        Ước tính, không phải tư vấn đầu tư hay thuế.
      </p>

      <button
        type="button"
        className="secondary"
        style={{ minHeight: 44, opacity: planUnreachable ? 0.45 : 1 }}
        disabled={planUnreachable}
        onClick={openSaveConfirm}
      >
        Lưu mức góp & lợi nhuận cơ sở vào kế hoạch
      </button>

      {matchMsg && !undoVisible && (
        <div className="banner" style={{ margin: 0 }}>
          Kế hoạch đã khớp với mô phỏng — không có gì để lưu.
        </div>
      )}

      {undoVisible && undoSnap && (
        <div className="banner" style={{ margin: 0, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>{undoSnap.message}</span>
          <button type="button" className="secondary" style={{ minHeight: 44 }} onClick={() => void undoPersist()}>
            Hoàn tác
          </button>
        </div>
      )}

      {saveOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="sheet-handle" aria-hidden />
            <h2>Lưu vào kế hoạch</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              Chạm để chọn mục muốn ghi.
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
                  <span style={{ fontSize: 12, opacity: 0.9 }}>Năm 1</span>
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
                    {round2(monthlyForProject) - round2(oldY1) >= 0 ? "↑ +" : "↓ −"}
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
                  <span style={{ fontSize: 12, opacity: 0.9 }}>Từ năm 2</span>
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
                    {round2(monthlyForProject) - round2(oldY2) >= 0 ? "↑ +" : "↓ −"}
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
                  <span style={{ fontSize: 12, opacity: 0.9 }}>Lợi nhuận</span>
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
                    {baseRateNew - oldVwce >= 0 ? "↑ +" : "↓ −"}
                    {Math.abs((baseRateNew - oldVwce) * 100).toFixed(2)}
                  </span>
                </button>
              )}
            </div>

            {selectedCount > 0 && (
              <p className="muted" style={{ fontSize: 12, margin: "0 0 12px" }}>
                Từ{" "}
                {[
                  writeY1 && y1Diff ? formatMoney(oldY1) : null,
                  writeY2 && y2Diff ? formatMoney(oldY2) : null,
                  writeReturn && retDiff ? `${(oldVwce * 100).toFixed(2)}%` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {" · hoàn tác được trong 12 giây"}
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
                Hủy
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
  if (opts.mode === "C" && !opts.reached) {
    return `Với mức góp ${formatMoney(opts.monthly)} mỗi tháng, khả năng cao không đạt mục tiêu trong 40 năm.`;
  }
  if (opts.mode === "B" && opts.unreachable) {
    return "Chưa có mức góp khả thi cho mục tiêu này.";
  }
  if (opts.mode === "B") {
    return `Để đạt mục tiêu, cần góp khoảng ${formatMoney(opts.monthly)} mỗi tháng trong ${opts.years} năm — khả năng cao nhận khoảng ${formatMoney(opts.terminal)}${
      opts.inflationOn ? ` (tương đương ${formatMoney(opts.pp)} tiền hôm nay)` : ""
    }.`;
  }
  if (opts.mode === "C") {
    return `Góp ${formatMoney(opts.monthly)} mỗi tháng, khả năng cao đủ mục tiêu sau khoảng ${opts.years} năm — khoảng ${formatMoney(opts.terminal)}${
      opts.inflationOn ? ` (tương đương ${formatMoney(opts.pp)} tiền hôm nay)` : ""
    }.`;
  }
  return `Góp ${formatMoney(opts.monthly)} mỗi tháng trong ${opts.years} năm, khả năng cao đạt ${formatMoney(opts.terminal)}${
    opts.inflationOn ? ` — tương đương ${formatMoney(opts.pp)} tiền hôm nay` : ""
  }.`;
}

function ScenarioChart({
  results,
  markers,
  years,
}: {
  results: {
    sc: Scenario;
    out: ProjectOutput;
  }[];
  markers: { name: string; yearIndex: number; amount: number }[];
  years: number;
}) {
  const W = 320;
  const H = 160;
  const padL = 8;
  const padR = 8;
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

  function areaFor(points: YearPoint[]): string {
    if (points.length === 0) return "";
    const line = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.yearIndex).toFixed(1)},${y(p.total).toFixed(1)}`)
      .join(" ");
    const last = points[points.length - 1];
    const first = points[0];
    return `${line} L${x(last.yearIndex).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(first.yearIndex).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="Biểu đồ tài sản theo năm, ba kịch bản"
      style={{ display: "block" }}
    >
      {[...results].reverse().map((r) => (
        <path
          key={`a-${r.sc.id}`}
          d={areaFor(r.out.yearEnds)}
          fill={scenarioColor(r.sc.id)}
          opacity={0.12}
        />
      ))}
      {results.map((r) => (
        <path
          key={`l-${r.sc.id}`}
          d={pathFor(r.out.yearEnds)}
          fill="none"
          stroke={scenarioColor(r.sc.id)}
          strokeWidth={r.sc.id === "base" ? 2.5 : 1.5}
          strokeLinejoin="round"
        />
      ))}
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
      <text x={padL} y={H - 6} fontSize={10} fill="rgba(16,24,40,.45)">
        0
      </text>
      <text x={W - padR} y={H - 6} fontSize={10} fill="rgba(16,24,40,.45)" textAnchor="end">
        {years}n
      </text>
    </svg>
  );
}
