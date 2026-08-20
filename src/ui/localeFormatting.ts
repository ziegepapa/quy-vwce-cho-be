export type DisplayLocale = "vi" | "de";

function intlLocale(locale: DisplayLocale): "vi-VN" | "de-DE" {
  return locale === "de" ? "de-DE" : "vi-VN";
}

function dateFromIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10));
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDisplayDate(value: string, locale: DisplayLocale): string {
  if (!value) return "—";
  const date = dateFromIso(value);
  if (!date) return value;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDisplayMoney(value: number, locale: DisplayLocale, currency = "EUR"): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDisplayQuantity(
  value: number,
  locale: DisplayLocale,
  maximumFractionDigits = 4,
): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits,
  }).format(value);
}
