import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  clearAllData,
  db,
  exportBackup,
  getOrCreateChecklist,
  getSettings,
  importBackup,
  listTransactions,
  saveSettings,
} from "../lib/db";
import type { AnnualChecklist, AppSettings, BackupPayload } from "../lib/types";
import { APP_VERSION } from "../lib/types";
import {
  isSupportedBackupSchema,
  unsupportedBackupSchemaMessage,
} from "../lib/backupSchema";
import { csvEscape, formatDateVN, parseDecimal } from "../lib/calc";
import type { ThemeChoice } from "../lib/theme";
import { THEME_OPTIONS, persistTheme, readTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { listDeadOutbox, pushOutbox, reviveDeadOutbox } from "../lib/sync/engine";
import type { OutboxItem } from "../lib/sync/types";
import { useRecoveryReadOnly } from "../lib/recoveryReadOnly";
import SettingsPricePanel from "../components/SettingsPricePanel";
import SyncConflictSection from "../components/SyncConflictSection";
import PlanRoadmapSection from "../components/PlanRoadmapSection";

type SettingsTab = "general" | "prices" | "data";
type SaveState = "saved" | "dirty" | "saving" | "error";

const SETTINGS_AUTOSAVE_MS = 650;

function pctDisplay(decimal: number): string {
  if (!Number.isFinite(decimal)) return "—";
  return `${(decimal * 100).toLocaleString("vi-VN", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })} %`;
}

function pctToRate(pct: number): number {
  return Math.round(pct * 1e4) / 1e6;
}

function formatNum(n: number, minFrac: number, maxFrac: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("vi-VN", {
    minimumFractionDigits: minFrac,
    maximumFractionDigits: maxFrac,
  });
}

function NumField({
  id,
  value,
  onCommit,
  suffix,
  minFrac = 0,
  maxFrac = 2,
  ariaLabel,
}: {
  id?: string;
  value: number;
  onCommit: (n: number) => void;
  suffix?: string;
  minFrac?: number;
  maxFrac?: number;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft !== null ? draft : formatNum(value, minFrac, maxFrac);
  return (
    <span className="number-field-wrap">
      <input
        id={id}
        className="pct-input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={ariaLabel}
        value={display}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          if (!raw.trim()) return;
          const next = parseDecimal(raw);
          if (Number.isFinite(next) && next !== value) onCommit(next);
        }}
        onFocus={(event) => {
          setDraft(event.target.value);
          event.target.select();
        }}
        onBlur={() => {
          if (draft?.trim()) {
            const next = parseDecimal(draft);
            if (Number.isFinite(next) && next !== value) onCommit(next);
          }
          setDraft(null);
        }}
      />
      {suffix ? <span className="pct-suffix">{suffix}</span> : null}
    </span>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="seg-control" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "seg-opt active" : "seg-opt"}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
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
  const requestedTab = searchParams.get("tab");
  const activeTab: SettingsTab =
    requestedTab === "prices" || requestedTab === "data" ? requestedTab : "general";

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsLoadError, setSettingsLoadError] = useState(false);
  const [settingsLoadAttempt, setSettingsLoadAttempt] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [metaBackup, setMetaBackup] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [checklist, setChecklist] = useState<AnnualChecklist | null>(null);
  const [checklistYear, setChecklistYear] = useState(new Date().getFullYear());
  const [deleteStep, setDeleteStep] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);
  const [dead, setDead] = useState<OutboxItem[]>([]);
  const [deadRetrying, setDeadRetrying] = useState(false);
  const [deadSyncedMsg, setDeadSyncedMsg] = useState(false);
  const [mfaEnrollment, setMfaEnrollment] = useState<{
    factorId: string;
    qrCode: string;
    secret: string;
  } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaMessage, setMfaMessage] = useState<string | null>(null);
  const [mfaSetupError, setMfaSetupError] = useState<string | null>(null);
  const auth = useAuth();
  const { readOnly, showBlocked } = useRecoveryReadOnly();

  const pendingSettings = useRef<Partial<AppSettings>>({});
  const saveTimer = useRef<number | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const outstandingSaves = useRef(0);
  const mounted = useRef(true);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const onSettingsChangedRef = useRef(onSettingsChanged);

  useEffect(() => {
    onSettingsChangedRef.current = onSettingsChanged;
  }, [onSettingsChanged]);

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
        if (cancelled) return;
        setSettingsLoadError(true);
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
    if (readOnly) return;
    void getOrCreateChecklist(checklistYear).then(setChecklist);
  }, [checklistYear, readOnly]);

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
      } catch (reason) {
        failed = true;
        pendingSettings.current = { ...partial, ...pendingSettings.current };
        if (mounted.current) {
          setSaveError(reason instanceof Error ? reason.message : "Không lưu được cài đặt.");
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
    saveQueue.current = queued.then(() => undefined, () => undefined);
    await queued;
  }

  flushRef.current = flushPendingSettings;

  function scheduleSettingsSave() {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void flushRef.current(); }, SETTINGS_AUTOSAVE_MS);
  }

  function patchSettings(partial: Partial<AppSettings>) {
    if (readOnly) { showBlocked(); return; }
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
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (Object.keys(pendingSettings.current).length === 0 && outstandingSaves.current === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("pagehide", flushWhenHidden);
    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushWhenHidden);
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      const partial = pendingSettings.current;
      pendingSettings.current = {};
      if (Object.keys(partial).length > 0) void saveSettings(partial);
    };
  }, []);

  function changeTab(tab: SettingsTab) {
    void flushRef.current();
    setSearchParams(tab === "general" ? {} : { tab }, { replace: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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
    const payload = await exportBackup();
    downloadJson(payload, `vwce-backup-${payload.exportedAt.slice(0, 10)}.json`);
    setMetaBackup(payload.exportedAt);
  }

  function doImport(file: File) {
    if (readOnly) { showBlocked(); return; }
    setPendingFile(file);
  }

  async function confirmImport() {
    if (readOnly) { showBlocked(); return; }
    const file = pendingFile;
    if (!file) return;
    setImporting(true);
    try {
      let data: BackupPayload;
      try { data = JSON.parse(await file.text()); } catch {
        alert("JSON không hợp lệ"); return;
      }
      if (!data || typeof data !== "object") { alert("Cấu trúc backup không hợp lệ"); return; }
      if (!isSupportedBackupSchema(data.schemaVersion)) {
        alert(unsupportedBackupSchemaMessage(data.schemaVersion));
        return;
      }
      try {
        const current = await exportBackup();
        downloadJson(current, `ban-sao-luu-truoc-khi-nhap-json-${current.exportedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`);
      } catch { /* */ }
      await importBackup(data);
      alert("Nhập backup thành công");
      onReload();
    } catch (reason) {
      alert(reason instanceof Error ? reason.message : "Lỗi nhập");
    } finally {
      setImporting(false);
      setPendingFile(null);
    }
  }

  async function exportCsv() {
    const transactions = await listTransactions();
    const header = "date,type,amount,unitPrice,quantity,fee,tax,instrumentIsin,notes\n";
    const rows = transactions
      .map((t) => [
        csvEscape(t.date), csvEscape(t.type), csvEscape(t.amount),
        csvEscape(t.unitPrice ?? ""), csvEscape(t.quantity ?? ""),
        csvEscape(t.fee ?? ""), csvEscape(t.tax ?? ""),
        csvEscape(t.instrumentIsin ?? ""), csvEscape(t.notes ?? ""),
      ].join(","))
      .join("\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(
      new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8" }),
    );
    anchor.download = "vwce-transactions.csv";
    anchor.click();
  }

  if (settingsLoading) {
    return (
      <div className="empty card" role="status" aria-live="polite" aria-busy="true">
        <p>Đang tải Cài đặt…</p>
      </div>
    );
  }

  if (settingsLoadError || !settings) {
    return (
      <section className="empty card" role="alert">
        <h1 className="page-title">Không tải được Cài đặt</h1>
        <p>Dữ liệu trên thiết bị vẫn được giữ nguyên. Hãy thử tải lại.</p>
        <button type="button" onClick={() => setSettingsLoadAttempt((attempt) => attempt + 1)}>
          Thử lại
        </button>
      </section>
    );
  }

  const saveLabel =
    saveState === "saving" ? "Đang lưu…"
    : saveState === "dirty" ? "Sẽ tự lưu"
    : saveState === "error" ? "Chưa lưu được"
    : "Đã lưu tự động";

  return (
    <div className="settings-page">
      <header className="settings-hero">
        <div>
          <p className="settings-hero-kicker">Gọn hơn · an toàn hơn</p>
          <h2>Mọi thứ ở đúng một chỗ</h2>
          <p>Thay đổi được lưu tự động. Bạn có thể chuyển màn hình mà không cần tìm nút Lưu.</p>
        </div>
        <span className={`settings-save-pill save-state-${saveState}`} role="status" aria-live="polite">
          <span className="save-dot" aria-hidden />{saveLabel}
        </span>
      </header>

      {saveError ? <p className="settings-error settings-global-error" role="alert">{saveError}</p> : null}

      <nav className="settings-tabs" role="tablist" aria-label="Nhóm cài đặt">
        <button type="button" role="tab" aria-selected={activeTab === "general"}
          className={activeTab === "general" ? "settings-tab active" : "settings-tab"}
          onClick={() => changeTab("general")}>
          <span aria-hidden>◫</span>Chung
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "prices"}
          className={activeTab === "prices" ? "settings-tab active" : "settings-tab"}
          onClick={() => changeTab("prices")}>
          <span aria-hidden>€</span>Giá &amp; tài sản
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "data"}
          className={activeTab === "data" ? "settings-tab active" : "settings-tab"}
          onClick={() => changeTab("data")}>
          <span aria-hidden>↥</span>Dữ liệu
        </button>
      </nav>

      {activeTab === "general" ? (
        <div className="settings-panel" role="tabpanel" aria-label="Cài đặt chung">
          <section className="settings-card">
            <div className="settings-card-head">
              <div>
                <p className="settings-card-eyebrow">Kế hoạch</p>
                <h3>Thông tin chính</h3>
                <p>Tên hiển thị và người sở hữu tài khoản đầu tư.</p>
              </div>
              <span className="settings-icon-bubble" aria-hidden>✦</span>
            </div>
            <div className="settings-field-grid">
              <label className="setting-field">
                <span>Tên kế hoạch</span>
                <input value={settings.planName ?? ""}
                  onChange={(e) => patchSettings({ planName: e.target.value })}
                  onBlur={() => void flushRef.current()} />
              </label>
              <label className="setting-field">
                <span>Tên bé</span>
                <input value={settings.childName ?? ""}
                  onChange={(e) => patchSettings({ childName: e.target.value })}
                  onBlur={() => void flushRef.current()} />
              </label>
            </div>
            <div className="setting-choice-row">
              <div>
                <strong>Tài khoản đứng tên</strong>
                <span>Ảnh hưởng cách diễn giải quyền sở hữu.</span>
              </div>
              <Segmented
                value={settings.accountType}
                options={[{ value: "parent", label: "Cha/mẹ" }, { value: "child", label: "Bé" }]}
                onChange={(v) => patchSettings({ accountType: v as "child" | "parent" })} />
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <div>
                <p className="settings-card-eyebrow">Tiền</p>
                <h3>Ví trong app</h3>
                <p>Quyết định app có đòi bút toán nạp tiền cho mọi lệnh mua hay không.</p>
              </div>
              <span className="settings-icon-bubble" aria-hidden>€</span>
            </div>
            <div className="setting-choice-row">
              <div>
                <strong>Nguồn tiền mua</strong>
                <span>{settings.trackInAppCash === true
                  ? "Sổ kép: mọi lệnh mua cần một khoản nạp tương ứng, thiếu thì Tổng quan sẽ báo."
                  : "Ngoài app: chỉ theo dõi chứng khoán. Không báo thiếu nạp, hàng An toàn để trống."}
                </span>
              </div>
              <Segmented
                value={settings.trackInAppCash === true ? "ledger" : "securities"}
                options={[{ value: "securities", label: "Ngoài app" }, { value: "ledger", label: "Sổ kép" }]}
                onChange={(v) => patchSettings({ trackInAppCash: v === "ledger" })} />
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <div>
                <p className="settings-card-eyebrow">Tính toán</p>
                <h3>Giả định dài hạn</h3>
                <p>Dùng cho mục tiêu và mô phỏng, không thay đổi giao dịch đã ghi.</p>
              </div>
              <span className="settings-icon-bubble" aria-hidden>%</span>
            </div>
            <div className="assumption-grid">
              <div className="assumption-tile">
                <span>Lạm phát</span>
                <NumField value={settings.inflationRate * 100} minFrac={1} maxFrac={1} suffix="%"
                  ariaLabel={`Lạm phát ${pctDisplay(settings.inflationRate)}`}
                  onCommit={(pct) => patchSettings({ inflationRate: pctToRate(pct) })} />
              </div>
              <div className="assumption-tile">
                <span>Buffer</span>
                <NumField value={settings.bufferPct * 100} minFrac={1} maxFrac={1} suffix="%"
                  ariaLabel={`Buffer ${pctDisplay(settings.bufferPct)}`}
                  onCommit={(pct) => patchSettings({ bufferPct: pctToRate(pct) })} />
              </div>
              <div className="assumption-tile">
                <span>Lợi suất VWCE</span>
                <NumField value={settings.vwceReturn * 100} minFrac={1} maxFrac={1} suffix="%"
                  ariaLabel={`Lợi suất VWCE ${pctDisplay(settings.vwceReturn)}`}
                  onCommit={(pct) => patchSettings({ vwceReturn: pctToRate(pct) })} />
              </div>
              <div className="assumption-tile">
                <span>Lợi suất an toàn</span>
                <NumField value={settings.safeReturn * 100} minFrac={1} maxFrac={1} suffix="%"
                  ariaLabel={`Lợi suất an toàn ${pctDisplay(settings.safeReturn)}`}
                  onCommit={(pct) => patchSettings({ safeReturn: pctToRate(pct) })} />
              </div>
            </div>
            <div className="setting-choice-row">
              <div>
                <strong>Hạn năm 2042</strong>
                <span>Hạn cứng ưu tiên an toàn; linh hoạt cho phép điều chỉnh.</span>
              </div>
              <Segmented
                value={settings.endMode}
                options={[{ value: "hard", label: "Hạn cứng" }, { value: "flexible", label: "Linh hoạt" }]}
                onChange={(v) => patchSettings({ endMode: v as "hard" | "flexible" })} />
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <div>
                <p className="settings-card-eyebrow">Giao diện</p>
                <h3>Chủ đề</h3>
                <p>Lựa chọn được nhớ ngay trên thiết bị này.</p>
              </div>
            </div>
            <Segmented value={theme} options={THEME_OPTIONS}
              onChange={(v) => pickTheme(v as ThemeChoice)} />
          </section>

          <section className="settings-card">
            <div className="settings-card-head compact-head">
              <div>
                <p className="settings-card-eyebrow">Định kỳ</p>
                <h3>Checklist {checklistYear}</h3>
                <p>Nhắc lại các việc quan trọng mỗi năm.</p>
              </div>
              <label className="year-picker">
                <span className="sr-only">Năm checklist</span>
                <input type="number" value={checklistYear} min={2000} max={2100}
                  onChange={(e) => { const y = Number(e.target.value); if (y >= 2000 && y <= 2100) setChecklistYear(y); }} />
              </label>
            </div>
            <div className="checklist-list">
              {checklist?.items.map((item) => (
                <label key={item.key} className="switch-row">
                  <span>{item.label}</span>
                  <input type="checkbox" className="ios-switch" checked={item.done}
                    onChange={async () => {
                      if (readOnly) { showBlocked(); return; }
                      const items = checklist.items.map((c) =>
                        c.key === item.key ? { ...c, done: !c.done } : c);
                      const next = { ...checklist, items, updatedAt: new Date().toISOString() };
                      await db.annualChecklists.put(next);
                      setChecklist(next);
                    }} />
                </label>
              ))}
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <div>
                <p className="settings-card-eyebrow">Bảo mật</p>
                <h3>Xác minh hai bước</h3>
                <p>TOTP bảo vệ account owner sau mật khẩu. Password reset không tự bypass TOTP.</p>
              </div>
              <span className="settings-icon-bubble" aria-hidden>⍁</span>
            </div>
            {auth.mfaEnrolled ? (
              <>
                <p className="settings-inline-status success">
                  TOTP đã bật và factor đã được xác minh. Phiên đăng nhập mới sẽ bị chặn ở AAL1 cho tới khi nhập mã.
                </p>
                <p className="muted">
                  Trước khi coi MFA là production-ready, Owner phải xác nhận factor TOTP dự phòng
                  hoặc quy trình Dashboard admin để reset factor. Dashboard admin phải có MFA và recovery method riêng.
                </p>
              </>
            ) : mfaEnrollment ? (
              <div className="stack">
                <img src={mfaEnrollment.qrCode} alt="QR thiết lập TOTP"
                  style={{ width: 196, maxWidth: "100%", borderRadius: 12 }} />
                <p className="muted">Quét QR bằng authenticator. Nếu không quét được, nhập secret này thủ công:</p>
                <code style={{ overflowWrap: "anywhere" }}>{mfaEnrollment.secret}</code>
                <label className="setting-field">
                  <span>Mã 6 chữ số để xác minh factor</span>
                  <input type="text" inputMode="numeric" autoComplete="one-time-code"
                    pattern="[0-9]{6}" maxLength={6} value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))} />
                </label>
                <button type="button" className="settings-primary-action"
                  disabled={mfaBusy || mfaCode.length !== 6}
                  onClick={async () => {
                    if (readOnly) { showBlocked(); return; }
                    setMfaBusy(true); setMfaSetupError(null); setMfaMessage(null);
                    try {
                      const result = await auth.verifyMfaEnrollment(mfaEnrollment.factorId, mfaCode);
                      if (result.error) setMfaSetupError(result.error);
                      else {
                        setMfaEnrollment(null); setMfaCode("");
                        setMfaMessage("TOTP đã được xác minh. Hãy test enroll → logout → login AAL1 → TOTP AAL2 → mở vault trước khi coi là đạt.");
                      }
                    } finally { setMfaBusy(false); }
                  }}>
                  {mfaBusy ? "Đang xác minh…" : "Xác minh và bật TOTP"}
                </button>
              </div>
            ) : (
              <button type="button" className="settings-primary-action" disabled={mfaBusy}
                onClick={async () => {
                  if (readOnly) { showBlocked(); return; }
                  setMfaBusy(true); setMfaSetupError(null); setMfaMessage(null);
                  try {
                    const result = await auth.startMfaEnrollment();
                    if (result.error || !result.data) setMfaSetupError(result.error ?? "Không bắt đầu được TOTP.");
                    else setMfaEnrollment(result.data);
                  } finally { setMfaBusy(false); }
                }}>
                {mfaBusy ? "Đang tạo…" : "Thiết lập TOTP"}
              </button>
            )}
            {mfaSetupError ? <p className="settings-error" role="alert">{mfaSetupError}</p> : null}
            {mfaMessage ? <p className="settings-inline-status success" role="status">{mfaMessage}</p> : null}
          </section>
        </div>
      ) : null}

      {activeTab === "prices" ? (
        <SettingsPricePanel refreshKey={refreshKey} onQuotesChanged={onQuotesChanged} />
      ) : null}

      {activeTab === "data" ? (
        <div className="settings-panel" role="tabpanel" aria-label="Dữ liệu và sao lưu">
          <section className="settings-card settings-health-card">
            <div>
              <span className={`health-dot${online ? " online" : ""}`} aria-hidden />
              <strong>{online ? "Đang online" : "Đang offline"}</strong>
            </div>
            <p>Dữ liệu được ghi vào thiết bị trước, sau đó đồng bộ khi tài khoản và mạng sẵn sàng.</p>
          </section>

          {auth.user?.id ? (
            <SyncConflictSection userId={auth.user.id} focusRequest={focusConflictRequest}
              onResolved={async () => { await onConflictResolved?.(); }} />
          ) : null}

          {/* PLAN-GLIDE-PATH-001 — Lộ trình giảm rủi ro theo năm */}
          <PlanRoadmapSection
            target={settings.planTarget ?? { targetUseDate: settings.endDate, needFullAmount: true }}
            onChangeTarget={(next) => patchSettings({ planTarget: next })}
          />

          {auth.user?.id && (dead.length > 0 || deadSyncedMsg) ? (
            <section className="settings-card">
              <div className="settings-card-head">
                <div>
                  <p className="settings-card-eyebrow">Đồng bộ</p>
                  <h3>{dead.length > 0 ? `${dead.length} thay đổi đang chờ` : "Đã đồng bộ xong"}</h3>
                  <p>Dữ liệu local vẫn an toàn trong khi ứng dụng thử gửi lại.</p>
                </div>
              </div>
              {dead.length > 0 ? (
                <button type="button" className="settings-primary-action" disabled={deadRetrying}
                  onClick={async () => {
                    if (readOnly) { showBlocked(); return; }
                    if (!auth.user?.id) return;
                    setDeadRetrying(true); setDeadSyncedMsg(false);
                    try {
                      await reviveDeadOutbox();
                      await pushOutbox(auth.user.id);
                      const next = await listDeadOutbox();
                      setDead(next);
                      if (next.length === 0) {
                        setDeadSyncedMsg(true);
                        window.setTimeout(() => setDeadSyncedMsg(false), 4000);
                      }
                    } finally { setDeadRetrying(false); }
                  }}>
                  {deadRetrying ? "Đang thử lại…" : "Thử lại đồng bộ"}
                </button>
              ) : (
                <p className="settings-inline-status success">Mọi thay đổi đã lên máy chủ.</p>
              )}
            </section>
          ) : null}

          <section className="settings-card action-card">
            <div className="settings-card-head">
              <div>
                <p className="settings-card-eyebrow">Sao lưu</p>
                <h3>Xuất và nhập dữ liệu</h3>
                <p>Tạo bản JSON đầy đủ hoặc CSV giao dịch để kiểm tra độc lập.</p>
              </div>
              <span className="settings-icon-bubble" aria-hidden>↥</span>
            </div>
            <button type="button" className="group-action" onClick={doExport}>
              <span><strong>Xuất JSON</strong><small>Bản sao lưu đầy đủ</small></span>
            </button>
            <label className="group-action">
              <span><strong>Nhập file JSON</strong><small>Khôi phục từ một bản sao lưu JSON</small></span>
              <input type="file" accept="application/json,.json" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ""; }} />
            </label>
            <p className="settings-inline-status settings-import-warning" role="note">
              ⚠️ Nhập một bản sao lưu sẽ{" "}
              <strong>ghi đè và thay thế toàn bộ dữ liệu đang có trên thiết bị này</strong>.
              {" "}Ứng dụng sẽ tự tải một bản sao lưu của dữ liệu hiện tại trước khi ghi đè để bạn có thể quay lại nếu cần.
            </p>
            {pendingFile ? (
              <div className="delete-confirm import-confirm" role="alertdialog" aria-modal="true"
                aria-labelledby="import-confirm-title">
                <p id="import-confirm-title"><strong>Thay dữ liệu trên thiết bị bằng file này?</strong></p>
                <p className="import-confirm-file">
                  <span className="import-confirm-file-label">File đã chọn</span>
                  <span className="import-confirm-file-name">{pendingFile.name}</span>
                </p>
                <p>
                  Toàn bộ dữ liệu local hiện có trên iPhone sẽ được thay bằng nội dung file này.
                  Ứng dụng sẽ tải một bản sao lưu trước khi tiếp tục. Thao tác này không tự ghi đè dữ liệu trong tài khoản.
                </p>
                <div className="delete-actions">
                  <button type="button" className="danger" disabled={importing}
                    onClick={() => void confirmImport()}>
                    {importing ? "Đang nhập…" : "Xác nhận thay dữ liệu trên thiết bị"}
                  </button>
                  <button type="button" className="secondary" disabled={importing}
                    onClick={() => setPendingFile(null)}>Quay lại</button>
                </div>
              </div>
            ) : null}
            <button type="button" className="group-action" onClick={() => void exportCsv()}>
              <span><strong>Xuất CSV giao dịch</strong><small>Dùng với bảng tính</small></span>
            </button>
            {onOpenMigrate ? (
              <button type="button" className="group-action" onClick={onOpenMigrate}>
                <span><strong>Khôi phục dữ liệu đang có trên thiết bị</strong><small>Đưa dữ liệu đang lưu trên thiết bị này vào tài khoản đã đăng nhập, không ghi đè bản sao lưu.</small></span>
              </button>
            ) : null}
          </section>

          <details className="settings-disclosure danger-disclosure" open={deleteStep > 0}>
            <summary onClick={(e) => { if (deleteStep > 0) e.preventDefault(); }}>
              <span>
                <strong>Vùng nguy hiểm</strong>
                <small>Xóa toàn bộ dữ liệu trên thiết bị này.</small>
              </span>
              {deleteStep === 0 ? (
                <button type="button" className="danger-link"
                  onClick={(e) => { e.preventDefault(); setDeleteStep(1); }}>Mở</button>
              ) : null}
            </summary>
            {deleteStep > 0 ? (
              <div className="delete-confirm">
                <p>Gõ <strong>XOA</strong> để xác nhận. Thao tác này không thể hoàn tác.</p>
                <input value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="XOA" autoCapitalize="characters" />
                <div className="delete-actions">
                  <button type="button" className="danger"
                    disabled={deleteConfirm.trim().toUpperCase() !== "XOA"}
                    onClick={async () => {
                      if (readOnly) { showBlocked(); return; }
                      await clearAllData();
                      window.location.reload();
                    }}>Xác nhận xóa</button>
                  <button type="button" className="secondary"
                    onClick={() => { setDeleteStep(0); setDeleteConfirm(""); }}>Hủy</button>
                </div>
              </div>
            ) : null}
          </details>
        </div>
      ) : null}

      <p className="settings-foot">
        v{APP_VERSION} · {online ? "Online" : "Offline"} · Sao lưu:{" "}
        {metaBackup ? formatDateVN(metaBackup.slice(0, 10)) : "chưa có"}
      </p>
    </div>
  );
}
