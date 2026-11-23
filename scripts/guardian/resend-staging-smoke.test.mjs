import test from "node:test";
import assert from "node:assert/strict";
import { stagingEmailRequest, sendOneStagingEmail } from "./resend-staging-smoke.mjs";

const valid = Object.freeze({
  GUARDIAN_STAGING_SEND_APPROVED: "ONE_TEST_EMAIL_ONLY",
  SUPABASE_PROJECT_REF: "cfpiocofgmtbaelsfvnr",
  RESEND_TEST_TO: "account@example.org",
  RESEND_ACCOUNT_EMAIL: "account@example.org",
  GUARDIAN_FROM_EMAIL: "onboarding@resend.dev",
  RESEND_API_KEY: "re_fake_mock_only_01234567",
});

test("one and only one real-shaped sandbox POST can be built for the account mailbox", async () => {
  let calls = 0;
  const result = await sendOneStagingEmail(valid, async (url, init) => {
    calls++;
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(init.method, "POST");
    assert.equal(init.headers["Idempotency-Key"], "vwce-guardian-staging-2026-11-23");
    assert.equal(init.headers.Authorization, "Bearer " + valid.RESEND_API_KEY);
    assert.ok(init.signal);
    const data = JSON.parse(init.body);
    assert.deepEqual(data.to, [valid.RESEND_TEST_TO]);
    assert.equal(data.from, "onboarding@resend.dev");
    assert.match(data.subject, /TEST ONLY/);
    assert.doesNotMatch(init.body, /591[.,]95|trade_republic_pdf|IE000VAHT5T0|JWT|access_token/i);
    return { ok: true, status: 200 };
  }, "2026-11-23");
  assert.equal(calls, 1);
  assert.deepEqual(result, { acceptedByApi: true, httpStatus: 200 });
});

test("no network requests without arming, correct project, account recipient, sender and key", async () => {
  let calls = 0;
  for (const patch of [
    { GUARDIAN_STAGING_SEND_APPROVED: undefined },
    { SUPABASE_PROJECT_REF: "gylultvdyakhgjtyatbz" },
    { RESEND_TEST_TO: "different@example.org" },
    { GUARDIAN_FROM_EMAIL: "security@unverified.example" },
    { RESEND_API_KEY: undefined },
  ]) {
    await assert.rejects(
      sendOneStagingEmail({ ...valid, ...patch }, async () => { calls++; return {ok:true}; }, "2026-11-23"),
      /(staging_send_not_explicitly_armed|sandbox_recipient_not_verified|sandbox_sender_not_allowed|staging_resend_key_missing)/,
    );
  }
  assert.equal(calls, 0);
});

test("provider HTTP 403 and 429 are sanitized without retry or leaking recipient or key", async () => {
  for (const status of [403, 429]) {
    let count = 0;
    await assert.rejects(
      sendOneStagingEmail(valid, async () => { count++; return { ok: false, status }; }, "2026-11-23"),
      (err) => {
        assert.equal(err.message, "resend_staging_http_" + status);
        assert.ok(!err.message.includes(valid.RESEND_TEST_TO));
        assert.ok(!err.message.includes(valid.RESEND_API_KEY));
        return true;
      },
    );
    assert.equal(count, 1);
  }
});

test("network error performs no retry", async () => {
  let count = 0;
  await assert.rejects(sendOneStagingEmail(valid, async () => {
    count++;
    throw new Error("network failed");
  }, "2026-11-23"));
  assert.equal(count, 1);
});

test("request builder rejects malformed destination and UTC date", () => {
  assert.throws(() => stagingEmailRequest({...valid,RESEND_TEST_TO:"bad address"}, "2026-11-23"));
  assert.throws(() => stagingEmailRequest(valid, "not-a-date"));
});
