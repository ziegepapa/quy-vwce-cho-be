import { useCallback, useEffect, useRef, useState } from "react";
import type { SyncStatus } from "../lib/sync/types";
import { SYNC_STATUS_LABEL } from "../lib/sync/types";
import AvatarMenu, { avatarGradient } from "./AvatarMenu";
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
    const id = window.setInterval(() => setClock(readBerlinClock()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <time className="bar-clock" dateTime={clock.iso} aria-label={`Giờ Berlin ${clock.time}`}>
      {clock.time}
    </time>
  );
}

export default function CollapsingNavBar({
  displayName,
  syncStatus,
  pending,
  onSignOut,
  onSyncNow,
  onUpdatePrice,
  onSearch,
  onFilter,
  onAddGoal,
  onChangeScenario,
}: {
  displayName: string;
  syncStatus: SyncStatus;
  pending: number;
  onSignOut: () => void;
  onSyncNow?: () => void;
  onUpdatePrice?: () => void;
  onSearch?: () => void;
  onFilter?: () => void;
  onAddGoal?: () => void;
  onChangeScenario?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const initial = (displayName.trim()[0] || "?").toUpperCase();
  void onUpdatePrice;
  void onSearch;
  void onFilter;
  void onAddGoal;
  void onChangeScenario;

  useEffect(() => {
    document.documentElement.style.removeProperty("--nav-h-dyn");
  }, []);

  return (
    <>
      <header className="bar">
        <span className="bar-logo">VWCE Vault</span>
        <div className="bar-r">
          {onSyncNow ? (
            <button type="button" className="sync-pill" onClick={onSyncNow}>
              ↻ Sync
            </button>
          ) : null}
          <TimeDate />
          <button
            ref={triggerRef}
            type="button"
            className="bar-avatar"
            aria-label={`Menu tài khoản, ${SYNC_STATUS_LABEL[syncStatus]}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span className="bar-avatar-mark" style={{ background: avatarGradient(displayName) }}>{initial}</span>
            <span className={`bar-sync-dot ${syncStatus}`} aria-hidden />
          </button>
        </div>
      </header>
      <AvatarMenu
        open={menuOpen}
        onClose={closeMenu}
        displayName={displayName}
        syncStatus={syncStatus}
        pending={pending}
        onSignOut={onSignOut}
        onSyncNow={onSyncNow}
        triggerRef={triggerRef}
      />
    </>
  );
}
