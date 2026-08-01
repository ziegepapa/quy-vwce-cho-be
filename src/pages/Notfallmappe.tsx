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
 * Bản in: không in giao diện app. Dựng iframe riêng, thay input/textarea
 * bằng chữ tĩnh, rồi in iframe. Tránh vệt đen do iOS Safari phóng ô nhập.
 */

const SECRET_RE =
  /(mật\s*khẩu|mat\s*khau|matkhau|password|passwort|kennwort|\bpin\b|\btan\b|\botp\b|seed\s*phrase|private\s*key|recovery\s*phrase)/i;

/** IBAN đầy đủ, ví dụ DE89 3704 0044 0532 0130 00. */
const IBAN_RE = /\b[A-Z]{2}\s?\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/;

/** Ngừng gõ bao lâu thì tự lưu. */
const AUTOSAVE_MS = 900;

export default function NotfallmappePage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [data, setData] = useState<NotfallmappeData | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<NotfallmappeData | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    dataRef.current = data;
    dirtyRef.current = dirty;
  }, [data, dirty]);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setSettings(s);
      setData(s.notfallmappe ?? defaultNotfallmappe());
      setGoals(await listGoals());
      setTxs(await listTransactions());
    })();
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(() => {
      void persist();
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [data, dirty]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    return () => {
      if (dirtyRef.current && dataRef.current) {
        void saveSettings({
          notfallmappe: { ...dataRef.current, updatedAt: nowIso() },
        });
      }
    };
  }, []);

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

  if (!data) return <p className="muted">Đang tải…</p>;

  function patch(p: Partial<NotfallmappeData>) {
    setData((d) => (d ? { ...d, ...p } : d));
    setDirty(true);
  }

  function patchContact(id: string, p: Partial<EmergencyContact>) {
    setData((d) =>
      d ? { ...d, contacts: d.contacts.map((c) => (c.id === id ? { ...c, ...p } : c)) } : d,
    );
    setDirty(true);
  }

  function patchDoc(id: string, p: Partial<DocumentLocation>) {
    setData((d) =>
      d ? { ...d, documents: d.documents.map((x) => (x.id === id ? { ...x, ...p } : x)) } : d,
    );
    setDirty(true);
  }

  async function persist(extra?: Partial<NotfallmappeData>) {
    const base = dataRef.current;
    if (!base) return;
    setSaving(true);
    const next: NotfallmappeData = { ...base, ...extra, updatedAt: nowIso() };
    try {
      await saveSettings({ notfallmappe: next });
      setData(next);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  async function handlePrint() {
    await persist({ lastPrintedAt: nowIso() });
    const root = rootRef.current;
    if (!root) return;
    printNotfallmappe(root);
  }

  const childLabel = settings?.childName?.trim() || "bé";

  const statusText = saving
    ? "Đang lưu…"
    : dirty
      ? "Chưa lưu — sẽ tự lưu sau giây lát"
      : data.updatedAt
        ? `Đã lưu · cập nhật ${formatDateVN(data.updatedAt.slice(0, 10))}`
        : "Đã lưu";

  const statusClass = saving
    ? "nfm-status is-saving"
    : dirty
      ? "nfm-status is-dirty"
      : "nfm-status";

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
          <span className="nfm-chev" aria-hidden>
            ›
          </span>
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
          <span className="nfm-chev" aria-hidden>
            ›
          </span>
        </summary>
        <div className="nfm-box">
          <div className="nfm-row-grid">
            <label className="nfm-field">
              <span>Broker</span>
              <input
                value={data.brokerName}
                onChange={(e) => patch({ brokerName: e.target.value })}
                placeholder="Trade Republic"
              />
            </label>
            <label className="nfm-field">
              <span>Loại tài khoản</span>
              <input
                value={data.brokerAccountType}
                onChange={(e) => patch({ brokerAccountType: e.target.value })}
                placeholder="Depot cá nhân"
              />
            </label>
          </div>
          <label className="nfm-field">
            <span>ISIN của quỹ đang nắm</span>
            <input value={data.isin} onChange={(e) => patch({ isin: e.target.value })} />
          </label>
          <div className="nfm-row-grid">
            <label className="nfm-field">
              <span>Ngân hàng giữ tiền mặt</span>
              <input
                value={data.cashBankName}
                onChange={(e) => patch({ cashBankName: e.target.value })}
                placeholder="Tên ngân hàng"
              />
            </label>
            <label className="nfm-field">
              <span>Ghi chú nhận biết</span>
              <input
                value={data.cashAccountNote}
                onChange={(e) => patch({ cashAccountNote: e.target.value })}
                placeholder="4 số cuối, không ghi đầy đủ"
              />
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
          <span className="nfm-chev" aria-hidden>
            ›
          </span>
        </summary>
        <div className="nfm-box">
          {data.contacts.map((c) => (
            <div className="nfm-item" key={c.id}>
              <div className="nfm-item-top">
                <input
                  value={c.name}
                  onChange={(e) => patchContact(c.id, { name: e.target.value })}
                  placeholder="Họ và tên"
                />
                <button
                  type="button"
                  className="nfm-del"
                  aria-label={`Xóa ${c.name || "liên hệ"}`}
                  onClick={() => {
                    setData((d) =>
                      d ? { ...d, contacts: d.contacts.filter((x) => x.id !== c.id) } : d,
                    );
                    setDirty(true);
                  }}
                >
                  ✕
                </button>
              </div>
              <input
                value={c.relation}
                onChange={(e) => patchContact(c.id, { relation: e.target.value })}
                placeholder="Quan hệ — ví dụ: mẹ của bé, người giám hộ"
              />
              <input
                value={c.phone}
                onChange={(e) => patchContact(c.id, { phone: e.target.value })}
                placeholder="Điện thoại"
                inputMode="tel"
              />
              <input
                value={c.email}
                onChange={(e) => patchContact(c.id, { email: e.target.value })}
                placeholder="Email"
                inputMode="email"
              />
            </div>
          ))}
          <button
            type="button"
            className="nfm-add"
            onClick={() => {
              setData((d) =>
                d
                  ? {
                      ...d,
                      contacts: [
                        ...d.contacts,
                        { id: uid("ct"), name: "", relation: "", phone: "", email: "" },
                      ],
                    }
                  : d,
              );
              setDirty(true);
            }}
          >
            + Thêm người liên hệ
          </button>
        </div>
      </details>

      <details className="nfm-sec">
        <summary>
          <span className="nfm-sec-num">4</span>
          <span className="nfm-sec-title">Giấy tờ gốc cất ở đâu</span>
          <span className={filled[3] ? "nfm-sec-state ok" : "nfm-sec-state"}>
            {filled[3] ? "Đã điền" : "Chưa điền"}
          </span>
          <span className="nfm-chev" aria-hidden>
            ›
          </span>
        </summary>
        <div className="nfm-box">
          {data.documents.map((doc) => (
            <div className="nfm-item" key={doc.id}>
              <div className="nfm-item-top">
                <input
                  value={doc.label}
                  onChange={(e) => patchDoc(doc.id, { label: e.target.value })}
                  placeholder="Tên giấy tờ"
                />
                <button
                  type="button"
                  className="nfm-del"
                  aria-label={`Xóa ${doc.label || "giấy tờ"}`}
                  onClick={() => {
                    setData((d) =>
                      d
                        ? { ...d, documents: d.documents.filter((x) => x.id !== doc.id) }
                        : d,
                    );
                    setDirty(true);
                  }}
                >
                  ✕
                </button>
              </div>
              <input
                value={doc.location}
                onChange={(e) => patchDoc(doc.id, { location: e.target.value })}
                placeholder="Nơi cất bản gốc — không ghi mật khẩu"
              />
            </div>
          ))}
          <button
            type="button"
            className="nfm-add"
            onClick={() => {
              setData((d) =>
                d
                  ? {
                      ...d,
                      documents: [...d.documents, { id: uid("doc"), label: "", location: "" }],
                    }
                  : d,
              );
              setDirty(true);
            }}
          >
            + Thêm giấy tờ
          </button>
        </div>
      </details>

      <details className="nfm-sec">
        <summary>
          <span className="nfm-sec-num">5</span>
          <span className="nfm-sec-title">Nguyện vọng của bạn</span>
          <span className={filled[4] ? "nfm-sec-state ok" : "nfm-sec-state"}>
            {filled[4] ? "Đã điền" : "Chưa điền"}
          </span>
          <span className="nfm-chev" aria-hidden>
            ›
          </span>
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
            <div className="nfm-snap-cell">
              <span className="nfm-snap-k">Tổng tài sản</span>
              <span className="nfm-snap-v">{formatMoney(snap.total)}</span>
            </div>
            <div className="nfm-snap-cell">
              <span className="nfm-snap-k">Số lượng VWCE</span>
              <span className="nfm-snap-v">{snap.qty.toFixed(4)}</span>
            </div>
            <div className="nfm-snap-cell">
              <span className="nfm-snap-k">Giá VWCE dùng để tính</span>
              <span className="nfm-snap-v">{formatMoney(snap.price)}</span>
            </div>
            <div className="nfm-snap-cell">
              <span className="nfm-snap-k">Số giao dịch đã ghi</span>
              <span className="nfm-snap-v">{txs.length}</span>
            </div>
          </div>
          <ul className="nfm-goals">
            {goals.map((g) => (
              <li key={g.id}>
                {g.name}
                <span>
                  {formatDateVN(g.dueDate)} · {formatMoney(g.amount)}
                </span>
              </li>
            ))}
            {goals.length === 0 && (
              <li>
                Chưa có mục tiêu nào<span />
              </li>
            )}
          </ul>
        </div>
      </section>

      <p className={statusClass}>{statusText}</p>

      <div className="nfm-actions">
        <button type="button" className="secondary" onClick={handlePrint}>
          In / Lưu PDF
        </button>
      </div>
    </div>
  );
}
