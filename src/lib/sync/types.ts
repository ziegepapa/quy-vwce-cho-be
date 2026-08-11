/** Shared sync status — UI giai đoạn 3 sẽ tái sử dụng */
export type SyncStatus = "synced" | "syncing" | "offline" | "conflict";

export const SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
  synced: "Đã đồng bộ",
  syncing: "Đang đồng bộ",
  offline: "Ngoại tuyến",
  conflict: "Có xung đột",
};

export type EntityTable =
  | "settings"
  | "goals"
  | "transactions"
  | "annualChecklists"
  | "monthlySnapshots";

export type OutboxOp = "upsert" | "delete";

export type OutboxItem = {
  id: string;
  table: EntityTable;
  entityId: string;
  op: OutboxOp;
  payload: unknown;
  version: number;
  createdAt: string;
  attempts: number;
  lastError?: string;
  /**
   * Conflict-derived local wins use an atomic PostgREST UPDATE guarded by this
   * remote row version. Zero updated rows is a hard mismatch; it must never
   * fall back to an unconditional upsert.
   */
  expectedRemoteVersion?: number;
  /** true khi đã thất bại ≥ 8 lần — bỏ qua khi đẩy, có thể thử lại từ Cài đặt */
  dead?: boolean;
};

export type ConflictResolution = "local" | "remote" | "remote-deleted";

export type ConflictRecord = {
  id: string;
  table: EntityTable;
  entityId: string;
  local: unknown;
  remote: unknown;
  detectedAt: string;
  /**
   * V2 metadata comes from the remote row wrapper, never from row.data.
   * Missing formatVersion/metadata identifies a legacy conflict that must be
   * refetched before either resolution choice.
   */
  formatVersion?: 2;
  remoteVersion?: number | null;
  remoteUpdatedAt?: string | null;
  remoteDeletedAt?: string | null;
  /** Display-only hint read from the local payload when present. */
  localUpdatedAt?: string | null;
  resolved?: ConflictResolution;
};

export type ResolveConflictResult =
  | { status: "resolved-local" }
  | { status: "resolved-remote" }
  | { status: "remote-deleted" }
  | { status: "needs-network-verification"; reason: string }
  | { status: "failed"; reason: string };

export type SyncMeta = {
  id: string; // `user_${userId}`
  userId: string;
  lastPulledAt: string;
  lastPushedAt: string;
  migrateWizardDone: boolean;
  migrateWizardSkipped: boolean;
  updatedAt: string;
};
