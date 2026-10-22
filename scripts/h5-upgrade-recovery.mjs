#!/usr/bin/env node
/**
 * H5 isolated upgrade/recovery rehearsal.
 * Uses synthetic data and refuses every non-local Supabase/PostgreSQL target.
 *
 * Usage:
 *   node scripts/h5-upgrade-recovery.mjs seed
 *   node scripts/h5-upgrade-recovery.mjs verify-upgrade
 *   node scripts/h5-upgrade-recovery.mjs verify-restore
 */
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2];
const FIXTURE_PATH = process.env.H5_FIXTURE_PATH;
const EVIDENCE_PATH = process.env.H5_EVIDENCE_PATH || "h5-migration-evidence.json";
const STAGES = {
  seed: "pre002Upgrade",
  "verify-upgrade": "pre002Upgrade",
  "verify-restore": "backupRestoreRecovery",
};

function assertTargets() {
  let api;
  let db;
  try {
    api = new URL(process.env.SUPABASE_URL || "");
    db = new URL(process.env.DB_URL || "");
  } catch {
    throw new Error("H5 fail-closed: missing or invalid local target URL");
  }
  const validApi =
    (api.hostname === "127.0.0.1" || api.hostname === "localhost" || api.hostname === "::1") &&
    api.protocol === "http:" &&
    api.port === "54321";
  const validDb =
    (db.hostname === "127.0.0.1" || db.hostname === "localhost" || db.hostname === "::1") &&
    db.protocol === "postgresql:" &&
    db.port === "54322" &&
    db.username === "postgres" &&
    db.password === "postgres" &&
    db.pathname === "/postgres";
  if (!validApi || !validDb) {
    throw new Error("H5 fail-closed: refusing non-local Supabase or PostgreSQL target");
  }
  if (!FIXTURE_PATH) {
    throw new Error("H5 requires H5_FIXTURE_PATH in runner temporary storage");
  }
  const fixturePath = path.resolve(FIXTURE_PATH);
  const runnerTemp = path.resolve(process.env.RUNNER_TEMP || path.dirname(fixturePath));
  if (!fixturePath.startsWith(runnerTemp + path.sep)) {
    throw new Error("H5 fixture path must be inside runner temporary storage");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("H5 local service key is required for synthetic fixture operations");
  }
  return { apiUrl: api.toString(), dbUrl: db.toString(), fixturePath };
}

function makeAdmin(apiUrl) {
  return createClient(apiUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readFixture(fixturePath) {
  try {
    return JSON.parse(await readFile(fixturePath, "utf8"));
  } catch {
    throw new Error("H5 synthetic fixture manifest is missing or invalid");
  }
}

async function updateEvidence(key, value) {
  const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
  evidence[key] = value;
  await writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
}

function runPsql(dbUrl, sql) {
  return execFileSync("psql", [
    dbUrl,
    "-X",
    "-A",
    "-t",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql,
  ], { encoding: "utf8" }).trim();
}

function passIfEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(message);
}

async function seed({ apiUrl, fixturePath }) {
  const admin = makeAdmin(apiUrl);
  const stamp = Date.now().toString() + "-" + randomBytes(4).toString("hex");
  const email = "h5-upgrade-" + stamp + "@example.invalid";
  const password = randomBytes(24).toString("base64url") + "aA1!";
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "synthetic h5 migration fixture" },
  });
  if (created.error || !created.data.user) {
    throw new Error("H5 could not create the synthetic Auth fixture");
  }

  const fixture = {
    schemaVersion: 1,
    kind: "H5_SYNTHETIC_PRE_002_FIXTURE",
    userId: created.data.user.id,
    goalId: "h5-goal-" + stamp,
    marker: "synthetic-h5-" + stamp,
    data: { title: "synthetic migration upgrade fixture", marker: "synthetic-h5-" + stamp },
    version: 7,
    updatedAt: "2001-01-01T00:00:00.000Z",
    createdAt: new Date().toISOString(),
  };

  const inserted = await admin.from("goals").insert({
    id: fixture.goalId,
    user_id: fixture.userId,
    data: fixture.data,
    version: fixture.version,
    updated_at: fixture.updatedAt,
  });
  if (inserted.error) {
    await admin.auth.admin.deleteUser(fixture.userId);
    throw new Error("H5 could not seed the synthetic pre-002 row");
  }

  await writeFile(fixturePath, JSON.stringify(fixture, null, 2) + "\n", { mode: 0o600 });
  await updateEvidence("pre002Upgrade", {
    result: "IN_PROGRESS",
    target: "disposable-supabase-local",
    sourceCommit: process.env.SOURCE_COMMIT || process.env.GITHUB_SHA || null,
    workflowRunId: process.env.GITHUB_RUN_ID || null,
    fixture: "one synthetic Auth user and one goals row",
    startedAt: new Date().toISOString(),
  });
  await updateEvidence("backupRestoreRecovery", {
    result: "NOT RUN",
    target: "disposable-supabase-local",
    note: "Synthetic pre-002 fixture backup/restore rehearsal has not run yet.",
  });
  console.log("PASS: seeded one synthetic pre-002 Auth user and goals row");
}

async function verifyUpgrade({ apiUrl, dbUrl, fixturePath }) {
  const admin = makeAdmin(apiUrl);
  const fixture = await readFixture(fixturePath);
  const selected = await admin.from("goals")
    .select("id,user_id,data,version,updated_at,created_at,deleted_at")
    .eq("id", fixture.goalId)
    .eq("user_id", fixture.userId)
    .maybeSingle();
  if (selected.error || !selected.data) {
    throw new Error("H5 upgrade lost the synthetic goals row or required post-002 columns are missing");
  }

  const row = selected.data;
  passIfEqual(row.data?.marker, fixture.marker, "H5 upgrade changed the synthetic JSON payload");
  passIfEqual(row.version, fixture.version, "H5 upgrade changed the pre-existing row version");
  passIfEqual(new Date(row.updated_at).toISOString(), fixture.updatedAt, "H5 upgrade changed the pre-existing updated_at value");
  if (!row.created_at || row.deleted_at !== null) {
    throw new Error("H5 upgrade did not populate created_at and nullable deleted_at as expected");
  }

  const indexCount = runPsql(dbUrl,
    "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('idx_settings_user_updated','idx_goals_user_updated','idx_tx_user_updated','idx_checklist_user_updated','idx_snap_user_updated');"
  );
  passIfEqual(indexCount, "5", "H5 upgrade did not install all five expected update indexes");

  const triggerCount = runPsql(dbUrl,
    "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'O' AND tgname IN ('trg_settings_bump','trg_goals_bump','trg_tx_bump','trg_checklist_bump','trg_snap_bump');"
  );
  passIfEqual(triggerCount, "5", "H5 upgrade did not install all five expected version triggers");

  const changed = await admin.from("goals")
    .update({ data: { ...fixture.data, postUpgradeTriggerProbe: true } })
    .eq("id", fixture.goalId)
    .eq("user_id", fixture.userId);
  if (changed.error) throw new Error("H5 upgrade trigger probe update failed");
  const after = await admin.from("goals")
    .select("data,version,updated_at")
    .eq("id", fixture.goalId)
    .eq("user_id", fixture.userId)
    .maybeSingle();
  if (after.error || !after.data) throw new Error("H5 upgrade trigger probe could not re-read the row");
  passIfEqual(after.data.data?.postUpgradeTriggerProbe, true, "H5 upgrade trigger probe payload was not persisted");
  passIfEqual(after.data.version, fixture.version + 1, "H5 update trigger did not increment version exactly once");
  if (new Date(after.data.updated_at).getTime() <= new Date(fixture.updatedAt).getTime()) {
    throw new Error("H5 update trigger did not advance updated_at");
  }

  await updateEvidence("pre002Upgrade", {
    result: "PASS",
    target: "disposable-supabase-local",
    sourceCommit: process.env.SOURCE_COMMIT || process.env.GITHUB_SHA || null,
    workflowRunId: process.env.GITHUB_RUN_ID || null,
    assertions: [
      "pre-002 synthetic row and JSON payload survived migration 002",
      "created_at and deleted_at columns are present with expected values",
      "all five expected update indexes and version triggers are installed",
      "update trigger increments version and advances updated_at",
    ],
    migration: "002_soft_delete_and_triggers.sql",
    checkedAt: new Date().toISOString(),
  });
  console.log("PASS: pre-002 synthetic row upgraded and migration 002 behavior verified");
}

async function verifyRestore({ apiUrl, fixturePath }) {
  const admin = makeAdmin(apiUrl);
  const fixture = await readFixture(fixturePath);
  const user = await admin.auth.admin.getUserById(fixture.userId);
  if (user.error || !user.data.user) throw new Error("H5 restore did not restore the synthetic Auth user");

  const profile = await admin.from("profiles").select("id").eq("id", fixture.userId).maybeSingle();
  if (profile.error || !profile.data || profile.data.id !== fixture.userId) {
    throw new Error("H5 restore did not recreate the synthetic profile through the signup trigger");
  }

  const selected = await admin.from("goals")
    .select("id,user_id,data,version,updated_at")
    .eq("id", fixture.goalId)
    .eq("user_id", fixture.userId)
    .maybeSingle();
  if (selected.error || !selected.data) throw new Error("H5 backup restore did not restore the synthetic goals row");
  passIfEqual(selected.data.data?.marker, fixture.marker, "H5 backup restore changed the original JSON marker");
  passIfEqual(selected.data.version, fixture.version, "H5 backup restore changed the original row version");
  passIfEqual(new Date(selected.data.updated_at).toISOString(), fixture.updatedAt, "H5 backup restore changed the original updated_at");

  const removed = await admin.auth.admin.deleteUser(fixture.userId);
  if (removed.error) throw new Error("H5 recovery cleanup could not delete the synthetic Auth user");
  const afterDelete = await admin.from("goals").select("id").eq("user_id", fixture.userId);
  if (afterDelete.error || (afterDelete.data || []).length !== 0) {
    throw new Error("H5 recovered synthetic user deletion did not cascade to its goals row");
  }

  await updateEvidence("backupRestoreRecovery", {
    result: "PASS",
    target: "disposable-supabase-local",
    sourceCommit: process.env.SOURCE_COMMIT || process.env.GITHUB_SHA || null,
    workflowRunId: process.env.GITHUB_RUN_ID || null,
    mechanism: "pg_dump synthetic auth.users + public.goals rows; reset to baseline 001; restore with psql",
    assertions: [
      "synthetic Auth user restored",
      "profile recreated by the auth.users signup trigger",
      "goals row JSON payload, version and updated_at restored exactly",
      "deleting the recovered synthetic user cascaded to its goals row",
    ],
    checkedAt: new Date().toISOString(),
  });
  console.log("PASS: synthetic backup restored into a fresh baseline and cleanup cascade verified");
}

async function main() {
  const targets = assertTargets();
  if (!Object.hasOwn(STAGES, mode)) {
    throw new Error("H5 mode must be seed, verify-upgrade or verify-restore");
  }
  if (mode === "seed") return seed(targets);
  if (mode === "verify-upgrade") return verifyUpgrade(targets);
  return verifyRestore(targets);
}

main().catch(async () => {
  const stage = STAGES[mode] || "pre002Upgrade";
  try {
    await updateEvidence(stage, {
      result: "FAIL",
      target: "disposable-supabase-local",
      sourceCommit: process.env.SOURCE_COMMIT || process.env.GITHUB_SHA || null,
      workflowRunId: process.env.GITHUB_RUN_ID || null,
      failedAt: new Date().toISOString(),
      detail: "H5 isolated upgrade/recovery assertion failed; inspect sanitized CI logs.",
    });
  } catch {
    // Retain the primary failure; CI logs remain the source for the failure reason.
  }
  console.error("FAIL: H5 isolated upgrade/recovery rehearsal failed in mode " + String(mode));
  process.exitCode = 1;
});
