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
