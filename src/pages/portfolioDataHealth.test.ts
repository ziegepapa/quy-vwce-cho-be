import { describe, expect, it } from "vitest";
import type { TransactionQualityIssue } from "./transactionQualityInbox";
import { buildPortfolioDataHealth } from "./portfolioDataHealth";

const transactionIssues: TransactionQualityIssue[] = [
  {
    transactionId: "oversell",
    code: "OVERSOLD",
    severity: "action",
    source: "canonical_replay",
    recordSource: "legacy_or_unknown",
    semanticStatus: "invalid",
    date: "2026-08-20",
  },
  {
    transactionId: "missing-price",
    code: "missing_unit_price",
    severity: "review",
    source: "completeness",
    recordSource: "manual",
    date: "2026-08-19",
  },
  {
    transactionId: "missing-note",
    code: "missing_note",
    severity: "tip",
    source: "completeness",
    recordSource: "manual",
    date: "2026-08-18",
  },
];

describe("buildPortfolioDataHealth", () => {
  it("groups factual signals deterministically with source, severity and existing owner-controlled routes", () => {
    const health = buildPortfolioDataHealth({
      transactionIssues,
      missingQuoteIsins: ["IE00BK5BQT80", "IE00BK5BQT80", "US0000000001"],
      staleQuoteIsins: ["IE00BK5BQT80"],
      lastBackupAt: "",
    });

    expect(health.issues).toEqual([
      { code: "transaction_quality", source: "transaction_ledger", severity: "action", count: 1, href: "#/transactions" },
      { code: "backup_not_recorded", source: "backup_metadata", severity: "review", count: 1, href: "#/settings" },
      { code: "missing_quotes", source: "quote_snapshot", severity: "review", count: 2, href: "#/settings" },
      { code: "stale_quotes", source: "quote_snapshot", severity: "tip", count: 1, href: "#/settings" },
    ]);
    expect(health).toMatchObject({ actionCount: 1, reviewCount: 3, tipCount: 1 });
  });

  it("does not invent a backup warning when metadata is unavailable and reports only the highest transaction severity", () => {
    const health = buildPortfolioDataHealth({
      transactionIssues: transactionIssues.slice(1),
      missingQuoteIsins: [],
      staleQuoteIsins: [],
      lastBackupAt: null,
    });

    expect(health.issues).toEqual([
      { code: "transaction_quality", source: "transaction_ledger", severity: "review", count: 1, href: "#/transactions" },
    ]);
    expect(health).toMatchObject({ actionCount: 0, reviewCount: 1, tipCount: 0 });
  });
});
