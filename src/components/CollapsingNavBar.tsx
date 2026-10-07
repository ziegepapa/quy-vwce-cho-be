import { useEffect } from "react";
import { useLocale } from "../lib/locale";
import { syncHealthCopy, type SyncHealth } from "./syncHealth";
import { IconAlert, IconCheck, IconCircle, IconSync } from "./Icons";
import "../styles/visual-abc-shell.css";

const STATE_ICON: Record<SyncHealth["state"], () => JSX.Element> = {
  "signed-out": IconCircle,
  recovery: IconSync,
  conflict: IconAlert,
  retry: IconSync,
  offline: IconCircle,
  syncing: IconSync,
  pending: IconSync,
  synced: IconCheck,
};

export default function CollapsingNavBar({
  onSyncNow,
  onSignOut,
  onUpdatePrice,
  onSearch,
  onFilter,
  onAddGoal,
  onChangeScenario,
  displayName,
  syncStatus,
  pending,
  syncHealth,
}: {
  displayName: string;
  syncStatus: string;
  pending: number;
  syncHealth: SyncHealth;
  onSignOut: () => void;
  onSyncNow?: () => void | Promise<unknown>;
  onUpdatePrice?: () => void;
  onSearch?: () => void;
  onFilter?: () => void;
  onAddGoal?: () => void;
  onChangeScenario?: () => void;
}) {
  void displayName;
  const { locale, t } = useLocale();
  const syncing = syncHealth.state === "syncing";
  const healthCopy = syncHealthCopy(syncHealth, locale);
  const syncText = healthCopy.menuMeta;
  const StatusIcon = STATE_ICON[syncHealth.state];
  const attentionCount = syncHealth.conflicts + syncHealth.dead + syncHealth.pending;
  void onSignOut;
  void onUpdatePrice;
  void onSearch;
  void onFilter;
  void onAddGoal;
  void onChangeScenario;

  useEffect(() => {
    document.documentElement.style.removeProperty("--nav-h-dyn");
  }, []);

  return (
    <header className="bar">
      <span className="bar-logo">VWCE Vault</span>
      <div className="bar-r">
        {onSyncNow ? (
          <button type="button" className={`sync-iconbtn ${syncHealth.tone}`} onClick={() => void onSyncNow()} disabled={syncing || syncHealth.action === "none"} aria-live="polite" title={syncText} aria-label={syncText}>
            <span className={syncing ? "sync-spin" : ""} aria-hidden><StatusIcon /></span>
            {attentionCount > 0 ? <span className="sync-count" aria-hidden>{attentionCount}</span> : null}
          </button>
        ) : null}
      </div>
    </header>
  );
}
