import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type AppLocale = "vi" | "de";
export const LOCALE_KEY = "vwce-locale";

const copy = {
  vi: {
    overview: "Overview",
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
    vietnamese: "Tiếng Việt",
    german: "Deutsch",
    saved: "Gespeichert",
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
