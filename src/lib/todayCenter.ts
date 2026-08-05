export type PortfolioPulseSample = {
  capturedAt: string;
  totalValue: number;
  totalQuantity: number;
};

export type PortfolioPulseState = {
  version: 1;
  current: PortfolioPulseSample;
  previous?: PortfolioPulseSample;
};

export type PortfolioPulseDelta = {
  value: number;
  valuePct: number | null;
  quantity: number;
  since: string;
};

const PULSE_KEY_PREFIX = "vwce.today-center.pulse.v1";
const RESTORE_KEY_PREFIX = "vwce.today-center.restore.v1";
export const PULSE_DEDUPE_MS = 60_000;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function normalizedSample(sample: PortfolioPulseSample): PortfolioPulseSample {
  const parsedAt = Date.parse(sample.capturedAt);
  return {
    capturedAt: Number.isFinite(parsedAt) ? sample.capturedAt : new Date(0).toISOString(),
    totalValue: finite(sample.totalValue),
    totalQuantity: Math.max(0, finite(sample.totalQuantity)),
  };
}

function pulseKey(ownerKey: string): string {
  return `${PULSE_KEY_PREFIX}:${encodeURIComponent(ownerKey || "local")}`;
}

function restoreKey(ownerKey: string): string {
  return `${RESTORE_KEY_PREFIX}:${encodeURIComponent(ownerKey || "local")}`;
}

function isPulseState(value: unknown): value is PortfolioPulseState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PortfolioPulseState>;
  return candidate.version === 1 && !!candidate.current && typeof candidate.current.capturedAt === "string";
}

/**
 * Advances the "last meaningful app open" baseline. React StrictMode and fast
 * rerenders inside one minute update the current sample without creating a fake
 * zero-delta visit.
 */
export function advancePortfolioPulse(
  state: PortfolioPulseState | null,
  sample: PortfolioPulseSample,
  dedupeMs = PULSE_DEDUPE_MS,
): PortfolioPulseState {
  const current = normalizedSample(sample);
  if (!state) return { version: 1, current };

  const previousCaptured = Date.parse(state.current.capturedAt);
  const nextCaptured = Date.parse(current.capturedAt);
  const gap = nextCaptured - previousCaptured;
  if (Number.isFinite(gap) && gap >= 0 && gap < dedupeMs) {
    return {
      ...state,
      current: { ...current, capturedAt: state.current.capturedAt },
    };
  }

  return {
    version: 1,
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
    const parsed: unknown = JSON.parse(raw);
    return isPulseState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function recordPortfolioPulse(
  ownerKey: string,
  sample: PortfolioPulseSample,
): PortfolioPulseState {
  const next = advancePortfolioPulse(readPortfolioPulse(ownerKey), sample);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(pulseKey(ownerKey), JSON.stringify(next));
    } catch {
      // Storage can be unavailable in private mode; the UI still works for this visit.
    }
  }
  return next;
}

export function markRestoreCompleted(
  ownerKey: string,
  completedAt = new Date().toISOString(),
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(restoreKey(ownerKey), completedAt);
  } catch {
    // Best-effort readiness signal only; the imported data is already durable.
  }
}

export function readRestoreCompleted(ownerKey: string): string {
  if (typeof localStorage === "undefined") return "";
  try {
    return localStorage.getItem(restoreKey(ownerKey)) ?? "";
  } catch {
    return "";
  }
}
