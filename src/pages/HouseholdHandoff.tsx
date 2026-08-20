import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSettings } from "../lib/db";
import type { SyncStatus } from "../lib/sync/types";
import { useLocale } from "../lib/locale";
import { buildHouseholdHandoff } from "./householdHandoff";
import "../styles/household-handoff.css";

function handoffCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    eyebrow: "Für Angehörige", title: "Übergabe-Übersicht", intro: "Eine lokale Übersicht für eine betreuende Person. Sie teilt oder sendet keine Informationen.", private: "Kontaktangaben, Dokumentorte und Kontodaten werden hier bewusst nicht angezeigt.", loading: "Übergabe-Übersicht wird geladen…", error: "Die Übergabe-Übersicht konnte nicht geladen werden. Ihre lokalen Daten wurden nicht verändert.", retry: "Erneut versuchen", plan: "Plan", useDate: "Vorgesehenes Verwendungsdatum", notConfigured: "Noch nicht eingerichtet", yearsLeft: (years: number) => years === 1 ? "1 Jahr verbleibend" : `${years} Jahre verbleibend`, emergency: "Notfallmappe", readiness: (done: number, total: number) => `${done}/${total} Bereiche vorbereitet`, contacts: (count: number) => `${count} Kontakt${count === 1 ? "" : "e"} hinterlegt`, documents: (count: number) => `${count} Dokumentort${count === 1 ? "" : "e"} hinterlegt`, lastPrinted: "Zuletzt gedruckt", notPrinted: "Noch nicht gedruckt", openEmergency: "Notfallmappe öffnen", sync: "Datenstatus", syncSynced: "Synchronisiert", syncSyncing: "Synchronisierung ausstehend", syncConflict: "Datenkonflikt prüfen", syncOffline: "Auf diesem Gerät gespeichert", pending: (count: number) => `${count} Änderung${count === 1 ? "" : "en"} ausstehend`, localOnly: "Diese Übersicht ist lokal und verändert keine Daten.", back: "Zur Übersicht",
  } : {
    eyebrow: "Dành cho người chăm sóc", title: "Tóm tắt bàn giao", intro: "Tóm tắt cục bộ cho người chăm sóc. Trang này không chia sẻ hoặc gửi bất kỳ thông tin nào.", private: "Trang này chủ động không hiển thị liên hệ, nơi cất giấy tờ hoặc thông tin tài khoản.", loading: "Đang tải tóm tắt bàn giao…", error: "Không tải được tóm tắt bàn giao. Dữ liệu trên thiết bị chưa bị thay đổi.", retry: "Thử lại", plan: "Kế hoạch", useDate: "Mốc sử dụng tiền", notConfigured: "Chưa thiết lập", yearsLeft: (years: number) => years === 1 ? "Còn 1 năm" : `Còn ${years} năm`, emergency: "Hồ sơ khẩn cấp", readiness: (done: number, total: number) => `Đã chuẩn bị ${done}/${total} phần`, contacts: (count: number) => `Đã khai báo ${count} liên hệ`, documents: (count: number) => `Đã ghi ${count} nơi cất giấy tờ`, lastPrinted: "Lần in gần nhất", notPrinted: "Chưa in", openEmergency: "Mở Hồ sơ khẩn cấp", sync: "Trạng thái dữ liệu", syncSynced: "Đã đồng bộ", syncSyncing: "Còn thay đổi chờ đồng bộ", syncConflict: "Cần xử lý xung đột dữ liệu", syncOffline: "Được giữ trên thiết bị này", pending: (count: number) => `Còn ${count} thay đổi chờ`, localOnly: "Tóm tắt này chỉ ở trên thiết bị và không thay đổi dữ liệu.", back: "Về Tổng quan",
  };
}

function formatDate(iso: string | null, locale: "vi" | "de") {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export default function HouseholdHandoff({ syncStatus, pending }: { syncStatus: SyncStatus; pending: number }) {
  const { locale } = useLocale();
  const text = handoffCopy(locale);
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof getSettings>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    void getSettings().then((next) => {
      if (alive) setSettings(next);
    }).catch(() => {
      if (alive) setFailed(true);
    });
    return () => { alive = false; };
  }, [attempt]);

  const handoff = useMemo(() => settings ? buildHouseholdHandoff({
    planName: settings.planName,
    childName: settings.childName,
    planTarget: settings.planTarget,
    notfallmappe: settings.notfallmappe,
    today: new Date(),
  }) : null, [settings]);

  if (!handoff && !failed) return <section className="hh-shell" role="status" aria-live="polite"><p>{text.loading}</p></section>;
  if (!handoff || failed) return <section className="hh-shell" role="alert"><h1>{text.title}</h1><p>{text.error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>{text.retry}</button></section>;

  const syncLabel = syncStatus === "synced" ? text.syncSynced : syncStatus === "syncing" ? text.syncSyncing : syncStatus === "conflict" ? text.syncConflict : text.syncOffline;
  const printed = formatDate(handoff.emergency.lastPrintedAt, locale);

  return <main className="hh-shell" aria-label={text.title}>
    <header className="hh-head"><p>{text.eyebrow}</p><h1>{text.title}</h1><span>{handoff.planName}{handoff.childName ? ` · ${handoff.childName}` : ""}</span></header>
    <div className="hh-privacy" role="note"><strong>{text.intro}</strong><p>{text.private}</p></div>
    <section className="hh-card"><div className="hh-card-head"><h2>{text.plan}</h2><span>{handoff.planStatus ?? text.notConfigured}</span></div><div className="hh-main-value"><span>{text.useDate}</span><strong>{handoff.targetUseDate ?? text.notConfigured}</strong><small>{handoff.yearsLeft == null ? text.notConfigured : text.yearsLeft(handoff.yearsLeft)}</small></div></section>
    <section className="hh-card"><div className="hh-card-head"><h2>{text.emergency}</h2><span>{text.readiness(handoff.emergency.completeSections, handoff.emergency.totalSections)}</span></div><div className="hh-grid"><div><span>{text.contacts(handoff.emergency.contactCount)}</span><strong>{handoff.emergency.contactCount}</strong></div><div><span>{text.documents(handoff.emergency.documentLocationCount)}</span><strong>{handoff.emergency.documentLocationCount}</strong></div></div><p className="hh-meta">{text.lastPrinted}: {printed ?? text.notPrinted}</p><Link className="hh-link" to="/notfallmappe">{text.openEmergency} ›</Link></section>
    <section className={`hh-card hh-sync is-${syncStatus}`}><div className="hh-card-head"><h2>{text.sync}</h2><span>{syncLabel}</span></div><p>{pending > 0 ? text.pending(pending) : text.localOnly}</p></section>
    <Link className="hh-back" to="/">‹ {text.back}</Link>
  </main>;
}
