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
import {
  MAX_YEARS,
  DEFAULT_TER,
  clamp,
  estimateGermanExitTax,
  findMonthlyForTarget,
  findYearsForTarget,
  moneyEq,
  projectEnd,
  purchasingPower,
  rateEq,
} from "../lib/simulation/engine";
import type { Scenario, YearPoint, ProjectInput, ProjectOutput } from "../lib/simulation/engine";

/**
 * Mô phỏng v2 — ba chế độ, một hàm tính cuối kỳ chung.
 *
 * A: góp X/tháng → sau N năm được bao nhiêu
 * B: muốn Y vào năm Z → phải góp bao nhiêu (chặt nhị phân trên A)
 * C: góp X/tháng → bao giờ đủ Y (chặt nhị phân trên A)
 */

type Mode = "A" | "B" | "C";

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
  return (v < 0 ? "−" : "") + s + " €";
}

const DEFAULT_SCENARIOS: Scenario[] = [
  { id: "cautious", label: "Thận trọng", rate: 0.04 },
  { id: "base", label: "Cơ sở", rate: 0.065 },
  { id: "bull", label: "Thuận lợi", rate: 0.085 },
];

export default function Simulation() {
  // TRUNCATED FOR TEST - WILL REPLACE
  return null;
}
