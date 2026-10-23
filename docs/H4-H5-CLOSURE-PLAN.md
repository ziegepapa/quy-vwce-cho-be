# H4/H5 closure plan — controlled evidence only

**Updated:** 2026-10-23  
**Verified main:** `dcbacd420d76bf4c4c0e0e7ed678679282e48b55` (PR #363 merged).  
**Main release gate:** [Test and Deploy run 39857582904](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/39857582904) — SUCCESS.  
**Main H4/H5 evidence:** [Run 39857582898](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/39857582898) — SUCCESS.  
**Decision:** H4 is PASS for the isolated behavioral matrix against the checked-in schema/policies. H5 remains PARTIAL: clean install, selected pre-002 upgrade and selected synthetic restore passed, but hosted production schema/history, full-project restore and general rollback/recovery remain unverified. No production database was changed or queried.

## Evidence verified on main

- Both H4/H5 jobs completed successfully on `dcbacd420d76bf4c4c0e0e7ed678679282e48b55`.
- The first job started disposable local Supabase, applied the ordered migrations from a clean database, checked RLS catalog prerequisites, ran the Auth + PostgREST behavioral matrix, ran a selected synthetic pre-002 upgrade and backup/restore rehearsal, validated JSON evidence and uploaded redacted artifact `h4-h5-evidence-39857582898` (ID `12459519740`).
- The second job passed migration numbering/dependency contract tests and the migration-order guard.
- The successful workflow is evidence of the exact steps above only. Exact assertion totals from the older candidate artifact must not be copied to the new main run unless its artifact is inspected separately.

## H4 closure criteria

H4 is **PASS — isolated behavioral proof** for checked-in policies when the current main run proves:
- User A can access and mutate only authorized A-owned records;
- User B cannot read, update or delete A-owned records and cannot forge A ownership on insert;
- anonymous/invalid principals fail closed for protected data;
- response body and final stored state are checked, including RLS cases where PostgREST returns HTTP 200 with no visible rows;
- Auth + PostgREST requests use synthetic user JWTs, not a service-role key;
- synthetic user deletion and relevant foreign-key/cleanup behavior are tested;
- the disposable local target guard, evidence redaction and cleanup succeed.

The main workflow step and job passed. This is not proof of the hosted project's live policies, grants or schema parity.

## H5 closure criteria

### Completed by current local CI (limited scope)
- Ordered migration numbering/dependency contract checks.
- Baseline migration equivalence check against the checked-in `supabase/schema.sql`.
- Clean local Supabase install using the ordered migration chain.
- Selected synthetic pre-002 fixture upgrade through `002_soft_delete_and_triggers.sql`.
- Selected synthetic Auth + goals backup/restore rehearsal to a fresh baseline.
- Machine-readable evidence validation and artifact upload.

### Remaining before H5 can be marked PASS
1. Obtain explicit owner approval and read-only inventory access to the intended hosted Supabase project, if hosted state is part of the required production contract.
2. Compare hosted schema objects and migration history with the reviewed repository baseline: tables, columns/types, constraints, indexes, functions, triggers, RLS policies and grants. Record drift; do not auto-reconcile.
3. Review the migration 001 baseline against the approved historical schema. A file-copy equivalence guard alone cannot establish that the historical schema was the owner-approved production truth.
4. Expand fixtures to cover representative rows/relationships for all relevant sync tables and verify ownership, soft-delete, tombstone, version, timestamps, conflict/sync fields and FK cleanup.
5. Rehearse full-project backup/restore in a disposable environment, verify counts and referential integrity, and document operator steps and failure modes.
6. Document the rollback strategy explicitly. If migrations are forward-only, use a reviewed forward-fix or restore strategy rather than implying down migrations exist.
7. Re-run and retain evidence with commit SHA, Supabase CLI version, migration hashes, run ID and redacted output.

## Safety boundaries

- Never point destructive CI steps at hosted or production Supabase.
- Do not use service-role credentials as a substitute for user JWTs in behavioral RLS assertions.
- Do not modify hosted schema or migration history to make CI pass.
- Do not conflate Supabase migration versions with Dexie/backup schema versions.
- Do not mark H5 PASS because migration `001` exists or because a narrow fixture restores.
- Keep the app's overall readiness **CONDITIONAL — NOT READY** until remaining financial-integrity and independent tax-review gates are resolved.

## Execution order

1. Review the current CI evidence artifact and source hashes.
2. Obtain owner-approved, read-only hosted schema/migration inventory if desired; compare without writes.
3. Expand disposable upgrade/recovery fixtures and acceptance assertions.
4. Conduct full backup/restore rehearsal and document rollback/recovery.
5. Update readiness only after each new proof is independently checked.
6. Treat any production adoption/reconciliation as a separate reviewed change with explicit owner approval and backup.
