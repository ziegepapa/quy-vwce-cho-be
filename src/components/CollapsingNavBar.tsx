import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import type { SyncStatus } from "../lib/sync/types";
import { SYNC_STATUS_LABEL } from "../lib/sync/types";
import AvatarMenu, { avatarGradient } from "./AvatarMenu";

const TITLES: Record<string, string> = {
  "/": "Tổng quan",
  "/transactions": "Giao dịch",
  "/goals": "Mục tiêu",
  "/simulation": "Mô phỏng",
  "/settings": "Cài đặt",
};

function syncRingClass(status: SyncStatus): string {
  if (status === "synced") return "sync-ring synced";
  if (status === "syncing") return "sync-ring syncing";
  if (status === "conflict") return "sync-ring conflict";
  return "sync-ring offline";
}

export default function CollapsingNavBar({
  displayName,
  syncStatus,
  pending,
  onSignOut,
  onSyncNow,
}: {
  displayName: string;
  syncStatus: SyncStatus;
  pending: number;
  onSignOut: () => void;
  onSyncNow?: () => void;
}) {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? "Quỹ VWCE";
  const [progress, setProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const reduced = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  )[0];

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      const p = Math.min(1, Math.max(0, y / 24));
      setProgress(reduced ? (y > 12 ? 1 : 0) : p);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [reduced]);

  const initial = (displayName.trim()[0] || "?").toUpperCase();
  const condensed = progress > 0.5;
  const h = 56 - progress * 8;

  return (
    <>
      <header
        className={`collapse-nav${condensed ? " is-condensed" : ""}`}
        style={{
          ["--nav-h-dyn" as string]: `${h}px`,
        }}
      >
        <div className="collapse-nav-inner">
          <div className="nav-leading">
            <span className="nav-logo" aria-hidden />
            <h1 className="collapse-nav-title">{title}</h1>
          </div>
          <div className="collapse-nav-right">
            <button
              type="button"
              className="avatar-btn-wrap"
              aria-label={`Menu tài khoản, ${SYNC_STATUS_LABEL[syncStatus]}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span
                className="avatar avatar-sm"
                style={{ background: avatarGradient(displayName) }}
              >
                {initial}
              </span>
              <span className={syncRingClass(syncStatus)} aria-hidden />
            </button>
          </div>
        </div>
      </header>
      <div className="nav-spacer" aria-hidden style={{ height: `calc(${h}px + env(safe-area-inset-top, 0px))` }} />
      <AvatarMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        displayName={displayName}
        syncStatus={syncStatus}
        pending={pending}
        onSignOut={onSignOut}
        onSyncNow={onSyncNow}
      />
    </>
  );
}
