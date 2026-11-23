import { describe, expect, it } from "vitest";
import snapshot from "../data/vall-health.json";
import { parseVallHealth, verifiedVallWarning } from "./vallHealthSnapshot";

const copy = () => JSON.parse(JSON.stringify(snapshot)) as Record<string, any>;

describe("VALL passive repo snapshots", () => {
  it("reads only the sourced September facts, not invented TD or VALL Sparplan confirmation", () => {
    const data = parseVallHealth(snapshot);
    expect(data).not.toBeNull();
    expect(data!.fundIsin).toBe("IE000VAHT5T0");
    expect(data!.benchmark).toBe("FTSE Global All Cap Index");
    expect(data!.history[0].asOf).toBe("2026-09-30");
    expect(data!.history[0].totalAssetsUsdMillions).toBe(2573);
    expect(data!.history[0].ongoingChargesPercent).toBe(0.07);
    expect(data!.history[0].trackingDifferenceAnnualPp).toBeNull();
    expect(data!.tradeRepublic.vallSparplanFreeVerified).toBeNull();
    expect(data!.externalReviewDates).toEqual({light:["2027-01-16","2027-04-16"],full:"2027-08-16"});
    expect(verifiedVallWarning(data!)).toBe(false);
  });
  it("fails closed on mismatched fund, benchmark, invalid date, missing source, premature tracking difference or bad value", () => {
    for (const change of [
      (d:any)=>d.fundIsin="IE00BK5BQT80",
      (d:any)=>d.benchmark="FTSE All-World Index",
      (d:any)=>d.history[0].asOf="2026-02-30",
      (d:any)=>d.history[0].sourceUrl="http://unverified.example/doc",
      (d:any)=>d.history[0].trackingDifferenceAnnualPp=-0.2,
      (d:any)=>d.history[0].totalAssetsUsdMillions=0,
      (d:any)=>d.flags.mergerOrLiquidation="none",
      (d:any)=>d.tradeRepublic.vallSparplanFreeVerified="free",
      (d:any)=>d.externalReviewDates.full="2027-01-15",
    ]) {const d=copy();change(d);expect(parseVallHealth(d)).toBeNull();}
  });
  it("uses the latest source-dated observation without comparing unrelated AUM feeds",()=>{
    const d=copy();
    d.checkedOn="2027-09-30";
    d.history.push({asOf:"2027-09-30",totalAssetsUsdMillions:2500,ongoingChargesPercent:0.07,
      trackingDifferenceAnnualPp:-0.21,sourceUrl:d.sourceUrl});
    expect(parseVallHealth(d)?.history.at(-1)?.totalAssetsUsdMillions).toBe(2500);
    expect(verifiedVallWarning(parseVallHealth(d)!)).toBe(false); // no automatic flags
    d.flags.persistentNegativeTrackingDifference=true;
    expect(verifiedVallWarning(parseVallHealth(d)!)).toBe(true);
  });
  it("rejects unsorted observations and unverified provider recipients",()=>{
    const d=copy();d.history.push({...d.history[0]});expect(parseVallHealth(d)).toBeNull();
  });
});
