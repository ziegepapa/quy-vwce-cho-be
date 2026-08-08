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
import { APP_VERSION, SCHEMA_VERSION } from "../lib/types";
import { isSupportedBackupSchema } from "../lib/backupSchema";
import { csvEscape, formatDateVN, parseDecimal } from "../lib/calc";
import type { ThemeChoice } from "../lib/theme";
import { THEME_OPTIONS, persistTheme, readTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { listDeadOutbox, pushOutbox, reviveDeadOutbox } from "../lib/sync/engine";
import type { OutboxItem } from "../lib/sync/types";
import SettingsPricePanel from "../components/SettingsPricePanel";

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

/** 2.5 → 0.025, tránh rác dấu phẩy động của phép chia số thực. */
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
}: {
  onReload: () => void;
  onOpenMigrate?: () => void;
  refreshKey?: number;
  onQuotesChanged?: () => void | Promise<void>;
  onSettingsChanged?: () => void | Promise<void>;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab: SettingsTab =
    requestedTab === "prices" || requestedTab === "data" ? requestedTab : "general";

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [metaBackup, setMetaBackup] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [checklist, setChecklist] = useState<AnnualChecklist | null>(null);
  const [checklistYear, setChecklistYear] = useState(new Date().getFullYear());
  const [deleteStep, setDeleteStep] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);
  const [dead, setDead] = useState<OutboxItem[]>([]);
  const [deadRetrying, setDeadRetrying] = useState(false);
  const [deadSyncedMsg, setDeadSyncedMsg] = useState(false);
  const auth = useAuth();

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
    void (async () => {
      setSettings(await getSettings());
      setMetaBackup((await db.appMetadata.get("meta"))?.lastBackupAt ?? "");
      if (auth.user?.id) setDead(await listDeadOutbox());
      else setDead([]);
    })();
    return () => {
      mounted.current = false;
    };
  }, [auth.user?.id]);

  useEffect(() => {
    void getOrCreateChecklist(checklistYear).then(setChecklist);
  }, [checklistYear]);

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
    saveTimer.current = window.setTimeout(() => {
      void flushRef.current();
    }, SETTINGS_AUTOSAVE_MS);
  }

  function patchSettings(partial: Partial<AppSettings>) {
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

  async function doImport(file: File) {
    let data: BackupPayload;
    try {
      data = JSON.parse(await file.text());
    } catch {
      alert("JSON không hợp lệ");
      return;
    }
    if (!data || typeof data !== "object") {
      alert("Cấu trúc backup không hợp lệ");
      return;
    }
    if (!isSupportedBackupSchema(data.schemaVersion)) {
      alert(
        `schemaVersion không khớp (file: ${String(data.schemaVersion)}, app: ${SCHEMA_VERSION} hoặc 1)`,
      );
      return;
    }
    if (!confirm("Tiếp tục nhập? Ứng dụng sẽ tự sao lưu dữ liệu hiện tại trước.")) return;
    try {
      const current = await exportBackup();
      downloadJson(
        current,
        `vwce-auto-before-import-${current.exportedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`,
      );
    } catch {
      /* */
    }
    try {
      await importBackup(data);
      alert("Nhập backup thành công");
      onReload();
    } catch (reason) {
      alert(reason instanceof Error ? reason.message : "Lỗi nhập");
    }
  }

  async function exportCsv() {
    const transactions = await listTransactions();
    const header = "date,type,amount,unitPrice,quantity,fee,tax,instrumentIsin,notes\n";
    const rows = transactions
      .map((transaction) =>
        [
          csvEscape(transaction.date),
          csvEscape(transaction.type),
          csvEscape(transaction.amount),
          csvEscape(transaction.unitPrice ?? ""),
          csvEscape(transaction.quantity ?? ""),
          csvEscape(transaction.fee ?? ""),
          csvEscape(transaction.tax ?? ""),
          csvEscape(transaction.instrumentIsin ?? ""),
          csvEscape(transaction.notes ?? ""),
        ].join(","),
      )
      .join("\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(
      new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8" }),
    );
    anchor.download = "vwce-transactions.csv";
    anchor.click();
  }

  if (!settings) return <p className="muted">Đang tải…</p>;

  const saveLabel =
    saveState === "saving"
      ? "Đang lưu…"
      : saveState === "dirty"
        ? "Sẽ tự lưu"
        : saveState === "error"
          ? "Chưa lưu được"
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
          <span className="save-dot" aria-hidden />
          {saveLabel}
        </span>
      </header>

      {saveError ? <p className="settings-error settings-global-error" role="alert">{saveError}</p> : null}

      <nav className="settings-tabs" role="tablist" aria-label="Nhóm cài đặt">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "general"}
          className={activeTab === "general" ? "settings-tab active" : "settings-tab"}
          onClick={() => changeTab("general")}
        >
          <span aria-hidden>◫</span>
          Chung
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "prices"}
          className={activeTab === "prices" ? "settings-tab active" : "settings-tab"}
          onClick={() => changeTab("prices")}
        >
          <span aria-hidden>€</span>
          Giá & tài sản
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "data"}
          className={activeTab === "data" ? "settings-tab active" : "settings-tab"}
          onClick={() => changeTab("data")}
        >
          <span aria-hidden>↥</span>
          Dữ liệu
        </button>
      </nav>

      {activeTab === "general" ? (
        <div className="settings-panel" role="tabpanel" aria-label="Cài đặt chung">
          <section className="settings-card">
            <div className="settings-card-head">
              <div>
                <p className="settings-card-eyebrow">Kế hoạch</p>
                <h3>Thông tin chính</h3>
                <p>Tên hiển thị và người sở hứu tài khoản đầu tư.</p>
              </div>
              <span className="settings-icon-bubble" aria-hidden>✦</span>
            </div>
            <div className="settings-field-grid">
              <label className="setting-field">
                <span>Tên kế hoạch</span>
                <input
                  value={settings.planName ?? ""}
                  onChange={(event) => patchSettings({ planName: event.target.value })}
                  onBlur={() => void flushRef.current()}
                />
              </label>
              <label className="setting-field">
                <span>Tên bé</span>
                <input
                  value={settings.childName ?? ""}
                  onChange={(event) => patchSettings({ childName: event.target.value })}
                  onBlur={() => void flushRef.current()}
                />
              </label>
            </div>
            <div className="setting-choice-row">
              <div>
                <strong>Tài khoản đứng tên</strong>
                <span>Ảnh hưởng cách diễn giải quyền sở hứu.</span>
              </div>
              <Segmented
                value={settings.accountType}
                options={[
                  { value: "parent", label: "Cha/mệ" },
                  { value: "child", label: "Bé" },
                ]}
                onChange={(value) => patchSettings({ accountType: value as "child" | "parent" })}
              />
            </div>
          </section>

          {/* CASH-MODEL-OPTIONAL-001 r1: the owner pays for the ETF from a bank
              or broker account this app never sees, so the double-entry ledger
              is the exception here and not the default. */}
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
                <span>
                  {settings.trackInAppCash === true
                    ? "Sổ kép: mọi lệnh mua cần một khoản nạp tương ứng, thiếu thì Tổng quan sẽ báo."
                    : "Ngoài app: chỉ theo dõi chứng khoán. Không báo thiếu nạp, hàng An toàn để trống."}
                </span>
              </div>
              <Segmented
                value={settings.trackInAppCash === true ? "ledger" : "securities"}
                options={[
                  { value: "securities", label: "Ngoài app" },
                  { value: "ledger", label: "Sổ kép" },
                ]}
                onChange={(value) => patchSettings({ trackInAppCash: value === "ledger" })}
              />
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
                <NumField
                  value={settings.inflationRate * 100}
                  minFrac={1}
                  maxFrac={1}
                  suffix="%"
                  ariaLabel={`Lạm phát ${pctDisplay(settings.inflationRate)}`}
                  onCommit={(pct) => patchSettings({ inflationRate: pctToRate(pct) })}
                />
              </div>
              <div className="assumption-tile">
                <span>Buffer</span>
                <NumField
                  value={settings.bufferPct * 100}
                  minFrac={1}
                  maxFrac={1}
                  suffix="%"
                  ariaLabel={`Buffer ${pctDisplay(settings.bufferPct)}`}
                  onCommit={(pct) => patchSettings({ bufferPct: pctToRate(pct) })}
                />
              </div>
              <div className="assumption-tile">
                <span>Lợi suất VWCE</span>
                <NumField
                  value={settings.vwceReturn * 100}
                  minFrac={1}
                  maxFrac={1}
                  suffix="%"
                  ariaLabel={`Lợi suất VWCE ${pctDisplay(settings.vwceReturn)}`}
                  onCommit={(pct) => patchSettings({ vwceReturn: pctToRate(pct) })}
                />
              </div>
              <div className="assumption-tile">
                <span>Lợi suất an toàn</span>
                <NumField
                  value={settings.safeReturn * 100}
                  minFrac={1}
                  maxFrac={1}
                  suffix="%"
                  ariaLabel={`Lợi suất an toàn ${pctDisplay(settings.safeReturn)}`}
                  onCommit={(pct) => patchSettings({ safeReturn: pctToRate(pct) })}
                />
              </div>
            </div>
            <div className="setting-choice-row">
              <div>
                <strong>Hạn năm 2042</strong>
                <span>Hạn cứng ưu tiên an toàn; linh hoạt cho phép điều chỉnh.</span>
              </div>
              <Segmented
                value={settings.endMode}
                options={[
                  { value: "hard", label: "Hạn cứng" },
                  { value: "flexible", label: "Linh hoạt" },
                ]}
                onChange={(value) => patchSettings({ endMode: value as "hard" | "flexible" })}
              />
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
            <Segmented
              value={theme}
              options={THEME_OPTIONS}
              onChange={(value) => pickTheme(value as ThemeChoice)}
            />
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
                <input
                  type="number"
                  value={checklistYear}
                  min={2000}
                  max={2100}
                  onChange={(event) => {
                    const year = Number(event.target.value);
                    if (year >= 2000 && year <= 2100) setChecklistYear(year);
                  }}
                />
              </label>
            </div>
            <div className="checklist-list">
              {checklist?.items.map((item) => (
                <label key={item.key} className="switch-row">
                  <span>{item.label}</span>
                  <input
                    type="checkbox"
                    className="ios-switch"
                    checked={item.done}
                    onChange={async () => {
                      const items = checklist.items.map((current) =>
                        current.key === item.key ? { ...current, done: !current.done } : current,
                      );
                      const next = { ...checklist, items, updatedAt: new Date().toISOString() };
                      await db.annualChecklists.put(next);
                      setChecklist(next);
                    }}
                  />
                </label>
              ))}
            </div>
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

          {auth.user?.id && (dead.length > 0 || deadSyncedMsg) ? (
            <section className="settings-card">
              <div className="settings-card-head">
                <div>
                  <p className="settings-card-eyebrow">Đồng bộ</p>
                  <h3>{dead.length > 0 ? `${dead.length} thay đổi đang chờ` : "Đã đồng bộ xong"}</h3>
                  <p>Dữ liệu local vẫn an toàn trong khi ứng dụng thực gửi lại.</p>
                </div>
              </div>
              {dead.length > 0 ? (
                <button
                  type="button"
                  className="settings-primary-action"
                  disabled={deadRetrying}
                  onClick={async () => {
                    if (!auth.user?.id) return;
                    setDeadRetrying(true);
                    setDeadSyncedMsg(false);
                    try {
                      await reviveDeadOutbox();
                      await pushOutbox(auth.user.id);
                      const next = await listDeadOutbox();
                      setDead(next);
                      if (next.length === 0) {
                        setDeadSyncedMsg(true);
                        window.setTimeout(() => setDeadSyncedMsg(false), 4000);
                      }
                    } finally {
                      setDeadRetrying(false);
                    }
                  }}
                >
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
              <span><strong>Nhập JSON</strong><small>Khôi phục từ bản sao lưu</small></span>
              <input
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void doImport(file);
                  event.target.value = "";
                }}
              />
            </label>
            <button type="button" className="group-action" onClick={() => void exportCsv()}>
              <span><strong>Xuất CSV giao dịch</strong><small>Dùng với bảng tính</small></span>
            </button>
            {onOpenMigrate ? (
              <button type="button" className="group-action" onClick={onOpenMigrate}>
                <span><strong>Nhập dữ liệu local</strong><small>Đưa dữ liệu cũ vào tài khoản</small></span>
              </button>
            ) : null}
          </section>

          <details className="settings-disclosure danger-disclosure" open={deleteStep > 0}>
            <summary onClick={(event) => {
              if (deleteStep > 0) event.preventDefault();
            }}>
              <span>
                <strong>Vùng nguy hiểm</strong>
                <small>Xóa toàn bộ dữ liệu trên thiết bị này.</small>
              </span>
              {deleteStep === 0 ? (
                <button
                  type="button"
                  className="danger-link"
                  onClick={(event) => {
                    event.preventDefault();
                    setDeleteStep(1);
                  }}
                >
                  Mở
                </button>
              ) : null}
            </summary>
            {deleteStep > 0 ? (
              <div className="delete-confirm">
                <p>Gõ <strong>XOA</strong> để xác nhận. Thao tác này không thể hoàn tác.</p>
                <input
                  value={deleteConfirm}
                  onChange={(event) => setDeleteConfirm(event.target.value)}
                  placeholder="XOA"
                  autoCapitalize="characters"
                />
                <div className="delete-actions">
                  <button
                    type="button"
                    className="danger"
                    disabled={deleteConfirm.trim().toUpperCase() !== "XOA"}
                    onClick={async () => {
                      await clearAllData();
                      window.location.reload();
                    }}
                  >
                    Xác nhận xóa
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setDeleteStep(0);
                      setDeleteConfirm("");
                    }}
                  >
                    Hủy
                  </button>
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
