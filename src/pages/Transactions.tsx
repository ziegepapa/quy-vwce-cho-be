import { useEffect, useMemo, useState } from "react";
import { deleteTransaction, listTransactions, uid, upsertTransaction } from "../lib/db";
import type { Transaction, TxType } from "../lib/types";
import { calcQuantity, formatDateVN, formatMoney, parseDecimal } from "../lib/calc";
import { nowIso } from "../lib/defaults";
import ActionMenu from "../components/ActionMenu";
import { IconPlus } from "../components/Icons";

const TYPES: { value: TxType; label: string; sign: "+" | "-" | "~" }[] = [
  { value: "buy_vwce", label: "Mua VWCE", sign: "~" },
  { value: "sell_vwce", label: "Bán VWCE", sign: "~" },
  { value: "cash_in", label: "Nạp cash", sign: "+" },
  { value: "cash_out", label: "Rút cash", sign: "-" },
  { value: "tax", label: "Thuế", sign: "-" },
  { value: "fee", label: "Phí", sign: "-" },
  { value: "safe_interest", label: "Lãi an toàn", sign: "+" },
  { value: "adjust", label: "Điều chỉnh", sign: "~" },
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
  const [rulesOpen, setRulesOpen] = useState(false);

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

  const amount = parseDecimal(form.amount);
  const unitPrice = parseDecimal(form.unitPrice);
  const fee = parseDecimal(form.fee);
  const tax = parseDecimal(form.tax);
  const autoQty =
    form.type === "buy_vwce" || form.type === "sell_vwce"
      ? form.quantity
        ? parseDecimal(form.quantity)
        : unitPrice > 0
          ? calcQuantity(amount, unitPrice, fee, tax)
          : 0
      : 0;

  async function save() {
    if (!form.date || !form.amount.trim()) {
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
    let quantity: number | undefined = form.quantity ? parseDecimal(form.quantity) : undefined;
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

  function openEdit(t: Transaction) {
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
  }

  return (
    <div>
      <div className="row-between">
        <h1 className="page-title">Giao dịch</h1>
        <button
          type="button"
          className="fab"
          aria-label="Thêm giao dịch"
          onClick={() => {
            setEditId(null);
            setForm(emptyForm());
            setShow(true);
          }}
        >
          <IconPlus />
        </button>
      </div>

      <button
        type="button"
        className="callout-toggle"
        onClick={() => setRulesOpen((v) => !v)}
        aria-expanded={rulesOpen}
      >
        Quy ước dòng tiền {rulesOpen ? "▴" : "▾"}
      </button>
      {rulesOpen && (
        <div className="banner info">
          <strong>Nạp cash</strong> mới tăng vốn đóng. <strong>Mua VWCE</strong> chỉ chuyển cash →
          chứng khoán (không đếm vốn lần 2). Bán VWCE đưa tiền về cash sau phí/thuế.
        </div>
      )}

      <div className="field">
        <label htmlFor="tx-search">Tìm</label>
        <input
          id="tx-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ghi chú, loại…"
        />
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="tx-year">Năm</label>
          <select
            id="tx-year"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value="all">Tất cả</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tx-type">Loại</label>
          <select
            id="tx-type"
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
          style={{ marginBottom: 12, width: "100%" }}
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
        <div className="empty card">
          <p>Chưa có giao dịch.</p>
          <button
            type="button"
            onClick={() => {
              setEditId(null);
              setForm(emptyForm());
              setShow(true);
            }}
          >
            Thêm giao dịch đầu tiên
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: "0.25rem 0.75rem" }}>
          {filtered.map((t) => {
            const meta = TYPES.find((x) => x.value === t.type);
            const sign = meta?.sign ?? "~";
            const amountClass =
              sign === "+" ? "positive" : sign === "-" ? "negative" : "";
            return (
              <div className="tx-row" key={t.id}>
                <div className="tx-icon" aria-hidden>
                  {sign === "+" ? "↑" : sign === "-" ? "↓" : "⇄"}
                </div>
                <div className="tx-body">
                  <div className="row-between">
                    <strong>{meta?.label ?? t.type}</strong>
                    <span className={`metric-value ${amountClass}`} style={{ fontSize: "1rem" }}>
                      {sign === "-" ? "−" : sign === "+" ? "+" : ""}
                      {formatMoney(t.amount)}
                    </span>
                  </div>
                  <div className="row-between">
                    <span className="muted">
                      {formatDateVN(t.date)}
                      {t.notes ? ` · ${t.notes}` : ""}
                      {t.quantity != null ? ` · SL ${t.quantity.toFixed(4)}` : ""}
                    </span>
                    <ActionMenu
                      actions={[
                        { label: "Sửa", onClick: () => openEdit(t) },
                        {
                          label: "Xóa",
                          danger: true,
                          onClick: async () => {
                            if (confirm("Xóa giao dịch này?")) {
                              await deleteTransaction(t.id);
                              await reload();
                            }
                          },
                        },
                      ]}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {show && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="sheet-handle" aria-hidden />
            <h2>{editId ? "Sửa" : "Thêm"} giao dịch</h2>
            <div className="field">
              <label htmlFor="f-date">Ngày</label>
              <input
                id="f-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="f-type">Loại</label>
              <select
                id="f-type"
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
              <label htmlFor="f-amt">
                {form.type === "buy_vwce" || form.type === "sell_vwce"
                  ? "Tổng tiền thanh toán"
                  : "Số tiền"}
              </label>
              <input
                id="f-amt"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            {(form.type === "buy_vwce" || form.type === "sell_vwce") && (
              <>
                <div className="field">
                  <label htmlFor="f-price">Giá 1 VWCE</label>
                  <input
                    id="f-price"
                    inputMode="decimal"
                    value={form.unitPrice}
                    onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="f-qty">Số lượng (để trống = tự tính)</label>
                  <input
                    id="f-qty"
                    inputMode="decimal"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    placeholder={autoQty ? autoQty.toFixed(4) : ""}
                  />
                </div>
                <div className="grid2">
                  <div className="field">
                    <label htmlFor="f-fee">Phí</label>
                    <input
                      id="f-fee"
                      inputMode="decimal"
                      value={form.fee}
                      onChange={(e) => setForm({ ...form, fee: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="f-tax">Thuế</label>
                    <input
                      id="f-tax"
                      inputMode="decimal"
                      value={form.tax}
                      onChange={(e) => setForm({ ...form, tax: e.target.value })}
                    />
                  </div>
                </div>
                {unitPrice > 0 && amount > 0 && (
                  <div className="banner info">
                    Preview: SL ≈ {autoQty.toFixed(4)} · CK ≈{" "}
                    {formatMoney(Math.max(0, amount - fee - tax))}
                  </div>
                )}
              </>
            )}
            <div className="field">
              <label htmlFor="f-notes">Ghi chú{form.type === "adjust" ? " (bắt buộc)" : ""}</label>
              <textarea
                id="f-notes"
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
