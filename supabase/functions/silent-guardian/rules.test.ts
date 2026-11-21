import { detectGuardianSignals } from "./rules.ts";
import type { SyncedGuardianRow } from "./rules.ts";

const enrolled = "2026-11-20T00:00:00.000Z";
function trade(id: string, type: string, createdAt = "2026-11-21T10:00:00.000Z", rest: Record<string, unknown> = {}): SyncedGuardianRow {
  return { id, data: { id, type, amount: 120, createdAt, ...rest } };
}
function same(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
Deno.test("normal monthly purchases stay silent; no daily price-loss alert", () => {
  same(detectGuardianSignals([
    trade("vwce_a", "buy_vwce"),
    trade("vall_a", "buy_security", enrolled, { instrumentIsin: "IE000VAHT5T0" }),
    trade("cash_in", "cash_in"),
  ], enrolled), []);
});
Deno.test("a newly recorded sale is a review signal, never a broker confirmation", () => {
  same(detectGuardianSignals([
    trade("sale1", "sell_security", "2026-11-21T10:00:00.000Z", { instrumentIsin: "IE000VAHT5T0" }),
    trade("old-sale", "sell_vwce", "2026-11-19T10:00:00.000Z"),
  ], enrolled), [{ key: "sale/sale1", kind: "recorded_sale" }]);
});
Deno.test("two matching broker import references get only one new duplicate alert", () => {
  same(detectGuardianSignals([
    trade("old", "buy_vwce", "2026-11-19T08:00:00.000Z", { source: "trade_republic_pdf", externalRef: "ref001" }),
    trade("new", "buy_vwce", "2026-11-21T08:00:00.000Z", { source: "trade_republic_pdf", externalRef: "ref001" }),
  ], enrolled), [{ key: "duplicate/new", kind: "possible_duplicate_import" }]);
});
Deno.test("deleted, incomplete, invalid and pre-enrollment rows are ignored", () => {
  same(detectGuardianSignals([
    { ...trade("removed", "sell_security"), deleted_at: "2026-11-21T12:00:00Z" },
    trade("bad-amount", "sell_security", "2026-11-21T12:00:00Z", { amount: -120 }),
    trade("old", "sell_security", "2026-11-20T00:00:00Z"),
    { id: "broken", data: { type: "sell_security", amount: 30 } },
  ], enrolled), []);
});
Deno.test("no guessed alerts from missing monthly buys, no fake valuation", () => {
  same(detectGuardianSignals([], enrolled), []);
  same(detectGuardianSignals([trade("sell1", "sell_security")], "unknown"), []);
});
