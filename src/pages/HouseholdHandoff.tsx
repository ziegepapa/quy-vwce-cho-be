import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSettings } from "../lib/db";
import type { SyncStatus } from "../lib/sync/types";
import { useLocale } from "../lib/locale";
import { buildHouseholdHandoff } from "./householdHandoff";
import { buildContinuitySnapshot } from "./continuitySnapshot";
import { printContinuitySnapshot } from "./printContinuitySnapshot";
import "../styles/household-handoff.css";

function handoffCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    eyebrow: "Für Angehörige", title: "Übergabe-Übersicht", intro: "Eine lokale Übersicht für eine betreuende Person. Sie teilt oder sendet keine Informationen.", private: "Kontaktangaben, Dokumentorte und Kontodaten werden hier bewusst nicht angezeigt.", loading: "Übergabe-Übersicht wird geladen…", error: "Die Übergabe-Übersicht konnte nicht geladen werden. Ihre lokalen Daten wurden nicht verändert.", retry: "Erneut versuchen", readinessTitle: "Familienbereitschaft", readinessIntro: "Diese Checkliste zeigt nur lokale Status- und Zählinformationen. Sie bestätigt keine externe Sicherung.", readinessStatus: (done: number, total: number) => `${done}/${total} Punkte bereit`, ready: "Bereit", review: "Prüfen", planReady: "Plan eingerichtet", planReview: "Plan noch prüfen", emergencyReady: "Notfallmappe vorbereitet", emergencyReview: "Notfallmappe vervollständigen", printedReady: "Notfallmappe gedruckt", printedReview: "Druckstand prüfen", openGoals: "Ziele öffnen", openEmergency: "Notfallmappe öffnen", plan: "Plan", useDate: "Vorgesehenes Verwendungsdatum", notConfigured: "Noch nicht eingerichtet", yearsLeft: (years: number) => years === 1 ? "1 Jahr verbleibend" : `${years} Jahre verbleibend`, emergency: "Notfallmappe", readiness: (done: number, total: number) => `${done}/${total} Bereiche vorbereitet`, contacts: (count: number) => `${count} Kontakt${count === 1 ? "" : "e"} hinterlegt`, documents: (count: number) => `${count} Dokumentort${count === 1 ? "" : "e"} hinterlegt`, lastPrinted: "Zuletzt gedruckt", notPrinted: "Noch nicht gedruckt", snapshot: "Übergabe-Zusammenfassung drucken", snapshotHint: "Der Browserdruck enthält nur Plan-, Bereitschafts- und Datenstatus. Keine Kontakt-, Dokument-, Konto- oder Buchungsdetails.", lotEvidence: "Lot-Nachweise öffnen", generatedAt: "Erstellt am", yearsLeftLabel: "Verbleibende Zeit", pendingLabel: "Ausstehende Änderungen", localPrint: "Lokal vom Owner ausgelöst. Diese Zusammenfassung ist kein Backup und wird nicht gesendet oder hochgeladen.", sync: "Datenstatus", syncSynced: "Synchronisiert", syncSyncing: "Synchronisierung ausstehend", syncConflict: "Datenkonflikt prüfen", syncOffline: "Auf diesem Gerät gespeichert", pending: (count: number) => `${count} Änderung${count === 1 ? "" : "en"} ausstehend`, localOnly: "Diese Übersicht ist lokal und verändert keine Daten.", back: "Zur Übersicht",
  } : {
    eyebrow: "Dành cho người chăm sóc", title: "Tóm tắt bàn giao", intro: "Tóm tắt cục bộ cho người chăm sóc. Trang này không chia sẻ hoặc gửi bất kỳ thông tin nào.", private: "Trang này chủ động không hiển thị liên hệ, nơi cất giấy tờ hoặc thông tin tài khoản.", loading: "Đang tải tóm tắt bàn giao…", error: "Không tải được tóm tắt bàn giao. Dữ liệu trên thiết bị chưa bị thay đổi.", retry: "Thử lại", readinessTitle: "Mức sẵn sàng của gia đình", readinessIntro: "Checklist này chỉ hiển thị trạng thái và số đếm cục bộ. Nó không xác nhận file backup ở bên ngoài ứng dụng.", readinessStatus: (done: number, total: number) => `${done}/${total} mục đã sẵn sàng`, ready: "Sẵn sàng", review: "Cần xem lại", planReady: "Đã thiết lập kế hoạch", planReview: "Xem lại kế hoạch", emergencyReady: "Hồ sơ khẩn cấp đã chuẩn bị", emergencyReview: "Hoàn thiện hồ sơ khẩn cấp", printedReady: "Đã in hồ sơ khẩn cấp", printedReview: "Kiểm tra lần in", openGoals: "Mở Mục tiêu", openEmergency: "Mở Hồ sơ khẩn cấp", plan: "Kế hoạch", useDate: "Mốc sử dụng tiền", notConfigured: "Chưa thiết lập", yearsLeft: (years: number) => years === 1 ? "Còn 1 năm" : `Còn ${years} năm`, emergency: "Hồ sơ khẩn cấp", readiness: (done: number, total: number) => `Đã chuẩn bị ${done}/${total} phần`, contacts: (count: number) => `Đã khai báo ${count} liên hệ`, documents: (count: number) => `Đã ghi ${count} nơi cất giấy tờ`, lastPrinted: "Lần in gần nhất", notPrinted: "Chưa in", snapshot: "In tóm tắt bàn giao", snapshotHint: "Bản in của trình duyệt chỉ có kế hoạch, mức sẵn sàng và trạng thái dữ liệu. Không có liên hệ, nơi cất giấy tờ, tài khoản hay chi tiết giao dịch.", lotEvidence: "Mở bằng chứng lô thử nghiệm", generatedAt: "Tạo lúc", yearsLeftLabel: "Thời gian còn lại", pendingLabel: "Thay đổi đang chờ", localPrint: "Owner chủ động in tại thiết bị. Tóm tắt này không phải backup và không được gửi hoặc upload.", sync: "Trạng thái dữ liệu", syncSynced: "Đã đồng bộ", syncSyncing: "Còn thay đổi chờ đồng bộ", syncConflict: "Cần xử lý xung đột dữ liệu", syncOffline: "Được giữ trên thiết bị này", pending: (count: number) => `Còn ${count} thay đổi chờ`, localOnly: "Tóm tắt này chỉ ở trên thiết bị và không thay đổi dữ liệu.", back: "Về Tổng quan",
  };
}

function formatDate(iso: string | null, locale: "vi" | "de") {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function formatDateTime(date: Date, locale: "vi" | "de") {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
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
  const snapshot = buildContinuitySnapshot({ handoff, syncStatus, pending });
  const readinessItems = [
    { key: "plan", ready: handoff.readiness.planReady, label: handoff.readiness.planReady ? text.planReady : text.planReview, action: text.openGoals, to: "/goals" },
    { key: "emergency", ready: handoff.readiness.emergencyReady, label: handoff.readiness.emergencyReady ? text.emergencyReady : text.emergencyReview, action: text.openEmergency, to: "/notfallmappe" },
    { key: "printed", ready: handoff.readiness.printedReady, label: handoff.readiness.printedReady ? text.printedReady : text.printedReview, action: text.openEmergency, to: "/notfallmappe" },
  ];
  const printSnapshot = () => {
    const generatedAt = new Date();
    printContinuitySnapshot({
      locale,
      snapshot,
      labels: { title: text.title, generatedAt: text.generatedAt, localOnly: text.localPrint, plan: text.plan, useDate: text.useDate, yearsLeft: text.yearsLeftLabel, readiness: text.readinessTitle, sync: text.sync, pending: text.pendingLabel, notConfigured: text.notConfigured },
      formatted: { generatedAt: formatDateTime(generatedAt, locale), useDate: formatDate(snapshot.targetUseDate, locale), yearsLeft: snapshot.yearsLeft == null ? null : text.yearsLeft(snapshot.yearsLeft), readiness: text.readinessStatus(snapshot.readiness.complete, snapshot.readiness.total), sync: syncLabel, pending: snapshot.sync.pending > 0 ? text.pending(snapshot.sync.pending) : null },
    });
  };

  return <main className="hh-shell" aria-label={text.title}>
    <header className="hh-head"><p>{text.eyebrow}</p><h1>{text.title}</h1><span>{handoff.planName}{handoff.childName ? ` · ${handoff.childName}` : ""}</span></header>
    <div className="hh-privacy" role="note"><strong>{text.intro}</strong><p>{text.private}</p></div>
    <section className="hh-card hh-readiness"><div className="hh-card-head"><h2>{text.readinessTitle}</h2><span>{text.readinessStatus(handoff.readiness.complete, handoff.readiness.total)}</span></div><p>{text.readinessIntro}</p><ul className="hh-readiness-list">{readinessItems.map((item) => <li key={item.key} className={item.ready ? "is-ready" : "is-review"}><div><strong>{item.label}</strong><small>{item.ready ? text.ready : text.review}</small></div><Link to={item.to}>{item.action} ›</Link></li>)}</ul></section>
    <section className="hh-card hh-snapshot"><div className="hh-card-head"><h2>{text.snapshot}</h2><span>{text.localOnly}</span></div><p>{text.snapshotHint}</p><button type="button" className="hh-snapshot-button" onClick={printSnapshot}>{text.snapshot}</button><Link className="hh-link" to="/lot-evidence">{text.lotEvidence} ›</Link></section>
    <section className="hh-card"><div className="hh-card-head"><h2>{text.plan}</h2></div><div className="hh-main-value"><span>{text.useDate}</span><strong>{handoff.targetUseDate ?? text.notConfigured}</strong><small>{handoff.yearsLeft == null ? text.notConfigured : text.yearsLeft(handoff.yearsLeft)}</small></div></section>
    <section className="hh-card"><div className="hh-card-head"><h2>{text.emergency}</h2><span>{text.readiness(handoff.emergency.completeSections, handoff.emergency.totalSections)}</span></div><div className="hh-grid"><div><span>{text.contacts(handoff.emergency.contactCount)}</span><strong>{handoff.emergency.contactCount}</strong></div><div><span>{text.documents(handoff.emergency.documentLocationCount)}</span><strong>{handoff.emergency.documentLocationCount}</strong></div></div><p className="hh-meta">{text.lastPrinted}: {printed ?? text.notPrinted}</p><Link className="hh-link" to="/notfallmappe">{text.openEmergency} ›</Link></section>
    <section className={`hh-card hh-sync is-${syncStatus}`}><div className="hh-card-head"><h2>{text.sync}</h2><span>{syncLabel}</span></div><p>{pending > 0 ? text.pending(pending) : text.localOnly}</p></section>
    <Link className="hh-back" to="/">‹ {text.back}</Link>
  </main>;
}
