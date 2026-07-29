import { useEffect, useMemo, useState } from "react";
import { deleteTransaction, listTransactions, uid, upsertTransaction } from "../lib/db";
import type { Transaction, TxType } from "../lib/types";
import { calcQuantity, formatDateVN, formatMoney } from "../lib/calc";
import { nowIso } from "../lib/defaults";

const TYPES: { value: TxType; label: string }[] = [
  { value: "buy_vwce", label: "Mua VWCE" }, { value: "sell_vwce", label: "Bán VWCE" },
  { value: "cash_in", label: "Nạp cash" }, { value: "cash_out", label: "Rút cash" },
  { value: "tax", label: "Thuế" }, { value: "fee", label: "Phí" },
  { value: "safe_interest", label: "Lãi an toàn" }, { value: "adjust", label: "Điều chỉnh" },
];

export default function Transactions() {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), type: "buy_vwce" as TxType, amount: "", unitPrice: "", quantity: "", fee: "0", tax: "0", notes: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function reload() { setTxs(await listTransactions()); }
  useEffect(() => { reload(); }, []);
  const filtered = useMemo(() => txs.filter((t) => !q || `${t.notes} ${t.type}`.toLowerCase().includes(q.toLowerCase())), [txs, q]);

  async function save() {
    const amount = Number(form.amount);
    if (!form.date || Number.isNaN(amount)) { alert("Ngày và số tiền bắt buộc"); return; }
    const unitPrice = form.unitPrice ? Number(form.unitPrice) : undefined;
    const fee = Number(form.fee) || 0, tax = Number(form.tax) || 0;
    let quantity = form.quantity ? Number(form.quantity) : undefined;
    if ((form.type === "buy_vwce" || form.type === "sell_vwce") && unitPrice && !form.quantity) quantity = calcQuantity(amount, unitPrice, fee, tax);
    await upsertTransaction({ id: editId ?? uid("tx"), date: form.date, type: form.type, amount, unitPrice, quantity, fee, tax, notes: form.notes, createdAt: nowIso(), updatedAt: nowIso() });
    setShow(false); await reload();
  }

  return (
    <div>
      <div className="row-between"><h1 className="page-title">Giao dịch</h1><button type="button" onClick={() => { setEditId(null); setShow(true); }}>+</button></div>
      <div className="field"><label>Tìm</label><input value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!filtered.length ? <div className="empty">Chưa có giao dịch.</div> : filtered.map((t) => (
        <div className="card list-item" key={t.id} style={{ borderBottom: "none" }}>
          <div><strong>{TYPES.find((x) => x.value === t.type)?.label}</strong><div className="muted">{formatDateVN(t.date)}</div></div>
          <div style={{ textAlign: "right" }}>
            <div>{formatMoney(t.amount)}</div>
            <button type="button" className="secondary" style={{ minHeight: 36, marginTop: 4 }} onClick={() => { setEditId(t.id); setForm({ date: t.date, type: t.type, amount: String(t.amount), unitPrice: String(t.unitPrice ?? ""), quantity: String(t.quantity ?? ""), fee: String(t.fee ?? 0), tax: String(t.tax ?? 0), notes: t.notes }); setShow(true); }}>Sửa</button>
            <button type="button" className="danger" style={{ minHeight: 36, marginLeft: 4 }} onClick={async () => { if (confirm("Xóa?")) { await deleteTransaction(t.id); await reload(); } }}>Xóa</button>
          </div>
        </div>
      ))}
      {show && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>{editId ? "Sửa" : "Thêm"}</h2>
            <div className="field"><label>Ngày</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="field"><label>Loại</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TxType })}>{TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            <div className="field"><label>Số tiền</label><input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            {(form.type === "buy_vwce" || form.type === "sell_vwce") && (
              <><div className="field"><label>Giá</label><input value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} /></div>
              <div className="field"><label>Số lượng</label><input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div></>
            )}
            <div className="field"><label>Ghi chú</label><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="stack"><button type="button" onClick={save}>Lưu</button><button type="button" className="secondary" onClick={() => setShow(false)}>Hủy</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
