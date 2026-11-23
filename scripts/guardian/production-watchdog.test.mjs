import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { evaluateGuardianHealth, checkHeartbeat, notifyNtfy, run } from "./production-watchdog.mjs";

const now = new Date("2026-11-21T20:00:00Z");
const good = {active:true,lastOutcome:"success",lastSucceededAt:"2026-11-21T08:00:00Z",failureStreak:0};

test("fresh active heartbeat is healthy", () => {
  assert.deepEqual(evaluateGuardianHealth(good,now),{ok:true,code:"healthy",hours:12});
});

test("36h silence, never-run and unexpectedly disabled all fail", () => {
  assert.equal(evaluateGuardianHealth({...good,lastSucceededAt:"2026-11-19T00:00:00Z"},now).code,"stale_heartbeat");
  assert.equal(evaluateGuardianHealth({...good,lastSucceededAt:null},now).code,"never_success");
  assert.equal(evaluateGuardianHealth({...good,active:false},now).code,"unexpected_disabled");
});

test("two consecutive degraded/failed scans warn even before 36h", () => {
  assert.equal(evaluateGuardianHealth({...good,lastOutcome:"degraded",failureStreak:2},now).code,"consecutive_failures");
  assert.equal(evaluateGuardianHealth({...good,lastOutcome:"failed",failureStreak:1},now).ok,true);
});

test("watchdog read retries transient errors no more than 3 times", async () => {
  let calls=0;
  const sleeps=[];
  const report=await checkHeartbeat(
    "https://example.supabase.co/functions/v1/silent-guardian",
    "x".repeat(40),
    async()=>{calls++;return {ok:calls===4,status:calls===4?200:503,json:async()=>good};},
    async(ms)=>sleeps.push(ms),
  );
  assert.equal(calls,4);
  assert.deepEqual(sleeps,[800,2000,5000]);
  assert.equal(report.active,true);
});

test("unauthorized watchdog 403 never retries", async()=>{
  let tries=0;
  await assert.rejects(checkHeartbeat(
    "https://example.supabase.co/functions/v1/silent-guardian",
    "x".repeat(40),
    async()=>{tries++;return {ok:false,status:403};},
    async()=>{},
  ),/watchdog_http_nontransient_403/);
  assert.equal(tries,1);
});

test("ntfy notification is ONE authenticated POST with no dynamic recipient", async()=>{
  let calls=0;
  await notifyNtfy("https://ntfy.sh/private-test-topic","t".repeat(40),
    "Guardian silent",async(url,request)=>{
      calls++;
      assert.equal(url,"https://ntfy.sh/private-test-topic");
      assert.equal(request.method,"POST");
      assert.equal(request.headers.Authorization,"Bearer "+"t".repeat(40));
      assert.equal(request.body,"Guardian silent");
      return {ok:true};
    });
  assert.equal(calls,1);
});

test("malformed ntfy token rejects before HTTP call",async()=>{
  await assert.rejects(notifyNtfy("http://ntfy.sh/my-topic","short","hello",async()=>{throw Error("should not call");}),/watchdog_ntfy_url_invalid/);
});

test("watchdog is NOT armed without explicit operator flag",async()=>{
  await run({GUARDIAN_WATCHDOG_ENABLED:"false"});
});

test("new Supabase Data API defaults require explicit least-privilege Guardian grants",()=>{
  const sql=readFileSync(new URL("../../supabase/migrations/003_guardian.sql",import.meta.url),"utf8");
  for(const required of [
    "grant select on public.guardian_subscriptions to service_role;",
    "grant select, insert, update on public.guardian_alert_deliveries to service_role;",
    "grant select on public.guardian_service_status to service_role;",
    "grant select, update on public.guardian_run_health to service_role;",
    "grant select on public.transactions to service_role;",
  ]) assert.ok(sql.includes(required),`Missing permission contract: ${required}`);
  assert.doesNotMatch(sql,/grant\\s+(?:all|select|insert|update|delete)[^;]*\\bon\\s+public\\.guardian_alert_deliveries\\s+to\\s+(?:anon|authenticated)\\s*;/i);
  assert.doesNotMatch(sql,/grant\\s+(?:all|select|insert|update|delete)[^;]*\\bon\\s+public\\.guardian_run_health\\s+to\\s+(?:anon|authenticated)\\s*;/i);
  assert.match(sql,/create table if not exists public\\.guardian_service_status/);
  assert.match(sql,/active boolean not null default false/);
});
