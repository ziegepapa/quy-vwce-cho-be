import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
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

test("all three domains reach an incomplete result at the exact server cap, including tombstones", () => {
  for (const domain of ["transactions", "goals", "app_settings"]) {
    const data = snapshot();
    const makeRow = { transactions: tx, goals: goal, app_settings: settings }[domain];
    data[domain] = Array.from({ length: 999 }, (_, i) => makeRow("r" + i));
    assert.equal(auditGuardianSnapshot(data).status, "pass_basic_checks");
    data[domain].push({ ...makeRow("deleted"), deleted_at: "2026-11-24T00:00:00Z" });
    assert.equal(auditGuardianSnapshot(data).status, "incomplete");
    assert.equal(auditGuardianSnapshot(data).checks[domain].tombstones, 1);
  }
});

test("retired hosted source snapshots and repo email stub return 410 with no outbound calls", async () => {
  const evidence = JSON.parse(readFileSync("docs/evidence/h5-hosted-edge-source-2026-11-24.json", "utf8"));
  const retired = evidence.functions.filter(f => ["silent-guardian-email-test", "silent-guardian-e2e-test"].includes(f.slug));
  assert.equal(retired.length, 2);
  const sources = [...retired.map(f => f.archivedSource), readFileSync("supabase/functions/silent-guardian-email-test/index.ts", "utf8")];
  for (const source of sources) {
    let handler;
    let outbound = 0;
    const executable = source.replace(/^import "jsr:@supabase\/functions-js\/edge-runtime\.d\.ts";\r?\n/, "");
    assert.notEqual(executable, source);
    runInNewContext(executable, {
      Deno: { serve(fn) { assert.equal(typeof fn, "function"); handler = fn; } },
      Response,
      fetch() { outbound++; throw new Error("Outbound calls forbidden"); },
    }, { timeout: 1000 });
    assert.equal(typeof handler, "function");
    for (const method of ["GET", "POST"]) {
      const response = await handler(new Request("https://example.invalid", { method }));
      assert.equal(response.status, 410);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal((await response.json()).status, "retired");
    }
    assert.equal(outbound, 0);
  }
});

test("health-check repo candidate uses shared audit without service role or provider dispatch", () => {
  const source = readFileSync("supabase/functions/silent-guardian-health-check/index.ts", "utf8");
  assert.match(source, /import \{ auditGuardianSnapshot \} from "\.\.\/_shared\/silentGuardianAudit\.mjs"/);
  assert.match(source, /auditGuardianSnapshot\(\{ transactions, goals, app_settings \}\)/);
  assert.match(source, /limit: "1000"/);
  assert.match(source, /notificationsEnabled: false/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|guardian_worker_claim|api\.resend\.com/);
});
