import { useEffect, useState } from "react";
import {
  applyTransaction,
  emptyPortfolio,
  formatMoney,
} from "../lib/calc";
import {
  countLocalData,
  db,
  exportBackup,
  listTransactions,
} from "../lib/db";
import { enqueueOutbox } from "../lib/sync/outbox";
import { saveSyncMeta } from "../lib/sync/engine";

type Props = {
  userId: string;
  onDone: () => void;
  onSkip: () => void;
};

export default function MigrateWizard({ userId, onDone, onSkip }: Props) {
  const [counts, setCounts] = useState({
    settings: 0,
    goals: 0,
    transactions: 0,
    annualChecklists: 0,
    monthlySnapshots: 0,
  });
  const [range, setRange] = useState("");
  const [contrib, setContrib] = useState(0);
  const [vwceQty, setVwceQty] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const c = await countLocalData();
      setCounts(c);
      const txs = await listTransactions();
      if (txs.length) {
        const dates = txs.map((t) => t.date).sort();
        setRange(`${dates[0]} → ${dates[dates.length - 1]}`);
      }
      let s = emptyPortfolio();
      for (const t of [...txs].sort((a, b) => (a.date < b.date ? -1 : 1))) {
        s = applyTransaction(s, t);
      }
      setContrib(s.totalContributed);
      setVwceQty(s.vwceQty);
    })();
  }, []);

  const total =
    counts.settings +
    counts.goals +
    counts.transactions +
    counts.annualChecklists +
    counts.monthlySnapshots;

  async function downloadBackup() {
    const payload = await exportBackup();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
    a.download = `vwce-pre-migrate-${payload.exportedAt.slice(0, 10)}.json`;
    a.click();
  }

  async function confirmMigrate() {
    if (!confirm("Xác nhận đẩy dữ liệu local lên tài khoản? Đã tải backup chưa?")) return;
    setBusy(true);
    setMsg("");
    try {
      await downloadBackup();
      // enqueue all local rows for push
      const settings = await db.settings.toArray();
      for (const row of settings) {
        await enqueueOutbox("settings", row.id, "upsert", row, 1);
      }
      const goals = await db.goals.toArray();
      for (const row of goals) {
        await enqueueOutbox("goals", row.id, "upsert", row, 1);
      }
      const txs = await db.transactions.toArray();
      for (const row of txs) {
        await enqueueOutbox("transactions", row.id, "upsert", row, 1);
      }
      const checks = await db.annualChecklists.toArray();
      for (const row of checks) {
        await enqueueOutbox("annualChecklists", row.id, "upsert", row, 1);
      }
      const snaps = await db.monthlySnapshots.toArray();
      for (const row of snaps) {
        await enqueueOutbox("monthlySnapshots", row.id, "upsert", row, 1);
      }
      await saveSyncMeta({ userId, migrateWizardDone: true, migrateWizardSkipped: false });
      setMsg(
        `Đã xếp hàng ${total} bản ghi vào outbox. Đồng bộ sẽ chạy khi có mạng.`,
      );
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Lỗi nhập");
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    await saveSyncMeta({ userId, migrateWizardSkipped: true });
    onSkip();
  }

  return (
    <div className="app-shell">
      <div className="card">
        <h1 className="page-title">Nhập dữ liệu local</h1>
        <p className="muted">
          Phát hiện dữ liệu trên thiết bị này (bản MVP). Xem trước rồi xác nhận — không tự động
          ghi đè cloud.
        </p>
        <table style={{ width: "100%", fontSize: ".9rem" }}>
          <tbody>
            <tr>
              <td>Settings</td>
              <td>{counts.settings}</td>
            </tr>
            <tr>
              <td>Mục tiêu</td>
              <td>{counts.goals}</td>
            </tr>
            <tr>
              <td>Giao dịch</td>
              <td>{counts.transactions}</td>
            </tr>
            <tr>
              <td>Checklist</td>
              <td>{counts.annualChecklists}</td>
            </tr>
            <tr>
              <td>Snapshots</td>
              <td>{counts.monthlySnapshots}</td>
            </tr>
          </tbody>
        </table>
        {range && <p className="muted">Khoảng giao dịch: {range}</p>}
        <p className="muted">
          Vốn đã đóng (ước tính): {formatMoney(contrib)} · VWCE SL: {vwceQty.toFixed(4)}
        </p>
        {msg && <div className="banner">{msg}</div>}
        <div className="stack">
          <button type="button" disabled={busy || total === 0} onClick={confirmMigrate}>
            {busy ? "Đang xử lý…" : "Backup + nhập vào tài khoản"}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={skip}>
            Bỏ qua (có thể mở lại trong Cài đặt)
          </button>
        </div>
      </div>
    </div>
  );
}
