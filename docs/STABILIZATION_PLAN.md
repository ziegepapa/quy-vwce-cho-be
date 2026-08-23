# Long-Term Stabilization Plan

Status: active

This branch is a controlled hardening pass after PR #276. It removes the non-essential annual transfer-rate preview, preserves the factual yearly plan table, and prepares the repository for financial-integrity, RLS, migration, recovery, and release verification before further feature work.

## Order
1. Financial semantics and canonical transaction validation.
2. Behavioral RLS proof in a controlled Supabase environment.
3. Ordered Supabase migration/reproducibility proof.
4. Full backup/restore equivalence and operational drill.
5. Whole-app UX/release matrix.
6. Long-term maintenance gates.

## Non-goals
- No tax engine/FIFO/Vorabpauschale implementation.
- No prescriptive investment allocation or transfer advice.
- No destructive rewrite of historical evidence.
- No schema/Dexie bump unless separately justified by an ADR.
- No production-data RLS or migration experiments.

## Merge gate
Do not merge until required CI, build, release, preview/edge smoke and targeted financial regression tests are green. H4/H5 are evidence gates for the long-term authoritative-record claim; absence of that evidence must remain explicit and is not hidden by green application CI.
