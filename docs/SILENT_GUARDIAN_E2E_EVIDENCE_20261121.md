# Silent Guardian — synthetic E2E evidence, 2026-11-21

**Result: PASS for isolated, server-to-server synthetic alert flow.**
**NOT a mutation test of production financial records.** Test endpoints and schema were retired/cleaned up after verification.

## Test setup

- Project: Supabase `gylultvdyakhgjtyatbz`.
- Isolated schema: `guardian_e2e`, denied to `anon` and `authenticated`; service-role-only RPC access.
- One live synthetic transaction with deliberately invalid text `amount`; one synthetic deleted record; one synthetic goal and settings row.
- Dedicated Edge Function `silent-guardian-e2e-test`, independent one-use 256-bit tokens with SHA-256 stored digest.
- Only `RESEND_TEST_TO` sandbox recipient, with conspicuous `TESTWARNUNG` subject/body.
- Exercise capped at four invocations, and all test-only data and RPCs removed afterward.

## Observed server results

| Scan | Fixture | Status | Streak | Server decision | Email |
| --- | --- | --- | ---: | --- | --- |
| 1 | Invalid numeric amount | review | 1 | noop | 0 |
| 2 | Same invalid amount | review | 2 | send | Resend accepted 1 |
| 3 | Same invalid amount | review | 3 | deduplicated | 0 additional |
| 4 | Fixed synthetic amount | pass_basic_checks | 0 | noop | 0 additional |

- `guardian_e2e.deliveries` recorded **exactly 1 `sent`** before cleanup.
- pg_net returned HTTP 200 for requests 3, 4, 5 and 6.
- No impact on live user tables: public transactions **22** before and after; goals **12**, settings **2** after.
- Production Guardian config remained `monitoring_enabled=true`, `notifications_enabled=true`, `bad_streak=0`, `last_scan_status=pass_basic_checks`; **one active daily cron**.
- Test Edge Function redeployed to **HTTP 410 retired** with JWT verification on; all synthetic `guardian_e2e` schema and exposed test RPCs deleted.
- The migration record for setup may remain in Supabase migration history even though its disposable schema is removed.

## Evidence limitations

- The E2E simulated rule engine intentionally mirrors the production rule set, but used **a separate test RPC** and a separate test Edge Function; it is not a destructive injection of errors through production tables.
- Resend's provider acceptance and sent ledger were verified; human inbox arrival of this specific synthetic alert still requires confirmation.
- We did not simulate provider timeouts, simultaneous workers, daily clock rollover, seven-day dedup expiry, or an offline iPhone's pending Dexie outbox.
- No test email included actual investment balances, names or transaction data.

**Safety:** Do not deploy the fixture-creation SQL from this test branch into any real ledger. Production cron and notifications remain active.
