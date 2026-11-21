import { retryRead } from "./retry.ts";
import { detectGuardianSignals } from "./rules.ts";
import type { SyncedGuardianRow, GuardianSignal } from "./rules.ts";

/**
 * Server-only, scheduled via Supabase pg_cron -> pg_net. No dependency on an
 * iPhone/PWA process and no external HTTP endpoint for public callers.
 * The service key never goes to GitHub Actions logs, app bundles or browsers.
 */
const BASE = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("GUARDIAN_CRON_SECRET") ?? "";
const WATCHDOG_SECRET = Deno.env.get("GUARDIAN_WATCHDOG_SECRET") ?? "";
const EMAIL_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("GUARDIAN_FROM_EMAIL") ?? "";
const ACTION = "https://ziegepapa.github.io/quy-vwce-cho-be/#/transactions";

type Subscription = { user_id: string; enrolled_at: string };
type Deliverable = { kind: GuardianSignal["kind"]; key: string };

function equalSecret(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let delta = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    delta |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return delta === 0;
}

async function adminRequest(path: string, init?: RequestInit): Promise<Response> {
  const execute = () => fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(9000),
  });
  // Only GET is retried; a POST to Resend or an ambiguous receipt mutation
  // must never become a second delivery attempt.
  return !init?.method || init.method.toUpperCase() === "GET"
    ? retryRead(execute)
    : execute();
}

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const result = await adminRequest(path, init);
  if (!result.ok) throw new Error(`guardian_admin_http_${result.status}`);
  return await result.json() as T;
}

async function getAllTransactions(userId: string): Promise<SyncedGuardianRow[]> {
  const all: SyncedGuardianRow[] = [];
  for (let offset = 0; offset < 10_000; offset += 500) {
    const result = await adminJson<SyncedGuardianRow[]>(
      `/rest/v1/transactions?select=id,data,deleted_at&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&order=id.asc&limit=500&offset=${offset}`,
    );
    all.push(...result);
    if (result.length < 500) return all;
  }
  // Fail closed rather than infer from a truncated cloud ledger.
  throw new Error("guardian_ledger_too_large");
}

async function reserve(userId: string, event: Deliverable): Promise<boolean> {
  const result = await adminRequest("/rest/v1/guardian_alert_deliveries?on_conflict=user_id,event_key", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify([{ user_id: userId, event_key: event.key, kind: event.kind }]),
  });
  if (!result.ok) throw new Error(`guardian_reservation_http_${result.status}`);
  const inserted = await result.json() as unknown;
  return Array.isArray(inserted) && inserted.length === 1;
}

async function stamp(userId: string, key: string, status: "sent" | "failed"): Promise<void> {
  const result = await adminRequest(
    `/rest/v1/guardian_alert_deliveries?user_id=eq.${encodeURIComponent(userId)}&event_key=eq.${encodeURIComponent(key)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, attempted_at: new Date().toISOString() }),
    },
  );
  if (!result.ok) throw new Error("guardian_receipt_unavailable");
}

async function messageId(userId: string, key: string): Promise<string> {
  const bytes = new TextEncoder().encode(userId + "/" + key);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest).map((v) => v.toString(16).padStart(2, "0")).join("");
}

async function send(email: string, userId: string, events: Deliverable[]): Promise<void> {
  const sale = events.some((event) => event.kind === "recorded_sale");
  const duplicate = events.some((event) => event.kind === "possible_duplicate_import");
  const subject = "VWCE Vault: wichtige Änderung prüfen";
  const text = [
    "Im synchronisierten VWCE Vault wurde eine Änderung entdeckt, die Sie prüfen sollten.",
    sale ? "Mindestens ein neuer Verkaufseintrag ist im Ledger erfasst (keine Broker-Ausführungsbestätigung)." : "",
    duplicate ? "Mindestens ein importierter Vorgang könnte doppelt erfasst worden sein." : "",
    "Es wurden keine Buchungen verändert. Dies ist keine Handelsempfehlung.",
    ACTION,
  ].filter(Boolean).join("\n\n");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${EMAIL_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": await messageId(userId, events.map((event) => event.key).sort().join("/")),
    },
    body: JSON.stringify({ from: FROM, to: [email], subject, text }),
  });
  if (!response.ok) throw new Error(`guardian_email_http_${response.status}`);
}

async function checkSubscription(sub: Subscription): Promise<{ sent: number; failed: number }> {
  // Only confirmed registered account email; no custom recipient or portfolio
  // payload is allowed from the browser. This makes Guardian opt-in user-bound.
  const user = await adminJson<{ email?: string; email_confirmed_at?: string | null }>(
    `/auth/v1/admin/users/${encodeURIComponent(sub.user_id)}`,
  );
  if (!user.email || !user.email_confirmed_at) return { sent: 0, failed: 0 };

  const rows = await getAllTransactions(sub.user_id);
  const events = detectGuardianSignals(rows, sub.enrolled_at);
  const newlyReserved: Deliverable[] = [];
  for (const event of events.slice(0, 50)) {
    if (await reserve(sub.user_id, event)) newlyReserved.push(event);
  }
  if (newlyReserved.length === 0) return { sent: 0, failed: 0 };
  // Re-check consent immediately before sending. Changes to subscriptions
  // cannot create a guaranteed cancellation of an already in-flight email.
  const latest = await adminJson<Subscription[]>(
    `/rest/v1/guardian_subscriptions?select=user_id,enrolled_at&user_id=eq.${encodeURIComponent(sub.user_id)}&enabled=eq.true`,
  );
  const readiness = await adminJson<{ active: boolean }[]>(
    "/rest/v1/guardian_service_status?select=active&id=eq.true",
  );
  if (latest.length !== 1 || latest[0].enrolled_at !== sub.enrolled_at
    || readiness.length !== 1 || readiness[0].active !== true) {
    for (const event of newlyReserved) await stamp(sub.user_id, event.key, "failed");
    return { sent: 0, failed: 0 };
  }
  let delivered = false;
  try {
    await send(user.email, sub.user_id, newlyReserved);
    delivered = true;
  } catch {
    // At-most-once attempt: ambiguous provider response is never retried as
    // a second email; recipients will not get a daily notification loop.
  }
  for (const event of newlyReserved) {
    await stamp(sub.user_id, event.key, delivered ? "sent" : "failed");
  }
  return { sent: delivered ? 1 : 0, failed: delivered ? 0 : 1 };
}

type GuardianHealth = {
  last_started_at: string | null;
  last_succeeded_at: string | null;
  last_failed_at: string | null;
  last_outcome: "never" | "running" | "success" | "degraded" | "disabled" | "failed";
  last_error_code: string | null;
  failure_streak: number;
};

async function markRun(input: Record<string, string | number | null>): Promise<void> {
  const response = await adminRequest("/rest/v1/guardian_run_health?id=eq.true", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`guardian_health_http_${response.status}`);
}

function elapsed(start: number): number {
  return Math.min(300000, Math.max(0, Math.floor(performance.now() - start)));
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "GET") {
    // Authenticated status only. No financial, identity, or subscription data.
    // The independent GitHub watchdog uses a DIFFERENT secret than Cron.
    if (WATCHDOG_SECRET.length < 32 ||
        !equalSecret(req.headers.get("x-guardian-watchdog-secret") ?? "", WATCHDOG_SECRET)) {
      return new Response(null, { status: 403 });
    }
    if (!BASE.startsWith("https://") || !SERVICE_KEY) {
      return Response.json({ error: "not_configured" }, { status: 503 });
    }
    try {
      const [rows, gate] = await Promise.all([
        adminJson<GuardianHealth[]>("/rest/v1/guardian_run_health?select=last_started_at,last_succeeded_at,last_failed_at,last_outcome,last_error_code,failure_streak&id=eq.true"),
        adminJson<{ active: boolean }[]>("/rest/v1/guardian_service_status?select=active&id=eq.true"),
      ]);
      if (rows.length !== 1 || gate.length !== 1) throw new Error("guardian_health_missing");
      return Response.json({
        active: gate[0].active === true,
        lastStartedAt: rows[0].last_started_at,
        lastSucceededAt: rows[0].last_succeeded_at,
        lastOutcome: rows[0].last_outcome,
        lastErrorCode: rows[0].last_error_code,
        failureStreak: rows[0].failure_streak,
      }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return Response.json({ error: "health_unavailable" }, { status: 503 });
    }
  }
  if (req.method !== "POST") return new Response(null, { status: 405 });
  if (CRON_SECRET.length < 32 || !equalSecret(req.headers.get("x-guardian-secret") ?? "", CRON_SECRET)) {
    return new Response(null, { status: 403 });
  }
  if (!BASE.startsWith("https://") || !SERVICE_KEY || !EMAIL_KEY || !FROM || !FROM.includes("@")) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  const start = performance.now();
  let previousFailures = 0;
  try {
    const existing = await adminJson<Pick<GuardianHealth, "failure_streak">[]>(
      "/rest/v1/guardian_run_health?select=failure_streak&id=eq.true",
    );
    if (existing.length !== 1) throw new Error("guardian_health_missing");
    previousFailures = existing[0].failure_streak;
    await markRun({ last_started_at: new Date().toISOString(), last_outcome: "running", last_error_code: null });

    const status = await adminJson<{ active: boolean }[]>(
      "/rest/v1/guardian_service_status?select=active&id=eq.true",
    );
    if (status.length !== 1 || status[0].active !== true) {
      await markRun({ last_outcome: "disabled", failure_streak: 0, last_duration_ms: elapsed(start) });
      return Response.json({ checked: 0, sent: 0, failed: 0, active: false });
    }

    const subscriptions = await adminJson<Subscription[]>(
      "/rest/v1/guardian_subscriptions?select=user_id,enrolled_at&enabled=eq.true&limit=1000",
    );
    let sent = 0;
    let failed = 0;
    for (const sub of subscriptions) {
      if (!sub.user_id || !sub.enrolled_at) continue;
      try {
        const outcome = await checkSubscription(sub);
        sent += outcome.sent;
        failed += outcome.failed;
      } catch {
        // Diagnostics are aggregate-only, no user ID or transaction detail.
        failed++;
      }
    }
    const now = new Date().toISOString();
    if (failed > 0) {
      await markRun({
        last_outcome: "degraded", last_error_code: "partial",
        last_failed_at: now, failure_streak: previousFailures + 1, last_duration_ms: elapsed(start),
      });
    } else {
      await markRun({
        last_outcome: "success", last_error_code: null,
        last_succeeded_at: now, failure_streak: 0, last_duration_ms: elapsed(start),
      });
    }
    return Response.json({ checked: subscriptions.length, sent, failed });
  } catch {
    // An unreliable database connection can prevent recording failure itself;
    // the independent watchdog will still detect the stale success timestamp.
    try {
      await markRun({
        last_outcome: "failed", last_error_code: "cloud_read",
        last_failed_at: new Date().toISOString(),
        failure_streak: previousFailures + 1, last_duration_ms: elapsed(start),
      });
    } catch { /* no unsafe fallback to a client write */ }
    return Response.json({ error: "guardian_unavailable" }, { status: 503 });
  }
});
