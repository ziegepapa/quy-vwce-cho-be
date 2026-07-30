import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";
import type { SyncStatus } from "../lib/sync/types";
import { SYNC_STATUS_LABEL } from "../lib/sync/types";

const TITLES: Record<string, string> = {
  "/": "Tổng quan",
  "/transactions": "Giao dịch",
  "/goals": "Mục tiêu",
  "/simulation": "Mô phỏng",
  "/settings": "Cài đặt",
};

function syncDotColor(status: SyncStatus): string {
  if (status === "synced") return "var(--success-600)";
  if (status === "syncing") return "var(--primary-500)";
  if (status === "conflict") return "var(--warning-600)";
  return "var(--text-tertiary)";
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
  const menuRef = useRef<HTMLDivElement>(null);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function onScroll() {
      const y = window.scrollY;
      const p = Math.min(1, Math.max(0, y / 24));
      setProgress(reduced.current ? (y > 12 ? 1 : 0) : p);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const initial = (displayName.trim()[0] || "?").toUpperCase();
  const condensed = progress > 0.5;
  const h = 52 - progress * 8;
  const titleSize = 22 - progress * 5;
  const titleWeight = progress > 0.5 ? 600 : 700;

  const style: CSSProperties = {
    // @ts-expect-error CSS custom properties
    "--nav-progress": String(progress),
    "--nav-h-dyn": `${h}px`,
    "--nav-title-size": `${titleSize}px`,
    "--nav-title-weight": String(titleWeight),
  };

  return (
    <header className={`collapse-nav${condensed ? " is-condensed" : ""}`} style={style}>
      <div className="collapse-nav-inner">
        <h1 className="collapse-nav-title">{title}</h1>
        <div className="collapse-nav-right">
          <span
            className="sync-dot-only"
            role="status"
            aria-label={`${SYNC_STATUS_LABEL[syncStatus]}${pending > 0 ? `, ${pending} chờ` : ""}`}
            title={SYNC_STATUS_LABEL[syncStatus]}
            style={{ background: syncDotColor(syncStatus) }}
          />
          <div className="avatar-wrap" ref={menuRef}>
            <button
              type="button"
              className="avatar avatar-sm avatar-btn"
              aria-label="Menu tài khoản"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {initial}
            </button>
            {menuOpen && (
              <div className="avatar-menu" role="menu">
                <div className="avatar-menu-head">
                  <strong>{displayName}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {SYNC_STATUS_LABEL[syncStatus]}
                    {pending > 0 ? ` · ${pending} chờ` : ""}
                  </div>
                </div>
                {onSyncNow && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onSyncNow();
                    }}
                  >
                    Đồng bộ ngay
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="danger-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut();
                  }}
                >
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
