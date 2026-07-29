import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { ensureInitialized, getSettings } from "./lib/db";
import type { AppSettings } from "./lib/types";
import Overview from "./pages/Overview";
import Transactions from "./pages/Transactions";
import Goals from "./pages/Goals";
import Simulation from "./pages/Simulation";
import SettingsPage from "./pages/Settings";
import Onboarding from "./pages/Onboarding";
import AuthPage from "./pages/Auth";

export default function App() {
  const auth = useAuth();
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  async function reload() {
    setSettings(await getSettings());
    setReady(true);
  }

  useEffect(() => {
    if (!auth.ready) return;
    // Auth required only when Supabase is configured
    if (auth.configured && !auth.user) {
      setReady(true);
      return;
    }
    getSettings().then((s) => {
      setSettings(s);
      setReady(true);
    });
  }, [auth.ready, auth.configured, auth.user]);

  if (!auth.ready || !ready) {
    return (
      <div className="app-shell">
        <p className="muted">Đang tải…</p>
      </div>
    );
  }

  if (auth.configured && !auth.user) {
    return <AuthPage />;
  }

  if (!settings?.onboardingDone) {
    return (
      <Onboarding
        onDone={async (seed) => {
          await ensureInitialized(seed);
          await reload();
        }}
      />
    );
  }

  const displayName =
    (auth.user?.user_metadata?.display_name as string) ||
    auth.user?.email?.split("@")[0] ||
    settings.planName;

  return (
    <>
      <div className="app-shell">
        {auth.user && (
          <header className="top-bar">
            <div>
              <div className="muted" style={{ fontSize: ".75rem" }}>
                Xin chào
              </div>
              <strong style={{ fontSize: ".95rem" }}>{displayName}</strong>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="muted" style={{ fontSize: ".7rem" }}>
                {auth.configured ? "Đã đăng nhập" : "Local"}
              </div>
              <button
                type="button"
                className="secondary"
                style={{ minHeight: 36, fontSize: ".75rem", padding: ".3rem .6rem" }}
                onClick={() => auth.signOut()}
              >
                Đăng xuất
              </button>
            </div>
          </header>
        )}
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
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
            >
              <span aria-hidden>{icon}</span>
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
