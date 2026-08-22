import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { useLocale, type AppLocale } from "./lib/locale";
import CollapsingNavBar from "./components/CollapsingNavBar";
import BottomDock from "./components/BottomDock";
import { IconHome, IconSettings, IconSim, IconTx } from "./components/Icons";
import { conflictCtaLabel, hasLogoutBlockers, openSyncConflictSection, readSyncConflictFocusToken, reconcileVisibleLogoutBlockers, type LogoutBlockerCounts } from "./components/SyncConflictSection";
import { buildSyncHealth } from "./components/syncHealth";
import { recordLocalDiagnostic } from "./components/localDiagnostics";
const Overview = lazy(() => import("./pages/Overview"));
const Transactions = lazy(() => import("./pages/Transactions"));
const Goals = lazy(() => import("./pages/Goals"));
const Simulation = lazy(() => import("./pages/SimulationRoute"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const Notfallmappe = lazy(() => import("./pages/Notfallmappe"));
const HouseholdHandoff = lazy(() => import("./pages/HouseholdHandoff"));
const ConfidenceTimeline = lazy(() => import("./pages/ConfidenceTimeline"));
const LotEvidence = lazy(() => import("./pages/LotEvidence"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
import AuthPage from "./pages/Auth";
const MigrateWizard = lazy(() => import("./pages/MigrateWizard"));
import "./styles/premium-command-layout.css";
import "./styles/recovery-banner.css";

const LOGOUT_CLEANUP_PENDING_KEY = "vwce:logout-cleanup-pending";

function RouteLoading({ label }: { label: string }) {
  return <div className="app-shell" aria-busy="true" aria-live="polite"><p className="muted">{label}</p></div>;
}

function appStrings(locale: AppLocale) {
  return locale === "de" ? {
    migrationFailure: "Lokale Daten konnten nicht aktualisiert werden. Ihre Daten wurden nicht verändert.",
    logoutBlocked: "Es gibt noch nicht synchronisierte oder nicht wiederhergestellte Daten. Stellen oder sichern Sie sie vor dem Abmelden.",
    recoverySyncPending: "Schließen Sie die Synchronisierung vor dem Abmelden ab.",
    signOutFailed: "Die Anmeldung konnte nicht beendet werden. Bitte versuchen Sie es erneut.",
    cleanupFailed: "Die Cloud-Sitzung wurde beendet, aber der lokale Cache konnte nicht gelöscht werden. Lokale Daten werden nicht erneut geöffnet.",
    cleanupStillFailed: "Der lokale Cache konnte noch nicht gelöscht werden. Lokale Daten werden nicht erneut geöffnet.",
    syncNeedsSignIn: "Melden Sie sich an, um Daten zwischen Geräten zu synchronisieren.",
    syncNeedsRecovery: "Schließen Sie die Datenwiederherstellung vor der Synchronisierung ab.",
    syncConflicts: (count: number) => count === 1
      ? "1 Datenkonflikt muss vor der Bestätigung gelöst werden."
      : `${count} Datenkonflikte müssen vor der Bestätigung gelöst werden.`,
    syncOffline: "Sie sind offline; Änderungen bleiben sicher auf diesem Gerät gespeichert.",
    syncComplete: (pushed: number, pulled: number) => `Synchronisierung abgeschlossen: ${pushed} gesendet, ${pulled} empfangen.`,
    syncFailed: "Die Synchronisierung konnte nicht abgeschlossen werden. Ihre Gerätedaten bleiben unverändert.",
    logoutReady: "Die Synchronisierung ist sauber. Wählen Sie erneut Abmelden, um den Vault zu verlassen.",
    skipSaveError: "Der Status konnte nicht gespeichert werden. Prüfen Sie den Speicher und versuchen Sie es erneut.",
    loading: "Wird geladen…",
    cloudSessionEnded: "Cloud-Sitzung beendet",
    closingVault: "Vault wird geschlossen…",
    finishingCloudSession: "Die Cloud-Sitzung wird beendet, bevor der lokale Cache gelöscht wird.",
    cleanupRetrying: "Wird erneut gelöscht…",
    cleanupRetry: "Cache erneut löschen",
    migrationTitle: "Lokale Daten konnten nicht aktualisiert werden",
    migrationBody: "Die App wurde angehalten, damit keine teilweise migrierten Daten verwendet werden. Synchronisierung und neue Änderungen sind vorübergehend gesperrt.",
    retryMigration: "Migration erneut versuchen",
    navigation: "Navigation",
    recoveryTitle: "Datenwiederherstellung noch nicht abgeschlossen",
    recoveryBody: "Ihre Gerätedaten bleiben unverändert. Schließen Sie die Prüfung ab, bevor Sie sich abmelden oder Daten synchronisieren.",
    recoveryContinue: "Datenwiederherstellung fortsetzen",
    skip: "Überspringen",
    logoutBlockedTitle: "Abmelden noch nicht möglich.",
    logoutRetrying: "Wird erneut versucht…",
    logoutRetry: "Synchronisieren / erneut versuchen",
    restoreDevice: "Gerätedaten wiederherstellen",
    close: "Schließen",
    skipTitle: "Datenwiederherstellung überspringen?",
    skipBody: "Gerätedaten werden nicht in das Konto übernommen. Sie können die Wiederherstellung später über Einstellungen erneut öffnen.",
    back: "Zurück",
    saving: "Wird gespeichert…",
    confirmSkip: "Überspringen bestätigen",
  } : {
    migrationFailure: "Không thể nâng cấp dữ liệu local. Dữ liệu chưa bị thay đổi.",
    logoutBlocked: "Bạn còn dữ liệu chưa đồng bộ hoặc chưa khôi phục. Hãy khôi phục hoặc sao lưu trước khi đăng xuất.",
    recoverySyncPending: "Cần hoàn tất đồng bộ trước khi đăng xuất.",
    signOutFailed: "Không kết thúc được phiên đăng nhập. Hãy thử lại.",
    cleanupFailed: "Phiên cloud đã kết thúc nhưng cache local chưa xóa được. Dữ liệu local không được mở lại.",
    cleanupStillFailed: "Cache local vẫn chưa xóa được. Dữ liệu local không được mở lại.",
    syncNeedsSignIn: "Đăng nhập để đồng bộ giữa các thiết bị.",
    syncNeedsRecovery: "Hãy hoàn tất khôi phục dữ liệu trước khi đồng bộ.",
    syncConflicts: (count: number) => `${count} xung đột cần xử lý trước khi dữ liệu được xác nhận.`,
    syncOffline: "Bạn đang ngoại tuyến; các thay đổi vẫn được giữ an toàn trên thiết bị.",
    syncComplete: (pushed: number, pulled: number) => `Đồng bộ xong: đã đẩy ${pushed}, đã nhận ${pulled} thay đổi.`,
    syncFailed: "Không đồng bộ được. Dữ liệu trên thiết bị vẫn được giữ nguyên.",
    logoutReady: "Đồng bộ đã sạch. Chọn Đăng xuất lần nữa để rời kho.",
    skipSaveError: "Không thể lưu trạng thái. Kiểm tra bộ nhớ và thử lại.",
    loading: "Đang tải…",
    cloudSessionEnded: "Phiên cloud đã kết thúc",
    closingVault: "Đang đóng kho…",
    finishingCloudSession: "Đang kết thúc phiên cloud trước khi xóa cache local.",
    cleanupRetrying: "Đang xóa lại…",
    cleanupRetry: "Thử xóa cache lại",
    migrationTitle: "Không thể nâng cấp dữ liệu local",
    migrationBody: "Ứng dụng dừng lại để tránh dùng dữ liệu nửa migrate. Đồng bộ và ghi mới bị tạm khóa.",
    retryMigration: "Thử lại migration",
    navigation: "Điều hướng",
    recoveryTitle: "Khôi phục dữ liệu chưa hoàn tất",
    recoveryBody: "Dữ liệu trên thiết bị vẫn được giữ nguyên. Hãy hoàn tất kiểm tra trước khi đăng xuất hoặc đồng bộ dữ liệu.",
    recoveryContinue: "Tiếp tục khôi phục dữ liệu",
    skip: "Bỏ qua",
    logoutBlockedTitle: "Chưa thể đăng xuất.",
    logoutRetrying: "Đang thử lại…",
    logoutRetry: "Đồng bộ / thử lại",
    restoreDevice: "Khôi phục dữ liệu trên thiết bị",
    close: "Đóng",
    skipTitle: "Bỏ qua khôi phục dữ liệu?",
    skipBody: "Dữ liệu trên thiết bị sẽ không được đưa vào tài khoản. Bạn có thể khôi phục sau bằng cách mở lại mục Khôi phục trong Cài đặt.",
    back: "Quay lại",
    saving: "Đang lưu…",
    confirmSkip: "Xác nhận bỏ qua",
  };
}

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
/** Primary dock + sidebar: demo visual-abc 4 destinations only.
 *  /goals and /notfallmappe remain as secondary routes (AvatarMenu / deep links).
 *  Do not delete Goal data, schema, or page source. */
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
  const { locale, t } = useLocale();
  const text = useMemo(() => appStrings(locale), [locale]);
  const primaryNav = useMemo(() => [
    { to: "/", label: t("overview"), icon: <IconHome /> },
    { to: "/transactions", label: t("transactions"), icon: <IconTx /> },
    { to: "/simulation", label: t("simulation"), icon: <IconSim /> },
    { to: "/settings", label: t("settings"), icon: <IconSettings /> },
  ], [t]);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("offline");
  const [pending, setPending] = useState(0);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncHealthBlockers, setSyncHealthBlockers] = useState<LogoutBlockers>(EMPTY_LOGOUT_BLOCKERS);
  const [syncFeedback, setSyncFeedback] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);
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
    const [p, conflicts, deadItems] = await Promise.all([outboxCount(), listConflicts(), listDeadOutbox()]);
    const blockers = { pending: Math.max(0, p - deadItems.length), dead: deadItems.length, conflicts: conflicts.length };
    if (!navigator.onLine) setSyncStatus("offline"); else if (blockers.conflicts > 0) setSyncStatus("conflict"); else if (p > 0) setSyncStatus("syncing"); else setSyncStatus("synced");
    setPending(p);
    setSyncHealthBlockers(blockers);
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
    catch { setMigrationError(text.migrationFailure); setReady(true); return; }
    setSettings(await getSettings()); setReady(true); await refreshSyncBadge();
  }

  useEffect(() => {
    if (!auth.ready) return;
    if (logoutGate || logoutCleanupPending) { setReady(true); return; }
    if (auth.configured && (!auth.user || !auth.vaultReady)) { setRecoveryChecked(false); setReady(true); return; }
    if (auth.user) setRecoveryChecked(false);
    void (async () => {
      try { await runPendingMigrations(); }
      catch { setMigrationError(text.migrationFailure); setReady(true); return; }
      setSettings(await getSettings());
      void ingestQuotesFeed().then(async (result) => { if (result.status === "ok" || result.status === "partial") await handleQuotesChanged(); }).catch(() => undefined);
      if (auth.user) {
        try {
          const [meta, counts] = await Promise.all([getSyncMeta(auth.user.id), countLocalData()]);
          const needsRecovery = isRecoveryPending(counts, meta);
          setRecoveryRequired(needsRecovery); setShowWizard(false); setRecoveryChecked(true);
          if (!needsRecovery) {
            try { setSyncStatus("syncing"); setSyncRunning(true); await runSync(auth.user.id); }
            catch { recordLocalDiagnostic({ category: "sync-health", code: "sync-failed" }); }
            finally { setSyncRunning(false); }
            await refreshSyncBadge();
            setSettings(await getSettings());
          }
        } catch { setRecoveryRequired(true); setShowWizard(false); setRecoveryChecked(true); }
      } else { setRecoveryRequired(false); setShowWizard(false); setRecoveryChecked(true); }
      setReady(true);
    })();
  }, [auth.ready, auth.configured, auth.user, auth.vaultReady, handleQuotesChanged, logoutCleanupPending, logoutGate, refreshSyncBadge]);

  useEffect(() => {
    const on = () => {
      if (auth.user && auth.vaultReady && !recoveryRequired && !logoutGate && !logoutCleanupPending) {
        setSyncRunning(true);
        void runSync(auth.user.id).then(() => refreshSyncBadge()).finally(() => setSyncRunning(false));
      }
      else if (!recoveryRequired && !logoutGate && !logoutCleanupPending) void refreshSyncBadge();
    };
    const off = () => setSyncStatus("offline");
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [auth.user, auth.vaultReady, recoveryRequired, logoutCleanupPending, logoutGate, refreshSyncBadge]);
  useEffect(() => { if (logoutGate && !logoutCleanupPending && !auth.user) setLogoutGate(false); }, [auth.user, logoutCleanupPending, logoutGate]);
  useEffect(() => {
    setSyncFeedback(null);
    setLogoutNotice(null);
    setSkipError(null);
  }, [locale]);

  const recoveryActive = Boolean(auth.user) && recoveryRequired;
  const syncHealth = useMemo(() => buildSyncHealth({
    signedIn: Boolean(auth.user && auth.vaultReady),
    online: navigator.onLine,
    running: syncRunning,
    pending: syncHealthBlockers.pending,
    dead: syncHealthBlockers.dead,
    conflicts: syncHealthBlockers.conflicts,
    recoveryPending: recoveryActive,
  }), [auth.user, auth.vaultReady, syncRunning, syncHealthBlockers, recoveryActive]);

  useEffect(() => {
    recordLocalDiagnostic({ category: "sync-health", code: syncHealth.state });
  }, [syncHealth.state]);

  async function handleSyncHealthAction() {
    if (syncHealth.action === "recover") { setShowWizard(true); return; }
    if (syncHealth.action === "conflicts") { handleOpenSyncConflicts(); return; }
    if (syncHealth.action === "retry") {
      try { await reviveDeadOutbox(); }
      catch { setSyncFeedback({ message: text.syncFailed, tone: "error" }); return; }
    }
    if (syncHealth.action === "sync" || syncHealth.action === "retry") void handleSyncNow();
  }

  async function handleSignOut() {
    setLogoutNotice(null);
    if (!auth.user) return;
    if (recoveryActive) return;
    const snapshot = await readLogoutSafety(auth.user.id);
    if (snapshot.readFailed || snapshot.recoveryPending || hasLogoutBlockers(snapshot.blockers)) {
      setLogoutBlockers(snapshot.blockers); setLogoutNoticeKind("error"); setLogoutNotice(text.logoutBlocked); return;
    }
    setLogoutBlockers(null); setLogoutGate(true);
    const result = await signOutBeforeLocalClear(auth.signOut, clearUserBusinessData);
    if (result.status === "sign_out_failed") { setLogoutNoticeKind("error"); setLogoutNotice(text.signOutFailed); setLogoutGate(false); return; }
    if (result.status === "cleanup_failed") { persistLogoutCleanupPending(true); setLogoutCleanupPending(true); setLogoutNoticeKind("error"); setLogoutNotice(text.cleanupFailed); return; }
    persistLogoutCleanupPending(false); setLogoutCleanupPending(false); setRecoveryRequired(false); setShowWizard(false); setRecoveryChecked(false);
  }
  async function retryLogoutCleanup() {
    setLogoutRetrying(true); setLogoutNoticeKind("error");
    try { await clearUserBusinessData(); persistLogoutCleanupPending(false); setLogoutCleanupPending(false); setLogoutNotice(null); if (!auth.user) setLogoutGate(false); }
    catch { setLogoutNotice(text.cleanupStillFailed); }
    finally { setLogoutRetrying(false); }
  }
  async function handleSyncNow(): Promise<{ message: string; tone: "success" | "error" | "info" }> {
    if (!auth.user || !auth.vaultReady) {
      return { message: text.syncNeedsSignIn, tone: "info" };
    }
    if (recoveryRequired || logoutGate || logoutCleanupPending) {
      return { message: text.syncNeedsRecovery, tone: "info" };
    }
    setSyncStatus("syncing");
    setSyncRunning(true);
    setSyncFeedback(null);
    try {
      const result = await runSync(auth.user.id);
      await refreshSyncBadge();
      setSettings(await getSettings());
      const message = result.conflicts > 0
        ? text.syncConflicts(result.conflicts)
        : result.status === "offline"
          ? text.syncOffline
          : text.syncComplete(result.pushed, result.pulled);
      const tone: "success" | "info" = result.conflicts > 0 ? "info" : "success";
      const feedback = { message, tone };
      setSyncFeedback(feedback);
      return feedback;
    } catch {
      recordLocalDiagnostic({ category: "sync-health", code: "sync-failed" });
      await refreshSyncBadge().catch(() => undefined);
      const feedback = { message: text.syncFailed, tone: "error" as const };
      setSyncFeedback(feedback);
      return feedback;
    } finally {
      setSyncRunning(false);
    }
  }
  async function retryLogoutBlockers() {
    if (!auth.user || !auth.vaultReady) return;
    setLogoutRetrying(true); setLogoutNotice(null);
    try {
      await reviveDeadOutbox(); await runSync(auth.user.id);
      const next = await readLogoutSafety(auth.user.id);
      if (next.readFailed || next.recoveryPending || hasLogoutBlockers(next.blockers)) { setLogoutBlockers(next.blockers); setLogoutNoticeKind("error"); setLogoutNotice(text.logoutBlocked); }
      else { setLogoutBlockers(null); setLogoutNoticeKind("info"); setLogoutNotice(text.logoutReady); }
    } catch { setLogoutNoticeKind("error"); setLogoutNotice(text.logoutBlocked); }
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
      setSettings(await getSettings());
    } catch {
      setSkipError(text.skipSaveError);
    } finally {
      setSkipBusy(false);
    }
  }

  // Auth provider not ready yet — only true cold start.
  if (!auth.ready) {
    return <div className="app-shell"><p className="muted">{text.loading}</p></div>;
  }

  // Password recovery must reach AuthPage even when vaultReady is false and the
  // data-recovery checklist has not run (recoveryChecked stays false while
  // vaultReady is false). Do not block on MFA readiness here either: recovery
  // owns the session until the user sets a new password or continues.
  if (auth.user && (auth.recoveryMode || auth.recoveryCompleted)) {
    return <AuthPage />;
  }

  if (!ready || (auth.user && (!auth.mfaReady || !recoveryChecked))) {
    return <div className="app-shell"><p className="muted">{text.loading}</p></div>;
  }
  if (logoutGate || logoutCleanupPending) return <div className="app-shell" role={logoutCleanupPending ? "alert" : "status"}><div className={logoutCleanupPending ? "banner error" : "banner"}><h1 className="page-title">{logoutCleanupPending ? text.cloudSessionEnded : text.closingVault}</h1><p>{logoutNotice ?? text.finishingCloudSession}</p>{logoutCleanupPending ? <button type="button" className="secondary" disabled={logoutRetrying} onClick={() => void retryLogoutCleanup()}>{logoutRetrying ? text.cleanupRetrying : text.cleanupRetry}</button> : null}</div></div>;
  if (migrationError) return <div className="app-shell" role="alert"><h1>{text.migrationTitle}</h1><p className="muted">{text.migrationBody}</p><p>{migrationError}</p><button type="button" className="btn primary" onClick={() => void reload()}>{text.retryMigration}</button></div>;
  if (auth.configured && (!auth.user || !auth.vaultReady)) return <AuthPage />;

  if (auth.user && showWizard) {
    const recoveryUserId = auth.user.id;
    return <Suspense fallback={<RouteLoading label={text.loading} />}><MigrateWizard userId={recoveryUserId} onDone={async () => {
      const [meta, refreshedCounts] = await Promise.all([getSyncMeta(recoveryUserId), countLocalData()]);
      if (!hasLocalBusinessData(refreshedCounts) || meta.migrateWizardDone !== true || meta.recoveryState !== "complete") throw new Error("Recovery incomplete");
      navigate("/settings?tab=data", { replace: true });
      setShowWizard(false); setRecoveryRequired(false); setRecoveryChecked(true);
      const safety = await readLogoutSafety(recoveryUserId);
      if (safety.readFailed || hasLogoutBlockers(safety.blockers)) { setLogoutBlockers(safety.blockers); setLogoutNoticeKind("info"); setLogoutNotice(text.recoverySyncPending); }
      else { setLogoutBlockers(null); setLogoutNotice(null); }
      await reload();
    }} onBack={() => setShowWizard(false)} /></Suspense>;
  }

  if (!recoveryActive && !settings?.onboardingDone) return <Suspense fallback={<RouteLoading label={text.loading} />}><Onboarding onDone={async () => { await ensureInitialized(false); await reload(); }} /></Suspense>;
  if (!settings) return <div className="app-shell"><p className="muted">{text.loading}</p></div>;

  const displayName = (auth.user?.user_metadata?.display_name as string) || auth.user?.email?.split("@")[0] || settings.planName;
  const screenName = pathname === "/" ? "overview" : pathname.split("/")[1] || "overview";
  const focusConflictRequest = readSyncConflictFocusToken(location.state);
  return <div className="app-layout">
    <aside className="sidebar" aria-label={text.navigation}><div className="sidebar-brand">VWCE Vault</div><nav className="sidebar-nav">{primaryNav.map(({ to, label, icon }) => <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => isActive ? "active" : ""}>{icon}{label}</NavLink>)}</nav></aside>
    <div className="app-shell">
      {auth.user ? <CollapsingNavBar
        displayName={displayName}
        syncStatus={syncStatus}
        pending={pending}
        syncHealth={syncHealth}
        onSignOut={handleSignOut}
        onSyncNow={recoveryActive ? undefined : handleSyncHealthAction}
        onUpdatePrice={undefined}
        onSearch={navAction("search")}
        onFilter={navAction("filter")}
        onAddGoal={recoveryActive ? undefined : navAction("addGoal")}
        onChangeScenario={recoveryActive ? undefined : navAction("changeScenario")}
      /> : null}

      {recoveryActive ? (
        <section className="banner recovery-banner" role="status" data-testid="recovery-banner">
          <h2 className="recovery-banner-title">{text.recoveryTitle}</h2>
          <p className="recovery-banner-body">{text.recoveryBody}</p>
          <div className="recovery-banner-action">
            <button type="button" className="primary" onClick={() => setShowWizard(true)}>{text.recoveryContinue}</button>
            <button type="button" className="ghost" onClick={() => setShowSkipConfirm(true)}>{text.skip}</button>
          </div>
        </section>
      ) : null}

      {logoutBlockers && !recoveryActive ? <div className="banner error" role="alert"><strong>{text.logoutBlockedTitle}</strong><p>{text.logoutBlocked}</p>{logoutNotice === text.recoverySyncPending ? <p>{text.recoverySyncPending}</p> : null}<div className="stack" style={{ marginTop: 8 }}>{hasLogoutBlockers(logoutBlockers) ? <button type="button" className="secondary" disabled={logoutRetrying} onClick={() => void retryLogoutBlockers()}>{logoutRetrying ? text.logoutRetrying : text.logoutRetry}</button> : <button type="button" className="secondary" onClick={() => setShowWizard(true)}>{text.restoreDevice}</button>}{logoutBlockers.conflicts > 0 ? <button type="button" className="ghost" onClick={handleOpenSyncConflicts}>{conflictCtaLabel(logoutBlockers.conflicts, locale)}</button> : null}</div></div> : null}
      {logoutNotice && !logoutBlockers && !recoveryActive ? <div className={logoutNoticeKind === "error" ? "banner error" : "banner"} role="status">{logoutNotice}</div> : null}
      {syncFeedback ? <div className={syncFeedback.tone === "error" ? "banner error" : "banner"} role="status"><span>{syncFeedback.message}</span><button type="button" className="ghost" onClick={() => setSyncFeedback(null)}>{text.close}</button></div> : null}

      <NavActionsProvider api={navActionsApi}><main className={`premium-screen premium-screen-${screenName}`}><RecoveryReadOnlyProvider readOnly={recoveryActive}><Suspense fallback={<RouteLoading label={text.loading} />}><Routes>
        <Route path="/" element={<Overview key={quoteRefreshVersion} />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/simulation" element={<Simulation />} />
        <Route path="/notfallmappe" element={<Notfallmappe />} />
        <Route path="/handoff" element={<HouseholdHandoff syncStatus={syncStatus} pending={pending} />} />
        <Route path="/timeline" element={<ConfidenceTimeline syncStatus={syncStatus} pending={pending} />} />
        <Route path="/lot-evidence" element={<LotEvidence />} />
        <Route path="/settings" element={<SettingsPage onReload={reload} onOpenMigrate={auth.user ? () => setShowWizard(true) : undefined} refreshKey={quoteRefreshVersion} onQuotesChanged={handleQuotesChanged} onSettingsChanged={handleSettingsChanged} onConflictResolved={handleConflictResolved} focusConflictRequest={focusConflictRequest} onSyncNow={auth.user ? handleSyncNow : undefined} syncHealth={syncHealth} onSyncHealthAction={handleSyncHealthAction} onRequestSignOut={auth.user ? handleSignOut : undefined} />} />
      </Routes></Suspense></RecoveryReadOnlyProvider></main></NavActionsProvider>
    </div><BottomDock items={primaryNav} />

    {showSkipConfirm ? (
      <div className="modal-backdrop" role="presentation">
        <div className="card modal-card" role="dialog" aria-modal="true" aria-labelledby="skip-recovery-title">
          <h2 id="skip-recovery-title">{text.skipTitle}</h2>
          <p>{text.skipBody}</p>
          {skipError ? <div className="banner error" role="alert" style={{ marginTop: 8 }}>{skipError}</div> : null}
          <div className="stack" style={{ marginTop: 16 }}>
            <button type="button" data-dialog-close className="secondary" disabled={skipBusy} onClick={() => { setShowSkipConfirm(false); setSkipError(null); }}>{text.back}</button>
            <button type="button" disabled={skipBusy} onClick={() => void skipRecovery()}>{skipBusy ? text.saving : text.confirmSkip}</button>
          </div>
        </div>
      </div>
    ) : null}
  </div>;
}
