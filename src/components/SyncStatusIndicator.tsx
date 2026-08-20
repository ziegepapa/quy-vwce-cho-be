import { SYNC_STATUS_LABEL, type SyncStatus } from "../lib/sync/types";
import { useLocale } from "../lib/locale";

const ICONS: Record<SyncStatus, string> = {
  synced: "✓",
  syncing: "↻",
  offline: "○",
  conflict: "!",
};

const GERMAN_SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
  synced: "Synchronisiert",
  syncing: "Synchronisierung läuft…",
  offline: "Offline",
  conflict: "Konflikte prüfen",
};

export function SyncStatusIndicator({
  status,
  pending = 0,
}: {
  status: SyncStatus;
  pending?: number;
}) {
  const { locale } = useLocale();
  const label = mapSyncStatusLabel(status, locale);
  const pendingText = pending > 0 ? ` · ${pending} ${locale === "de" ? "ausstehend" : "chờ"}` : "";
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

export function mapSyncStatusLabel(status: SyncStatus, locale: "vi" | "de" = "vi"): string {
  return locale === "de" ? GERMAN_SYNC_STATUS_LABEL[status] : SYNC_STATUS_LABEL[status];
}
