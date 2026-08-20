import { useEffect, useState } from "react";
import { useLocale } from "../lib/locale";
import { syncHealthCopy, type SyncHealth } from "./syncHealth";
import "../styles/visual-abc-shell.css";

type BerlinClock = { iso: string; time: string };

function readBerlinClock(): BerlinClock {
  const now = new Date();
  return {
    iso: now.toISOString(),
    time: new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now),
  };
}

function TimeDate({ locale }: { locale: "vi" | "de" }) {
  const [clock, setClock] = useState<BerlinClock>(() => readBerlinClock());
  useEffect(() => {
    const id = window.setInterval(() => setClock(readBerlinClock()), 1_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <time className="bar-clock" dateTime={clock.iso} aria-label={`${locale === "de" ? "Berliner Zeit" : "Giờ Berlin"} ${clock.time}`}>
      {clock.time}
    </time>
  );
}

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
          <button type="button" className={`sync-pill ${syncHealth.tone}`} onClick={() => void onSyncNow()} disabled={syncing || syncHealth.action === "none"} aria-live="polite">
            <span className={syncing ? "sync-spin" : ""} aria-hidden>{syncHealth.state === "synced" ? "✓" : syncHealth.state === "conflict" ? "!" : "↻"}</span>
            <span>{syncText}</span>
          </button>
        ) : null}
        <TimeDate locale={locale} />
      </div>
    </header>
  );
}
