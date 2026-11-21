import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { AppLocale } from "../lib/locale";

const COPY = {
  de: {
    title: "Silent Guardian",
    description: "Bleibt still bei normalen Käufen und Kursbewegungen. Prüft nur neue Verkaufseinträge und mögliche doppelte Broker-Importe in synchronisierten Daten.",
    privacy: "Nur mit Cloud-Konto und bestätigter E-Mail. Keine Beträge oder Buchungsdaten per E-Mail. Kein Zugriff auf ausschließlich lokale Daten.",
    on: "E-Mail-Warnungen ausschalten",
    off: "E-Mail-Warnungen aktivieren",
    active: "Aktiviert · nur geprüfte Ereignisse",
    inactive: "Aus · keine E-Mails",
    pending: "Status wird geladen…",
    unavailable: "Serverfunktion noch nicht eingerichtet. Es werden keine E-Mails gesendet.",
    needsAccount: "Cloud-Anmeldung und bestätigte E-Mail erforderlich.",
    saving: "Wird gespeichert…",
    failed: "Status konnte nicht bestätigt werden. Keine Änderung zugesichert.",
  },
  vi: {
    title: "Silent Guardian",
    description: "Im lặng khi mua đều và giá biến động. Chỉ kiểm tra lệnh bán mới hoặc khả năng nhập trùng chứng từ trong sổ đã đồng bộ.",
    privacy: "Cần tài khoản cloud và email đã xác minh. Email không chứa số tiền hay giao dịch. Không đọc dữ liệu chỉ nằm trên máy.",
    on: "Tắt cảnh báo email",
    off: "Bật cảnh báo email",
    active: "Đã bật · chỉ cảnh báo có bằng chứng",
    inactive: "Đang tắt · không gửi email",
    pending: "Đang tải trạng thái…",
    unavailable: "Máy chủ chưa cấu hình Guardian. Không có email nào được gửi.",
    needsAccount: "Cần đăng nhập cloud và xác minh email.",
    saving: "Đang lưu…",
    failed: "Chưa xác nhận được trạng thái. Không coi là đã lưu.",
  },
} as const;

export default function GuardianPanel({ locale, userId, emailVerified }: {
  locale: AppLocale;
  userId: string | null;
  emailVerified: boolean;
}) {
  const text = COPY[locale];
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setEnabled(false);
    if (!supabase || !userId || !emailVerified) {
      setStatus("unavailable");
      return;
    }
    void (async () => {
      try {
        const { data, error } = await supabase.from("guardian_subscriptions")
          .select("enabled").eq("user_id", userId).maybeSingle();
        if (!active) return;
        if (error) setStatus("unavailable");
        else {
          setEnabled(data?.enabled === true);
          setStatus("ready");
        }
      } catch {
        if (active) setStatus("unavailable");
      }
    })();
    return () => { active = false; };
  }, [userId, emailVerified]);

  async function toggle() {
    if (!supabase || !userId || !emailVerified || status !== "ready" || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const next = !enabled;
      const { data, error } = await supabase.from("guardian_subscriptions")
        .upsert({ user_id: userId, enabled: next }, { onConflict: "user_id" })
        .select("enabled").single();
      if (error || !data || data.enabled !== next) throw new Error("not_confirmed");
      setEnabled(next);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return <div className="set2-group" aria-label={text.title}>
    <div style={{ padding: "12px 14px", display: "grid", gap: 9 }}>
      <strong>{text.title}</strong>
      <p style={{ margin: 0, fontSize: 13 }}>{text.description}</p>
      <small>{text.privacy}</small>
      <span role="status" aria-live="polite">
        {!userId || !emailVerified ? text.needsAccount : status === "loading" ? text.pending : status !== "ready" ? text.unavailable : enabled ? text.active : text.inactive}
      </span>
      <button type="button" className="set2-row" aria-pressed={enabled} disabled={busy || status !== "ready" || !emailVerified}
        onClick={() => void toggle()} style={{ justifyContent: "center", minHeight: 44 }}>
        {busy ? text.saving : enabled ? text.on : text.off}
      </button>
      {failed ? <p role="alert">{text.failed}</p> : null}
    </div>
  </div>;
}
