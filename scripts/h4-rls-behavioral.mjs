#!/usr/bin/env node
/**
 * H4 — Behavioral RLS matrix via Supabase Auth + PostgREST (not SQL-only).
 *
 * Guardrails:
 * - Target must be localhost (or explicit allow-list) — fail closed otherwise.
 * - Synthetic users only; never production family data.
 * - Service-role only for fixture bootstrap; assertions use user JWTs / anon key.
 * - Never print passwords, tokens, or raw auth payloads.
 *
 * Env:
 *   SUPABASE_URL           e.g. http://127.0.0.1:54321
 *   SUPABASE_ANON_KEY      local anon key
 *   SUPABASE_SERVICE_ROLE_KEY  local service role (bootstrap only)
 *
 * Exit 0 only when every applicable matrix cell passes.
 */

import { createClient } from "@supabase/supabase-js";

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
  const allowed =
    host === "127.0.0.1" ||
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".supabase.internal");
  if (!allowed) {
    throw new Error(`H4 fail-closed: refusing non-local target host "${host}"`);
  }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

function pass(msg) {
  console.log(`PASS: ${msg}`);
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
  const clientA = await signIn(url, anonKey, emailA, password);
  const clientB = await signIn(url, anonKey, emailB, password);

  console.log("H4 matrix start (synthetic users; tokens not logged)");

  // profiles: A can read own; B cannot read A
  {
    const { data: own, error } = await clientA.from("profiles").select("id").eq("id", userA.id);
    if (error) fail(`profiles A select own: ${error.message}`);
    else if (!own?.length) fail("profiles A select own returned 0 rows");
    else pass("profiles A select own");

    const { data: cross } = await clientB.from("profiles").select("id").eq("id", userA.id);
    if (cross?.length) fail("profiles B must not see A");
    else pass("profiles B cannot select A");

    const { data: anonRows } = await anon.from("profiles").select("id").eq("id", userA.id);
    if (anonRows?.length) fail("anon must not see profiles");
    else pass("anon cannot select profiles");
  }

  for (const table of TABLES) {
    const row = { ...table.sample, user_id: userA.id };

    // A insert own
    {
      const { error } = await clientA.from(table.name).insert(row);
      if (error) fail(`${table.name} A insert own: ${error.message}`);
      else pass(`${table.name} A insert own`);
    }

    // A select own
    {
      const { data, error } = await clientA.from(table.name).select("id").eq("id", table.sample.id);
      if (error) fail(`${table.name} A select own: ${error.message}`);
      else if (!data?.length) fail(`${table.name} A select own empty (HTTP may be 200 under RLS)`);
      else pass(`${table.name} A select own`);
    }

    // B select A → empty
    {
      const { data } = await clientB.from(table.name).select("id").eq("id", table.sample.id);
      if (data?.length) fail(`${table.name} B saw A's row`);
      else pass(`${table.name} B cannot select A`);
    }

    // B update A → no change
    {
      await clientB
        .from(table.name)
        .update({ data: { hijack: true } })
        .eq("id", table.sample.id)
        .eq("user_id", userA.id);
      const { data: recheck } = await clientA.from(table.name).select("data").eq("id", table.sample.id).maybeSingle();
      if (recheck?.data && recheck.data.hijack === true) fail(`${table.name} B updated A's row`);
      else pass(`${table.name} B cannot update A`);
    }

    // B insert claiming A's user_id
    {
      const forged = { ...table.sample, id: `${table.sample.id}-forged`, user_id: userA.id };
      const { error } = await clientB.from(table.name).insert(forged);
      if (!error) {
        // Prefer WITH CHECK reject; if insert "succeeded", verify A cannot be polluted
        const { data } = await clientA.from(table.name).select("id").eq("id", forged.id);
        if (data?.length) fail(`${table.name} B forged insert landed as A`);
        else pass(`${table.name} B forged insert not visible to A`);
      } else {
        pass(`${table.name} B forged insert rejected`);
      }
    }

    // anon insert
    {
      const { error } = await anon.from(table.name).insert({ ...table.sample, id: `${table.sample.id}-anon`, user_id: userA.id });
      if (!error) fail(`${table.name} anon insert must fail`);
      else pass(`${table.name} anon cannot insert`);
    }

    // A delete own
    {
      const { error } = await clientA.from(table.name).delete().eq("id", table.sample.id);
      if (error) fail(`${table.name} A delete own: ${error.message}`);
      else pass(`${table.name} A delete own`);
    }
  }

  // cleanup synthetic users (best-effort)
  try {
    await admin.auth.admin.deleteUser(userA.id);
    await admin.auth.admin.deleteUser(userB.id);
  } catch {
    /* ignore */
  }

  if (process.exitCode) {
    console.error("H4 matrix FAILED");
    process.exit(1);
  }
  console.log("H4 matrix PASSED");
}

main().catch((e) => {
  console.error("H4 error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
