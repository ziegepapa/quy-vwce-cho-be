import { describe, expect, it } from "vitest";
import {
  classifyTrDocument,
  parseTrDepotStatementText,
  parseTrDocumentText,
  reconcileDepotStatement,
} from "./depotStatement";
import type { Transaction } from "../types";

const DEPOT_SAMPLE = [
  "TRADE REPUBLIC BANK GMBH",
  "DEPOTAUSZUG",
  "Stichtag 31.07.2026",
  "DOKUMENTENNUMMER DEPOT-2026-07",
  "DEPOT 123456789",
  "Vanguard FTSE All-World UCITS ETF",
  "ISIN: IE00BK5BQT80",
  "10,500000 Stk.",
  "Kurs 167,54 EUR",
  "Wert 1.759,17 EUR",
  "Amundi MSCI World",
  "ISIN: FR0010315770",
  "2,250000 Stk.",
  "Kurs 500,00 EUR",
  "Wert 1.125,00 EUR",
].join("\n");

describe("Trade Republic document classification", () => {
  it("classifies depot statement before generic DEPOT account text", () => {
    expect(classifyTrDocument(DEPOT_SAMPLE)).toBe("depot_statement");
  });

  it("rejects unrelated documents", () => {
    expect(classifyTrDocument("Bank statement without supported broker markers")).toBe("unsupported");
  });
});

describe("parseTrDepotStatementText", () => {
  it("parses multiple ISIN positions and German numbers", () => {
    const result = parseTrDepotStatementText(DEPOT_SAMPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.statementId).toBe("DEPOT-2026-07");
    expect(result.value.date).toBe("2026-07-31");
    expect(result.value.positions).toHaveLength(2);
    expect(result.value.positions[0].instrumentIsin).toBe("IE00BK5BQT80");
    expect(result.value.positions[0].quantity).toBe(10.5);
    expect(result.value.positions[0].marketValue).toBe(1759.17);
    expect(result.value.positions[1].instrumentIsin).toBe("FR0010315770");
  });

  it("creates a deterministic statement id when document number is absent", () => {
    const text = DEPOT_SAMPLE.replace("DOKUMENTENNUMMER DEPOT-2026-07\n", "");
    const a = parseTrDepotStatementText(text);
    const b = parseTrDepotStatementText(text);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.statementId).toBe(b.value.statementId);
    expect(a.value.statementId).toMatch(/^tr-depot:/);
  });

  it("uses the unified document parser", () => {
    const result = parseTrDocumentText(DEPOT_SAMPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe("depot_statement");
  });
});

describe("reconcileDepotStatement", () => {
  const base = "2026-01-01T00:00:00.000Z";
  const tx = (partial: Partial<Transaction>): Transaction => ({
    id: partial.id ?? "tx",
    date: partial.date ?? "2026-07-01",
    type: partial.type ?? "buy_security",
    amount: partial.amount ?? 1,
    quantity: partial.quantity,
    instrumentIsin: partial.instrumentIsin,
    notes: "",
    createdAt: base,
    updatedAt: base,
  });

  it("matches per ISIN and reports differences without creating transactions", () => {
    const parsed = parseTrDepotStatementText(DEPOT_SAMPLE);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const transactions = [
      tx({ id: "a", type: "buy_vwce", quantity: 10.5, instrumentIsin: "IE00BK5BQT80" }),
      tx({ id: "b", quantity: 2, instrumentIsin: "FR0010315770" }),
      tx({ id: "future", date: "2026-08-01", quantity: 99, instrumentIsin: "FR0010315770" }),
    ];
    const original = structuredClone(transactions);
    const rows = reconcileDepotStatement(parsed.value, transactions);
    expect(rows.find((r) => r.instrumentIsin === "IE00BK5BQT80")?.status).toBe("match");
    expect(rows.find((r) => r.instrumentIsin === "FR0010315770")?.difference).toBe(0.25);
    expect(transactions).toEqual(original);
  });

  it("reports a local holding missing from the statement", () => {
    const parsed = parseTrDepotStatementText(DEPOT_SAMPLE);
    if (!parsed.ok) return;
    const rows = reconcileDepotStatement(parsed.value, [
      tx({ instrumentIsin: "IE00B4L5Y983", quantity: 1 }),
    ]);
    expect(rows.find((r) => r.instrumentIsin === "IE00B4L5Y983")?.status).toBe(
      "missing_statement",
    );
  });
});
