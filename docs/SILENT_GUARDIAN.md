# Silent Guardian — server-side pilot (2026-11-21)

## Status / scope

**PILOT ONLY — read-only manual checkpoint, no background monitor or production email alerts.**

The owner confirmed a one-time Resend sandbox email arrived at their own account address using the Supabase project **Kế hoạch cho con** (`gylultvdyakhgjtyatbz`). The sender was `onboarding@resend.dev`. This proves only the mail transport, not automated delivery.

The proof-of-transport Edge Function `silent-guardian-email-test` is now **retired (HTTP 410)**; the checked-in source matches that fail-closed state. Never re-enable its old unbounded JWT-triggered email endpoint.

The production Supabase project also has an *earlier standalone* version of `silent-guardian-health-check` deployed. This PR version extracts the deterministic checks into a testable shared module; **merging the PR does not redeploy the Edge Function**, and GitHub Pages alone cannot activate server functions.

## Read-only contract

- Requires `GET`, a real signed-in user's Bearer JWT, and the Supabase gateway with `verify_jwt=true`.
- Verifies identity via `/auth/v1/user`, scopes all PostgREST reads to the verified user ID, and uses that same JWT so per-user RLS applies.
- Reads ONLY `transactions`, `goals`, and `app_settings` columns `id,data,deleted_at`. No DB inserts, updates, deletes, service-role bypass or email calls.
- Counts active records separately from sync tombstones; deleted rows are **not** treated as corrupt live investments.
- Reports basic structural issues: row ID vs JSON ID, amount numeric type, known transaction type, ISO calendar date validity.
- All results are aggregate counts; no transaction notes, names, IDs, email addresses, API keys or balances in the response.
- If a domain reaches 1000 rows it returns `incomplete` rather than claiming a comprehensive audit.
- If the server read fails or authentication is missing, it fails closed; no green health claim.
- An empty or structurally valid cloud snapshot **does not prove local Dexie is synchronized**, does not prove a deposit was received and does not validate trading economics, tax, FIFO or balances.
- Not adding a `cash_in` for every security purchase is intentional: VWCE Vault supports securities-first bookkeeping, so this is not a health anomaly by itself.

## Verification

```sh
npm run test:guardian
npm test
npm run build
```

Edge smoke (owner session; never paste the JWT into issue, PR, logs, or screenshots):

1. Check Edge Function JWT enforcement is enabled.
2. Call `GET /functions/v1/silent-guardian-health-check` with an authenticated user JWT.
3. Expect `ok: true`, `mode: read_only`, `notificationsEnabled: false`, `status: pass_basic_checks|review|incomplete`.
4. Request without JWT must return 401 or an upstream auth rejection.
5. `POST` must return 405 for an authenticated request; revoked email-test must never send and should return HTTP 410 when authorized.
6. Inspect only sanitized status/aggregated counts; do not dump family data.

## Why no Cron job in this PR?

A 24/7 alert requires several additional verified pieces: trusted server-only scheduling, a server-only job credential, **idempotent and rate-limited** alert state, status transitions (repeated failure vs recovery), and testing with synthetic data on staging. Directly scheduling the current owner-JWT checkpoint would be insecure and incorrectly claim that an offline local-first PWA is synchronized.

The existing Resend sandbox account can **only** send to its own allowed recipient until the sender domain is verified. Do not provision a domain just for this pilot; no real-user mail blast or generic recipient field should be added.

### Activation gates for a later PR

1. Implement a separate service-only scheduled worker with its own authorization and minimum privileges; no owner JWT inside a database job.
2. Use a private alert-state store with unique event fingerprints, daily limits and explicit recovery handling; do not mutate financial tables.
3. Prove scan completeness, RLS, multi-owner isolation, tombstone behavior and fail-closed handling using disposable fixtures (not live family data).
4. Configure Supabase Cron + Vault (or an equally secure dedicated scheduler), with a bounded daily schedule and logs; do not put keys in repo or PWA.
5. Verify exactly one warning from a synthetic fault and zero repeats, verify recovery, then opt in to real notifications to the account's verified Resend test address.
6. Only then describe Silent Guardian as an autonomous outside-app monitor.

## Operational boundaries

- No GitHub Pages/PWA UI changes, no local Dexie schema changes, no database migrations or production financial-data writes.
- `RESEND_API_KEY` and `RESEND_TEST_TO` remain Supabase Secrets; never commit or paste them into build-time `VITE_*` variables.
- Production deployment of this PR's new function source must be a **separate, explicitly verified** Supabase operation after CI.
- Roll back by redeploying a previous reviewed function, never by enabling unbounded email triggers.
