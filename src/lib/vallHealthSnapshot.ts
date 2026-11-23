/** Versioned, reviewed repo-only data. Never accesses network, Dexie, SQL or Gemini. */
export type VallHealthRecord = {
  asOf: string;
  totalAssetsUsdMillions: number;
  shareClassAssetsUsdMillions: number;
  ongoingChargesPercent: number | null;
  trackingDifferenceAnnualPp: number | null;
  sourceUrl: string;
  provenance: "owner-ledger" | "direct-pdf-2026-09";
};
export type VallComparison = { fund: number; benchmark: number };
export type VallReplicationSnapshot = {
  asOf: string;
  provenance: "owner-ledger";
  sourceUrl: string;
  holdings: VallComparison;
  priceEarnings: VallComparison;
  priceBook: VallComparison;
  returnOnEquityPercent: VallComparison;
  earningsGrowthPercent: VallComparison;
  dividendYieldPercent: VallComparison;
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
  sourceVerificationNote: string;
  history: VallHealthRecord[];
  replicationSnapshot: VallReplicationSnapshot;
  tradeRepublic: {
    checkedOn: string;
    generalSparplanExecutionFree: boolean;
    vallSparplanFreeVerified: boolean | null;
    sourceUrl: string;
    userReportedFees: { asOf: string; sparplanExecutionEur: number; oneOffOrderEur: number; provenance: "owner-reported-not-broker-confirmed" };
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
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const link = (v: unknown, host: string) => typeof v === "string" &&
  v.startsWith("https://" + host + "/");

export function parseVallHealth(input: unknown): VallHealthSnapshot | null {
  if (!isRecord(input) || input.schemaVersion !== 1 ||
      input.fundIsin !== "IE000VAHT5T0" || input.benchmark !== "FTSE Global All Cap Index" ||
      !day(input.checkedOn) || typeof input.source !== "string" ||
      !link(input.sourceUrl,"fund-docs.vanguard.com") ||
      typeof input.sourceVerificationNote !== "string" ||
      !Array.isArray(input.history) || input.history.length < 1) return null;
  let last = "";
  for (const v of input.history) {
    if (!isRecord(v) || !day(v.asOf) || v.asOf <= last || v.asOf > input.checkedOn ||
        !finite(v.totalAssetsUsdMillions) || (v.totalAssetsUsdMillions as number) <= 0 ||
        !finite(v.shareClassAssetsUsdMillions) || (v.shareClassAssetsUsdMillions as number) <= 0 ||
        (v.shareClassAssetsUsdMillions as number) > (v.totalAssetsUsdMillions as number) ||
        !(v.ongoingChargesPercent === null || finite(v.ongoingChargesPercent)) ||
        (v.ongoingChargesPercent !== null && ((v.ongoingChargesPercent as number) < 0 || (v.ongoingChargesPercent as number) > 5)) ||
        !(v.trackingDifferenceAnnualPp === null || finite(v.trackingDifferenceAnnualPp)) ||
        (v.trackingDifferenceAnnualPp !== null && v.asOf < "2027-08-18") ||
        !link(v.sourceUrl,"fund-docs.vanguard.com") ||
        (typeof v.provenance !== "string" || !["owner-ledger","direct-pdf-2026-09"].includes(v.provenance)) ||
        (v.provenance === "direct-pdf-2026-09" && v.asOf !== "2026-09-30")) return null;
    last = v.asOf;
  }
  const tr = input.tradeRepublic;
  if (!isRecord(tr) || !day(tr.checkedOn) || tr.checkedOn > input.checkedOn ||
      typeof tr.generalSparplanExecutionFree !== "boolean" ||
      !maybeBool(tr.vallSparplanFreeVerified) ||
      !link(tr.sourceUrl,"support.traderepublic.com")) return null;
  const userFees = tr.userReportedFees;
  if (!isRecord(userFees) || !day(userFees.asOf) || userFees.asOf > input.checkedOn ||
      userFees.provenance !== "owner-reported-not-broker-confirmed" ||
      !finite(userFees.sparplanExecutionEur) || userFees.sparplanExecutionEur < 0 ||
      !finite(userFees.oneOffOrderEur) || userFees.oneOffOrderEur < 0) return null;
  const replication = input.replicationSnapshot;
  if (!isRecord(replication) || !day(replication.asOf) || replication.asOf > input.checkedOn ||
      replication.provenance !== "owner-ledger" ||
      !link(replication.sourceUrl,"fund-docs.vanguard.com") ||
      replication.asOf > last || !input.history.some(item => isRecord(item) && item.asOf === replication.asOf)) return null;
  for (const field of ["holdings","priceEarnings","priceBook","returnOnEquityPercent","earningsGrowthPercent","dividendYieldPercent"]) {
    const point = replication[field];
    if (!isRecord(point) || !finite(point.fund) || !finite(point.benchmark) ||
        point.fund < 0 || point.benchmark < 0 || point.fund > 500000 || point.benchmark > 500000) return null;
    if (field === "holdings" && (!Number.isInteger(point.fund) || !Number.isInteger(point.benchmark))) return null;
  }
  const verifiedFlags = input.flags;
  if (!maybeBool(input.fundCorporateActionVerified) || !isRecord(verifiedFlags) ||
      !flags.every(key=>maybeBool(verifiedFlags[key]))) return null;
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
