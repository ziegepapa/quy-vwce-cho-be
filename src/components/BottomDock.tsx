import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import "../styles/visual-abc-shell.css";

export type DockItem = {
  to: string;
  label: string;
  icon: ReactNode;
};

const PRIMARY_DOCK_ITEMS = 4;

export default function BottomDock({ items }: { items: DockItem[] }) {
  const primaryItems = items.slice(0, PRIMARY_DOCK_ITEMS);

  return (
    <nav className="visual-abc-dock" aria-label="Điều hướng chính">
      <div className="visual-abc-dock-pill">
        {primaryItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              "visual-abc-dock-item" + (isActive ? " is-active" : "")
            }
          >
            <span className="visual-abc-dock-icon">{icon}</span>
            <span className="visual-abc-dock-label">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
