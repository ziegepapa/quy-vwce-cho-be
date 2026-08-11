import { useCallback, useEffect, useState, type ReactNode } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { signOutBeforeLocalClear, useAuth } from "./lib/auth";
import {
  clearUserBusinessData,
  countLocalData,
  ensureInitialized,
  getSettings,
  ingestQuotesFeed,
  runPendingMigrations,
} from "./lib/db";
import type { AppSettings } from "./lib/types";
import {
  getSyncMeta,
  listConflicts,
  listDeadOutbox,
  reviveDeadOutbox,
  runSync,
} from "./lib/sync/engine";
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
import "./styles/premium-command-layout.css";

const LOGOUT_CLEANUP_PENDING_KEY = "vwce:logout-cleanup-pending";

function readLogoutCleanupPending(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LOGOUT_CLEANUP_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

function persistLogoutCleanupPending(pending: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (pending) window.localStorage.setItem(LOGOUT_CLEANUP_PENDING_KEY, "1");
    else window.localStorage.removeItem(LOGOUT_CLEANUP_PENDING_KEY);
  } catch {
    /* the in-memory gate still prevents business data from rendering */
  }
}

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

type LogoutBlockers = {
  pending: number;
  dead: number;
  conflicts: number;
};

function hasLogoutBlockers(value: LogoutBlockers): boolean {
  return value.pending > 0 || value.dead > 0 || value.conflicts > 0;
}

function describeLogoutBlockers(value: LogoutBlockers): string {
  const parts: string[] = [];
  if (value.pending > 0) parts.push(`${value.pending} thay đổi đang chờ`);
  if (value.dead > 0) parts.push(`${value.dead} thay đổi cần thử lại`);
  if (value.conflicts > 0) parts.push(`${value.conflicts} xung đột chưa xử lý`);
  return parts.join(" · ");
}

async function readLogoutBlockers(): Promise<LogoutBlockers> {
  const [outboxTotal, dead, conflicts] = await Promise.all([
    outboxCount(),
    listDeadOutbox(),
    listConflicts(),
  ]);
  return {
    pending: Math.max(0, outboxTotal - dead.length),
    dead: dead.length,
    conflicts: conflicts.length,
  };
}

export default function App() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("offline");
  const [pending, setPending] = useState(0);
  const [showWizard, setShowWizard] = useState(false);
  const [quoteRefreshVersion, setQuoteRefreshVersion] = useState(0);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [logoutBlockers, setLogoutBlockers] = useState<LogoutBlockers | null>(null);
  const [logoutNotice, setLogoutNotice] = useState<string | null>(null);
  const [logoutNoticeKind, setLogoutNoticeKind] = useState<"info" | "error">("info");
  const [logoutRetrying, setLogoutRetrying] = useState(false);
  const [logoutGate, setLogoutGate] = useState(false);
  const [logoutCleanupPending, setLogoutCleanupPending] = useState(readLogoutCleanupPending);

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

  const handleSettingsChanged = useCallback(async () => {
    setSettings(await getSettings());
    await refreshSyncBadge();
  }, [refreshSyncBadge]);

  const handleQuotesChanged = useCallback(async () => {
    setSettings(await getSettings());
    setQuoteRefreshVersion((value) => value + 1);
    await refreshSyncBadge();
  }, [refreshSyncBadge]);

  async function reload() {
    setMigrationError(null);
    try {
      await runPendingMigrations();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMigrationError(message || "Migration failed");
      setReady(true);
      return;
    }
    setSettings(await getSettings());
    setReady(true);
    await refreshSyncBadge();
  }

  useEffect(() => {
    if (!auth.ready) return;
    if (logoutGate || logoutCleanupPending) {
      setReady(true);
      return;
    }
    if (auth.configured && (!auth.user || !auth.vaultReady)) {
      setReady(true);
      return;
    }
    void (async () => {
      try {
        await runPendingMigrations();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setMigrationError(message || "Migration failed");
        setReady(true);
        return;
      }
      const currentSettings = await getSettings();
      setSettings(currentSettings);
      setReady(true);

      void ingestQuotesFeed()
        .then(async (result) => {
          if (result.status === "ok" || result.status === "partial") {
            await handleQuotesChanged();
          }
        })
        .catch(() => {
          /* local quote cache remains authoritative while offline */
        });

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
  }, [
    auth.ready,
    auth.configured,
    auth.user,
    auth.vaultReady,
    handleQuotesChanged,
    logoutCleanupPending,
    logoutGate,
    refreshSyncBadge,
  ]);

  useEffect(() => {
    const on = () => {
      if (auth.user && auth.vaultReady && !logoutGate && !logoutCleanupPending) {
        void runSync(auth.user.id).then(() => refreshSyncBadge());
      } else if (!logoutGate && !logoutCleanupPending) {
        void refreshSyncBadge();
      }
    };
    const off = () => setSyncStatus("offline");
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [auth.user, auth.vaultReady, logoutCleanupPending, logoutGate, refreshSyncBadge]);

  useEffect(() => {
    if (logoutGate && !logoutCleanupPending && !auth.user) setLogoutGate(false);
  }, [auth.user, logoutCleanupPending, logoutGate]);

  async function handleSignOut() {
    setLogoutNotice(null);
    const blockers = await readLogoutBlockers();
    if (hasLogoutBlockers(blockers)) {
      setLogoutBlockers(blockers);
      return;
    }

    setLogoutBlockers(null);
    setLogoutGate(true);
    const result = await signOutBeforeLocalClear(auth.signOut, clearUserBusinessData);
    if (result.status === "sign_out_failed") {
      setLogoutNoticeKind("error");
      setLogoutNotice(result.error);
      setLogoutGate(false);
      return;
    }
    if (result.status === "cleanup_failed") {
      persistLogoutCleanupPending(true);
      setLogoutCleanupPending(true);
      setLogoutNoticeKind("error");
      setLogoutNotice(
        "Phiên cloud đã kết thúc nhưng cache local chưa xóa được. Dữ liệu sẽ không được mở lại; hãy thử xóa cache lại hoặc mở lại ứng dụng.",
      );
      return;
    }

    persistLogoutCleanupPending(false);
    setLogoutCleanupPending(false);
  }

  async function retryLogoutCleanup() {
    setLogoutRetrying(true);
    setLogoutNoticeKind("error");
    try {
      await clearUserBusinessData();
      persistLogoutCleanupPending(false);
      setLogoutCleanupPending(false);
      setLogoutNotice(null);
      if (!auth.user) setLogoutGate(false);
    } catch {
      setLogoutNotice(
        "Phiên cloud đã kết thúc nhưng cache local vẫn chưa xóa được. Hãy đóng và mở lại ứng dụng rồi thử lại.",
      );
    } finally {
      setLogoutRetrying(false);
    }
  }

  async function handleSyncNow() {
    if (!auth.user || !auth.vaultReady || logoutGate || logoutCleanupPending) return;
    setSyncStatus("syncing");
    try {
      await runSync(auth.user.id);
    } catch {
      /* */
    }
    await refreshSyncBadge();
  }

  async function retryLogoutBlockers() {
    if (!auth.user || !auth.vaultReady) return;
    setLogoutRetrying(true);
    setLogoutNotice(null);
    try {
      await reviveDeadOutbox();
      await runSync(auth.user.id);
      const next = await readLogoutBlockers();
      if (hasLogoutBlockers(next)) {
        setLogoutBlockers(next);
      } else {
        setLogoutBlockers(null);
        setLogoutNoticeKind("info");
        setLogoutNotice("Đồng bộ đã sạch. Chọn Đăng xuất lần nữa để rời kho.");
      }
    } catch {
      setLogoutNoticeKind("error");
      setLogoutNotice("Chưa đồng bộ xong. Dữ liệu local vẫn được giữ nguyên.");
    } finally {
      setLogoutRetrying(false);
      await refreshSyncBadge();
    }
  }

  if (!auth.ready || !ready || (auth.user && !auth.mfaReady)) {
    return (
      <div className="app-shell">
        <p className="muted">Đang tải…</p>
      </div>
    );
  }

  if (logoutGate || logoutCleanupPending) {
    return (
      <div className="app-shell" role={logoutCleanupPending ? "alert" : "status"}>
        <div className={logoutCleanupPending ? "banner error" : "banner"}>
          <h1 className="page-title">
            {logoutCleanupPending ? "Phiên cloud đã kết thúc" : "Đang đóng kho…"}
          </h1>
          <p>
            {logoutNotice ??
              "Đang kết thúc phiên cloud trước khi xóa cache local. Dữ liệu business không được render trong lúc này."}
          </p>
          {logoutCleanupPending ? (
            <button
              type="button"
              className="secondary"
              disabled={logoutRetrying}
              onClick={() => void retryLogoutCleanup()}
            >
              {logoutRetrying ? "Đang xóa lại…" : "Thử xóa cache lại"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (migrationError) {
    return (
      <div className="app-shell" role="alert">
        <h1>Không thể nâng cấp dữ liệu local</h1>
        <p className="muted">
          Ứng dụng dừng lại để tránh dùng dữ liệu nửa migrate. Đồng bộ và ghi mới bị tạm khóa.
        </p>
        <p><code>{migrationError}</code></p>
        <button type="button" className="btn primary" onClick={() => void reload()}>
          Thử lại migration
        </button>
      </div>
    );
  }

  if (auth.configured && (!auth.user || !auth.vaultReady)) {
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
  const screenName = pathname === "/" ? "overview" : pathname.split("/")[1] || "overview";

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
        {auth.user ? (
          <CollapsingNavBar
            displayName={displayName}
            syncStatus={syncStatus}
            pending={pending}
            onSignOut={handleSignOut}
            onSyncNow={handleSyncNow}
            onUpdatePrice={() => navigate("/settings?tab=prices")}
            onSearch={navAction("search")}
            onFilter={navAction("filter")}
            onAddGoal={navAction("addGoal")}
            onChangeScenario={navAction("changeScenario")}
          />
        ) : null}

        {logoutBlockers ? (
          <div className="banner error" role="alert">
            <strong>Chưa thể đăng xuất.</strong> {describeLogoutBlockers(logoutBlockers)}. Dữ liệu local
            và outbox chưa bị xóa.
            <div className="stack" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="secondary"
                disabled={logoutRetrying}
                onClick={() => void retryLogoutBlockers()}
              >
                {logoutRetrying ? "Đang thử lại…" : "Đồng bộ / thử lại"}
              </button>
              {logoutBlockers.conflicts > 0 ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => navigate("/settings?tab=data")}
                >
                  Mở trạng thái dữ liệu
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {logoutNotice ? (
          <div className={logoutNoticeKind === "error" ? "banner error" : "banner"} role="status">
            {logoutNotice}
          </div>
        ) : null}

        <NavActionsProvider api={navActionsApi}>
          <main className={`premium-screen premium-screen-${screenName}`}>
            <Routes>
              <Route path="/" element={<Overview key={quoteRefreshVersion} />} />
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
                    refreshKey={quoteRefreshVersion}
                    onQuotesChanged={handleQuotesChanged}
                    onSettingsChanged={handleSettingsChanged}
                  />
                }
              />
            </Routes>
          </main>
        </NavActionsProvider>
      </div>

      <BottomDock items={NAV} />
    </div>
  );
}
