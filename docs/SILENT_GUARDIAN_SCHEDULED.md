# Silent Guardian — scheduled server-side alerts (2026-11-21)

## What is actually monitored

Supabase runs a server-side daily ticket, independent of the PWA being open. Only **server-synchronized** rows are examined, for the one owner with active transactions at installation. It checks structural integrity of non-deleted `transactions`, `goals`, `app_settings`: ID consistency, amount numeric type, known transaction type and date formatting. Tombstones are counted but not reported as broken live records. **No claims about local Dexie / queued outbox, broker deposits, investment performance, taxes or backup completeness.**

The previous Resend sandbox delivery test is confirmed for the registered Resend account email. No domain required while recipient is restricted to that account.

## Architecture

1. `pg_cron` calls `guardian_internal.enqueue('scheduled')` at 07:15 UTC once daily.
2. `pg_net` calls `silent-guardian-worker` with an unguessable 256-bit, five-minute, **one-use** token. Only its SHA-256 digest is stored.
3. Worker uses a server-side Supabase service-role secret and invokes tightly granted `public.guardian_worker_claim` (only `service_role` has EXECUTE; client roles revoked). Claim is atomic, scoped to the configured owner, with SQL-side state and dedupe.
4. Alert **only after two consecutive daily 'review' scans**, never for healthy/incomplete snapshots. Max one accepted alert within 24h, and identical incidents held for 7 days. A reserved response remains blocked to prevent duplicate delivery if the worker crashes after Resend accepts the message.
5. Worker always sends ONLY to the fixed `RESEND_TEST_TO` secret, from `onboarding@resend.dev`, using Resend's `Idempotency-Key`; no sensitive investment figures in email. It acknowledges in `guardian_internal.deliveries`.

No financial-table writes. All new state lives in private `guardian_internal`. Public RPCs are secured by service-role-only grants; the HTTP worker is public only at the gateway level because it uses an independent one-time ticket; malformed/reused/expired requests return 401. Admin must never expose service role, Resend secret or ticket.

## Files and installation order

- `supabase/ops/silent-guardian-install.sql`: additive SQL, default **monitoring OFF** / **notifications OFF**.
- `supabase/functions/silent-guardian-worker/index.ts`: protected worker, deployed with `verify_jwt=false` (ticket-based authorization *within function*).
- `scripts/silent-guardian-server.test.mjs`: invariants checked by CI.

Install SQL on the confirmed hosted project via reviewed DDL migration. Deploy worker. Confirm `guardian_internal.config` has exactly one owner; otherwise stop. Run a **one-time selftest** with `select guardian_internal.enqueue('selftest')` as DB operator; verify `sent` result and actual inbox receipt. If selftest reports `failed`, stop before enabling auto notifications.

After successful selftest:

```sql
update guardian_internal.config
set monitoring_enabled = true, notifications_enabled = true
where singleton = true;

select cron.schedule(
  'vwce-silent-guardian-daily',
  '15 7 * * *',
  $$select guardian_internal.enqueue('scheduled')$$
);

-- One authorized first scan (same daily ticket kind; no financial writes):
select guardian_internal.enqueue('scheduled');

-- Check after delivery has been processed:
select last_scan_at,last_scan_status,bad_streak,monitoring_enabled,notifications_enabled
from guardian_internal.config;
```

If automated HTTP dispatch or RPC verification fails, turn notifications OFF and keep scanning only while investigating. Do not repeatedly call the selftest; it is limited to once per UTC date.

## Verification / observational limitations

- Confirm `cron.job` contains one named schedule.
- Confirm `guardian_internal.tickets` shows claimed daily jobs.
- Confirm `guardian_internal.scans` records a successful scan.
- Confirm `guardian_internal.deliveries` has one `sent` selftest.
- Confirm production rows `public.transactions`/`public.goals`/`public.app_settings` were not modified by the installation.
- A structural `pass_basic_checks` is **not** proof of complete data sync. Callers should not conflate it with a full financial audit.
- No synthetic corruption is injected into real family rows. The warning side requires dedicated disposable fixture testing before claiming production readiness for that scenario.

## Emergency stop

```sql
update guardian_internal.config
set notifications_enabled = false, monitoring_enabled = false
where singleton = true;
select cron.unschedule('vwce-silent-guardian-daily');
```

This leaves historical guardian logs and all financial rows untouched. If Cron scheduling fails, do not claim that outside-app monitoring is active. Keys remain exclusively in Supabase Edge Function Secrets.

## Privacy and costs

Provider API calls / scheduled executions count toward Supabase/Resend plan quotas. No domain costs for the restricted sandbox test recipient. No attachments, investment amounts, names or account identifiers appear in emails. The worker does not accept a destination email from caller.

Unlike a generic cloud heartbeat, this worker cannot know that an offline iPhone has pending Dexie changes; a device-side upload/heartbeat would be a separate opt-in feature.
