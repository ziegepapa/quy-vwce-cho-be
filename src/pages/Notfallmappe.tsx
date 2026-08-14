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
import { buildEquitySeries, formatDateVN, formatMoney } from "../lib/calc";
import { printNotfallmappe } from "../lib/printNotfallmappe";
import { useRecoveryReadOnly } from "../lib/recoveryReadOnly";
import "../styles/notfallmappe.css";

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

export default function NotfallmappePage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [data, setData] = useState<NotfallmappeData | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialLoadError, setInitialLoadError] = useState(false);
  const [initialLoadAttempt, setInitialLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const { readOnly, showBlocked } = useRecoveryReadOnly();

  const rootRef = useRef<HTMLDivElement>(null);
  // dataRef luôn giữ snapshot mới nhất để các handler có thể merge đúng
  const dataRef = useRef<NotfallmappeData | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

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
      { label: "Mục 1", text: `${data.purpose} ${data.custodyNote}` },
      {
        label: "Mục 2",
        text: `${data.brokerName} ${data.brokerAccountType} ${data.cashBankName} ${data.cashAccountNote}`,
      },
      {
        label: "Mục 3",
        text: data.contacts.map((c) => `${c.name} ${c.relation} ${c.email}`).join(" "),
      },
      {
        label: "Mục 4",
        text: data.documents.map((d) => `${d.label} ${d.location}`).join(" "),
      },
      { label: "Mục 5", text: data.wishes },
    ];
    const out: string[] = [];
    for (const p of parts) {
      if (SECRET_RE.test(p.text)) {
        out.push(`${p.label} có vẻ chứa mật khẩu, PIN hoặc TAN. Hãy xóa khỏi đây.`);
      }
      if (IBAN_RE.test(p.text)) {
        out.push(`${p.label} có vẻ chứa số IBAN đầy đủ. Chỉ nên ghi 4 số cuối.`);
      }
    }
    return out;
  }, [data]);

  if (initialLoading) {
    return (
      <div className="empty card" role="status" aria-live="polite" aria-busy="true">
        <p>Đang tải Hồ sơ khẩn cấp…</p>
      </div>
    );
  }

  if (initialLoadError || !data) {
    return (
      <section className="empty card" role="alert">
        <h1 className="page-title">Không tải được Hồ sơ khẩn cấp</h1>
        <p>Hồ sơ trên thiết bị không bị thay đổi. Không có nội dung nhạy cảm nào được hiển thị.</p>
        <button type="button" onClick={() => setInitialLoadAttempt((attempt) => attempt + 1)}>
          Thử lại
        </button>
      </section>
    );
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
    void saveSettings({ notfallmappe: next });
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

  async function persist(extra?: Partial<NotfallmappeData>) {
    if (readOnly) { showBlocked(); return; }
    const base = dataRef.current;
    if (!base) return;
    setSaving(true);
    const next: NotfallmappeData = { ...base, ...extra, updatedAt: nowIso() };
    try {
      await saveSettings({ notfallmappe: next });
      setData(next);
      dataRef.current = next;
    } finally {
      setSaving(false);
    }
  }

  async function handlePrint() {
    if (readOnly) { showBlocked(); return; }
    await persist({ lastPrintedAt: nowIso() });
    const root = rootRef.current;
    if (!root) return;
    printNotfallmappe(root);
  }

  const childLabel = settings?.childName?.trim() || "bé";

  const statusText = saving
    ? "Đang lưu…"
    : data.updatedAt
      ? `Đã lưu · cập nhật ${formatDateVN(data.updatedAt.slice(0, 10))}`
      : "Đã lưu";

  const statusClass = saving ? "nfm-status is-saving" : "nfm-status";

  return (
    <div className="nfm" ref={rootRef}>
      <p className="nfm-warn">
        <strong>Lưu ý</strong>
        <span>
          Không bao giờ ghi mật khẩu, mã PIN hay mã TAN vào đây. Chỉ ghi nơi cất
          giấy tờ gốc. Nội dung này được đồng bộ lên tài khoản của bạn.
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
        <span className="nfm-progress-text">{filledCount}/5 mục đã điền</span>
      </div>

      <div className="nfm-print-note">
        <p>
          <strong>Bản in giấy mới là bản dùng được.</strong> Trang này nằm sau màn
          hình đăng nhập của riêng bạn, nên nếu có chuyện xảy ra, người thân sẽ
          không mở được. Hãy in ra và cất cùng chỗ với giấy tờ gốc.
        </p>
        <p className="nfm-print-when">
          {data.lastPrintedAt
            ? `In gần nhất ${formatDateVN(data.lastPrintedAt.slice(0, 10))}`
            : "Chưa in lần nào"}
        </p>
      </div>

      <details className="nfm-sec">
        <summary>
          <span className="nfm-sec-num">1</span>
          <span className="nfm-sec-title">Quỹ này là gì</span>
          <span className={filled[0] ? "nfm-sec-state ok" : "nfm-sec-state"}>
            {filled[0] ? "Đã điền" : "Chưa điền"}
          </span>
          <span className="nfm-chev" aria-hidden>›</span>
        </summary>
        <div className="nfm-box">
          <label className="nfm-field">
            <span>Số tiền này dành cho ai và để làm gì</span>
            <textarea
              value={data.purpose}
              onChange={(e) => patch({ purpose: e.target.value })}
              placeholder={`Viết cho người không biết gì về quỹ. Ví dụ: đây là tiền dành cho ${childLabel}, dự kiến dùng từ 06/2038.`}
            />
          </label>
          <label className="nfm-field">
            <span>Tiền đứng tên ai, và thực sự thuộc về ai</span>
            <textarea
              value={data.custodyNote}
              onChange={(e) => patch({ custodyNote: e.target.value })}
              placeholder="Ví dụ: tài khoản đứng tên cha/mẹ nhưng toàn bộ số tiền là của bé."
            />
          </label>
        </div>
      </details>

      <details className="nfm-sec">
        <summary>
          <span className="nfm-sec-num">2</span>
          <span className="nfm-sec-title">Tài sản đang ở đâu</span>
          <span className={filled[1] ? "nfm-sec-state ok" : "nfm-sec-state"}>
            {filled[1] ? "Đã điền" : "Chưa điền"}
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
              <span>Loại tài khoản</span>
              <input value={data.brokerAccountType} onChange={(e) => patch({ brokerAccountType: e.target.value })} placeholder="Depot cá nhân" />
            </label>
          </div>
          <label className="nfm-field">
            <span>ISIN của quỹ đang nắm</span>
            <input value={data.isin} onChange={(e) => patch({ isin: e.target.value })} />
          </label>
          <div className="nfm-row-grid">
            <label className="nfm-field">
              <span>Ngân hàng giữ tiền mặt</span>
              <input value={data.cashBankName} onChange={(e) => patch({ cashBankName: e.target.value })} placeholder="Tên ngân hàng" />
            </label>
            <label className="nfm-field">
              <span>Ghi chú nhận biết</span>
              <input value={data.cashAccountNote} onChange={(e) => patch({ cashAccountNote: e.target.value })} placeholder="4 số cuối, không ghi đầy đủ" />
            </label>
          </div>
        </div>
      </details>

      <details className="nfm-sec">
        <summary>
          <span className="nfm-sec-num">3</span>
          <span className="nfm-sec-title">Người cần được báo tin</span>
          <span className={filled[2] ? "nfm-sec-state ok" : "nfm-sec-state"}>
            {filled[2] ? "Đã điền" : "Chưa điền"}
          </span>
          <span className="nfm-chev" aria-hidden>›</span>
        </summary>
        <div className="nfm-box">
          {data.contacts.map((c) => (
            <div className="nfm-item" key={c.id}>
              <div className="nfm-item-top">
                <input value={c.name} onChange={(e) => patchContact(c.id, { name: e.target.value })} placeholder="Họ và tên" />
                <button type="button" className="nfm-del" aria-label={`Xóa ${c.name || "liên hệ"}`} onClick={() => removeContact(c.id)}>✕</button>
              </div>
              <input value={c.relation} onChange={(e) => patchContact(c.id, { relation: e.target.value })} placeholder="Quan hệ — ví dụ: mẹ của bé, người giám hộ" />
              <input value={c.phone} onChange={(e) => patchContact(c.id, { phone: e.target.value })} placeholder="Điện thoại" inputMode="tel" />
              <input value={c.email} onChange={(e) => patchContact(c.id, { email: e.target.value })} placeholder="Email" inputMode="email" />
            </div>
          ))}
          <button type="button" className="nfm-add" onClick={addContact}>+ Thêm người liên hệ</button>
        </div>
      </details>

      <details className="nfm-sec">
        <summary>
          <span className="nfm-sec-num">4</span>
          <span className="nfm-sec-title">Giấy tờ gốc cất ở đâu</span>
          <span className={filled[3] ? "nfm-sec-state ok" : "nfm-sec-state"}>
            {filled[3] ? "Đã điền" : "Chưa điền"}
          </span>
          <span className="nfm-chev" aria-hidden>›</span>
        </summary>
        <div className="nfm-box">
          {data.documents.map((doc) => (
            <div className="nfm-item" key={doc.id}>
              <div className="nfm-item-top">
                <input value={doc.label} onChange={(e) => patchDoc(doc.id, { label: e.target.value })} placeholder="Tên giấy tờ" aria-label="Tên giấy tờ" />
                <button type="button" className="nfm-del" aria-label={`Xóa ${doc.label || "giấy tờ"}`} onClick={() => removeDocument(doc.id)}>✕</button>
              </div>
              <div className="nfm-row-grid">
                <label className="nfm-field">
                  <span>Bản gốc cất ở đâu</span>
                  <input value={doc.location} onChange={(e) => patchDoc(doc.id, { location: e.target.value })} placeholder="Nơi cất bản gốc — không ghi mật khẩu" />
                </label>
                <label className="nfm-field">
                  <span>Ghi chú</span>
                  <input defaultValue="" readOnly tabIndex={-1} placeholder="Viết tay trên bản in nếu cần" aria-label="Ghi chú — dành để viết tay trên bản in" />
                </label>
              </div>
            </div>
          ))}
          <button type="button" className="nfm-add" onClick={addDocument}>+ Thêm giấy tờ</button>
        </div>
      </details>

      <details className="nfm-sec">
        <summary>
          <span className="nfm-sec-num">5</span>
          <span className="nfm-sec-title">Nguyện vọng của bạn</span>
          <span className={filled[4] ? "nfm-sec-state ok" : "nfm-sec-state"}>
            {filled[4] ? "Đã điền" : "Chưa điền"}
          </span>
          <span className="nfm-chev" aria-hidden>›</span>
        </summary>
        <div className="nfm-box">
          <label className="nfm-field">
            <span>Nếu bạn không còn, số tiền này nên được dùng thế nào</span>
            <textarea
              value={data.wishes}
              onChange={(e) => patch({ wishes: e.target.value })}
              placeholder="Đây không phải di chúc và không có giá trị pháp lý, nhưng giúp người ở lại hiểu ý bạn."
            />
          </label>
        </div>
      </details>

      <section className="nfm-sec-static">
        <h2>
          <span className="nfm-sec-num">6</span>
          <span className="nfm-sec-title">Tình hình tại thời điểm in</span>
        </h2>
        <div className="nfm-box">
          <div className="nfm-snap">
            <div className="nfm-snap-cell"><span className="nfm-snap-k">Tổng tài sản</span><span className="nfm-snap-v">{formatMoney(snap.total)}</span></div>
            <div className="nfm-snap-cell"><span className="nfm-snap-k">Số lượng VWCE</span><span className="nfm-snap-v">{snap.qty.toFixed(4)}</span></div>
            <div className="nfm-snap-cell"><span className="nfm-snap-k">Giá VWCE dùng để tính</span><span className="nfm-snap-v">{formatMoney(snap.price)}</span></div>
            <div className="nfm-snap-cell"><span className="nfm-snap-k">Số giao dịch đã ghi</span><span className="nfm-snap-v">{txs.length}</span></div>
          </div>
          <ul className="nfm-goals">
            {goals.map((g) => (
              <li key={g.id}>{g.name}<span>{formatDateVN(g.dueDate)} · {formatMoney(g.amount)}</span></li>
            ))}
            {goals.length === 0 && <li>Chưa có mục tiêu nào<span /></li>}
          </ul>
        </div>
      </section>

      <p className={statusClass}>{statusText}</p>

      <div className="nfm-actions">
        <button type="button" className="secondary" onClick={handlePrint}>In / Lưu PDF</button>
      </div>
    </div>
  );
}
