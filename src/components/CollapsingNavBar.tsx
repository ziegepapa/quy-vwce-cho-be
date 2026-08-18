import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { SyncStatus } from "../lib/sync/types";
import { SYNC_STATUS_LABEL } from "../lib/sync/types";
import AvatarMenu, { avatarGradient } from "./AvatarMenu";
import "../styles/visual-abc-shell.css";

const TITLES: Record<string, string> = {
  "/": "Tổng quan",
  "/transactions": "Giao dịch",
  "/goals": "Mục tiêu",
  "/simulation": "Mô phỏng",
  "/settings": "Cài đặt",
  "/notfallmappe": "Hồ sơ khẩn cấp",
};

type BerlinClock = { iso: string; time: string; date: string };

function readBerlinClock(): BerlinClock {
  const now = new Date();
  return {
    iso: now.toISOString(),
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(now),
    date: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric",
    }).format(now),
  };
}

function TimeDate() {
  const [clock, setClock] = useState<BerlinClock>(() => readBerlinClock());
  useEffect(() => {
    const tick = () => setClock(readBerlinClock());
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="visual-abc-clock" aria-label={`Giờ Berlin ${clock.time}, ngày ${clock.date}`}>
      <time dateTime={clock.iso}>{clock.time}</time>
      <time dateTime={clock.iso}>{clock.date}</time>
    </div>
  );
}

function syncClass(status: SyncStatus): string {
  return `visual-abc-sync visual-abc-sync-${status}`;
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
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const title = TITLES[pathname] ?? "Quỹ VWCE";
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
      <header className="visual-abc-bar">
        <div className="visual-abc-bar-inner">
          <div className="visual-abc-brand">
            <span className="visual-abc-logo" aria-hidden />
            <div>
              {pathname === "/" ? <span className="visual-abc-context">Quỹ dài hạn</span> : null}
              <h1>{title}</h1>
            </div>
          </div>
          <TimeDate />
          <button
            ref={triggerRef}
            type="button"
            className="visual-abc-avatar-button"
            aria-label={`Menu tài khoản, ${SYNC_STATUS_LABEL[syncStatus]}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span className="visual-abc-avatar" style={{ background: avatarGradient(displayName) }}>{initial}</span>
            <span className={syncClass(syncStatus)} aria-hidden />
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
