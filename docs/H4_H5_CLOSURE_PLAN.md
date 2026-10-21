# H4/H5 Closure Plan — isolated evidence only

**Created:** 21 October 2026  
**Readiness decision:** CONDITIONAL — NOT READY until the acceptance criteria below are met.  
**Scope:** Supabase RLS behavioral proof (H4), ordered migration baseline and controlled upgrade/rollback proof (H5).  
**Production safety:** No production writes, destructive SQL, production family data, or production credentials are allowed in this plan.

## Executive order

1. Capture a read-only schema inventory from the owner-authorized Supabase project; record the date and redact all secrets and personal data.
2. Reconcile that inventory with supabase/schema.sql and supabase/migrations/002_soft_delete_and_triggers.sql. Resolve differences in a reviewed decision record; do not guess which side is canonical.
3. Build and verify a complete ordered baseline in a **local disposable Supabase stack**. Keep the existing migration unchanged until the new chain can create the intended schema from empty state and reproduce the approved current schema.
4. Run H4's two-user RLS matrix against that local stack through Supabase Auth + PostgREST using ordinary user JWTs, not service-role requests.
5. Run representative H5 upgrade, compatibility and recovery/rollback drills against synthetic fixtures in disposable environments.
6. Attach immutable CI logs/artifacts and review them before changing the readiness decision. Until then, H4/H5 remain open.

## Safety contract and stop conditions

- Use only a fresh, isolated Supabase local stack or explicitly owner-approved disposable non-production project. Prefer local Docker stack; never point the test harness at production.
- All user identities, rows, tokens and financial-like values must be synthetic. Do not log JWTs, service-role keys, email addresses, row payloads or secrets.
- A service-role key may be used only by local fixture setup/cleanup code to create disposable test users; never use it to prove RLS behavior. All assertions must use anon or User A/User B JWTs over the real Supabase API path.
- Stop if the target URL/project cannot be positively identified as isolated, the schema inventory is unavailable, the migration result differs unexpectedly, or a test would require production data.
- Do not add fake auth.uid() implementations, substitute plain PostgreSQL for Supabase Auth/PostgREST, disable RLS to make tests pass, or run rollback/destructive SQL on production.
- Do not mark a row “passed” because SQL text looks correct, unit tests pass, or CI is green without the relevant integration run.

## H5 — ordered migration baseline and reproducibility

### H5.1 Inventory and reconciliation

**Current known state:** supabase/migrations/ contains only 002_soft_delete_and_triggers.sql. That file explicitly expects the tables created by supabase/schema.sql; it is not a standalone baseline.

Capture read-only evidence for the authorized database, including:
- tables, columns, types, defaults, nullability and primary/foreign keys;
- RLS enabled state, policies and grants for profiles, app_settings, goals, transactions, annual_checklists, and monthly_snapshots;
- indexes, triggers and function definitions used by the sync contract;
- migration history, if present, and whether the current database was initialized manually from schema.sql.

Compare that inventory with the checked-in schema and migration 002. Record every difference in a table with: object, checked-in expectation, observed state, decision, reviewer and evidence reference. The owner must approve the intended canonical state before a migration is authored.

### H5.2 Build the baseline only after approval

- Add a numbered initial migration (expected 001_initial_schema.sql) that establishes the approved schema in a clean Supabase environment, including required tables, constraints, indexes, RLS policies, grants and Auth trigger/function dependencies.
- Keep 002_soft_delete_and_triggers.sql ordered after 001 and review whether it is safe/idempotent from a clean reset. Avoid silently rewriting history if any environment has already recorded a different migration history.
- Define a single documented bootstrap path. schema.sql may remain a human-readable reference, but must not be an undocumented parallel source of truth.
- Add a static guard/test that fails when migration numbering has gaps/duplicates or when the bootstrap instructions imply a migration is standalone while dependencies are missing.
- Run supabase db reset (or the equivalent pinned CLI command) in a clean local stack; capture successful apply output and the resulting schema inventory.
- Compare the resulting schema against the approved manifest, including RLS, policies, triggers, indexes and foreign keys—not only table names.

**H5.2 acceptance:** empty database can be built deterministically from committed ordered migrations, and the resulting schema matches the approved manifest with no unexplained drift.

### H5.3 Representative upgrade, compatibility and rollback

Use disposable local databases and synthetic data to cover:
- previous representative schema/data fixture → latest ordered migrations;
- empty baseline → latest migrations;
- records for all six tables, including soft-deleted rows, version/updated-at behavior and user ownership;
- app/client sync compatibility with the expected record shape and conflict/tombstone behavior;
- export/import compatibility using existing backup schema versions 1–4 where applicable; do not conflate IndexedDB backup schema with Supabase migration version;
- interrupted/failed migration handling and documented recovery.

For rollback, do not assume every DDL migration can be safely reversed. Document a forward-fix path and, where needed, restore/rebuild from a disposable snapshot. Demonstrate the documented recovery on a throwaway database and verify row counts/schema afterwards. No rollback is run against production.

**H5.3 acceptance:** evidence proves clean apply, representative upgrade, compatibility checks, and a rehearsed recovery path. An undocumented “down” script is not enough.

## H4 — behavioral RLS proof

Run tests through the local Supabase Auth + PostgREST API stack after schema/migrations are applied. Use synthetic User A and User B with independent JWTs. The harness may use local admin credentials to provision fixtures, but must never use admin/service-role credentials for the assertions below.

| Test | User/principal | Required result |
|---|---|---|
| Read own profile and rows | User A | Only A's own rows are returned. |
| Insert/update own rows | User A | Accepted for the tables/actions explicitly allowed by policy. |
| Delete own sync rows | User A | Accepted for the five sync tables where delete is intended; profile deletion follows the explicit policy contract. |
| Read A's rows | User B | No A-owned row is returned. |
| Update/delete A's rows | User B | No row is changed/deleted; verify affected-row count and re-read as A. |
| Forge A's owner ID on insert | User B | Request rejected by RLS/check policy. |
| Anonymous read | anon | No private row is returned. |
| Anonymous write/update/delete | anon | Rejected; no data changes. |
| User deletion cleanup | local admin setup only | Delete synthetic auth user; verify expected FK cascades and no orphaned rows remain. |
| Client auth/token path | User A and B | Requests use normal access JWTs through PostgREST, not direct SQL or service-role access. |

Important nuance: a 200 response containing zero rows can be correct for cross-user SELECT, UPDATE or DELETE under PostgREST/RLS. Tests must verify both response semantics and persisted state. Do not demand an HTTP error where the API contract correctly returns an empty result.

**H4 acceptance:** all applicable matrix rows pass in an isolated run; assertions exercise the published API/token path; the report records stack/CLI versions, commit SHA, test run, redacted output and exact pass/fail counts. Any policy exception must be documented and approved rather than hidden by weakening the test.

## CI and evidence artifacts

Once the local harness is stable, add a dedicated workflow/job that:
1. starts a pinned Supabase CLI and disposable local stack;
2. applies the ordered migrations from an empty state;
3. runs H5 schema/migration assertions and H4 API-level RLS tests;
4. emits redacted logs, a machine-readable test summary, migration/schema manifest and CLI version;
5. tears down the stack even on failure.

The job must be isolated from production secrets and must not run on a production URL. Pin CLI/tool versions and fail closed if Docker, the stack, test users, API endpoint or schema setup is missing. Keep ordinary unit/build/preview/release checks as separate gates.

### Evidence ledger

Do not mark a row complete until the referenced artifact exists.

| Evidence | Status on 21-10-2026 | Required artifact |
|---|---|---|
| Current repository and CI release SHA | Verified | PR #357 / main SHA 7268aaa2d16e8a35bfed56540b9ee95af14b84a7; Actions run 39639941852 |
| Authorized current-schema inventory | Open | Redacted read-only schema manifest + date + owner approval |
| Ordered initial migration | Open | Reviewed 001_initial_schema.sql and migration-number guard |
| Empty apply and schema equivalence | Open | Clean local Supabase run log + resulting manifest diff |
| Representative upgrade/compatibility | Open | Synthetic fixture run + before/after assertions |
| Recovery/rollback rehearsal | Open | Disposable DB recovery log and schema/data assertions |
| H4 multi-user RLS matrix | Open | Redacted Auth/PostgREST test report using A/B JWTs |
| Production readiness decision | Open | Reviewer sign-off after H4/H5 artifacts are reviewed |

## Final exit gate

Readiness can be reconsidered only when H4 and H5 acceptance criteria are satisfied, artifacts are linked, no production data was used, and the owner/reviewer approves the decision record. This plan does not close P11.2: tax functionality remains out of scope pending independent German tax-expert review.
