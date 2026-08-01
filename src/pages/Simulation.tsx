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
  rate: number; // lợi nhuận danh nghĩa trước TER
};

type YearPoint = {
  yearIndex: number; // 0 = hiện tại, 1 = sau 1 năm…
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

type ContribScope = "y1" | "y2" | "both";

type SnapshotSettings = {
  contributionY1: number;
  contributionY2: number;
  vwceReturn: number;
  inflationRate: number;
};

const TAX_RATE = 0.26375; // Abgeltungsteuer + Soli
const TEILFREISTELLUNG = 0.3; // quỹ cổ phiếu
const SPARERPAUSCH = 1000; // EUR/năm — áp một lần khi bán cuối kỳ
const DEFAULT_TER = 0.0022;
const MAX_YEARS = 40;
const UNDO_MS = 12_000;

/**
 * Hàm tính cuối kỳ DUY NHẤT — A/B/C đều gọi hàm này.
 * Góp cuối tháng, lợi nhuận cộng dồn hàng tháng, TER trừ một lần/năm trên tổng.
 */
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
    // Cuối mỗi năm: trừ TER trên tổng tài sản; tăng góp theo %/năm
    if (m % 12 === 0) {
      if (ter > 0 && balance > 0) {
        balance *= 1 - ter;
      }
      if (growth !== 0) {
        monthly *= 1 + growth;
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

/**
 * Thuế lãi vốn Đức ước lượng khi bán cuối kỳ (không mô phỏng Vorabpauschale).
 * initialCostBasis = giá vốn danh mục hiện tại (vwceCostBasis + cash), KHÔNG phải giá thị trường.
 */
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

/** Chế độ B: tìm monthly sao cho terminal ≈ target (cùng projectEnd). */
function findMonthlyForTarget(
  target: number,
  base: Omit<ProjectInput, "monthlyContribution">,
): number {
  if (target <= 0 || base.years <= 0) return 0;
  const zero = projectEnd({ ...base, monthlyContribution: 0 });
  if (zero.terminal >= target) return 0;

  let lo = 0;
  let hi = Math.max(target, 1);
  for (let i = 0; i < 20; i++) {
    const r = projectEnd({ ...base, monthlyContribution: hi });
    if (r.terminal >= target) break;
    hi *= 2;
    if (hi > 1e7) break;
  }
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const r = projectEnd({ ...base, monthlyContribution: mid });
    if (r.terminal >= target) hi = mid;
    else lo = mid;
  }
  return round2(hi);
}

/** Chế độ C: tìm số năm (1..40) sao cho terminal >= target. */
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

  // [1] Lưu kế hoạch — xác nhận + hoàn tác
  const [saveOpen, setSaveOpen] = useState(false);
  const [contribScope, setContribScope] = useState<ContribScope>("y1");
  const [writeVwceReturn, setWriteVwceReturn] = useState(false);
  const [writeInflation, setWriteInflation] = useState(false);
  const [undoSnap, setUndoSnap] = useState<SnapshotSettings | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const undoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current != null) window.clearTimeout(undoTimerRef.current);
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

  // Giá vốn danh mục (vwceCostBasis + tiền mặt mệnh giá) — dùng cho thuế, không dùng giá thị trường
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
  const growthN = growthOn ? Math.max(0, parseDecimal(growthPct) / 100) : 0;
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

  const monthlyForProject = mode === "B" ? requiredMonthlyBase : monthlyN;

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

  function openSaveConfirm() {
    setContribScope("y1");
    setWriteVwceReturn(false);
    setWriteInflation(false);
    setSaveOpen(true);
  }

  async function confirmPersist() {
    const current = settings ?? (await getSettings());
    const snap: SnapshotSettings = {
      contributionY1: current.contributionY1,
      contributionY2: current.contributionY2,
      vwceReturn: current.vwceReturn,
      inflationRate: current.inflationRate,
    };

    const partial: Partial<AppSettings> = {};
    if (contribScope === "y1" || contribScope === "both") {
      partial.contributionY1 = monthlyForProject;
    }
    if (contribScope === "y2" || contribScope === "both") {
      partial.contributionY2 = monthlyForProject;
    }
    if (writeVwceReturn) {
      partial.vwceReturn = scenarios.find((s) => s.id === "base")?.rate ?? 0.065;
    }
    if (writeInflation) {
      partial.inflationRate = inflationN;
    }

    if (Object.keys(partial).length === 0) {
      setSaveOpen(false);
      return;
    }

    await saveSettings(partial);
    setSettings(await getSettings());
    setSaveOpen(false);

    setUndoSnap(snap);
    setUndoVisible(true);
    if (undoTimerRef.current != null) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => {
      setUndoVisible(false);
      setUndoSnap(null);
      undoTimerRef.current = null;
    }, UNDO_MS);
  }

  async function undoPersist() {
    if (!undoSnap) return;
    await saveSettings({
      contributionY1: undoSnap.contributionY1,
      contributionY2: undoSnap.contributionY2,
      vwceReturn: undoSnap.vwceReturn,
      inflationRate: undoSnap.inflationRate,
    });
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
  });

  const baseRateNew = scenarios.find((s) => s.id === "base")?.rate ?? 0.065;
  const oldY1 = settings?.contributionY1 ?? 0;
  const oldY2 = settings?.contributionY2 ?? 0;
  const oldVwce = settings?.vwceReturn ?? 0;
  const oldInf = settings?.inflationRate ?? 0;

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* remainder unchanged - truncated for safety check */}
    </div>
  );
}
