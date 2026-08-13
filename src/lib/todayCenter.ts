export type PortfolioPulseSample = {
  capturedAt: string;
  totalValue: number;
  totalQuantity: number;
};

export type PortfolioPulseStoredSample = PortfolioPulseSample & {
  /** One JavaScript app lifetime. Stable across rerenders and route changes. */
  visitId: string;
};

export type PortfolioPulseState = {
  version: 2;
  current: PortfolioPulseStoredSample;
  previous?: PortfolioPulseStoredSample;
};

export type PortfolioPulseDelta = {
  value: number;
  valuePct: number | null;
  quantity: number;
  since: string;
};

type LegacyPortfolioPulseState = {
  version: 1;
  current: PortfolioPulseSample;
  previous?: PortfolioPulseSample;
};

const PULSE_KEY_PREFIX = "vwce.today-center.pulse.v1";
const RESTORE_KEY_PREFIX = "vwce.today-center.restore.v1";

/** @deprecated Pulse visits are now identified explicitly instead of by time. */
export const PULSE_DEDUPE_MS = 60_000;

function createVisitId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const RUNTIME_VISIT_ID = createVisitId();

/** Stable for the current app runtime; a full reload/PWA launch creates a new visit. */
export function portfolioPulseVisitId(): string {
  return RUNTIME_VISIT_ID;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeVisitId(value: string): string {
  return value.trim() || "local-visit";
}

function normalizedSample(
  sample: PortfolioPulseSample,
  visitId: string,
): PortfolioPulseStoredSample {
  const parsedAt = Date.parse(sample.capturedAt);
  return {
    capturedAt: Number.isFinite(parsedAt) ? sample.capturedAt : new Date(0).toISOString(),
    totalValue: finite(sample.totalValue),
    totalQuantity: Math.max(0, finite(sample.totalQuantity)),
    visitId: normalizeVisitId(visitId),
  };
}

function parseStoredSample(
  value: unknown,
  fallbackVisitId: string,
): PortfolioPulseStoredSample | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PortfolioPulseStoredSample>;
  if (
    typeof candidate.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.capturedAt)) ||
    typeof candidate.totalValue !== "number" ||
    !Number.isFinite(candidate.totalValue) ||
    typeof candidate.totalQuantity !== "number" ||
    !Number.isFinite(candidate.totalQuantity)
  ) {
    return null;
  }
  return normalizedSample(
    candidate as PortfolioPulseSample,
    typeof candidate.visitId === "string" ? candidate.visitId : fallbackVisitId,
  );
}

function parsePulseState(value: unknown): PortfolioPulseState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    version?: unknown;
    current?: unknown;
    previous?: unknown;
  };

  if (candidate.version === 2) {
    const current = parseStoredSample(candidate.current, "stored-current");
    if (!current) return null;
    const previous = parseStoredSample(candidate.previous, "stored-previous");
    return { version: 2, current, ...(previous ? { previous } : {}) };
  }

  if (candidate.version === 1) {
    const legacy = candidate as LegacyPortfolioPulseState;
    const current = parseStoredSample(legacy.current, "legacy-current");
    if (!current) return null;
    const previous = parseStoredSample(legacy.previous, "legacy-previous");
    return { version: 2, current, ...(previous ? { previous } : {}) };
  }

  return null;
}

function pulseKey(ownerKey: string): string {
  return `${PULSE_KEY_PREFIX}:${encodeURIComponent(ownerKey || "local")}`;
}

function restoreKey(ownerKey: string): string {
  return `${RESTORE_KEY_PREFIX}:${encodeURIComponent(ownerKey || "local")}`;
}

/**
 * Advances the baseline only when a new app visit is observed. Rerenders,
 * refreshes and data updates inside the same runtime update the current sample
 * without silently turning it into a new visit after an arbitrary timeout.
 */
export function advancePortfolioPulse(
  state: PortfolioPulseState | null,
  sample: PortfolioPulseSample,
  visitId = RUNTIME_VISIT_ID,
): PortfolioPulseState {
  const current = normalizedSample(sample, visitId);
  if (!state) return { version: 2, current };

  if (state.current.visitId === current.visitId) {
    return {
      ...state,
      current: { ...current, capturedAt: state.current.capturedAt },
    };
  }

  return {
    version: 2,
    previous: state.current,
    current,
  };
}

export function portfolioPulseDelta(
  state: PortfolioPulseState | null,
): PortfolioPulseDelta | null {
  if (!state?.previous) return null;
  const value = state.current.totalValue - state.previous.totalValue;
  const quantity = state.current.totalQuantity - state.previous.totalQuantity;
  const valuePct =
    Math.abs(state.previous.totalValue) > 0
      ? (value / Math.abs(state.previous.totalValue)) * 100
      : null;
  return { value, valuePct, quantity, since: state.previous.capturedAt };
}

export function readPortfolioPulse(ownerKey: string): PortfolioPulseState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(pulseKey(ownerKey));
    if (!raw) return null;
    return parsePulseState(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function recordPortfolioPulse(
  ownerKey: string,
  sample: PortfolioPulseSample,
  visitId = RUNTIME_VISIT_ID,
): PortfolioPulseState {
  const next = advancePortfolioPulse(readPortfolioPulse(ownerKey), sample, visitId);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(pulseKey(ownerKey), JSON.stringify(next));
    } catch {
      // Best-effort UI history only; portfolio data remains in the ledger.
    }
  }
  return next;
}

/**
 * Records only a reliable valuation. Missing or stale prices preserve the last
 * trusted local baseline and can never create a misleading visit-to-visit delta.
 */
export function recordEligiblePortfolioPulse(
  ownerKey: string,
  sample: PortfolioPulseSample,
  eligible: boolean,
  visitId = RUNTIME_VISIT_ID,
): PortfolioPulseState | null {
  return eligible
    ? recordPortfolioPulse(ownerKey, sample, visitId)
    : readPortfolioPulse(ownerKey);
}

export function markRestoreCompleted(
  ownerKey: string,
  completedAt = new Date().toISOString(),
): void {
  if (typeof localStorage === "undefined" || !Number.isFinite(Date.parse(completedAt))) return;
  try {
    localStorage.setItem(restoreKey(ownerKey), completedAt);
  } catch {
    // Best-effort readiness signal only; the imported data is already durable.
  }
}

export function readRestoreCompleted(ownerKey: string): string {
  if (typeof localStorage === "undefined") return "";
  try {
    const value = localStorage.getItem(restoreKey(ownerKey)) ?? "";
    return Number.isFinite(Date.parse(value)) ? value : "";
  } catch {
    return "";
  }
}
