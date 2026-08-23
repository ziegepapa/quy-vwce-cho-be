# Stabilization verification checklist

- [x] Remove annual transfer-rate preview; keep yearly factual plan table.
- [x] Financial transaction invariants: reject/quarantine unsafe sale economics; no silent oversell clamp; non-negative fee/tax and canonical transaction shape at ingestion (verified by current-main regression/local hardening pass).
- [ ] H4: controlled Supabase Auth/JWT/PostgREST RLS matrix for owner, cross-user and anonymous access — BLOCKED until staging credentials are available.
- [ ] H5: ordered migration baseline plus controlled upgrade/rollback drill — BLOCKED until controlled database credentials/runner are available.
- [x] Backup: export/wipe/import/replay equivalence for settings, goals, transactions, quotes, snapshots and tombstones (synthetic/local hardening pass).
- [x] Whole-app UX/release matrix available in local hardening pass; real iPhone device verification remains separate and must not be claimed from CI alone.
- [x] CI gates: test, typecheck, build, release, preview/edge smoke — PASS on the current PR run.
- [ ] Production verification after merge.

## Merge policy
H4/H5 are explicitly BLOCKED, not claimed as passed, until controlled staging evidence exists. This milestone is a production-safe stabilization merge, not a claim of full authoritative-record readiness.
