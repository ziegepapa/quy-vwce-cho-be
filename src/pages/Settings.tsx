import { useEffect, useState } from "react";
import {
  clearAllData,
  db,
  exportBackup,
  getOrCreateChecklist,
  getSettings,
  importBackup,
  listInstruments,
  listQuotes,
  listTransactions,
  saveManualQuoteForIsin,
  saveSettings,
} from "../lib/db";
import type { AnnualChecklist, AppSettings, BackupPayload, Instrument, Quote } from "../lib/types";
import { APP_VERSION, SCHEMA_VERSION, VWCE_ISIN } from "../lib/types";
import { isSupportedBackupSchema } from "../lib/backupSchema";
import { csvEscape, formatDateVN, formatMoney, parseDecimal } from "../lib/calc";
import { isValidAsOfDate, isValidIsin, normalizeIsin } from "../lib/instrument";
import type { ThemeChoice } from "../lib/theme";
import { THEME_OPTIONS, persistTheme, readTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { listDeadOutbox, pushOutbox, reviveDeadOutbox } from "../lib/sync/engine";
import type { OutboxItem } from "../lib/sync/types";

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
  className = "pct-input",
  suffix,
  minFrac = 0,
  maxFrac = 2,
  ariaLabel,
}: {
  id?: string;
  value: number;
  onCommit: (n: number) => void;
  className?: string;
  suffix?: string;
  minFrac?: number;
  maxFrac?: number;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft !== null ? draft : value ? formatNum(value, minFrac, maxFrac) : "";

  return (
    <>
      <input
        id={id}
        className={className}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={ariaLabel}
        value={display}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          setDraft(e.target.value);
          e.target.select();
        }}
        onBlur={() => {
          const next = draft === null ? value : parseDecimal(draft);
          setDraft(null);
          if (next !== value) onCommit(next);
        }}
      />
      {suffix ? <span className="pct-suffix">{suffix}</span> : null}
    </>
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
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? "seg-opt active" : "seg-opt"}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage({
  onReload,
  onOpenMigrate,
}: {
  onReload: () => void;
  onOpenMigrate?: () => void;
}) {
  const [s, setS] = useState<AppSettings | null>(null);
  const [metaBackup, setMetaBackup] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [checklist, setChecklist] = useState<AnnualChecklist | null>(null);
  const [checklistYear, setChecklistYear] = useState(new Date().getFullYear());
  const [deleteStep, setDeleteStep] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);
  const auth = useAuth();
  const [dead, setDead] = useState<OutboxItem[]>([]);
  const [deadRetrying, setDeadRetrying] = useState(false);
  const [deadSyncedMsg, setDeadSyncedMsg] = useState(false);

  /** Multi-asset: local instruments + quotes (no outbox). */
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteIsin, setQuoteIsin] = useState(VWCE_ISIN);
  const [quotePrice, setQuotePrice] = useState("");
  const [quoteAsOf, setQuoteAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [quoteSaving, setQuoteSaving] = useState(false);

  async function reloadAssets() {
    setInstruments(await listInstruments());
    setQuotes(await listQuotes());
  }

  useEffect(() => {
    (async () => {
      setS(await getSettings());
      setMetaBackup((await db.appMetadata.get("meta"))?.lastBackupAt ?? "");
      setChecklist(await getOrCreateChecklist(checklistYear));
      await reloadAssets();
      if (auth.user?.id) {
        setDead(await listDeadOutbox());
      } else {
        setDead([]);
      }
    })();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [checklistYear, auth.user?.id]);

  function pickTheme(t: ThemeChoice) {
    setTheme(t);
    persistTheme(t);
  }

  async function persist(partial: Partial<AppSettings>) {
    await saveSettings(partial);
    setS(await getSettings());
  }

  /**
   * Legacy "Giá VWCE gần nhất" → atomic saveManualQuoteForIsin (quote + mirror).
   * Failures surface to caller; no silent split-brain.
   */
  async function persistLegacyVwcePrice(price: number) {
    // Policy A: reject price <= 0 — never create settings/quote split-brain
    if (!(price > 0)) {
      alert("Giá phải > 0");
      setS(await getSettings());
      return;
    }
    const asOf = new Date().toISOString().slice(0, 10);
    try {
      await saveManualQuoteForIsin({
        instrumentIsin: VWCE_ISIN,
        price,
        asOf,
        venue: "XETRA",
      });
      setS(await getSettings());
      await reloadAssets();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Không lưu được giá VWCE");
      setS(await getSettings());
      await reloadAssets();
    }
  }

  async function saveManualQuote() {
    setQuoteErr(null);
    const isin = normalizeIsin(quoteIsin);
    if (!isValidIsin(isin)) {
      setQuoteErr("ISIN không hợp lệ (checksum).");
      return;
    }
    const price = parseDecimal(quotePrice);
    if (!(price > 0)) {
      setQuoteErr("Giá phải > 0.");
      return;
    }
    if (!isValidAsOfDate(quoteAsOf)) {
      setQuoteErr("Ngày asOf phải dạng YYYY-MM-DD hợp lệ.");
      return;
    }
    setQuoteSaving(true);
    try {
      await saveManualQuoteForIsin({
        instrumentIsin: isin,
        price,
        asOf: quoteAsOf.trim(),
        venue: instruments.find((i) => i.isin === isin)?.venue,
      });
      setS(await getSettings());
      await reloadAssets();
      setQuotePrice("");
    } catch (e) {
      setQuoteErr(e instanceof Error ? e.message : "Không lưu được quote");
    } finally {
      setQuoteSaving(false);
    }
  }

  function downloadJson(payload: BackupPayload, name: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
    a.download = name;
    a.click();
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
    if (!confirm("Tiếp tục nhập? (sẽ tự backup dữ liệu hiện tại trước)")) return;
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
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lỗi nhập");
    }
  }

  async function exportCsv() {
    const txs = await listTransactions();
    const header = "date,type,amount,unitPrice,quantity,fee,tax,instrumentIsin,notes\n";
    const rows = txs
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
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8" }),
    );
    a.download = "vwce-transactions.csv";
    a.click();
  }

  function quoteFor(isin: string): Quote | undefined {
    return quotes.find((q) => q.instrumentIsin === isin && q.currency === "EUR");
  }

  if (!s) return <p className="muted">Đang tải…</p>;

  return (
    <div className="settings-v9">
      <p className="group-label">Giao diện</p>
      <div className="group-box">
        <div className="group-row">
          <span className="group-row-label">Chủ đề</span>
          <Segmented
            value={theme}
            options={THEME_OPTIONS}
            onChange={(v) => pickTheme(v as ThemeChoice)}
          />
        </div>
        <p className="group-hint">
          Premium là nền hắc thạch với điểm nhấn champagne. Lựa chọn được nhớ
          trên máy này.
        </p>
      </div>

      <p className="group-label">Kế hoạch</p>
      <div className="group-box">
        <div className="group-row">
          <label htmlFor="s-plan">Tên kế hoạch</label>
          <input
            id={s-plan}
            value={s.planName ?? ""}
            onChange={(e) => setS({ ...s, planName: e.target.value })}
            onBlur={() => persist({ planName: s.planName })}
          />
        </div>
