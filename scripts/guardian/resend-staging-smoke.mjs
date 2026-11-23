/**
 * ONE-SHOT provider transport proof for an ALLOWED Resend sandbox mailbox.
 *
 * Manual only; never part of a PR build, cron job, Edge worker or production.
 * Sends exactly one POST, no retries. Never logs addresses, keys or response.
 * This does not exercise Supabase/Auth/RLS/Cron or prove inbox delivery.
 */
import { pathToFileURL } from "node:url";

const STAGING_PROJECT_REF = "cfpiocofgmtbaelsfvnr";
const RESEND_API = "https://api.resend.com/emails";
const SANDBOX_FROM = "onboarding@resend.dev";
const allowed = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function stagingEmailRequest(env, dayUtc = new Date().toISOString().slice(0, 10)) {
  if (env.GUARDIAN_STAGING_SEND_APPROVED !== "ONE_TEST_EMAIL_ONLY" ||
      env.SUPABASE_PROJECT_REF !== STAGING_PROJECT_REF) {
    throw new Error("staging_send_not_explicitly_armed");
  }
  const to = env.RESEND_TEST_TO?.trim();
  const account = env.RESEND_ACCOUNT_EMAIL?.trim();
  if (!to || !account || !allowed.test(to) || to.toLowerCase() !== account.toLowerCase()) {
    throw new Error("sandbox_recipient_not_verified_as_resend_account_email");
  }
  if (env.GUARDIAN_FROM_EMAIL !== SANDBOX_FROM) {
    throw new Error("sandbox_sender_not_allowed");
  }
  if (!/^re_[a-zA-Z0-9_\-]+$/.test(env.RESEND_API_KEY ?? "")) {
    throw new Error("staging_resend_key_missing");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayUtc)) {
    throw new Error("invalid_utc_date");
  }
  const body = {
    from: SANDBOX_FROM,
    to: [to],
    subject: "[TEST ONLY] VWCE Vault Silent Guardian transport",
    text: "This is a single synthetic email delivery test. No account balances, transactions or personal investment data were read. No monitoring is enabled.",
  };
  return {
    url: RESEND_API,
    options: {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": "vwce-guardian-staging-" + dayUtc,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    },
  };
}

export async function sendOneStagingEmail(env, fetchImpl = fetch, dayUtc) {
  // Fail closed before any network request. No implicit retries.
  const req = stagingEmailRequest(env, dayUtc);
  const response = await fetchImpl(req.url, req.options);
  if (!response.ok) {
    // Do not echo Resend's error body: it might contain email addresses.
    throw new Error("resend_staging_http_" + response.status);
  }
  return { acceptedByApi: true, httpStatus: response.status };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  sendOneStagingEmail(process.env).then(
    (result) => console.log("resend_staging_api_accepted_http_" + result.httpStatus +
      " (not inbox-delivery proof)"),
    (error) => {
      console.error(error instanceof Error && /^(?:staging_|sandbox_|invalid_|resend_)/.test(error.message)
        ? error.message : "resend_staging_transport_failure");
      process.exitCode = 1;
    },
  );
}
