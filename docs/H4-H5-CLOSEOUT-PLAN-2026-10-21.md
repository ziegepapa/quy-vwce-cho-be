# H4/H5 Closeout Plan — 21 October 2026

## Decision and guardrails

**Current decision: OPEN — H4 partial, H5 blocked.** This plan is executable once the owner approves an isolated, disposable, synthetic-data-only Supabase environment. It does not treat frontend CI, static policy inspection, a plain PostgreSQL server, or production catalog inspection as behavioral proof.

Hard constraints:

- Never create a paid Supabase project/branch without explicit owner approval.
- Never use production/family records, tokens, accounts or database writes as fixtures.
- Never expose service-role credentials to the browser, repository, CI logs or test artifacts.
- No schema, migration, sync, backup or ledger changes in the planning/evidence refresh itself.
- Do not mark either gate closed until its exit evidence is retained and reviewed.

## Workstream H4 — request-level RLS proof

### H4.0 — Environment gate

**Owner decision required:** choose one of:
1. Supported Supabase local development stack with Docker and Supabase CLI, on a host that meets current resource requirements; or
2. An explicitly approved isolated disposable Supabase development environment, with cost and deletion date acknowledged.

No work may progress to behavioral tests until the environment is documented as isolated, disposable and synthetic-only. Record CLI/runtime versions, startup result, environment identifier (redacted/non-secret), creation time and planned deletion time. Do not copy production rows or production JWTs.

### H4.1 — Deterministic fixtures and request path

Create only synthetic principals: User A, User B and anonymous. Seed unique marker rows through supported Auth/API setup. Execute tests through the same published Auth/JWT/PostgREST request path used by the client; do not substitute service-role reads or a simulated role.

Test every current sync collection:
- `profiles` (owner key `id`)
- `app_settings`
- `goals`
- `transactions`
- `annual_checklists`
- `monthly_snapshots`

For each applicable collection, retain pass/fail for:
- A can read/create/update/delete A-owned fixtures.
- B can read A's rows only if the policy explicitly allows it (expected: no); B cannot update/delete A's rows or insert a row claiming A as owner.
- Anonymous cannot read or mutate private rows.
- Owner key is enforced on both existing-row predicates and new-row checks.
- Auth-user deletion/cascade behavior matches the documented contract, using disposable principals only.
- The client-facing sync/auth flow succeeds for the owning user and fails closed for the other principal.

Do not infer success from a row count alone: verify response status and that fixture values remain unchanged after rejected operations.

### H4.2 — CI artifact and exit criteria

Add a repeatable test command to CI only after the environment path and secrets handling are approved. CI must fail on any unexpected cross-owner result. Artifact must contain matrix results, runtime versions, policy/table inventory and redacted request outcomes, but no JWTs, emails, user payloads or secret values.

**H4 can close only when all are true:**
- The complete matrix above passes through real synthetic principals.
- A deliberately broken owner policy causes the test to fail (negative control).
- No test touched production or family data.
- Test environment cleanup is verified.
- A reviewer reconciles tested tables/policies with the current schema and source inventory.
- `docs/H4-RLS-EVIDENCE.md` links to the exact CI run/artifact and records limitations.

Until then: `PARTIAL — STATIC POLICY EVIDENCE ONLY`.

## Workstream H5 — ordered migration and upgrade/rollback reproducibility

### H5.0 — Inventory and canonical-schema decision

Do not write a migration based only on the current manual bootstrap SQL. First compare:
- `supabase/schema.sql` (manual bootstrap reference);
- all files under `supabase/migrations/`;
- current table, constraint, index, policy, function and trigger inventory available through approved read-only evidence;
- the client sync contract and H4 policy inventory.

Produce a reviewed difference table. Identify whether the canonical empty-install schema can be reconstructed entirely from repository-owned artifacts. Any unexplained production/environment-only object is a stop condition; do not fetch or dump family data to fill the gap.

### H5.1 — Migration baseline proposal

Only after H5.0 review, propose a numbered initial migration (for example, `001_initial_schema.sql`) and retain the existing `002_soft_delete_and_triggers.sql` only if the ordered replay proves its assumptions are valid. The actual migration files are a separate implementation PR, not part of this documentation/UI PR.

The proposal must account for:
- Auth-managed dependencies such as `auth.users` and `auth.uid()` using the supported Supabase stack, not local stubs.
- All six sync tables, primary/foreign keys, constraints, indexes, RLS enablement and policies.
- Functions/triggers and soft-delete/version semantics.
- Idempotence expectations and duplicate-object behavior.
- Exact source of truth and migration ownership after rollout.

Do not blindly make all DDL idempotent if that could mask drift. Prefer deterministic blank replay and explicit failure on unexpected state.

### H5.2 — Controlled verification matrix

Run only in a fresh disposable synthetic environment:
1. **Blank bootstrap:** apply every migration in order from zero; assert expected schema inventory and policies.
2. **Repeatability:** a second run must report clean/no pending migration rather than silently changing state.
3. **Representative upgrade:** load synthetic fixtures using the supported previous schema, apply the migration sequence, and compare row counts, identities, versions, tombstones and representative payloads.
4. **RLS integration:** rerun H4 request-level checks against the migrated database.
5. **Client compatibility:** run current sync/read/write/restore tests against the new schema contract without production credentials or data.
6. **Rollback/recovery:** document which migrations are reversible. If safe down-migration is impossible, prove the documented forward-fix/restore strategy against disposable data; do not claim rollback merely because a SQL down file exists.
7. **Failure injection:** force a migration failure midway and verify the recovery instructions preserve a known-good state.

### H5.3 — Release and exit criteria

**H5 can close only when all are true:**
- A clean empty environment replays the full ordered migration tree.
- A representative supported prior state upgrades with no silent data loss or schema drift.
- H4 policies pass on the migrated schema.
- Backup/export/import and sync compatibility checks pass, including tombstones and version metadata.
- Rollback or documented forward-recovery is rehearsed, timed and independently reviewed.
- CI retains exact commands, runtime versions, migration inventory and redacted results.
- Production rollout is a separate owner-approved release with a backup/restore plan and stop conditions.

Until then: `BLOCKED — NO ORDERED BASELINE; NO FULL CONTROLLED UPGRADE/RECOVERY PROOF`.

## Recommended sequencing

| Order | Deliverable | Gate |
|---|---|---|
| 1 | Owner confirms free local stack or explicitly approves disposable isolated environment | No approval: stop; keep both blockers open |
| 2 | H4 environment preflight and synthetic principal setup | No production data or production credentials |
| 3 | H4 request-level matrix + negative control + cleanup proof | H4 evidence reviewed before H5 migration implementation |
| 4 | H5 schema/source inventory and discrepancy report | Any unexplained drift: stop and resolve before baseline |
| 5 | Separate PR for ordered baseline and migration test harness | ADR, compatibility and rollback plan required |
| 6 | H5 blank bootstrap, upgrade, H4, backup/sync and recovery matrix | All evidence retained and independently reviewed |
| 7 | Refresh readiness report and decide release posture | Do not use green UI CI as substitute for H4/H5 |

## Explicit non-goals

This plan does not authorize a paid service, production DDL, family-data access, new provenance fields, Dexie/backup schema changes, sync conflict behavior changes, auto-repair, tax/FIFO/Vorabpauschale calculations, or claiming the app is a sole authoritative financial ledger.
