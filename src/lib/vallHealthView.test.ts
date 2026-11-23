import { describe, expect, it } from "vitest";
import raw from "../data/vall-health.json";
import { parseVallHealth } from "./vallHealthSnapshot";
import { vallViewState } from "./vallHealthView";

const base = parseVallHealth(raw)!;

describe("VALL evidence-first presentation — not a live monitor or health score", () => {
  it("does not mistake five unverified flags for five safe checks", () => {
    expect(vallViewState(base, "2026-11-23")).toEqual({
      knownFlags: 0,
      warningFlags: 0,
      unknownFlags: 5,
      nextReview: {date:"2027-01-16",kind:"light"},
      hasHistory:false,
    });
  });
  it("shows the upcoming external schedule but never treats elapsed reviews as completed", () => {
    expect(vallViewState(base,"2027-01-17").nextReview).toEqual({date:"2027-04-16",kind:"light"});
    expect(vallViewState(base,"2027-04-17").nextReview).toEqual({date:"2027-08-16",kind:"full"});
    expect(vallViewState(base,"2027-08-17").nextReview).toBeNull();
  });
  it("only interprets explicitly documented manual flag outcomes", () => {
    const data = structuredClone(base);
    data.flags.increasedTer=true;
    data.flags.severeAumDrop=false;
    expect(vallViewState(data,"2026-11-23")).toMatchObject({knownFlags:2,warningFlags:1,unknownFlags:3});
  });
  it("never synthesizes historical trend from a single dated factsheet", () => {
    expect(vallViewState(base,"2026-11-23").hasHistory).toBe(false);
    const two = structuredClone(base);
    two.history.push({...two.history[0],asOf:"2026-12-31"});
    expect(vallViewState(two,"2026-11-23").hasHistory).toBe(true);
  });
});
