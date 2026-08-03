import { useEffect, useState } from "react";
import {
  clearAllData,
  db,
  exportBackup,
  getOrCreateChecklist,
  getQuoteForIsin,
  getSettings,
  importBackup,
  listInstruments,
  listQuotes,
  listTransactions,
  saveSettings,
  upsertQuote,
} from "../lib/db";
import type { AnnualChecklist, AppSettings, BackupPayload, Instrument, Quote } from "../lib/types";
import { APP_VERSION, SCHEMA_VERSION, VWCE_ISIN } from "../lib/types";
import { isSupportedBackupSchema } from "../lib/backupSchema";
import { csvEscape, formatDateVN, formatMoney, parseDecimal } from "../lib/calc";
import { isValidAsOfDate, isValidIsin, normalizeIsin, quoteId } from "../lib/instrument";
import type { ThemeChoice } from "../lib/theme";
import { THEME_OPTIONS, persistTheme, readTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { listDeadOutbox, pushOutbox, reviveDeadOutbox } from "../lib/sync/engine";
import type { OutboxItem } from "../lib/sync/types";
import { nowIso } from "../lib/defaults";

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
   * Legacy "Giá VWCE gần nhất" → write settings + intentional VWCE quote (single source after migrate).
   * instruments/quotes remain local-only (upsertQuote does not enqueue outbox).
   */
  async function persistLegacyVwcePrice(price: number) {
    const asOf = new Date().toISOString().slice(0, 10);
    await saveSettings({ latestVwcePrice: price, latestPriceDate: asOf });
    if (price > 0 && isValidAsOfDate(asOf)) {
      try {
        const existing = await getQuoteForIsin(VWCE_ISIN, "EUR");
        await upsertQuote({
          id: quoteId(VWCE_ISIN, "EUR"),
          instrumentIsin: VWCE_ISIN,
          currency: "EUR",
          venue: "XETRA",
          price,
          asOf,
          source: "manual",
          createdAt: existing?.createdAt ?? nowIso(),
          updatedAt: nowIso(),
        });
      } catch {
        /* validation failed — settings still saved for legacy UI */
      }
    }
    setS(await getSettings());
    await reloadAssets();
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
      const existing = await getQuoteForIsin(isin, "EUR");
      await upsertQuote({
        id: quoteId(isin, "EUR"),
        instrumentIsin: isin,
        currency: "EUR",
        venue: instruments.find((i) => i.isin === isin)?.venue,
        price,
        asOf: quoteAsOf.trim(),
        source: "manual",
        createdAt: existing?.createdAt ?? nowIso(),
        updatedAt: nowIso(),
      });
      // Keep legacy VWCE fields in sync when editing VWCE quote
      if (isin === VWCE_ISIN) {
        await saveSettings({ latestVwcePrice: price, latestPriceDate: quoteAsOf.trim() });
        setS(await getSettings());
      }
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
            id="s-plan"
            value={s.planName ?? ""}
            onChange={(e) => setS({ ...s, planName: e.target.value })}
            onBlur={() => persist({ planName: s.planName })}
          />
        </div>
        <div className="group-row">
          <label htmlFor="s-child">Tên bé</label>
          <input
            id="s-child"
            value={s.childName ?? ""}
            onChange={(e) => setS({ ...s, childName: e.target.value })}
            onBlur={() => persist({ childName: s.childName })}
          />
        </div>
        <div className="group-row">
          <span className="group-row-label">Tài khoản đứng tên</span>
          <Segmented
            value={s.accountType}
            options={[
              { value: "parent", label: "Cha/mẹ" },
              { value: "child", label: "Bé" },
            ]}
            onChange={(v) => persist({ accountType: v as "child" | "parent" })}
          />
        </div>
      </div>

      <p className="group-label">Giả định</p>
      <div className="group-box">
        <div className="group-row row-between-inline">
          <span className="group-row-label">Lạm phát</span>
          <NumField
            value={s.inflationRate * 100}
            minFrac={1}
            maxFrac={1}
            suffix="%"
            ariaLabel={`Lạm phát ${pctDisplay(s.inflationRate)}`}
            onCommit={(pct) => persist({ inflationRate: pctToRate(pct) })}
          />
        </div>
        <div className="group-row row-between-inline">
          <span className="group-row-label">Buffer</span>
          <NumField
            value={s.bufferPct * 100}
            minFrac={1}
            maxFrac={1}
            suffix="%"
            ariaLabel={`Buffer ${pctDisplay(s.bufferPct)}`}
            onCommit={(pct) => persist({ bufferPct: pctToRate(pct) })}
          />
        </div>
        <div className="group-row row-between-inline">
          <span className="group-row-label">Lợi suất VWCE</span>
          <NumField
            value={s.vwceReturn * 100}
            minFrac={1}
            maxFrac={1}
            suffix="%"
            ariaLabel={`Lợi suất VWCE ${pctDisplay(s.vwceReturn)}`}
            onCommit={(pct) => persist({ vwceReturn: pctToRate(pct) })}
          />
        </div>
        <div className="group-row row-between-inline">
          <span className="group-row-label">Lợi suất an toàn</span>
          <NumField
            value={s.safeReturn * 100}
            minFrac={1}
            maxFrac={1}
            suffix="%"
            ariaLabel={`Lợi suất an toàn ${pctDisplay(s.safeReturn)}`}
            onCommit={(pct) => persist({ safeReturn: pctToRate(pct) })}
          />
        </div>
      </div>

      <p className="group-label">Tài sản / mã (ISIN)</p>
      <div className="group-box">
        {/* @deprecated legacy field — synced intentionally to VWCE quote */}
        <div className="group-row row-between-inline">
          <span className="group-row-label">Giá VWCE gần nhất (legacy)</span>
          <NumField
            className="pct-input wide"
            value={s.latestVwcePrice}
            minFrac={0}
            maxFrac={4}
            suffix="€"
            ariaLabel="Giá VWCE gần nhất"
            onCommit={(price) => void persistLegacyVwcePrice(price)}
          />
        </div>
        {s.latestPriceDate && (
          <p className="group-hint">Legacy cập nhật {formatDateVN(s.latestPriceDate)} · đồng bộ quote VWCE</p>
        )}

        {instruments.length === 0 ? (
          <p className="group-hint">Chưa có instrument — migration sẽ seed VWCE khi mở app.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
            {instruments.map((inst) => {
              const q = quoteFor(inst.isin);
              return (
                <li
                  key={inst.isin}
                  style={{
                    borderTop: "1px solid var(--border, #e5e7eb)",
                    padding: "12px 0",
                    fontSize: 14,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {inst.name || inst.isin}
                    {inst.ticker ? ` · ${inst.ticker}` : ""}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {inst.isin}
                    {inst.currency ? ` · ${inst.currency}` : ""}
                    {inst.venue ? ` · ${inst.venue}` : ""}
                  </div>
                  {q ? (
                    <div style={{ marginTop: 4 }}>
                      {formatMoney(q.price, q.currency)} · asOf {formatDateVN(q.asOf)} · {q.source}
                    </div>
                  ) : (
                    <div style={{ marginTop: 4, color: "var(--warning-600, #b45309)" }}>Thiếu giá</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="group-hint" style={{ marginTop: 12 }}>
          Quote thủ công (local-only, chưa đồng bộ Supabase). Mỗi ISIN một giá — không ghi đè chéo.
        </p>
        <div className="group-row">
          <label htmlFor="q-isin">ISIN</label>
          <input
            id="q-isin"
            value={quoteIsin}
            onChange={(e) => setQuoteIsin(e.target.value)}
            autoCapitalize="characters"
            style={{ minHeight: 44 }}
          />
        </div>
        <div className="group-row">
          <label htmlFor="q-price">Giá (€)</label>
          <input
            id="q-price"
            inputMode="decimal"
            value={quotePrice}
            onChange={(e) => setQuotePrice(e.target.value)}
            style={{ minHeight: 44 }}
          />
        </div>
        <div className="group-row">
          <label htmlFor="q-asof">asOf (YYYY-MM-DD)</label>
          <input
            id="q-asof"
            value={quoteAsOf}
            onChange={(e) => setQuoteAsOf(e.target.value)}
            style={{ minHeight: 44 }}
          />
        </div>
        {quoteErr && (
          <p role="alert" style={{ color: "var(--danger-600, #b91c1c)", fontSize: 13 }}>
            {quoteErr}
          </p>
        )}
        <button
          type="button"
          className="group-action"
          style={{ minHeight: 44 }}
          disabled={quoteSaving}
          onClick={() => void saveManualQuote()}
        >
          {quoteSaving ? "Đang lưu…" : "Lưu quote thủ công"}
        </button>
      </div>

      <p className="group-label">Hạn</p>
      <div className="group-box">
        <div className="group-row">
          <span className="group-row-label">Hạn 2042</span>
          <Segmented
            value={s.endMode}
            options={[
              { value: "hard", label: "Hạn cứng" },
              { value: "flexible", label: "Linh hoạt" },
            ]}
            onChange={(v) => persist({ endMode: v as "hard" | "flexible" })}
          />
        </div>
      </div>

      <p className="group-label">Checklist {checklistYear}</p>
      <div className="group-box">
        <div className="group-row">
          <label htmlFor="cl-year">Năm</label>
          <input
            id="cl-year"
            type="number"
            value={checklistYear}
            onChange={(e) => {
              const y = Number(e.target.value);
              if (y >= 2000 && y <= 2100) setChecklistYear(y);
            }}
          />
        </div>
        {checklist?.items.map((item) => (
          <label key={item.key} className="switch-row">
            <span>{item.label}</span>
            <input
              type="checkbox"
              className="ios-switch"
              checked={item.done}
              onChange={async () => {
                const items = checklist.items.map((i) =>
                  i.key === item.key ? { ...i, done: !i.done } : i,
                );
                const next = { ...checklist, items, updatedAt: new Date().toISOString() };
                await db.annualChecklists.put(next);
                setChecklist(next);
              }}
            />
          </label>
        ))}
      </div>

      {auth.user?.id && (dead.length > 0 || deadSyncedMsg) ? (
        <>
          <p className="group-label">Đồng bộ</p>
          <div className="group-box">
            {deadSyncedMsg && dead.length === 0 ? (
              <p style={{ margin: 0, color: "var(--success-600)", fontSize: 14 }}>
                Đã đồng bộ xong.
              </p>
            ) : (
              <>
                <p
                  style={{
                    margin: "0 0 12px",
                    color: "var(--warning-600)",
                    fontSize: 14,
                    lineHeight: 1.45,
                  }}
                >
                  {dead.length} thay đổi chưa đồng bộ được lên máy chủ sau nhiều lần thử. Dữ liệu
                  vẫn an toàn trên máy này.
                </p>
                <button
                  type="button"
                  className="group-action"
                  style={{ minHeight: 44 }}
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
              </>
            )}
          </div>
        </>
      ) : null}

      <p className="group-label">Dữ liệu</p>
      <div className="group-box">
        <button type="button" className="group-action" onClick={doExport}>
          Xuất JSON
        </button>
        <label className="group-action">
          Nhập JSON
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
        <button type="button" className="group-action" onClick={exportCsv}>
          Xuất CSV giao dịch
        </button>
        {onOpenMigrate && (
          <button type="button" className="group-action" onClick={onOpenMigrate}>
            Nhập dữ liệu local vào tài khoản
          </button>
        )}
      </div>

      <p className="group-label">Vùng nguy hiểm</p>
      <div className="group-box">
        {deleteStep === 0 ? (
          <button
            type="button"
            className="group-action danger-text"
            onClick={() => setDeleteStep(1)}
          >
            Xóa toàn bộ dữ liệu
          </button>
        ) : (
          <div className="delete-confirm">
            <p className="muted" style={{ fontSize: 13 }}>
              Gõ <strong>XOA</strong> để xác nhận. Không hoàn tác được.
            </p>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="XOA"
              autoCapitalize="characters"
            />
            <div className="stack" style={{ marginTop: 8 }}>
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
        )}
      </div>

      <p className="settings-foot">
        v{APP_VERSION} · {online ? "Online" : "Offline"} · Sao lưu:{" "}
        {metaBackup ? formatDateVN(metaBackup.slice(0, 10)) : "chưa có"}
      </p>
    </div>
  );
}
