import { computeHeroLifetimeContribution } from "./heroLifetime";
import { validExitDate } from "./simulation/exitPlan";
import { buildPlanVsReality } from "../pages/planVsReality";
import type { AppSettings, Goal, Transaction } from "./types";

export type GeminiTopic = "plan" | "year" | "goal" | "simulation" | "value" | "difference" | "monthly" | "goalProgress";
export type GeminiFacts = {
  portfolioValue: number | null;
  contributed: number | null;
  monthly: number | null;
  yearRecorded: number | null;
  yearPlanned: number | null;
  year: number | null;
  goalAmount: number | null;
  goalYear: number | null;
  goalMode: "nominal" | "purchasing_power" | null;
  simulationYear: number | null;
  cautious: number | null;
  base: number | null;
  optimistic: number | null;
};
const amount = (n: unknown): number | null =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1e9
    ? Math.round(n * 100) / 100 : null;

export function buildGeminiVaultFacts(input: {
  settings: AppSettings | null;
  transactions: readonly Transaction[];
  currentValue: number | null;
  today: Date;
  simulationEndYear?: number | null;
  scenarioTotals?: Partial<Record<"cautious" | "base" | "optimistic", number>>;
}): GeminiFacts {
  const { settings, transactions, today } = input;
  const current = today.getFullYear();
  const contributedResult = computeHeroLifetimeContribution({
    transactions, trackInAppCash: settings?.trackInAppCash,
  });
  const monthly = settings
    ? amount(settings.contributionY2 > 0 ? settings.contributionY2 : settings.contributionY1)
    : null;
  const progress = settings ? buildPlanVsReality({
    startDate: settings.startDate,
    contributionY1: settings.contributionY1,
    contributionY2: settings.contributionY2,
    trackInAppCash: settings.trackInAppCash,
    transactions,
    today: [current, String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-"),
  }) : null;
  const simYear = input.simulationEndYear;
  const validSim = Number.isInteger(simYear) && Number(simYear) >= current && Number(simYear) <= current + 40;

  return {
    portfolioValue: amount(input.currentValue),
    contributed: contributedResult.countedRows > 0 ? amount(contributedResult.amount) : null,
    monthly: monthly !== null && monthly > 0 ? monthly : null,
    yearRecorded: progress && progress.plannedMonths > 0 ? amount(progress.actualAmount) : null,
    yearPlanned: progress && progress.plannedMonths > 0 ? amount(progress.plannedAmount) : null,
    year: current,
    goalAmount: null, goalYear: null, goalMode: null,
    simulationYear: validSim ? Number(simYear) : null,
    cautious: validSim ? amount(input.scenarioTotals?.cautious) : null,
    base: validSim ? amount(input.scenarioTotals?.base) : null,
    optimistic: validSim ? amount(input.scenarioTotals?.optimistic) : null,
  };
}
export function withSelectedGoal(facts: GeminiFacts, goal: Goal | null): GeminiFacts {
  // No implicit goal selection or default year. Never forward Goal.name/notes/id.
  if (!goal || goal.deletedAt || !validExitDate(goal.dueDate)) {
    return { ...facts, goalAmount: null, goalYear: null, goalMode: null };
  }
  return {
    ...facts, goalAmount: amount(goal.amount),
    goalYear: Number(goal.dueDate.slice(0, 4)),
    goalMode: goal.mode,
  };
}
/**
 * Raw question text stays on the device. Route supported Vietnamese/German
 * wording into fixed, finance-safe intents; unrecognized questions are rejected.
 * Optional year is context only: the server must never invent a year forecast.
 */
export function classifyGeminiQuestion(raw: string): { topic: GeminiTopic; queryYear: number | null } | null {
  const text = raw.normalize("NFKC").trim().toLocaleLowerCase();
  if (text.length < 3 || text.length > 160) return null;
  // Reject obvious PII; unrecognized queries are never sent to Google.
  if (/@|https?:|\biban\b|\bkontonummer\b|\bpasswort\b|\bpassword\b|\bpin\b|\b[A-Z]{2}\d{16,}\b/i.test(raw)) return null;
  const years = text.match(/\b20\d{2}\b/g) || [];
  if (years.length > 1) return null;
  const year = years.length ? Number(years[0]) : null;
  if (/(lãi|lỗ|chênh lệch|tăng giảm|lời hay lỗ|so với (số )?(tiền )?đã góp|gewinn|verlust|differenz|rendite|im plus|im minus)/i.test(text)) {
    return { topic: "difference", queryYear: null };
  }
  if (/(còn thiếu|còn bao xa|đã đạt.*mục tiêu|tiến độ mục tiêu|ziel.*erreicht|bis zum ziel|wie weit.*ziel|zielstand|zielbetrag)/i.test(text)) {
    return { topic: "goalProgress", queryYear: null };
  }
  if (/(simulation|szenari|mô phỏng|kịch bản)/i.test(text)) return { topic: "simulation", queryYear: year };
  if (/(mỗi tháng|hàng tháng|định kỳ|góp tháng|số tiền góp tháng|sparrate|monatlich|pro monat|monatsbeitrag)/i.test(text)) {
    return { topic: "monthly", queryYear: null };
  }
  if (/(giá trị quỹ|giá trị hiện tại|quỹ bây giờ|quỹ đang có|depotwert|aktueller wert|wert des depots)/i.test(text)) {
    return { topic: "value", queryYear: null };
  }
  if (/(dieses jahr|diesem jahr|eingezahlt|einzahlung|góp đủ|năm nay|đã góp trong năm|sparjahr)/i.test(text)) {
    return { topic: "year", queryYear: year };
  }
  if (year || /(ziel|goal|mục tiêu|mốc|đích|wann brauche|wenn ich geld brauche|sử dụng tiền)/i.test(text)) {
    return { topic: "goal", queryYear: year };
  }
  if (/(plan|sparen|sparm|überblick|erklären|giải thích|kế hoạch|quỹ của|tổng đã góp|đã góp)/i.test(text)) {
    return { topic: "plan", queryYear: null };
  }
  return null;
}
