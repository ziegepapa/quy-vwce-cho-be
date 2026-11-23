import { describe, expect, it } from "vitest";
import snapshot from "../data/vall-health.json";
import { parseVallHealth, verifiedVallWarning } from "./vallHealthSnapshot";

const copy = () => JSON.parse(JSON.stringify(snapshot)) as Record<string, any>;

describe("VALL dated, version-controlled factsheet ledger", () => {
  it("preserves the Sep observation and appends dated Aug and Oct Total vs share-class assets", () => {
    const data = parseVallHealth(snapshot);
    expect(data).not.toBeNull();
    expect(data!.fundIsin).toBe("IE000VAHT5T0");
    expect(data!.benchmark).toBe("FTSE Global All Cap Index");
    expect(data!.history.map(x => [x.asOf,x.totalAssetsUsdMillions,x.shareClassAssetsUsdMillions]))
      .toEqual([["2026-08-31",660,645],["2026-09-30",2573,2506],["2026-10-31",4353,4223]]);
    expect(data!.history.map(x => x.ongoingChargesPercent)).toEqual([null,0.07,0.07]);
    expect(data!.history.map(x => x.trackingDifferenceAnnualPp)).toEqual([null,null,null]);
    expect(data!.history.map(x => x.provenance)).toEqual(["owner-ledger","direct-pdf-2026-09","direct-pdf-2026-10"]);
    expect(data!.tradeRepublic.vallSparplanFreeVerified).toBeNull();
    expect(data!.tradeRepublic.userReportedFees).toMatchObject({sparplanExecutionEur:0,oneOffOrderEur:1,provenance:"owner-reported-not-broker-confirmed"});
    expect(Object.values(data!.flags)).toEqual([null,null,null,null,null]);
    expect(data!.externalReviewDates).toEqual({light:["2027-01-16","2027-04-16"],full:"2027-08-16"});
    expect(verifiedVallWarning(data!)).toBe(false);
  });
  it("holds October portfolio characteristics as dated and non-performance evidence",()=>{
    const rep=parseVallHealth(snapshot)!.replicationSnapshot;
    expect(rep.asOf).toBe("2026-10-31");
    expect(rep.provenance).toBe("direct-pdf-2026-10");
    expect(rep.holdings).toEqual({fund:6977,benchmark:10207});
    expect(rep.priceEarnings).toEqual({fund:19.4,benchmark:19.3});
    expect(rep.priceBook).toEqual({fund:3.2,benchmark:3.2});
    expect(rep.returnOnEquityPercent).toEqual({fund:18.5,benchmark:18.5});
    expect(rep.earningsGrowthPercent).toEqual({fund:19,benchmark:19});
    expect(rep.dividendYieldPercent).toEqual({fund:1.6,benchmark:1.6});
  });
  it("rejects fabricated sources, cross-mixed AUM, premature TD and false broker confirmations",()=>{
    for(const change of [
      (d:any)=>d.fundIsin="IE00BK5BQT80",
      (d:any)=>d.benchmark="FTSE All-World Index",
      (d:any)=>d.history[0].asOf="2026-02-30",
      (d:any)=>d.history[1].shareClassAssetsUsdMillions=9999,
      (d:any)=>d.history[2].provenance="direct-pdf-2026-09",
      (d:any)=>d.history[0].provenance="direct-pdf-2026-10",
      (d:any)=>d.replicationSnapshot.asOf="2026-09-30",
      (d:any)=>d.history[2].sourceUrl="http://unverified.example",
      (d:any)=>d.history[2].trackingDifferenceAnnualPp=-0.2,
      (d:any)=>d.history[2].ongoingChargesPercent=-0.1,
      (d:any)=>d.replicationSnapshot.holdings.fund=6977.5,
      (d:any)=>d.replicationSnapshot.priceBook.benchmark="2.8",
      (d:any)=>d.replicationSnapshot.asOf="2026-11-30",
      (d:any)=>d.tradeRepublic.vallSparplanFreeVerified="free",
      (d:any)=>d.tradeRepublic.userReportedFees.provenance="broker-verified",
      (d:any)=>d.flags.mergerOrLiquidation="none",
      (d:any)=>d.externalReviewDates.full="2027-01-15",
    ]) { const d=copy();change(d);expect(parseVallHealth(d)).toBeNull(); }
  });
  it("permits later dated AUM observations without claiming the October replication facts were updated",()=>{
    const d=copy();
    d.checkedOn="2027-09-30";
    d.history.push({...d.history.at(-1),asOf:"2027-09-30",provenance:"owner-ledger",totalAssetsUsdMillions:4800,shareClassAssetsUsdMillions:4700,trackingDifferenceAnnualPp:-0.21});
    expect(parseVallHealth(d)?.history.at(-1)?.totalAssetsUsdMillions).toBe(4800);
    expect(parseVallHealth(d)?.replicationSnapshot.asOf).toBe("2026-10-31");
    expect(verifiedVallWarning(parseVallHealth(d)!)).toBe(false);
    d.flags.persistentNegativeTrackingDifference=true;
    expect(verifiedVallWarning(parseVallHealth(d)!)).toBe(true);
    d.history.push({...d.history.at(-1)});
    expect(parseVallHealth(d)).toBeNull();
  });
});
