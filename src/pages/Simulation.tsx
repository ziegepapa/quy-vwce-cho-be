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

// TEMPORARY STUB — will be replaced with full file in next commit
export default function Simulation() {
  return <p className="muted">Đang tải…</p>;
}
