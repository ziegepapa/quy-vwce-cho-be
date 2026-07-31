import { useCallback, useEffect, useState, type ReactNode } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import {
  clearUserBusinessData,
  countLocalData,
  ensureInitialized,
  getSettings,
} from "./lib/db";
import type { AppSettings } from "./lib/types";
import { getSyncMeta, listConflicts, runSync } from "./lib/sync/engine";
import { outboxCount } from "./lib/sync/outbox";
import type { SyncStatus } from "./lib/sync/types";
import { NavActionsProvider, useNavActionRegistry } from "./lib/navActions";
import CollapsingNavBar from "./components/CollapsingNavBar";
import BottomDock from "./components/BottomDock";
import { IconGoal, IconHome, IconSettings, IconSim, IconTx } from "./components/Icons";
import Overview from "./pages/Overview";
import Transactions from "./pages/Transactions";
import Goals from "./pages/Goals";
import Simulation from "./pages/Simulation";
import SettingsPage from "./pages/Settings";
import Notfallmappe from "./pages/Notfallmappe";
import Onboarding from "./pages/Onboarding";
import AuthPage from "./pages/Auth";
import MigrateWizard from "./pages/MigrateWizard";

/** V10-A — khiên, cho mục Hồ sơ khẩn cấp. Để cục bộ ở đây để không phải sửa Icons.tsx. */
function IconShield() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l7 3v5.5c0 4.3-2.9 8.2-7 9.5-4.1-1.3-7-5.2-7-9.5V6l7-3z" />
      <path d="M9.2 12.2l2 2 3.6-3.9" />
    </svg>
  );
}

const NAV: { to: string; label: string; icon: ReactNode }[] = [
  { to: "/", label: "Tổng quan", icon: <IconHome /> },
  { to: "/transactions", label: "Giao dịch", icon: <IconTx /> },
  { to: "/goals", label: "Mục tiêu", icon: <IconGoal /> },
  { to: "/simulation", label: "Mô phỏng", icon: <IconSim /> },
  { to: "/notfallmappe", label: "Hồ sơ", icon: <IconShield /> },
  { to: "/settings", label: "Cài đặt", icon: <IconSettings /> },
];

export default function App() {
  const auth = useAuth();
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("offline");
  const [pending, setPending] = useState(0);
  const [showWizard, setShowWizard] = useState(false);

  // V9 B2: phải gọi trước mọi return sớm, nếu không thứ tự hook sẽ đổi giữa các render.
  const { api: navActionsApi, navAction } = useNavActionRegistry();

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
        const hasLocal = counts.goals + counts.transactions + counts.settings > 0;
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
      if (auth.user) runSync(auth.user.id).then(() => refreshSyncBadge());
      else refreshSyncBadge();
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

  async function handleSyncNow() {
    if (!auth.user) return;
    setSyncStatus("syncing");
    try {
      await runSync(auth.user.id);
    } catch {
      /* */
    }
    await refreshSyncBadge();
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
    <div className="app-layout">
      <aside className="sidebar" aria-label="Điều hướng">
        <div className="sidebar-brand">Quỹ VWCE</div>
        <nav className="sidebar-nav">
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {icon}
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="app-shell">
        {auth.user && (
          <CollapsingNavBar
            displayName={displayName}
            syncStatus={syncStatus}
            pending={pending}
            onSignOut={handleSignOut}
            onSyncNow={handleSyncNow}
            onUpdatePrice={navAction("updatePrice")}
            onSearch={navAction("search")}
            onFilter={navAction("filter")}
            onAddGoal={navAction("addGoal")}
            onChangeScenario={navAction("changeScenario")}
          />
        )}
        <NavActionsProvider api={navActionsApi}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/simulation" element={<Simulation />} />
            <Route path="/notfallmappe" element={<Notfallmappe />} />
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
        </NavActionsProvider>
      </div>

      <BottomDock items={NAV} />
    </div>
  );
}
