import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useLocale } from "../lib/locale";
import "../styles/visual-abc-shell.css";

export type DockItem = {
  to: string;
  label: string;
  icon: ReactNode;
};

const PRIMARY_DOCK_ITEMS = 4;

export default function BottomDock({ items }: { items: DockItem[] }) {
  const { locale } = useLocale();
  const primaryItems = items.slice(0, PRIMARY_DOCK_ITEMS);

  return (
    <nav className="pill bottom-dock" aria-label={locale === "de" ? "Hauptnavigation" : "Điều hướng chính"}>
      {primaryItems.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) => "pb" + (isActive ? " on" : "")}
        >
          <span className="mwj-dock-icon" aria-hidden="true">{icon}</span>
          <span className="mwj-dock-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
