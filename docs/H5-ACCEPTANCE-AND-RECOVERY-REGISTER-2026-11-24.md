# H5 acceptance and hosted recovery decision register — 24 Nov 2026

**Scope:** review only; production metadata reads, synthetic CI, no production DDL/DML, secret changes, new real users, deploy, or MU2 implementation. H5 is PARTIAL for hosted recovery; local database and application/Auth recovery are PASS on tested candidate. Do not interpret green CI as production parity.

## 1. Evidence on 3a96ab09e10ef105859868f43be09e63fe6503bf

[H4/H5 run 45450844395](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/45450844395) completed SUCCESS; artifact 14947652738 (redacted evidence JSON).
- 17:41:19 UTC: catalog comparison PASS, parity=DRIFT.
- 17:41:20–23 UTC: full local logical archive and globals backed up; fresh isolated cluster restore PASS; exact catalog match.
- 17:41:23–25 UTC: row counts/fingerprints for Auth, six public tables and all eight private fixture tables match.
- 17:41:25–26 UTC: sequence, effective private RPC grants, SQL RLS and FK cascade PASS.
- 17:41:26 UTC: synthetic Gemini quota/cache RPC PASS, no external request.
- 17:41:46 UTC: both recovered accounts sign in with fresh JWT, real PostgREST owner read/write, cross-user and anonymous denial PASS.
- 17:41:47 UTC: all five evidence files validated.

Auth is not just SQL claim simulation: scripts/h5-full-recovery.sh:88–95 resets the disposable original stack and restores Auth users/identities and public table rows from the archive, verifies row fingerprints, then invokes scripts/h5-restored-http.mjs. Lines 15–16 signInWithPassword and verify actual session/user; lines 25–45 verify real authenticated data access and owner writes. Full logical restore uses a separate network-isolated cluster; HTTP recovery is a separate stage. No assertion that managed hosted sessions or external providers are recovered.

## 2. Hosted configuration inventory and recovery contract

Observed via Supabase read-only list/get Edge Function metadata and source comparison, plus read-only PostgreSQL catalog queries on 24 Nov. No secrets, private row values, provider calls or token contents collected.

| Hosted function | Version | Gateway JWT | Repo entrypoint at tested head | Decision |
|---|---:|---|---|---|
| gemini-vault-explain | 14 | true | Exact match | Recover from pinned repo source; keep off until prerequisites confirmed. |
| silent-guardian-worker | 5 | false | Exact match | Recover source; ticket authorization in worker is mandatory; no schedule/dispatch until verified. |
| silent-guardian-health-check | 7 | true | Different (4775 vs 2828 bytes; normalized text differs) | BLOCKED: review source drift; archive reviewed hosted code or intentionally supersede in separate approved PR. |
| silent-guardian-email-test | 7 | true | Different (277 vs 467 bytes; both retired indicators) | Preserve retirement behavior; record exact reviewed stub or explicit retirement decision; do not reactivate. |
| silent-guardian-e2e-test | 6 | true | Missing entrypoint in repo; hosted source has retirement indicator | Hosted-only retired test; record retirement/tombstone, do not redeploy without explicit decision. |

Bundle fingerprints from metadata (not credentials): gemini c0524bb08bdb720b55925921a9f9bb6b43145959fc6e58e8e56202e36f2109f8; worker a872777acb58e182af963661ce9f9e05cb3f3033098712b23bdaf63cd4166683; health d060242ad9bd615e92db52773315d012745b2d425ae2a1bb0bef1dd2ba1a071c; email-test 960c7726e2369c3d28b680d5e2a236dcd3f1d2990abc7eee92f44217a195a143; e2e b07bc736e40d10b77ee9bf6139480f41416a5d33ea24a4b0b6bcbb64918af45c. Hosted functions ACTIVE is gateway/deployment status, not proof of business availability or a reason to invoke retired endpoints.

| Component | Reproducible source | Hosted-only or unknown; how to capture safely |
|---|---|---|
| Database engine | supabase/config.toml local PG15; 001/002 | Hosted PG17.11. Record engine/extension versions; rehearse using matching supported engine, do not overwrite current local baseline just to pass. |
| Extensions | Ops SQL references pg_cron/pg_net | Observed pg_cron 1.6.4, pg_net 0.20.4, pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.1, uuid-ossp 1.1. Record supported target versions; managed extension ownership/platform configuration not restored by repo alone. |
| Auth | Local config: signup true, email confirmation false, localhost site URL, Inbucket; app Auth flow | NOT hosted settings. Owner captures non-secret Site URL, redirect allowlist, email/password signup/confirmation, providers, JWT expiry/session/MFA policies, rate limits, SMTP provider/template settings (no credentials). Restore separately and test password recovery, sign-in/out, refresh, isolation on synthetic accounts. |
| API | Local public/graphql_public schemas, extra search path public/extensions, max_rows 1000 | Hosted exposed schemas, max rows, pooler/network settings unverified. Owner exports non-secret settings and reviews effective privileges; never expose private schemas. |
| Secrets | Code references GEMINI_API_KEY, GEMINI_ASSISTANT_ENABLED, RESEND_API_KEY, RESEND_TEST_TO; Supabase-managed SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_SECRET_KEYS fallback | Record names/purpose only; actual values, enable state and presence not inspected. Recover/reissue keys from owner-controlled password manager or provider, configure via approved secret store, never Git/log/JSON evidence. GEMINI_TEST_MODE and GEMINI_TEST_API_BASE are test-only; must not enable in hosted. |
| Guardian schedule | docs/SILENT_GUARDIAN_SCHEDULED.md | Observed named cron job vwce-silent-guardian-daily active, 15 7 * * * (07:15 UTC per runbook); command matches expected enqueue. Restore disabled first, rebind reviewed owner, invalidate old tickets and assess delivery dedupe before enabling. No cron command execution in this review. |
| Storage | local storage disabled | Hosted bucket/objects/settings unknown. Owner inventory bucket names/policy/settings without contents; independently back up object bytes if used. A DB dump is not a backup of external object storage. |
| GitHub Pages / client | repo build/workflow, auth/sync code | Owner records deployment URL, environment/variable names, redirect binding, public project endpoint and public key reference; do not copy private keys. |
| External services | Google model identifiers and quotas, Guardian Resend behavior documented | Billing limits, provider account ownership, approved recipient, actual keys only in owner-controlled records. Restore disabled; provider calls/selftest require separate authorization. |

No available connector action for hosted Auth settings/Edge secret inventory or full managed-service configuration export in this session; user/dashboard export of nonsecret fields is required. Do not infer production configuration from local config. Suggested owner worksheet: record item, observed setting, date, capture source, recovery action, verification, dependency, responsible owner; use a private encrypted location for sensitive settings. No new project created or paid infrastructure provisioned.

## 3. Drift decisions (not execution)

Evidence: docs/evidence/h5-hosted-catalog-2026-11-24.json, scripts/h5-schema-inventory.sql, h5-catalog-diff.json from CI above. Catalog comparison reports changed rows as hosted-only/local-only, not number of missing objects. Repository ordered migrations remain 001/002 untouched. This review explicitly prohibits policy edits; future migration 003 below is a proposed separate owner-approved schema-parity workstream, not an executable migration or permission to apply it.

| Drift | Decision | Acceptance / rationale |
|---|---|---|
| FORCE RLS (six public tables) | Proposed 003: codify hosted hardening | Retain FORCE RLS, do not weaken production. Review signup SECURITY DEFINER owner behavior and RLS tests in isolated fresh install + upgrade. |
| 23 per-operation authenticated policies vs eight combined policies | Proposed 003: codify operation-specific owner-only access | Match tested hosted semantics, both USING and WITH CHECK on UPDATE; no membership policy. Verify anon/other user deny and owner CRUD with real JWT. No policy change in #427. |
| Five user_id defaults auth.uid() | Proposed 003: codify after review | Owner-scoped default with unchanged NOT NULL/FK and composite key; test omitted user_id and forged ownership. |
| 21 vs 11 public indexes | Record intentional target exception: redundant hosted indexes, not necessary to replicate | Six PK + five distinct user/updated indexes are canonical. Five duplicate unique PK and five equivalent user/updated indexes retained on hosted for now; exact catalog diff remains. Removing them requires dependency/performance review and separate approval. |
| 4 Gemini + 4 Guardian private tables and RPCs | Operational install separate by design, not automatic 003 | Repository ops scripts are explicit owner-approved deploy operations. #427 synthetic recovery verifies equivalent private table structures/state, excludes dispatch and managed jobs. Future reproducible sanitized install manifest and controlled production parity review; preserve quotas, no provider calls. |
| Hosted migration ledger five timestamp versions vs local 001/002 | Historical drift, not proven intentional equivalence | Preserve both ledgers; map each timestamp to reviewed SQL and historical evidence, including synthetic exercise, record checksums and reconcile only via separate approved forward plan. Never fake migration entries, reset, or replay manual ops blindly. |
| Routines/constraints and table grants | Review in proposed 003/security plan | CI exact diff: constraints 21 hosted-only/changed; routines 11/2; triggers exact match; public grants equal baseline in catalog diff, not necessarily least privilege. |
| Engine / managed settings | Target-specific exception; explicit recovery manifest | Local PG15 vs hosted PG17.11, managed Auth/API/storage config and service code drift remain distinct from schema. |

Read-only effective privilege query confirms has_table_privilege(...,'TRUNCATE') = true for both anon/authenticated on all six public tables (12 checks). RLS does not protect TRUNCATE; Data API exposure of this operation is NOT proven, no destructive probe attempted. Treat as a least-privilege review gate before MU2; review inherited/schema/routine grants including trigger functions, explicitly approve any REVOKE separately. Do not assert vulnerability exploitation or modify production. Retain service-role-only Gemini/Guardian RPC behavior.

Proposed 003 acceptance: pinned target engine, isolated clean/upgrade fixture, no real data, same owner-only semantics, exact intended catalog except documented duplicates/operational scope, real JWT matrix plus effective grant checks, full recovery and rollback rehearsal. Only after approval create actual migration candidate using reviewed baseline/history and supported tooling; no migration application on hosted under #427. Restore/rollback strategy forward-only; never reset production or overwrite existing ledger.

## 4. Final acceptance matrix

| Gate | Status | Evidence |
|---|---|---|
| H4 owner / other account / anonymous on local baseline | PASS | H4 behavioral workflow 45450844395 |
| H4 hosted catalog read | PASS (inventory only) | JSON snapshot; not hosted behavioral proof |
| H4 hosted policy/grant parity | PARTIAL | DRIFT; effective TRUNCATE grant review open |
| H5 migration 001/002 guard, blank install, sample upgrade | PASS local | Workflow 45450844395 |
| H5 full local logical DB + globals restore | PASS local | 17:41:23 UTC |
| H5 row equality, version, tombstone, FK, RLS | PASS local | 17:41:23–26 UTC |
| H5 private synthetic AI/Guardian state, sequence, server RPC ACL | PASS local | 17:41:24–26 UTC |
| H5 fresh Auth sign-in and PostgREST after restore | PASS local | 17:41:46 UTC; h5-restored-http.mjs |
| H5 hosted inventory and drift decisions | PASS review | This register + captured catalog |
| H5 hosted schema/history reproducibility | PARTIAL | 003 proposal, provenance and grants review pending |
| H5 hosted configuration recovery | PARTIAL | Engine, Auth, Storage/API, Edge source drift, secrets and provider verification pending |
| H5 actual hosted disaster recovery | NOT TESTED / PARTIAL | No hosted restore performed; owner-approved isolated target and matching settings needed |
| H5 overall | PARTIAL | Cannot mark hosted recovery PASS from synthetic proof |
| MU2 | DESIGN ONLY | ADR-MU1; no code or live membership/permission changes |

Owner approval gates: (1) review #427 evidence and decisions; (2) separately approve actual 003 candidate and nonsecret configuration capture/Edge source reconciliation; (3) demonstrate parity and recovery with synthetic data, matching managed-service settings as far as feasible; (4) only then approve MU2 separately. No automatic production actions. Tax/sole-authoritative-ledger readiness remains independently gated.
