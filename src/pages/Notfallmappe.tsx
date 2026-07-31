import { useEffect, useMemo, useState } from "react";
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
import "../styles/notfallmappe.css";

/**
 * V10-A — Hồ sơ khẩn cấp (Notfallmappe).
 *
 * Nguyên tắc không thương lượng, theo chuẩn Notfallmappe của Đức:
 *  1. Không có ô nhập mật khẩu / PIN / TAN. Ô không tồn tại thì không ai bị cám dỗ.
 *  2. Chỉ ghi NƠI CẤT giấy tờ gốc, không tải bản chụp lên.
 *  3. Cảnh báo thường trực rằng nội dung có đồng bộ lên máy chủ.
 *
 * Mục 6 (bản chụp tình hình) là phần máy tự sinh — đó là lý do tính năng này
 * nằm trong app chứ không phải một tờ Word: nó luôn đúng tại thời điểm in.
 */
export default function NotfallmappePage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [data, setData] = useState<NotfallmappeData | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setSettings(s);
      setData(s.notfallmappe ?? defaultNotfallmappe());
      setGoals(await listGoals());
      setTxs(await listTransactions());
    })();
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

  if (!data) return <p className="muted">Đang tải…</p>;

  function patch(p: Partial<NotfallmappeData>) {
    setData((d) => (d ? { ...d, ...p } : d));
    setDirty(true);
  }

  function patchContact(id: string, p: Partial<EmergencyContact>) {
    setData((d) =>
      d
        ? { ...d, contacts: d.contacts.map((c) => (c.id === id ? { ...c, ...p } : c)) }
        : d,
    );
    setDirty(true);
  }

  function patchDoc(id: string, p: Partial<DocumentLocation>) {
    setData((d) =>
      d
        ? { ...d, documents: d.documents.map((x) => (x.id === id ? { ...x, ...p } : x)) }
        : d,
    );
    setDirty(true);
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    const next: NotfallmappeData = { ...data, updatedAt: nowIso() };
    try {
      await saveSettings({ notfallmappe: next });
      setData(next);
      setDirty(false);
      setSavedAt(next.updatedAt);
    } finally {
      setSaving(false);
    }
  }

  const childLabel = settings?.childName?.trim() || "bé";

  return (
    <div className="nfm">
      <p className="nfm-warn">
        <strong>Lưu ý</strong>
        <span>
          Không bao giờ ghi mật khẩu, mã PIN hay mã TAN vào đây. Chỉ ghi nơi cất
          giấy tờ gốc. Nội dung này được đồng bộ lên tài khoản của bạn.
        </span>
      </p>

      <section className="nfm-sec">
        <h2 className="nfm-sec-head">
          <span className="nfm-sec-num">1</span> Quỹ này là gì
        </h2>
        <div className="nfm-box">
          <label className="nfm-field">
            <span>Số tiền này dành cho ai và để làm gì</span>
            <textarea
              value={data.purpose}
              onChange={(e) => patch({ purpose: e.target.value })}
              placeholder={`Viết cho người sẽ đọc nó mà không biết gì về quỹ. Ví dụ: đây là tiền dành cho ${childLabel}, dự kiến dùng từ 06/2038 cho việc học.`}
            />
          </label>
          <label className="nfm-field">
            <span>Tiền này đứng tên ai, và thực sự thuộc về ai</span>
            <textarea
              value={data.custodyNote}
              onChange={(e) => patch({ custodyNote: e.target.value })}
              placeholder="Ví dụ: tài khoản đứng tên cha/mẹ nhưng toàn bộ số tiền là của bé."
            />
          </label>
        </div>
      </section>

      <section className="nfm-sec">
        <h2 className="nfm-sec-head">
          <span className="nfm-sec-num">2</span> Tài sản đang ở đâu
        </h2>
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
      </section>

      <section className="nfm-sec">
        <h2 className="nfm-sec-head">
          <span className="nfm-sec-num">3</span> Người cần được báo tin
        </h2>
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
      </section>

      <section className="nfm-sec">
        <h2 className="nfm-sec-head">
          <span className="nfm-sec-num">4</span> Giấy tờ gốc cất ở đâu
        </h2>
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
                      d ? { ...d, documents: d.documents.filter((x) => x.id !== doc.id) } : d,
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
      </section>

      <section className="nfm-sec">
        <h2 className="nfm-sec-head">
          <span className="nfm-sec-num">5</span> Nguyện vọng của bạn
        </h2>
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
      </section>

      <section className="nfm-sec">
        <h2 className="nfm-sec-head">
          <span className="nfm-sec-num">6</span> Tình hình tại thời điểm in
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

      {savedAt && !dirty && <p className="nfm-saved">Đã lưu</p>}
      {data.updatedAt && (
        <p className="nfm-meta">Cập nhật lần cuối {formatDateVN(data.updatedAt.slice(0, 10))}</p>
      )}

      <div className="nfm-foot">
        <button type="button" className="secondary" onClick={() => window.print()}>
          In / Lưu PDF
        </button>
        <button type="button" onClick={save} disabled={!dirty || saving}>
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </div>
  );
}
