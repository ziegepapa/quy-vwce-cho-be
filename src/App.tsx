import { useCallback, useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import {
  clearUserBusinessData,
  countLocalData,
  ensureInitialized,
  getSettings,
} from "./lib/db";
import type { AppSettings } from "./lib/types";
import {
  getSyncMeta,
  listConflicts,
  runSync,
} from "./lib/sync/engine";
import { outboxCount } from "./lib/sync/outbox";
import { SYNC_STATUS_LABEL, type SyncStatus } from "./lib/sync/types";
import Overview from "./pages/Overview";
import Transactions from "./pages/Transactions";
import Goals from "./pages/Goals";
import Simulation from "./pages/Simulation";
import SettingsPage from "./pages/Settings";
import Onboarding from "./pages/Onboarding";
import AuthPage from "./pages/Auth";
import MigrateWizard from "./pages/MigrateWizard";

export default function App() {
  const auth = useAuth();
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("offline");
  const [pending, setPending] = useState(0);
  const [showWizard, setShowWizard] = useState(false);

  const refreshSyncBadge = useCallback(async () => {
    const p = await outboxCount();
    const c = (await listConflicts()).length;
    const online = navigator.onLine;
    if (!online) setSyncStatus("offline");
    else if (c > 0) setSyncStatus("conflict");
    else if (p > 0) setSyncStatus("syncing");
    else setSyncStatus("synced");
    setPending(p);
  }, []);

  async function reload() {
    setSettings(await getSettings());
    setReady(true);
    await refreshSyncBadge();
  }

  useEffect(() => {
    if (!auth.ready) return;
    if (auth.configured && !auth.user) {
      setReady(true);
      return;
    }
    (async () => {
      const s = await getSettings();
      setSettings(s);
      setReady(true);
      if (auth.user) {
        const meta = await getSyncMeta(auth.user.id);
        const counts = await countLocalData();
        const hasLocal =
          counts.goals + counts.transactions + counts.settings > 0;
        if (hasLocal && !meta.migrateWizardDone && !meta.migrateWizardSkipped) {
          setShowWizard(true);
        }
        try {
          setSyncStatus("syncing");
          await runSync(auth.user.id);
        } catch {
          /* network */
        }
        await refreshSyncBadge();
      }
    })();
  }, [auth.ready, auth.configured, auth.user, refreshSyncBadge]);

  useEffect(() => {
    const on = () => {
      if (auth.user) {
        runSync(auth.user.id).then(() => refreshSyncBadge());
      } else refreshSyncBadge();
    };
    const off = () => setSyncStatus("offline");
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [auth.user, refreshSyncBadge]);

  async function handleSignOut() {
    const p = await outboxCount();
    if (p > 0) {
      if (
        !confirm(
          `Còn ${p} thao tác chưa đồng bộ. Đăng xuất sẽ xóa cache local trên máy này. Tiếp tục?`,
        )
      )
        return;
    }
    await clearUserBusinessData();
    await auth.signOut();
  }

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

  if (auth.user && showWizard) {
    return (
      <MigrateWizard
        userId={auth.user.id}
        onDone={async () => {
          setShowWizard(false);
          if (auth.user) await runSync(auth.user.id);
          await refreshSyncBadge();
          await reload();
        }}
        onSkip={() => setShowWizard(false)}
      />
    );
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
                {SYNC_STATUS_LABEL[syncStatus]}
                {pending > 0 ? ` · ${pending} chờ` : ""}
              </div>
              <button
                type="button"
                className="secondary"
                style={{ minHeight: 36, fontSize: ".75rem", padding: ".3rem .6rem" }}
                onClick={handleSignOut}
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
          <Route
            path="/settings"
            element={
              <SettingsPage
                onReload={reload}
                onOpenMigrate={auth.user ? () => setShowWizard(true) : undefined}
              />
            }
          />
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
