import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteDepotStatement,
  findDepotStatementByStatementId,
  findTransactionByExternalRef,
  listDepotStatements,
  saveDepotStatement,
  uid,
  upsertInstrument,
  upsertTransaction,
} from "../lib/db";
import type { DepotStatement, Transaction } from "../lib/types";
import { VWCE_ISIN } from "../lib/types";
import { formatDateVN, parseDecimal } from "../lib/calc";
import { nowIso } from "../lib/defaults";
import { normalizeIsin } from "../lib/instrument";
import { parseTrDocumentPdf } from "../lib/tr/readPdf";
import {
  reconcileDepotStatement,
  reconciliationStatusLabel,
  type ParsedDepotStatement,
} from "../lib/tr/depotStatement";
import {
  draftToTransaction,
  trExecutionToDraft,
  validateTrImportDraft,
  type TrImportDraft,
} from "../lib/tr/toTransaction";
import ActionMenu from "./ActionMenu";

type Props = {
  transactions: Transaction[];
  onTransactionImported: () => Promise<void>;
};

function fmtDec(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(value).replace(".", ",");
}

function fmtQuantity(value: number): string {
  return value.toLocaleString("de-DE", { maximumFractionDigits: 6 });
}

function fmtMoney(value: number | undefined, currency: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function statusClass(status: string): "green" | "yellow" | "red" {
  if (status === "match") return "green";
  if (status === "difference") return "yellow";
  return "red";
}

export default function TradeRepublicPdfImport({ transactions, onTransactionImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [invoiceDraft, setInvoiceDraft] = useState<TrImportDraft | null>(null);
  const [depotDraft, setDepotDraft] = useState<ParsedDepotStatement | null>(null);
  const [depots, setDepots] = useState<DepotStatement[]>([]);
  const [invoiceForm, setInvoiceForm] = useState({
    date: "",
    amount: "",
    unitPrice: "",
    quantity: "",
    fee: "",
    tax: "",
    notes: "",
  });

  async function reloadDepots() {
    setDepots(await listDepotStatements());
  }

  useEffect(() => {
    void reloadDepots();
  }, []);

  function resetDrafts() {
    setInvoiceDraft(null);
    setDepotDraft(null);
    setWarnings([]);
    setError("");
  }

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 4500);
  }

  async function onPdfPicked(file: File | null) {
    if (!file) return;
    resetDrafts();
    setReading(true);
    try {
      const result = await parseTrDocumentPdf(file);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setWarnings(result.warnings);
      if (result.kind === "execution_invoice") {
        const draft = trExecutionToDraft(result.value, 0);
        setInvoiceDraft(draft);
        setInvoiceForm({
          date: draft.date,
          amount: fmtDec(draft.amount),
          unitPrice: fmtDec(draft.unitPrice),
          quantity: fmtDec(draft.quantity),
          fee: fmtDec(draft.fee),
          tax: fmtDec(draft.tax),
          notes: draft.notes,
        });
      } else {
        setDepotDraft(result.value);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không đọc được tệp PDF.");
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function currentInvoiceDraft(): TrImportDraft | null {
    if (!invoiceDraft) return null;
    return {
      ...invoiceDraft,
      date: invoiceForm.date,
      amount: parseDecimal(invoiceForm.amount),
      unitPrice: parseDecimal(invoiceForm.unitPrice),
      quantity: parseDecimal(invoiceForm.quantity),
      fee: parseDecimal(invoiceForm.fee),
      tax: parseDecimal(invoiceForm.tax),
      notes: invoiceForm.notes,
    };
  }

  async function confirmInvoiceImport() {
    const draft = currentInvoiceDraft();
    if (!draft) return;
    const validation = validateTrImportDraft(draft);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    if (await findTransactionByExternalRef(draft.externalRef!)) {
      setError("Hóa đơn này đã được nhập trước đó.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const t = nowIso();
      const isin = normalizeIsin(draft.isin);
      if (isin !== VWCE_ISIN) {
        await upsertInstrument({
          isin,
          name: isin,
          currency: "EUR",
          createdAt: t,
          updatedAt: t,
        });
      }
      if (await findTransactionByExternalRef(draft.externalRef!)) {
        throw new Error("Hóa đơn này đã được nhập trước đó.");
      }
      await upsertTransaction(
        draftToTransaction(draft, { id: uid("tx"), createdAt: t, updatedAt: t }),
      );
      resetDrafts();
      flash("Đã nhập hóa đơn Trade Republic.");
      await onTransactionImported();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không lưu được hóa đơn.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDepotImport() {
    if (!depotDraft) return;
    if (await findDepotStatementByStatementId(depotDraft.statementId)) {
      setError("Sao kê này đã được nhập trước đó.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const t = nowIso();
      await saveDepotStatement({
        id: uid("depot"),
        ...depotDraft,
        broker: "trade_republic",
        source: "trade_republic_pdf",
        sourceVersion: 1,
        createdAt: t,
        updatedAt: t,
      });
      resetDrafts();
      flash("Đã lưu sao kê để đối chiếu; không tạo giao dịch.");
      await reloadDepots();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không lưu được sao kê.");
    } finally {
      setSaving(false);
    }
  }

  const previewRows = useMemo(
    () => (depotDraft ? reconcileDepotStatement(depotDraft, transactions) : []),
    [depotDraft, transactions],
  );

  return (
    <section style={{ marginBottom: 12 }} aria-label="Nhập PDF Trade Republic">
      <button
        type="button"
        className="secondary"
        style={{ width: "100%" }}
        disabled={reading}
        onClick={() => inputRef.current?.click()}
      >
        {reading ? "Đang đọc và phân loại PDF…" : "Nhập hóa đơn hoặc sao kê Depot"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: "none" }}
        onChange={(event) => void onPdfPicked(event.target.files?.[0] ?? null)}
      />

      {error && !invoiceDraft && !depotDraft && (
        <div className="banner error" role="alert" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
      {toast && (
        <div className="banner success" role="status" style={{ marginTop: 8 }}>
          {toast}
        </div>
      )}

      {depots.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h2 className="section-title">Đối chiếu Depot</h2>
          {depots.map((statement) => {
            const rows = reconcileDepotStatement(statement, transactions);
            const allMatch = rows.length > 0 && rows.every((row) => row.status === "match");
            return (
              <div className="card" key={statement.id}>
                <div className="row-between">
                  <div>
                    <strong>{formatDateVN(statement.date)}</strong>
                    <div className="muted">{statement.statementId}</div>
                  </div>
                  <div className="row-between">
                    <span className={`pill ${allMatch ? "green" : "yellow"}`}>
                      {allMatch ? "Khớp hoàn toàn" : "Cần kiểm tra"}
                    </span>
                    <ActionMenu
                      actions={[
                        {
                          label: "Xóa sao kê",
                          danger: true,
                          onClick: async () => {
                            if (!confirm("Xóa sao kê này khỏi danh sách đối chiếu?")) return;
                            await deleteDepotStatement(statement.id);
                            await reloadDepots();
                          },
                        },
                      ]}
                    />
                  </div>
                </div>
                <details style={{ marginTop: 10 }}>
                  <summary>Xem {rows.length} kết quả theo ISIN</summary>
                  <div className="stack" style={{ marginTop: 10 }}>
                    {rows.map((row) => (
                      <div key={row.instrumentIsin} className="row-between">
                        <div>
                          <code>{row.instrumentIsin}</code>
                          <div className="muted">
                            App {fmtQuantity(row.bookQuantity)} · Depot {fmtQuantity(row.statementQuantity)}
                          </div>
                        </div>
                        <span className={`pill ${statusClass(row.status)}`}>
                          {reconciliationStatusLabel(row.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}

      {invoiceDraft && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Xem trước hóa đơn Trade Republic">
          <div className="modal">
            <div className="sheet-handle" aria-hidden />
            <h2>Nhập hóa đơn giao dịch</h2>
            {warnings.map((warning) => (
              <div className="banner info" key={warning}>{warning}</div>
            ))}
            {error && <div className="banner error" role="alert">{error}</div>}
            {invoiceDraft.isin !== VWCE_ISIN && (
              <div className="banner info">
                Đây là tài sản ngoài VWCE. Ứng dụng sẽ giữ nguyên ISIN và lưu dưới loại giao dịch đa tài sản.
              </div>
            )}
            <div className="field">
              <label>Loại</label>
              <input
                readOnly
                value={invoiceDraft.type.startsWith("sell") ? "Bán chứng khoán" : "Mua chứng khoán"}
              />
            </div>
            <div className="field">
              <label htmlFor="pdf-date">Ngày</label>
              <input id="pdf-date" type="date" value={invoiceForm.date} onChange={(e) => setInvoiceForm({ ...invoiceForm, date: e.target.value })} />
            </div>
            <div className="field">
              <label>ISIN</label>
              <input readOnly value={invoiceDraft.isin} />
            </div>
            <div className="grid2">
              <div className="field">
                <label htmlFor="pdf-qty">Số lượng</label>
                <input id="pdf-qty" inputMode="decimal" value={invoiceForm.quantity} onChange={(e) => setInvoiceForm({ ...invoiceForm, quantity: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="pdf-price">Giá một đơn vị</label>
                <input id="pdf-price" inputMode="decimal" value={invoiceForm.unitPrice} onChange={(e) => setInvoiceForm({ ...invoiceForm, unitPrice: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="pdf-amount">Tổng tiền</label>
              <input id="pdf-amount" inputMode="decimal" value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} />
            </div>
            <div className="grid2">
              <div className="field">
                <label htmlFor="pdf-fee">Phí</label>
                <input id="pdf-fee" inputMode="decimal" value={invoiceForm.fee} onChange={(e) => setInvoiceForm({ ...invoiceForm, fee: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="pdf-tax">Thuế</label>
                <input id="pdf-tax" inputMode="decimal" value={invoiceForm.tax} onChange={(e) => setInvoiceForm({ ...invoiceForm, tax: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Số hóa đơn</label>
              <input readOnly value={invoiceDraft.docNumber || "—"} />
            </div>
            <div className="field">
              <label htmlFor="pdf-notes">Ghi chú</label>
              <textarea id="pdf-notes" rows={2} value={invoiceForm.notes} onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} />
            </div>
            <div className="stack">
              <button type="button" disabled={saving || !invoiceDraft.docNumber.trim()} onClick={() => void confirmInvoiceImport()}>
                {saving ? "Đang lưu…" : "Xác nhận lưu giao dịch"}
              </button>
              <button type="button" className="secondary" disabled={saving} onClick={resetDrafts}>Hủy</button>
            </div>
          </div>
        </div>
      )}

      {depotDraft && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Xem trước sao kê Depot">
          <div className="modal">
            <div className="sheet-handle" aria-hidden />
            <h2>Đối chiếu sao kê Depot</h2>
            <div className="banner info">
              Sao kê chỉ dùng làm snapshot đối chiếu. Thao tác này không tạo giao dịch mua hoặc bán.
            </div>
            {warnings.map((warning) => (
              <div className="banner info" key={warning}>{warning}</div>
            ))}
            {error && <div className="banner error" role="alert">{error}</div>}
            <div className="grid2">
              <div className="field">
                <label>Ngày sao kê</label>
                <input readOnly value={depotDraft.date} />
              </div>
              <div className="field">
                <label>Statement ID</label>
                <input readOnly value={depotDraft.statementId} />
              </div>
            </div>
            <h3>Positions ({depotDraft.positions.length})</h3>
            <div className="stack">
              {depotDraft.positions.map((position) => (
                <div className="card" key={`${position.instrumentIsin}-${position.currency}`}>
                  <strong>{position.name || position.instrumentIsin}</strong>
                  <div><code>{position.instrumentIsin}</code></div>
                  <div className="muted">
                    {fmtQuantity(position.quantity)} đơn vị · {fmtMoney(position.marketValue, position.currency)}
                  </div>
                </div>
              ))}
            </div>
            <h3>Kết quả đối chiếu</h3>
            <div className="stack">
              {previewRows.map((row) => (
                <div className="row-between" key={row.instrumentIsin}>
                  <div>
                    <code>{row.instrumentIsin}</code>
                    <div className="muted">
                      App {fmtQuantity(row.bookQuantity)} · Depot {fmtQuantity(row.statementQuantity)} · Δ {fmtQuantity(row.difference)}
                    </div>
                  </div>
                  <span className={`pill ${statusClass(row.status)}`}>
                    {reconciliationStatusLabel(row.status)}
                  </span>
                </div>
              ))}
            </div>
            <div className="stack" style={{ marginTop: 18 }}>
              <button type="button" disabled={saving} onClick={() => void confirmDepotImport()}>
                {saving ? "Đang lưu…" : "Lưu snapshot đối chiếu"}
              </button>
              <button type="button" className="secondary" disabled={saving} onClick={resetDrafts}>Hủy</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
