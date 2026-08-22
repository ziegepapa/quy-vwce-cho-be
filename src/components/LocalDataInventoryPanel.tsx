import { useCallback, useEffect, useState } from "react";
import { countLocalData } from "../lib/db";
import { useLocale, type AppLocale } from "../lib/locale";
import { getLocalDiagnostics } from "./localDiagnostics";

type LocalDataCounts = Awaited<ReturnType<typeof countLocalData>>;

type InventoryCopy = {
  title: string;
  intro: string;
  loading: string;
  error: string;
  refresh: string;
  counts: {
    settings: string;
    goals: string;
    transactions: string;
    records: string;
    quotes: string;
    diagnostics: string;
  };
  backup: string;
  diagnosticsNote: string;
  cache: string;
};

function copyFor(locale: "vi" | "de"): InventoryCopy {
  return locale === "de" ? {
    title: "Lokale Datenübersicht",
    intro: "Es werden nur Mengen angezeigt. Transaktionsinhalte, Notizen, Kontodaten und technische Fehler werden hier nicht gelesen oder angezeigt.",
    loading: "Lokale Datenübersicht wird geladen…",
    error: "Die lokale Datenübersicht konnte nicht gelesen werden. Ihre Daten wurden nicht verändert.",
    refresh: "Übersicht aktualisieren",
    counts: {
      settings: "Einstellungen",
      goals: "Ziele",
      transactions: "Transaktionen",
      records: "Checklisten und Monatsstände",
      quotes: "Kurse",
      diagnostics: "Lokale Diagnoseereignisse",
    },
    backup: "Eine JSON-Sicherung wird nur erstellt, wenn Sie JSON exportieren wählen. Eine Sicherung enthält keine Anmeldedaten oder technischen Rohfehler.",
    diagnosticsNote: "Diagnoseereignisse bleiben ausschließlich auf diesem Gerät und können im Abschnitt Gerätediagnose gelöscht werden.",
    cache: "Der PWA-Cache enthält nur App-Dateien für den Offline-Start, keine Transaktionsinhalte.",
  } : {
    title: "Tổng quan dữ liệu trên thiết bị",
    intro: "Chỉ hiển thị số lượng. Nội dung giao dịch, ghi chú, dữ liệu tài khoản và lỗi kỹ thuật không được đọc hoặc hiển thị ở đây.",
    loading: "Đang đọc tổng quan dữ liệu trên thiết bị…",
    error: "Không đọc được tổng quan dữ liệu trên thiết bị. Dữ liệu chưa bị thay đổi.",
    refresh: "Làm mới tổng quan",
    counts: {
      settings: "Cài đặt",
      goals: "Mục tiêu",
      transactions: "Giao dịch",
      records: "Checklist và mốc theo tháng",
      quotes: "Giá",
      diagnostics: "Sự kiện chẩn đoán local",
    },
    backup: "Bản sao JSON chỉ được tạo khi bạn chọn Xuất JSON. Bản sao không bao gồm thông tin đăng nhập hoặc lỗi kỹ thuật gốc.",
    diagnosticsNote: "Sự kiện chẩn đoán chỉ nằm trên thiết bị này và có thể xóa ở nhóm Chẩn đoán trên thiết bị.",
    cache: "PWA cache chỉ chứa tệp ứng dụng để mở khi offline, không chứa nội dung giao dịch.",
  };
}

export default function LocalDataInventoryPanel({ localeOverride }: { localeOverride?: AppLocale }) {
  const { locale: contextLocale } = useLocale();
  const locale = localeOverride ?? contextLocale;
  const text = copyFor(locale);
  const [counts, setCounts] = useState<LocalDataCounts | null>(null);
  const [diagnosticCount, setDiagnosticCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const next = await countLocalData();
      setCounts(next);
      setDiagnosticCount(getLocalDiagnostics().length);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rows = counts ? [
    [text.counts.settings, counts.settings],
    [text.counts.goals, counts.goals],
    [text.counts.transactions, counts.transactions],
    [text.counts.records, counts.annualChecklists + counts.monthlySnapshots],
    [text.counts.quotes, counts.quotes],
    [text.counts.diagnostics, diagnosticCount],
  ] : [];

  return (
    <section className="local-data-inventory" aria-labelledby="local-data-inventory-title" data-testid="local-data-inventory">
      <div className="local-data-inventory-head">
        <div>
          <h3 id="local-data-inventory-title">{text.title}</h3>
          <p>{text.intro}</p>
        </div>
        <button type="button" className="secondary" disabled={loading} onClick={() => void refresh()}>
          {text.refresh}
        </button>
      </div>
      {loading ? <p role="status" className="local-data-inventory-state">{text.loading}</p> : null}
      {loadError ? <p role="alert" className="local-data-inventory-state">{text.error}</p> : null}
      {!loading && !loadError ? (
        <dl className="local-data-inventory-list">
          {rows.map(([label, count]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{count}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="local-data-inventory-notes">
        <p>{text.backup}</p>
        <p>{text.diagnosticsNote}</p>
        <p>{text.cache}</p>
      </div>
    </section>
  );
}
