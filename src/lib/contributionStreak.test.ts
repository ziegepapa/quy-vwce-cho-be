import { describe, expect, it } from "vitest";
import { computeContributionStreak } from "./contributionStreak";
import type { Transaction } from "./types";

type MinTx = Pick<Transaction, "date" | "type" | "amount" | "deletedAt">;

function mkTx(
  date: string,
  type: Transaction["type"],
  amount: number,
  deletedAt?: string,
): MinTx {
  return { date, type, amount, deletedAt };
}

describe("computeContributionStreak", () => {
  it("returns zero streak for empty ledger", () => {
    const r = computeContributionStreak([]);
    expect(r.streakMonths).toBe(0);
    expect(r.lastContributionDate).toBeNull();
    expect(r.mostRecentMonth).toBeNull();
  });

  it("returns streak of 1 for a single contribution", () => {
    const r = computeContributionStreak([mkTx("2026-06-15", "cash_in", 100)]);
    expect(r.streakMonths).toBe(1);
    expect(r.mostRecentMonth).toBe("2026-06");
    expect(r.lastContributionDate).toBe("2026-06-15");
  });

  it("counts three consecutive months", () => {
    const r = computeContributionStreak([
      mkTx("2026-01-10", "cash_in", 100),
      mkTx("2026-02-10", "cash_in", 100),
      mkTx("2026-03-10", "buy_vwce", 100),
    ]);
    expect(r.streakMonths).toBe(3);
    expect(r.mostRecentMonth).toBe("2026-03");
  });

  it("resets streak on a gap month", () => {
    const r = computeContributionStreak([
      mkTx("2026-01-10", "cash_in", 100),
      // 2026-02 is a blank month — streak resets
      mkTx("2026-03-10", "cash_in", 100),
    ]);
    expect(r.streakMonths).toBe(1); // only March counts
    expect(r.mostRecentMonth).toBe("2026-03");
  });

  it("handles year boundary (Dec → Jan)", () => {
    const r = computeContributionStreak([
      mkTx("2025-11-10", "buy_vwce", 100),
      mkTx("2025-12-10", "buy_vwce", 100),
      mkTx("2026-01-10", "buy_vwce", 100),
    ]);
    expect(r.streakMonths).toBe(3);
    expect(r.mostRecentMonth).toBe("2026-01");
  });

  it("ignores soft-deleted transactions", () => {
    const r = computeContributionStreak([
      mkTx("2026-01-10", "cash_in", 100, "2026-02-01T00:00:00Z"),
      mkTx("2026-02-10", "cash_in", 100),
    ]);
    // Jan deleted → gap → only Feb counts
    expect(r.streakMonths).toBe(1);
    expect(r.mostRecentMonth).toBe("2026-02");
  });

  it("ignores non-contribution types (sell_vwce, fee, tax)", () => {
    const r = computeContributionStreak([
      mkTx("2026-01-10", "sell_vwce", 50),
      mkTx("2026-01-15", "fee", 5),
      mkTx("2026-02-10", "cash_in", 100),
    ]);
    expect(r.streakMonths).toBe(1);
    expect(r.mostRecentMonth).toBe("2026-02");
  });

  it("counts buy_security for securities-first users", () => {
    const r = computeContributionStreak([
      mkTx("2026-04-10", "buy_security", 200),
      mkTx("2026-05-10", "buy_security", 200),
    ]);
    expect(r.streakMonths).toBe(2);
    expect(r.mostRecentMonth).toBe("2026-05");
  });

  it("multiple transactions in same month count as one streak month", () => {
    const r = computeContributionStreak([
      mkTx("2026-01-05", "cash_in", 50),
      mkTx("2026-01-20", "cash_in", 50),
      mkTx("2026-02-10", "cash_in", 100),
    ]);
    expect(r.streakMonths).toBe(2);
  });

  it("returns most recent date as lastContributionDate", () => {
    const r = computeContributionStreak([
      mkTx("2026-02-10", "cash_in", 100),
      mkTx("2026-03-20", "buy_vwce", 200),
    ]);
    expect(r.lastContributionDate).toBe("2026-03-20");
  });

  it("long streak: 16 consecutive months", () => {
    const txs: MinTx[] = [];
    // 2025-01 through 2026-04 = 16 months
    const months = [
      "2025-01", "2025-02", "2025-03", "2025-04",
      "2025-05", "2025-06", "2025-07", "2025-08",
      "2025-09", "2025-10", "2025-11", "2025-12",
      "2026-01", "2026-02", "2026-03", "2026-04",
    ];
    for (const m of months) {
      txs.push(mkTx(`${m}-10`, "buy_vwce", 100));
    }
    const r = computeContributionStreak(txs);
    expect(r.streakMonths).toBe(16);
    expect(r.mostRecentMonth).toBe("2026-04");
  });
});
