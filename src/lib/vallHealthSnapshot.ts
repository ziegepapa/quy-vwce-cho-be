/** Versioned, reviewed repo-only data. Never accesses network, Dexie, SQL or Gemini. */
export type VallHealthRecord = {
  asOf: string;
  totalAssetsUsdMillions: number;
  ongoingChargesPercent: number;
  trackingDifferenceAnnualPp: number | null;
  sourceUrl: string;
};
export type VallFlag = "persistentNegativeTrackingDifference" | "severeAumDrop" |
  "lostFreeVallSparplan" | "increasedTer" | "mergerOrLiquidation";
export type VallHealthSnapshot = {
  schemaVersion: 1;
  fundIsin: "IE000VAHT5T0";
  benchmark: "FTSE Global All Cap Index";
  checkedOn: string;
  source: string;
  sourceUrl: string;
  history: VallHealthRecord[];
  tradeRepublic: {
    checkedOn: string;
    generalSparplanExecutionFree: boolean;
    vallSparplanFreeVerified: boolean | null;
    sourceUrl: string;
  };
  fundCorporateActionVerified: boolean | null;
  flags: Record<VallFlag, boolean | null>;
  externalReviewDates: { light: string[]; full: string };
  fallback: {
    isin: "IE00BK5BQT80";
    name: string;
    benchmark: "FTSE All-World Index";
    ongoingChargesPercent: number;
    sourceUrl: string;
  };
};

const flags: VallFlag[] = ["persistentNegativeTrackingDifference", "severeAumDrop",
  "lostFreeVallSparplan", "increasedTer", "mergerOrLiquidation"];
const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const day = (v: unknown): v is string => typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) &&
  new Date(v + "T00:00:00Z").toISOString().slice(0,10) === v;
const maybeBool = (v: unknown) => v === null || typeof v === "boolean";
const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const link = (v: unknown, host: string) => typeof v === "string" &&
  v.startsWith("https://" + host + "/");

export function parseVallHealth(input: unknown): VallHealthSnapshot | null {
  if (!isRecord(input) || input.schemaVersion !== 1 ||
      input.fundIsin !== "IE000VAHT5T0" || input.benchmark !== "FTSE Global All Cap Index" ||
      !day(input.checkedOn) || typeof input.source !== "string" ||
      !link(input.sourceUrl,"fund-docs.vanguard.com") ||
      !Array.isArray(input.history) || input.history.length < 1) return null;
  let last = "";
  for (const v of input.history) {
    if (!isRecord(v) || !day(v.asOf) || v.asOf <= last || v.asOf > input.checkedOn ||
        !finite(v.totalAssetsUsdMillions) || (v.totalAssetsUsdMillions as number) <= 0 ||
        !finite(v.ongoingChargesPercent) || (v.ongoingChargesPercent as number) < 0 ||
        (v.ongoingChargesPercent as number) > 5 ||
        !(v.trackingDifferenceAnnualPp === null || finite(v.trackingDifferenceAnnualPp)) ||
        (v.trackingDifferenceAnnualPp !== null && v.asOf < "2027-08-18") ||
        !link(v.sourceUrl,"fund-docs.vanguard.com")) return null;
    last = v.asOf;
  }
  const tr = input.tradeRepublic;
  if (!isRecord(tr) || !day(tr.checkedOn) || tr.checkedOn > input.checkedOn ||
      typeof tr.generalSparplanExecutionFree !== "boolean" ||
      !maybeBool(tr.vallSparplanFreeVerified) ||
      !link(tr.sourceUrl,"support.traderepublic.com")) return null;
  if (!maybeBool(input.fundCorporateActionVerified) || !isRecord(input.flags) ||
      !flags.every(key=>maybeBool(input.flags[key]))) return null;
  const next = input.externalReviewDates;
  if (!isRecord(next) || !Array.isArray(next.light) ||
      next.light.length !== 2 || !next.light.every(day) || !day(next.full) ||
      next.light[0] >= next.light[1] || next.light[1] >= next.full) return null;
  const fallback = input.fallback;
  if (!isRecord(fallback) || fallback.isin !== "IE00BK5BQT80" ||
      fallback.benchmark !== "FTSE All-World Index" ||
      typeof fallback.name !== "string" ||
      !finite(fallback.ongoingChargesPercent) ||
      !link(fallback.sourceUrl,"fund-docs.vanguard.com")) return null;
  return input as VallHealthSnapshot;
}

export function verifiedVallWarning(data: VallHealthSnapshot): boolean {
  return flags.some(key=>data.flags[key] === true);
}
