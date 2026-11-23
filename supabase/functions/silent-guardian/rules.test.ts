import { detectGuardianSignals, reserveNewGuardianSignals } from "./rules.ts";
import type { SyncedGuardianRow } from "./rules.ts";

const enrolled = "2026-11-20T00:00:00.000Z";
function trade(id: string, type: string, createdAt = "2026-11-21T10:00:00.000Z", rest: Record<string, unknown> = {}): SyncedGuardianRow {
  return { id, created_at: createdAt, data: { id, type, amount: 120, createdAt, ...rest } };
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
    { id: "broken", created_at: "2026-11-21T12:00:00.000Z", data: { type: "sell_security", amount: 30 } },
  ], enrolled), []);
});
Deno.test("no guessed alerts from missing monthly buys, no fake valuation", () => {
  same(detectGuardianSignals([], enrolled), []);
  same(detectGuardianSignals([trade("sell1", "sell_security")], "unknown"), []);
});

Deno.test("the server cloud creation timestamp, not an editable transaction date, determines enrollment boundary", () => {
  same(detectGuardianSignals([
    { ...trade("backdated", "sell_security", "2026-11-21T12:00:00Z"),
      data: { id: "backdated", type: "sell_security", amount: 120,
        createdAt: "2026-11-01T12:00:00Z" } },
    { ...trade("changed-client-date", "sell_security", "2026-11-19T12:00:00Z"),
      data: { id: "changed-client-date", type: "sell_security", amount: 120,
        createdAt: "2026-11-21T12:00:00Z" } },
    { id: "no-server-date", data: { id: "no-server-date", type: "sell_security", amount: 120,
      createdAt: "2026-11-21T12:00:00Z" } } as unknown as SyncedGuardianRow,
  ], enrolled), [{ key: "sale/backdated", kind: "recorded_sale" }]);
});

Deno.test("receipt pagination never starves alerts after the first 50 already-reserved events", async () => {
  const events = Array.from({ length: 110 }, (_, i) => ({
    key: "sale/item-" + String(i).padStart(3,"0"),
    kind: "recorded_sale" as const,
  }));
  const existing = new Set(events.slice(0, 60).map((e) => e.key));
  let calls = 0;
  const first = await reserveNewGuardianSignals(events, async (event) => {
    calls++;
    if (existing.has(event.key)) return false;
    existing.add(event.key);
    return true;
  });
  same(first.length, 50);
  same(first[0].key, "sale/item-060");
  same(first[49].key, "sale/item-109");
  same(calls, 110);
  // Every remaining event is deduplicated on the next run, not emailed twice.
  const repeat = await reserveNewGuardianSignals(events, async (event) => !existing.has(event.key));
  same(repeat, []);
});

Deno.test("invalid reservation limit fails before any external call", async () => {
  let calls = 0;
  let rejected = false;
  try { await reserveNewGuardianSignals([{key:"sale/test",kind:"recorded_sale"}],
    async () => { calls++; return true; }, 51); } catch { rejected = true; }
  same([rejected, calls], [true,0]);
});
