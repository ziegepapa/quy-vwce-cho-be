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
    const preview = [
      `Export: ${data.exportedAt ?? "?"}`,
      `Settings: ${data.settings?.length ?? 0}`,
      `Goals: ${data.goals?.length ?? 0}`,
      `Transactions: ${data.transactions?.length ?? 0}`,
      `Checklists: ${data.annualChecklists?.length ?? 0}`,
      `Snapshots: ${data.monthlySnapshots?.length ?? 0}`,
    ].join("\n");
    if (!confirm(`Xem trước backup:\n${preview}\n\nTiếp tục nhập? (sẽ tự backup dữ liệu hiện tại trước)`))
      return;

    try {
      const current = await exportBackup();
      downloadJson(
        current,
        `vwce-auto-before-import-${current.exportedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`,
      );
    } catch {
      /* still allow import */
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
    const bom = "\uFEFF";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([bom + header + rows], { type: "text/csv;charset=utf-8" }),
    );
    a.download = "vwce-transactions.csv";
    a.click();
  }

  if (!s) return <p className="muted">Đang tải…</p>;

  return (
    <div>
      <h1 className="page-title">Cài đặt</h1>
      <div className="card">
        <div className="field">
          <label>Tên kế hoạch</label>
          <input
            value={s.planName}
            onChange={(e) => setS({ ...s, planName: e.target.value })}
            onBlur={() => persist({ planName: s.planName })}
          />
        </div>
        <div className="field">
          <label>Tên bé (tuỳ chọn)</label>
          <input
            value={s.childName}
            onChange={(e) => setS({ ...s, childName: e.target.value })}
            onBlur={() => persist({ childName: s.childName })}
          />
        </div>
        <div className="field">
          <label>Tài khoản đứng tên</label>
          <select
            value={s.accountType}
            onChange={(e) => {
              const accountType = e.target.value as "child" | "parent";
              setS({ ...s, accountType });
              persist({ accountType });
            }}
          >
            <option value="parent">Cha/mẹ</option>
            <option value="child">Bé</option>
          </select>
        </div>
        <div className="field">
          <label>Giá VWCE gần nhất</label>
          <input
            type="number"
            step="0.01"
            value={s.latestVwcePrice || ""}
            onChange={(e) => setS({ ...s, latestVwcePrice: +e.target.value })}
            onBlur={() =>
              persist({
                latestVwcePrice: s.latestVwcePrice,
                latestPriceDate: new Date().toISOString().slice(0, 10),
              })
            }
          />
        </div>
        <div className="grid2">
          <div className="field">
            <label>Lạm phát</label>
            <input
              type="number"
              step="0.001"
              value={s.inflationRate}
              onChange={(e) => setS({ ...s, inflationRate: +e.target.value })}
              onBlur={() => persist({ inflationRate: s.inflationRate })}
            />
          </div>
          <div className="field">
            <label>Buffer</label>
            <input
              type="number"
              step="0.01"
              value={s.bufferPct}
              onChange={(e) => setS({ ...s, bufferPct: +e.target.value })}
              onBlur={() => persist({ bufferPct: s.bufferPct })}
            />
          </div>
        </div>
        <div className="grid2">
          <div className="field">
            <label>Lợi suất VWCE</label>
            <input
              type="number"
              step="0.001"
              value={s.vwceReturn}
              onChange={(e) => setS({ ...s, vwceReturn: +e.target.value })}
              onBlur={() => persist({ vwceReturn: s.vwceReturn })}
            />
          </div>
          <div className="field">
            <label>Lợi suất an toàn</label>
            <input
              type="number"
              step="0.001"
              value={s.safeReturn}
              onChange={(e) => setS({ ...s, safeReturn: +e.target.value })}
              onBlur={() => persist({ safeReturn: s.safeReturn })}
            />
          </div>
        </div>
        <div className="field">
          <label>Hạn 2042</label>
          <select
            value={s.endMode}
            onChange={(e) => {
              const endMode = e.target.value as "hard" | "flexible";
              setS({ ...s, endMode });
              persist({ endMode });
            }}
          >
            <option value="hard">Hạn cứng</option>
            <option value="flexible">Linh hoạt</option>
          </select>
        </div>
        <div className="grid2">
          <div className="field">
            <label>Đóng góp năm 1</label>
            <input
              type="number"
              value={s.contributionY1}
              onChange={(e) => setS({ ...s, contributionY1: +e.target.value })}
              onBlur={() => persist({ contributionY1: s.contributionY1 })}
            />
          </div>
          <div className="field">
            <label>Từ năm 2</label>
            <input
              type="number"
              value={s.contributionY2}
              onChange={(e) => setS({ ...s, contributionY2: +e.target.value })}
              onBlur={() => persist({ contributionY2: s.contributionY2 })}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row-between">
          <h2>Checklist</h2>
          <select
            value={checklistYear}
            onChange={(e) => setChecklistYear(+e.target.value)}
            style={{ width: "auto", minHeight: 36 }}
          >
            {[0, 1, 2, 3, 4].map((i) => {
              const y = new Date().getFullYear() - 2 + i;
              return (
                <option key={y} value={y}>
                  {y}
                </option>
              );
            })}
          </select>
        </div>
        {checklist?.items.map((item) => (
          <label
            key={item.key}
            style={{ display: "flex", gap: 8, marginBottom: 8, color: "inherit", fontWeight: 500 }}
          >
            <input
              type="checkbox"
              checked={item.done}
              style={{ width: 20, height: 20, minHeight: 20 }}
              onChange={async () => {
                const items = checklist.items.map((i) =>
                  i.key === item.key ? { ...i, done: !i.done } : i,
                );
                const next = { ...checklist, items, updatedAt: new Date().toISOString() };
                await db.annualChecklists.put(next);
                setChecklist(next);
              }}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>

      <div className="card stack">
        <button type="button" onClick={doExport}>
          Xuất JSON
        </button>
        <label
          className="secondary"
          style={{
            textAlign: "center",
            padding: ".65rem",
            border: "1.5px solid var(--navy)",
            borderRadius: 12,
          }}
        >
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
        <button type="button" className="secondary" onClick={exportCsv}>
          Xuất CSV giao dịch
        </button>
        {onOpenMigrate && (
          <button type="button" className="secondary" onClick={onOpenMigrate}>
            Nhập dữ liệu local vào tài khoản
          </button>
        )}
        <button
          type="button"
          className="danger"
          onClick={async () => {
            if (!confirm("Bước 1/2: Xóa toàn bộ dữ liệu trên thiết bị này?")) return;
            if (!confirm("Bước 2/2: Xác nhận xóa — không hoàn tác được?")) return;
            await clearAllData();
            window.location.reload();
          }}
        >
          Xóa toàn bộ dữ liệu
        </button>
      </div>

      <div className="card">
        <h2>Cài PWA iPhone</h2>
        <ol className="muted" style={{ paddingLeft: "1.2rem" }}>
          <li>Mở bằng Safari</li>
          <li>Chia sẻ → Thêm vào Màn hình chính</li>
          <li>Mở icon app (standalone, offline sau lần tải đầu)</li>
        </ol>
      </div>

      <div className="card disclaimer">
        <p>
          v{APP_VERSION} · {online ? "Online" : "Offline"} · Sao lưu:{" "}
          {metaBackup ? formatDateVN(metaBackup.slice(0, 10)) : "chưa có"}
        </p>
        <p>
          Dữ liệu lưu trên thiết bị và đồng bộ Supabase khi đã đăng nhập. Không phải tư vấn
          đầu tư/thuế.
        </p>
      </div>
    </div>
  );
}
