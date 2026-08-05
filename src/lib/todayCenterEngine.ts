import {
  DEFAULT_TER,
  MAX_YEARS,
  clamp,
  projectEnd,
  purchasingPower,
} from "./simulation/engine";
import type { TodayCenterPriceSource } from "./todayCenterAdapter";

export type TodayCenterTraceSource =
  | "user_input"
  | "app_settings"
  | "simulation_default"
  | "explicit_input"
  | TodayCenterPriceSource;

export type TraceValue<T> = {
  value: T;
  source: TodayCenterTraceSource;
};

export type TodayCenterWhatIfTrace = {
  formula: "simulation.projectEnd+purchasingPower";
  amount: TraceValue<number>;
  vwcePrice: TraceValue<number | null>;
  years: TraceValue<number>;
  annualReturn: TraceValue<number>;
  inflation: TraceValue<number>;
  ter: TraceValue<number>;
};

export type TodayCenterWhatIfStatus = "ready" | "empty_amount" | "missing_price";

export type TodayCenterWhatIfInput = {
  amount: number;
  vwcePrice: number;
  priceSource?: TodayCenterPriceSource;
  years: number;
  annualReturn: number;
  inflation: number;
  ter?: number;
};

export type TodayCenterWhatIfResult = {
  status: TodayCenterWhatIfStatus;
  amount: number;
  vwcePrice: number | null;
  years: number;
  annualReturn: number;
  inflation: number;
  ter: number;
  extraUnits: number | null;
  futureNominal: number;
  futureReal: number;
  trace: TodayCenterWhatIfTrace;
};

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Uses the canonical simulation engine; it never writes a transaction. */
export function buildTodayCenterWhatIf({
  amount: rawAmount,
  vwcePrice: rawPrice,
  priceSource,
  years: rawYears,
  annualReturn: rawAnnualReturn,
  inflation: rawInflation,
  ter: rawTer,
}: TodayCenterWhatIfInput): TodayCenterWhatIfResult {
  const amount = Math.max(0, finiteOr(rawAmount, 0));
  const vwcePrice = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : null;
  const years = Math.floor(clamp(finiteOr(rawYears, 0), 0, MAX_YEARS));
  const annualReturn = clamp(finiteOr(rawAnnualReturn, 0), -0.95, 0.5);
  const inflation = clamp(finiteOr(rawInflation, 0), 0, 0.5);
  const ter = Math.max(0, finiteOr(rawTer ?? DEFAULT_TER, DEFAULT_TER));
  const projection = projectEnd({
    years,
    monthlyContribution: 0,
    annualReturn,
    initialBalance: 0,
    lumpSum: amount,
    annualContributionGrowth: 0,
    ter,
  });
  const futureNominal = projection.terminal;
  const futureReal = purchasingPower(futureNominal, inflation, years);
  const resolvedPriceSource: TodayCenterPriceSource = vwcePrice
    ? priceSource && priceSource !== "missing"
      ? priceSource
      : "auto_quote"
    : "missing";
  const status: TodayCenterWhatIfStatus = amount <= 0
    ? "empty_amount"
    : vwcePrice == null
      ? "missing_price"
      : "ready";

  return {
    status,
    amount,
    vwcePrice,
    years,
    annualReturn,
    inflation,
    ter,
    extraUnits: vwcePrice ? amount / vwcePrice : null,
    futureNominal,
    futureReal,
    trace: {
      formula: "simulation.projectEnd+purchasingPower",
      amount: { value: amount, source: "user_input" },
      vwcePrice: { value: vwcePrice, source: resolvedPriceSource },
      years: { value: years, source: "app_settings" },
      annualReturn: { value: annualReturn, source: "app_settings" },
      inflation: { value: inflation, source: "app_settings" },
      ter: {
        value: ter,
        source: rawTer == null || !Number.isFinite(rawTer) ? "simulation_default" : "explicit_input",
      },
    },
  };
}

export type TodayCenterSafetyKey = "backup" | "restore" | "offline" | "print";
export type TodayCenterSafetyReason =
  | "backup_missing"
  | "backup_fresh"
  | "backup_stale"
  | "restore_missing"
  | "restore_confirmed"
  | "offline_missing"
  | "offline_ready"
  | "print_missing"
  | "print_ready";

export type TodayCenterSafetyItem = {
  key: TodayCenterSafetyKey;
  ready: boolean;
  reason: TodayCenterSafetyReason;
};

export type TodayCenterSafetyInput = {
  backupAt?: string;
  restoreAt?: string;
  offlineReady: boolean;
  lastPrintedAt?: string;
  now?: string;
  maxBackupAgeDays?: number;
};

export type TodayCenterSafetyAssessment = {
  score: number;
  total: 4;
  highestRisk: TodayCenterSafetyKey | null;
  backupAgeDays: number | null;
  items: TodayCenterSafetyItem[];
};

function validTimestamp(value: string | undefined): boolean {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function ageInDays(value: string | undefined, now: string): number | null {
  if (!validTimestamp(value) || !validTimestamp(now)) return null;
  return Math.max(0, Math.floor((Date.parse(now) - Date.parse(value as string)) / 86_400_000));
}

export function buildTodayCenterSafety({
  backupAt,
  restoreAt,
  offlineReady,
  lastPrintedAt,
  now = new Date().toISOString(),
  maxBackupAgeDays = 30,
}: TodayCenterSafetyInput): TodayCenterSafetyAssessment {
  const backupAgeDays = ageInDays(backupAt, now);
  const backupReady = backupAgeDays !== null && backupAgeDays <= Math.max(0, maxBackupAgeDays);
  const restoreReady = validTimestamp(restoreAt);
  const printReady = validTimestamp(lastPrintedAt);
  const items: TodayCenterSafetyItem[] = [
    {
      key: "backup",
      ready: backupReady,
      reason: backupReady ? "backup_fresh" : backupAgeDays === null ? "backup_missing" : "backup_stale",
    },
    {
      key: "restore",
      ready: restoreReady,
      reason: restoreReady ? "restore_confirmed" : "restore_missing",
    },
    {
      key: "offline",
      ready: Boolean(offlineReady),
      reason: offlineReady ? "offline_ready" : "offline_missing",
    },
    {
      key: "print",
      ready: printReady,
      reason: printReady ? "print_ready" : "print_missing",
    },
  ];

  return {
    score: items.filter((item) => item.ready).length,
    total: 4,
    highestRisk: items.find((item) => !item.ready)?.key ?? null,
    backupAgeDays,
    items,
  };
}
