import { useEffect, useMemo, useRef, useState } from "react";
import { getSettings, listGoals, listTransactions, saveSettings } from "../lib/db";
import type {
  AppSettings,
  DocumentLocation,
  EmergencyContact,
  Goal,
  Notfallmappe as NotfallmappeData,
  Transaction,
} from "../lib/types";
import { defaultNotfallmappe, nowIso, uid } from "../lib/defaults";
import { buildEquitySeries } from "../lib/calc";
import { printNotfallmappe } from "../lib/printNotfallmappe";
import { useRecoveryReadOnly } from "../lib/recoveryReadOnly";
import { useLocale } from "../lib/locale";
import { formatDisplayDate, formatDisplayMoney, formatDisplayQuantity } from "../ui/localeFormatting";
import "../styles/notfallmappe.css";
import "../styles/notfallmappe-save-state.css";

/**
 * V10-A7 — Hồ sơ khẩn cấp.
 *
 * Nguyên tắc không thương lượng:
 *  1. Không có ô nhập mật khẩu / PIN / TAN.
 *  2. Chỉ ghi NƠI CẤT giấy tờ gốc, không tải bản chụp lên.
 *  3. Nội dung có đồng bộ lên máy chủ — nói rõ, không giấu.
 *  4. Máy tự đọc lại nội dung và cảnh báo nếu thấy bí mật lọt vào.
 *
 * Lưu ngay (không debounce): mọi thay đổi được enqueue vào outbox ngay lập tức.
 * Điều này đảm bảo logout-safety-check thấy pending > 0 và không cho
 * đăng xuất khi data chưa sync lên Supabase.
 *
 * Bản in: không in giao diện app. Dựng iframe riêng, thay input/textarea
 * bằng chữ tĩnh, rồi in iframe. Tránh vệt đen do iOS Safari phóng ô nhập.
 */

const SECRET_RE =
  /(mật\s*khẩu|mat\s*khau|matkhau|password|passwort|kennwort|\bpin\b|\btan\b|\botp\b|seed\s*phrase|private\s*key|recovery\s*phrase)/i;

/** IBAN đầy đủ, ví dụ DE89 3704 0044 0532 0130 00. */
const IBAN_RE = /\b[A-Z]{2}\s?\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/;

type SaveState = "saved" | "saving" | "error";

export default function NotfallmappePage() {
  const { locale } = useLocale();
  const copy = (vi: string, de: string) => (locale === "de" ? de : vi);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [data, setData] = useState<NotfallmappeData | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialLoadError, setInitialLoadError] = useState(false);
  const [initialLoadAttempt, setInitialLoadAttempt] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const { readOnly, showBlocked } = useRecoveryReadOnly();

  const rootRef = useRef<HTMLDivElement>(null);
  // dataRef luôn giữ snapshot mới nhất để các handler có thể merge đúng
  const dataRef = useRef<NotfallmappeData | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveSequence = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setInitialLoading(true);
    setInitialLoadError(false);
    void (async () => {
      try {
        const [nextSettings, nextGoals, nextTransactions] = await Promise.all([
          getSettings(),
          listGoals(),
          listTransactions(),
        ]);
        if (cancelled) return;
        setSettings(nextSettings);
        setData(nextSettings.notfallmappe ?? defaultNotfallmappe());
        setGoals(nextGoals);
        setTxs(nextTransactions);
      } catch {
        if (cancelled) return;
        setInitialLoadError(true);
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialLoadAttempt]);

  const snap = useMemo(() => {
    const price = settings?.latestVwcePrice ?? 0;
    const series = buildEquitySeries(txs, price);
    const total = series.length ? series[series.length - 1].value : 0;
    let qty = 0;
    for (const t of txs) {
      if (t.type === "buy_vwce") qty += t.quantity ?? 0;
      else if (t.type === "sell_vwce") qty -= t.quantity ?? 0;
    }
    return { total, qty, price };
  }, [txs, settings]);

  const filled = useMemo(() => {
    if (!data) return [false, false, false, false, false];
    return [
      Boolean(data.purpose.trim() || data.custodyNote.trim()),
      Boolean(
        data.brokerName.trim() &&
          (data.cashBankName.trim() || data.cashAccountNote.trim()),
      ),
      data.contacts.some((c) => c.name.trim() && c.phone.trim()),
      data.documents.some((d) => d.location.trim()),
      Boolean(data.wishes.trim()),
    ];
  }, [data]);

  const filledCount = filled.filter(Boolean).length;

  const risks = useMemo(() => {
    if (!data) return [] as string[];
    const parts: { label: string; text: string }[] = [
      { label: copy("Mục 1", "Abschnitt 1"), text: `${data.purpose} ${data.custodyNote}` },
      {
        label: copy("Mục 2", "Abschnitt 2"),
        text: `${data.brokerName} ${data.brokerAccountType} ${data.cashBankName} ${data.cashAccountNote}`,
      },
      {
        label: copy("Mục 3", "Abschnitt 3"),
        text: data.contacts.map((c) => `${c.name} ${c.relation} ${c.email}`).join(" "),
      },
      {
        label: copy("Mục 4", "Abschnitt 4"),
        text: data.documents.map((d) => `${d.label} ${d.location}`).join(" "),
      },
      { label: copy("Mục 5", "Abschnitt 5"), text: data.wishes },
    ];
    const out: string[] = [];
    for (const p of parts) {
      if (SECRET_RE.test(p.text)) {
        out.push(locale === "de" ? `${p.label} enthält möglicherweise ein Passwort, eine PIN oder TAN. Bitte entfernen Sie diese Angabe.` : `${p.label} có vẻ chứa mật khẩu, PIN hoặc TAN. Hãy xóa khỏi đây.`);
      }
      if (IBAN_RE.test(p.text)) {
        out.push(locale === "de" ? `${p.label} enthält möglicherweise eine vollständige IBAN. Notieren Sie nur die letzten vier Ziffern.` : `${p.label} có vẻ chứa số IBAN đầy đủ. Chỉ nên ghi 4 số cuối.`);
      }
    }
    return out;
  }, [data, locale]);

  if (initialLoading) {
    return (
      <div className="empty card" role="status" aria-live="polite" aria-busy="true">
        <p>{copy("Đang tải Hồ sơ khẩn cấp…", "Notfallmappe wird geladen…")}</p>
      </div>
    );
  }

  if (initialLoadError || !data) {
    return (
      <section className="empty card" role="alert">
        <h1 className="page-title">{copy("Không tải được Hồ sơ khẩn cấp", "Notfallmappe konnte nicht geladen werden")}</h1>
        <p>{copy("Hồ sơ trên thiết bị không bị thay đổi. Không có nội dung nhạy cảm nào được hiển thị.", "Die Daten auf diesem Gerät wurden nicht verändert. Es werden keine sensiblen Inhalte angezeigt.")}</p>
        <button type="button" onClick={() => setInitialLoadAttempt((attempt) => attempt + 1)}>
          {copy("Thử lại", "Erneut versuchen")}
        </button>
      </section>
    );
  }

  function enqueueSave(next: NotfallmappeData): Promise<boolean> {
    const sequence = ++saveSequence.current;
    if (mounted.current) {
      setSaveState("saving");
      setSaveError(null);
    }
    const run = async () => {
      try {
        await saveSettings({ notfallmappe: next });
        if (mounted.current && sequence === saveSequence.current) {
          setSaveState("saved");
          setSaveError(null);
        }
        return true;
      } catch {
        if (mounted.current && sequence === saveSequence.current) {
          setSaveState("error");
          setSaveError(copy("Không lưu được Hồ sơ khẩn cấp. Bản đang chỉnh vẫn còn trên màn hình.", "Die Notfallmappe konnte nicht gespeichert werden. Ihre aktuelle Bearbeitung bleibt auf dem Bildschirm."));
        }
        return false;
      }
    };
    const queued = saveQueue.current.then(run, run);
    saveQueue.current = queued.then(() => undefined, () => undefined);
    return queued;
  }

  /**
   * Lưu ngay — không debounce.
   * enqueueOutbox được gọi bên trong saveSettings, đảm bảo outboxCount > 0
   * ngay sau khi user thay đổi. Logout-safety-check sẽ thấy pending và chặn
   * đăng xuất cho đến khi sync hoàn tất.
   */
  function save(next: NotfallmappeData) {
    setData(next);
    dataRef.current = next;
    void enqueueSave(next);
  }

  function patch(p: Partial<NotfallmappeData>) {
    if (readOnly) { showBlocked(); return; }
    const base = dataRef.current;
    if (!base) return;
    save({ ...base, ...p, updatedAt: nowIso() });
  }

  function patchContact(id: string, p: Partial<EmergencyContact>) {
    if (readOnly) { showBlocked(); return; }
    const base = dataRef.current;
    if (!base) return;
    save({
      ...base,
      contacts: base.contacts.map((c) => (c.id === id ? { ...c, ...p } : c)),
      updatedAt: nowIso(),
    });
  }

  function patchDoc(id: string, p: Partial<DocumentLocation>) {
    if (readOnly) { showBlocked(); return; }
    const base = dataRef.current;
    if (!base) return;
    save({
      ...base,
      documents: base.documents.map((x) => (x.id === id ? { ...x, ...p } : x)),
      updatedAt: nowIso(),
    });
  }

  function removeContact(id: string) {
    if (readOnly) { showBlocked(); return; }
    const base = dataRef.current;
    if (!base) return;
    save({ ...base, contacts: base.contacts.filter((c) => c.id !== id), updatedAt: nowIso() });
  }

  function addContact() {
    if (readOnly) { showBlocked(); return; }
    const base = dataRef.current;
    if (!base) return;
    save({
      ...base,
      contacts: [...base.contacts, { id: uid("ct"), name: "", relation: "", phone: "", email: "" }],
      updatedAt: nowIso(),
    });
  }

  function removeDocument(id: string) {
    if (readOnly) { showBlocked(); return; }
    const base = dataRef.current;
    if (!base) return;
    save({ ...base, documents: base.documents.filter((x) => x.id !== id), updatedAt: nowIso() });
  }

  function addDocument() {
    if (readOnly) { showBlocked(); return; }
    const base = dataRef.current;
    if (!base) return;
    save({
      ...base,
      documents: [...base.documents, { id: uid("doc"), label: "", location: "" }],
      updatedAt: nowIso(),
    });
  }

  async function persist(extra?: Partial<NotfallmappeData>): Promise<boolean> {
    if (readOnly) { showBlocked(); return false; }
    const base = dataRef.current;
    if (!base) return false;
    const next: NotfallmappeData = { ...base, ...extra, updatedAt: nowIso() };
    setData(next);
    dataRef.current = next;
    return enqueueSave(next);
  }

  async function handlePrint() {
    if (readOnly) { showBlocked(); return; }
    const saved = await persist({ lastPrintedAt: nowIso() });
    if (!saved) return;
    const root = rootRef.current;
    if (!root) return;
    printNotfallmappe(root);
  }

  function retrySave() {
    if (readOnly) { showBlocked(); return; }
    const latest = dataRef.current;
    if (latest) void enqueueSave(latest);
  }

  const childLabel = settings?.childName?.trim() || copy("bé", "dem Kind");

  const statusText = saveState === "saving"
    ? copy("Đang lưu…", "Wird gespeichert…")
    : saveState === "error"
      ? copy("Chưa lưu được", "Noch nicht gespeichert")
      : data.updatedAt
        ? `${copy("Đã lưu · cập nhật", "Gespeichert · aktualisiert")} ${formatDisplayDate(data.updatedAt.slice(0, 10), locale)}`
        : copy("Đã lưu", "Gespeichert");

  const statusClass = saveState === "saving"
    ? "nfm-status is-saving"
    : saveState === "error"
      ? "nfm-status is-error"
      : "nfm-status";

  return (
    <div className="nfm" ref={rootRef}>
      <p className="nfm-warn">
        <strong>{copy("Lưu ý", "Hinweis")}</strong>
        <span>
          {copy("Không bao giờ ghi mật khẩu, mã PIN hay mã TAN vào đây. Chỉ ghi nơi cất giấy tờ gốc. Nội dung này được đồng bộ lên tài khoản của bạn.", "Tragen Sie hier niemals Passwörter, PINs oder TANs ein. Notieren Sie nur den Aufbewahrungsort von Originaldokumenten. Diese Inhalte werden mit Ihrem Konto synchronisiert.")}
        </span>
      </p>

      {risks.length > 0 && (
        <ul className="nfm-risk">
          {risks.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      <div className="nfm-progress">
        <div className="nfm-progress-track">
          <div
            className="nfm-progress-fill"
            style={{ width: `${(filledCount / 5) * 100}%` }}
          />
        </div>
        <span className="nfm-progress-text">{locale === "de" ? `${filledCount}/5 Abschnitte ausgefüllt` : `${filledCount}/5 mục đã điền`}</span>
      </div>

      <div className="nfm-print-note">
        <p>
          <strong>{copy("Bản in giấy mới là bản dùng được.", "Nur ein Ausdruck auf Papier ist im Ernstfall nutzbar.")}</strong> {copy("Trang này nằm sau màn hình đăng nhập của riêng bạn, nên nếu có chuyện xảy ra, người thân sẽ không mở được. Hãy in ra và cất cùng chỗ với giấy tờ gốc.", "Diese Seite liegt hinter Ihrer persönlichen Anmeldung. Angehörige können sie im Notfall nicht öffnen. Drucken Sie sie aus und bewahren Sie sie bei den Originaldokumenten auf.")}
        </p>
        <p className="nfm-print-when">
          {data.lastPrintedAt
            ? `${copy("In gần nhất", "Zuletzt gedruckt")} ${formatDisplayDate(data.lastPrintedAt.slice(0, 10), locale)}`
            : copy("Chưa in lần nào", "Noch nie gedruckt")}
        </p>
      </div>

      <details className="nfm-sec">
        <summary>
          <span className="nfm-sec-num">1</span>
          <span className="nfm-sec-title">{copy("Quỹ này là gì", "Worum geht es bei diesem Fonds?")}</span>
          <span className={filled[0] ? "nfm-sec-state ok" : "nfm-sec-state"}>
            {filled[0] ? copy("Đã điền", "Ausgefüllt") : copy("Chưa điền", "Nicht ausgefüllt")}
          </span>
          <span className="nfm-chev" aria-hidden>›</span>
        </summary>
        <div className="nfm-box">
          <label className="nfm-field">
            <span>{copy("Số tiền này dành cho ai và để làm gì", "Für wen ist dieses Geld bestimmt und wofür?")}</span>
            <textarea
              value={data.purpose}
              onChange={(e) => patch({ purpose: e.target.value })}
              placeholder={locale === "de" ? `Schreiben Sie für jemanden ohne Kenntnisse über den Fonds. Beispiel: Dieses Geld ist für ${childLabel} und soll ab 06/2038 verwendet werden.` : `Viết cho người không biết gì về quỹ. Ví dụ: đây là tiền dành cho ${childLabel}, dự kiến dùng từ 06/2038.`}
            />
          </label>
          <label className="nfm-field">
            <span>{copy("Tiền đứng tên ai, và thực sự thuộc về ai", "Auf wessen Namen läuft das Geld und wem gehört es tatsächlich?")}</span>
            <textarea
              value={data.custodyNote}
              onChange={(e) => patch({ custodyNote: e.target.value })}
              placeholder={copy("Ví dụ: tài khoản đứng tên cha/mẹ nhưng toàn bộ số tiền là của bé.", "Beispiel: Das Konto läuft auf ein Elternteil, aber das gesamte Geld gehört dem Kind.")}
            />
          </label>
        </div>
      </details>

      <details className="nfm-sec">
        <summary>
          <span className="nfm-sec-num">2</span>
          <span className="nfm-sec-title">{copy("Tài sản đang ở đâu", "Wo befinden sich die Vermögenswerte?")}</span>
          <span className={filled[1] ? "nfm-sec-state ok" : "nfm-sec-state"}>
            {filled[1] ? copy("Đã điền", "Ausgefüllt") : copy("Chưa điền", "Nicht ausgefüllt")}
          </span>
          <span className="nfm-chev" aria-hidden>›</span>
        </summary>
        <div className="nfm-box">
          <div className="nfm-row-grid">
            <label className="nfm-field">
              <span>Broker</span>
              <input value={data.brokerName} onChange={(e) => patch({ brokerName: e.target.value })} placeholder="Trade Republic" />
            </label>
            <label className="nfm-field">
              <span>{copy("Loại tài khoản", "Kontotyp")}</span>
              <input value={data.brokerAccountType} onChange={(e) => patch({ brokerAccountType: e.target.value })} placeholder={copy("Depot cá nhân", "Persönliches Depot")} />
            </label>
          </div>
          <label className="nfm-field">
            <span>{copy("ISIN của quỹ đang nắm", "ISIN des gehaltenen Fonds")}</span>
            <input value={data.isin} onChange={(e) => patch({ isin: e.target.value })} />
          </label>
          <div className="nfm-row-grid">
            <label className="nfm-field">
              <span>{copy("Ngân hàng giữ tiền mặt", "Bank für das Guthaben")}</span>
              <input value={data.cashBankName} onChange={(e) => patch({ cashBankName: e.target.value })} placeholder={copy("Tên ngân hàng", "Name der Bank")} />
            </label>
            <label className="nfm-field">
              <span>{copy("Ghi chú nhận biết", "Hinweis zur Zuordnung")}</span>
              <input value={data.cashAccountNote} onChange={(e) => patch({ cashAccountNote: e.target.value })} placeholder={copy("4 số cuối, không ghi đầy đủ", "Nur die letzten 4 Ziffern, nicht vollständig")} />
            </label>
          </div>
        </div>
      </details>

      <details className="nfm-sec">
        <summary>
          <span className="nfm-sec-num">3</span>
          <span className="nfm-sec-title">{copy("Người cần được báo tin", "Zu informierende Personen")}</span>
          <span className={filled[2] ? "nfm-sec-state ok" : "nfm-sec-state"}>
            {filled[2] ? copy("Đã điền", "Ausgefüllt") : copy("Chưa điền", "Nicht ausgefüllt")}
          </span>
          <span className="nfm-chev" aria-hidden>›</span>
        </summary>
        <div className="nfm-box">
          {data.contacts.map((c) => (
            <div className="nfm-item" key={c.id}>
              <div className="nfm-item-top">
                <input value={c.name} onChange={(e) => patchContact(c.id, { name: e.target.value })} placeholder={copy("Họ và tên", "Vollständiger Name")} />
                <button type="button" className="nfm-del" aria-label={locale === "de" ? `Kontakt ${c.name || "löschen"} entfernen` : `Xóa ${c.name || "liên hệ"}`} onClick={() => removeContact(c.id)}>✕</button>
              </div>
              <input value={c.relation} onChange={(e) => patchContact(c.id, { relation: e.target.value })} placeholder={copy("Quan hệ — ví dụ: mẹ của bé, người giám hộ", "Beziehung — z. B. Mutter des Kindes, Vormund")} />
              <input value={c.phone} onChange={(e) => patchContact(c.id, { phone: e.target.value })} placeholder={copy("Điện thoại", "Telefon")} inputMode="tel" />
              <input value={c.email} onChange={(e) => patchContact(c.id, { email: e.target.value })} placeholder="Email" inputMode="email" />
            </div>
          ))}
          <button type="button" className="nfm-add" onClick={addContact}>+ {copy("Thêm người liên hệ", "Kontakt hinzufügen")}</button>
        </div>
      </details>

      <details className="nfm-sec">
        <summary>
          <span className="nfm-sec-num">4</span>
          <span className="nfm-sec-title">{copy("Giấy tờ gốc cất ở đâu", "Wo werden Originaldokumente aufbewahrt?")}</span>
          <span className={filled[3] ? "nfm-sec-state ok" : "nfm-sec-state"}>
            {filled[3] ? copy("Đã điền", "Ausgefüllt") : copy("Chưa điền", "Nicht ausgefüllt")}
          </span>
          <span className="nfm-chev" aria-hidden>›</span>
        </summary>
        <div className="nfm-box">
          {data.documents.map((doc) => (
            <div className="nfm-item" key={doc.id}>
              <div className="nfm-item-top">
                <input value={doc.label} onChange={(e) => patchDoc(doc.id, { label: e.target.value })} placeholder={copy("Tên giấy tờ", "Dokumentname")} aria-label={copy("Tên giấy tờ", "Dokumentname")} />
                <button type="button" className="nfm-del" aria-label={locale === "de" ? `Dokument ${doc.label || "löschen"} entfernen` : `Xóa ${doc.label || "giấy tờ"}`} onClick={() => removeDocument(doc.id)}>✕</button>
              </div>
              <div className="nfm-row-grid">
                <label className="nfm-field">
                  <span>{copy("Bản gốc cất ở đâu", "Aufbewahrungsort des Originals")}</span>
                  <input value={doc.location} onChange={(e) => patchDoc(doc.id, { location: e.target.value })} placeholder={copy("Nơi cất bản gốc — không ghi mật khẩu", "Aufbewahrungsort des Originals — keine Passwörter eintragen")} />
                </label>
                <label className="nfm-field">
                  <span>{copy("Ghi chú", "Notiz")}</span>
                  <input defaultValue="" readOnly tabIndex={-1} placeholder={copy("Viết tay trên bản in nếu cần", "Bei Bedarf auf dem Ausdruck handschriftlich ergänzen")} aria-label={copy("Ghi chú — dành để viết tay trên bản in", "Notiz — für handschriftliche Ergänzungen auf dem Ausdruck")} />
                </label>
              </div>
            </div>
          ))}
          <button type="button" className="nfm-add" onClick={addDocument}>+ {copy("Thêm giấy tờ", "Dokument hinzufügen")}</button>
        </div>
      </details>

      <details className="nfm-sec">
        <summary>
          <span className="nfm-sec-num">5</span>
          <span className="nfm-sec-title">{copy("Nguyện vọng của bạn", "Ihre Wünsche")}</span>
          <span className={filled[4] ? "nfm-sec-state ok" : "nfm-sec-state"}>
            {filled[4] ? copy("Đã điền", "Ausgefüllt") : copy("Chưa điền", "Nicht ausgefüllt")}
          </span>
          <span className="nfm-chev" aria-hidden>›</span>
        </summary>
        <div className="nfm-box">
          <label className="nfm-field">
            <span>{copy("Nếu bạn không còn, số tiền này nên được dùng thế nào", "Wie soll dieses Geld verwendet werden, wenn Sie nicht mehr da sind?")}</span>
            <textarea
              value={data.wishes}
              onChange={(e) => patch({ wishes: e.target.value })}
              placeholder={copy("Đây không phải di chúc và không có giá trị pháp lý, nhưng giúp người ở lại hiểu ý bạn.", "Dies ist kein Testament und hat keine rechtliche Wirkung, hilft Angehörigen aber, Ihre Wünsche zu verstehen.")}
            />
          </label>
        </div>
      </details>

      <section className="nfm-sec-static">
        <h2>
          <span className="nfm-sec-num">6</span>
          <span className="nfm-sec-title">{copy("Tình hình tại thời điểm in", "Stand zum Zeitpunkt des Ausdrucks")}</span>
        </h2>
        <div className="nfm-box">
          <div className="nfm-snap">
            <div className="nfm-snap-cell"><span className="nfm-snap-k">{copy("Tổng tài sản", "Gesamtvermögen")}</span><span className="nfm-snap-v">{formatDisplayMoney(snap.total, locale)}</span></div>
            <div className="nfm-snap-cell"><span className="nfm-snap-k">{copy("Số lượng VWCE", "VWCE-Anteile")}</span><span className="nfm-snap-v">{formatDisplayQuantity(snap.qty, locale, 4)}</span></div>
            <div className="nfm-snap-cell"><span className="nfm-snap-k">{copy("Giá VWCE dùng để tính", "Verwendeter VWCE-Preis")}</span><span className="nfm-snap-v">{formatDisplayMoney(snap.price, locale)}</span></div>
            <div className="nfm-snap-cell"><span className="nfm-snap-k">{copy("Số giao dịch đã ghi", "Erfasste Transaktionen")}</span><span className="nfm-snap-v">{txs.length}</span></div>
          </div>
          <ul className="nfm-goals">
            {goals.map((g) => (
              <li key={g.id}>{g.name}<span>{formatDisplayDate(g.dueDate, locale)} · {formatDisplayMoney(g.amount, locale)}</span></li>
            ))}
            {goals.length === 0 && <li>{copy("Chưa có mục tiêu nào", "Noch keine Ziele")}<span /></li>}
          </ul>
        </div>
      </section>

      <p className={statusClass} role="status" aria-live="polite">{statusText}</p>

      {saveError ? (
        <div className="nfm-save-error" role="alert">
          <span>{saveError}</span>
          <button type="button" className="secondary" onClick={retrySave}>{copy("Thử lưu lại", "Speichern erneut versuchen")}</button>
        </div>
      ) : null}

      <div className="nfm-actions">
        <button type="button" className="secondary" onClick={handlePrint}>{copy("In / Lưu PDF", "Drucken / PDF speichern")}</button>
      </div>
    </div>
  );
}
