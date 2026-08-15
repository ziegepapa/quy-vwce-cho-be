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

export type RecoveryState = "required" | "queued" | "verifying" | "conflict" | "complete";

export type OutboxCommon = {
  id: string;
  table: EntityTable;
  entityId: string;
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
  dead?: boolean;
};

export type OrdinaryOutboxItem = OutboxCommon & {
  op: "upsert" | "delete";
  version: number;
  expectedRemoteVersion?: number;
  /** Present only when an explicit recovery conflict choice produced this guarded write. */
  recoverySessionId?: string;
};

export type RecoveryOutboxItem = OutboxCommon & {
  op: "recover";
  recoverySessionId: string;
  sourceLocalVersion: number | null;
  /** Set before insert-only so an ambiguous response can be verified idempotently. */
  createAttempted?: boolean;
};

export type OutboxOp = OrdinaryOutboxItem["op"] | RecoveryOutboxItem["op"];
export type OutboxItem = OrdinaryOutboxItem | RecoveryOutboxItem;

/**
 * DELETE-TOMBSTONE-BACKUP-001 — ảnh chụp outbox trước một thao tác xoá-rồi-ghi-lại
 * toàn bộ dữ liệu cục bộ (khôi phục sao lưu).
 *
 * `deletes` là con số quan trọng: một việc "delete" chưa đẩy là đường DUY NHẤT để
 * máy chủ biết dòng đó đã bị xoá.
 *
 * PR3 — gate không còn hẹp ở việc xoá. `total` và `conflicts` là hai con số quyết
 * định: nhập sao lưu xoá sạch `outbox` VÀ `conflicts`, nên BẤT KỲ việc đồng bộ nào
 * còn treo (kể cả một `upsert` bình thường) đều mất vĩnh viễn, và một xung đột
 * chưa xử lý sẽ biến mất mà người dùng chưa từng chọn bên nào.
 *
 * Ba trường mới để TUỲ CHỌN có chủ ý: `pendingSyncImportBlock` nhận diện lỗi theo
 * hình dạng khi nó đi qua ranh giới module, và những payload cũ chỉ mang ba trường
 * đầu vẫn phải được nhận ra.
 */
export type PendingSyncSummary = {
  total: number;
  deletes: number;
  dead: number;
  upserts?: number;
  recovers?: number;
  /** Số xung đột CHƯA xử lý (`db.conflicts` với `resolved` còn trống). */
  conflicts?: number;
};

export type RecoverySessionResult =
  | { status: "queued"; confirmed: number; pending: number }
  | { status: "confirmed"; confirmed: number }
  | { status: "conflict"; confirmed: number; conflicts: number }
  | { status: "unverified"; confirmed: number; pending: number };

export type ConflictResolution = "local" | "remote" | "remote-deleted";

export type LocalSyncPendingReason = "offline" | "sync-temporarily-unavailable";
export type LocalPendingConflictReason =
  | "server-version-changed"
  | "guarded-update-not-applied"
  | "recovery-remote-diverged";
export type NetworkVerificationReason =
  | "offline"
  | "remote-verification-unavailable"
  | "remote-version-unavailable";
export type ConflictResolutionFailureReason =
  | "conflict-not-found"
  | "local-state-unavailable"
  | "atomic-resolution-failed";

export type ConflictRecord = {
  id: string;
  table: EntityTable;
  entityId: string;
  local: unknown;
  remote: unknown;
  detectedAt: string;
  formatVersion?: 2;
  remoteVersion?: number | null;
  remoteUpdatedAt?: string | null;
  remoteDeletedAt?: string | null;
  localUpdatedAt?: string | null;
  reasonCategory?: LocalPendingConflictReason;
  sourceOutboxId?: string;
  supersedesConflictId?: string;
  resolved?: ConflictResolution;
};

export type ResolveConflictResult =
  | { status: "resolved-local" }
  | { status: "resolved-local-sync-pending"; reason: LocalSyncPendingReason }
  | { status: "resolved-local-pending-conflict"; reason: LocalPendingConflictReason }
  | { status: "resolved-remote" }
  | { status: "remote-deleted" }
  | { status: "needs-network-verification"; reason: NetworkVerificationReason }
  | { status: "failed"; reason: ConflictResolutionFailureReason };

export type SyncMeta = {
  id: string;
  userId: string;
  lastPulledAt: string;
  lastPushedAt: string;
  migrateWizardDone: boolean;
  migrateWizardSkipped: boolean;
  recoverySessionId?: string;
  recoveryState?: RecoveryState;
  recoveryTotal?: number;
  recoveryConfirmed?: number;
  updatedAt: string;
};
