import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";

export type DockItem = {
  to: string;
  label: string;
  icon: ReactNode;
};

/** Mobile dock = demo visual-abc 4 destinations (PRIMARY_NAV from App).
 *  Goals + Notfallmappe are secondary (AvatarMenu / deep links), not dock items. */
const PRIMARY_DOCK_ITEMS = 4;

/**
 * V10-A3 — ngưỡng ẩn hiện.
 *
 * Cộng dồn quãng đường cuộn theo MỘT hướng chứ không xét từng sự kiện,
 * vì trình duyệt phát sự kiện cuộn rất dày và mỗi lần chỉ chênh vài pixel.
 * Xét từng sự kiện chính là lý do dock nhấp nháy khi ngón tay hơi run.
 */
const HIDE_AFTER = 64;
const SHOW_AFTER = 24;

/** Gần đầu hoặc gần cuối trang thì luôn hiện dock. */
const TOP_ZONE = 40;
const BOTTOM_ZONE = 32;

/** Trang ngắn hơn ngần này thì không bao giờ ẩn — ẩn chỉ gây khó chịu. */
const MIN_SCROLLABLE = 140;

export default function BottomDock({ items }: { items: DockItem[] }) {
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);
  const lastY = useRef(0);
  const acc = useRef(0);
  const ticking = useRef(false);
  const reduced = useRef(false);
  const { pathname } = useLocation();
  const primaryItems = items.slice(0, PRIMARY_DOCK_ITEMS);

  // Đổi màn thì luôn hiện lại, và quên hết quãng đường đã cộng dồn.
  useEffect(() => {
    hiddenRef.current = false;
    setHidden(false);
    acc.current = 0;
    lastY.current = window.scrollY;
  }, [pathname]);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    lastY.current = window.scrollY;

    function apply(next: boolean) {
      if (hiddenRef.current === next) return;
      hiddenRef.current = next;
      setHidden(next);
    }

    function measure() {
      ticking.current = false;

      const doc = document.documentElement;
      const max = Math.max(0, doc.scrollHeight - window.innerHeight);

      // Kẹp lại để hiệu ứng nảy của iOS (scrollY âm hoặc vượt quá đáy)
      // không sinh ra chênh lệch giả.
      const y = Math.min(Math.max(window.scrollY, 0), max);

      if (max < MIN_SCROLLABLE) {
        acc.current = 0;
        lastY.current = y;
        apply(false);
        return;
      }

      const delta = y - lastY.current;
      lastY.current = y;

      // Rung tay vài pixel thì bỏ qua hẳn.
      if (Math.abs(delta) < 2) return;

      // Đổi hướng thì đếm lại từ đầu.
      if (delta > 0 !== acc.current > 0) acc.current = 0;
      acc.current += delta;

      if (y <= TOP_ZONE || y >= max - BOTTOM_ZONE) {
        acc.current = 0;
        apply(false);
        return;
      }

      if (acc.current > HIDE_AFTER) apply(true);
      else if (acc.current < -SHOW_AFTER) apply(false);
    }

    function onScroll() {
      if (reduced.current) return;
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(measure);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={"bottom-dock" + (hidden ? " is-hidden" : "")}
      aria-label="Điều hướng chính"
    >
      <div className="bottom-dock-inner">
        {primaryItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => "dock-item" + (isActive ? " active" : "")}
          >
            <span className="dock-icon">{icon}</span>
            <span className="dock-label">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
