import { useEffect, useMemo, useState } from "react";
import {
  deleteTransaction,
  listTransactions,
  uid,
  upsertInstrument,
  upsertTransaction,
} from "../lib/db";
import type { Transaction, TxType } from "../lib/types";
import { VWCE_ISIN } from "../lib/types";
import { calcQuantity, formatDateVN, formatMoney, parseDecimal } from "../lib/calc";
import { nowIso } from "../lib/defaults";
import {
  isSecuritySell,
  isSecurityTx,
  isValidIsin,
  normalizeIsin,
  resolveInstrumentIsin,
} from "../lib/instrument";
import { useRecoveryReadOnly } from "../lib/recoveryReadOnly";
import ActionMenu from "../components/ActionMenu";
import { IconPlus } from "../components/Icons";
import TradeRepublicPdfImport from "../components/TradeRepublicPdfImport";

const TYPES: { value: TxType; label: string; sign: "+" | "-" | "~" }[] = [
  { value: "buy_vwce", label: "Mua VWCE", sign: "~" },
  { value: "sell_vwce", label: "Bán VWCE", sign: "~" },
  { value: "buy_security", label: "Mua chứng khoán khác", sign: "~" },
  { value: "sell_security", label: "Bán chứng khoán khác", sign: "~" },
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
  instrumentIsin: VWCE_ISIN,
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
  const [qtyError, setQtyError] = useState("");
  const [isinError, setIsinError] = useState("");
  const { readOnly, showBlocked } = useRecoveryReadOnly();

  async function reload() {
    setTxs(await listTransactions());
  }

  useEffect(() => {
    void reload();
  }, []);

  const years = useMemo(() => {
    const values = new Set(txs.map((tx) => tx.date.slice(0, 4)));
    return [...values].sort().reverse();
  }, [txs]);

  const filtered = useMemo(
    () =>
      txs.filter((tx) => {
        if (yearFilter !== "all" && !tx.date.startsWith(yearFilter)) return false;
        if (typeFilter !== "all" && tx.type !== typeFilter) return false;
        const searchable = `${tx.notes} ${tx.type} ${tx.amount} ${resolveInstrumentIsin(tx)}`.toLowerCase();
        return !q || searchable.includes(q.toLowerCase());
      }),
    [txs, q, yearFilter, typeFilter],
  );

  const amount = parseDecimal(form.amount);
  const unitPrice = parseDecimal(form.unitPrice);
  const fee = parseDecimal(form.fee);
  const tax = parseDecimal(form.tax);
  const security = isSecurityTx(form.type);
  const autoQty = security
    ? form.quantity
      ? parseDecimal(form.quantity)
      : unitPrice > 0
        ? calcQuantity(amount, unitPrice, fee, tax)
        : 0
    : 0;

  async function save() {
    if (readOnly) { showBlocked(); return; }
    setQtyError("");
    setIsinError("");
    if (!form.date || !form.amount.trim()) {
      alert("Ngày và số tiền bắt buộc");
      return;
    }
    if (form.type === "adjust" && !form.notes.trim()) {
      alert("Điều chỉnh bắt buộc có ghi chú");
      return;
    }

    let instrumentIsin: string | undefined;
    if (security) {
      instrumentIsin =
        form.type === "buy_vwce" || form.type === "sell_vwce"
          ? VWCE_ISIN
          : normalizeIsin(form.instrumentIsin);
      if (!isValidIsin(instrumentIsin)) {
        setIsinError("ISIN không hợp lệ hoặc sai checksum.");
        return;
      }
      if (isSecuritySell(form.type)) {
        const quantity = parseDecimal(form.quantity);
        if (!form.quantity.trim() || quantity <= 0) {
          setQtyError("Giao dịch bán cần số lượng chứng khoán.");
          return;
        }
      }
      if (unitPrice <= 0 && !form.quantity.trim()) {
        alert("Cần giá hoặc số lượng");
        return;
      }
    }

    let quantity: number | undefined = form.quantity ? parseDecimal(form.quantity) : undefined;
    if (security && unitPrice > 0 && !form.quantity) {
      quantity = calcQuantity(amount, unitPrice, fee, tax);
    }
    if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) {
      alert("Số lượng không hợp lệ");
      return;
    }

    const previous = editId ? txs.find((tx) => tx.id === editId) : undefined;
    const t = nowIso();
    if (security && instrumentIsin && instrumentIsin !== VWCE_ISIN) {
      await upsertInstrument({
        isin: instrumentIsin,
        name: instrumentIsin,
        currency: "EUR",
        createdAt: t,
        updatedAt: t,
      });
    }
    await upsertTransaction({
      id: editId ?? uid("tx"),
      date: form.date,
      type: form.type,
      amount,
      unitPrice: security ? unitPrice || undefined : undefined,
      quantity: security ? quantity : undefined,
      fee: security ? fee : undefined,
      tax: security ? tax : undefined,
      instrumentIsin,
      notes: form.notes,
      createdAt: previous?.createdAt ?? t,
      updatedAt: t,
      source: previous?.source ?? "manual",
      sourceVersion: previous?.sourceVersion,
      externalRef: previous?.externalRef,
    });
    setShow(false);
    setForm(emptyForm());
    setEditId(null);
    await reload();
  }

  function openEdit(tx: Transaction) {
    if (readOnly) { showBlocked(); return; }
    setEditId(tx.id);
    setForm({
      date: tx.date,
      type: tx.type,
      instrumentIsin: resolveInstrumentIsin(tx) || VWCE_ISIN,
      amount: String(tx.amount),
      unitPrice: String(tx.unitPrice ?? ""),
      quantity: String(tx.quantity ?? ""),
      fee: String(tx.fee ?? 0),
      tax: String(tx.tax ?? 0),
      notes: tx.notes,
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
            if (readOnly) { showBlocked(); return; }
            setEditId(null);
            setForm(emptyForm());
            setShow(true);
          }}
        >
          <IconPlus />
        </button>
      </div>

      {readOnly ? null : (
        <TradeRepublicPdfImport transactions={txs} onTransactionImported={reload} />
      )}

      <button
        type="button"
        className="callout-toggle"
        onClick={() => setRulesOpen((value) => !value)}
        aria-expanded={rulesOpen}
      >
        Quy ước dòng tiền {rulesOpen ? "▴" : "▾"}
      </button>
      {rulesOpen && (
        <div className="banner info">
          <strong>Nạp cash</strong> mới tăng vốn đóng. <strong>Mua chứng khoán</strong> chỉ chuyển cash → chứng khoán, không đếm vốn lần hai. Sao kê Depot chỉ đối chiếu và không tạo giao dịch.
        </div>
      )}

      <div className="field">
        <label htmlFor="tx-search">Tìm</label>
        <input id="tx-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ghi chú, loại, ISIN…" />
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="tx-year">Năm</label>
          <select id="tx-year" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            <option value="all">Tất cả</option>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tx-type">Loại</label>
          <select id="tx-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "all" | TxType)}>
            <option value="all">Tất cả</option>
            {TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </div>
      </div>
      {(yearFilter !== "all" || typeFilter !== "all" || q) && (
        <button type="button" className="secondary" style={{ marginBottom: 12, width: "100%" }} onClick={() => {
          setYearFilter("all");
          setTypeFilter("all");
          setQ("");
        }}>
          Xóa bộ lọc
        </button>
      )}

      {!filtered.length ? (
        <div className="empty card">
          <p>Chưa có giao dịch.</p>
          <button type="button" onClick={() => {
            if (readOnly) { showBlocked(); return; }
            setEditId(null);
            setForm(emptyForm());
            setShow(true);
          }}>
            Thêm giao dịch đầu tiên
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: "0.25rem 0.75rem" }}>
          {filtered.map((tx) => {
            const meta = TYPES.find((type) => type.value === tx.type);
            const sign = meta?.sign ?? "~";
            const amountClass = sign === "+" ? "positive" : sign === "-" ? "negative" : "";
            const isin = resolveInstrumentIsin(tx);
            return (
              <div className="tx-row" key={tx.id}>
                <div className="tx-icon" aria-hidden>{sign === "+" ? "↑" : sign === "-" ? "↓" : "⇄"}</div>
                <div className="tx-body">
                  <div className="row-between">
                    <strong>{meta?.label ?? tx.type}</strong>
                    <span className={`metric-value ${amountClass}`} style={{ fontSize: "1rem" }}>
                      {sign === "-" ? "−" : sign === "+" ? "+" : ""}{formatMoney(tx.amount)}
                    </span>
                  </div>
                  <div className="row-between">
                    <span className="muted">
                      {formatDateVN(tx.date)}
                      {isin ? ` · ${isin}` : ""}
                      {tx.source === "trade_republic_pdf" ? " · TR PDF" : ""}
                      {tx.notes ? ` · ${tx.notes}` : ""}
                      {tx.quantity != null ? ` · SL ${tx.quantity.toFixed(4)}` : ""}
                    </span>
                    <ActionMenu actions={[
                      { label: "Sửa", onClick: () => openEdit(tx) },
                      {
                        label: "Xóa",
                        danger: true,
                        onClick: async () => {
                          if (readOnly) { showBlocked(); return; }
                          if (!confirm("Xóa giao dịch này?")) return;
                          await deleteTransaction(tx.id);
                          await reload();
                        },
                      },
                    ]} />
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
              <input id="f-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="f-type">Loại</label>
              <select id="f-type" value={form.type} onChange={(e) => {
                const type = e.target.value as TxType;
                setForm({
                  ...form,
                  type,
                  instrumentIsin: type === "buy_vwce" || type === "sell_vwce" ? VWCE_ISIN : form.instrumentIsin,
                });
              }}>
                {TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </div>
            {security && (
              <div className="field">
                <label htmlFor="f-isin">ISIN</label>
                <input
                  id="f-isin"
                  value={form.type === "buy_vwce" || form.type === "sell_vwce" ? VWCE_ISIN : form.instrumentIsin}
                  readOnly={form.type === "buy_vwce" || form.type === "sell_vwce"}
                  onChange={(e) => {
                    setIsinError("");
                    setForm({ ...form, instrumentIsin: e.target.value.toUpperCase() });
                  }}
                />
                {isinError && <p style={{ color: "var(--color-danger)", fontSize: 13 }}>{isinError}</p>}
              </div>
            )}
            <div className="field">
              <label htmlFor="f-amt">{security ? "Tổng tiền thanh toán" : "Số tiền"}</label>
              <input id="f-amt" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            {security && (
              <>
                <div className="field">
                  <label htmlFor="f-price">Giá một đơn vị</label>
                  <input id="f-price" inputMode="decimal" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="f-qty">{isSecuritySell(form.type) ? "Số lượng (bắt buộc khi bán)" : "Số lượng (để trống = tự tính)"}</label>
                  <input id="f-qty" inputMode="decimal" value={form.quantity} onChange={(e) => {
                    setQtyError("");
                    setForm({ ...form, quantity: e.target.value });
                  }} placeholder={!isSecuritySell(form.type) && autoQty ? autoQty.toFixed(4) : ""} />
                  {qtyError && <p style={{ color: "var(--color-danger)", fontSize: 13 }}>{qtyError}</p>}
                </div>
                <div className="grid2">
                  <div className="field">
                    <label htmlFor="f-fee">Phí</label>
                    <input id="f-fee" inputMode="decimal" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="f-tax">Thuế</label>
                    <input id="f-tax" inputMode="decimal" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} />
                  </div>
                </div>
                {unitPrice > 0 && amount > 0 && (
                  <div className="banner info">Preview: SL ≈ {autoQty.toFixed(4)} · CK ≈ {formatMoney(Math.max(0, amount - fee - tax))}</div>
                )}
              </>
            )}
            <div className="field">
              <label htmlFor="f-notes">Ghi chú{form.type === "adjust" ? " (bắt buộc)" : ""}</label>
              <textarea id="f-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="stack">
              <button type="button" onClick={() => void save()}>Lưu</button>
              <button type="button" className="secondary" onClick={() => setShow(false)}>Hủy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
