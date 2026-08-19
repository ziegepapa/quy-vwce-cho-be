import { useEffect, useState } from "react";
import { useLocale } from "../lib/locale";
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

function TimeDate() {
  const [clock, setClock] = useState<BerlinClock>(() => readBerlinClock());
  useEffect(() => {
    const id = window.setInterval(() => setClock(readBerlinClock()), 1_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <time className="bar-clock" dateTime={clock.iso} aria-label={`Giờ Berlin ${clock.time}`}>
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
}: {
  displayName: string;
  syncStatus: string;
  pending: number;
  onSignOut: () => void;
  onSyncNow?: () => void | Promise<unknown>;
  onUpdatePrice?: () => void;
  onSearch?: () => void;
  onFilter?: () => void;
  onAddGoal?: () => void;
  onChangeScenario?: () => void;
}) {
  void displayName;
  const { t } = useLocale();
  const syncing = syncStatus === "syncing";
  const syncText = syncing ? t("syncing") : pending > 0 ? `${pending} ${t("sync").toLowerCase()} chờ` : t("sync");
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
          <button type="button" className={`sync-pill ${syncStatus}`} onClick={() => void onSyncNow()} disabled={syncing} aria-live="polite">
            <span className={syncing ? "sync-spin" : ""} aria-hidden>↻</span>
            <span>{syncText}</span>
          </button>
        ) : null}
        <TimeDate />
      </div>
    </header>
  );
}
