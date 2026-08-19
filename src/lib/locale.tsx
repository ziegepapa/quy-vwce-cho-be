import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type AppLocale = "vi" | "de";
export const LOCALE_KEY = "vwce-locale";

const copy = {
  vi: {
    overview: "Tổng quan",
    transactions: "Giao dịch",
    simulation: "Mô phỏng",
    settings: "Cài đặt",
    sync: "Đồng bộ",
    syncNow: "Đồng bộ ngay",
    syncNeedsSignIn: "Đăng nhập để đồng bộ giữa các thiết bị",
    synced: "Đã đồng bộ",
    syncing: "Đang đồng bộ…",
    offline: "Ngoại tuyến",
    conflict: "Cần xử lý xung đột",
    interface: "Giao diện",
    language: "Ngôn ngữ",
    account: "Tài khoản",
    advanced: "Nâng cao",
    prices: "Giá & dữ liệu thị trường",
    plan: "Kế hoạch sử dụng tiền",
    dataTools: "Sao lưu & dữ liệu trên thiết bị",
    themeVault: "Vault",
    themeOcean: "Ocean",
    themeEmber: "Ember",
    vietnamese: "Tiếng Việt",
    german: "Deutsch",
    saved: "Đã lưu",
    berlinTime: "Berlin · giờ hiện tại",
    using: "Đang dùng",
    active: "Đang bật",
    available: "Có sẵn",
    retrySave: "Thử lưu lại",
    close: "Đóng",
    exportJson: "Xuất JSON",
    backupOn: "Sao lưu {date}",
    noBackup: "Chưa có bản sao lưu",
    importBackup: "Nhập sao lưu",
    emergencyFile: "Hồ sơ khẩn cấp",
    mfaState: "MFA / TOTP",
    mfaEnabled: "Đã bật",
    mfaCreating: "Đang tạo…",
    mfaSetup: "Thiết lập",
    totpCode: "Mã 6 số",
    verifyTotp: "Xác minh TOTP",
    replaceData: "Thay dữ liệu bằng file {file}?",
    pushNow: "Đẩy trước",
    importing: "Đang nhập…",
    confirmImport: "Xác nhận nhập",
    cancel: "Hủy",
    logout: "Đăng xuất",
    advancedIntro: "Mỗi nhóm dùng dữ liệu trên thiết bị và chỉ thực hiện thao tác khi bạn xác nhận.",
    syncConflicts: "Đồng bộ & xung đột dữ liệu",
    syncConflictsSignIn: "Đăng nhập để xem hàng đợi, xử lý xung đột và đồng bộ dữ liệu giữa các thiết bị.",
    exportTransactionsCsv: "Xuất CSV giao dịch",
    exportTransactionsCsvSub: "Bảng dữ liệu dùng cho phân tích ngoài ứng dụng",
    restoreDeviceData: "Khôi phục dữ liệu trên thiết bị",
    restoreDeviceDataSub: "Mở quy trình kiểm tra dữ liệu an toàn",
    clearLocalData: "Xóa toàn bộ dữ liệu local",
    clearLocalDataSub: "Chỉ dùng khi bạn đã có bản sao lưu",
    deleteConfirmText: "Gõ XOA để xác nhận. Hành động này không thể hoàn tác trên thiết bị này.",
    deletePlaceholder: "XOA",
    confirmDelete: "Xác nhận xóa",
    online: "Online",
    pendingSync: "{count} chờ đồng bộ",
    settingsLoading: "Đang tải Cài đặt",
    settingsLoadError: "Không tải được Cài đặt",
    retry: "Thử lại",
    settingsAria: "Cài đặt",
  },
  de: {
    overview: "Übersicht",
    transactions: "Transaktionen",
    simulation: "Simulation",
    settings: "Einstellungen",
    sync: "Synchronisieren",
    syncNow: "Jetzt synchronisieren",
    syncNeedsSignIn: "Anmelden, um Daten zwischen Geräten zu synchronisieren",
    synced: "Synchronisiert",
    syncing: "Synchronisierung läuft…",
    offline: "Offline",
    conflict: "Konflikte prüfen",
    interface: "Erscheinungsbild",
    language: "Sprache",
    account: "Konto",
    advanced: "Erweitert",
    prices: "Kurse & Marktdaten",
    plan: "Verwendungsplan",
    dataTools: "Sicherung & lokale Daten",
    themeVault: "Vault",
    themeOcean: "Ocean",
    themeEmber: "Ember",
    vietnamese: "Vietnamesisch",
    german: "Deutsch",
    saved: "Gespeichert",
    berlinTime: "Berlin · aktuelle Zeit",
    using: "Aktiv",
    active: "Aktiv",
    available: "Verfügbar",
    retrySave: "Speichern erneut versuchen",
    close: "Schließen",
    exportJson: "JSON exportieren",
    backupOn: "Sicherung {date}",
    noBackup: "Keine Sicherung vorhanden",
    importBackup: "Sicherung importieren",
    emergencyFile: "Notfallmappe",
    mfaState: "MFA / TOTP",
    mfaEnabled: "Aktiviert",
    mfaCreating: "Wird erstellt…",
    mfaSetup: "Einrichten",
    totpCode: "6-stelliger Code",
    verifyTotp: "TOTP bestätigen",
    replaceData: "Daten durch Datei {file} ersetzen?",
    pushNow: "Zuerst hochladen",
    importing: "Wird importiert…",
    confirmImport: "Import bestätigen",
    cancel: "Abbrechen",
    logout: "Abmelden",
    advancedIntro: "Jede Gruppe verwendet nur Gerätedaten und führt Aktionen erst nach Ihrer Bestätigung aus.",
    syncConflicts: "Synchronisierung & Datenkonflikte",
    syncConflictsSignIn: "Melden Sie sich an, um die Warteschlange, Konflikte und die Synchronisierung zwischen Geräten zu verwalten.",
    exportTransactionsCsv: "Transaktionen als CSV exportieren",
    exportTransactionsCsvSub: "Datentabelle für Analysen außerhalb der App",
    restoreDeviceData: "Gerätedaten wiederherstellen",
    restoreDeviceDataSub: "Öffnet den sicheren Prüfablauf für Daten",
    clearLocalData: "Alle lokalen Daten löschen",
    clearLocalDataSub: "Nur verwenden, wenn eine Sicherung vorhanden ist",
    deleteConfirmText: "Geben Sie XOA zur Bestätigung ein. Diese Aktion kann auf diesem Gerät nicht rückgängig gemacht werden.",
    deletePlaceholder: "XOA",
    confirmDelete: "Löschen bestätigen",
    online: "Online",
    pendingSync: "{count} ausstehend",
    settingsLoading: "Einstellungen werden geladen",
    settingsLoadError: "Einstellungen konnten nicht geladen werden",
    retry: "Erneut versuchen",
    settingsAria: "Einstellungen",
  },
} as const;

export type LocaleKey = keyof (typeof copy)["vi"];

function isLocale(value: unknown): value is AppLocale {
  return value === "vi" || value === "de";
}

export function readLocale(): AppLocale {
  try {
    const stored = window.localStorage.getItem(LOCALE_KEY);
    return isLocale(stored) ? stored : "vi";
  } catch {
    return "vi";
  }
}

export function applyLocale(locale: AppLocale): void {
  document.documentElement.lang = locale === "de" ? "de" : "vi";
  document.documentElement.dataset.locale = locale;
}

export function persistLocale(locale: AppLocale): void {
  applyLocale(locale);
  try {
    window.localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // A session-only locale is still preferable to a non-responsive control.
  }
}

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: LocaleKey) => string;
};

const fallbackLocaleContext: LocaleContextValue = {
  locale: "vi",
  setLocale: (next) => persistLocale(next),
  t: (key) => copy.vi[key],
};

const LocaleContext = createContext<LocaleContextValue>(fallbackLocaleContext);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<AppLocale>(() => readLocale());
  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale: (next) => {
      persistLocale(next);
      updateLocale(next);
    },
    t: (key) => copy[locale][key],
  }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

applyLocale(readLocale());
