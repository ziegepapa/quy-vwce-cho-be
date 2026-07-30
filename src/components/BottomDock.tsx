import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";

export type DockItem = {
  to: string;
  label: string;
  icon: ReactNode;
};

export default function BottomDock({ items }: { items: DockItem[] }) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    lastY.current = window.scrollY;

    function onScroll() {
      if (reduced.current) return;
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (y < 24) {
        setHidden(false);
      } else if (delta > 8) {
        setHidden(true);
      } else if (delta < -8) {
        setHidden(false);
      }
      lastY.current = y;
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`bottom-dock${hidden ? " is-hidden" : ""}`}
      aria-label="Điều hướng chính"
    >
      <div className="bottom-dock-inner">
        {items.map(({ to, label, icon }) => (
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
