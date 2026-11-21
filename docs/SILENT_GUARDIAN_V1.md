# Silent Guardian V1 — server-side opt-in alerts (NOT enabled by merge)

## What actually runs outside the app

Supabase **pg_cron** runs once daily (UTC) and uses **pg_net** to POST to
`silent-guardian` Edge Function. The function validates a server-only
`GUARDIAN_CRON_SECRET`, reads *only opted-in cloud users*, checks their **synced**
transaction rows, and calls **Resend Email API** when a verified signal exists.
The PWA, iPhone and background push APIs are not part of execution.

**Email recipient:** the confirmed email on that same Supabase Auth account,
not a user-supplied third-party address. Messages contain no balances, account
references, personal names, amount or ISIN. The email links to the actual app.

V1 signals (only after opt-in):
1. A **new recorded sell transaction** in the cloud ledger. Wording never says
   the broker executed a sale; the ledger record is the only evidence.
2. **Possible duplicate import:** two distinct nondeleted rows created from
   `trade_republic_pdf` with the same nonempty `externalRef`; at least one
   row must be new since opt-in.

Silence: regular VWCE/VALL buys, temporary red days, returns, simulations,
missing contributions, stale local-only state, and missing fund/price data are
**not** sent. There is no broker integration and no TER/AUM/benchmark feed
in this feature. A missing synced VALL trade **does not prove** a missed Sparplan.

## Privacy, correctness and delivery limits

- Subscription is **OFF until a signed-in user with a confirmed email enables
  it** in Settings. Postgres RLS restricts the subscription to that user.
- No Dexie/IndexedDB access from Cron. Unsynced local data cannot be monitored.
- Alert receipts are server-only with a unique `(user_id,event_key)` key.
  At most **one summary email per user per scan**; the function deduplicates
  events across scans. An ambiguous provider failure is intentionally not
  retried automatically (at-most-once attempt, not guaranteed delivery).
- If `RESEND_API_KEY`, `GUARDIAN_FROM_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY`
  or `GUARDIAN_CRON_SECRET` is missing, it fails closed. Nothing is emitted.
- The service key is only ever available to the function in Supabase secrets.
  Never use `VITE_*`, GitHub plaintext variables, screenshots or client logs.
- Email sending is sensitive: a job can race with deactivation already in
  progress; the function rechecks the subscription before sending, but
  cannot revoke a message already accepted by an email provider.
- No ledger mutation, buy/sell automation, tax calculation or financial advice.
- Hosted Supabase schema/history reconciliation (H4/H5) remains a project
  release prerequisite. **Do not run migrations against hosted production
  from CI** or assume the service is live after merging code.

## Required owner-controlled deployment, after PR review

1. Reconcile hosted Supabase schema/migration history and run the **new 003
   migration** on an authorized disposable/staging project first. Verify
   `guardian_subscriptions` own-row SELECT/INSERT/UPDATE and that an
   authenticated client cannot read/write `guardian_alert_deliveries`.
   Stage a confirmed Supabase Auth user and synthetic transactions; never
   use household records for a dry run.
2. Register/verify a sending domain with Resend and provision its API key
   as a **Supabase Edge Function secret** `RESEND_API_KEY`. Set
   `GUARDIAN_FROM_EMAIL` to a verified sending address. Generate a high
   entropy random `GUARDIAN_CRON_SECRET` (32+ random bytes) and store
   it in **Supabase Edge Function secrets**. Supabase normally supplies
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions.
3. Deploy the function via the normal authorized Supabase workflow with
   `verify_jwt = false` only for `silent-guardian`: its **custom secret
   authentication** is mandatory. Ensure requests without the header return
   403 and all requests without POST return 405. Test with synthetic
   subscriptions before production.
4. Enable `pg_cron` and `pg_net` in Supabase. In **Vault**, create secrets
   `guardian_project_url` (e.g. https://<project>.supabase.co) and
   `guardian_cron_secret` (same value as the Edge `GUARDIAN_CRON_SECRET`).
   Schedule the job, for example:
   ```sql
   select cron.schedule('vwce-guardian-v1', '0 8 * * *', $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets
               where name = 'guardian_project_url') || '/functions/v1/silent-guardian',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-guardian-secret',
         (select decrypted_secret from vault.decrypted_secrets
          where name = 'guardian_cron_secret')
       ),
       body := '{}'::jsonb
     );
   $$);
   ```
   This runs once daily at **08:00 UTC**, but sends **zero** daily updates
   when nothing verified changed. Inspect `cron.job_run_details`, Edge
   runtime responses and **counts only**. Never log secrets or ledger rows.
   To stop: `select cron.unschedule('vwce-guardian-v1');`.
5. Only after staging success, authorize production migration/Edge deployment,
   create the production Cron job, and let the **owner** opt in inside
   Settings. Verify OFF state first, then synthetic positive/negative tests
   and exactly one email on the test account. An owner who has never opted in
   receives nothing.

## CI contract

- `deno check supabase/functions/silent-guardian/index.ts`
- `deno test supabase/functions/silent-guardian/rules.test.ts`
- existing npm/Vitest, TypeScript, locale, bundle, release, benchmark,
  Chromium/WebKit unchanged.
- GitHub Actions and Draft PRs **must not send an email**, apply hosted
  migrations, deploy an Edge Function or install a live Cron.

## Deferred / not implemented in V1

A true failed Trade Republic Sparplan determination needs verifiable broker
evidence, not an absent synced row. TER/AUM/tracking-difference alarms need
time-stamped official issuer/index source verification. Push notifications
would need a separate opt-in subscription and delivery design. None of these
are implied by this V1 implementation.
