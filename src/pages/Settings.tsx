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
import { APP_VERSION } from "../lib/types";
import {
  isSupportedBackupSchema,
  unsupportedBackupSchemaMessage,
} from "../lib/backupSchema";
import {
  PENDING_SYNC_ACCEPT_LABEL,
  PENDING_SYNC_IMPORT_RISK,
  PENDING_SYNC_IMPORT_TITLE,
  PENDING_SYNC_PUSH_FIRST_LABEL,
  pendingSyncCountLine,
  pendingSyncImportBlock,
} from "../lib/backupImportGate";
import { csvEscape, formatDateVN } from "../lib/calc";
import type { ThemeChoice } from "../lib/theme";
import { persistTheme, readTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { listDeadOutbox, pushOutbox, reviveDeadOutbox } from "../lib/sync/engine";
import type { OutboxItem, PendingSyncSummary } from "../lib/sync/types";
import { useRecoveryReadOnly } from "../lib/recoveryReadOnly";
import SettingsPricePanel from "../components/SettingsPricePanel";
import SyncConflictSection from "../components/SyncConflictSection";
import PlanRoadmapSection from "../components/PlanRoadmapSection";
import "../styles/settings-operation-errors.css";
import "../styles/demo-v10-settings.css";

const SETTINGS_AUTOSAVE_MS = 650;
const SETTINGS_SAVE_ERROR = "Không lưu được Cài đặt. Bản đang chỉnh vẫn còn trên màn hình.";
const PENDING_SYNC_PUSH_ERROR =
  "Không đẩy được các thay đổi đang chờ. Dữ liệu trên thiết bị vẫn được giữ nguyên.";

const DEMO_THEME_OPTIONS: Array<{ value: ThemeChoice; label: string; dot: "vault" | "ocean" | "ember" }> = [
  { value: "premium", label: "Vault", dot: "vault" },
  { value: "dark", label: "Ocean", dot: "ocean" },
  { value: "light", label: "Ember", dot: "ember" },
];

function berlinNow() {
  const now = new Date();
  return {
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now),
    date: new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Europe/Berlin",
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(now),
  };
}

export default function SettingsPage({
  onReload,
  onOpenMigrate,
  refreshKey,
  onQuotesChanged,
  onSettingsChanged,
  onConflictResolved,
  focusConflictRequest,
}: {
  onReload: () => void;
  onOpenMigrate?: () => void;
  refreshKey?: number;
  onQuotesChanged?: () => void | Promise<void>;
  onSettingsChanged?: () => void | Promise<void>;
  onConflictResolved?: () => void | Promise<void>;
  focusConflictRequest?: string | null;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const showAdvanced = searchParams.get("tab") === "advanced";

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
  const [lang, setLang] = useState("vi");
  const [dead, setDead] = useState<OutboxItem[]>([]);
  const [clock, setClock] = useState(berlinNow);
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
    const id = window.setInterval(() => setClock(berlinNow()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    setSettingsLoading(true);
    setSettingsLoadError(false);
    void (async () => {
      try {
        const nextSettings = await getSettings();
        const nextMetaBackup = (await db.appMetadata.get("meta"))?.lastBackupAt ?? "";
        const nextDead = auth.user?.id ? await listDeadOutbox() : [];
        if (cancelled) return;
        setSettings(nextSettings);
        setMetaBackup(nextMetaBackup);
        setDead(nextDead);
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
          setSaveError(SETTINGS_SAVE_ERROR);
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
      setActionError("Không xuất được bản sao lưu JSON. Dữ liệu không bị thay đổi.");
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
      setActionError(PENDING_SYNC_PUSH_ERROR);
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
        alert("JSON không hợp lệ");
        closeImport();
        return;
      }
      if (!data || typeof data !== "object") {
        alert("Cấu trúc backup không hợp lệ");
        closeImport();
        return;
      }
      if (!isSupportedBackupSchema(data.schemaVersion)) {
        alert(unsupportedBackupSchemaMessage(data.schemaVersion));
        closeImport();
        return;
      }
      if (!safetyBackupDone.current) {
        try {
          const current = await exportBackup();
          downloadJson(
            current,
            `ban-sao-luu-truoc-khi-nhap-json-${current.exportedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`,
          );
          safetyBackupDone.current = true;
        } catch {
          alert("Không tạo được bản sao lưu trước khi nhập. Dữ liệu chưa bị thay đổi.");
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
      alert("Nhập backup thành công");
      closeImport();
      onReload();
    } catch {
      alert("Không nhập được backup. Dữ liệu hiện tại vẫn được giữ nguyên.");
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
      setActionError("Không xuất được CSV giao dịch. Dữ liệu không bị thay đổi.");
    }
  }

  const syncLabel = useMemo(() => {
    if (!online) return "Offline";
    if (dead.length > 0) return `${dead.length} chờ đồng bộ`;
    return "Đã đồng bộ";
  }, [online, dead.length]);

  if (settingsLoading) return <main className="demo-v10-screen" aria-busy="true" />;
  if (settingsLoadError || !settings) {
    return (
      <main className="demo-v10-screen">
        <section className="gl" style={{ padding: 18 }} role="alert">
          <h1 className="demo-v10-section-title">Không tải được Cài đặt</h1>
          <button type="button" onClick={() => setSettingsLoadAttempt((a) => a + 1)}>
            Thử lại
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="demo-v10-screen" aria-label="Cài đặt">
      <div className="set-wrap">
      <section className="gl set-dt">
        <div className="dt-lbl">Berlin · giờ hiện tại</div>
        <div className="dt-big">{clock.time}</div>
        <div className="dt-date">{clock.date}</div>
        <div className="dt-sync">
          <span className="sdot" aria-hidden />
          {syncLabel}
          {saveState === "saving" ? " · Đang lưu…" : saveState === "dirty" ? " · Sẽ tự lưu" : ""}
        </div>
      </section>

      {saveError || actionError ? (
        <div className="gl" style={{ padding: 12 }} role="alert">
          <span>{saveError ?? actionError}</span>
          {saveError ? (
            <button type="button" onClick={() => void flushRef.current()}>
              Thử lưu lại
            </button>
          ) : (
            <button type="button" onClick={() => setActionError(null)}>
              Đóng
            </button>
          )}
        </div>
      ) : null}

      <div className="set-sec">Giao diện</div>
      <section className="gl set-block">
        <div className="theme-picker">
          {DEMO_THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={"th-opt" + (theme === opt.value ? " sel" : "")}
              onClick={() => pickTheme(opt.value)}
            >
              <span className={`th-dot ${opt.dot}`} aria-hidden />
              <span className="th-name">{opt.label}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="set-sec">Ngôn ngữ</div>
      <section className="gl set-block">
        <div className="lang-options">
          <button type="button" className={`lang-opt${lang === "vi" ? " selected" : ""}`} onClick={() => setLang("vi")}>
            Tiếng Việt<small>UI marker</small>
          </button>
          <button type="button" className={`lang-opt${lang === "de" ? " selected" : ""}`} onClick={() => setLang("de")}>
            Deutsch<small>UI marker</small>
          </button>
        </div>
      </section>

      <div className="set-sec">Đồng bộ</div>
      <section className="gl set-block">
        <button
          type="button"
          className="set-row"
          onClick={() =>
            void (async () => {
              if (!auth.user?.id) return;
              setActionError(null);
              try {
                await reviveDeadOutbox();
                await pushOutbox(auth.user.id);
                setDead(await listDeadOutbox());
              } catch {
                setActionError("Không đồng bộ được. Dữ liệu local vẫn được giữ nguyên.");
              }
            })()
          }
        >
          <span className="si-ico e" aria-hidden>
            ↻
          </span>
          <span className="sr-body">
            <span className="sr-name">Đồng bộ ngay</span>
            <span className="sr-sub">{syncLabel}</span>
          </span>
          <span className="sr-arr">›</span>
        </button>
        <button type="button" className="set-row" onClick={() => void doExport()}>
          <span className="si-ico v" aria-hidden>
            ↥
          </span>
          <span className="sr-body">
            <span className="sr-name">Xuất JSON</span>
            <span className="sr-sub">
              {metaBackup ? `Sao lưu ${formatDateVN(metaBackup.slice(0, 10))}` : "Chưa có bản sao lưu"}
            </span>
          </span>
          <span className="sr-arr">›</span>
        </button>
        <label className="set-row">
          <span className="si-ico a" aria-hidden>
            ↧
          </span>
          <span className="sr-body">
            <span className="sr-name">Nhập sao lưu</span>
            <span className="sr-sub">JSON backup</span>
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

      <div className="set-sec">Tài khoản</div>
      <section className="gl set-block">
        <Link to="/notfallmappe" className="set-row" style={{ textDecoration: "none" }}>
          <span className="si-ico v" aria-hidden>
            🛡
          </span>
          <span className="sr-body">
            <span className="sr-name">Hồ sơ khẩn cấp</span>
            <span className="sr-sub">Notfallmappe</span>
          </span>
          <span className="sr-arr">›</span>
        </Link>
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
                if (result.error || !result.data) setMfaSetupError(result.error ?? "Không bắt đầu được TOTP.");
                else setMfaEnrollment(result.data);
              } finally {
                setMfaBusy(false);
              }
            })()
          }
        >
          <span className="si-ico e" aria-hidden>
            ⍁
          </span>
          <span className="sr-body">
            <span className="sr-name">MFA / TOTP</span>
            <span className="sr-sub">
              {auth.mfaEnrolled ? "Đã bật" : mfaBusy ? "Đang tạo…" : "Thiết lập"}
            </span>
          </span>
          <span className="sr-arr">›</span>
        </button>
      </section>

      {mfaEnrollment ? (
        <section className="gl" style={{ padding: 16 }}>
          <img src={mfaEnrollment.qrCode} alt="QR TOTP" style={{ width: 180, borderRadius: 12 }} />
          <code style={{ display: "block", marginTop: 8, overflowWrap: "anywhere" }}>{mfaEnrollment.secret}</code>
          <input
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
            maxLength={6}
            inputMode="numeric"
            placeholder="Mã 6 số"
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
                  if (result.error) setMfaSetupError(result.error);
                  else {
                    setMfaEnrollment(null);
                    setMfaCode("");
                    setMfaMessage("TOTP đã xác minh.");
                  }
                } finally {
                  setMfaBusy(false);
                }
              })()
            }
          >
            Xác minh TOTP
          </button>
          {mfaSetupError ? <p role="alert">{mfaSetupError}</p> : null}
        </section>
      ) : null}
      {mfaMessage ? <p className="ver">{mfaMessage}</p> : null}

      {pendingFile ? (
        <section className="gl" style={{ padding: 16 }} role="alertdialog">
          <strong>Thay dữ liệu bằng file {pendingFile.name}?</strong>
          {pendingSync ? (
            <div role="alert">
              <p>{PENDING_SYNC_IMPORT_TITLE}</p>
              <p>{pendingSyncCountLine(pendingSync)}</p>
              <p>{PENDING_SYNC_IMPORT_RISK}</p>
            </div>
          ) : null}
          <div className="stack" style={{ marginTop: 12 }}>
            {pendingSync && auth.user?.id ? (
              <button type="button" disabled={importing || pendingSyncPushing} onClick={() => void pushPendingSyncBeforeImport()}>
                {pendingSyncPushing ? "Đang đẩy…" : PENDING_SYNC_PUSH_FIRST_LABEL}
              </button>
            ) : null}
            <button type="button" disabled={importing || pendingSyncPushing} onClick={() => void confirmImport()}>
              {importing ? "Đang nhập…" : pendingSync ? PENDING_SYNC_ACCEPT_LABEL : "Xác nhận nhập"}
            </button>
            <button type="button" className="secondary" disabled={importing} onClick={closeImport}>
              Hủy
            </button>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        className="abmeld"
        onClick={() => void auth.signOut()}
      >
        🔓 Abmelden
      </button>

      <details
        className="set-advanced"
        open={showAdvanced}
        onToggle={(e) => {
          const open = (e.target as HTMLDetailsElement).open;
          setSearchParams(open ? { tab: "advanced" } : {}, { replace: true });
        }}
      >
        <summary>Nâng cao · giá · kế hoạch · dữ liệu</summary>
        <SettingsPricePanel refreshKey={refreshKey} onQuotesChanged={onQuotesChanged} />
        {auth.user?.id ? (
          <SyncConflictSection
            userId={auth.user.id}
            focusRequest={focusConflictRequest}
            onResolved={async () => {
              await onConflictResolved?.();
            }}
          />
        ) : null}
        <PlanRoadmapSection
          target={settings.planTarget ?? { targetUseDate: settings.endDate, needFullAmount: true }}
          onChangeTarget={(next) => patchSettings({ planTarget: next })}
        />
        <button type="button" className="set-row" onClick={() => void exportCsv()}>
          <span className="sr-name">Xuất CSV giao dịch</span>
        </button>
        {onOpenMigrate ? (
          <button type="button" className="set-row" onClick={onOpenMigrate}>
            <span className="sr-name">Khôi phục dữ liệu trên thiết bị</span>
          </button>
        ) : null}
        <button type="button" className="set-row" onClick={() => setDeleteOpen(true)}>
          <span className="sr-name" style={{ color: "var(--demo-re)" }}>
            Xóa toàn bộ dữ liệu local
          </span>
        </button>
        {deleteOpen ? (
          <div style={{ padding: 12 }}>
            <p>Gõ XOA để xác nhận.</p>
            <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} />
            <button
              type="button"
              disabled={deleteBusy || deleteConfirm.trim().toUpperCase() !== "XOA"}
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
                    setActionError("Không xóa được dữ liệu.");
                  } finally {
                    setDeleteBusy(false);
                  }
                })()
              }
            >
              Xác nhận xóa
            </button>
          </div>
        ) : null}
      </details>

      <p className="ver">
        v{APP_VERSION} · {online ? "Online" : "Offline"}
      </p>
      </div>
    </main>
  );
}
