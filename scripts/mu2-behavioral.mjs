import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

// Fail closed before constructing clients or network calls.
const url = process.env.SUPABASE_URL;
const db = process.env.DB_URL;
if (url !== "http://127.0.0.1:54321" || db !== "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
  || process.env.GITHUB_ACTIONS !== "true" || !process.env.RUNNER_TEMP?.startsWith("/home/runner/work/_temp")) {
  throw new Error("MU2 refuses non-disposable local target");
}
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(anon && service, "local keys required");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, service, opts);
const stamp = randomUUID();
const cases = [];
const evidence = { kind: "MU2_BEHAVIORAL_RLS", target: "disposable-supabase-local",
  sourceCommit: process.env.SOURCE_COMMIT, workflowRunId: process.env.GITHUB_RUN_ID,
  postgresMajor: process.env.MU2_PG, result: "FAIL", cases };
const record = (name) => { cases.push({ name, status: "PASS" }); console.log("PASS: " + name); };
const check = (condition, name) => { assert.ok(condition, name); record(name); };

async function request(token, table, { method = "GET", filter = {}, body, merge = false } = {}) {
  const search = new URLSearchParams(filter);
  const response = await fetch(url + "/rest/v1/" + table + "?" + search, {
    method, headers: { apikey: token === service ? service : anon,
      Authorization: "Bearer " + token, "Content-Type": "application/json",
      Prefer: (merge ? "resolution=merge-duplicates," : "") + "return=representation" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}
function rows(r, n, name) { check(r.status >= 200 && r.status < 300 && Array.isArray(r.data) && r.data.length === n, name); }
function denied(r, name) {
  check((r.status === 403 && r.data?.code === "42501") ||
    (r.status >= 200 && r.status < 300 && Array.isArray(r.data) && r.data.length === 0), name);
}
function anonymousDenied(r, name) {
  check(([401,403].includes(r.status) && r.data?.code === "42501") ||
    (r.status >= 200 && r.status < 300 && Array.isArray(r.data) && r.data.length === 0), name);
}
async function identity(label) {
  const email = "mu2-" + label + "-" + stamp + "@example.invalid";
  const password = randomUUID() + "Aa!9";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ok(!created.error && created.data.user, label + " synthetic create");
  const client = createClient(url, anon, opts);
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ok(!login.error && login.data.session && login.data.user?.id === created.data.user.id, label + " sign in");
  record(label + " synthetic Auth sign-in");
  return { id: created.data.user.id, token: login.data.session.access_token, client };
}
function sqlFile(path) {
  try {
    execFileSync("docker", ["exec","-i","supabase_db_vwce-vault-local-h4h5","psql","-U","supabase_admin","-d","postgres","-X","-v","ON_ERROR_STOP=1"],
      { input: readFileSync(path), stdio: ["pipe","ignore","pipe"] });
  } catch (error) {
    // SQL runs only against synthetic local fixtures; omit raw rows/detail and credentials.
    const line = String(error.stderr ?? "").split("\n").find(l => /ERROR:/.test(l));
    console.error("SQL candidate failure in " + path + ": " + (line?.slice(0, 240) ?? "no SQL error line"));
    throw new Error("local SQL execution failed");
  }
}
async function waitForMembershipApi() {
  for (let i = 0; i < 30; i++) {
    const r = await request(service, "vault_memberships", { filter: { limit: "1" } });
    if (r.status === 200 && Array.isArray(r.data)) { record("PostgREST membership schema cache ready"); return; }
    if (r.data?.code !== "PGRST205" && r.data?.code !== "42P01") {
      throw new Error("unexpected membership API readiness response: HTTP " + r.status);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("membership schema cache not ready");
}
async function ownerCrud(owner, phase) {
  for (const table of tables) {
    const id = rowId + "-" + phase.replaceAll(" ", "-");
    rows(await request(owner.token, table, { method: "POST", body: payload(owner, id) }), 1, phase + " owner " + table + " INSERT");
    rows(await request(owner.token, table, { method: "PATCH", filter: scope(owner, id), body: { data: { id, edited: true } } }), 1, phase + " owner " + table + " UPDATE");
    rows(await request(owner.token, table, { method: "DELETE", filter: scope(owner, id) }), 1, phase + " owner " + table + " DELETE");
  }
}
const tables = ["app_settings","goals","transactions","annual_checklists","monthly_snapshots"];
const rowId = "mu2-" + stamp;
const scope = (owner, id = rowId) => ({ user_id: "eq." + owner.id, id: "eq." + id });
const memberScope = (owner, member) => ({ owner_user_id: "eq." + owner.id, member_user_id: "eq." + member.id });
const payload = (owner, id = rowId) => ({ user_id: owner.id, id, data: { id, amount: 123, synthetic: true }, version: 1 });
const snapshot = new Map();
async function unchanged(owner, phase) {
  for (const table of tables) {
    const r = await request(owner.token, table, { filter: scope(owner) });
    rows(r, 1, phase + " " + table + " owner row exists");
    check(JSON.stringify(r.data[0]) === snapshot.get(table), phase + " " + table + " exact owner row unchanged");
  }
}
async function verifyMemberDenied(owner, member, phase) {
  for (const table of tables) {
    const filter = scope(owner);
    const create = payload(owner, rowId + "-forged");
    denied(await request(member.token, table, { method: "POST", body: create }), phase + " " + table + " INSERT denied");
    denied(await request(member.token, table, { method: "PATCH", filter, body: { data: { overwritten: true } } }), phase + " " + table + " UPDATE denied");
    denied(await request(member.token, table, { method: "PATCH", filter, body: { deleted_at: new Date().toISOString() } }), phase + " " + table + " tombstone denied");
    denied(await request(member.token, table, { method: "DELETE", filter }), phase + " " + table + " DELETE denied");
    denied(await request(member.token, table, { method: "POST", filter: { on_conflict: "user_id,id" }, body: { ...payload(owner), data: { restore: true } }, merge: true }), phase + " " + table + " UPSERT/restore denied");
  }
}
let owner, member;
try {
  owner = await identity("owner");
  member = await identity("member");
  for (const table of tables) {
    rows(await request(owner.token, table, { method: "POST", body: payload(owner) }), 1, "owner " + table + " pre-MU2 insert");
    const r = await request(owner.token, table, { filter: scope(owner) });
    rows(r, 1, "owner " + table + " pre-MU2 read");
    snapshot.set(table, JSON.stringify(r.data[0]));
  }
  sqlFile("scripts/mu2-membership-candidate.sql");
  record("guarded MU2 applied after H5 003 and existing owner rows");
  sqlFile("scripts/mu2-catalog-check.sql");
  record("MU2 catalog, RLS and least-privilege grants verified");
  await waitForMembershipApi();
  await unchanged(owner, "upgrade");
  for (const table of tables) {
    rows(await request(member.token, table, { filter: scope(owner) }), 0, "unrelated " + table + " denied");
    anonymousDenied(await request(anon, table, { filter: scope(owner) }), "anonymous " + table + " read denied");
    anonymousDenied(await request(anon, table, { method: "POST", body: payload(owner, rowId + "-anon") }), "anonymous " + table + " write denied");
  }
  const ms = memberScope(owner, member);
  const invited = { owner_user_id: owner.id, member_user_id: member.id, role: "member", status: "invited" };
  denied(await request(member.token, "vault_memberships", { method: "POST", body: invited }), "member cannot self-invite");
  denied(await request(owner.token, "vault_memberships", { method: "POST", body: invited }), "owner cannot bypass trusted invitation path");
  rows(await request(service, "vault_memberships", { method: "POST", body: invited }), 1, "trusted synthetic invitation fixture");
  rows(await request(member.token, "transactions", { filter: scope(owner) }), 0, "invited status cannot read");
  denied(await request(member.token, "vault_memberships", { method: "PATCH", filter: ms, body: { status: "active", role: "admin" } }), "invited member cannot activate/promote");
  denied(await request(owner.token, "vault_memberships", { method: "PATCH", filter: ms, body: { status: "active" } }), "owner cannot bypass trusted activation");
  rows(await request(service, "vault_memberships", { method: "PATCH", filter: ms, body: { status: "active", activated_at: new Date().toISOString() } }), 1, "trusted synthetic activation");
  for (const table of tables) {
    const r = await request(member.token, table, { filter: scope(owner) });
    rows(r, 1, "active member " + table + " shared SELECT");
    check(JSON.stringify(r.data[0]) === snapshot.get(table), "active member " + table + " same owner data");
  }
  rows(await request(member.token, "profiles", { filter: { id: "eq." + owner.id } }), 0, "owner private profile not shared");
  rows(await request(member.token, "vault_memberships", { filter: ms }), 1, "member own membership status visible");
  denied(await request(member.token, "vault_memberships", { method: "PATCH", filter: ms, body: { role: "admin" } }), "active member cannot self-promote");
  denied(await request(member.token, "vault_memberships", { method: "PATCH", filter: ms, body: { status: "revoked" } }), "member cannot manage membership");
  denied(await request(member.token, "vault_memberships", { method: "DELETE", filter: ms }), "member cannot delete membership");
  await verifyMemberDenied(owner, member, "active");
  await unchanged(owner, "after member attacks");
  await ownerCrud(owner, "active member");
  rows(await request(member.token, "transactions", { method: "POST", body: payload(member) }), 1, "member retains own independent vault");
  rows(await request(owner.token, "transactions", { filter: scope(member) }), 0, "sharing not reciprocal");

  rows(await request(owner.token, "vault_memberships", { method: "PATCH", filter: ms, body: { role: "admin" } }), 1, "owner role change authorized");
  const adminRow = rowId + "-admin";
  rows(await request(member.token, "transactions", { method: "POST", body: payload(owner, adminRow) }), 1, "active admin permitted insert");
  rows(await request(member.token, "transactions", { method: "PATCH", filter: scope(owner, adminRow), body: { data: { id: adminRow, edited: true } } }), 1, "active admin permitted update");
  denied(await request(member.token, "transactions", { method: "PATCH", filter: scope(owner, adminRow), body: { user_id: member.id } }), "admin cannot reassign vault owner");
  rows(await request(member.token, "transactions", { method: "DELETE", filter: scope(owner, adminRow) }), 1, "active admin permitted delete");
  denied(await request(member.token, "vault_memberships", { method: "POST", body: { owner_user_id: owner.id, member_user_id: owner.id, role: "member", status: "active" } }), "admin cannot create owner-root membership");
  rows(await request(owner.token, "vault_memberships", { method: "PATCH", filter: ms, body: { role: "member" } }), 1, "owner demotes admin to member");
  await verifyMemberDenied(owner, member, "demoted same JWT");

  rows(await request(owner.token, "vault_memberships", { method: "PATCH", filter: ms, body: { status: "revoked" } }), 1, "owner revokes membership");
  const stillValid = await member.client.auth.getUser(member.token);
  check(!stillValid.error && stillValid.data.user?.id === member.id, "old member JWT still valid in Auth after revoke");
  for (const table of tables) rows(await request(member.token, table, { filter: scope(owner) }), 0, "revoked same JWT " + table + " SELECT denied");
  await verifyMemberDenied(owner, member, "revoked same JWT");
  denied(await request(member.token, "vault_memberships", { method: "PATCH", filter: ms, body: { status: "active" } }), "revoked member cannot reactivate");
  await unchanged(owner, "after revoke");
  await ownerCrud(owner, "revoked member");
  // Trusted reactivation is fixture-only; prove rollback removes active access.
  rows(await request(service, "vault_memberships", { method: "PATCH", filter: ms, body: { status: "active", activated_at: new Date().toISOString(), revoked_at: null } }), 1, "trusted synthetic reactivation");
  rows(await request(member.token, "transactions", { filter: scope(owner) }), 1, "member access before rollback");
  sqlFile("scripts/mu2-rollback-candidate.sql");
  record("atomic rollback applied");
  for (const table of tables) rows(await request(member.token, table, { filter: scope(owner) }), 0, "rollback same JWT " + table + " SELECT denied");
  await verifyMemberDenied(owner, member, "rollback");
  await unchanged(owner, "rollback");
  for (const table of tables) {
    const id = rowId + "-owner-crud";
    rows(await request(owner.token, table, { method: "POST", body: payload(owner, id) }), 1, "rollback owner " + table + " INSERT");
    rows(await request(owner.token, table, { method: "PATCH", filter: scope(owner, id), body: { data: { id, edited: true } } }), 1, "rollback owner " + table + " UPDATE");
    rows(await request(owner.token, table, { method: "DELETE", filter: scope(owner, id) }), 1, "rollback owner " + table + " DELETE");
  }
  evidence.result = "PASS";
} catch (error) {
  // Only assertion labels; do not print credentials, raw responses or SQL error content.
  const name = error?.code === "ERR_ASSERTION" ? error.message : (error?.message?.startsWith("membership schema cache") || error?.message?.startsWith("unexpected membership API") ? error.message : "local runner/SQL failure (inspect workflow step)");
  cases.push({ name, status: "FAIL" });
  console.error("FAIL: " + name);
  process.exitCode = 1;
} finally {
  evidence.total = cases.length;
  writeFileSync("mu2-evidence.json", JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
}
