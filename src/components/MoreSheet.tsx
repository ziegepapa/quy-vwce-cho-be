import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { useLocale } from "../lib/locale";
import { IconClose, IconGoal, IconLifebuoy, IconSettings, IconSim } from "./Icons";

/**
 * "Mehr" sheet for the mobile dock (Modern Wealth Journal): the secondary
 * destinations that do not fit the four dock tabs. Simulation and Settings
 * stay reachable here; Goals and Notfallmappe keep their existing routes.
 */
export default function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { locale, t } = useLocale();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const links = [
    { to: "/simulation", label: t("simulation"), icon: <IconSim /> },
    { to: "/goals", label: t("goals"), icon: <IconGoal /> },
    { to: "/notfallmappe", label: t("emergencyFile"), icon: <IconLifebuoy /> },
    { to: "/settings", label: t("settings"), icon: <IconSettings /> },
  ];

  return createPortal(
    <>
      <div
        className="mwj-more-scrim"
        role="presentation"
        onPointerDown={onClose}
      />
      <div
        className="mwj-more-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t("more")}
      >
        <div className="mwj-more-head">
          <span className="mwj-more-title">{t("more")}</span>
          <button
            ref={closeRef}
            type="button"
            className="mwj-more-close"
            aria-label={t("close")}
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>
        <nav aria-label={t("more")}>
          {links.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => "mwj-more-link" + (isActive ? " on" : "")}
              onClick={onClose}
            >
              <span className="mwj-more-icon" aria-hidden="true">{icon}</span>
              <span>{label}</span>
              <span className="mwj-more-arrow" aria-hidden="true">›</span>
            </NavLink>
          ))}
        </nav>
        <p className="mwj-more-note">
          {locale === "de"
            ? "Simulation, Ziele, Notfallmappe und Einstellungen."
            : "Mô phỏng, Mục tiêu, Hồ sơ khẩn cấp và Cài đặt."}
        </p>
      </div>
    </>,
    document.body,
  );
}
