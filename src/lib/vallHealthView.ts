import type { VallFlag, VallHealthSnapshot } from "./vallHealthSnapshot";

/** Presentation facts only. No provider fetch, background task, risk score or investment decision. */
export const vallFlagOrder: readonly VallFlag[] = [
  "persistentNegativeTrackingDifference",
  "severeAumDrop",
  "lostFreeVallSparplan",
  "increasedTer",
  "mergerOrLiquidation",
] as const;

export function vallViewState(data: VallHealthSnapshot, today = new Date().toISOString().slice(0,10)) {
  const knownFlags = vallFlagOrder.filter(key => data.flags[key] !== null).length;
  const warningFlags = vallFlagOrder.filter(key => data.flags[key] === true).length;
  const unknownFlags = vallFlagOrder.length - knownFlags;
  const dates = [
    ...data.externalReviewDates.light.map(date => ({date, kind: "light" as const})),
    {date: data.externalReviewDates.full, kind: "full" as const},
  ].sort((a,b) => a.date.localeCompare(b.date));
  const nextReview = dates.find(item => item.date >= today) ?? null;
  const hasHistory = data.history.length > 1;
  return { knownFlags, warningFlags, unknownFlags, nextReview, hasHistory };
}

/** Counts whole calendar days; no timer or background scheduling. */
export function daysUntilExternalReview(isoDate: string, today: string): number {
  return Math.round((Date.parse(isoDate + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000);
}

/** Historical fund size change, NOT investment return, inflow or a health score. */
export function aumChangePercent(current: number, previous: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) throw new RangeError("invalid_aum");
  return ((current - previous) / previous) * 100;
}
