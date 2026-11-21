import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/ops/silent-guardian-install.sql", "utf8");
const worker = readFileSync("supabase/functions/silent-guardian-worker/index.ts", "utf8");

test("cron authenticates using a 256-bit one-use ticket, not a public JWT", () => {
  assert.match(sql, /gen_random_bytes\(32\)/);
  assert.match(sql, /digest\(v_secret,'sha256'\)/);
  assert.match(sql, /claimed_at is null and expires_at > now\(\)/);
  assert.match(sql, /unique\(kind,day_utc\)/);
  assert.match(worker, /Ticket invalid or expired/);
  assert.doesNotMatch(sql, /service_role_key\s*=|RESEND_API_KEY\s*=/);
});

test("RPC functions are not callable by anonymous or authenticated browser clients", () => {
  assert.match(sql, /revoke all on function public\.guardian_worker_claim\(text\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.guardian_worker_claim\(text\) to service_role/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /revoke all on schema guardian_internal from public, anon, authenticated/);
});

test("daily scanner is scoped and does not mutate live ledger", () => {
  for (const table of ["transactions", "goals", "app_settings"]) {
    assert.match(sql, new RegExp("from public\\." + table + " where user_id=v_conf.owner_user_id"));
  }
  assert.doesNotMatch(sql, /\b(update|delete|insert into)\s+public\.(transactions|goals|app_settings)\b/i);
  assert.match(sql, /v_streak < 2/);
  assert.match(sql, /v_status <> 'review'/);
  assert.match(sql, /interval '7 days'/);
  assert.match(sql, /interval '24 hours'/);
  assert.match(sql, /status in \('reserved','sent'\)/);
});

test("worker cannot email arbitrary addresses and uses provider idempotency", () => {
  assert.match(worker, /Deno\.env\.get\("RESEND_TEST_TO"\)/);
  assert.match(worker, /Deno\.env\.get\("RESEND_API_KEY"\)/);
  assert.doesNotMatch(worker, /JSON\.parse\(body\)\?\.(to|email|recipient)/);
  assert.match(worker, /Idempotency-Key/);
  assert.match(worker, /guardian_worker_finish/);
  assert.match(worker, /guardian_worker_claim/);
});

test("no cron schedule is created by install; enabling is an explicit operation", () => {
  assert.doesNotMatch(sql, /cron\.schedule\s*\(/);
  assert.match(sql, /monitoring_enabled boolean not null default false/);
  assert.match(sql, /notifications_enabled boolean not null default false/);
});
