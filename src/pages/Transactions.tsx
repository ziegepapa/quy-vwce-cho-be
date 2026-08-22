import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  deleteTransaction,
  getSettings,
  listTransactions,
  listQuotes,
  uid,
  upsertInstrument,
  upsertTransaction,
} from "../lib/db";
import type { Quote, Transaction, TxType } from "../lib/types";
import { VWCE_ISIN } from "../lib/types";
import { calcQuantity, parseDecimal, replayTransactions } from "../lib/calc";
import {
  classifyTransactionAgainstHoldings,
  TransactionSemanticError,
  type TransactionSemanticReason,
} from "../lib/transactionValidation";
import { formatDisplayDate, formatDisplayMoney, formatDisplayQuantity } from "../ui/localeFormatting";
import { nowIso } from "../lib/defaults";
import {
  isSecuritySell,
  isSecurityTx,
  isValidIsin,
  normalizeIsin,
  resolveInstrumentIsin,
} from "../lib/instrument";
import { useRecoveryReadOnly } from "../lib/recoveryReadOnly";
import { useLocale } from "../lib/locale";
import { analyzeTransactions } from "../lib/transactionAnalytics";
import ActionMenu from "../components/ActionMenu";
import {
  findTransactionQualityIssues,
  type TransactionQualityCode,
  type TransactionQualitySeverity,
  type TransactionQualitySource,
  type TransactionRecordSource,
} from "./transactionQualityInbox";
import {
  MAX_SAVED_TRANSACTION_VIEWS,
  readTransactionSavedViews,
  sameTransactionViewFilters,
  type SavedTransactionView,
  type TransactionViewFilters,
  writeTransactionSavedViews,
} from "./transactionsSavedViews";
import {
  buildTransactionListWindow,
  TRANSACTION_WINDOW_SIZE,
  type TransactionActivity,
  type TransactionInstrumentLens,
  type TransactionQualityLens,
  type TransactionSort,
  type TransactionTimeLens,
} from "./transactionsListWindow";
import "../styles/demo-v10-transactions.css";

const TradeRepublicPdfImport = lazy(() => import("../components/TradeRepublicPdfImport"));

function transactionTypes(locale: "vi" | "de"): { value: TxType; label: string; sign: "+" | "-" | "~" }[] {
  const labels = locale === "de"
    ? { buy_vwce: "VWCE kaufen", sell_vwce: "VWCE verkaufen", buy_security: "Anderes Wertpapier kaufen", sell_security: "Anderes Wertpapier verkaufen", cash_in: "Geld einzahlen", cash_out: "Geld auszahlen", tax: "Steuer", fee: "Gebühr", safe_interest: "Sicherheitszins", adjust: "Anpassung" }
    : { buy_vwce: "Mua VWCE", sell_vwce: "Bán VWCE", buy_security: "Mua chứng khoán khác", sell_security: "Bán chứng khoán khác", cash_in: "Nạp cash", cash_out: "Rút cash", tax: "Thuế", fee: "Phí", safe_interest: "Lãi an toàn", adjust: "Điều chỉnh" };
  return [
    { value: "buy_vwce", label: labels.buy_vwce, sign: "~" }, { value: "sell_vwce", label: labels.sell_vwce, sign: "~" },
    { value: "buy_security", label: labels.buy_security, sign: "~" }, { value: "sell_security", label: labels.sell_security, sign: "~" },
    { value: "cash_in", label: labels.cash_in, sign: "+" }, { value: "cash_out", label: labels.cash_out, sign: "-" },
    { value: "tax", label: labels.tax, sign: "-" }, { value: "fee", label: labels.fee, sign: "-" },
    { value: "safe_interest", label: labels.safe_interest, sign: "+" }, { value: "adjust", label: labels.adjust, sign: "~" },
  ];
}

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

function qualitySemanticReasonCopy(locale: "vi" | "de", reason: TransactionSemanticReason): string {
  const de: Record<TransactionSemanticReason, string> = {
    INVALID_RECORD: "Datensatz ist nicht vollständig lesbar",
    INVALID_TYPE: "Transaktionstyp ist ungültig",
    INVALID_DATE: "Datum ist ungültig",
    INVALID_AMOUNT: "Betrag ist ungültig",
    INVALID_FEE: "Gebühr ist ungültig",
    INVALID_TAX: "Steuer ist ungültig",
    INVALID_QUANTITY: "Menge ist ungültig",
    ZERO_QUANTITY: "Menge darf nicht null sein",
    INVALID_UNIT_PRICE: "Stückpreis ist ungültig",
    INVALID_ISIN: "ISIN ist ungültig",
    INVALID_ECONOMICS: "Gebühren und Steuern übersteigen den Betrag",
    MISSING_BUY_QUANTITY_EVIDENCE: "Kaufmenge kann nicht belegt werden",
    MISSING_SALE_QUANTITY: "Verkaufsmenge fehlt",
    MISSING_ADJUSTMENT_NOTE: "Notiz für Anpassung fehlt",
    OVERSOLD: "Verkaufsmenge übersteigt den gebuchten Bestand",
  };
  const vi: Record<TransactionSemanticReason, string> = {
    INVALID_RECORD: "Không đọc được đầy đủ bản ghi",
    INVALID_TYPE: "Loại giao dịch không hợp lệ",
    INVALID_DATE: "Ngày không hợp lệ",
    INVALID_AMOUNT: "Số tiền không hợp lệ",
    INVALID_FEE: "Phí không hợp lệ",
    INVALID_TAX: "Thuế không hợp lệ",
    INVALID_QUANTITY: "Số lượng không hợp lệ",
    ZERO_QUANTITY: "Số lượng không được bằng 0",
    INVALID_UNIT_PRICE: "Giá đơn vị không hợp lệ",
    INVALID_ISIN: "ISIN không hợp lệ",
    INVALID_ECONOMICS: "Phí và thuế vượt số tiền",
    MISSING_BUY_QUANTITY_EVIDENCE: "Không đủ bằng chứng số lượng mua",
    MISSING_SALE_QUANTITY: "Thiếu số lượng bán",
    MISSING_ADJUSTMENT_NOTE: "Thiếu ghi chú cho điều chỉnh",
    OVERSOLD: "Số lượng bán vượt số lượng đã ghi nhận",
  };
  return locale === "de" ? de[reason] : vi[reason];
}

function financialReasonCopy(locale: "vi" | "de", reason: TransactionSemanticReason): string {
  const de: Record<TransactionSemanticReason, string> = {
    INVALID_RECORD: "Die Transaktion ist nicht vollständig lesbar und wurde nicht gespeichert.",
    INVALID_TYPE: "Der Transaktionstyp ist ungültig. Die Transaktion wurde nicht gespeichert.",
    INVALID_DATE: "Das Datum ist ungültig. Die Transaktion wurde nicht gespeichert.",
    INVALID_AMOUNT: "Der Betrag muss für diesen Transaktionstyp positiv sein. Die Transaktion wurde nicht gespeichert.",
    INVALID_FEE: "Die Gebühr darf nicht negativ sein. Die Transaktion wurde nicht gespeichert.",
    INVALID_TAX: "Die Steuer darf nicht negativ sein. Die Transaktion wurde nicht gespeichert.",
    INVALID_QUANTITY: "Die Stückzahl darf nicht negativ sein. Die Transaktion wurde nicht gespeichert.",
    ZERO_QUANTITY: "Die Stückzahl muss größer als null sein. Die Transaktion wurde nicht gespeichert.",
    INVALID_UNIT_PRICE: "Der Stückpreis muss positiv sein. Die Transaktion wurde nicht gespeichert.",
    INVALID_ISIN: "Die ISIN ist ungültig. Die Transaktion wurde nicht gespeichert.",
    INVALID_ECONOMICS: "Gebühr und Steuer dürfen den Betrag nicht übersteigen. Die Transaktion wurde nicht gespeichert.",
    MISSING_BUY_QUANTITY_EVIDENCE: "Für den Kauf fehlen Stückzahl oder ein positiver Stückpreis. Die Transaktion wurde nicht gespeichert.",
    MISSING_SALE_QUANTITY: "Für einen Verkauf fehlt die Stückzahl. Die Transaktion wurde nicht gespeichert.",
    MISSING_ADJUSTMENT_NOTE: "Für eine Anpassung ist eine Notiz erforderlich. Die Transaktion wurde nicht gespeichert.",
    OVERSOLD: "Die Verkaufsmenge übersteigt den aktuell gebuchten Bestand. Die Transaktion wurde nicht gespeichert.",
  };
  const vi: Record<TransactionSemanticReason, string> = {
    INVALID_RECORD: "Giao dịch không đọc được đầy đủ và chưa được lưu.",
    INVALID_TYPE: "Loại giao dịch không hợp lệ. Giao dịch chưa được lưu.",
    INVALID_DATE: "Ngày không hợp lệ. Giao dịch chưa được lưu.",
    INVALID_AMOUNT: "Số tiền phải dương với loại giao dịch này. Giao dịch chưa được lưu.",
    INVALID_FEE: "Phí không được âm. Giao dịch chưa được lưu.",
    INVALID_TAX: "Thuế không được âm. Giao dịch chưa được lưu.",
    INVALID_QUANTITY: "Số lượng không được âm. Giao dịch chưa được lưu.",
    ZERO_QUANTITY: "Số lượng phải lớn hơn 0. Giao dịch chưa được lưu.",
    INVALID_UNIT_PRICE: "Giá đơn vị phải dương. Giao dịch chưa được lưu.",
    INVALID_ISIN: "ISIN không hợp lệ. Giao dịch chưa được lưu.",
    INVALID_ECONOMICS: "Phí và thuế không được vượt số tiền. Giao dịch chưa được lưu.",
    MISSING_BUY_QUANTITY_EVIDENCE: "Thiếu số lượng hoặc giá đơn vị dương cho giao dịch mua. Giao dịch chưa được lưu.",
    MISSING_SALE_QUANTITY: "Giao dịch bán thiếu số lượng. Giao dịch chưa được lưu.",
    MISSING_ADJUSTMENT_NOTE: "Điều chỉnh cần có ghi chú. Giao dịch chưa được lưu.",
    OVERSOLD: "Số lượng bán vượt quá số lượng đang được ghi nhận. Giao dịch chưa được lưu.",
  };
  return locale === "de" ? de[reason] : vi[reason];
}

export default function Transactions() {
  const { locale } = useLocale();
  const types = useMemo(() => transactionTypes(locale), [locale]);
  const text = locale === "de" ? {
    loading: "Transaktionen werden geladen", loadError: "Transaktionen konnten nicht geladen werden", safeData: "Die Daten auf diesem Gerät bleiben unverändert.", retry: "Erneut versuchen", title: "Transaktionen", add: "Hinzufügen", contributed: "Eingezahlt", pnl: "Gewinn / Verlust", transactionCount: "Buchungen", buys: "Käufe", analysis: "Analyse aus dem Transaktionsbuch", positions: "offene Positionen", noPositions: "Keine Position", missingPrices: "Kursdaten fehlen", valued: "Bewertet", holdings: "Wert der Wertpapiere", realized: "Realisierter Gewinn / Verlust", unrealized: "Nicht realisierter Gewinn / Verlust", feesTax: "Gebühren & Steuern", analysisNote: "Der Gesamtgewinn wird nicht berechnet, wenn {reason}. Ergänzen Sie Kurse oder Transaktionsdaten für eine genaue Bewertung.", missingQuote: "Kurse fehlen für {isins}", missingLots: "Kauf- oder Verkaufsmenge fehlt", hideTools: "Filter schließen", tools: "Filter", filterSheet: "Filter", applyFilters: "Anwenden", search: "Suchen", searchLedger: "Transaktionen durchsuchen", searchPlaceholder: "Notiz, Typ, ISIN…", year: "Jahr", all: "Alle", type: "Typ", instrument: "Wertpapier", instrumentVwce: "VWCE", instrumentOther: "Andere Wertpapiere", status: "Status", statusNormal: "Unauffällig", statusReview: "Prüfen", activeFilterChips: "Aktive Filter", noTransactions: "Noch keine Transaktionen.", noMatches: "Keine Transaktionen entsprechen dem Filter.", visibleCount: "{visible} von {total} Transaktionen", loadMore: "{count} weitere laden", allVisible: "Alle {total} Transaktionen werden angezeigt", journal: "Transaktionsjournal", quickFilter: "Schnellfilter", buysQuick: "VWCE-Käufe", contributionsQuick: "Einzahlungen", addFirst: "Erste Transaktion hinzufügen", quantity: "Menge", edit: "Bearbeiten", addTransaction: "Transaktion hinzufügen", editTransaction: "Transaktion bearbeiten", date: "Datum", amount: "Betrag", totalPayment: "Gesamtzahlung", unitPrice: "Preis je Einheit", sellQuantity: "Menge (beim Verkauf erforderlich)", autoQuantity: "Menge (leer = automatisch berechnet)", fee: "Gebühr", tax: "Steuer", notes: "Notiz", notesRequired: " (erforderlich)", save: "Speichern", cancel: "Abbrechen", delete: "Löschen", deleteConfirm: "Diese Transaktion löschen?", activity: "Aktivität", tradeActivity: "Wertpapiere", fundingActivity: "Einzahlungen", outflowActivity: "Ausgaben", newest: "Neueste zuerst", oldest: "Älteste zuerst", amountDesc: "Höchster Betrag", sort: "Sortierung", activeFilters: "{count} aktiv", clearFilters: "Zurücksetzen", quickBuy: "VWCE kaufen", quickFunding: "Geld einzahlen", rowMenu: "Aktionen für Transaktion", timeLens: "Zeitraum", timeAll: "Gesamt", thisMonth: "Dieser Monat", last90Days: "90 Tage", thisYear: "Dieses Jahr", lastYear: "Letztes Jahr", qualityInbox: "Datenqualität", qualityClean: "Alle Transaktionen sind vollständig.", qualityCount: "{count} prüfen", qualityMore: "{count} weitere zeigen", qualityOpen: "Öffnen und prüfen", qualityAction: "Aktion erforderlich", qualityReview: "Prüfen", qualityTip: "Hinweis", qualityMissingIsin: "ISIN fehlt", qualityInvalidIsin: "ISIN ist ungültig", qualityInvalidAmount: "Betrag fehlt oder ist ungültig", qualityMissingQuantity: "Menge oder Stückpreis fehlt", qualityMissingUnitPrice: "Stückpreis fehlt", qualityMissingNote: "Notiz fehlt", qualitySourceReplay: "Finanzielle Prüfung", qualitySourceCompleteness: "Vollständigkeitsprüfung", qualityRecordManual: "Manuell", qualityRecordTradeRepublic: "Trade Republic PDF", qualityRecordLegacy: "Legacy / unbekannt", savedViews: "Gespeicherte Ansichten", saveView: "Ansicht speichern", savedViewName: "Name der Ansicht", savedViewNamePlaceholder: "z. B. Käufe dieses Jahr", saveCurrentView: "Aktuelle Ansicht speichern", savedViewEmpty: "Noch keine gespeicherte Ansicht.", savedViewLimit: "Maximal {count} Ansichten. Löschen Sie eine Ansicht, um fortzufahren.", savedViewNameRequired: "Geben Sie einen Namen für die Ansicht ein.", savedViewStorageError: "Diese Ansicht konnte auf diesem Gerät nicht gespeichert werden.", savedViewNoFilters: "Wählen Sie mindestens einen Filter oder eine Sortierung aus.", removeSavedView: "Ansicht {name} löschen", dateAmountRequired: "Datum und Betrag sind erforderlich.", adjustmentNoteRequired: "Für eine Anpassung ist eine Notiz erforderlich.", invalidIsinChecksum: "ISIN ist ungültig oder die Prüfsumme stimmt nicht.", sellQuantityRequired: "Für einen Verkauf ist eine Wertpapiermenge erforderlich.", priceOrQuantityRequired: "Preis oder Menge ist erforderlich.", invalidQuantity: "Die Menge ist ungültig.",
  } : {
    loading: "Đang tải Giao dịch", loadError: "Không tải được Giao dịch", safeData: "Dữ liệu trên thiết bị vẫn được giữ nguyên.", retry: "Thử lại", title: "Giao dịch", add: "Thêm", contributed: "Tổng góp", pnl: "Lãi / lỗ", transactionCount: "Giao dịch", buys: "Số lần mua", analysis: "Phân tích từ sổ giao dịch", positions: "vị thế đang mở", noPositions: "Chưa có vị thế", missingPrices: "Chưa đủ dữ liệu giá", valued: "Đã định giá", holdings: "Giá trị chứng khoán", realized: "Lãi / lỗ đã chốt", unrealized: "Lãi / lỗ tạm tính", feesTax: "Phí & thuế", analysisNote: "Không suy ra lợi nhuận tổng khi {reason}. Thêm giá hoặc hoàn thiện giao dịch để định giá chính xác.", missingQuote: "thiếu giá cho {isins}", missingLots: "thiếu dữ liệu số lượng mua/bán", hideTools: "Đóng bộ lọc", tools: "Lọc", filterSheet: "Bộ lọc", applyFilters: "Áp dụng", search: "Tìm", searchLedger: "Tìm kiếm giao dịch", searchPlaceholder: "Ghi chú, loại, ISIN…", year: "Năm", all: "Tất cả", type: "Loại", instrument: "Công cụ", instrumentVwce: "VWCE", instrumentOther: "Chứng khoán khác", status: "Trạng thái", statusNormal: "Bình thường", statusReview: "Cần rà soát", activeFilterChips: "Bộ lọc đang dùng", noTransactions: "Chưa có giao dịch.", noMatches: "Không có giao dịch khớp bộ lọc.", visibleCount: "Đang hiển thị {visible}/{total} giao dịch", loadMore: "Tải thêm {count} giao dịch", allVisible: "Đã hiển thị toàn bộ {total} giao dịch", journal: "Nhật ký giao dịch", quickFilter: "Lọc nhanh", buysQuick: "Mua VWCE", contributionsQuick: "Góp tiền", addFirst: "Thêm giao dịch đầu tiên", quantity: "SL", edit: "Sửa", addTransaction: "Thêm giao dịch", editTransaction: "Sửa giao dịch", date: "Ngày", amount: "Số tiền", totalPayment: "Tổng tiền thanh toán", unitPrice: "Giá một đơn vị", sellQuantity: "Số lượng (bắt buộc khi bán)", autoQuantity: "Số lượng (để trống = tự tính)", fee: "Phí", tax: "Thuế", notes: "Ghi chú", notesRequired: " (bắt buộc)", save: "Lưu", cancel: "Hủy", delete: "Xóa", deleteConfirm: "Xóa giao dịch này?", activity: "Dòng tiền", tradeActivity: "Đầu tư", fundingActivity: "Tiền vào", outflowActivity: "Chi ra", newest: "Mới nhất", oldest: "Cũ nhất", amountDesc: "Số tiền cao nhất", sort: "Sắp xếp", activeFilters: "{count} bộ lọc", clearFilters: "Xóa lọc", quickBuy: "Mua VWCE", quickFunding: "Góp tiền", rowMenu: "Tùy chọn giao dịch", timeLens: "Thời gian", timeAll: "Toàn bộ", thisMonth: "Tháng này", last90Days: "90 ngày", thisYear: "Năm nay", lastYear: "Năm trước", qualityInbox: "Dữ liệu cần rà soát", qualityClean: "Tất cả giao dịch đang có đủ thông tin.", qualityCount: "{count} cần rà soát", qualityMore: "Xem thêm {count}", qualityOpen: "Mở để rà soát", qualityAction: "Cần xử lý", qualityReview: "Cần kiểm tra", qualityTip: "Gợi ý", qualityMissingIsin: "Thiếu ISIN", qualityInvalidIsin: "ISIN không hợp lệ", qualityInvalidAmount: "Số tiền thiếu hoặc không hợp lệ", qualityMissingQuantity: "Thiếu số lượng hoặc giá đơn vị", qualityMissingUnitPrice: "Thiếu giá đơn vị", qualityMissingNote: "Thiếu ghi chú", qualitySourceReplay: "Kiểm tra tài chính", qualitySourceCompleteness: "Kiểm tra độ đầy đủ", qualityRecordManual: "Nhập thủ công", qualityRecordTradeRepublic: "PDF Trade Republic", qualityRecordLegacy: "Legacy / không rõ nguồn", savedViews: "Góc xem đã lưu", saveView: "Lưu view", savedViewName: "Tên góc xem", savedViewNamePlaceholder: "Ví dụ: Mua trong năm nay", saveCurrentView: "Lưu góc xem hiện tại", savedViewEmpty: "Chưa có góc xem nào được lưu.", savedViewLimit: "Tối đa {count} góc xem. Hãy xóa một góc xem để tiếp tục.", savedViewNameRequired: "Hãy nhập tên cho góc xem.", savedViewStorageError: "Không thể lưu góc xem trên thiết bị này.", savedViewNoFilters: "Hãy chọn ít nhất một bộ lọc hoặc sắp xếp trước.", removeSavedView: "Xóa góc xem {name}", dateAmountRequired: "Ngày và số tiền bắt buộc", adjustmentNoteRequired: "Điều chỉnh bắt buộc có ghi chú", invalidIsinChecksum: "ISIN không hợp lệ hoặc sai checksum.", sellQuantityRequired: "Giao dịch bán cần số lượng chứng khoán.", priceOrQuantityRequired: "Cần giá hoặc số lượng", invalidQuantity: "Số lượng không hợp lệ",
  };
  const pdfImportLabel = locale === "de" ? "PDF importieren" : "Nhập PDF";

  const [txs, setTxs] = useState<Transaction[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [trackInAppCash, setTrackInAppCash] = useState<boolean | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [pdfToolsOpen, setPdfToolsOpen] = useState(false);
  const [q, setQ] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | TxType>("all");
  const [activityFilter, setActivityFilter] = useState<TransactionActivity>("all");
  const [timeLens, setTimeLens] = useState<TransactionTimeLens>("all");
  const [instrumentFilter, setInstrumentFilter] = useState<TransactionInstrumentLens>("all");
  const [qualityFilter, setQualityFilter] = useState<TransactionQualityLens>("all");
  const [filterDraft, setFilterDraft] = useState<{
    year: string;
    type: "all" | TxType;
    activity: TransactionActivity;
    timeLens: TransactionTimeLens;
    instrument: TransactionInstrumentLens;
    quality: TransactionQualityLens;
    sort: TransactionSort;
  }>({ year: "all", type: "all", activity: "all", timeLens: "all", instrument: "all", quality: "all", sort: "newest" });
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const quality = searchParams.get("quality");
    if (quality === "needs_review" || quality === "normal" || quality === "all") {
      setQualityFilter(quality);
    }
  }, [searchParams]);

  useEffect(() => {
    const dock = document.querySelector(".bottom-dock");
    document.documentElement.classList.toggle("tx-filter-open", filterSheetOpen);
    document.body.classList.toggle("tx-filter-open", filterSheetOpen);
    if (dock) {
      if (filterSheetOpen) dock.classList.add("is-hidden");
      else dock.classList.remove("is-hidden");
    }
    return () => {
      document.documentElement.classList.remove("tx-filter-open");
      document.body.classList.remove("tx-filter-open");
      document.querySelector(".bottom-dock")?.classList.remove("is-hidden");
    };
  }, [filterSheetOpen]);

  const [sort, setSort] = useState<TransactionSort>("newest");
  const [qualityVisibleLimit, setQualityVisibleLimit] = useState(3);
  const [savedViews, setSavedViews] = useState<SavedTransactionView[]>(() => readTransactionSavedViews());
  const [savedViewName, setSavedViewName] = useState("");
  const [savedViewError, setSavedViewError] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(TRANSACTION_WINDOW_SIZE);
  const deferredQuery = useDeferredValue(q);
  const [qtyError, setQtyError] = useState("");
  const [isinError, setIsinError] = useState("");
  const [financialError, setFinancialError] = useState("");
  const { readOnly, showBlocked } = useRecoveryReadOnly();

  async function reload() {
    try {
      const [nextTransactions, nextQuotes, settings] = await Promise.all([
        listTransactions(),
        listQuotes(),
        getSettings().catch(() => null),
      ]);
      setTxs(nextTransactions);
      setVisibleLimit(TRANSACTION_WINDOW_SIZE);
      setQuotes(nextQuotes);
    setTrackInAppCash(settings?.trackInAppCash);
    setQualityVisibleLimit(3);
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

  const typeSearchTerms = useMemo(
    () => Object.fromEntries(types.map((type) => [type.value, type.label])) as Partial<Record<TxType, string>>,
    [types],
  );
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const qualityIssues = useMemo(() => findTransactionQualityIssues(txs), [txs]);
  const qualityTransactionIds = useMemo(() => new Set(qualityIssues.map((issue) => issue.transactionId)), [qualityIssues]);

  useEffect(() => {
    setVisibleLimit(TRANSACTION_WINDOW_SIZE);
  }, [activityFilter, deferredQuery, instrumentFilter, qualityFilter, sort, timeLens, typeFilter, yearFilter]);

  const listWindow = useMemo(
    () => buildTransactionListWindow(txs, {
      query: deferredQuery,
      year: yearFilter,
      type: typeFilter,
      activity: activityFilter,
      instrument: instrumentFilter,
      quality: qualityFilter,
      qualityTransactionIds,
      sort,
      timeLens,
      today,
      typeSearchTerms,
    }, visibleLimit),
    [activityFilter, deferredQuery, instrumentFilter, qualityFilter, qualityTransactionIds, sort, timeLens, today, txs, typeFilter, typeSearchTerms, visibleLimit, yearFilter],
  );

  const activeFilterCount = Number(Boolean(q.trim())) + Number(yearFilter !== "all") + Number(typeFilter !== "all") + Number(activityFilter !== "all") + Number(timeLens !== "all") + Number(instrumentFilter !== "all") + Number(qualityFilter !== "all") + Number(sort !== "newest");
  const currentViewFilters: TransactionViewFilters = { query: q, year: yearFilter, type: typeFilter, activity: activityFilter, timeLens, sort };
  const savedViewCompatible = instrumentFilter === "all" && qualityFilter === "all";
  const activeSavedViewId = savedViewCompatible
    ? savedViews.find((view) => sameTransactionViewFilters(view.filters, currentViewFilters))?.id ?? null
    : null;

  const transactionsById = useMemo(() => new Map(txs.map((tx) => [tx.id, tx])), [txs]);
  const visibleQualityIssues = qualityIssues.slice(0, qualityVisibleLimit);

  const analysis = useMemo(
    () => analyzeTransactions(txs, quotes, trackInAppCash),
    [txs, quotes, trackInAppCash],
  );
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
    setFinancialError("");
    if (!form.date || !form.amount.trim()) {
      alert(text.dateAmountRequired);
      return;
    }
    if (form.type === "adjust" && !form.notes.trim()) {
      alert(text.adjustmentNoteRequired);
      return;
    }

    let instrumentIsin: string | undefined;
    if (security) {
      instrumentIsin =
        form.type === "buy_vwce" || form.type === "sell_vwce"
          ? VWCE_ISIN
          : normalizeIsin(form.instrumentIsin);
      if (!isValidIsin(instrumentIsin)) {
        setIsinError(text.invalidIsinChecksum);
        return;
      }
      if (isSecuritySell(form.type)) {
        const quantity = parseDecimal(form.quantity);
        if (!form.quantity.trim() || quantity <= 0) {
          setQtyError(text.sellQuantityRequired);
          return;
        }
      }
      if (unitPrice <= 0 && !form.quantity.trim()) {
        alert(text.priceOrQuantityRequired);
        return;
      }
    }

    let quantity: number | undefined = form.quantity ? parseDecimal(form.quantity) : undefined;
    if (security && unitPrice > 0 && !form.quantity) {
      quantity = calcQuantity(amount, unitPrice, fee, tax);
    }
    if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) {
      alert(text.invalidQuantity);
      return;
    }

    const previous = editId ? txs.find((tx) => tx.id === editId) : undefined;
    const t = nowIso();
    const candidate: Transaction = {
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
    };
    const replayBase = txs.filter((tx) => tx.id !== candidate.id);
    const priorState = replayTransactions(replayBase);
    const held = instrumentIsin ? priorState.positions[instrumentIsin]?.qty : undefined;
    const semantic = classifyTransactionAgainstHoldings(candidate, held);
    if (semantic.status !== "accepted") {
      setFinancialError(financialReasonCopy(locale, semantic.reasonCode));
      return;
    }

    try {
      if (security && instrumentIsin && instrumentIsin !== VWCE_ISIN) {
        await upsertInstrument({
          isin: instrumentIsin,
          name: instrumentIsin,
          currency: "EUR",
          createdAt: t,
          updatedAt: t,
        });
      }
      await upsertTransaction(candidate);
    } catch (error) {
      if (error instanceof TransactionSemanticError) {
        setFinancialError(financialReasonCopy(locale, error.result.reasonCode));
      } else {
        setFinancialError(locale === "de"
          ? "Die Transaktion konnte nicht gespeichert werden. Ihre Eingaben bleiben sichtbar."
          : "Không thể lưu giao dịch. Dữ liệu bạn đã nhập vẫn được giữ lại.");
      }
      return;
    }
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
      instrumentIsin: resolveInstrumentIsin(tx) || (tx.type === "buy_vwce" || tx.type === "sell_vwce" ? VWCE_ISIN : ""),
      amount: String(tx.amount),
      unitPrice: String(tx.unitPrice ?? ""),
      quantity: String(tx.quantity ?? ""),
      fee: String(tx.fee ?? 0),
      tax: String(tx.tax ?? 0),
      notes: tx.notes,
    });
    setShow(true);
  }

  function openCreate(type: TxType = "buy_vwce") {
    if (readOnly) {
      showBlocked();
      return;
    }
    setEditId(null);
    setForm({
      ...emptyForm(),
      type,
      instrumentIsin: type === "buy_vwce" || type === "sell_vwce" ? VWCE_ISIN : emptyForm().instrumentIsin,
    });
    setShow(true);
  }

  function resetJournal() {
    setQ("");
    setYearFilter("all");
    setTypeFilter("all");
    setActivityFilter("all");
    setTimeLens("all");
    setInstrumentFilter("all");
    setQualityFilter("all");
    setSort("newest");
  }

  function openFilterSheet() {
    setFilterDraft({
      year: yearFilter,
      type: typeFilter,
      activity: activityFilter,
      timeLens,
      instrument: instrumentFilter,
      quality: qualityFilter,
      sort,
    });
    setFilterSheetOpen(true);
  }

  function resetFilterDraft() {
    setFilterDraft({ year: "all", type: "all", activity: "all", timeLens: "all", instrument: "all", quality: "all", sort: "newest" });
  }

  function applyFilterDraft() {
    setYearFilter(filterDraft.year);
    setTypeFilter(filterDraft.type);
    setActivityFilter(filterDraft.activity);
    setTimeLens(filterDraft.timeLens);
    setInstrumentFilter(filterDraft.instrument);
    setQualityFilter(filterDraft.quality);
    setSort(filterDraft.sort);
    setFilterSheetOpen(false);
  }

  function applySavedView(view: SavedTransactionView) {
    setQ(view.filters.query);
    setYearFilter(view.filters.year);
    setTypeFilter(view.filters.type);
    setActivityFilter(view.filters.activity);
    setTimeLens(view.filters.timeLens);
    setInstrumentFilter("all");
    setQualityFilter("all");
    setSort(view.filters.sort);
    setSavedViewError("");
  }

  function saveCurrentView() {
    const name = savedViewName.trim();
    if (!name) {
      setSavedViewError(text.savedViewNameRequired);
      return;
    }
    if (!activeFilterCount) {
      setSavedViewError(text.savedViewNoFilters);
      return;
    }
    if (savedViews.length >= MAX_SAVED_TRANSACTION_VIEWS) {
      setSavedViewError(text.savedViewLimit.replace("{count}", String(MAX_SAVED_TRANSACTION_VIEWS)));
      return;
    }
    const next = [{ id: uid("view"), name: name.slice(0, 28), createdAt: nowIso(), filters: currentViewFilters }, ...savedViews];
    if (!writeTransactionSavedViews(next)) {
      setSavedViewError(text.savedViewStorageError);
      return;
    }
    setSavedViews(next);
    setSavedViewName("");
    setSavedViewError("");
  }

  function removeSavedView(id: string) {
    const next = savedViews.filter((view) => view.id !== id);
    if (!writeTransactionSavedViews(next)) {
      setSavedViewError(text.savedViewStorageError);
      return;
    }
    setSavedViews(next);
    setSavedViewError("");
  }

  function selectDraftTimeLens(lens: TransactionTimeLens) {
    setFilterDraft((current) => ({ ...current, timeLens: lens, year: lens === "all" ? current.year : "all" }));
  }

  function qualityIssueLabel(code: TransactionQualityCode) {
    switch (code) {
      case "missing_isin": return text.qualityMissingIsin;
      case "invalid_isin": return text.qualityInvalidIsin;
      case "invalid_amount": return text.qualityInvalidAmount;
      case "missing_quantity": return text.qualityMissingQuantity;
      case "missing_unit_price": return text.qualityMissingUnitPrice;
      case "missing_note": return text.qualityMissingNote;
      default: return qualitySemanticReasonCopy(locale, code);
    }
  }

  function qualitySourceLabel(source: TransactionQualitySource) {
    return source === "canonical_replay" ? text.qualitySourceReplay : text.qualitySourceCompleteness;
  }

  function qualityRecordSourceLabel(source: TransactionRecordSource) {
    if (source === "manual") return text.qualityRecordManual;
    if (source === "trade_republic_pdf") return text.qualityRecordTradeRepublic;
    return text.qualityRecordLegacy;
  }

  function qualitySeverityLabel(severity: TransactionQualitySeverity) {
    if (severity === "action") return text.qualityAction;
    if (severity === "review") return text.qualityReview;
    return text.qualityTip;
  }

  async function removeTransaction(id: string) {
    if (readOnly) {
      showBlocked();
      return;
    }
    if (!confirm(text.deleteConfirm)) return;
    await deleteTransaction(id);
    await reload();
  }

  if (loading) {
    return <main className="demo-v10-screen" role="status" aria-label={text.loading} aria-busy="true" />;
  }

  if (loadError) {
    return (
      <main className="demo-v10-screen">
        <section className="demo-v10-gl" style={{ padding: 18 }} role="alert">
          <h1 className="s-title">{text.loadError}</h1>
          <p style={{ color: "var(--demo-dim)", fontSize: 13 }}>{text.safeData}</p>
          <button type="button" className="add-btn" onClick={() => setLoadAttempt((a) => a + 1)}>
            {text.retry}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="demo-v10-screen" aria-label={text.title}>
      <div className="tx-wrap">
      <div className="s-head">
        <h1 className="s-title">{text.title}</h1>
        <div className="tx-head-actions">
          {!readOnly ? (
            <details className="tx-import-tools" onToggle={(event) => setPdfToolsOpen(event.currentTarget.open)}>
              <summary>{pdfImportLabel}</summary>
              {pdfToolsOpen ? <Suspense fallback={<p className="tx-tool-loading" role="status">{text.loading}</p>}><TradeRepublicPdfImport transactions={txs} onTransactionImported={reload} /></Suspense> : null}
            </details>
          ) : null}
          <button type="button" className="add-btn" onClick={() => openCreate()}>
            + {text.add}
          </button>
        </div>
      </div>

      <div className="sum3">
        <div className="gl sum-c">
          <div className="sum-lbl">{text.contributed}</div>
          <div className="sum-val">{formatDisplayMoney(analysis.contributed, locale)}</div>
        </div>
        <div className="gl sum-c">
          <div className="sum-lbl">{text.pnl}</div>
          <div className={`sum-val${analysis.totalPnl == null ? "" : analysis.totalPnl >= 0 ? " pos" : " neg"}`}>{analysis.totalPnl == null ? "—" : formatDisplayMoney(analysis.totalPnl, locale)}</div>
        </div>
        <div className="gl sum-c">
          <div className="sum-lbl">{text.transactionCount}</div>
          <div className="sum-val">{txs.length}</div>
        </div>
      </div>

      <section className="demo-v10-gl tx-quality-summary" aria-label={text.qualityInbox}>
        <div>
          <div className="sum-lbl">{text.qualityInbox}</div>
          <strong>{qualityIssues.length ? text.qualityCount.replace("{count}", String(qualityIssues.length)) : text.qualityClean}</strong>
        </div>
        {qualityIssues.length ? (
          <button
            type="button"
            className="tx-quality-open"
            onClick={() => {
              setQualityFilter("needs_review");
              setFilterSheetOpen(false);
            }}
          >
            {text.qualityOpen} ›
          </button>
        ) : <span className="tx-quality-state clean" aria-hidden>✓</span>}
      </section>

      <section className="tx-journal" aria-label={text.journal}>
        <div className="demo-v10-gl tx-command-deck">
          <div className="tx-journal-head">
            <div>
              <div className="sum-lbl">{text.journal}</div>
              <p className="tx-visible-count" role="status" aria-live="polite">
                {listWindow.hasMore
                  ? text.visibleCount.replace("{visible}", String(listWindow.visible)).replace("{total}", String(listWindow.total))
                  : text.allVisible.replace("{total}", String(listWindow.total))}
              </p>
            </div>
          </div>
          <div className="tx-ledger-tools">
            <label className="tx-search-field">
              <span className="sr-only">{text.searchLedger}</span>
              <input value={q} onChange={(event) => setQ(event.target.value)} placeholder={text.searchPlaceholder} aria-label={text.searchLedger} />
            </label>
            <button type="button" className="tx-tool-trigger" aria-expanded={filterSheetOpen} aria-controls="tx-filter-sheet" onClick={openFilterSheet}>
              {filterSheetOpen ? text.hideTools : text.tools}{activeFilterCount ? " · " + text.activeFilters.replace("{count}", String(activeFilterCount)) : ""}
            </button>
          </div>
          {activeFilterCount ? (
            <div className="tx-active-filter-chips" aria-label={text.activeFilterChips}>
              {q.trim() ? <button type="button" onClick={() => setQ("")}>{q.trim()} ×</button> : null}
              {timeLens !== "all" ? <button type="button" onClick={() => setTimeLens("all")}>{timeLens === "this_month" ? text.thisMonth : timeLens === "last_90_days" ? text.last90Days : timeLens === "this_year" ? text.thisYear : text.lastYear} ×</button> : null}
              {yearFilter !== "all" ? <button type="button" onClick={() => setYearFilter("all")}>{yearFilter} ×</button> : null}
              {typeFilter !== "all" ? <button type="button" onClick={() => setTypeFilter("all")}>{types.find((type) => type.value === typeFilter)?.label ?? typeFilter} ×</button> : null}
              {activityFilter !== "all" ? <button type="button" onClick={() => setActivityFilter("all")}>{activityFilter === "trade" ? text.tradeActivity : activityFilter === "funding" ? text.fundingActivity : text.outflowActivity} ×</button> : null}
              {instrumentFilter !== "all" ? <button type="button" onClick={() => setInstrumentFilter("all")}>{instrumentFilter === "vwce" ? text.instrumentVwce : text.instrumentOther} ×</button> : null}
              {qualityFilter !== "all" ? <button type="button" onClick={() => setQualityFilter("all")}>{qualityFilter === "normal" ? text.statusNormal : text.statusReview} ×</button> : null}
              {sort !== "newest" ? <button type="button" onClick={() => setSort("newest")}>{sort === "oldest" ? text.oldest : text.amountDesc} ×</button> : null}
            </div>
          ) : null}
          <details className="tx-saved-views-entry">
            <summary>{text.savedViews}</summary>
            <div className="tx-saved-view-options">
              {savedViews.map((view) => (
                <span key={view.id} className="tx-saved-view-chip"><button type="button" className={activeSavedViewId === view.id ? "active" : ""} aria-pressed={activeSavedViewId === view.id} onClick={() => applySavedView(view)}>{view.name}</button><button type="button" className="tx-saved-view-remove" aria-label={text.removeSavedView.replace("{name}", view.name)} onClick={() => removeSavedView(view.id)}>×</button></span>
              ))}
            </div>
            <section className="tx-saved-view-editor" aria-label={text.saveView}>
              <div className="tx-saved-view-editor-head"><span>{text.savedViews}</span><small>{savedViews.length}/{MAX_SAVED_TRANSACTION_VIEWS}</small></div>
              <div className="tx-saved-view-form"><input aria-label={text.savedViewName} value={savedViewName} maxLength={28} onChange={(event) => setSavedViewName(event.target.value)} placeholder={text.savedViewNamePlaceholder} /><button type="button" disabled={!activeFilterCount || !savedViewCompatible} onClick={saveCurrentView}>{text.saveCurrentView}</button></div>
              {savedViews.length === 0 ? <p className="tx-saved-view-empty">{text.savedViewEmpty}</p> : null}
              {savedViewError ? <p className="tx-saved-view-error" role="alert">{savedViewError}</p> : null}
            </section>
          </details>
        </div>

      {filterSheetOpen ? (
        <div className="tx-filter-backdrop" role="presentation" onMouseDown={() => setFilterSheetOpen(false)}>
          <section
            id="tx-filter-sheet"
            className="tx-filter-sheet"
            data-testid="tx-filter-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={text.filterSheet}
            onKeyDown={(event) => { if (event.key === "Escape") setFilterSheetOpen(false); }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" aria-hidden />
            <div className="tx-filter-sheet-head">
              <h2>{text.filterSheet}</h2>
              <button type="button" className="tx-filter-close" onClick={() => setFilterSheetOpen(false)} aria-label={text.hideTools}>×</button>
            </div>
            <div className="tx-filter-sheet-body">
              <div className="tx-filter-section" role="group" aria-label={text.timeLens}>
                <span>{text.timeLens}</span>
                <div className="tx-filter-options">
                  {(["all", "this_month", "last_90_days", "this_year", "last_year"] as TransactionTimeLens[]).map((lens) => (
                    <button key={lens} type="button" className={filterDraft.timeLens === lens ? "active" : ""} aria-pressed={filterDraft.timeLens === lens} onClick={() => selectDraftTimeLens(lens)}>
                      {lens === "all" ? text.timeAll : lens === "this_month" ? text.thisMonth : lens === "last_90_days" ? text.last90Days : lens === "this_year" ? text.thisYear : text.lastYear}
                    </button>
                  ))}
                </div>
              </div>
              <div className="tx-filter-section" role="group" aria-label={text.activity}>
                <span>{text.activity}</span>
                <div className="tx-filter-options tx-filter-options-grid">
                  {(["all", "trade", "funding", "outflow"] as TransactionActivity[]).map((activity) => (
                    <button key={activity} type="button" className={filterDraft.activity === activity ? "active" : ""} aria-pressed={filterDraft.activity === activity} onClick={() => setFilterDraft((current) => ({ ...current, activity, type: activity === "all" ? current.type : "all" }))}>
                      {activity === "all" ? text.all : activity === "trade" ? text.tradeActivity : activity === "funding" ? text.fundingActivity : text.outflowActivity}
                    </button>
                  ))}
                </div>
              </div>
              <div className="tx-filter-section" role="group" aria-label={text.instrument}>
                <span>{text.instrument}</span>
                <div className="tx-filter-options">
                  {(["all", "vwce", "other"] as TransactionInstrumentLens[]).map((instrument) => (
                    <button key={instrument} type="button" className={filterDraft.instrument === instrument ? "active" : ""} aria-pressed={filterDraft.instrument === instrument} onClick={() => setFilterDraft((current) => ({ ...current, instrument }))}>
                      {instrument === "all" ? text.all : instrument === "vwce" ? text.instrumentVwce : text.instrumentOther}
                    </button>
                  ))}
                </div>
              </div>
              <div className="tx-filter-section" role="group" aria-label={text.status}>
                <span>{text.status}</span>
                <div className="tx-filter-options">
                  {(["all", "normal", "needs_review"] as TransactionQualityLens[]).map((quality) => (
                    <button key={quality} type="button" className={filterDraft.quality === quality ? "active" : ""} aria-pressed={filterDraft.quality === quality} onClick={() => setFilterDraft((current) => ({ ...current, quality }))}>
                      {quality === "all" ? text.all : quality === "normal" ? text.statusNormal : text.statusReview}
                    </button>
                  ))}
                </div>
              </div>
              <div className="tx-filter-section" role="group" aria-label={text.sort}>
                <span>{text.sort}</span>
                <div className="tx-filter-options">
                  {(["newest", "oldest", "amount_desc"] as TransactionSort[]).map((nextSort) => (
                    <button key={nextSort} type="button" className={filterDraft.sort === nextSort ? "active" : ""} aria-pressed={filterDraft.sort === nextSort} onClick={() => setFilterDraft((current) => ({ ...current, sort: nextSort }))}>
                      {nextSort === "newest" ? text.newest : nextSort === "oldest" ? text.oldest : text.amountDesc}
                    </button>
                  ))}
                </div>
              </div>
              <details className="tx-filter-more">
                <summary>{locale === "de" ? "Weitere Filter" : "Bộ lọc khác"}</summary>
                <div className="tx-filter-section" role="group" aria-label={text.year}>
                  <span>{text.year}</span>
                  <div className="tx-filter-options">
                    <button type="button" className={filterDraft.year === "all" ? "active" : ""} aria-pressed={filterDraft.year === "all"} onClick={() => setFilterDraft((current) => ({ ...current, year: "all" }))}>{text.all}</button>
                    {years.map((year) => <button key={year} type="button" className={filterDraft.year === year ? "active" : ""} aria-pressed={filterDraft.year === year} onClick={() => setFilterDraft((current) => ({ ...current, year, timeLens: "all" }))}>{year}</button>)}
                  </div>
                </div>
                <div className="tx-filter-section" role="group" aria-label={text.type}>
                  <span>{text.type}</span>
                  <div className="tx-filter-options">
                    <button type="button" className={filterDraft.type === "all" ? "active" : ""} aria-pressed={filterDraft.type === "all"} onClick={() => setFilterDraft((current) => ({ ...current, type: "all" }))}>{text.all}</button>
                    {types.map((type) => <button key={type.value} type="button" className={filterDraft.type === type.value ? "active" : ""} aria-pressed={filterDraft.type === type.value} onClick={() => setFilterDraft((current) => ({ ...current, type: type.value, activity: "all" }))}>{type.label}</button>)}
                  </div>
                </div>
              </details>
            </div>
            <div className="tx-filter-actions" data-testid="tx-filter-actions">
              <button type="button" className="secondary" onClick={resetFilterDraft}>{text.clearFilters}</button>
              <button type="button" data-testid="tx-filter-apply" onClick={applyFilterDraft}>{text.applyFilters}</button>
            </div>
          </section>
        </div>
      ) : null}

      {listWindow.total === 0 ? (
        <section className="demo-v10-gl" style={{ padding: 18 }}>
          <p style={{ color: "var(--demo-dim)", margin: 0 }}>
            {txs.length === 0 ? text.noTransactions : text.noMatches}
          </p>
          {txs.length === 0 ? (
            <button type="button" className="add-btn" style={{ marginTop: 12 }} onClick={() => openCreate()}>
              + {text.quickBuy}
            </button>
          ) : null}
        </section>
      ) : (
        <>
          {listWindow.groups.map(({ key, transactions: rows }) => (
          <div key={key}>
            <div className="mo-lbl">{monthLabel(key)}</div>
            <section className="gl tx-card">
              {rows.map((tx) => {
                const meta = types.find((t) => t.value === tx.type);
                const sign = meta?.sign ?? "~";
                const isin = resolveInstrumentIsin(tx);
                return (
                  <article key={tx.id} className="tx-item">
                    <button
                      type="button"
                      className="tx-item-main"
                      onClick={() => openEdit(tx)}
                      aria-label={`${meta?.label ?? tx.type}, ${formatDisplayDate(tx.date, locale)}, ${formatDisplayMoney(tx.amount, locale)}`}
                    >
                      <span className={`tx-ico ${iconClass(tx.type)}`} aria-hidden>
                        {iconGlyph(tx.type)}
                      </span>
                      <span className="tx-b">
                        <span className="tx-name">{meta?.label ?? tx.type}</span>
                        <span className="tx-meta">
                          <span>{formatDisplayDate(tx.date, locale)}</span>
                          {isin ? <span className="tx-isin">{isin}</span> : null}
                          {tx.notes ? <span className="tx-note">{tx.notes}</span> : null}
                        </span>
                      </span>
                      <span className="tx-r">
                        <span className={"tx-amt" + (sign === "+" ? " pos" : sign === "-" ? " neg" : "")}>
                          {sign === "-" ? "−" : sign === "+" ? "+" : ""}{formatDisplayMoney(tx.amount, locale)}
                        </span>
                        {tx.quantity != null ? <span className="tx-sec">{text.quantity} {formatDisplayQuantity(tx.quantity, locale)}</span> : null}
                      </span>
                    </button>
                    {!readOnly ? (
                      <ActionMenu
                        ariaLabel={text.rowMenu}
                        actions={[
                          { label: text.edit, onClick: () => openEdit(tx) },
                          { label: text.delete, danger: true, onClick: () => removeTransaction(tx.id) },
                        ]}
                      />
                    ) : null}
                  </article>
                );
              })}
            </section>
          </div>
          ))}
          {listWindow.hasMore ? (
            <button
              type="button"
              className="tx-load-more"
              onClick={() => setVisibleLimit((limit) => limit + TRANSACTION_WINDOW_SIZE)}
            >
              {text.loadMore.replace("{count}", String(Math.min(TRANSACTION_WINDOW_SIZE, listWindow.remaining)))}
            </button>
          ) : null}
        </>
      )}
      </section>

      {show ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="sheet-handle" aria-hidden />
            <h2>{editId ? text.editTransaction : text.addTransaction}</h2>
            <div className="field">
              <label htmlFor="f-date">{text.date}</label>
              <input id="f-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="f-type">{text.type}</label>
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
                {types.map((type) => (
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
              <label htmlFor="f-amt">{security ? text.totalPayment : text.amount}</label>
              <input id="f-amt" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            {security ? (
              <>
                <div className="field">
                  <label htmlFor="f-price">{text.unitPrice}</label>
                  <input id="f-price" inputMode="decimal" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="f-qty">{isSecuritySell(form.type) ? text.sellQuantity : text.autoQuantity}</label>
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
                    <label htmlFor="f-fee">{text.fee}</label>
                    <input id="f-fee" inputMode="decimal" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="f-tax">{text.tax}</label>
                    <input id="f-tax" inputMode="decimal" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} />
                  </div>
                </div>
              </>
            ) : null}
            <div className="field">
              <label htmlFor="f-notes">{text.notes}{form.type === "adjust" ? text.notesRequired : ""}</label>
              <textarea id="f-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            {financialError ? <p role="alert" style={{ color: "var(--color-danger)", fontSize: 13 }}>{financialError}</p> : null}
            <div className="stack">
              <button type="button" onClick={() => void save()}>{text.save}</button>
              <button type="button" data-dialog-close className="secondary" onClick={() => setShow(false)}>{text.cancel}</button>
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
                  {text.delete}
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
