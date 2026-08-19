import { useEffect, useMemo, useState } from "react";
import {
  deleteTransaction,
  listTransactions,
  listQuotes,
  uid,
  upsertInstrument,
  upsertTransaction,
} from "../lib/db";
import type { Quote, Transaction, TxType } from "../lib/types";
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
import { analyzeTransactions } from "../lib/transactionAnalytics";
import TradeRepublicPdfImport from "../components/TradeRepublicPdfImport";
import "../styles/demo-v10-transactions.css";

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

function monthKey(date: string) {
  return date.slice(0, 7);
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${m}/${y}`;
}

function iconClass(type: TxType): string {
  if (type === "buy_vwce" || type === "buy_security" || type === "cash_in" || type === "safe_interest") return "buy";
  if (type === "sell_vwce" || type === "sell_security" || type === "cash_out" || type === "tax" || type === "fee") return "out";
  return "div";
}

function iconGlyph(type: TxType): string {
  if (type === "buy_vwce" || type === "buy_security") return "↗";
  if (type === "sell_vwce" || type === "sell_security") return "↘";
  if (type === "cash_in" || type === "safe_interest") return "↑";
  if (type === "cash_out" || type === "tax" || type === "fee") return "↓";
  return "⇄";
}

export default function Transactions() {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [q, setQ] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | TxType>("all");
  const [qtyError, setQtyError] = useState("");
  const [isinError, setIsinError] = useState("");
  const { readOnly, showBlocked } = useRecoveryReadOnly();

  async function reload() {
    try {
      const [nextTransactions, nextQuotes] = await Promise.all([listTransactions(), listQuotes()]);
      setTxs(nextTransactions);
      setQuotes(nextQuotes);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    void reload();
  }, [loadAttempt]);

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

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of filtered) {
      const key = monthKey(tx.date);
      const list = map.get(key) ?? [];
      list.push(tx);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const analysis = useMemo(() => analyzeTransactions(txs, quotes), [txs, quotes]);
  const analysisIsEmpty = analysis.openPositions === 0 && analysis.buyCount === 0;

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
    if (readOnly) {
      showBlocked();
      return;
    }
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
    if (readOnly) {
      showBlocked();
      return;
    }
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

  function openCreate() {
    if (readOnly) {
      showBlocked();
      return;
    }
    setEditId(null);
    setForm(emptyForm());
    setShow(true);
  }

  if (loading) {
    return <main className="demo-v10-screen" role="status" aria-label="Đang tải Giao dịch" aria-busy="true" />;
  }

  if (loadError) {
    return (
      <main className="demo-v10-screen">
        <section className="demo-v10-gl" style={{ padding: 18 }} role="alert">
          <h1 className="s-title">Không tải được Giao dịch</h1>
          <p style={{ color: "var(--demo-dim)", fontSize: 13 }}>Dữ liệu trên thiết bị vẫn được giữ nguyên.</p>
          <button type="button" className="add-btn" onClick={() => setLoadAttempt((a) => a + 1)}>
            Thử lại
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="demo-v10-screen" aria-label="Giao dịch">
      <div className="tx-wrap">
      <div className="s-head">
        <h1 className="s-title">Giao dịch</h1>
        <button type="button" className="add-btn" onClick={openCreate}>
          + Thêm
        </button>
      </div>

      <div className="sum3">
        <div className="gl sum-c">
          <div className="sum-lbl">Tổng góp</div>
          <div className="sum-val">{formatMoney(analysis.contributed)}</div>
        </div>
        <div className="gl sum-c">
          <div className="sum-lbl">Lãi / lỗ</div>
          <div className={`sum-val${analysis.totalPnl == null ? "" : analysis.totalPnl >= 0 ? " pos" : " neg"}`}>{analysis.totalPnl == null ? "—" : formatMoney(analysis.totalPnl)}</div>
        </div>
        <div className="gl sum-c">
          <div className="sum-lbl">Số lần mua</div>
          <div className="sum-val">{analysis.buyCount}</div>
        </div>
      </div>

      <section className="gl tx-analysis" aria-label="Phân tích giao dịch">
        <div className="tx-analysis-head">
          <div>
            <div className="sum-lbl">Phân tích từ sổ giao dịch</div>
            <strong>{analysis.openPositions} vị thế đang mở</strong>
          </div>
          <span className={analysisIsEmpty ? "analysis-state neutral" : analysis.totalPnl == null ? "analysis-state warn" : "analysis-state ok"}>
            {analysisIsEmpty ? "Chưa có vị thế" : analysis.totalPnl == null ? "Chưa đủ dữ liệu giá" : "Đã định giá"}
          </span>
        </div>
        <div className="tx-analysis-grid">
          <div><span>Giá trị chứng khoán</span><strong>{analysis.holdingsValue == null ? "—" : formatMoney(analysis.holdingsValue)}</strong></div>
          <div><span>Lãi / lỗ đã chốt</span><strong className={analysis.realizedPnl >= 0 ? "pos" : "neg"}>{formatMoney(analysis.realizedPnl)}</strong></div>
          <div><span>Lãi / lỗ tạm tính</span><strong className={analysis.unrealizedPnl == null ? "" : analysis.unrealizedPnl >= 0 ? "pos" : "neg"}>{analysis.unrealizedPnl == null ? "—" : formatMoney(analysis.unrealizedPnl)}</strong></div>
          <div><span>Phí & thuế</span><strong>{formatMoney(analysis.feesAndTax)}</strong></div>
        </div>
        {analysis.missingQuotes.length || analysis.incompleteLots.length ? (
          <p className="tx-analysis-note">Không suy ra lợi nhuận tổng khi {analysis.missingQuotes.length ? `thiếu giá cho ${analysis.missingQuotes.join(", ")}` : "thiếu dữ liệu số lượng mua/bán"}. Thêm giá hoặc hoàn thiện giao dịch để định giá chính xác.</p>
        ) : null}
      </section>

      <div className="tx-tools">
        <button type="button" onClick={() => setToolsOpen((v) => !v)}>
          {toolsOpen ? "Ẩn công cụ" : "Lọc / PDF"}
        </button>
      </div>

      {toolsOpen ? (
        <section className="demo-v10-gl" style={{ padding: 12 }}>
          {!readOnly ? <TradeRepublicPdfImport transactions={txs} onTransactionImported={reload} /> : null}
          <div className="field" style={{ marginTop: 8 }}>
            <label htmlFor="tx-search">Tìm</label>
            <input id="tx-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ghi chú, loại, ISIN…" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="field">
              <label htmlFor="tx-year">Năm</label>
              <select id="tx-year" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
                <option value="all">Tất cả</option>
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
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
                {TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>
      ) : null}

      {!filtered.length ? (
        <section className="demo-v10-gl" style={{ padding: 18 }}>
          <p style={{ color: "var(--demo-dim)", margin: 0 }}>
            {txs.length === 0 ? "Chưa có giao dịch." : "Không có giao dịch khớp bộ lọc."}
          </p>
          {txs.length === 0 ? (
            <button type="button" className="add-btn" style={{ marginTop: 12 }} onClick={openCreate}>
              Thêm giao dịch đầu tiên
            </button>
          ) : null}
        </section>
      ) : (
        groups.map(([key, list]) => (
          <div key={key}>
            <div className="mo-lbl">{monthLabel(key)}</div>
            <section className="gl tx-card">
              {list.map((tx) => {
                const meta = TYPES.find((t) => t.value === tx.type);
                const sign = meta?.sign ?? "~";
                const isin = resolveInstrumentIsin(tx);
                return (
                  <button
                    type="button"
                    key={tx.id}
                    className="tx-item"
                    onClick={() => openEdit(tx)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      void (async () => {
                        if (readOnly) {
                          showBlocked();
                          return;
                        }
                        if (!confirm("Xóa giao dịch này?")) return;
                        await deleteTransaction(tx.id);
                        await reload();
                      })();
                    }}
                  >
                    <span className={`tx-ico ${iconClass(tx.type)}`} aria-hidden>
                      {iconGlyph(tx.type)}
                    </span>
                    <span className="tx-b">
                      <span className="tx-name">{meta?.label ?? tx.type}</span>
                      <span className="tx-meta">
                        {formatDateVN(tx.date)}
                        {isin ? ` · ${isin}` : ""}
                        {tx.notes ? ` · ${tx.notes}` : ""}
                      </span>
                    </span>
                    <span className="tx-r">
                      <span
                        className={
                          "tx-amt" +
                          (sign === "+" ? " pos" : sign === "-" ? " neg" : "")
                        }
                      >
                        {sign === "-" ? "−" : sign === "+" ? "+" : ""}
                        {formatMoney(tx.amount)}
                      </span>
                      {tx.quantity != null ? (
                        <span className="tx-sec">SL {tx.quantity.toFixed(4)}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </section>
          </div>
        ))
      )}

      {show ? (
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
              <select
                id="f-type"
                value={form.type}
                onChange={(e) => {
                  const type = e.target.value as TxType;
                  setForm({
                    ...form,
                    type,
                    instrumentIsin: type === "buy_vwce" || type === "sell_vwce" ? VWCE_ISIN : form.instrumentIsin,
                  });
                }}
              >
                {TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            {security ? (
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
                {isinError ? <p style={{ color: "var(--color-danger)", fontSize: 13 }}>{isinError}</p> : null}
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="f-amt">{security ? "Tổng tiền thanh toán" : "Số tiền"}</label>
              <input id="f-amt" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            {security ? (
              <>
                <div className="field">
                  <label htmlFor="f-price">Giá một đơn vị</label>
                  <input id="f-price" inputMode="decimal" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="f-qty">{isSecuritySell(form.type) ? "Số lượng (bắt buộc khi bán)" : "Số lượng (để trống = tự tính)"}</label>
                  <input
                    id="f-qty"
                    inputMode="decimal"
                    value={form.quantity}
                    onChange={(e) => {
                      setQtyError("");
                      setForm({ ...form, quantity: e.target.value });
                    }}
                    placeholder={!isSecuritySell(form.type) && autoQty ? autoQty.toFixed(4) : ""}
                  />
                  {qtyError ? <p style={{ color: "var(--color-danger)", fontSize: 13 }}>{qtyError}</p> : null}
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
              </>
            ) : null}
            <div className="field">
              <label htmlFor="f-notes">Ghi chú{form.type === "adjust" ? " (bắt buộc)" : ""}</label>
              <textarea id="f-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="stack">
              <button type="button" onClick={() => void save()}>Lưu</button>
              <button type="button" className="secondary" onClick={() => setShow(false)}>Hủy</button>
              {editId ? (
                <button
                  type="button"
                  className="danger"
                  onClick={() =>
                    void (async () => {
                      if (readOnly) {
                        showBlocked();
                        return;
                      }
                      if (!confirm("Xóa giao dịch này?")) return;
                      await deleteTransaction(editId);
                      setShow(false);
                      await reload();
                    })()
                  }
                >
                  Xóa
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </main>
  );
}
