import { describe, expect, it } from "vitest";
import { buildJourneyTimeline } from "./journeyTimeline";
import type { Transaction } from "./types";
import type { ValueHistoryPoint } from "./valueHistory";

function tx(date: string, amount: number): Transaction {
  return {
    id: `t-${date}`, date, type: "cash_in", amount, notes: "",
    createdAt: date, updatedAt: date,
  };
}

function point(month: string, label: string, value: number): ValueHistoryPoint {
  return { month, label, value };
}

const NOW = new Date("2026-10-03T12:00:00");

describe("buildJourneyTimeline", () => {
  it("returns null with no contributions", () => {
    expect(buildJourneyTimeline({ transactions: [], valueHistory: null, locale: "vi", now: NOW })).toBeNull();
  });

  it("builds start + milestones + now from real data", () => {
    const txs = [tx("2026-08-05", 600), tx("2026-09-10", 600)];
    const history = [
      point("2026-08", "T8", 600),
      point("2026-09", "T9", 1250),
      point("2026-10", "T10", 1300),
    ];
    const events = buildJourneyTimeline({ transactions: txs, valueHistory: history, locale: "vi", now: NOW });
    expect(events).not.toBeNull();
    expect(events!.map((e) => e.kind)).toEqual(["start", "milestone", "now"]);
    expect(events![0].title).toBe("Góp đầu tiên");
    expect(events![1].title).toBe("Quỹ chạm 1.000 €");
    expect(events![1].dateLabel).toBe("T9");
    expect(events![2].kind).toBe("now");
  });

  it("stops milestones at the first uncrossed threshold", () => {
    const txs = [tx("2026-08-05", 600)];
    const history = [point("2026-08", "T8", 600), point("2026-09", "T9", 650)];
    const events = buildJourneyTimeline({ transactions: txs, valueHistory: history, locale: "de", now: NOW });
    // 1000 not crossed → no milestone events
    expect(events!.map((e) => e.kind)).toEqual(["start", "now"]);
    expect(events![0].title).toBe("Erste Einzahlung");
  });

  it("works without value history (start + now only)", () => {
    const txs = [tx("2026-08-05", 600)];
    const events = buildJourneyTimeline({ transactions: txs, valueHistory: null, locale: "vi", now: NOW });
    expect(events!.map((e) => e.kind)).toEqual(["start", "now"]);
  });
});
