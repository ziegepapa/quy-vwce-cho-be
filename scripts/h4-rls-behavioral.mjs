#!/usr/bin/env node
/**
 * H4 — Behavioral RLS matrix via Supabase Auth + PostgREST (not SQL-only).
 *
 * Guardrails:
 * - Target must be localhost (or explicit allow-list) — fail closed otherwise.
 * - Synthetic users only; never production family data.
 * - Service-role only for synthetic fixture bootstrap, cleanup and cascade verification; access-control assertions use user JWTs / anon key.
 * - Never print passwords, tokens, or raw auth payloads.
 *
 * Env:
 *   SUPABASE_URL           e.g. http://127.0.0.1:54321
 *   SUPABASE_ANON_KEY      local anon key
 *   SUPABASE_SERVICE_ROLE_KEY  local service role (bootstrap only)
 *
 * Exit 0 only when every applicable matrix cell passes.
 */

import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const outcomes = [];

const TABLES = [
  { name: "app_settings", pk: ["user_id", "id"], sample: { id: "default", data: { h4: true }, version: 1 } },
  { name: "goals", pk: ["user_id", "id"], sample: { id: "goal-h4", data: { title: "synthetic" }, version: 1 } },
  { name: "transactions", pk: ["user_id", "id"], sample: { id: "tx-h4", data: { type: "cash_in", amount: 1 }, version: 1 } },
  { name: "annual_checklists", pk: ["user_id", "id"], sample: { id: "cl-h4", data: { year: 2026 }, version: 1 } },
  { name: "monthly_snapshots", pk: ["user_id", "id"], sample: { id: "snap-h4", data: { month: "2026-01" }, version: 1 } },
];

function assertLocalUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`H4 fail-closed: invalid SUPABASE_URL`);
  }
  const host = u.hostname;
  const allowed = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (!allowed || u.protocol !== "http:" || u.port !== "54321") {
    throw new Error("H4 fail-closed: refusing non-local Supabase target");
  }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function fail(msg) {
  outcomes.push({ status: "FAIL", case: msg });
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

function pass(msg) {
  outcomes.push({ status: "PASS", case: msg });
  console.log(`PASS: ${msg}`);
}

async function writeEvidence() {
  const passed = outcomes.filter((item) => item.status === "PASS").length;
  const failed = outcomes.filter((item) => item.status === "FAIL").length;
  const evidence = {
    schemaVersion: 1,
    kind: "H4_BEHAVIORAL_RLS",
    target: "disposable-supabase-local",
    generatedAt: new Date().toISOString(),
    result: failed === 0 ? "PASS" : "FAIL",
    summary: { passed, failed, total: outcomes.length },
    cases: outcomes,
  };
  await writeFile("h4-evidence.json", JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
}

function isExpectedDenied(error) {
  const code = String(error?.code ?? error?.status ?? "");
  const message = String(error?.message ?? "");
  return ["42501", "PGRST301", "PGRST302", "401", "403"].includes(code) ||
    /row-level security|permission denied|not authorized|invalid jwt|jwt expired/i.test(message);
}

function expectNoPrivateRows(result, label) {
  if (result.error) {
    if (isExpectedDenied(result.error)) pass(label + " — access denied");
    else fail(label + " — unexpected error: " + result.error.message);
    return;
  }
  if (Array.isArray(result.data) && result.data.length === 0) {
    pass(label + " — no rows");
    return;
  }
  if (result.data == null) {
    pass(label + " — no row");
    return;
  }
  fail(label + " — protected row was exposed");
}

function expectDeniedInsert(result, label) {
  if (!result.error) {
    fail(label + " — unexpectedly succeeded");
  } else if (isExpectedDenied(result.error)) {
    pass(label + " — rejected by Auth/RLS");
  } else {
    fail(label + " — unexpected error: " + result.error.message);
  }
}

function inspectMutationError(error, label) {
  if (error && !isExpectedDenied(error)) {
    fail(label + " — unexpected error: " + error.message);
  }
}

async function signUp(admin, email, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user;
}

async function signIn(url, anonKey, email, password) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function main() {
  const url = requireEnv("SUPABASE_URL");
  assertLocalUrl(url);
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = Date.now();
  const emailA = `h4-a-${stamp}@example.invalid`;
  const emailB = `h4-b-${stamp}@example.invalid`;
  const password = `H4-synth-${stamp}-x`;

  const userA = await signUp(admin, emailA, password);
  const userB = await signUp(admin, emailB, password);
  const cascadeRows = [];
  const clientA = await signIn(url, anonKey, emailA, password);
  const clientB = await signIn(url, anonKey, emailB, password);

  console.log("H4 matrix start (synthetic users; tokens not logged)");

  // Helper functions intentionally assert through authenticated REST clients.
  async function readDataRow(client, tableName, ownerId, id, label) {
    const { data, error } = await client.from(tableName)
      .select("id,user_id,data")
      .eq("id", id)
      .eq("user_id", ownerId)
      .maybeSingle();
    if (error) {
      fail(label + " — owner re-read failed: " + error.message);
      return null;
    }
    if (!data) {
      fail(label + " — expected row is missing");
      return null;
    }
    return data;
  }

  async function readProfile(client, profileId, label) {
    const { data, error } = await client.from("profiles")
      .select("id,display_name")
      .eq("id", profileId)
      .maybeSingle();
    if (error) {
      fail(label + " — profile re-read failed: " + error.message);
      return null;
    }
    if (!data) {
      fail(label + " — expected profile is missing");
      return null;
    }
    return data;
  }

  // profiles: own access, cross-user isolation in both directions, and anonymous denial.
  const profileAResult = await clientA.from("profiles").select("id").eq("id", userA.id);
  if (profileAResult.error || !profileAResult.data?.some((r) => r.id === userA.id)) {
    fail("profiles A select own — " + (profileAResult.error?.message ?? "expected own profile not returned"));
  } else pass("profiles A select own");

  const profileBResult = await clientB.from("profiles").select("id").eq("id", userB.id);
  if (profileBResult.error || !profileBResult.data?.some((r) => r.id === userB.id)) {
    fail("profiles B select own — " + (profileBResult.error?.message ?? "expected own profile not returned"));
  } else pass("profiles B select own");

  expectNoPrivateRows(
    await clientB.from("profiles").select("id").eq("id", userA.id),
    "profiles B cannot select A"
  );
  expectNoPrivateRows(
    await clientA.from("profiles").select("id").eq("id", userB.id),
    "profiles A cannot select B"
  );
  expectNoPrivateRows(
    await anon.from("profiles").select("id").in("id", [userA.id, userB.id]),
    "profiles anonymous select"
  );

  const profileMarkerA = "owner-a-" + stamp;
  const profileMarkerB = "owner-b-" + stamp;
  const updateProfileA = await clientA.from("profiles").update({ display_name: profileMarkerA }).eq("id", userA.id);
  if (updateProfileA.error) fail("profiles A update own — " + updateProfileA.error.message);
  const updateProfileB = await clientB.from("profiles").update({ display_name: profileMarkerB }).eq("id", userB.id);
  if (updateProfileB.error) fail("profiles B update own — " + updateProfileB.error.message);
  const profileAAfterOwn = await readProfile(clientA, userA.id, "profiles A own update");
  const profileBAfterOwn = await readProfile(clientB, userB.id, "profiles B own update");
  if (profileAAfterOwn?.display_name !== profileMarkerA) fail("profiles A own update did not persist");
  else pass("profiles A update own persists");
  if (profileBAfterOwn?.display_name !== profileMarkerB) fail("profiles B own update did not persist");
  else pass("profiles B update own persists");

  const crossProfileUpdateBA = await clientB.from("profiles").update({ display_name: "attack-b-to-a" }).eq("id", userA.id);
  inspectMutationError(crossProfileUpdateBA.error, "profiles B update A");
  const crossProfileUpdateAB = await clientA.from("profiles").update({ display_name: "attack-a-to-b" }).eq("id", userB.id);
  inspectMutationError(crossProfileUpdateAB.error, "profiles A update B");
  const profileAAfterCrossUpdate = await readProfile(clientA, userA.id, "profiles A after cross update");
  const profileBAfterCrossUpdate = await readProfile(clientB, userB.id, "profiles B after cross update");
  if (profileAAfterCrossUpdate?.display_name !== profileMarkerA) fail("profiles B changed A's profile");
  else pass("profiles B cannot update A");
  if (profileBAfterCrossUpdate?.display_name !== profileMarkerB) fail("profiles A changed B's profile");
  else pass("profiles A cannot update B");

  const crossProfileDeleteBA = await clientB.from("profiles").delete().eq("id", userA.id);
  inspectMutationError(crossProfileDeleteBA.error, "profiles B delete A");
  const crossProfileDeleteAB = await clientA.from("profiles").delete().eq("id", userB.id);
  inspectMutationError(crossProfileDeleteAB.error, "profiles A delete B");
  await readProfile(clientA, userA.id, "profiles A after cross delete");
  await readProfile(clientB, userB.id, "profiles B after cross delete");

  const anonProfileUpdate = await anon.from("profiles").update({ display_name: "attack-anon" }).in("id", [userA.id, userB.id]);
  inspectMutationError(anonProfileUpdate.error, "profiles anonymous update");
  const profileAAfterAnonUpdate = await readProfile(clientA, userA.id, "profiles A after anonymous update");
  const profileBAfterAnonUpdate = await readProfile(clientB, userB.id, "profiles B after anonymous update");
  if (profileAAfterAnonUpdate?.display_name !== profileMarkerA) fail("anonymous changed A's profile");
  else pass("anonymous cannot update A profile");
  if (profileBAfterAnonUpdate?.display_name !== profileMarkerB) fail("anonymous changed B's profile");
  else pass("anonymous cannot update B profile");

  const anonProfileDelete = await anon.from("profiles").delete().in("id", [userA.id, userB.id]);
  inspectMutationError(anonProfileDelete.error, "profiles anonymous delete");
  await readProfile(clientA, userA.id, "profiles A after anonymous delete");
  await readProfile(clientB, userB.id, "profiles B after anonymous delete");

  expectDeniedInsert(
    await clientB.from("profiles").insert({ id: userA.id, display_name: "forged-by-b" }),
    "profiles B cannot claim A's identity"
  );
  expectDeniedInsert(
    await clientA.from("profiles").insert({ id: userB.id, display_name: "forged-by-a" }),
    "profiles A cannot claim B's identity"
  );
  expectDeniedInsert(
    await anon.from("profiles").insert({ id: userA.id, display_name: "forged-anonymous" }),
    "profiles anonymous cannot claim A's identity"
  );

  // For each sync table, create a row for A and B. Each owner's successful
  // read-back is the control that prevents generic HTTP/network errors from
  // being mistaken for a successful denial.
  for (const table of TABLES) {
    const rowA = { ...table.sample, id: table.sample.id + "-a-" + stamp, user_id: userA.id };
    const rowB = { ...table.sample, id: table.sample.id + "-b-" + stamp, user_id: userB.id };
    const markerA = "owner-a-" + stamp;
    const markerB = "owner-b-" + stamp;

    const insertA = await clientA.from(table.name).insert({ ...rowA, data: { ...table.sample.data, h4OwnerMarker: markerA } });
    if (insertA.error) fail(table.name + " A insert own — " + insertA.error.message);
    else pass(table.name + " A insert own");
    const insertB = await clientB.from(table.name).insert({ ...rowB, data: { ...table.sample.data, h4OwnerMarker: markerB } });
    if (insertB.error) fail(table.name + " B insert own — " + insertB.error.message);
    else pass(table.name + " B insert own");

    const ownA = await readDataRow(clientA, table.name, userA.id, rowA.id, table.name + " A select own");
    const ownB = await readDataRow(clientB, table.name, userB.id, rowB.id, table.name + " B select own");
    if (ownA?.data?.h4OwnerMarker !== markerA) fail(table.name + " A owner control marker mismatch");
    if (ownB?.data?.h4OwnerMarker !== markerB) fail(table.name + " B owner control marker mismatch");

    expectNoPrivateRows(
      await clientB.from(table.name).select("id").eq("id", rowA.id).eq("user_id", userA.id),
      table.name + " B cannot select A"
    );
    expectNoPrivateRows(
      await clientA.from(table.name).select("id").eq("id", rowB.id).eq("user_id", userB.id),
      table.name + " A cannot select B"
    );
    expectNoPrivateRows(
      await anon.from(table.name).select("id").in("id", [rowA.id, rowB.id]),
      table.name + " anonymous select"
    );

    const ownUpdateA = await clientA.from(table.name).update({
      data: { ...table.sample.data, h4OwnerMarker: markerA, h4OwnUpdated: true },
    }).eq("id", rowA.id).eq("user_id", userA.id);
    if (ownUpdateA.error) fail(table.name + " A update own — " + ownUpdateA.error.message);
    const ownAfterUpdateA = await readDataRow(clientA, table.name, userA.id, rowA.id, table.name + " A after own update");
    if (ownAfterUpdateA?.data?.h4OwnerMarker !== markerA || ownAfterUpdateA?.data?.h4OwnUpdated !== true) {
      fail(table.name + " A own update did not persist");
    } else pass(table.name + " A update own persists");

    const ownUpdateB = await clientB.from(table.name).update({
      data: { ...table.sample.data, h4OwnerMarker: markerB, h4OwnUpdated: true },
    }).eq("id", rowB.id).eq("user_id", userB.id);
    if (ownUpdateB.error) fail(table.name + " B update own — " + ownUpdateB.error.message);
    const ownAfterUpdateB = await readDataRow(clientB, table.name, userB.id, rowB.id, table.name + " B after own update");
    if (ownAfterUpdateB?.data?.h4OwnerMarker !== markerB || ownAfterUpdateB?.data?.h4OwnUpdated !== true) {
      fail(table.name + " B own update did not persist");
    } else pass(table.name + " B update own persists");

    const updateBA = await clientB.from(table.name).update({ data: { h4Attack: "from-b" } }).eq("id", rowA.id).eq("user_id", userA.id);
    inspectMutationError(updateBA.error, table.name + " B update A");
    const afterUpdateBA = await readDataRow(clientA, table.name, userA.id, rowA.id, table.name + " A after B update");
    if (afterUpdateBA?.data?.h4OwnerMarker !== markerA) fail(table.name + " B changed A's row");
    else pass(table.name + " B cannot update A");

    const updateAB = await clientA.from(table.name).update({ data: { h4Attack: "from-a" } }).eq("id", rowB.id).eq("user_id", userB.id);
    inspectMutationError(updateAB.error, table.name + " A update B");
    const afterUpdateAB = await readDataRow(clientB, table.name, userB.id, rowB.id, table.name + " B after A update");
    if (afterUpdateAB?.data?.h4OwnerMarker !== markerB) fail(table.name + " A changed B's row");
    else pass(table.name + " A cannot update B");

    const deleteBA = await clientB.from(table.name).delete().eq("id", rowA.id).eq("user_id", userA.id);
    inspectMutationError(deleteBA.error, table.name + " B delete A");
    await readDataRow(clientA, table.name, userA.id, rowA.id, table.name + " A after B delete");
    const deleteAB = await clientA.from(table.name).delete().eq("id", rowB.id).eq("user_id", userB.id);
    inspectMutationError(deleteAB.error, table.name + " A delete B");
    await readDataRow(clientB, table.name, userB.id, rowB.id, table.name + " B after A delete");

    expectDeniedInsert(
      await clientB.from(table.name).insert({ ...table.sample, id: "forged-b-" + stamp + "-" + table.name, user_id: userA.id }),
      table.name + " B forged user_id insert"
    );
    expectDeniedInsert(
      await clientA.from(table.name).insert({ ...table.sample, id: "forged-a-" + stamp + "-" + table.name, user_id: userB.id }),
      table.name + " A forged user_id insert"
    );
    expectDeniedInsert(
      await anon.from(table.name).insert({ ...table.sample, id: "forged-anon-a-" + stamp + "-" + table.name, user_id: userA.id }),
      table.name + " anonymous forged insert"
    );

    const anonUpdateA = await anon.from(table.name).update({ data: { h4Attack: "from-anon" } }).eq("id", rowA.id).eq("user_id", userA.id);
    inspectMutationError(anonUpdateA.error, table.name + " anonymous update A");
    const afterAnonUpdateA = await readDataRow(clientA, table.name, userA.id, rowA.id, table.name + " A after anonymous update");
    if (afterAnonUpdateA?.data?.h4OwnerMarker !== markerA) fail(table.name + " anonymous changed A's row");
    else pass(table.name + " anonymous cannot update A");

    const anonUpdateB = await anon.from(table.name).update({ data: { h4Attack: "from-anon" } }).eq("id", rowB.id).eq("user_id", userB.id);
    inspectMutationError(anonUpdateB.error, table.name + " anonymous update B");
    const afterAnonUpdateB = await readDataRow(clientB, table.name, userB.id, rowB.id, table.name + " B after anonymous update");
    if (afterAnonUpdateB?.data?.h4OwnerMarker !== markerB) fail(table.name + " anonymous changed B's row");
    else pass(table.name + " anonymous cannot update B");

    const anonDeleteA = await anon.from(table.name).delete().eq("id", rowA.id).eq("user_id", userA.id);
    inspectMutationError(anonDeleteA.error, table.name + " anonymous delete A");
    await readDataRow(clientA, table.name, userA.id, rowA.id, table.name + " A after anonymous delete");
    const anonDeleteB = await anon.from(table.name).delete().eq("id", rowB.id).eq("user_id", userB.id);
    inspectMutationError(anonDeleteB.error, table.name + " anonymous delete B");
    await readDataRow(clientB, table.name, userB.id, rowB.id, table.name + " B after anonymous delete");

    const ownDeleteA = await clientA.from(table.name).delete().eq("id", rowA.id).eq("user_id", userA.id).select("id");
    if (ownDeleteA.error) fail(table.name + " A delete own — " + ownDeleteA.error.message);
    else if (!ownDeleteA.data?.some((r) => r.id === rowA.id)) fail(table.name + " A delete own matched no visible row");
    else pass(table.name + " A delete own");

    const ownDeleteB = await clientB.from(table.name).delete().eq("id", rowB.id).eq("user_id", userB.id).select("id");
    if (ownDeleteB.error) fail(table.name + " B delete own — " + ownDeleteB.error.message);
    else if (!ownDeleteB.data?.some((r) => r.id === rowB.id)) fail(table.name + " B delete own matched no visible row");
    else pass(table.name + " B delete own");

    expectNoPrivateRows(
      await clientA.from(table.name).select("id").eq("id", rowA.id).eq("user_id", userA.id),
      table.name + " A row removed after own delete"
    );
    expectNoPrivateRows(
      await clientB.from(table.name).select("id").eq("id", rowB.id).eq("user_id", userB.id),
      table.name + " B row removed after own delete"
    );

    // Leave one synthetic A-owned row to test auth.users ON DELETE CASCADE below.
    const cascadeId = "cascade-" + table.name + "-" + stamp;
    const cascadeInsert = await clientA.from(table.name).insert({
      ...table.sample,
      id: cascadeId,
      user_id: userA.id,
      data: { ...table.sample.data, h4CascadeSentinel: true },
    });
    if (cascadeInsert.error) {
      fail(table.name + " cascade sentinel insert — " + cascadeInsert.error.message);
    } else {
      cascadeRows.push({ table: table.name, id: cascadeId, userId: userA.id });
      pass(table.name + " cascade sentinel staged");
    }
  }

  // A malformed bearer token must be rejected, not accidentally treated as an authenticated user.
  const invalidTokenClient = createClient(url, anonKey, {
    global: { headers: { Authorization: "Bearer definitely-not-a-valid-jwt" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const invalidTokenResult = await invalidTokenClient.from("profiles").select("id").eq("id", userA.id);
  if (invalidTokenResult.error && isExpectedDenied(invalidTokenResult.error)) {
    pass("invalid bearer token rejected");
  } else {
    fail("invalid bearer token was not clearly rejected by Auth/PostgREST");
  }
  // Delete synthetic User A and verify ON DELETE CASCADE for profiles + each sync table.
  const deleteA = await admin.auth.admin.deleteUser(userA.id);
  if (deleteA.error) fail("delete synthetic User A — " + deleteA.error.message);
  else pass("delete synthetic User A");

  const profileCascadeA = await admin.from("profiles").select("id").eq("id", userA.id);
  if (profileCascadeA.error) fail("verify profile cascade A — " + profileCascadeA.error.message);
  else if (profileCascadeA.data?.length) fail("profile row survived deletion of User A");
  else pass("profile row cascaded after deleting User A");

  for (const row of cascadeRows) {
    const { data, error } = await admin.from(row.table).select("id").eq("user_id", row.userId).eq("id", row.id);
    if (error) fail(row.table + " cascade verification — " + error.message);
    else if (data?.length) fail(row.table + " row survived deletion of User A");
    else pass(row.table + " row cascaded after deleting User A");
  }

  const deleteB = await admin.auth.admin.deleteUser(userB.id);
  if (deleteB.error) fail("delete synthetic User B — " + deleteB.error.message);
  else pass("delete synthetic User B");
  const profileCascadeB = await admin.from("profiles").select("id").eq("id", userB.id);
  if (profileCascadeB.error) fail("verify profile cascade B — " + profileCascadeB.error.message);
  else if (profileCascadeB.data?.length) fail("profile row survived deletion of User B");
  else pass("profile row cascaded after deleting User B");

  await writeEvidence();
  if (process.exitCode) {
    console.error("H4 matrix FAILED");
    return;
  }
  console.log("H4 matrix PASSED");
}

main().catch(async (e) => {
  fail("H4 runner error: " + (e instanceof Error ? e.message : String(e)));
  try {
    await writeEvidence();
  } catch {
    /* evidence upload may still show the runner failure in logs */
  }
  process.exitCode = 1;
});
