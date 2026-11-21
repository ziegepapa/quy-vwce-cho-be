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
- **Server readiness is OFF by default**, independently of user opt-in. Only a
  privileged operator can set `guardian_service_status.active=true` after a
  verified deployment. The UI disallows enrollment when inactive and the Edge
  function will not send even if older opt-in rows exist.
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
   create the production Cron job, and verify the default **inactive** status.
   After confirming an authorized staging test email and readiness on production,
   a privileged owner can activate the server gate with:
   ```sql
   update public.guardian_service_status
      set active = true, updated_at = now()
    where id = true;
   ```
   This must never run from CI or a PWA session. Only then can a confirmed
   user opt in in Settings. To suspend all mail independently of consent:
   `update public.guardian_service_status set active=false where id=true;`
   and `select cron.unschedule('vwce-guardian-v1');`.
   An owner who has never opted in receives nothing.

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

## Reliability / self-heal — Draft PR only, NOT activated

Before touching this PR we reviewed `docs/OPERATIONS_RUNBOOK.md` §14.5, the
existing `production-health.yml`, the device-local diagnostics allowlist, and
the event-key delivery ledger. We did **not** locate the claimed server-side
"3 retries + ntfy diagnostic reporter" implementation in this branch. This
section describes new, explicit V1 hardening, not an already operating service.

### Bounded retries and failure handling

- Supabase **read-only GET requests only**: first call + **up to 3 retries**
  after 600ms, 1800ms, and 5400ms for transport faults, HTTP 408/425/429
  and 500/502/503/504. 400/401/403/404 and other nontransient errors stop
  immediately. Each attempt uses a 9-second timeout.
- Writes to alert receipts and Resend email POSTs do **not** get implicit
  retries. Resend may have accepted a timed-out POST; reissuing it blindly can
  duplicate a private alert. The existing unique (user,event_key) ledger and
  per-event idempotency key stay authoritative. Manual investigation is needed
  for ambiguous provider outcomes.
- Fatal or partial runs record an **allowlisted server diagnostic**
  (`guardian_run_health`) with `last_started_at`, `last_succeeded_at`,
  `last_failed_at`, `last_outcome`, `last_error_code`, and
  `failure_streak`. No transaction IDs, account IDs, emails, balances,
  secrets, exception traces or raw ledger payloads enter the heartbeat.
- A run with partial errors is `degraded` and does **not** advance
  `last_succeeded_at`. A crashed/disconnected worker that cannot write
  diagnostics leaves that last-success timestamp stale, which the independent
  watchdog can detect. Running while the readiness gate is OFF records
  `disabled` and never sends email.

### Who watches the watcher?

Reuse the existing `Production Health` GitHub workflow (not a second ledger
monitor). Its independent `guardian-watchdog` job is **unarmed** by default,
has no service-role key, and performs only an authenticated aggregate GET to
`/functions/v1/silent-guardian`. It marks unhealthy when:

- the active service cannot be reached or its status endpoint rejects a request;
- the service was expected active but reports inactive;
- there has been no successful completed scan for **more than 36 hours**;
- two consecutive scheduled runs were degraded/failed.

It POSTs one privacy-safe operational warning per scheduled GitHub workflow run
to **ntfy**, independently of Resend. The current Production Health schedule is
once daily at 05:17 UTC; the 36-hour threshold is evaluated at each run, **not
continuously**. A missing Guardian run may therefore be detected only on a
later daily check. GitHub itself can miss a scheduled run: this is not a
guaranteed dead-man switch. Owner must evaluate an additional external uptime
service if a GitHub outage must also be covered. No recovery notification or
provider failover is claimed as implemented here.

After Merge and **individual owner approvals**, the operator provisions:

| Setting | Place | Purpose |
| --- | --- | --- |
| `GUARDIAN_WATCHDOG_SECRET` | Supabase Edge Secrets **and** GitHub Actions Secret | Separate random 32+ character read-only health token; never reuse `GUARDIAN_CRON_SECRET` |
| `GUARDIAN_WATCHDOG_URL` | GitHub Actions repository variable | `https://<project>.supabase.co/functions/v1/silent-guardian` |
| `GUARDIAN_NTFY_URL` | GitHub Actions Secret | Private authenticated ntfy topic endpoint; do not expose topic in client app |
| `GUARDIAN_NTFY_TOKEN` | GitHub Actions Secret | ntfy topic publish token |
| `GUARDIAN_WATCHDOG_ENABLED` | GitHub Actions repository variable | `true` **only after** complete authorized deployment and first successful Guardian run |

The GitHub watchdog does not touch the financial ledger, cannot send Resend
email, and cannot invoke the Cron POST (its secret differs). On a failed check
it sends ntfy and marks the GitHub Action red; no automated redeploy, mutation,
secret rotation, or cron manipulation follows. For manual `workflow_dispatch`
runs, it **does not** send ntfy by default, preventing accidental notification
loops. Before owner activates the variable, it reports
`guardian_watchdog_not_armed` and does not make HTTP requests.

### Operator diagnostic and incident runbook

1. Observe `Production Health` → `guardian-watchdog` job; note only the
   generic error code and UTC run time. No finance data needed.
2. Compare protected heartbeat `public.guardian_run_health` (server/admin
   only), `cron.job_run_details`, and Supabase Edge Function invocation logs.
3. If only Resend fails: inspect Resend domain/sender/quota and the reservation
   receipt counts; **do not rerun ambiguous sends**.
4. If Cron stopped: review schedule + `pg_net` response; owner must separately
   approve any restart/replacement.
5. For mobile-only missing sync: open Sync Health and local diagnostics on the
   iPhone, then resolve conflict explicitly. Guardian cannot inspect offline
   Dexie and must not create or correct a financial transaction.
6. On suspected data danger, fail closed; do not clear IndexedDB, edit
   financial tables, replay a production import or claim recovery without
   proof. See `OPERATIONS_RUNBOOK.md` §13.

### Verification before Merge and deployment

- Deno check + rules/retry unit tests; Node watchdog tests; existing
  type-check, locale audit, `npm test`, production build, release/bundle
  checks, benchmark, Chromium/WebKit review, H4/H5 synthetic RLS and restore.
- UI review: real PR preview URL + artifact showing a 390×844 screenshot.
- Staging-only E2E with synthetic confirmed account, consent, verified sale,
  duplicate PDF reference, transient GET failure, authorization failures,
  ntfy watchdog alert, Resend ambiguous response, and cleanup afterward.
- **No GitHub workflow or PR test may send real notifications or create a
  production schedule.** Production migration, Edge deploy, credentials,
  cron enablement and real opt-in are separate owner approval gates.
