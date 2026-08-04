/** Venue-local calendar helpers (default Europe/Berlin for XETRA). */

export function dateStringInTz(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;
  return `${y}-${m}-${day}`;
}

export function hourInTz(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  return Number(parts.find((p) => p.type === "hour").value);
}

export function roundPrice(n) {
  return Math.round(n * 10000) / 10000;
}

export function roundPct(n) {
  return Math.round(n * 10000) / 10000;
}

export const ASOF_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True calendar YYYY-MM-DD (rejects 2026-02-30). */
export function isValidAsOfDate(s) {
  if (typeof s !== "string" || !ASOF_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}
