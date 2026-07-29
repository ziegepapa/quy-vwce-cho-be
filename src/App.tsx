import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { ensureInitialized, getSettings } from "./lib/db";
import type { AppSettings } from "./lib/types";
import Overview from "./pages/Overview";
import Transactions from "./pages/Transactions";
import Goals from "./pages/Goals";
import Simulation from "./pages/Simulation";
import SettingsPage from "./pages/Settings";
import Onboarding from "./pages/Onboarding";

export default function App() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  async function reload() {
    setSettings(await getSettings());
    setReady(true);
  }

  useEffect(() => {
    getSettings().then((s) => { setSettings(s); setReady(true); });
  }, []);

  if (!ready) return <div className="app-shell"><p className="muted">Đang tải…</p></div>;

  if (!settings?.onboardingDone) {
    return (
      <Onboarding onDone={async (seed) => { await ensureInitialized(seed); await reload(); }} />
    );
  }

  return (
    <>
      <div className="app-shell">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/simulation" element={<Simulation />} />
          <Route path="/settings" element={<SettingsPage onReload={reload} />} />
        </Routes>
      </div>
      <nav className="bottom-nav" aria-label="Điều hướng chính">
        <div className="bottom-nav-inner">
          {[
            ["/", "⌂", "Tổng quan"],
            ["/transactions", "⇄", "Giao dịch"],
            ["/goals", "○", "Mục tiêu"],
            ["/simulation", "↗", "Mô phỏng"],
            ["/settings", "⚙", "Cài đặt"],
          ].map(([to, icon, label]) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}>
              <span aria-hidden>{icon}</span>{label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
