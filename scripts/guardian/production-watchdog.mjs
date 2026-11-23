/**
 * Standalone watcher used by the EXISTING Production Health GitHub workflow.
 * This has no Supabase service key, no ledger access, and no email provider.
 * ntfy messages contain only aggregate health and UTC time information.
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const MAX_SILENCE_HOURS = 36;
const HEALTH_RETRY_MS = [800, 2000, 5000];

export function evaluateGuardianHealth(report, now = new Date(), maxHours = MAX_SILENCE_HOURS) {
  if (!report || typeof report !== "object") return { ok: false, code: "unreachable" };
  if (report.active !== true) return { ok: false, code: "unexpected_disabled" };
  if (!["never", "running", "success", "degraded", "disabled", "failed"].includes(report.lastOutcome)) {
    return { ok: false, code: "invalid_status" };
  }
  const success = Date.parse(report.lastSucceededAt ?? "");
  if (!Number.isFinite(success)) return { ok: false, code: "never_success" };
  const ageHours = (now.getTime() - success) / 3600000;
  if (ageHours < -1 || !Number.isFinite(ageHours)) return { ok: false, code: "invalid_clock" };
  if (ageHours > maxHours) return { ok: false, code: "stale_heartbeat", hours: Math.floor(ageHours) };
  if (["failed", "degraded"].includes(report.lastOutcome) && Number(report.failureStreak) >= 2) {
    return { ok: false, code: "consecutive_failures" };
  }
  return { ok: true, code: "healthy", hours: Math.floor(Math.max(ageHours, 0)) };
}

export async function checkHeartbeat(url, secret, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:" || !endpoint.pathname.endsWith("/functions/v1/silent-guardian")) {
    throw new Error("watchdog_bad_status_endpoint");
  }
  if (typeof secret !== "string" || secret.length < 32) throw new Error("watchdog_secret_missing");
  for (let attempt = 0; attempt <= HEALTH_RETRY_MS.length; attempt++) {
    try {
      const response = await fetchImpl(endpoint.href, {
        method: "GET",
        headers: { "x-guardian-watchdog-secret": secret, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) return await response.json();
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error("watchdog_http_nontransient_" + response.status);
      }
      if (attempt === HEALTH_RETRY_MS.length) throw new Error("watchdog_http_transient_exhausted");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("watchdog_http_nontransient_")) throw error;
      if (attempt === HEALTH_RETRY_MS.length) throw new Error("watchdog_unreachable");
    }
    await sleep(HEALTH_RETRY_MS[attempt]);
  }
  throw new Error("watchdog_unreachable");
}

export async function notifyNtfy(url, token, message, fetchImpl = fetch) {
  const destination = new URL(url);
  if (destination.protocol !== "https:" || destination.pathname === "/" || destination.username || destination.password) {
    throw new Error("watchdog_ntfy_url_invalid");
  }
  if (typeof token !== "string" || token.length < 16) throw new Error("watchdog_ntfy_token_missing");
  // Do NOT retry ambiguous POSTs; GitHub Actions failure remains visible.
  const response = await fetchImpl(destination.href, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Title": "VWCE Vault: Guardian watchdog",
      "Priority": "high",
      "Tags": "warning",
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: message,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("watchdog_ntfy_rejected");
}

export async function run(env = process.env) {
  if (env.GUARDIAN_WATCHDOG_ENABLED !== "true") {
    console.log("guardian_watchdog_not_armed");
    return;
  }
  const canNotify = env.GITHUB_EVENT_NAME === "schedule" || env.GUARDIAN_NOTIFY_MANUAL === "true";
  let evaluation;
  try {
    const health = await checkHeartbeat(env.GUARDIAN_WATCHDOG_URL, env.GUARDIAN_WATCHDOG_SECRET);
    evaluation = evaluateGuardianHealth(health);
  } catch {
    evaluation = { ok: false, code: "status_unavailable" };
  }
  if (evaluation.ok) {
    console.log("guardian_watchdog_healthy");
    return;
  }
  console.error("guardian_watchdog_alert:" + evaluation.code);
  if (!canNotify) throw new Error("guardian_watchdog_unhealthy_manual_no_notify");
  const msg = [
    "VWCE Vault Silent Guardian: independent watchdog warning.",
    "Issue: " + evaluation.code,
    "Guardian scans cannot be confirmed healthy.",
    "Check Supabase Cron, Edge Function logs, Guardian run health and Resend status.",
    "No financial data has been inspected or changed by this watchdog.",
  ].join("\n");
  await notifyNtfy(env.GUARDIAN_NTFY_URL, env.GUARDIAN_NTFY_TOKEN, msg);
  // Job stays RED after notifying. GitHub Actions is an independent record.
  throw new Error("guardian_watchdog_alert_sent");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : "guardian_watchdog_error");
    process.exitCode = 1;
  });
}
