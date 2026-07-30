import { useEffect, useState } from "react";
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
import { csvEscape, formatDateVN } from "../lib/calc";

function pctDisplay(decimal: number): string {
  if (!Number.isFinite(decimal)) return "—";
  return `${(decimal * 100).toLocaleString("vi-VN", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })} %`;
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

  useEffect(() => {
    (async () => {
      setS(await getSettings());
      setMetaBackup((await db.appMetadata.get("meta"))?.lastBackupAt ?? "");
      setChecklist(await getOrCreateChecklist(checklistYear));
    })();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [checklistYear]);

  async function persist(partial: Partial<AppSettings>) {
    await saveSettings(partial);
    setS(await getSettings());
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
    if (data.schemaVersion !== SCHEMA_VERSION) {
      alert(`schemaVersion không khớp (file: ${data.schemaVersion}, app: ${SCHEMA_VERSION})`);
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
    const header = "date,type,amount,unitPrice,quantity,fee,tax,notes\n";
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

  if (!s) return <p className="muted">Đang tải…</p>;

  return (
    <div className="settings-v9">
      <p className="group-label">Kế hoạch</p>
      <div className="group-box">
        <div className="group-row">
          <label htmlFor="s-plan">Tên kế hoạch</label>
          <input
            id="s-plan"
            value={s.planName}
            onChange={(e) => setS({ ...s, planName: e.target.value })}
            onBlur={() => persist({ planName: s.planName })}
          />
        </div>
        <div className="group-row">
          <label htmlFor="s-child">Tên bé</label>
          <input
            id="s-child"
            value={s.childName}
            onChange={(e) => setS({ ...s, childName: e.target.value })}
            onBlur={() => persist({ childName: s.childName })}
          />
        </div>
        <div className="group-row">
          <span className="group-row-label">Tài khoản đứng tên</span>
          <Segmented
            value={s.accountType}
            options={
              [
                { value: "parent", label: "Cha/mẹ" },
                { value: "child", label: "Bé" },
              ]
            }
            onChange={(v) => {
              const accountType = v as "child" | "parent";
              setS({ ...s, accountType });
              persist({ accountType });
            }}
          />
        </div>
      </div>

      <p className="group-label">Giả định</p>
      <div className="group-box">
        <div className="group-row row-between-inline">
          <span className="group-row-label">Lạm phát</span>
          <input
            className="pct-input"
            inputMode="decimal"
            value={(s.inflationRate * 100).toFixed(1)}
            onChange={(e) => setS({ ...s, inflationRate: (+e.target.value || 0) / 100 })}
            onBlur={() => persist({ inflationRate: s.inflationRate })}
            aria-label={`Lạm phát ${pctDisplay(s.inflationRate)}`}
          />
          <span className="pct-suffix">%</span>
        </div>
        <div className="group-row row-between-inline">
          <span className="group-row-label">Buffer</span>
          <input
            className="pct-input"
            inputMode="decimal"
            value={(s.bufferPct * 100).toFixed(1)}
            onChange={(e) => setS({ ...s, bufferPct: (+e.target.value || 0) / 100 })}
            onBlur={() => persist({ bufferPct: s.bufferPct })}
          />
          <span className="pct-suffix">%</span>
        </div>
        <div className="group-row row-between-inline">
          <span className="group-row-label">Lợi suất VWCE</span>
          <input
            className="pct-input"
            inputMode="decimal"
            value={(s.vwceReturn * 100).toFixed(1)}
            onChange={(e) => setS({ ...s, vwceReturn: (+e.target.value || 0) / 100 })}
            onBlur={() => persist({ vwceReturn: s.vwceReturn })}
          />
          <span className="pct-suffix">%</span>
        </div>
        <div className="group-row row-between-inline">
          <span className="group-row-label">Lợi suất an toàn</span>
          <input
            className="pct-input"
            inputMode="decimal"
            value={(s.safeReturn * 100).toFixed(1)}
            onChange={(e) => setS({ ...s, safeReturn: (+e.target.value || 0) / 100 })}
            onBlur={() => persist({ safeReturn: s.safeReturn })}
          />
          <span className="pct-suffix">%</span>
        </div>
      </div>

      <p className="group-label">Tài sản</p>
      <div className="group-box">
        <div className="group-row row-between-inline">
          <span className="group-row-label">Giá VWCE gần nhất</span>
          <input
            className="pct-input wide"
            inputMode="decimal"
            value={s.latestVwcePrice || ""}
            onChange={(e) => setS({ ...s, latestVwcePrice: +e.target.value })}
            onBlur={() =>
              persist({
                latestVwcePrice: s.latestVwcePrice,
                latestPriceDate: new Date().toISOString().slice(0, 10),
              })
            }
          />
          <span className="pct-suffix">€</span>
        </div>
        {s.latestPriceDate && (
          <p className="group-hint">Cập nhật {formatDateVN(s.latestPriceDate)}</p>
        )}
      </div>

      <p className="group-label">Hạn</p>
      <div className="group-box">
        <div className="group-row">
          <span className="group-row-label">Hạn 2042</span>
          <Segmented
            value={s.endMode}
            options={
              [
                { value: "hard", label: "Hạn cứng" },
                { value: "flexible", label: "Linh hoạt" },
              ]
            }
            onChange={(v) => {
              const endMode = v as "hard" | "flexible";
              setS({ ...s, endMode });
              persist({ endMode });
            }}
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
            onChange={(e) => setChecklistYear(+e.target.value)}
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
          <button type="button" className="group-action danger-text" onClick={() => setDeleteStep(1)}>
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
                disabled={deleteConfirm !== "XOA"}
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
