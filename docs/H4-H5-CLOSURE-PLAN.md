# H4/H5 closure plan — controlled evidence only

**Updated:** 2026-10-22  
**Production baseline reviewed:** `bd163ad296b2b4df944688f86974da8724113d52`; [Test and Deploy run 39672705971](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/39672705971) and [Production Health run 39761903168](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/39761903168) succeeded. These are release/health evidence only, not H4/H5 proof.  
**Decision:** PR #363 has a successful isolated H4 behavioral matrix and H5 blank-install run at candidate head `330ba04eaca0d1f147e7d6695392c73879e99cb1`. H4 is evidenced for the repository schema/policies on that disposable stack; H5 is **PARTIAL**, because upgrade/schema-drift and recovery/rollback gates have not run. The branch is not yet merged, and no hosted production database was changed or verified.

## Evidence scaffolding status — 2026-10-22

Candidate branch: `readiness/h4-h5-evidence-ci-2026-10-22`, based on the verified main commit above; PR [#363](https://github.com/ziegepapa/quy-vwce-cho-be/pull/363) remains open.

### Latest executed evidence

- **Workflow:** [H4 H5 Evidence run 39830035462](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/39830035462) completed successfully at head `330ba04eaca0d1f147e7d6695392c73879e99cb1` on 2026-10-22. Both `H5 migration order guard` and `H4 behavioral RLS + H5 blank install` succeeded; the second job started/checked/stopped disposable local Supabase, ran `supabase db reset --yes`, checked the RLS catalog, executed the Auth/PostgREST matrix, and uploaded redacted evidence artifact `h4-h5-evidence-39830035462` (artifact ID `12448302319`).
- **H4:** `PASS — candidate branch, isolated local behavioral matrix`. This covers the six repository tables plus `profiles`, using synthetic users A/B, anonymous requests, forged owner IDs, denied cross-user mutations, invalid JWT, and user-deletion cascade checks. This does not establish parity with the hosted production database, which was not accessed.
- **H5:** `PARTIAL — blank install and migration order guard passed`. Baseline comparison and clean replay passed; controlled upgrade, hosted schema drift, backup/restore and rollback/recovery tests are still open.
- **Readiness:** do not mark the whole project READY or sole-authoritative. The PR is not merged and P11.2 still needs independent German tax-expert review.
- **No production writes:** the workflow must only use the Supabase stack started in the GitHub runner. Do not add production project references, credentials or family data.
- **Readiness:** remains `CONDITIONAL — NOT READY` as the sole authoritative financial record until all independent gates, including the tax expert-review boundary, are satisfied.

## Guardrails

- Use an ephemeral, isolated Supabase local stack or a disposable non-production project explicitly approved for this purpose.
- Use synthetic users and records only. Never point test scripts at production by default; do not copy family data.
- Never expose service-role keys, user passwords, access tokens, refresh tokens or raw auth responses in logs/artifacts.
- A test must fail closed if its target URL is not localhost or an explicitly allow-listed disposable project.
- Do not edit production database state or mark a gate complete from static SQL inspection, unit tests, or a green frontend build alone.
- Preserve the current local-first app contract, existing sync semantics and owner-controlled recovery behavior.

## H4 — Behavioral RLS proof

### Phase H4.1 — Prepare a disposable test environment

1. Install a pinned Supabase CLI version in CI and use the runner's disposable Docker environment; check available disk/RAM before starting the stack.
2. Add a reviewed `supabase/config.toml` with local-only ports and no production URL/project reference.
3. Start the local stack, apply the ordered migration tree, and verify Auth, PostgREST and PostgreSQL health checks before testing.
4. Provision two synthetic users (A and B) through the local Auth test path. The service-role key may be used only by the fixture bootstrap in the isolated runner; behavioral assertions must use each user's real JWT and the anonymous key.

### Phase H4.2 — Required request matrix

For every table below — `profiles`, `app_settings`, `goals`, `transactions`, `annual_checklists`, `monthly_snapshots` — run authenticated REST requests, not only SQL statements:

| Principal / operation | Expected result |
|---|---|
| User A selects/inserts/updates/deletes A's own row | Allowed where table policy grants the operation |
| User B selects A's row | No row disclosed |
| User B updates/deletes A's row | No A row changed; assert by re-reading as A |
| User B inserts a row claiming A's `user_id` | Rejected by `WITH CHECK` |
| Anonymous selects protected data | No private row disclosed |
| Anonymous insert/update/delete | Rejected |
| User A accesses B's data and vice versa | Isolated in both directions |
| Signup profile trigger and user deletion cascade | Expected profile creation/cleanup verified |
| Expired/invalid token and malformed principal | Rejected without mutation |

Also assert RLS is enabled on every intended table, expected policies are installed, and no client bundle contains a service-role credential. Keep response bodies redacted; persist only case ID, HTTP status, boolean assertions and commit/run identifiers.

### H4 acceptance gate

H4 can be changed to **PASS — BEHAVIORAL RLS VERIFIED** only when:
- the isolated stack starts from a clean runner without production credentials;
- the complete matrix passes for all six tables and both users;
- cross-user and anonymous denial assertions include post-request state checks;
- CI retains redacted machine-readable evidence and the exact CLI/schema/commit versions;
- a reviewer confirms no test bypasses RLS with a service-role request;
- the failure path proves tests stop before any request if target isolation checks fail.

If the environment cannot start, mark **BLOCKED — ENVIRONMENT**, attach only sanitized diagnostics, and do not downgrade expected tests.

## H5 — Ordered migration baseline and upgrade/rollback reproducibility

### Phase H5.1 — Establish the migration contract

1. Reconcile `supabase/schema.sql` (historical manually applied baseline) with the current database objects and current `002_soft_delete_and_triggers.sql`. Produce an object-level diff for tables, columns, constraints, indexes, RLS, policies, functions and triggers.
2. Author `001_initial_schema.sql` from the reviewed baseline, preserving Supabase-managed `auth.users` / `auth.uid()` dependencies; do not create fake Auth functions or a plain-Postgres surrogate.
3. Apply `001` then `002` to a blank local Supabase database. Assert exact expected schema objects and rerun checks for policy/trigger presence.
4. Define how an existing manually provisioned project would be reconciled with migration history. Do not run `migration repair`, reset, push or destructive DDL against production as part of this work.

### Phase H5.2 — Upgrade and recovery matrix

| Scenario | Required evidence |
|---|---|
| Blank database → latest | Ordered migrations apply cleanly from zero |
| Pre-002 synthetic database → latest | Upgrade applies only the expected changes and preserves representative rows |
| Re-apply / drift detection | CI catches unexpected schema drift; no duplicate policies/triggers |
| Backup of synthetic rows → restore to fresh isolated stack | Data and key constraints compare exactly |
| Failure during an upgrade | Test stops safely and reports the failed migration |
| Rollback / recovery | Use a disposable database snapshot/restore drill or reviewed forward-fix plan; do not claim automatic down-migrations where none exist |
| Existing production project | Separate owner-approved change plan, reviewed diff and backup before any history reconciliation; not part of CI's destructive path |

### H5 acceptance gate

H5 can be changed to **PASS — MIGRATION REPRODUCIBLE** only when:
- the initial migration is reviewed against the historical SQL baseline;
- blank apply and representative upgrade pass on the full Supabase stack;
- schema/object assertions and synthetic data preservation pass;
- backup/restore plus the documented recovery path is rehearsed;
- the existing-project reconciliation plan is explicit and reviewed;
- logs record migration hashes, CLI version, commit and run ID, without secrets.

A new `001` file alone is not sufficient evidence. A plain PostgreSQL run without Supabase Auth/PostgREST is not sufficient evidence. No production migration history or schema is modified by this plan.

## Execution order

1. **H5 inventory and baseline review** — no production changes; reconcile SQL and identify the precise expected schema.
2. **H4/H5 isolated harness** — provision local Supabase in CI and make the complete request/migration matrix reproducible.
3. **Run and retain evidence** — attach sanitized artifacts to CI and update `docs/LONG_TERM_READINESS.md` only after review.
4. **Separate production adoption decision** — if desired, plan any reconciliation as its own reviewed change after backup and explicit owner approval.

Until all acceptance gates are met, the product remains a local-first tracker with external broker statements and owner-controlled backups; it must not be represented as the sole authoritative financial record.
