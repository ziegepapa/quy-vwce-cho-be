import { useEffect, useState } from "react";
import { deleteGoal, listGoals, uid, upsertGoal } from "../lib/db";
import type { Goal, GoalMode, GoalUrgency } from "../lib/types";
import { formatDateVN, formatMoney, inflate, parseDate } from "../lib/calc";
import { nowIso } from "../lib/defaults";

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState<Goal | null>(null);
  const [form, setForm] = useState({ name: "Mục tiêu", dueDate: "2038-06-30", amount: "10000", mode: "purchasing_power" as GoalMode, baseYear: "2026", inflationRate: "0.02", bufferPct: "0.1", urgency: "hard" as GoalUrgency, protectedAmount: "0", notes: "" });
  async function reload() { setGoals(await listGoals()); }
  useEffect(() => { reload(); }, []);
  async function save() {
    await upsertGoal({ id: edit?.id ?? uid("goal"), name: form.name, dueDate: form.dueDate, amount: Number(form.amount) || 0, mode: form.mode, baseYear: Number(form.baseYear) || 2026, inflationRate: Number(form.inflationRate) || 0, bufferPct: Number(form.bufferPct) || 0, urgency: form.urgency, protectedAmount: Number(form.protectedAmount) || 0, notes: form.notes, createdAt: edit?.createdAt ?? nowIso(), updatedAt: nowIso() });
    setShow(false); await reload();
  }
  return (
    <div>
      <div className="row-between"><h1 className="page-title">Mục tiêu</h1><button type="button" onClick={() => { setEdit(null); setShow(true); }}>+</button></div>
      {goals.map((g) => {
        const years = Math.max(0, parseDate(g.dueDate).getFullYear() - g.baseYear);
        const adj = g.mode === "purchasing_power" ? inflate(g.amount, g.inflationRate, years) : g.amount;
        return (
          <div className="card" key={g.id}>
            <div className="row-between"><strong>{g.name}</strong><span className="pill">{g.urgency === "hard" ? "Bắt buộc" : "Linh hoạt"}</span></div>
            <p className="muted">{formatDateVN(g.dueDate)}</p>
            <p>{formatMoney(g.amount)}{g.mode === "purchasing_power" && g.amount > 0 && <> → {formatMoney(adj)}</>}</p>
            <p className="muted">Bảo vệ: {formatMoney(g.protectedAmount)}</p>
            <button type="button" className="secondary" onClick={() => { setEdit(g); setForm({ name: g.name, dueDate: g.dueDate, amount: String(g.amount), mode: g.mode, baseYear: String(g.baseYear), inflationRate: String(g.inflationRate), bufferPct: String(g.bufferPct), urgency: g.urgency, protectedAmount: String(g.protectedAmount), notes: g.notes }); setShow(true); }}>Sửa</button>
            <button type="button" className="danger" style={{ marginLeft: 8 }} onClick={async () => { if (confirm("Xóa?")) { await deleteGoal(g.id); await reload(); } }}>Xóa</button>
          </div>
        );
      })}
      {show && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>{edit ? "Sửa" : "Thêm"}</h2>
            <div className="field"><label>Tên</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>Ngày</label><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
            <div className="field"><label>Số tiền</label><input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="field"><label>Chế độ</label><select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as GoalMode })}><option value="nominal">Danh nghĩa</option><option value="purchasing_power">Sức mua</option></select></div>
            <div className="field"><label>Đã bảo vệ</label><input value={form.protectedAmount} onChange={(e) => setForm({ ...form, protectedAmount: e.target.value })} /></div>
            <div className="stack"><button type="button" onClick={save}>Lưu</button><button type="button" className="secondary" onClick={() => setShow(false)}>Hủy</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
