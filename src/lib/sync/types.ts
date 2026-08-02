/** Shared sync status — UI đoạn 3 sẽ tái sử dụng */
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
  /** true khi đã thử đủ lần và bỏ qua trong push — bản ghi cũ không có field này vẫn hợp lệ */
  dead?: boolean;
};

export type ConflictRecord = {
  id: string;
  table: EntityTable;
  entityId: string;
  local: unknown;
  remote: unknown;
  detectedAt: string;
  resolved?: "local" | "remote";
};

export type SyncMeta = {
  id: string; // `user_${userId}`
  userId: string;
  lastPulledAt: string;
  lastPushedAt: string;
  migrateWizardDone: boolean;
  migrateWizardSkipped: boolean;
  updatedAt: string;
};
