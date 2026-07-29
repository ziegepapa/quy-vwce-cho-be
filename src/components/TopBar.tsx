import { useEffect, useState } from "react";
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
}: {
  displayName: string;
  syncStatus: SyncStatus;
  pending: number;
  onSignOut: () => void;
}) {
  const [clock, setClock] = useState(() => formatBerlinNow());

  useEffect(() => {
    // Cập nhật mỗi phút — không re-render toàn app mỗi giây
    const tick = () => setClock(formatBerlinNow());
    const id = window.setInterval(tick, 30_000);
    // Align to next minute roughly
    const delay = 60_000 - (Date.now() % 60_000);
    const once = window.setTimeout(() => {
      tick();
    }, delay);
    return () => {
      clearInterval(id);
      clearTimeout(once);
    };
  }, []);

  const initial = (displayName.trim()[0] || "?").toUpperCase();

  return (
    <header className="top-bar">
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div className="avatar" aria-hidden>
          {initial}
        </div>
        <div>
          <div className="top-bar-greeting">{greetingBerlin(clock.hour)}</div>
          <div className="top-bar-name">{displayName}</div>
          <div className="top-bar-meta">
            {clock.date} · {clock.time} (Berlin)
          </div>
        </div>
      </div>
      <div className="top-bar-actions">
        <SyncStatusIndicator status={syncStatus} pending={pending} />
        <button
          type="button"
          className="secondary"
          style={{ minHeight: 36, fontSize: ".75rem", padding: ".3rem .65rem" }}
          onClick={onSignOut}
        >
          Đăng xuất
        </button>
      </div>
    </header>
  );
}
