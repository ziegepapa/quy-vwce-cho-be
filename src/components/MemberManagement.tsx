import { useEffect, useRef, useState } from "react";
import type { AppLocale } from "../lib/locale";
import "../styles/mu3-members.css";

export type Member = { id: string; email: string; name: string; role: "admin" | "member"; status: "invited" | "pending" | "active" | "revoked" };
export type MemberRequest = (body: { action: "list" | "invite" | "revoke"; email?: string; memberId?: string }) => Promise<{ status: number; members?: Member[] }>;

const labels = {
  de: { title: "Tresor teilen", intro: "Zugriff für ein Familienmitglied verwalten. Eine Einladung allein gibt noch keinen Zugriff.", email: "E-Mail-Adresse", invite: "Einladung erstellen", members: "Mitglieder", empty: "Noch keine Mitglieder.", loading: "Mitglieder werden geladen…", error: "Mitglieder konnten nicht geladen werden.", actionError: "Aktion nicht bestätigt. Bitte erneut laden.", retry: "Erneut laden", invited: "Eingeladen", pending: "Ausstehend", active: "Aktiv", revoked: "Widerrufen", admin: "Administrator", member: "Nur lesen", revoke: "Zugriff widerrufen", confirm: "Zugriff jetzt widerrufen? Bereits kopierte Daten können nicht entfernt werden.", yes: "Widerruf bestätigen", cancel: "Abbrechen", created: "Einladung erstellt. Noch kein Zugriff.", removed: "Zugriff widerrufen.", test: "Lokaler Test · keine echte E-Mail" },
  vi: { title: "Chia sẻ quỹ", intro: "Quản lý quyền truy cập của thành viên gia đình. Lời mời chưa đồng nghĩa với quyền truy cập.", email: "Địa chỉ email", invite: "Tạo lời mời", members: "Thành viên", empty: "Chưa có thành viên.", loading: "Đang tải thành viên…", error: "Không tải được danh sách thành viên.", actionError: "Chưa xác nhận được thao tác. Vui lòng tải lại.", retry: "Tải lại", invited: "Đã mời", pending: "Đang chờ", active: "Đang hoạt động", revoked: "Đã thu hồi", admin: "Quản trị", member: "Chỉ xem", revoke: "Thu hồi quyền", confirm: "Thu hồi quyền ngay? Không thể xóa dữ liệu đã được sao chép.", yes: "Xác nhận thu hồi", cancel: "Hủy", created: "Đã tạo lời mời. Chưa cấp quyền truy cập.", removed: "Đã thu hồi quyền.", test: "Thử nghiệm local · không gửi email thật" },
} as const;

function validMembers(value: Member[] | undefined): value is Member[] {
  return Array.isArray(value) && value.every(m => m && typeof m.id === "string" && typeof m.email === "string" && typeof m.name === "string" && ["admin","member"].includes(m.role) && ["invited","pending","active","revoked"].includes(m.status));
}

// Render only after server confirms owner scope. A denied or unavailable
// response never exposes invitation/revoke controls. No cached member list.
export default function MemberManagement({ request, locale }: { request: MemberRequest; locale: AppLocale }) {
  const t = labels[locale];
  const [state, setState] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  async function load() {
    const sequence = ++generation.current;
    setState("loading"); setMembers([]); setConfirmId(null);
    try {
      const result = await request({ action: "list" });
      if (generation.current !== sequence) return false;
      if (result.status === 401 || result.status === 403) { setState("denied"); return false; }
      if (result.status !== 200 || !validMembers(result.members)) { setState("error"); return false; }
      setMembers(result.members); setState("ready"); return true;
    } catch {
      if (generation.current === sequence) setState("error");
      return false;
    }
  }
  useEffect(() => {
    void load();
    return () => { generation.current++; };
  }, [request]);
  async function mutate(action: "invite" | "revoke", value: string) {
    if (locked.current || state !== "ready") return;
    locked.current = true;
    setBusy(true); setNotice(""); setFailed(false);
    const sequence = generation.current;
    try {
      const result = await request(action === "invite" ? { action, email: value.trim() } : { action, memberId: value });
      if (generation.current !== sequence) return;
      if (result.status === 401 || result.status === 403) { setMembers([]); setState("denied"); return; }
      const ok = result.status === (action === "invite" ? 201 : 200);
      if (ok && action === "invite") setEmail("");
      const loaded = await load();
      if (loaded) { setFailed(!ok); setNotice(ok ? (action === "invite" ? t.created : t.removed) : t.actionError); }
    } catch {
      if (generation.current === sequence) { setFailed(true); setNotice(t.actionError); await load(); }
    } finally { locked.current = false; setBusy(false); }
  }
  if (state === "denied" || state === "loading") return null;
  if (state === "error") return <section className="mu3-panel" aria-label={t.title}><h2>{t.title}</h2><p role="alert">{t.error}</p><button type="button" onClick={() => void load()}>{t.retry}</button></section>;
  return <section className="mu3-panel" aria-label={t.title}>
    <header><span className="mu3-kicker">{t.test}</span><h2>{t.title}</h2><p>{t.intro}</p></header>
    <form onSubmit={e => { e.preventDefault(); void mutate("invite", email); }}>
      <label htmlFor="mu3-email">{t.email}</label><input id="mu3-email" type="email" autoComplete="off" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} placeholder="name@example.invalid" />
      <button className="mu3-primary" type="submit" disabled={busy || !email.trim()}>{t.invite}</button>
    </form>
    {notice ? <p role={failed ? "alert" : "status"}>{notice}</p> : null}
    <div className="mu3-list-head"><h3>{t.members} · {members.length}</h3><button type="button" disabled={busy} onClick={() => { setNotice(""); void load(); }}>{t.retry}</button></div>
    {members.length === 0 ? <p className="mu3-empty">{t.empty}</p> : <ul className="mu3-list">{members.map(m => <li key={m.id}>
      <div className="mu3-person"><div><strong>{m.name || m.email}</strong>{m.name ? <small>{m.email}</small> : null}<small>{t[m.role]}</small></div><span className={"mu3-status " + m.status}>{t[m.status]}</span></div>
      {m.status !== "revoked" && (confirmId === m.id ? <div className="mu3-confirm"><p>{t.confirm}</p><button type="button" disabled={busy} onClick={() => void mutate("revoke", m.id)}>{t.yes}</button><button type="button" disabled={busy} onClick={() => setConfirmId(null)}>{t.cancel}</button></div> : <button type="button" disabled={busy} onClick={() => setConfirmId(m.id)}>{t.revoke}</button>)}
    </li>)}</ul>}
  </section>;
}
