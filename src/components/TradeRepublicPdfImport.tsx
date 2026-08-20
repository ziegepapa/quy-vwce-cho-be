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
import { parseDecimal } from "../lib/calc";
import { formatDisplayDate, formatDisplayMoney, formatDisplayQuantity } from "../ui/localeFormatting";
import { nowIso } from "../lib/defaults";
import { normalizeIsin } from "../lib/instrument";
import { parseTrDocumentPdf } from "../lib/tr/readPdf";
import {
  reconcileDepotStatement,
  type ParsedDepotStatement,
  type ReconciliationStatus,
} from "../lib/tr/depotStatement";
import {
  draftToTransaction,
  trExecutionToDraft,
  validateTrImportDraft,
  type TrImportDraft,
} from "../lib/tr/toTransaction";
import ActionMenu from "./ActionMenu";
import { useLocale } from "../lib/locale";
import { buildImportReviewWorkspace, type ImportDuplicateStatus } from "./importReviewWorkspace";
import "../styles/import-review-workspace.css";

type Props = {
  transactions: Transaction[];
  onTransactionImported: () => Promise<void>;
};

type ImportCopy = ReturnType<typeof importCopy>;

function importCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    section: "Trade Republic PDF-Import", pickFile: "Abrechnung oder Depotauszug importieren", reading: "PDF wird gelesen und klassifiziert…", readError: "Die PDF konnte nicht gelesen oder sicher geprüft werden.", importError: "Die Abrechnung konnte nicht gespeichert werden.", duplicate: "Diese Abrechnung wurde bereits importiert.", imported: "Trade-Republic-Abrechnung importiert.", saveStatementError: "Der Depotauszug konnte nicht gespeichert werden.", savedStatement: "Depot-Snapshot zur Abstimmung gespeichert; es wurden keine Transaktionen erstellt.", reviewInvoice: "Abrechnung prüfen", reviewDepot: "Depotauszug prüfen", stageRead: "Gelesen", stageReview: "Prüfen", stageConfirm: "Bestätigen", parsedFields: "Erkannte Daten", warnings: (count: number) => `${count} Hinweis${count === 1 ? "" : "e"} im Dokument`, documentReference: "Dokumentnummer", dedupe: "Duplikatprüfung", checking: "Wird geprüft…", duplicateFound: "Bereits importiert", clear: "Kein Duplikat gefunden", validation: "Validierung", ready: "Bereit zur Bestätigung", needsCorrection: "Eingaben prüfen", type: "Typ", buy: "Wertpapier kaufen", sell: "Wertpapier verkaufen", date: "Datum", isin: "ISIN", quantity: "Menge", unitPrice: "Preis je Einheit", total: "Gesamtbetrag", fee: "Gebühr", tax: "Steuer", notes: "Notiz", saveTransaction: "Transaktion speichern", saving: "Wird gespeichert…", cancel: "Abbrechen", outsideVwce: "Dies ist ein Wertpapier außerhalb von VWCE. ISIN und Mehrwertpapier-Typ bleiben erhalten.", depotReconciliation: "Depotabstimmung", completeMatch: "Vollständig abgeglichen", needsReview: "Prüfung erforderlich", deleteStatement: "Depotauszug löschen", deleteStatementConfirm: "Diesen Depotauszug aus der Abstimmung löschen?", viewResults: (count: number) => `${count} ISIN-Ergebnis${count === 1 ? "" : "se"} anzeigen`, app: "App", depot: "Depot", statementOnly: "Ein Depotauszug ist ausschließlich ein Abstimmungs-Snapshot und erzeugt keine Kauf- oder Verkaufstransaktion.", statementDate: "Auszugsdatum", statementId: "Auszugs-ID", positions: (count: number) => `Positionen (${count})`, reconciliationResult: "Abstimmungsergebnis", saveSnapshot: "Abstimmungs-Snapshot speichern", positionUnits: "Anteile", statusMatch: "Abgeglichen", statusDifference: "Abweichung", statusMissing: "Fehlt", documentWarning: "Im Dokument wurde ein Hinweis gefunden.",
  } : {
    section: "Nhập PDF Trade Republic", pickFile: "Nhập hóa đơn hoặc sao kê Depot", reading: "Đang đọc và phân loại PDF…", readError: "Không đọc hoặc kiểm tra an toàn được tệp PDF.", importError: "Không lưu được hóa đơn.", duplicate: "Hóa đơn này đã được nhập trước đó.", imported: "Đã nhập hóa đơn Trade Republic.", saveStatementError: "Không lưu được sao kê.", savedStatement: "Đã lưu sao kê để đối chiếu; không tạo giao dịch.", reviewInvoice: "Rà soát hóa đơn", reviewDepot: "Rà soát sao kê Depot", stageRead: "Đã đọc", stageReview: "Rà soát", stageConfirm: "Xác nhận", parsedFields: "Dữ liệu đã nhận diện", warnings: (count: number) => `${count} lưu ý trong tài liệu`, documentReference: "Số hóa đơn", dedupe: "Kiểm tra trùng", checking: "Đang kiểm tra…", duplicateFound: "Đã nhập trước đó", clear: "Không có bản trùng", validation: "Kiểm tra dữ liệu", ready: "Sẵn sàng xác nhận", needsCorrection: "Cần kiểm tra dữ liệu", type: "Loại", buy: "Mua chứng khoán", sell: "Bán chứng khoán", date: "Ngày", isin: "ISIN", quantity: "Số lượng", unitPrice: "Giá một đơn vị", total: "Tổng tiền", fee: "Phí", tax: "Thuế", notes: "Ghi chú", saveTransaction: "Lưu giao dịch", saving: "Đang lưu…", cancel: "Hủy", outsideVwce: "Đây là tài sản ngoài VWCE. Ứng dụng sẽ giữ nguyên ISIN và lưu dưới loại giao dịch đa tài sản.", depotReconciliation: "Đối chiếu Depot", completeMatch: "Khớp hoàn toàn", needsReview: "Cần kiểm tra", deleteStatement: "Xóa sao kê", deleteStatementConfirm: "Xóa sao kê này khỏi danh sách đối chiếu?", viewResults: (count: number) => `Xem ${count} kết quả theo ISIN`, app: "App", depot: "Depot", statementOnly: "Sao kê chỉ dùng làm snapshot đối chiếu. Thao tác này không tạo giao dịch mua hoặc bán.", statementDate: "Ngày sao kê", statementId: "Statement ID", positions: (count: number) => `Vị thế (${count})`, reconciliationResult: "Kết quả đối chiếu", saveSnapshot: "Lưu snapshot đối chiếu", positionUnits: "đơn vị", statusMatch: "Khớp", statusDifference: "Chênh lệch", statusMissing: "Thiếu", documentWarning: "Tài liệu có một lưu ý cần xem lại.",
  };
}

function localizedReconciliationLabel(status: ReconciliationStatus, text: ImportCopy) {
  if (status === "match") return text.statusMatch;
  if (status === "difference") return text.statusDifference;
  return text.statusMissing;
}

function fmtDec(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(value).replace(".", ",");
}

function statusClass(status: string): "green" | "yellow" | "red" {
  if (status === "match") return "green";
  if (status === "difference") return "yellow";
  return "red";
}

export default function TradeRepublicPdfImport({ transactions, onTransactionImported }: Props) {
  const { locale } = useLocale();
  const text = importCopy(locale);
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [invoiceDraft, setInvoiceDraft] = useState<TrImportDraft | null>(null);
  const [depotDraft, setDepotDraft] = useState<ParsedDepotStatement | null>(null);
  const [duplicateStatus, setDuplicateStatus] = useState<ImportDuplicateStatus>("idle");
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
    setDuplicateStatus("idle");
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
        setError(locale === "de" ? text.readError : result.error);
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
        setDuplicateStatus("checking");
        const duplicate = draft.externalRef ? await findTransactionByExternalRef(draft.externalRef) : true;
        setDuplicateStatus(duplicate ? "duplicate" : "clear");
      } else {
        setDepotDraft(result.value);
      }
    } catch (reason) {
      setError(locale === "de" ? text.readError : reason instanceof Error ? reason.message : text.readError);
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
      setError(locale === "de" ? text.needsCorrection : validation.error);
      return;
    }
    if (duplicateStatus !== "clear" || await findTransactionByExternalRef(draft.externalRef!)) {
      setDuplicateStatus("duplicate");
      setError(text.duplicate);
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
        throw new Error(text.duplicate);
      }
      await upsertTransaction(
        draftToTransaction(draft, { id: uid("tx"), createdAt: t, updatedAt: t }),
      );
      resetDrafts();
      flash(text.imported);
      await onTransactionImported();
    } catch (reason) {
      setError(locale === "de" ? text.importError : reason instanceof Error ? reason.message : text.importError);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDepotImport() {
    if (!depotDraft) return;
    if (await findDepotStatementByStatementId(depotDraft.statementId)) {
      setError(text.duplicate);
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
      flash(text.savedStatement);
      await reloadDepots();
    } catch (reason) {
      setError(locale === "de" ? text.saveStatementError : reason instanceof Error ? reason.message : text.saveStatementError);
    } finally {
      setSaving(false);
    }
  }

  const previewRows = useMemo(
    () => (depotDraft ? reconcileDepotStatement(depotDraft, transactions) : []),
    [depotDraft, transactions],
  );
  const reviewedInvoiceDraft = currentInvoiceDraft();
  const invoiceValidation = reviewedInvoiceDraft ? validateTrImportDraft(reviewedInvoiceDraft) : null;
  const invoiceReview = buildImportReviewWorkspace({
    draft: reviewedInvoiceDraft,
    validation: invoiceValidation,
    duplicateStatus,
    warningCount: warnings.length,
  });

  return (
    <section className="import-review" style={{ marginBottom: 12 }} aria-label={text.section}>
      <button
        type="button"
        className="secondary"
        style={{ width: "100%" }}
        disabled={reading}
        onClick={() => inputRef.current?.click()}
      >
        {reading ? text.reading : text.pickFile}
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
          <h2 className="section-title">{text.depotReconciliation}</h2>
          {depots.map((statement) => {
            const rows = reconcileDepotStatement(statement, transactions);
            const allMatch = rows.length > 0 && rows.every((row) => row.status === "match");
            return (
              <div className="card" key={statement.id}>
                <div className="row-between">
                  <div>
                    <strong>{formatDisplayDate(statement.date, locale)}</strong>
                    <div className="muted">{statement.statementId}</div>
                  </div>
                  <div className="row-between">
                    <span className={`pill ${allMatch ? "green" : "yellow"}`}>
                      {allMatch ? text.completeMatch : text.needsReview}
                    </span>
                    <ActionMenu
                      actions={[
                        {
                          label: text.deleteStatement,
                          danger: true,
                          onClick: async () => {
                            if (!confirm(text.deleteStatementConfirm)) return;
                            await deleteDepotStatement(statement.id);
                            await reloadDepots();
                          },
                        },
                      ]}
                    />
                  </div>
                </div>
                <details style={{ marginTop: 10 }}>
                  <summary>{text.viewResults(rows.length)}</summary>
                  <div className="stack" style={{ marginTop: 10 }}>
                    {rows.map((row) => (
                      <div key={row.instrumentIsin} className="row-between">
                        <div>
                          <code>{row.instrumentIsin}</code>
                          <div className="muted">
                            {text.app} {formatDisplayQuantity(row.bookQuantity, locale, 6)} · {text.depot} {formatDisplayQuantity(row.statementQuantity, locale, 6)}
                          </div>
                        </div>
                        <span className={`pill ${statusClass(row.status)}`}>
                          {localizedReconciliationLabel(row.status, text)}
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
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={text.reviewInvoice}>
          <div className="modal import-review-modal">
            <div className="sheet-handle" aria-hidden />
            <header className="import-review-head"><div><p>{text.parsedFields}</p><h2>{text.reviewInvoice}</h2></div><span>{invoiceReview.documentRef ?? "—"}</span></header>
            <ol className="import-review-steps" aria-label={text.reviewInvoice}>
              <li className="done">{text.stageRead}</li><li className="current">{text.stageReview}</li><li className={invoiceReview.canConfirm ? "done" : ""}>{text.stageConfirm}</li>
            </ol>
            {invoiceReview.warningCount > 0 ? <div className="banner info">{text.warnings(invoiceReview.warningCount)}</div> : null}
            {warnings.map((warning, index) => <div className="banner info" key={`${warning}-${index}`}>{locale === "de" ? text.documentWarning : warning}</div>)}
            {error && <div className="banner error" role="alert">{error}</div>}
            {invoiceDraft.isin !== VWCE_ISIN && <div className="banner info">{text.outsideVwce}</div>}
            <section className="import-review-signals" aria-label={text.stageReview}>
              <div data-state={invoiceReview.duplicateStatus}><span>{text.dedupe}</span><strong>{invoiceReview.duplicateStatus === "checking" ? text.checking : invoiceReview.duplicateStatus === "duplicate" ? text.duplicateFound : invoiceReview.duplicateStatus === "clear" ? text.clear : "—"}</strong></div>
              <div data-state={invoiceReview.isValidationReady ? "ready" : "invalid"}><span>{text.validation}</span><strong>{invoiceReview.isValidationReady ? text.ready : text.needsCorrection}</strong></div>
            </section>
            <section className="import-review-fields" aria-label={text.parsedFields}>
              <div className="field"><label>{text.type}</label><input readOnly value={invoiceDraft.type.startsWith("sell") ? text.sell : text.buy} /></div>
              <div className="field"><label htmlFor="pdf-date">{text.date}</label><input id="pdf-date" type="date" value={invoiceForm.date} onChange={(e) => setInvoiceForm({ ...invoiceForm, date: e.target.value })} /></div>
              <div className="field"><label>{text.isin}</label><input readOnly value={invoiceDraft.isin} /></div>
              <div className="grid2"><div className="field"><label htmlFor="pdf-qty">{text.quantity}</label><input id="pdf-qty" inputMode="decimal" value={invoiceForm.quantity} onChange={(e) => setInvoiceForm({ ...invoiceForm, quantity: e.target.value })} /></div><div className="field"><label htmlFor="pdf-price">{text.unitPrice}</label><input id="pdf-price" inputMode="decimal" value={invoiceForm.unitPrice} onChange={(e) => setInvoiceForm({ ...invoiceForm, unitPrice: e.target.value })} /></div></div>
              <div className="field"><label htmlFor="pdf-amount">{text.total}</label><input id="pdf-amount" inputMode="decimal" value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} /></div>
              <div className="grid2"><div className="field"><label htmlFor="pdf-fee">{text.fee}</label><input id="pdf-fee" inputMode="decimal" value={invoiceForm.fee} onChange={(e) => setInvoiceForm({ ...invoiceForm, fee: e.target.value })} /></div><div className="field"><label htmlFor="pdf-tax">{text.tax}</label><input id="pdf-tax" inputMode="decimal" value={invoiceForm.tax} onChange={(e) => setInvoiceForm({ ...invoiceForm, tax: e.target.value })} /></div></div>
              <div className="field"><label>{text.documentReference}</label><input readOnly value={invoiceReview.documentRef ?? "—"} /></div>
              <div className="field"><label htmlFor="pdf-notes">{text.notes}</label><textarea id="pdf-notes" rows={2} value={invoiceForm.notes} onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} /></div>
            </section>
            <div className="stack import-review-actions"><button type="button" disabled={saving || !invoiceReview.canConfirm} onClick={() => void confirmInvoiceImport()}>{saving ? text.saving : text.saveTransaction}</button><button type="button" data-dialog-close className="secondary" disabled={saving} onClick={resetDrafts}>{text.cancel}</button></div>
          </div>
        </div>
      )}

      {depotDraft && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={text.reviewDepot}>
          <div className="modal import-review-modal">
            <div className="sheet-handle" aria-hidden />
            <header className="import-review-head"><div><p>{text.parsedFields}</p><h2>{text.reviewDepot}</h2></div><span>{depotDraft.statementId}</span></header>
            <ol className="import-review-steps" aria-label={text.reviewDepot}><li className="done">{text.stageRead}</li><li className="current">{text.stageReview}</li><li>{text.stageConfirm}</li></ol>
            <div className="banner info">{text.statementOnly}</div>
            {warnings.map((warning, index) => <div className="banner info" key={`${warning}-${index}`}>{locale === "de" ? text.documentWarning : warning}</div>)}
            {error && <div className="banner error" role="alert">{error}</div>}
            <div className="grid2"><div className="field"><label>{text.statementDate}</label><input readOnly value={formatDisplayDate(depotDraft.date, locale)} /></div><div className="field"><label>{text.statementId}</label><input readOnly value={depotDraft.statementId} /></div></div>
            <h3>{text.positions(depotDraft.positions.length)}</h3>
            <div className="stack">{depotDraft.positions.map((position) => <div className="card" key={`${position.instrumentIsin}-${position.currency}`}><strong>{position.name || position.instrumentIsin}</strong><div><code>{position.instrumentIsin}</code></div><div className="muted">{formatDisplayQuantity(position.quantity, locale, 6)} {text.positionUnits} · {formatDisplayMoney(position.marketValue ?? Number.NaN, locale, position.currency)}</div></div>)}</div>
            <h3>{text.reconciliationResult}</h3>
            <div className="stack">{previewRows.map((row) => <div className="row-between" key={row.instrumentIsin}><div><code>{row.instrumentIsin}</code><div className="muted">{text.app} {formatDisplayQuantity(row.bookQuantity, locale, 6)} · {text.depot} {formatDisplayQuantity(row.statementQuantity, locale, 6)} · Δ {formatDisplayQuantity(row.difference, locale, 6)}</div></div><span className={`pill ${statusClass(row.status)}`}>{localizedReconciliationLabel(row.status, text)}</span></div>)}</div>
            <div className="stack import-review-actions" style={{ marginTop: 18 }}><button type="button" disabled={saving} onClick={() => void confirmDepotImport()}>{saving ? text.saving : text.saveSnapshot}</button><button type="button" data-dialog-close className="secondary" disabled={saving} onClick={resetDrafts}>{text.cancel}</button></div>
          </div>
        </div>
      )}
    </section>
  );
}
