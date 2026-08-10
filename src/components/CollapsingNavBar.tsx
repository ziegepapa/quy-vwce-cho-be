import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { SyncStatus } from "../lib/sync/types";
import { SYNC_STATUS_LABEL } from "../lib/sync/types";
import AvatarMenu, { avatarGradient } from "./AvatarMenu";
import "../styles/overview-focus.css";

const TITLES: Record<string, string> = {
  "/": "Tổng quan",
  "/transactions": "Giao dịch",
  "/goals": "Mục tiêu",
  "/simulation": "Mô phỏng",
  "/settings": "Cài đặt",
};

type BerlinClock = {
  iso: string;
  time: string;
  date: string;
};

function readBerlinClock(): BerlinClock {
  const now = new Date();
  return {
    iso: now.toISOString(),
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now),
    date: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(now),
  };
}

function TimeDate() {
  const [clock, setClock] = useState<BerlinClock>(() => readBerlinClock());

  useEffect(() => {
    const tick = () => setClock(readBerlinClock());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className="nav-time-date"
      role="timer"
      aria-live="off"
      aria-label={`Giờ Berlin ${clock.time}, ngày ${clock.date}`}
    >
      <time className="nav-clock-time" dateTime={clock.iso}>{clock.time}</time>
      <time className="nav-clock-date" dateTime={clock.iso}>{clock.date}</time>
    </div>
  );
}

function syncRingClass(status: SyncStatus): string {
  if (status === "synced") return "sync-ring synced";
  if (status === "syncing") return "sync-ring syncing";
  if (status === "conflict") return "sync-ring conflict";
  return "sync-ring offline";
}

function IconSearch() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function IconFilter() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h16l-6 7v5l-4 2v-7L4 5z" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function IconScenario() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15l3-4 3 3 4-6" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
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
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? "Quỹ VWCE";
  const [progress, setProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const lastNavH = useRef<string | null>(null);
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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

  const h = Math.round(56 - progress * 8);
  const condensed = progress > 0.5;

  useEffect(() => {
    const value = `${h}px`;
    if (lastNavH.current === value) return;
    const raf = requestAnimationFrame(() => {
      document.documentElement.style.setProperty("--nav-h-dyn", value);
      lastNavH.current = value;
    });
    return () => cancelAnimationFrame(raf);
  }, [h]);

  useEffect(() => () => {
    document.documentElement.style.removeProperty("--nav-h-dyn");
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const initial = (displayName.trim()[0] || "?").toUpperCase();

  return (
    <>
      <header className={`collapse-nav${condensed ? " is-condensed" : ""}`}>
        <div className="collapse-nav-inner">
          <div className="nav-leading">
            <span className="nav-logo" aria-hidden />
            <div className="nav-title-stack">
              {pathname === "/" ? <span className="nav-context">Quỹ dài hạn</span> : null}
              <h1 className="collapse-nav-title">{title}</h1>
            </div>
          </div>

          <TimeDate />

          <div className="collapse-nav-right">
            {pathname === "/" && onUpdatePrice ? (
              <button
                type="button"
                className="nav-price-action"
                aria-label="Mở cập nhật giá"
                onClick={onUpdatePrice}
              >
                <IconRefresh />
                <span>Cập nhật</span>
              </button>
            ) : null}
            {pathname === "/transactions" && onSearch ? (
              <button type="button" className="icon-btn" aria-label="Tìm kiếm giao dịch" onClick={onSearch}>
                <IconSearch />
              </button>
            ) : null}
            {pathname === "/transactions" && onFilter ? (
              <button type="button" className="icon-btn" aria-label="Lọc giao dịch" onClick={onFilter}>
                <IconFilter />
              </button>
            ) : null}
            {pathname === "/goals" && onAddGoal ? (
              <button type="button" className="icon-btn" aria-label="Thêm mục tiêu" onClick={onAddGoal}>
                <IconPlus />
              </button>
            ) : null}
            {pathname === "/simulation" && onChangeScenario ? (
              <button type="button" className="icon-btn" aria-label="Đổi kịch bản" onClick={onChangeScenario}>
                <IconScenario />
              </button>
            ) : null}
            <button
              ref={triggerRef}
              type="button"
              className="avatar-btn-wrap"
              aria-label={`Menu tài khoản, ${SYNC_STATUS_LABEL[syncStatus]}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <span className="avatar avatar-sm" style={{ background: avatarGradient(displayName) }}>
                {initial}
              </span>
              <span className={syncRingClass(syncStatus)} aria-hidden />
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
