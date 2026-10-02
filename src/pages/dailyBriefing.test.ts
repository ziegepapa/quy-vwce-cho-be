import { describe, expect, it } from "vitest";
import { buildDailyBriefing } from "./dailyBriefing";

const HISTORY = [
  { date: "2026-09-28", price: 168.0 },
  { date: "2026-09-29", price: 169.4 },
  { date: "2026-09-30", price: 169.78 },
];

describe("buildDailyBriefing", () => {
  it("computes price change vs previous close", () => {
    const briefing = buildDailyBriefing({
      priceHistory: HISTORY,
      vwceQty: 10,
      assets: 2000,
      streakMonths: 5,
      contributionDay: 15,
      now: new Date("2026-10-01T08:00:00"),
    });
    expect(briefing.priceToday).toEqual({ date: "2026-09-30", price: 169.78 });
    expect(briefing.priceChange?.direction).toBe("up");
    expect(briefing.priceChange?.pct).toBeCloseTo(((169.78 - 169.4) / 169.4) * 100, 6);
    // display-only estimate: 10 shares × €0.38
    expect(briefing.valueDeltaEstimate).toBeCloseTo(10 * (169.78 - 169.4), 6);
  });

  it("detects down and flat moves", () => {
    const down = buildDailyBriefing({
      priceHistory: [
        { date: "2026-09-29", price: 170 },
        { date: "2026-09-30", price: 169 },
      ],
      vwceQty: 0,
      assets: 100,
      streakMonths: 0,
      contributionDay: null,
    });
    expect(down.priceChange?.direction).toBe("down");
    expect(down.valueDeltaEstimate).toBeNull();

    const flat = buildDailyBriefing({
      priceHistory: [
        { date: "2026-09-29", price: 169 },
        { date: "2026-09-30", price: 169 },
      ],
      vwceQty: 5,
      assets: 100,
      streakMonths: 0,
      contributionDay: null,
    });
    expect(flat.priceChange?.direction).toBe("flat");
    expect(flat.priceChange?.pct).toBe(0);
    expect(flat.valueDeltaEstimate).toBe(0);
  });

  it("handles missing or single-point history", () => {
    const empty = buildDailyBriefing({
      priceHistory: [],
      vwceQty: 10,
      assets: 100,
      streakMonths: 0,
      contributionDay: null,
    });
    expect(empty.priceToday).toBeNull();
    expect(empty.priceChange).toBeNull();
    expect(empty.valueDeltaEstimate).toBeNull();

    const single = buildDailyBriefing({
      priceHistory: [{ date: "2026-09-30", price: 169.78 }],
      vwceQty: 10,
      assets: 100,
      streakMonths: 0,
      contributionDay: null,
    });
    expect(single.priceToday).toEqual({ date: "2026-09-30", price: 169.78 });
    expect(single.priceChange).toBeNull();
  });

  it("ignores invalid points and sorts unsorted input", () => {
    const briefing = buildDailyBriefing({
      priceHistory: [
        { date: "2026-09-30", price: 169.78 },
        { date: "not-a-date", price: 1 },
        { date: "2026-09-29", price: -5 },
        { date: "2026-09-28", price: 168.0 },
        { date: "2026-09-27", price: NaN },
      ],
      vwceQty: 0,
      assets: 100,
      streakMonths: 0,
      contributionDay: null,
    });
    expect(briefing.priceToday).toEqual({ date: "2026-09-30", price: 169.78 });
    expect(briefing.priceChange?.direction).toBe("up");
  });

  it("finds the next milestone above current assets", () => {
    const briefing = buildDailyBriefing({
      priceHistory: HISTORY,
      vwceQty: 0,
      assets: 9200,
      streakMonths: 0,
      contributionDay: null,
    });
    expect(briefing.nextMilestone?.target).toBe(10000);
    expect(briefing.nextMilestone?.remaining).toBeCloseTo(800, 6);
    expect(briefing.nextMilestone?.progressPct).toBeCloseTo(92, 6);

    const topped = buildDailyBriefing({
      priceHistory: HISTORY,
      vwceQty: 0,
      assets: 2_000_000,
      streakMonths: 0,
      contributionDay: null,
    });
    expect(topped.nextMilestone).toBeNull();
  });

  it("counts days to the next contribution date", () => {
    const upcoming = buildDailyBriefing({
      priceHistory: HISTORY,
      vwceQty: 0,
      assets: 100,
      streakMonths: 3,
      contributionDay: 15,
      now: new Date("2026-10-01T08:00:00"),
    });
    expect(upcoming.daysToNextContribution).toBe(15);
    expect(upcoming.streakMonths).toBe(3);

    // after the 15th, rolls to next month
    const rolled = buildDailyBriefing({
      priceHistory: HISTORY,
      vwceQty: 0,
      assets: 100,
      streakMonths: 3,
      contributionDay: 15,
      now: new Date("2026-10-20T08:00:00"),
    });
    expect(rolled.daysToNextContribution).toBe(27);

    const invalid = buildDailyBriefing({
      priceHistory: HISTORY,
      vwceQty: 0,
      assets: 100,
      streakMonths: 0,
      contributionDay: 31,
    });
    expect(invalid.daysToNextContribution).toBeNull();
  });
});
