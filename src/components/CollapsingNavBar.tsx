import { useCallback, useEffect, useRef, useState } from "react";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const lastNavH = useRef<string | null>(null);
  const reduced = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  )[0];

  const closeMenu = useCallback(() => setMenuOpen(false), []);

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

  const h = 56 - progress * 8;
  const condensed = progress > 0.5;

  // Ghi --nav-h-dyn lên documentElement. Bắt buộc phải ở :root vì
  // .collapse-nav và .avatar-menu-portal nằm ở hai cây DOM khác nhau.
  useEffect(() => {
    const value = `${h}px`;
    if (lastNavH.current === value) return;

    const raf = requestAnimationFrame(() => {
      document.documentElement.style.setProperty("--nav-h-dyn", value);
      lastNavH.current = value;
    });

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [h]);

  useEffect(() => {
    return () => {
      document.documentElement.style.removeProperty("--nav-h-dyn");
    };
  }, []);

  const initial = (displayName.trim()[0] || "?").toUpperCase();

  return (
    <>
      <header className={`collapse-nav${condensed ? " is-condensed" : ""}`}>
        <div className="collapse-nav-inner">
          <div className="nav-leading">
            <span className="nav-logo" aria-hidden />
            <h1 className="collapse-nav-title">{title}</h1>
          </div>
          <div className="collapse-nav-right">
            <button
              ref={triggerRef}
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
              <span
                className={syncRingClass(syncStatus)}
                aria-label={SYNC_STATUS_LABEL[syncStatus]}
              />
            </button>
          </div>
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
