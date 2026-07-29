import { SYNC_STATUS_LABEL, type SyncStatus } from "../lib/sync/types";

const ICONS: Record<SyncStatus, string> = {
  synced: "✓",
  syncing: "↻",
  offline: "○",
  conflict: "!",
};

export function SyncStatusIndicator({
  status,
  pending = 0,
}: {
  status: SyncStatus;
  pending?: number;
}) {
  const label = SYNC_STATUS_LABEL[status];
  const pendingText = pending > 0 ? ` · ${pending} chờ` : "";
  return (
    <span
      className={`sync-badge ${status}`}
      role="status"
      aria-label={`${label}${pendingText}`}
      title={`${label}${pendingText}`}
    >
      <span className="sync-dot" aria-hidden />
      <span aria-hidden>{ICONS[status]}</span>
      {label}
      {pending > 0 && <span> · {pending}</span>}
    </span>
  );
}

export function mapSyncStatusLabel(status: SyncStatus): string {
  return SYNC_STATUS_LABEL[status];
}
