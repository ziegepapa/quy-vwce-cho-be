import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  clearAllData,
  db,
  exportBackup,
  getSettings,
  importBackup,
  listTransactions,
  saveSettings,
} from "../lib/db";
import type { AppSettings, BackupPayload } from "../lib/types";
import { APP_RELEASE_VERSION } from "../lib/appVersion";
import { isSupportedBackupSchema } from "../lib/backupSchema";
import { pendingSyncImportBlock } from "../lib/backupImportGate";
import { csvEscape } from "../lib/calc";
import type { ThemeChoice } from "../lib/theme";
import { persistTheme, readTheme } from "../lib/theme";
import { useLocale, type AppLocale } from "../lib/locale";
import { useAuth } from "../lib/auth";
import { getSyncMeta, listDeadOutbox, pushOutbox, reviveDeadOutbox } from "../lib/sync/engine";
import type { OutboxItem, PendingSyncSummary } from "../lib/sync/types";
import { useRecoveryReadOnly } from "../lib/recoveryReadOnly";
import SettingsPricePanel from "../components/SettingsPricePanel";
import SyncConflictSection from "../components/SyncConflictSection";
import { SyncHealthSummary } from "../components/SyncHealthSummary";
import { syncHealthCopy, type SyncHealth } from "../components/syncHealth";
import PlanRoadmapSection from "../components/PlanRoadmapSection";
import LocalDiagnosticsPanel from "../components/LocalDiagnosticsPanel";
import LocalDataInventoryPanel from "../components/LocalDataInventoryPanel";
import "../styles/settings-operation-errors.css";
import "../styles/demo-v10-settings.css";

const SETTINGS_AUTOSAVE_MS = 650;

type SettingsText = {
  saveError: string;
  pendingPushError: string;
  exportError: string;
  invalidJson: string;
  invalidBackup: string;
  unsupportedSchema: string;
  preImportBackupError: string;
  importSuccess: string;
  importError: string;
  csvExportError: string;
  mfaStartError: string;
  mfaVerifyError: string;
  mfaVerified: string;
  qrAlt: string;
  jsonBackup: string;
  emergencySub: string;
  preImportBackupFilePrefix: string;
  pendingImportTitle: string;
  pendingImportRisk: string;
  pendingPushFirst: string;
  pendingAcceptRisk: string;
  deleteToken: string;
  deleteError: string;
  accountSecurity: string;
  currentEmail: string;
  lastLogin: string;
  lastLoginUnavailable: string;
  passwordRecovery: string;
  passwordRecoverySub: string;
  syncDetails: string;
  lastLocalSync: string;
  lastLocalSyncUnavailable: string;
  data: string;
  app: string;
  supportHandover: string;
  pageTitle: string;
  pageSubtitle: string;
  savedLocal: string;
  savingLocal: string;
  changesPending: string;
  accountSubtitle: string;
  syncSubtitle: string;
  dataSubtitle: string;
  preferences: string;
  appearance: string;
  appearanceSubtitle: string;
  language: string;
  languageSubtitle: string;
  premiumTheme: string;
  darkTheme: string;
  lightTheme: string;
};

function settingsStrings(locale: AppLocale): SettingsText {
  return locale === "de" ? {
    saveError: "Einstellungen konnten nicht gespeichert werden. Ihre Änderungen bleiben auf dem Bildschirm.",
    pendingPushError: "Ausstehende Änderungen konnten nicht hochgeladen werden. Ihre Gerätedaten bleiben unverändert.",
    exportError: "JSON-Sicherung konnte nicht exportiert werden. Ihre Daten wurden nicht verändert.",
    invalidJson: "Ungültige JSON-Datei.",
    invalidBackup: "Ungültige Struktur der Sicherung.",
    unsupportedSchema: "Diese Sicherungsversion wird nicht unterstützt.",
    preImportBackupError: "Sicherung vor dem Import konnte nicht erstellt werden. Ihre Daten wurden nicht verändert.",
    importSuccess: "Sicherung erfolgreich importiert.",
    importError: "Sicherung konnte nicht importiert werden. Ihre aktuellen Daten bleiben erhalten.",
    csvExportError: "Transaktionen konnten nicht als CSV exportiert werden. Ihre Daten wurden nicht verändert.",
    mfaStartError: "TOTP konnte nicht eingerichtet werden. Bitte versuchen Sie es erneut.",
    mfaVerifyError: "TOTP konnte nicht bestätigt werden. Ihre MFA-Einstellung wurde nicht geändert.",
    mfaVerified: "TOTP wurde bestätigt.",
    qrAlt: "TOTP-QR-Code",
    jsonBackup: "JSON-Sicherung",
    emergencySub: "Notfalldaten und Hinweise für Angehörige",
    preImportBackupFilePrefix: "vwce-sicherung-vor-import",
    pendingImportTitle: "Ausstehende Synchronisierungen erkannt",
    pendingImportRisk: "Der Import einer Sicherung löscht die Synchronisierungswarteschlange: noch nicht hochgeladene Änderungen gehen verloren und gelöschte Einträge können wieder erscheinen.",
    pendingPushFirst: "Zuerst synchronisieren",
    pendingAcceptRisk: "Trotzdem importieren (Risiko akzeptieren)",
    deleteToken: "LOESCHEN",
    deleteError: "Lokale Daten konnten nicht gelöscht werden.",
    accountSecurity: "Konto & Sicherheit",
    currentEmail: "Aktuelle E-Mail-Adresse",
    lastLogin: "Letzte Anmeldung",
    lastLoginUnavailable: "Vom Anbieter noch nicht verfügbar",
    passwordRecovery: "Passwort & Wiederherstellung",
    passwordRecoverySub: "Passwort zurücksetzen ist auf der Anmeldeseite verfügbar.",
    syncDetails: "Details",
    lastLocalSync: "Letzter Abgleich auf diesem Gerät",
    lastLocalSyncUnavailable: "Noch kein lokaler Abgleich erfasst",
    data: "Daten",
    app: "App",
    supportHandover: "Notfallmappe & Übergabe",
    pageTitle: "Einstellungen",
    pageSubtitle: "Konto, lokale Daten und Gerätezugriff übersichtlich verwalten.",
    savedLocal: "Auf diesem Gerät gespeichert",
    savingLocal: "Wird auf diesem Gerät gespeichert…",
    changesPending: "Änderungen warten auf Speicherung",
    accountSubtitle: "Anmeldung und Schutz dieses Familien-Vaults.",
    syncSubtitle: "Status und bewusste Synchronisierung zwischen Ihren Geräten.",
    dataSubtitle: "Sicherung und Wiederherstellung bleiben owner-gesteuert.",
    preferences: "Darstellung & Sprache",
    appearance: "Erscheinungsbild",
    appearanceSubtitle: "Nur die Darstellung dieser App ändern.",
    language: "Sprache",
    languageSubtitle: "Die Auswahl wird auf diesem Gerät gespeichert.",
    premiumTheme: "Vault",
    darkTheme: "Ozean",
    lightTheme: "Ember",
  } : {
    saveError: "Không lưu được Cài đặt. Bản đang chỉnh vẫn còn trên màn hình.",
    pendingPushError: "Không đẩy được các thay đổi đang chờ. Dữ liệu trên thiết bị vẫn được giữ nguyên.",
    exportError: "Không xuất được bản sao lưu JSON. Dữ liệu không bị thay đổi.",
    invalidJson: "JSON không hợp lệ",
    invalidBackup: "Cấu trúc backup không hợp lệ",
    unsupportedSchema: "Phiên bản bản sao lưu này không được hỗ trợ.",
    preImportBackupError: "Không tạo được bản sao lưu trước khi nhập. Dữ liệu chưa bị thay đổi.",
    importSuccess: "Nhập backup thành công",
    importError: "Không nhập được backup. Dữ liệu hiện tại vẫn được giữ nguyên.",
    csvExportError: "Không xuất được CSV giao dịch. Dữ liệu không bị thay đổi.",
    mfaStartError: "Không bắt đầu được TOTP. Vui lòng thử lại.",
    mfaVerifyError: "Không thể xác minh TOTP. Thiết lập MFA chưa thay đổi.",
    mfaVerified: "TOTP đã xác minh.",
    qrAlt: "Mã QR TOTP",
    jsonBackup: "Bản sao JSON",
    emergencySub: "Thông tin khẩn cấp và hướng dẫn cho người thân",
    preImportBackupFilePrefix: "ban-sao-luu-truoc-khi-nhap-json",
    pendingImportTitle: "Còn thay đổi chưa đồng bộ xong",
    pendingImportRisk: "Nhập sao lưu sẽ xoá hàng đợi đồng bộ: thay đổi chưa đẩy sẽ mất, và dòng đã xoá có thể xuất hiện lại.",
    pendingPushFirst: "Đẩy đồng bộ trước",
    pendingAcceptRisk: "Vẫn nhập (chấp nhận rủi ro)",
    deleteToken: "XOA",
    deleteError: "Không xóa được dữ liệu.",
    accountSecurity: "Tài khoản & bảo mật",
    currentEmail: "Email hiện tại",
    lastLogin: "Đăng nhập lần cuối",
    lastLoginUnavailable: "Nhà cung cấp chưa có thời điểm này",
    passwordRecovery: "Mật khẩu & khôi phục",
    passwordRecoverySub: "Đặt lại mật khẩu có ở màn hình đăng nhập.",
    syncDetails: "Chi tiết",
    lastLocalSync: "Đồng bộ gần nhất trên thiết bị này",
    lastLocalSyncUnavailable: "Chưa có lần đồng bộ local được ghi nhận",
    data: "Dữ liệu",
    app: "Ứng dụng",
    supportHandover: "Hồ sơ khẩn cấp & bàn giao",
    pageTitle: "Cài đặt",
    pageSubtitle: "Quản lý rõ ràng tài khoản, dữ liệu local và quyền truy cập thiết bị.",
    savedLocal: "Đã lưu trên thiết bị này",
    savingLocal: "Đang lưu trên thiết bị này…",
    changesPending: "Thay đổi đang chờ lưu",
    accountSubtitle: "Đăng nhập và bảo vệ kho gia đình này.",
    syncSubtitle: "Trạng thái và đồng bộ có chủ đích giữa các thiết bị.",
    dataSubtitle: "Sao lưu và khôi phục luôn do owner chủ động kiểm soát.",
    preferences: "Giao diện & ngôn ngữ",
    appearance: "Giao diện",
    appearanceSubtitle: "Chỉ thay đổi cách ứng dụng hiển thị.",
    language: "Ngôn ngữ",
    languageSubtitle: "Lựa chọn được lưu trên thiết bị này.",
    premiumTheme: "Kho",
    darkTheme: "Đại dương",
    lightTheme: "Hổ phách",
  };
}

function localDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", {
    dateStyle: "medium",
  }).format(new Date(`${value}T00:00:00`));
}

function localDateTime(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function pendingSyncDetails(summary: PendingSyncSummary, locale: AppLocale): string {
  const conflicts = summary.conflicts ?? 0;
  const details: string[] = [];
  if (summary.total > 0 || conflicts === 0) {
    details.push(locale === "de"
      ? summary.deletes > 0
        ? `Noch ${summary.total} Synchronisierungsvorgänge offen, davon ${summary.deletes} Löschung(en).`
        : `Noch ${summary.total} Synchronisierungsvorgänge offen.`
      : summary.deletes > 0
        ? `Còn ${summary.total} việc đồng bộ chưa xong (trong đó ${summary.deletes} việc xoá).`
        : `Còn ${summary.total} việc đồng bộ chưa xong.`);
  }
  if (summary.dead > 0) details.push(locale === "de"
    ? `${summary.dead} Vorgang/Vorgänge konnten nach mehreren Versuchen nicht gesendet werden.`
    : `${summary.dead} việc đã thử gửi nhiều lần nhưng chưa thành công.`);
  if (conflicts > 0) details.push(locale === "de"
    ? `${conflicts} Datenkonflikt(e) sind noch nicht gelöst. Lösen Sie diese vor dem Import.`
    : `Có ${conflicts} xung đột chưa xử lý. Hãy xử lý xung đột trước khi nhập.`);
  return details.join(" ");
}

function themeOptions(text: SettingsText): Array<{ value: ThemeChoice; label: string; dot: "vault" | "ocean" | "ember" }> {
  return [
    { value: "premium", label: text.premiumTheme, dot: "vault" },
    { value: "dark", label: text.darkTheme, dot: "ocean" },
    { value: "light", label: text.lightTheme, dot: "ember" },
  ];
}

export default function SettingsPage({
  onReload,
  onOpenMigrate,
  refreshKey,
  onQuotesChanged,
  onSettingsChanged,
  onConflictResolved,
  focusConflictRequest,
  onSyncNow,
  syncHealth,
  onSyncHealthAction,
  onRequestSignOut,
}: {
  onReload: () => void;
  onOpenMigrate?: () => void;
  refreshKey?: number;
  onQuotesChanged?: () => void | Promise<void>;
  onSettingsChanged?: () => void | Promise<void>;
  onConflictResolved?: () => void | Promise<void>;
  focusConflictRequest?: string | null;
  onSyncNow?: () => Promise<{ message: string; tone: "success" | "error" | "info" }>;
  syncHealth?: SyncHealth;
  onSyncHealthAction?: () => void | Promise<void>;
  onRequestSignOut?: () => void | Promise<void>;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  // `tab=data` is the existing deep link used by conflict/recovery flows; retain it
  // while the Settings UI stores manual toggles under the clearer `tab=advanced`.
  const showAdvanced = requestedTab === "advanced" || requestedTab === "data";

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsLoadError, setSettingsLoadError] = useState(false);
  const [settingsLoadAttempt, setSettingsLoadAttempt] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [metaBackup, setMetaBackup] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [pendingSync, setPendingSync] = useState<PendingSyncSummary | null>(null);
  const [pendingSyncPushing, setPendingSyncPushing] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);
  const [syncingNow, setSyncingNow] = useState(false);
  const { locale, setLocale, t } = useLocale();
  const text = useMemo(() => settingsStrings(locale), [locale]);
  const [dead, setDead] = useState<OutboxItem[]>([]);
  const [lastLocalSyncAt, setLastLocalSyncAt] = useState("");
  const [mfaEnrollment, setMfaEnrollment] = useState<{
    factorId: string;
    qrCode: string;
    secret: string;
  } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaMessage, setMfaMessage] = useState<string | null>(null);
  const [mfaSetupError, setMfaSetupError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [openAdvancedGroup, setOpenAdvancedGroup] = useState<"prices" | "sync" | "plan" | "data" | null>(() =>
    focusConflictRequest ? "sync" : null,
  );
  const auth = useAuth();
  const { readOnly, showBlocked } = useRecoveryReadOnly();

  const pendingSettings = useRef<Partial<AppSettings>>({});
  const saveTimer = useRef<number | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const outstandingSaves = useRef(0);
  const mounted = useRef(true);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const onSettingsChangedRef = useRef(onSettingsChanged);
  const safetyBackupDone = useRef(false);

  useEffect(() => {
    onSettingsChangedRef.current = onSettingsChanged;
  }, [onSettingsChanged]);

  useEffect(() => {
    if (focusConflictRequest) setOpenAdvancedGroup("sync");
  }, [focusConflictRequest]);

  const toggleAdvancedGroup = (group: "prices" | "sync" | "plan" | "data") => {
    setOpenAdvancedGroup((current) => current === group ? null : group);
  };

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    setSettingsLoading(true);
    setSettingsLoadError(false);
    void (async () => {
      try {
        const nextSettings = await getSettings();
        const nextMetaBackup = (await db.appMetadata.get("meta"))?.lastBackupAt ?? "";
        const [nextDead, syncMeta] = auth.user?.id
          ? await Promise.all([listDeadOutbox(), getSyncMeta(auth.user.id)])
          : [[] as OutboxItem[], null] as const;
        if (cancelled) return;
        setSettings(nextSettings);
        setMetaBackup(nextMetaBackup);
        setDead(nextDead);
        setLastLocalSyncAt(syncMeta ? [syncMeta.lastPulledAt, syncMeta.lastPushedAt].filter(Boolean).sort().at(-1) ?? "" : "");
      } catch {
        if (!cancelled) setSettingsLoadError(true);
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [auth.user?.id, settingsLoadAttempt]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  async function flushPendingSettings() {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const partial = pendingSettings.current;
    if (Object.keys(partial).length === 0) return;
    pendingSettings.current = {};
    outstandingSaves.current += 1;
    const run = async () => {
      let failed = false;
      if (mounted.current) setSaveState("saving");
      try {
        await saveSettings(partial);
        await onSettingsChangedRef.current?.();
        if (mounted.current) setSaveError(null);
      } catch {
        failed = true;
        pendingSettings.current = { ...partial, ...pendingSettings.current };
        if (mounted.current) {
          setSaveError(text.saveError);
          setSaveState("error");
        }
      } finally {
        outstandingSaves.current -= 1;
        if (mounted.current && !failed) {
          const stillPending = Object.keys(pendingSettings.current).length > 0;
          setSaveState(stillPending ? "dirty" : outstandingSaves.current > 0 ? "saving" : "saved");
        }
      }
    };
    const queued = saveQueue.current.then(run, run);
    saveQueue.current = queued.then(
      () => undefined,
      () => undefined,
    );
    await queued;
  }
  flushRef.current = flushPendingSettings;

  function scheduleSettingsSave() {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void flushRef.current();
    }, SETTINGS_AUTOSAVE_MS);
  }

  function patchSettings(partial: Partial<AppSettings>) {
    if (readOnly) {
      showBlocked();
      return;
    }
    setSettings((current) => (current ? { ...current, ...partial } : current));
    pendingSettings.current = { ...pendingSettings.current, ...partial };
    setSaveError(null);
    setSaveState("dirty");
    scheduleSettingsSave();
  }

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") void flushRef.current();
    };
    window.addEventListener("pagehide", flushWhenHidden);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushWhenHidden);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      const partial = pendingSettings.current;
      pendingSettings.current = {};
      if (Object.keys(partial).length > 0) void saveSettings(partial).catch(() => undefined);
    };
  }, []);

  function pickTheme(next: ThemeChoice) {
    setTheme(next);
    persistTheme(next);
  }

  async function runVisibleSync() {
    if (syncingNow) return;
    setActionError(null);
    if (!onSyncNow) {
      setActionError(t("syncNeedsSignIn"));
      return;
    }
    setSyncingNow(true);
    try {
      const result = await onSyncNow();
      if (result.tone === "error") setActionError(result.message);
      else setMfaMessage(result.message);
      setDead(auth.user?.id ? await listDeadOutbox() : []);
      if (auth.user?.id) {
        const meta = await getSyncMeta(auth.user.id);
        setLastLocalSyncAt([meta.lastPulledAt, meta.lastPushedAt].filter(Boolean).sort().at(-1) ?? "");
      }
    } finally {
      setSyncingNow(false);
    }
  }

  function downloadJson(payload: BackupPayload, name: string) {
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
    anchor.download = name;
    anchor.click();
  }

  async function doExport() {
    setActionError(null);
    try {
      const payload = await exportBackup();
      downloadJson(payload, `vwce-backup-${payload.exportedAt.slice(0, 10)}.json`);
      setMetaBackup(payload.exportedAt);
    } catch {
      setActionError(text.exportError);
    }
  }

  function doImport(file: File) {
    if (readOnly) {
      showBlocked();
      return;
    }
    setActionError(null);
    setPendingSync(null);
    safetyBackupDone.current = false;
    setPendingFile(file);
  }

  function closeImport() {
    setPendingFile(null);
    setPendingSync(null);
  }

  async function pushPendingSyncBeforeImport() {
    if (readOnly) {
      showBlocked();
      return;
    }
    const userId = auth.user?.id;
    if (!userId) return;
    setPendingSyncPushing(true);
    setActionError(null);
    try {
      await reviveDeadOutbox();
      await pushOutbox(userId);
      setDead(await listDeadOutbox());
      setPendingSync(null);
    } catch {
      setActionError(text.pendingPushError);
    } finally {
      setPendingSyncPushing(false);
    }
  }

  async function confirmImport() {
    if (readOnly) {
      showBlocked();
      return;
    }
    const file = pendingFile;
    if (!file) return;
    setImporting(true);
    setActionError(null);
    try {
      let data: BackupPayload;
      try {
        data = JSON.parse(await file.text());
      } catch {
        alert(text.invalidJson);
        closeImport();
        return;
      }
      if (!data || typeof data !== "object") {
        alert(text.invalidBackup);
        closeImport();
        return;
      }
      if (!isSupportedBackupSchema(data.schemaVersion)) {
        alert(text.unsupportedSchema);
        closeImport();
        return;
      }
      if (!safetyBackupDone.current) {
        try {
          const current = await exportBackup();
          downloadJson(
            current,
            `${text.preImportBackupFilePrefix}-${current.exportedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`,
          );
          safetyBackupDone.current = true;
        } catch {
          alert(text.preImportBackupError);
          closeImport();
          return;
        }
      }
      try {
        if (pendingSync) await importBackup(data, { acceptPendingSyncRisk: true });
        else await importBackup(data);
      } catch (error) {
        const blocked = pendingSyncImportBlock(error);
        if (!blocked) throw error;
        setPendingSync(blocked);
        return;
      }
      alert(text.importSuccess);
      closeImport();
      onReload();
    } catch {
      alert(text.importError);
      closeImport();
    } finally {
      setImporting(false);
    }
  }

  async function exportCsv() {
    setActionError(null);
    try {
      const transactions = await listTransactions();
      const header = "date,type,amount,unitPrice,quantity,fee,tax,instrumentIsin,notes\n";
      const rows = transactions
        .map((t) =>
          [
            csvEscape(t.date),
            csvEscape(t.type),
            csvEscape(t.amount),
            csvEscape(t.unitPrice ?? ""),
            csvEscape(t.quantity ?? ""),
            csvEscape(t.fee ?? ""),
            csvEscape(t.tax ?? ""),
            csvEscape(t.instrumentIsin ?? ""),
            csvEscape(t.notes ?? ""),
          ].join(","),
        )
        .join("\n");
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(
        new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8" }),
      );
      anchor.download = "vwce-transactions.csv";
      anchor.click();
    } catch {
      setActionError(text.csvExportError);
    }
  }

  const syncLabel = useMemo(() => {
    if (syncHealth) return syncHealthCopy(syncHealth, locale).title;
    if (!online) return t("offline");
    if (dead.length > 0) return t("pendingSync").replace("{count}", String(dead.length));
    return t("synced");
  }, [syncHealth, locale, online, dead.length, t]);

  if (settingsLoading) return <main className="demo-v10-screen" role="status" aria-label={t("settingsLoading")} aria-busy="true" />;
  if (settingsLoadError || !settings) {
    return (
      <main className="demo-v10-screen">
        <section className="gl" style={{ padding: 18 }} role="alert">
          <h1 className="demo-v10-section-title">{t("settingsLoadError")}</h1>
          <button type="button" onClick={() => setSettingsLoadAttempt((a) => a + 1)}>
            {t("retry")}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="demo-v10-screen" aria-label={t("settingsAria")}>
      <div className="set-wrap">
      <header className="set-page-head">
        <div>
          <p className="set-page-kicker">{text.pageTitle}</p>
          <h1>{text.pageTitle}</h1>
          <p>{text.pageSubtitle}</p>
        </div>
        <span className={`set-save-state ${saveState}`} role="status" aria-live="polite">
          {saveState === "saved" ? text.savedLocal : saveState === "saving" ? text.savingLocal : text.changesPending}
        </span>
      </header>
      {saveError || actionError ? (
        <div className="gl" style={{ padding: 12 }} role="alert">
          <span>{saveError ?? actionError}</span>
          {saveError ? (
            <button type="button" onClick={() => void flushRef.current()}>
              {t("retrySave")}
            </button>
          ) : (
            <button type="button" onClick={() => setActionError(null)}>
              {t("close")}
            </button>
          )}
        </div>
      ) : null}

      <header className="set-section-head">
        <div><span>{text.accountSecurity}</span><small>{text.accountSubtitle}</small></div>
      </header>
      <section className="gl set-block">
        <div className="set-row set-row-static">
          <span className="si-ico v" aria-hidden>@</span>
          <span className="sr-body">
            <span className="sr-name">{text.currentEmail}</span>
            <span className="sr-sub">{auth.user?.email ?? t("syncNeedsSignIn")}</span>
          </span>
        </div>
        <div className="set-row set-row-static">
          <span className="si-ico e" aria-hidden>◷</span>
          <span className="sr-body">
            <span className="sr-name">{text.lastLogin}</span>
            <span className="sr-sub">{auth.user?.last_sign_in_at ? localDateTime(auth.user.last_sign_in_at, locale) : text.lastLoginUnavailable}</span>
          </span>
        </div>
        <div className="set-row set-row-static">
          <span className="si-ico v" aria-hidden>⌁</span>
          <span className="sr-body">
            <span className="sr-name">{text.passwordRecovery}</span>
            <span className="sr-sub">{text.passwordRecoverySub}</span>
          </span>
        </div>
        <button
          type="button"
          className="set-row"
          onClick={() =>
            void (async () => {
              if (readOnly) {
                showBlocked();
                return;
              }
              if (auth.mfaEnrolled || mfaEnrollment) return;
              setMfaBusy(true);
              setMfaSetupError(null);
              try {
                const result = await auth.startMfaEnrollment();
                if (result.error || !result.data) setMfaSetupError(text.mfaStartError);
                else setMfaEnrollment(result.data);
              } finally {
                setMfaBusy(false);
              }
            })()
          }
        >
          <span className="si-ico e" aria-hidden>⍁</span>
          <span className="sr-body">
            <span className="sr-name">{t("mfaState")}</span>
            <span className="sr-sub">{auth.mfaEnrolled ? t("mfaEnabled") : mfaBusy ? t("mfaCreating") : t("mfaSetup")}</span>
          </span>
          <span className="sr-arr">›</span>
        </button>
      </section>

      <header className="set-section-head">
        <div><span>{t("sync")}</span><small>{text.syncSubtitle}</small></div>
      </header>
      <section className="gl set-block">
        {syncHealth ? <SyncHealthSummary health={syncHealth} onAction={onSyncHealthAction} compact /> : null}
        <div className="set-row set-row-static">
          <span className="si-ico e" aria-hidden>↻</span>
          <span className="sr-body">
            <span className="sr-name">{syncingNow ? t("syncing") : syncLabel}</span>
            <span className="sr-sub">{lastLocalSyncAt ? `${text.lastLocalSync}: ${localDateTime(lastLocalSyncAt, locale)}` : text.lastLocalSyncUnavailable}</span>
          </span>
        </div>
        <button type="button" className="set-row set-sync-primary" disabled={syncingNow} onClick={() => void runVisibleSync()}>
          <span className="si-ico e" aria-hidden>↻</span>
          <span className="sr-body">
            <span className="sr-name">{syncingNow ? t("syncing") : t("syncNow")}</span>
            <span className="sr-sub">{auth.user?.id ? syncLabel : t("syncNeedsSignIn")}</span>
          </span>
          <span className="sr-arr">›</span>
        </button>
        <details className="set-sync-details">
          <summary>{text.syncDetails}</summary>
          <LocalDiagnosticsPanel />
        </details>
      </section>

      <header className="set-section-head">
        <div><span>{text.data}</span><small>{text.dataSubtitle}</small></div>
      </header>
      <section className="gl set-block">
        <button type="button" className="set-row" onClick={() => void doExport()}>
          <span className="si-ico v" aria-hidden>↥</span>
          <span className="sr-body">
            <span className="sr-name">{t("exportJson")}</span>
            <span className="sr-sub">{metaBackup ? t("backupOn").replace("{date}", localDate(metaBackup.slice(0, 10), locale)) : t("noBackup")}</span>
          </span>
          <span className="sr-arr">›</span>
        </button>
        <label className="set-row">
          <span className="si-ico a" aria-hidden>↧</span>
          <span className="sr-body">
            <span className="sr-name">{t("importBackup")}</span>
            <span className="sr-sub">{text.jsonBackup}</span>
          </span>
          <span className="sr-arr">›</span>
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) doImport(f);
              e.target.value = "";
            }}
          />
        </label>
      </section>

      <header className="set-section-head">
        <div><span>{text.preferences}</span><small>{text.app}</small></div>
      </header>
      <section className="gl set-block set-preferences">
        <div className="set-preference-head"><span>{text.appearance}</span><small>{text.appearanceSubtitle}</small></div>
        <div className="theme-picker">
          {themeOptions(text).map((opt) => (
            <button key={opt.value} type="button" className={"th-opt" + (theme === opt.value ? " sel" : "")} onClick={() => pickTheme(opt.value)}>
              <span className={`th-dot ${opt.dot}`} aria-hidden />
              <span className="th-name">{opt.label}</span>
            </button>
          ))}
        </div>
        <div className="set-preference-head language"><span>{text.language}</span><small>{text.languageSubtitle}</small></div>
        <div className="lang-options">
          <button type="button" className={`lang-opt${locale === "vi" ? " selected" : ""}`} onClick={() => setLocale("vi")}>
            {t("vietnamese")}<small>{locale === "vi" ? t("using") : t("available")}</small>
          </button>
          <button type="button" className={`lang-opt${locale === "de" ? " selected" : ""}`} onClick={() => setLocale("de")}>
            {t("german")}<small>{locale === "de" ? t("active") : t("available")}</small>
          </button>
        </div>
        <Link to="/notfallmappe" className="set-row" style={{ textDecoration: "none" }}>
          <span className="si-ico v" aria-hidden>🛡</span>
          <span className="sr-body">
            <span className="sr-name">{text.supportHandover}</span>
            <span className="sr-sub">{text.emergencySub}</span>
          </span>
          <span className="sr-arr">›</span>
        </Link>
      </section>

      {mfaEnrollment ? (
        <section className="gl set-security-setup" style={{ padding: 16 }}>
          <img src={mfaEnrollment.qrCode} alt={text.qrAlt} style={{ width: 180, borderRadius: 12 }} />
          <code style={{ display: "block", marginTop: 8, overflowWrap: "anywhere" }}>{mfaEnrollment.secret}</code>
          <input
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
            maxLength={6}
            inputMode="numeric"
            placeholder={t("totpCode")}
            style={{ marginTop: 8, width: "100%" }}
          />
          <button
            type="button"
            disabled={mfaBusy || mfaCode.length !== 6}
            onClick={() =>
              void (async () => {
                setMfaBusy(true);
                try {
                  const result = await auth.verifyMfaEnrollment(mfaEnrollment.factorId, mfaCode);
                  if (result.error) setMfaSetupError(text.mfaVerifyError);
                  else {
                    setMfaEnrollment(null);
                    setMfaCode("");
                    setMfaMessage(text.mfaVerified);
                  }
                } finally {
                  setMfaBusy(false);
                }
              })()
            }
          >
            {t("verifyTotp")}
          </button>
          {mfaSetupError ? <p role="alert">{mfaSetupError}</p> : null}
        </section>
      ) : null}
      {mfaMessage ? <p className="ver">{mfaMessage}</p> : null}

      {pendingFile ? (
        <section className="gl" style={{ padding: 16 }} role="alertdialog">
          <strong>{t("replaceData").replace("{file}", pendingFile.name)}</strong>
          {pendingSync ? (
            <div role="alert">
              <p>{text.pendingImportTitle}</p>
              <p>{pendingSyncDetails(pendingSync, locale)}</p>
              <p>{text.pendingImportRisk}</p>
            </div>
          ) : null}
          <div className="stack" style={{ marginTop: 12 }}>
            {pendingSync && auth.user?.id ? (
              <button type="button" disabled={importing || pendingSyncPushing} onClick={() => void pushPendingSyncBeforeImport()}>
                {pendingSyncPushing ? t("syncing") : text.pendingPushFirst}
              </button>
            ) : null}
            <button type="button" disabled={importing || pendingSyncPushing} onClick={() => void confirmImport()}>
              {importing ? t("importing") : pendingSync ? text.pendingAcceptRisk : t("confirmImport")}
            </button>
            <button type="button" className="secondary" disabled={importing} onClick={closeImport}>
              {t("cancel")}
            </button>
          </div>
        </section>
      ) : null}

      <details
        className="set-advanced"
        open={showAdvanced}
        onToggle={(e) => {
          const open = (e.target as HTMLDetailsElement).open;
          setSearchParams(open ? { tab: "advanced" } : {}, { replace: true });
        }}
      >
        <summary>{t("advanced")}</summary>
        <p className="advanced-intro">{t("advancedIntro")}</p>

        <details className="advanced-group" open={openAdvancedGroup === "prices"}>
          <summary onClick={(event) => { event.preventDefault(); toggleAdvancedGroup("prices"); }}>{t("prices")}</summary>
          <SettingsPricePanel refreshKey={refreshKey} onQuotesChanged={onQuotesChanged} />
        </details>

        <details className="advanced-group" open={openAdvancedGroup === "sync"}>
          <summary onClick={(event) => { event.preventDefault(); toggleAdvancedGroup("sync"); }}>{t("syncConflicts")}</summary>
          {auth.user?.id ? (
            <SyncConflictSection
              userId={auth.user.id}
              focusRequest={focusConflictRequest}
              onResolved={async () => {
                await onConflictResolved?.();
              }}
              onSyncNow={onSyncNow ? async () => {
                const result = await onSyncNow();
                if (result.tone === "error") setActionError(result.message);
                else setMfaMessage(result.message);
                await onConflictResolved?.();
              } : undefined}
            />
          ) : <p className="advanced-empty">{t("syncConflictsSignIn")}</p>}
        </details>

        <details className="advanced-group" open={openAdvancedGroup === "plan"}>
          <summary onClick={(event) => { event.preventDefault(); toggleAdvancedGroup("plan"); }}>{t("plan")}</summary>
          <PlanRoadmapSection
            target={settings.planTarget ?? { targetUseDate: settings.endDate, needFullAmount: true }}
            onChangeTarget={(next) => patchSettings({ planTarget: next })}
          />
        </details>

        <details className="advanced-group" open={openAdvancedGroup === "data"}>
          <summary onClick={(event) => { event.preventDefault(); toggleAdvancedGroup("data"); }}>{t("dataTools")}</summary>
          <LocalDataInventoryPanel />
          <div className="advanced-actions">
            <button type="button" className="set-row" onClick={() => void exportCsv()}>
              <span className="sr-name">{t("exportTransactionsCsv")}</span>
              <span className="sr-sub">{t("exportTransactionsCsvSub")}</span>
            </button>
            {onOpenMigrate ? (
              <button type="button" className="set-row" onClick={onOpenMigrate}>
                <span className="sr-name">{t("restoreDeviceData")}</span>
                <span className="sr-sub">{t("restoreDeviceDataSub")}</span>
              </button>
            ) : null}
            <button type="button" className="set-row" onClick={() => setDeleteOpen(true)}>
              <span className="sr-name" style={{ color: "var(--demo-re)" }}>{t("clearLocalData")}</span>
              <span className="sr-sub">{t("clearLocalDataSub")}</span>
            </button>
            {deleteOpen ? (
              <div className="advanced-delete">
                <p>{locale === "de" ? `Geben Sie ${text.deleteToken} zur Bestätigung ein. Dieser Vorgang kann auf diesem Gerät nicht rückgängig gemacht werden.` : t("deleteConfirmText")}</p>
                <input placeholder={text.deleteToken} value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} />
                <button
                  type="button"
                  disabled={deleteBusy || deleteConfirm.trim().toUpperCase() !== text.deleteToken}
                  onClick={() =>
                    void (async () => {
                      if (readOnly) {
                        showBlocked();
                        return;
                      }
                      setDeleteBusy(true);
                      try {
                        await clearAllData();
                        window.location.reload();
                      } catch {
                        setActionError(text.deleteError);
                      } finally {
                        setDeleteBusy(false);
                      }
                    })()
                  }
                >
                  {t("confirmDelete")}
                </button>
              </div>
            ) : null}
          </div>
        </details>
      </details>

      {onRequestSignOut ? (
        <button
          type="button"
          className="abmeld"
          onClick={() => void onRequestSignOut()}
        >
          🔓 {t("logout")}
        </button>
      ) : null}

      <p className="ver">
        v{APP_RELEASE_VERSION} · {online ? t("online") : t("offline")}
      </p>
      </div>
    </main>
  );
}
