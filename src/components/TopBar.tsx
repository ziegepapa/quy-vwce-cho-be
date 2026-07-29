import { useEffect, useRef, useState } from "react";
import type { SyncStatus } from "../lib/sync/types";
import { SyncStatusIndicator } from "./SyncStatusIndicator";

function greetingBerlin(hour: number): string {
  if (hour < 5) return "Chào buổi tối";
  if (hour < 12) return "Chào buổi sáng";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

function formatBerlinNow(): { date: string; time: string; hour: number } {
  const now = new Date();
  const date = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  return { date, time, hour };
}

export default function TopBar({
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
  const [clock, setClock] = useState(() => formatBerlinNow());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => setClock(formatBerlinNow());
    const id = window.setInterval(tick, 30_000);
    const delay = 60_000 - (Date.now() % 60_000);
    const once = window.setTimeout(tick, delay);
    return () => {
      clearInterval(id);
      clearTimeout(once);
    };
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

  return (
    <header className="top-bar">
      <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
        <div className="avatar-wrap" ref={menuRef}>
          <button
            type="button"
            className="avatar avatar-btn"
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
                <div className="muted" style={{ fontSize: ".75rem" }}>
                  {clock.date}
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
        <div style={{ minWidth: 0 }}>
          <div className="top-bar-greeting">{greetingBerlin(clock.hour)}</div>
          <div className="top-bar-name">{displayName}</div>
          <div className="top-bar-meta">
            {clock.date} · {clock.time}
          </div>
        </div>
      </div>
      <div className="top-bar-actions">
        <SyncStatusIndicator status={syncStatus} pending={pending} />
      </div>
    </header>
  );
}
