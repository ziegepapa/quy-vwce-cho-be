import { useEffect, useState } from "react";
import { clearAllData, db, exportBackup, getOrCreateChecklist, getSettings, importBackup, listTransactions, saveSettings } from "../lib/db";
import type { AnnualChecklist, AppSettings, BackupPayload } from "../lib/types";
import { APP_VERSION } from "../lib/types";
import { formatDateVN } from "../lib/calc";

export default function SettingsPage({ onReload }: { onReload: () => void }) {
  const [s, setS] = useState<AppSettings | null>(null);
  const [metaBackup, setMetaBackup] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [checklist, setChecklist] = useState<AnnualChecklist | null>(null);
  const year = new Date().getFullYear();
  useEffect(() => {
    (async () => {
      setS(await getSettings());
      setMetaBackup((await db.appMetadata.get("meta"))?.lastBackupAt ?? "");
      setChecklist(await getOrCreateChecklist(year));
    })();
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [year]);
  async function persist(partial: Partial<AppSettings>) { await saveSettings(partial); setS(await getSettings()); }
  async function doExport() {
    const payload = await exportBackup();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    a.download = `vwce-backup-${payload.exportedAt.slice(0, 10)}.json`; a.click();
    setMetaBackup(payload.exportedAt);
  }
  async function doImport(file: File) {
    let data: BackupPayload;
    try { data = JSON.parse(await file.text()); } catch { alert("JSON không hợp lệ"); return; }
    if (!confirm(`Nhập backup? tx:${data.transactions?.length}`)) return;
    try { await importBackup(data); alert("OK"); onReload(); } catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); }
  }
  async function exportCsv() {
    const txs = await listTransactions();
    const header = "date,type,amount,unitPrice,quantity,fee,tax,notes\n";
    const rows = txs.map((t) => [t.date, t.type, t.amount, t.unitPrice ?? "", t.quantity ?? "", t.fee ?? "", t.tax ?? "", JSON.stringify(t.notes ?? "")].join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([header + rows], { type: "text/csv" }));
    a.download = "vwce-transactions.csv"; a.click();
  }
  if (!s) return <p className="muted">Đang tải…</p>;
  return (
    <div>
      <h1 className="page-title">Cài đặt</h1>
      <div className="card">
        <div className="field"><label>Tên kế hoạch</label><input value={s.planName} onChange={(e) => setS({ ...s, planName: e.target.value })} onBlur={() => persist({ planName: s.planName })} /></div>
        <div className="field"><label>Giá VWCE</label><input type="number" step="0.01" value={s.latestVwcePrice || ""} onChange={(e) => setS({ ...s, latestVwcePrice: +e.target.value })} onBlur={() => persist({ latestVwcePrice: s.latestVwcePrice, latestPriceDate: new Date().toISOString().slice(0, 10) })} /></div>
        <div className="grid2">
          <div className="field"><label>Lạm phát</label><input type="number" step="0.001" value={s.inflationRate} onChange={(e) => setS({ ...s, inflationRate: +e.target.value })} onBlur={() => persist({ inflationRate: s.inflationRate })} /></div>
          <div className="field"><label>Buffer</label><input type="number" step="0.01" value={s.bufferPct} onChange={(e) => setS({ ...s, bufferPct: +e.target.value })} onBlur={() => persist({ bufferPct: s.bufferPct })} /></div>
        </div>
        <div className="field"><label>Hạn 2042</label>
          <select value={s.endMode} onChange={(e) => { const endMode = e.target.value as "hard" | "flexible"; setS({ ...s, endMode }); persist({ endMode }); }}>
            <option value="hard">Hạn cứng</option><option value="flexible">Linh hoạt</option>
          </select>
        </div>
      </div>
      <div className="card">
        <h2>Checklist {year}</h2>
        {checklist?.items.map((item) => (
          <label key={item.key} style={{ display: "flex", gap: 8, marginBottom: 8, color: "inherit", fontWeight: 500 }}>
            <input type="checkbox" checked={item.done} style={{ width: 20, height: 20, minHeight: 20 }} onChange={async () => {
              const items = checklist.items.map((i) => (i.key === item.key ? { ...i, done: !i.done } : i));
              const next = { ...checklist, items, updatedAt: new Date().toISOString() };
              await db.annualChecklists.put(next); setChecklist(next);
            }} />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
      <div className="card stack">
        <button type="button" onClick={doExport}>Xuất JSON</button>
        <label className="secondary" style={{ textAlign: "center", padding: ".65rem", border: "1.5px solid var(--navy)", borderRadius: 12 }}>
          Nhập JSON<input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); }} />
        </label>
        <button type="button" className="secondary" onClick={exportCsv}>Xuất CSV</button>
        <button type="button" className="danger" onClick={async () => { if (!confirm("Bước 1/2: Xóa hết?")) return; if (!confirm("Bước 2/2: Xác nhận?")) return; await clearAllData(); window.location.reload(); }}>Xóa toàn bộ dữ liệu</button>
      </div>
      <div className="card">
        <h2>Cài PWA iPhone</h2>
        <ol className="muted" style={{ paddingLeft: "1.2rem" }}><li>Mở Safari</li><li>Chia sẻ</li><li>Thêm vào Màn hình chính</li></ol>
      </div>
      <div className="card disclaimer">
        <p>v{APP_VERSION} · {online ? "Online" : "Offline"} · Sao lưu: {metaBackup ? formatDateVN(metaBackup.slice(0, 10)) : "chưa có"}</p>
        <p>Không phải tư vấn đầu tư/thuế. Giá vốn trung bình chỉ theo dõi nội bộ.</p>
      </div>
    </div>
  );
}
