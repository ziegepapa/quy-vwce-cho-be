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
    <nav className="pill" aria-label="Điều hướng chính">
      {primaryItems.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) => "pb" + (isActive ? " on" : "")}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
