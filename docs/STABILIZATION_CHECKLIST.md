# Stabilization verification checklist

- [x] Remove annual transfer-rate preview; keep yearly factual plan table.
- [x] Financial transaction invariants: reject/quarantine unsafe sale economics; no silent oversell clamp; non-negative fee/tax and canonical transaction shape at ingestion (verified by current-main regression/local hardening pass).
- [ ] H4: controlled Supabase Auth/JWT/PostgREST RLS matrix for owner, cross-user and anonymous access — BLOCKED until staging credentials are available.
- [ ] H5: ordered migration baseline plus controlled upgrade/rollback drill — BLOCKED until controlled database credentials/runner are available.
- [x] Backup: export/wipe/import/replay equivalence for settings, goals, transactions, quotes, snapshots and tombstones (synthetic/local hardening pass).
- [x] Whole-app UX/release matrix available in local hardening pass; real iPhone device verification remains separate and must not be claimed from CI alone.
- [x] CI gates: test, typecheck, build, release, preview/edge smoke — PASS on the current PR run.
- [x] Production verification after merge (2026-10-04: daily `Production Health` workflow runs `verify:production` — shell/PWA/quote feeds; manual HTTP 200 check OK).

## Post-checklist hardening (Oct 2026)
- [x] Branch protection ruleset "Protect" on `main`: Active, requires PR + `test-build` check, blocks force pushes, restricts deletions (owner-configured 2026-10-04).
- [x] Price workflow no longer pushes directly to `main`: opens one PR per UTC date and auto-merges after required checks pass, via fine-grained PAT (PR #302).

## Merge policy
H4/H5 are explicitly BLOCKED, not claimed as passed, until controlled staging evidence exists. This milestone is a production-safe stabilization merge, not a claim of full authoritative-record readiness.
