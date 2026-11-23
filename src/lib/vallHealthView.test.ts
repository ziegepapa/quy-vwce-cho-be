import { describe, expect, it } from "vitest";
import raw from "../data/vall-health.json";
import { parseVallHealth } from "./vallHealthSnapshot";
import { vallViewState, aumChangePercent, daysUntilExternalReview } from "./vallHealthView";
const base = parseVallHealth(raw)!;

describe("VALL presentation is not a risk score or background tracking system",()=>{
  it("maintains all five red flags as unverified",()=>{
    expect(vallViewState(base,"2026-11-23")).toEqual({
      knownFlags:0,warningFlags:0,unknownFlags:5,nextReview:{date:"2027-01-16",kind:"light"},hasHistory:true,
    });
  });
  it("computes a sourced +69% fund asset change rather than an investment return",()=>{
    const aug=base.history[0].totalAssetsUsdMillions;
    const sep=base.history[1].totalAssetsUsdMillions;
    const oct=base.history[2].totalAssetsUsdMillions;
    expect([aug,sep,oct]).toEqual([660,2573,4353]);
    expect(Math.round(aumChangePercent(oct,sep))).toBe(69);
    expect(aumChangePercent(oct,sep)).toBeCloseTo(69.1799455888,5);
    expect(()=>aumChangePercent(oct,0)).toThrow();
  });
  it("counts calendar days only upon rendering and does not assume a past check completed",()=>{
    expect(daysUntilExternalReview("2027-01-16","2026-11-23")).toBe(54);
    expect(vallViewState(base,"2027-01-17").nextReview?.date).toBe("2027-04-16");
    expect(vallViewState(base,"2027-04-17").nextReview?.date).toBe("2027-08-16");
    expect(vallViewState(base,"2027-08-17").nextReview).toBeNull();
  });
  it("only displays explicitly reviewed outcomes as alerts, never synthesizes a score",()=>{
    const d=structuredClone(base);d.flags.increasedTer=true;d.flags.severeAumDrop=false;
    expect(vallViewState(d,"2026-11-23")).toMatchObject({knownFlags:2,warningFlags:1,unknownFlags:3});
  });
});
