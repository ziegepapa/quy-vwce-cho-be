import { useEffect, useMemo, useState } from "react";
import { deleteTransaction, listTransactions, uid, upsertTransaction } from "../lib/db";
import type { Transaction, TxType } from "../lib/types";
import { calcQuantity, formatDateVN, formatMoney } from "../lib/calc";
import { nowIso } from "../lib/defaults";

const TYPES: { value: TxType; label: string }[] = [
  { value: "buy_vwce", label: "Mua VWCE" },
  { value: "sell_vwce", label: "Bán VWCE" },
  { value: "cash_in", label: "Nạp cash" },
  { value: "cash_out", label: "Rút cash" },
  { value: "tax", label: "Thuế" },
  { value: "fee", label: "Phí" },
  { value: "safe_interest", label: "Lãi an toàn" },
  { value: "adjust", label: "Điều chỉnh" },
];

const emptyForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  type: "cash_in" as TxType,
  amount: "",
  unitPrice: "",
  quantity: "",
  fee: "0",
  tax: "0",
  notes: "",
});

export default function Transactions() {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | TxType>("all");

  async function reload() {
    setTxs(await listTransactions());
  }
  useEffect(() => {
    reload();
  }, []);

  const years = useMemo(() => {
    const set = new Set(txs.map((t) => t.date.slice(0, 4)));
    return [...set].sort().reverse();
  }, [txs]);

  const filtered = useMemo(() => {
    return txs.filter((t) => {
      if (yearFilter !== "all" && !t.date.startsWith(yearFilter)) return false;
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (q && !`${t.notes} ${t.type} ${t.amount}`.toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });
  }, [txs, q, yearFilter, typeFilter]);

  const amount = Number(form.amount) || 0;
  const unitPrice = form.unitPrice ? Number(form.unitPrice) : 0;
  const fee = Number(form.fee) || 0;
  const tax = Number(form.tax) || 0;
  const autoQty =
    form.type === "buy_vwce" || form.type === "sell_vwce"
      ? form.quantity
        ? Number(form.quantity)
        : unitPrice > 0
          ? calcQuantity(amount, unitPrice, fee, tax)
          : 0
      : 0;

  async function save() {
    if (!form.date || !Number.isFinite(amount)) {
      alert("Ngày và số tiền bắt buộc");
      return;
    }
    if (form.type === "adjust" && !form.notes.trim()) {
      alert("Điều chỉnh bắt buộc có ghi chú");
      return;
    }
    if ((form.type === "buy_vwce" || form.type === "sell_vwce") && unitPrice <= 0 && !form.quantity) {
      alert("Cần giá hoặc số lượng");
      return;
    }
    let quantity: number | undefined =
      form.quantity ? Number(form.quantity) : undefined;
    if (
      (form.type === "buy_vwce" || form.type === "sell_vwce") &&
      unitPrice &&
      !form.quantity
    ) {
      quantity = calcQuantity(amount, unitPrice, fee, tax);
    }
    if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) {
      alert("Số lượng không hợp lệ");
      return;
    }
    await upsertTransaction({
      id: editId ?? uid("tx"),
      date: form.date,
      type: form.type,
      amount,
      unitPrice: unitPrice || undefined,
      quantity,
      fee,
      tax,
      notes: form.notes,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    setShow(false);
    setForm(emptyForm());
    setEditId(null);
    await reload();
  }

  return (
    <div>
      <div className="row-between">
        <h1 className="page-title">Giao dịch</h1>
        <button
          type="button"
          onClick={() => {
            setEditId(null);
            setForm(emptyForm());
            setShow(true);
          }}
        >
          +
        </button>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <p className="muted" style={{ fontSize: ".8rem", margin: 0 }}>
          Quy ước: <strong>Nạp cash</strong> mới tăng vốn đóng. <strong>Mua VWCE</strong> chỉ
          chuyển cash → chứng khoán (không đếm vốn lần 2). Bán VWCE đưa tiền về cash sau phí/thuế.
        </p>
      </div>

      <div className="field">
        <label>Tìm</label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ghi chú, loại…" />
      </div>
      <div className="grid2">
        <div className="field">
          <label>Năm</label>
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            <option value="all">Tất cả</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Loại</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "all" | TxType)}
          >
            <option value="all">Tất cả</option>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {(yearFilter !== "all" || typeFilter !== "all" || q) && (
        <button
          type="button"
          className="secondary"
          style={{ marginBottom: 12 }}
          onClick={() => {
            setYearFilter("all");
            setTypeFilter("all");
            setQ("");
          }}
        >
          Xóa bộ lọc
        </button>
      )}

      {!filtered.length ? (
        <div className="empty">Chưa có giao dịch.</div>
      ) : (
        filtered.map((t) => (
          <div className="card list-item" key={t.id} style={{ borderBottom: "none" }}>
            <div>
              <strong>{TYPES.find((x) => x.value === t.type)?.label}</strong>
              <div className="muted">{formatDateVN(t.date)}</div>
              {t.notes && <div className="muted">{t.notes}</div>}
              {t.quantity != null && (
                <div className="muted">
                  SL {t.quantity.toFixed(4)}
                  {t.unitPrice != null ? ` @ ${formatMoney(t.unitPrice)}` : ""}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div>{formatMoney(t.amount)}</div>
              <button
                type="button"
                className="secondary"
                style={{ minHeight: 36, marginTop: 4 }}
                onClick={() => {
                  setEditId(t.id);
                  setForm({
                    date: t.date,
                    type: t.type,
                    amount: String(t.amount),
                    unitPrice: String(t.unitPrice ?? ""),
                    quantity: String(t.quantity ?? ""),
                    fee: String(t.fee ?? 0),
                    tax: String(t.tax ?? 0),
                    notes: t.notes,
                  });
                  setShow(true);
                }}
              >
                Sửa
              </button>
              <button
                type="button"
                className="danger"
                style={{ minHeight: 36, marginLeft: 4 }}
                onClick={async () => {
                  if (confirm("Xóa giao dịch này?")) {
                    await deleteTransaction(t.id);
                    await reload();
                  }
                }}
              >
                Xóa
              </button>
            </div>
          </div>
        ))
      )}

      {show && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>{editId ? "Sửa" : "Thêm"} giao dịch</h2>
            <div className="field">
              <label>Ngày</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Loại</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as TxType })}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                {form.type === "buy_vwce" || form.type === "sell_vwce"
                  ? "Tổng tiền thanh toán"
                  : "Số tiền"}
              </label>
              <input
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            {(form.type === "buy_vwce" || form.type === "sell_vwce") && (
              <>
                <div className="field">
                  <label>Giá 1 VWCE</label>
                  <input
                    inputMode="decimal"
                    value={form.unitPrice}
                    onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Số lượng (để trống = tự tính)</label>
                  <input
                    inputMode="decimal"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    placeholder={autoQty ? autoQty.toFixed(4) : ""}
                  />
                </div>
                <div className="grid2">
                  <div className="field">
                    <label>Phí</label>
                    <input
                      inputMode="decimal"
                      value={form.fee}
                      onChange={(e) => setForm({ ...form, fee: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Thuế</label>
                    <input
                      inputMode="decimal"
                      value={form.tax}
                      onChange={(e) => setForm({ ...form, tax: e.target.value })}
                    />
                  </div>
                </div>
                {unitPrice > 0 && amount > 0 && (
                  <p className="muted" style={{ fontSize: ".8rem" }}>
                    Preview: SL ≈ {autoQty.toFixed(4)} · Giá trị CK ≈{" "}
                    {formatMoney(Math.max(0, amount - fee - tax))}
                  </p>
                )}
              </>
            )}
            <div className="field">
              <label>Ghi chú{form.type === "adjust" ? " (bắt buộc)" : ""}</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="stack">
              <button type="button" onClick={save}>
                Lưu
              </button>
              <button type="button" className="secondary" onClick={() => setShow(false)}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
