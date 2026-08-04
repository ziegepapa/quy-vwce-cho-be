/**
 * Pure deterministic quote resolver — no I/O.
 * Policy locked in PR 2B Design Revision 2/3.
 */
import type { Quote, QuoteCandidate, QuotePreferenceMode, QuoteSourceKind } from "./types";
import { STALE_DAYS } from "./types";
import { calendarDaysBetween, isValidAsOfDate, quoteId, toDateOnly } from "./instrument";

export type CandidateStatus = "missing" | "valid-fresh" | "valid-stale" | "unusable";

export type ResolveInput = {
  mode: QuotePreferenceMode;
  auto?: QuoteCandidate | null;
  manual?: QuoteCandidate | null;
  nowDate?: string;
  /** Existing effective row (preserved only when chosen candidate matches economics). */
  existingEffective?: Quote | null;
};

export type ResolveResult = {
  /** Chosen candidate, or null when no usable effective. */
  chosen: QuoteCandidate | null;
  /** Materialized effective quote, or null to clear. */
  effective: Quote | null;
  reason: string;
};

function isShapeValid(c: QuoteCandidate | null | undefined): c is QuoteCandidate {
  if (!c) return false;
  if (c.source !== "manual" && c.source !== "auto") return false;
  if (typeof c.price !== "number" || !Number.isFinite(c.price) || c.price <= 0) return false;
  if (!isValidAsOfDate(c.asOf)) return false;
  return true;
}

/**
 * Classify a stored candidate.
 * - Future asOf (asOf > nowDate) → unusable (not fresh; do not auto-delete).
 * - Stale auto is still valid-stale (usable under fallback rules).
 */
export function classifyCandidate(
  c: QuoteCandidate | null | undefined,
  nowDate: string,
): CandidateStatus {
  if (!isShapeValid(c)) return c ? "unusable" : "missing";
  const age = calendarDaysBetween(c.asOf, nowDate);
  if (age < 0) return "unusable"; // future stored
  if (c.source === "auto" && age > STALE_DAYS) return "valid-stale";
  return "valid-fresh";
}

function materialize(
  chosen: QuoteCandidate,
  existing: Quote | null | undefined,
  t: string,
): Quote {
  return {
    id: quoteId(chosen.instrumentIsin, chosen.currency),
    instrumentIsin: chosen.instrumentIsin,
    currency: chosen.currency,
    venue: chosen.venue,
    price: chosen.price,
    asOf: chosen.asOf,
    source: chosen.source,
    provider: chosen.provider,
    providerUrl: chosen.providerUrl,
    crossCheckedWith: chosen.crossCheckedWith,
    crossCheckDifferencePct: chosen.crossCheckDifferencePct,
    fetchedAt: chosen.fetchedAt,
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  };
}

function pickUsable(
  status: CandidateStatus,
  c: QuoteCandidate | null | undefined,
): QuoteCandidate | null {
  if (status === "valid-fresh" || status === "valid-stale") return c ?? null;
  return null;
}

/**
 * Pure resolver matrix (Revision 2/3):
 * - mode manual + valid manual → manual
 * - mode auto + valid-fresh auto → auto
 * - mode auto + valid-stale auto + valid manual → manual
 * - mode auto + valid-stale auto + no manual → auto (stale still usable)
 * - unusable (corrupt / future stored) skipped; fallback other; else none
 * - never auto-deletes candidates
 */
export function resolveEffective(input: ResolveInput): ResolveResult {
  const nowDate = input.nowDate ?? toDateOnly();
  const mode: QuotePreferenceMode = input.mode === "manual" ? "manual" : "auto";
  const autoStatus = classifyCandidate(input.auto, nowDate);
  const manualStatus = classifyCandidate(input.manual, nowDate);
  const autoUsable = pickUsable(autoStatus, input.auto);
  const manualUsable = pickUsable(manualStatus, input.manual);
  const t = new Date().toISOString();

  let chosen: QuoteCandidate | null = null;
  let reason = "";

  if (mode === "manual") {
    if (manualUsable) {
      chosen = manualUsable;
      reason = "pref=manual, manual valid";
    } else if (autoUsable) {
      chosen = autoUsable;
      reason = "pref=manual, manual missing/unusable, soft-fallback auto";
    } else {
      reason = "pref=manual, no usable candidate";
    }
  } else {
    // mode auto
    if (autoStatus === "valid-fresh" && autoUsable) {
      chosen = autoUsable;
      reason = "pref=auto, auto fresh";
    } else if (autoStatus === "valid-stale" && autoUsable) {
      if (manualUsable) {
        chosen = manualUsable;
        reason = "pref=auto, auto stale, fallback manual";
      } else {
        chosen = autoUsable;
        reason = "pref=auto, auto stale, no manual";
      }
    } else if (manualUsable) {
      chosen = manualUsable;
      reason = "pref=auto, auto missing/unusable, manual";
    } else {
      reason = "pref=auto, no usable candidate";
    }
  }

  if (!chosen) {
    return { chosen: null, effective: null, reason };
  }
  return {
    chosen,
    effective: materialize(chosen, input.existingEffective, t),
    reason,
  };
}

export function defaultPreferenceMode(
  pref: { mode?: QuotePreferenceMode } | null | undefined,
): QuotePreferenceMode {
  return pref?.mode === "manual" ? "manual" : "auto";
}

export type { QuoteSourceKind };
