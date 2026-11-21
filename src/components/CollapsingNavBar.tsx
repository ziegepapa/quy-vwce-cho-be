import { useEffect, type JSX } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "../lib/locale";
import { syncHealthCopy, type SyncHealth } from "./syncHealth";
import { IconAlert, IconBell, IconCheck, IconCircle, IconSync } from "./Icons";
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
  isOverview,
  syncStatus,
  pending,
  syncHealth,
}: {
  isOverview: boolean;
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
  const { locale, t } = useLocale();
  const hour = new Date().getHours();
  const greetings = locale === "de"
    ? ["Guten Morgen", "Guten Tag", "Guten Abend"]
    : ["Chào buổi sáng", "Chào buổi chiều", "Chào buổi tối"];
  const greeting = greetings[hour < 12 ? 0 : hour < 18 ? 1 : 2];
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
      {isOverview ? (
        <div className="mwj-overview-brand">
          <h1 className="mwj-hero-hello">{greeting} <span aria-hidden="true">👋</span></h1>
          <p className="mwj-hero-sub">{t("tagline")}</p>
        </div>
      ) : (
        <div className="mwj-brand"><span className="mwj-brand-mark" aria-hidden="true">✦</span><span className="bar-logo">VWCE Vault</span></div>
      )}
      <div className="bar-r">
        {isOverview ? (
          <Link to="/timeline" className="mwj-overview-bell mwj-hero-bell" aria-label={locale === "de" ? "Neueste Aktivitäten" : "Hoạt động gần đây"}>
            <IconBell />
          </Link>
        ) : null}
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
