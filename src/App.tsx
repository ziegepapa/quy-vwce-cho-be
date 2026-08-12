import { useCallback, useEffect, useState, type ReactNode } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { signOutBeforeLocalClear, useAuth } from "./lib/auth";
import { clearUserBusinessData, countLocalData, ensureInitialized, getSettings, ingestQuotesFeed, runPendingMigrations } from "./lib/db";
import type { AppSettings } from "./lib/types";
import {
  clearRecoveryItems,
  getSyncMeta,
  listConflicts,
  listDeadOutbox,
  reviveDeadOutbox,
  runSync,
  saveSyncMeta,
} from "./lib/sync/engine";
import { outboxCount } from "./lib/sync/outbox";
import type { SyncMeta, SyncStatus } from "./lib/sync/types";
import { NavActionsProvider, useNavActionRegistry } from "./lib/navActions";
import { RecoveryReadOnlyProvider } from "./lib/recoveryReadOnly";
import CollapsingNavBar from "./components/CollapsingNavBar";
import BottomDock from "./components/BottomDock";
import { IconGoal, IconHome, IconSettings, IconSim, IconTx } from "./components/Icons";
import { conflictCtaLabel, hasLogoutBlockers, openSyncConflictSection, readSyncConflictFocusToken, reconcileVisibleLogoutBlockers, type LogoutBlockerCounts } from "./components/SyncConflictSection";
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
import "./styles/recovery-banner.css";

const LOGOUT_CLEANUP_PENDING_KEY = "vwce:logout-cleanup-pending";
const LOGOUT_BLOCKED_MESSAGE = "Bạn còn dữ liệu chưa đồng bộ hoặc chưa khôi phục. Hãy khôi phục hoặc sao lưu trước khi đăng xuất.";
const RECOVERY_SYNC_PENDING_MESSAGE = "Cần hoàn tất đồng bộ trước khi đăng xuất.";

function readLogoutCleanupPending(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(LOGOUT_CLEANUP_PENDING_KEY) === "1"; }
  catch { return false; }
}
function persistLogoutCleanupPending(pending: boolean) {
  if (typeof window === "undefined") return;
  try { if (pending) window.localStorage.setItem(LOGOUT_CLEANUP_PENDING_KEY, "1"); else window.localStorage.removeItem(LOGOUT_CLEANUP_PENDING_KEY); }
  catch { /* in-memory gate remains */ }
}
function IconShield() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3l7 3v5.5c0 4.3-2.9 8.2-7 9.5-4.1-1.3-7-5.2-7-9.5V6l7-3z" /><path d="M9.2 12.2l2 2 3.6-3.9" /></svg>;
}
const NAV: { to: string; label: string; icon: ReactNode }[] = [
  { to: "/", label: "Tổng quan", icon: <IconHome /> },
  { to: "/transactions", label: "Giao dịch", icon: <IconTx /> },
  { to: "/goals", label: "Mục tiêu", icon: <IconGoal /> },
  { to: "/simulation", label: "Mô phỏng", icon: <IconSim /> },
  { to: "/notfallmappe", label: "Hồ sơ", icon: <IconShield /> },
  { to: "/settings", label: "Cài đặt", icon: <IconSettings /> },
];
type LogoutBlockers = LogoutBlockerCounts;
type LocalBusinessCounts = { settings: number; goals: number; transactions: number; annualChecklists: number; monthlySnapshots: number };
type LogoutSafetySnapshot = { blockers: LogoutBlockers; recoveryPending: boolean; readFailed: boolean };
const EMPTY_LOGOUT_BLOCKERS: LogoutBlockers = { pending: 0, dead: 0, conflicts: 0 };
function hasLocalBusinessData(counts: LocalBusinessCounts): boolean {
  return counts.settings + counts.goals + counts.transactions + counts.annualChecklists + counts.monthlySnapshots > 0;
}
function isRecoveryPending(counts: LocalBusinessCounts, meta: SyncMeta): boolean {
  return hasLocalBusinessData(counts) && (meta.migrateWizardDone !== true || meta.recoveryState !== "complete");
}
async function readLogoutBlockers(): Promise<LogoutBlockers> {
  const [outboxTotal, dead, conflicts] = await Promise.all([outboxCount(), listDeadOutbox(), listConflicts()]);
  return { pending: Math.max(0, outboxTotal - dead.length), dead: dead.length, conflicts: conflicts.length };
}
async function readLogoutSafety(userId: string): Promise<LogoutSafetySnapshot> {
  try {
    const [blockers, counts, meta] = await Promise.all([readLogoutBlockers(), countLocalData(), getSyncMeta(userId)]);
    return { blockers, recoveryPending: isRecoveryPending(counts, meta), readFailed: false };
  } catch { return { blockers: EMPTY_LOGOUT_BLOCKERS, recoveryPending: true, readFailed: true }; }
}

export default function App() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("offline");
  const [pending, setPending] = useState(0);
  const [showWizard, setShowWizard] = useState(false);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [quoteRefreshVersion, setQuoteRefreshVersion] = useState(0);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [logoutBlockers, setLogoutBlockers] = useState<LogoutBlockers | null>(null);
  const [logoutNotice, setLogoutNotice] = useState<string | null>(null);
  const [logoutNoticeKind, setLogoutNoticeKind] = useState<"info" | "error">("info");
  const [logoutRetrying, setLogoutRetrying] = useState(false);
  const [logoutGate, setLogoutGate] = useState(false);
  const [logoutCleanupPending, setLogoutCleanupPending] = useState(readLogoutCleanupPending);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [skipBusy, setSkipBusy] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);
  const { api: navActionsApi, navAction } = useNavActionRegistry();

  const refreshSyncBadge = useCallback(async () => {
    const p = await outboxCount(); const c = (await listConflicts()).length;
    if (!navigator.onLine) setSyncStatus("offline"); else if (c > 0) setSyncStatus("conflict"); else if (p > 0) setSyncStatus("syncing"); else setSyncStatus("synced");
    setPending(p);
  }, []);
  const handleConflictResolved = useCallback(async () => {
    await refreshSyncBadge();
    const refreshed = await readLogoutBlockers();
    setLogoutBlockers((current) => reconcileVisibleLogoutBlockers(current, refreshed));
  }, [refreshSyncBadge]);
  const handleOpenSyncConflicts = useCallback(() => {
    openSyncConflictSection({ pathname: location.pathname, search: location.search, navigate: (to, options) => navigate(to, options) });
  }, [location.pathname, location.search, navigate]);
  const handleSettingsChanged = useCallback(async () => { setSettings(await getSettings()); await refreshSyncBadge(); }, [refreshSyncBadge]);
  const handleQuotesChanged = useCallback(async () => { setSettings(await getSettings()); setQuoteRefreshVersion((v) => v + 1); await refreshSyncBadge(); }, [refreshSyncBadge]);

  async function reload() {
    setMigrationError(null);
    try { await runPendingMigrations(); }
    catch { setMigrationError("Không thể nâng cấp dữ liệu local. Dữ liệu chưa bị thay đổi."); setReady(true); return; }
    setSettings(await getSettings()); setReady(true); await refreshSyncBadge();
  }

  useEffect(() => {
    if (!auth.ready) return;
    if (logoutGate || logoutCleanupPending) { setReady(true); return; }
    if (auth.configured && (!auth.user || !auth.vaultReady)) { setRecoveryChecked(false); setReady(true); return; }
    if (auth.user) setRecoveryChecked(false);
    void (async () => {
      try { await runPendingMigrations(); }
      catch { setMigrationError("Không thể nâng cấp dữ liệu local. Dữ liệu chưa bị thay đổi."); setReady(true); return; }
      setSettings(await getSettings());
      void ingestQuotesFeed().then(async (result) => { if (result.status === "ok" || result.status === "partial") await handleQuotesChanged(); }).catch(() => undefined);
      if (auth.user) {
        try {
          const [meta, counts] = await Promise.all([getSyncMeta(auth.user.id), countLocalData()]);
          const needsRecovery = isRecoveryPending(counts, meta);
          setRecoveryRequired(needsRecovery); setShowWizard(false); setRecoveryChecked(true);
          if (!needsRecovery) {
            try { setSyncStatus("syncing"); await runSync(auth.user.id); } catch { /* network */ }
            await refreshSyncBadge();
            // Cập nhật settings sau sync: pullDelta có thể đã ghi data mới từ Supabase
            // (bao gồm notfallmappe, onboardingDone...) vào DB. Nếu không cập nhật lại
            // ở đây, React state sẽ giữ giá trị cũ (đọc trước sync) và app có thể
            // hiện lại Onboarding mặc dù data đã được khôi phục hoàn toàn.
            setSettings(await getSettings());
          }
        } catch { setRecoveryRequired(true); setShowWizard(false); setRecoveryChecked(true); }
      } else { setRecoveryRequired(false); setShowWizard(false); setRecoveryChecked(true); }
      setReady(true);
    })();
  }, [auth.ready, auth.configured, auth.user, auth.vaultReady, handleQuotesChanged, logoutCleanupPending, logoutGate, refreshSyncBadge]);

  useEffect(() => {
    const on = () => {
      if (auth.user && auth.vaultReady && !recoveryRequired && !logoutGate && !logoutCleanupPending) void runSync(auth.user.id).then(() => refreshSyncBadge());
      else if (!recoveryRequired && !logoutGate && !logoutCleanupPending) void refreshSyncBadge();
    };
    const off = () => setSyncStatus("offline");
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [auth.user, auth.vaultReady, recoveryRequired, logoutCleanupPending, logoutGate, refreshSyncBadge]);
  useEffect(() => { if (logoutGate && !logoutCleanupPending && !auth.user) setLogoutGate(false); }, [auth.user, logoutCleanupPending, logoutGate]);

  const recoveryActive = Boolean(auth.user) && recoveryRequired;

  async function handleSignOut() {
    setLogoutNotice(null);
    if (!auth.user) return;
    if (recoveryActive) return;
    const snapshot = await readLogoutSafety(auth.user.id);
    if (snapshot.readFailed || snapshot.recoveryPending || hasLogoutBlockers(snapshot.blockers)) {
      setLogoutBlockers(snapshot.blockers); setLogoutNoticeKind("error"); setLogoutNotice(LOGOUT_BLOCKED_MESSAGE); return;
    }
    setLogoutBlockers(null); setLogoutGate(true);
    const result = await signOutBeforeLocalClear(auth.signOut, clearUserBusinessData);
    if (result.status === "sign_out_failed") { setLogoutNoticeKind("error"); setLogoutNotice("Không kết thúc được phiên đăng nhập. Hãy thử lại."); setLogoutGate(false); return; }
    if (result.status === "cleanup_failed") { persistLogoutCleanupPending(true); setLogoutCleanupPending(true); setLogoutNoticeKind("error"); setLogoutNotice("Phiên cloud đã kết thúc nhưng cache local chưa xóa được. Dữ liệu local không được mở lại."); return; }
    persistLogoutCleanupPending(false); setLogoutCleanupPending(false); setRecoveryRequired(false); setShowWizard(false); setRecoveryChecked(false);
  }
  async function retryLogoutCleanup() {
    setLogoutRetrying(true); setLogoutNoticeKind("error");
    try { await clearUserBusinessData(); persistLogoutCleanupPending(false); setLogoutCleanupPending(false); setLogoutNotice(null); if (!auth.user) setLogoutGate(false); }
    catch { setLogoutNotice("Cache local vẫn chưa xóa được. Dữ liệu local không được mở lại."); }
    finally { setLogoutRetrying(false); }
  }
  async function handleSyncNow() {
    if (!auth.user || !auth.vaultReady || recoveryRequired || logoutGate || logoutCleanupPending) return;
    setSyncStatus("syncing"); try { await runSync(auth.user.id); } catch { /* safe */ } await refreshSyncBadge();
  }
  async function retryLogoutBlockers() {
    if (!auth.user || !auth.vaultReady) return;
    setLogoutRetrying(true); setLogoutNotice(null);
    try {
      await reviveDeadOutbox(); await runSync(auth.user.id);
      const next = await readLogoutSafety(auth.user.id);
      if (next.readFailed || next.recoveryPending || hasLogoutBlockers(next.blockers)) { setLogoutBlockers(next.blockers); setLogoutNoticeKind("error"); setLogoutNotice(LOGOUT_BLOCKED_MESSAGE); }
      else { setLogoutBlockers(null); setLogoutNoticeKind("info"); setLogoutNotice("Đồng bộ đã sạch. Chọn Đăng xuất lần nữa để rời kho."); }
    } catch { setLogoutNoticeKind("error"); setLogoutNotice(LOGOUT_BLOCKED_MESSAGE); }
    finally { setLogoutRetrying(false); try { await refreshSyncBadge(); } catch { /* next logout rechecks */ } }
  }

  async function skipRecovery() {
    if (!auth.user || skipBusy) return;
    setSkipBusy(true);
    setSkipError(null);
    try {
      await clearRecoveryItems();
      await saveSyncMeta({
        userId: auth.user.id,
        migrateWizardDone: true,
        migrateWizardSkipped: true,
        recoveryState: "complete",
      });
      setRecoveryRequired(false);
      setShowSkipConfirm(false);
      setShowWizard(false);
      try {
        if (auth.vaultReady) await runSync(auth.user.id);
      } catch { /* mạng không có cũng không sao */ }
      await refreshSyncBadge();
      // Cập nhật settings sau sync để phản ánh data mới nhất từ Supabase
      setSettings(await getSettings());
    } catch {
      setSkipError("Không thể lưu trạng thái. Kiểm tra bộ nhớ và thử lại.");
    } finally {
      setSkipBusy(false);
    }
  }

  if (!auth.ready || !ready || (auth.user && (!auth.mfaReady || !recoveryChecked))) return <div className="app-shell"><p className="muted">Đang tải…</p></div>;
  if (logoutGate || logoutCleanupPending) return <div className="app-shell" role={logoutCleanupPending ? "alert" : "status"}><div className={logoutCleanupPending ? "banner error" : "banner"}><h1 className="page-title">{logoutCleanupPending ? "Phiên cloud đã kết thúc" : "Đang đóng kho…"}</h1><p>{logoutNotice ?? "Đang kết thúc phiên cloud trước khi xóa cache local."}</p>{logoutCleanupPending ? <button type="button" className="secondary" disabled={logoutRetrying} onClick={() => void retryLogoutCleanup()}>{logoutRetrying ? "Đang xóa lại…" : "Thử xóa cache lại"}</button> : null}</div></div>;
  if (migrationError) return <div className="app-shell" role="alert"><h1>Không thể nâng cấp dữ liệu local</h1><p className="muted">Ứng dụng dừng lại để tránh dùng dữ liệu nửa migrate. Đồng bộ và ghi mới bị tạm khóa.</p><p>{migrationError}</p><button type="button" className="btn primary" onClick={() => void reload()}>Thử lại migration</button></div>;
  if (auth.configured && (!auth.user || !auth.vaultReady)) return <AuthPage />;

  if (auth.user && showWizard) {
    const recoveryUserId = auth.user.id;
    return <MigrateWizard userId={recoveryUserId} onDone={async () => {
      const [meta, refreshedCounts] = await Promise.all([getSyncMeta(recoveryUserId), countLocalData()]);
      if (!hasLocalBusinessData(refreshedCounts) || meta.migrateWizardDone !== true || meta.recoveryState !== "complete") throw new Error("Recovery incomplete");
      navigate("/settings?tab=data", { replace: true });
      setShowWizard(false); setRecoveryRequired(false); setRecoveryChecked(true);
      const safety = await readLogoutSafety(recoveryUserId);
      if (safety.readFailed || hasLogoutBlockers(safety.blockers)) { setLogoutBlockers(safety.blockers); setLogoutNoticeKind("info"); setLogoutNotice(RECOVERY_SYNC_PENDING_MESSAGE); }
      else { setLogoutBlockers(null); setLogoutNotice(null); }
      await reload();
    }} onBack={() => setShowWizard(false)} />;
  }

  if (!recoveryActive && !settings?.onboardingDone) return <Onboarding onDone={async () => { await ensureInitialized(false); await reload(); }} />;
  if (!settings) return <div className="app-shell"><p className="muted">Đang tải…</p></div>;

  const displayName = (auth.user?.user_metadata?.display_name as string) || auth.user?.email?.split("@")[0] || settings.planName;
  const screenName = pathname === "/" ? "overview" : pathname.split("/")[1] || "overview";
  const focusConflictRequest = readSyncConflictFocusToken(location.state);
  return <div className="app-layout">
    <aside className="sidebar" aria-label="Điều hướng"><div className="sidebar-brand">Quỹ VWCE</div><nav className="sidebar-nav">{NAV.map(({ to, label, icon }) => <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => isActive ? "active" : ""}>{icon}{label}</NavLink>)}</nav></aside>
    <div className="app-shell">
      {auth.user ? <CollapsingNavBar
        displayName={displayName}
        syncStatus={syncStatus}
        pending={pending}
        onSignOut={handleSignOut}
        onSyncNow={recoveryActive ? undefined : handleSyncNow}
        onUpdatePrice={undefined}
        onSearch={navAction("search")}
        onFilter={navAction("filter")}
        onAddGoal={recoveryActive ? undefined : navAction("addGoal")}
        onChangeScenario={recoveryActive ? undefined : navAction("changeScenario")}
      /> : null}

      {recoveryActive ? (
        <section className="banner recovery-banner" role="status" data-testid="recovery-banner">
          <h2 className="recovery-banner-title">Khôi phục dữ liệu chưa hoàn tất</h2>
          <p className="recovery-banner-body">Dữ liệu trên thiết bị vẫn được giữ nguyên. Hãy hoàn tất kiểm tra trước khi đăng xuất hoặc đồng bộ dữ liệu.</p>
          <div className="recovery-banner-action">
            <button type="button" className="primary" onClick={() => setShowWizard(true)}>Tiếp tục khôi phục dữ liệu</button>
            <button type="button" className="ghost" onClick={() => setShowSkipConfirm(true)}>Bỏ qua</button>
          </div>
        </section>
      ) : null}

      {logoutBlockers && !recoveryActive ? <div className="banner error" role="alert"><strong>Chưa thể đăng xuất.</strong><p>{LOGOUT_BLOCKED_MESSAGE}</p>{logoutNotice === RECOVERY_SYNC_PENDING_MESSAGE ? <p>{RECOVERY_SYNC_PENDING_MESSAGE}</p> : null}<div className="stack" style={{ marginTop: 8 }}>{hasLogoutBlockers(logoutBlockers) ? <button type="button" className="secondary" disabled={logoutRetrying} onClick={() => void retryLogoutBlockers()}>{logoutRetrying ? "Đang thử lại…" : "Đồng bộ / thử lại"}</button> : <button type="button" className="secondary" onClick={() => setShowWizard(true)}>Khôi phục dữ liệu trên thiết bị</button>}{logoutBlockers.conflicts > 0 ? <button type="button" className="ghost" onClick={handleOpenSyncConflicts}>{conflictCtaLabel(logoutBlockers.conflicts)}</button> : null}</div></div> : null}
      {logoutNotice && !logoutBlockers && !recoveryActive ? <div className={logoutNoticeKind === "error" ? "banner error" : "banner"} role="status">{logoutNotice}</div> : null}

      <NavActionsProvider api={navActionsApi}><main className={`premium-screen premium-screen-${screenName}`}><RecoveryReadOnlyProvider readOnly={recoveryActive}><Routes>
        <Route path="/" element={<Overview key={quoteRefreshVersion} />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/simulation" element={<Simulation />} />
        <Route path="/notfallmappe" element={<Notfallmappe />} />
        <Route path="/settings" element={<SettingsPage onReload={reload} onOpenMigrate={auth.user ? () => setShowWizard(true) : undefined} refreshKey={quoteRefreshVersion} onQuotesChanged={handleQuotesChanged} onSettingsChanged={handleSettingsChanged} onConflictResolved={handleConflictResolved} focusConflictRequest={focusConflictRequest} />} />
      </Routes></RecoveryReadOnlyProvider></main></NavActionsProvider>
    </div><BottomDock items={NAV} />

    {showSkipConfirm ? (
      <div className="modal-backdrop" role="presentation">
        <div className="card modal-card" role="dialog" aria-modal="true" aria-labelledby="skip-recovery-title">
          <h2 id="skip-recovery-title">Bỏ qua khôi phục dữ liệu?</h2>
          <p>Dữ liệu trên thiết bị sẽ <strong>không</strong> được đưa vào tài khoản. Bạn có thể khôi phục sau bằng cách mở lại mục Khôi phục trong Cài đặt.</p>
          {skipError ? <div className="banner error" role="alert" style={{ marginTop: 8 }}>{skipError}</div> : null}
          <div className="stack" style={{ marginTop: 16 }}>
            <button type="button" className="secondary" disabled={skipBusy} onClick={() => { setShowSkipConfirm(false); setSkipError(null); }}>Quay lại</button>
            <button type="button" disabled={skipBusy} onClick={() => void skipRecovery()}>{skipBusy ? "Đang lưu…" : "Xác nhận bỏ qua"}</button>
          </div>
        </div>
      </div>
    ) : null}
  </div>;
}
