import { useDeferredValue, useEffect, useMemo, useState } from "react";
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
import { useLocale } from "../lib/locale";
import { analyzeTransactions } from "../lib/transactionAnalytics";
import TradeRepublicPdfImport from "../components/TradeRepublicPdfImport";
import ActionMenu from "../components/ActionMenu";
import {
  buildTransactionListWindow,
  TRANSACTION_WINDOW_SIZE,
  type TransactionActivity,
  type TransactionSort,
} from "./transactionsListWindow";
import "../styles/demo-v10-transactions.css";

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

export default function Transactions() {
  const { locale } = useLocale();
  const types = useMemo(() => transactionTypes(locale), [locale]);
  const text = locale === "de" ? {
    loading: "Transaktionen werden geladen", loadError: "Transaktionen konnten nicht geladen werden", safeData: "Die Daten auf diesem Gerät bleiben unverändert.", retry: "Erneut versuchen", title: "Transaktionen", add: "Hinzufügen", contributed: "Eingezahlt", pnl: "Gewinn / Verlust", buys: "Käufe", analysis: "Analyse aus dem Transaktionsbuch", positions: "offene Positionen", noPositions: "Keine Position", missingPrices: "Kursdaten fehlen", valued: "Bewertet", holdings: "Wert der Wertpapiere", realized: "Realisierter Gewinn / Verlust", unrealized: "Nicht realisierter Gewinn / Verlust", feesTax: "Gebühren & Steuern", analysisNote: "Der Gesamtgewinn wird nicht berechnet, wenn {reason}. Ergänzen Sie Kurse oder Transaktionsdaten für eine genaue Bewertung.", missingQuote: "Kurse fehlen für {isins}", missingLots: "Kauf- oder Verkaufsmenge fehlt", hideTools: "Werkzeuge ausblenden", tools: "Filter / PDF", search: "Suchen", searchPlaceholder: "Notiz, Typ, ISIN…", year: "Jahr", all: "Alle", type: "Typ", noTransactions: "Noch keine Transaktionen.", noMatches: "Keine Transaktionen entsprechen dem Filter.", visibleCount: "{visible} von {total} Transaktionen", loadMore: "{count} weitere laden", allVisible: "Alle {total} Transaktionen werden angezeigt", journal: "Transaktionsjournal", quickFilter: "Schnellfilter", buysQuick: "VWCE-Käufe", contributionsQuick: "Einzahlungen", addFirst: "Erste Transaktion hinzufügen", quantity: "Menge", edit: "Bearbeiten", addTransaction: "Transaktion hinzufügen", date: "Datum", amount: "Betrag", totalPayment: "Gesamtzahlung", unitPrice: "Preis je Einheit", sellQuantity: "Menge (beim Verkauf erforderlich)", autoQuantity: "Menge (leer = automatisch berechnet)", fee: "Gebühr", tax: "Steuer", notes: "Notiz", notesRequired: " (erforderlich)", save: "Speichern", cancel: "Abbrechen", delete: "Löschen", deleteConfirm: "Diese Transaktion löschen?", activity: "Aktivität", tradeActivity: "Wertpapiere", fundingActivity: "Einzahlungen", outflowActivity: "Ausgaben", newest: "Neueste zuerst", oldest: "Älteste zuerst", amountDesc: "Höchster Betrag", sort: "Sortierung", activeFilters: "{count} aktiv", clearFilters: "Zurücksetzen", quickBuy: "VWCE kaufen", quickFunding: "Geld einzahlen", rowMenu: "Aktionen für Transaktion",
  } : {
    loading: "Đang tải Giao dịch", loadError: "Không tải được Giao dịch", safeData: "Dữ liệu trên thiết bị vẫn được giữ nguyên.", retry: "Thử lại", title: "Giao dịch", add: "Thêm", contributed: "Tổng góp", pnl: "Lãi / lỗ", buys: "Số lần mua", analysis: "Phân tích từ sổ giao dịch", positions: "vị thế đang mở", noPositions: "Chưa có vị thế", missingPrices: "Chưa đủ dữ liệu giá", valued: "Đã định giá", holdings: "Giá trị chứng khoán", realized: "Lãi / lỗ đã chốt", unrealized: "Lãi / lỗ tạm tính", feesTax: "Phí & thuế", analysisNote: "Không suy ra lợi nhuận tổng khi {reason}. Thêm giá hoặc hoàn thiện giao dịch để định giá chính xác.", missingQuote: "thiếu giá cho {isins}", missingLots: "thiếu dữ liệu số lượng mua/bán", hideTools: "Ẩn công cụ", tools: "Lọc / PDF", search: "Tìm", searchPlaceholder: "Ghi chú, loại, ISIN…", year: "Năm", all: "Tất cả", type: "Loại", noTransactions: "Chưa có giao dịch.", noMatches: "Không có giao dịch khớp bộ lọc.", visibleCount: "Đang hiển thị {visible}/{total} giao dịch", loadMore: "Tải thêm {count} giao dịch", allVisible: "Đã hiển thị toàn bộ {total} giao dịch", journal: "Nhật ký giao dịch", quickFilter: "Lọc nhanh", buysQuick: "Mua VWCE", contributionsQuick: "Góp tiền", addFirst: "Thêm giao dịch đầu tiên", quantity: "SL", edit: "Sửa", addTransaction: "Thêm giao dịch", date: "Ngày", amount: "Số tiền", totalPayment: "Tổng tiền thanh toán", unitPrice: "Giá một đơn vị", sellQuantity: "Số lượng (bắt buộc khi bán)", autoQuantity: "Số lượng (để trống = tự tính)", fee: "Phí", tax: "Thuế", notes: "Ghi chú", notesRequired: " (bắt buộc)", save: "Lưu", cancel: "Hủy", delete: "Xóa", deleteConfirm: "Xóa giao dịch này?", activity: "Dòng tiền", tradeActivity: "Đầu tư", fundingActivity: "Tiền vào", outflowActivity: "Chi ra", newest: "Mới nhất", oldest: "Cũ nhất", amountDesc: "Số tiền cao nhất", sort: "Sắp xếp", activeFilters: "{count} bộ lọc", clearFilters: "Xóa lọc", quickBuy: "Mua VWCE", quickFunding: "Góp tiền", rowMenu: "Tùy chọn giao dịch",
  };
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [trackInAppCash, setTrackInAppCash] = useState<boolean | undefined>(undefined);
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
  const [activityFilter, setActivityFilter] = useState<TransactionActivity>("all");
  const [sort, setSort] = useState<TransactionSort>("newest");
  const [visibleLimit, setVisibleLimit] = useState(TRANSACTION_WINDOW_SIZE);
  const deferredQuery = useDeferredValue(q);
  const [qtyError, setQtyError] = useState("");
  const [isinError, setIsinError] = useState("");
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

  useEffect(() => {
    setVisibleLimit(TRANSACTION_WINDOW_SIZE);
  }, [activityFilter, deferredQuery, sort, typeFilter, yearFilter]);

  const listWindow = useMemo(
    () => buildTransactionListWindow(txs, {
      query: deferredQuery,
      year: yearFilter,
      type: typeFilter,
      activity: activityFilter,
      sort,
      typeSearchTerms,
    }, visibleLimit),
    [activityFilter, deferredQuery, sort, txs, typeFilter, typeSearchTerms, visibleLimit, yearFilter],
  );

  const activeFilterCount = Number(Boolean(q.trim())) + Number(yearFilter !== "all") + Number(typeFilter !== "all") + Number(activityFilter !== "all") + Number(sort !== "newest");

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
    setSort("newest");
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
        <button type="button" className="add-btn" onClick={() => openCreate()}>
          + {text.add}
        </button>
      </div>

      <div className="sum3">
        <div className="gl sum-c">
          <div className="sum-lbl">{text.contributed}</div>
          <div className="sum-val">{formatMoney(analysis.contributed)}</div>
        </div>
        <div className="gl sum-c">
          <div className="sum-lbl">{text.pnl}</div>
          <div className={`sum-val${analysis.totalPnl == null ? "" : analysis.totalPnl >= 0 ? " pos" : " neg"}`}>{analysis.totalPnl == null ? "—" : formatMoney(analysis.totalPnl)}</div>
        </div>
        <div className="gl sum-c">
          <div className="sum-lbl">{text.buys}</div>
          <div className="sum-val">{analysis.buyCount}</div>
        </div>
      </div>

      <section className="gl tx-analysis" aria-label={text.analysis}>
        <div className="tx-analysis-head">
          <div>
            <div className="sum-lbl">{text.analysis}</div>
            <strong>{analysis.openPositions} {text.positions}</strong>
          </div>
          <span className={analysisIsEmpty ? "analysis-state neutral" : analysis.totalPnl == null ? "analysis-state warn" : "analysis-state ok"}>
            {analysisIsEmpty ? text.noPositions : analysis.totalPnl == null ? text.missingPrices : text.valued}
          </span>
        </div>
        <div className="tx-analysis-grid">
          <div><span>{text.holdings}</span><strong>{analysis.holdingsValue == null ? "—" : formatMoney(analysis.holdingsValue)}</strong></div>
          <div><span>{text.realized}</span><strong className={analysis.realizedPnl >= 0 ? "pos" : "neg"}>{formatMoney(analysis.realizedPnl)}</strong></div>
          <div><span>{text.unrealized}</span><strong className={analysis.unrealizedPnl == null ? "" : analysis.unrealizedPnl >= 0 ? "pos" : "neg"}>{analysis.unrealizedPnl == null ? "—" : formatMoney(analysis.unrealizedPnl)}</strong></div>
          <div><span>{text.feesTax}</span><strong>{formatMoney(analysis.feesAndTax)}</strong></div>
        </div>
        {analysis.missingQuotes.length || analysis.incompleteLots.length ? (
          <p className="tx-analysis-note">{text.analysisNote.replace("{reason}", analysis.missingQuotes.length ? text.missingQuote.replace("{isins}", analysis.missingQuotes.join(", ")) : text.missingLots)}</p>
        ) : null}
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
            <button type="button" className="tx-tool-trigger" aria-expanded={toolsOpen} onClick={() => setToolsOpen((v) => !v)}>
              {toolsOpen ? text.hideTools : text.tools}{activeFilterCount ? ` · ${text.activeFilters.replace("{count}", String(activeFilterCount))}` : ""}
            </button>
          </div>

          <div className="tx-quick-create" aria-label={text.addTransaction}>
            <button type="button" onClick={() => openCreate("buy_vwce")}>+ {text.quickBuy}</button>
            <button type="button" onClick={() => openCreate("cash_in")}>+ {text.quickFunding}</button>
          </div>

          <div className="tx-quick-types" role="group" aria-label={text.quickFilter}>
            <button type="button" className={activityFilter === "all" ? "active" : ""} aria-pressed={activityFilter === "all"} onClick={() => { setActivityFilter("all"); setTypeFilter("all"); }}>{text.all}</button>
            <button type="button" className={activityFilter === "trade" ? "active" : ""} aria-pressed={activityFilter === "trade"} onClick={() => { setActivityFilter("trade"); setTypeFilter("all"); }}>{text.tradeActivity}</button>
            <button type="button" className={activityFilter === "funding" ? "active" : ""} aria-pressed={activityFilter === "funding"} onClick={() => { setActivityFilter("funding"); setTypeFilter("all"); }}>{text.fundingActivity}</button>
            <button type="button" className={activityFilter === "outflow" ? "active" : ""} aria-pressed={activityFilter === "outflow"} onClick={() => { setActivityFilter("outflow"); setTypeFilter("all"); }}>{text.outflowActivity}</button>
          </div>
        </div>

      {toolsOpen ? (
        <section className="demo-v10-gl tx-tool-panel">
          {!readOnly ? <TradeRepublicPdfImport transactions={txs} onTransactionImported={reload} /> : null}
          <div className="field" style={{ marginTop: 8 }}>
            <label htmlFor="tx-search">{text.search}</label>
            <input id="tx-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={text.searchPlaceholder} />
          </div>
          <div className="tx-tool-grid">
            <div className="field">
              <label htmlFor="tx-year">{text.year}</label>
              <select id="tx-year" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
                <option value="all">{text.all}</option>
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tx-type">{text.type}</label>
              <select
                id="tx-type"
                value={typeFilter}
                onChange={(e) => { setActivityFilter("all"); setTypeFilter(e.target.value as "all" | TxType); }}
              >
                <option value="all">{text.all}</option>
                {types.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tx-sort">{text.sort}</label>
              <select id="tx-sort" value={sort} onChange={(e) => setSort(e.target.value as TransactionSort)}>
                <option value="newest">{text.newest}</option>
                <option value="oldest">{text.oldest}</option>
                <option value="amount_desc">{text.amountDesc}</option>
              </select>
            </div>
            <div className="field tx-tool-reset">
              <label>{text.quickFilter}</label>
              <button type="button" className="secondary" disabled={!activeFilterCount} onClick={resetJournal}>{text.clearFilters}</button>
            </div>
          </div>
        </section>
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
                      aria-label={`${meta?.label ?? tx.type}, ${formatDateVN(tx.date)}, ${formatMoney(tx.amount)}`}
                    >
                      <span className={`tx-ico ${iconClass(tx.type)}`} aria-hidden>
                        {iconGlyph(tx.type)}
                      </span>
                      <span className="tx-b">
                        <span className="tx-name">{meta?.label ?? tx.type}</span>
                        <span className="tx-meta">
                          <span>{formatDateVN(tx.date)}</span>
                          {isin ? <span className="tx-isin">{isin}</span> : null}
                          {tx.notes ? <span className="tx-note">{tx.notes}</span> : null}
                        </span>
                      </span>
                      <span className="tx-r">
                        <span className={"tx-amt" + (sign === "+" ? " pos" : sign === "-" ? " neg" : "")}>
                          {sign === "-" ? "−" : sign === "+" ? "+" : ""}{formatMoney(tx.amount)}
                        </span>
                        {tx.quantity != null ? <span className="tx-sec">{text.quantity} {tx.quantity.toFixed(4)}</span> : null}
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
            <h2>{editId ? text.edit : text.addTransaction}</h2>
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
            <div className="stack">
              <button type="button" onClick={() => void save()}>{text.save}</button>
              <button type="button" className="secondary" onClick={() => setShow(false)}>{text.cancel}</button>
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
