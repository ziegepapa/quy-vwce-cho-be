import type { SyncStatus } from "../lib/sync/types";
import type { HouseholdHandoff } from "./householdHandoff";

export type ContinuitySnapshot = {
  planName: string;
  targetUseDate: string | null;
  planStatus: string | null;
  yearsLeft: number | null;
  readiness: { complete: number; total: number };
  sync: { status: SyncStatus; pending: number };
};

/**
 * Print-safe handoff summary. The allowlist intentionally excludes child name,
 * contact/document details, account data, transactions, money and free text.
 */
export function buildContinuitySnapshot(input: {
  handoff: HouseholdHandoff;
  syncStatus: SyncStatus;
  pending: number;
}): ContinuitySnapshot {
  return {
    planName: input.handoff.planName,
    targetUseDate: input.handoff.targetUseDate,
    planStatus: input.handoff.planStatus,
    yearsLeft: input.handoff.yearsLeft,
    readiness: {
      complete: input.handoff.readiness.complete,
      total: input.handoff.readiness.total,
    },
    sync: {
      status: input.syncStatus,
      pending: Math.max(0, Math.trunc(input.pending)),
    },
  };
}
