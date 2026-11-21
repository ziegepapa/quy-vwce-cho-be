import test from "node:test";
import assert from "node:assert/strict";
import { auditGuardianSnapshot } from "../supabase/functions/_shared/silentGuardianAudit.mjs";

function snapshot(transactions = [], goals = [], app_settings = []) {
  return { transactions, goals, app_settings };
}
const tx = (id, data = {}) => ({
  id,
  deleted_at: null,
  data: { id, amount: 120, type: "buy_vwce", date: "2026-11-02", ...data },
});
const goal = (id) => ({ id, deleted_at: null, data: { id, amount: 10000 } });
const settings = (id) => ({ id, deleted_at: null, data: { id } });

test("healthy live records pass without financial projections", () => {
  const result = auditGuardianSnapshot(snapshot([tx("t1")], [goal("g1")], [settings("s1")]));
  assert.equal(result.status, "pass_basic_checks");
  assert.equal(result.checks.transactions.active, 1);
  assert.equal(result.checks.transactions.issues.invalidAmount, 0);
  assert.equal(result.checks.goals.active, 1);
  assert.match(result.limitations.join(" "), /Dexie/);
});

test("tombstones do not count as active or trigger alerts", () => {
  const deleted = { ...tx("old", { amount: "not-a-number" }), deleted_at: "2026-11-19T17:00:00Z" };
  const result = auditGuardianSnapshot(snapshot([tx("live"), deleted]));
  assert.equal(result.status, "pass_basic_checks");
  assert.equal(result.checks.transactions.active, 1);
  assert.equal(result.checks.transactions.tombstones, 1);
  assert.equal(result.checks.transactions.issues.invalidAmount, 0);
});

test("detects malformed active server rows without exposing IDs", () => {
  const result = auditGuardianSnapshot(snapshot([
    tx("t1", { amount: "120", type: "unknown", date: "2026-02-30" }),
    { id: "wrong", data: { id: "mismatch", amount: 20, type: "cash_in", date: "2026-11-01" }, deleted_at: null },
  ]));
  assert.equal(result.status, "review");
  assert.deepEqual(result.checks.transactions.issues, {
    mismatchedIds: 1, invalidAmount: 1, invalidType: 1, invalidDate: 1,
  });
  assert.ok(!JSON.stringify(result).includes('"mismatch"'));
});

test("February leap day is valid; impossible and unpadded dates are rejected", () => {
  assert.equal(auditGuardianSnapshot(snapshot([tx("t", { date: "2024-02-29" })])).status, "pass_basic_checks");
  assert.equal(auditGuardianSnapshot(snapshot([tx("t", { date: "2025-02-29" })])).status, "review");
  assert.equal(auditGuardianSnapshot(snapshot([tx("t", { date: "2026-1-02" })])).status, "review");
});

test("missing data never silently becomes healthy", () => {
  assert.throws(() => auditGuardianSnapshot({ transactions: [], goals: [] }), /Missing domain/);
  assert.equal(auditGuardianSnapshot(snapshot([tx("t")]), { pageLimit: 1 }).status, "incomplete");
});

test("empty snapshot is structurally valid, not proof of complete sync", () => {
  const result = auditGuardianSnapshot(snapshot());
  assert.equal(result.status, "pass_basic_checks");
  assert.match(result.limitations.join(" "), /sync completeness/);
});

test("securities-first buy is not falsely treated as missing cash-in", () => {
  const result = auditGuardianSnapshot(snapshot([tx("buy", { amount: 120, type: "buy_security" })]));
  assert.equal(result.status, "pass_basic_checks");
});
