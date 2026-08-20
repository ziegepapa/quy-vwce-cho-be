import { useState } from "react";
import { useLocale } from "../lib/locale";
import {
  clearLocalDiagnostics,
  getLocalDiagnostics,
  type DiagnosticCategory,
  type DiagnosticCode,
  type LocalDiagnosticEvent,
} from "./localDiagnostics";

function formatTimestamp(value: string, locale: "vi" | "de") {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function categoryLabel(category: DiagnosticCategory, locale: "vi" | "de") {
  const de = locale === "de";
  switch (category) {
    case "app-failure": return de ? "Anwendung" : "Ứng dụng";
    case "page-failure": return de ? "Aktuelle Seite" : "Trang hiện tại";
    case "sync-health": return de ? "Synchronisierung" : "Đồng bộ";
  }
}

function codeLabel(code: DiagnosticCode, locale: "vi" | "de") {
  const de = locale === "de";
  const labels: Record<DiagnosticCode, [string, string]> = {
    "unhandled-rejection": ["Sự cố chưa xử lý", "Unerwarteter Fehler"],
    "render-error": ["Giao diện cần tải lại", "Oberfläche muss neu geladen werden"],
    "signed-out": ["Chỉ trên thiết bị này", "Nur auf diesem Gerät"],
    recovery: ["Cần khôi phục", "Wiederherstellung erforderlich"],
    conflict: ["Có xung đột cần xem", "Konflikt erfordert Prüfung"],
    retry: ["Cần đồng bộ lại", "Synchronisierung erneut erforderlich"],
    offline: ["Ngoại tuyến", "Offline"],
    syncing: ["Đang đồng bộ", "Synchronisierung läuft"],
    pending: ["Có thay đổi đang chờ", "Änderungen ausstehend"],
    synced: ["Đã đồng bộ", "Synchronisiert"],
    "sync-failed": ["Chưa hoàn tất đồng bộ", "Synchronisierung nicht abgeschlossen"],
  };
  return labels[code][de ? 1 : 0];
}

function EventRow({ event, locale }: { event: LocalDiagnosticEvent; locale: "vi" | "de" }) {
  return (
    <li>
      <strong>{categoryLabel(event.category, locale)}</strong>
      <span>{codeLabel(event.code, locale)}</span>
      <time dateTime={event.at}>{formatTimestamp(event.at, locale)}</time>
    </li>
  );
}

/**
 * A device-local, user-visible diagnostic journal. The backing collector stores
 * only an allowlisted timestamp/category/code tuple and never transmits data.
 */
export default function LocalDiagnosticsPanel() {
  const { locale } = useLocale();
  const [events, setEvents] = useState(() => getLocalDiagnostics());
  const [cleared, setCleared] = useState(false);
  const de = locale === "de";

  const refresh = () => {
    setEvents(getLocalDiagnostics());
    setCleared(false);
  };
  const clear = () => {
    clearLocalDiagnostics();
    setEvents([]);
    setCleared(true);
  };

  return (
    <details className="advanced-group" data-testid="local-diagnostics-panel">
      <summary>{de ? "Gerätediagnose" : "Chẩn đoán trên thiết bị"}</summary>
      <div className="advanced-actions">
        <p className="advanced-empty">
          {de
            ? "Dieses Protokoll bleibt auf diesem Gerät. Es enthält weder Beträge, Transaktionen, Notizen, Kontodaten noch Fehlermeldungen und wird nicht übertragen."
            : "Nhật ký này chỉ nằm trên thiết bị. Nó không chứa số tiền, giao dịch, ghi chú, thông tin tài khoản hoặc nội dung lỗi và không được gửi đi."}
        </p>
        {events.length === 0 ? (
          <p role="status" className="advanced-empty">
            {cleared
              ? (de ? "Das lokale Diagnoseprotokoll wurde gelöscht." : "Đã xóa nhật ký chẩn đoán trên thiết bị.")
              : (de ? "Noch keine lokalen Diagnoseereignisse." : "Chưa có sự kiện chẩn đoán trên thiết bị.")}
          </p>
        ) : (
          <ul className="local-diagnostics-list" aria-label={de ? "Lokales Diagnoseprotokoll" : "Nhật ký chẩn đoán trên thiết bị"}>
            {[...events].reverse().map((event) => <EventRow key={`${event.at}-${event.category}-${event.code}`} event={event} locale={locale} />)}
          </ul>
        )}
        <div className="stack" style={{ marginTop: 8 }}>
          <button type="button" className="secondary" onClick={refresh}>{de ? "Aktualisieren" : "Làm mới"}</button>
          <button type="button" className="ghost" onClick={clear} disabled={events.length === 0}>{de ? "Protokoll löschen" : "Xóa nhật ký"}</button>
        </div>
      </div>
    </details>
  );
}
