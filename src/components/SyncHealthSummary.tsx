import { useLocale } from "../lib/locale";
import { syncHealthCopy, type SyncHealth } from "./syncHealth";
import "../styles/sync-health.css";

const ICON: Record<SyncHealth["state"], string> = {
  "signed-out": "○",
  recovery: "↻",
  conflict: "!",
  retry: "↻",
  offline: "○",
  syncing: "↻",
  pending: "↻",
  synced: "✓",
};

export function SyncHealthSummary({
  health,
  onAction,
  compact = false,
}: {
  health: SyncHealth;
  onAction?: () => void;
  compact?: boolean;
}) {
  const { locale } = useLocale();
  const copy = syncHealthCopy(health, locale);
  const actionable = Boolean(copy.actionLabel && onAction && health.action !== "none");
  return (
    <section
      className={`sync-health sync-health-${health.tone}${compact ? " sync-health-compact" : ""}`}
      role={health.tone === "blocked" ? "alert" : "status"}
      aria-live="polite"
      data-sync-health={health.state}
    >
      <span className={`sync-health-icon${health.state === "syncing" ? " is-running" : ""}`} aria-hidden>{ICON[health.state]}</span>
      <span className="sync-health-copy">
        <strong>{copy.title}</strong>
        {!compact ? <small>{copy.detail}</small> : null}
        {!compact ? <small className="sync-health-next-step">{copy.nextStep}</small> : null}
      </span>
      {actionable ? (
        <button type="button" className="sync-health-action" onClick={onAction}>
          {copy.actionLabel}
        </button>
      ) : null}
    </section>
  );
}
