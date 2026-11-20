import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useLocale } from "../lib/locale";
import "../styles/visual-abc-shell.css";

export type DockItem = {
  /** Route destination. Omit for an action item (e.g. "Mehr" opens a sheet). */
  to?: string;
  label: string;
  icon: ReactNode;
  /** Action items only: opens the "Mehr" sheet instead of navigating. */
  onClick?: () => void;
  /** Action items only: true while a secondary route is active. */
  active?: boolean;
  /** Action items only: whether the sheet/menu is open. */
  expanded?: boolean;
};

const PRIMARY_DOCK_ITEMS = 4;

export default function BottomDock({ items }: { items: DockItem[] }) {
  const { locale } = useLocale();
  const primaryItems = items.slice(0, PRIMARY_DOCK_ITEMS);

  return (
    <nav className="pill bottom-dock" aria-label={locale === "de" ? "Hauptnavigation" : "Điều hướng chính"}>
      {primaryItems.map(({ to, label, icon, onClick, active, expanded }) => (
        to ? (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => "pb" + (isActive ? " on" : "")}
          >
            <span className="mwj-dock-icon" aria-hidden="true">{icon}</span>
            <span className="mwj-dock-label">{label}</span>
          </NavLink>
        ) : (
          <button
            key={label}
            type="button"
            className={"pb" + (active ? " on" : "")}
            aria-expanded={expanded ?? false}
            aria-haspopup="dialog"
            onClick={onClick}
          >
            <span className="mwj-dock-icon" aria-hidden="true">{icon}</span>
            <span className="mwj-dock-label">{label}</span>
          </button>
        )
      ))}
    </nav>
  );
}
