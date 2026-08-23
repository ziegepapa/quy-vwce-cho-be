# Stabilization verification checklist

- [ ] Remove annual transfer-rate preview; keep yearly factual plan table.
- [ ] Financial transaction invariants: reject/quarantine unsafe sale economics; no silent oversell clamp; non-negative fee/tax and canonical transaction shape at ingestion.
- [ ] H4: controlled Supabase Auth/JWT/PostgREST RLS matrix for owner, cross-user and anonymous access.
- [ ] H5: ordered migration baseline plus controlled upgrade/rollback drill.
- [ ] Backup: export/wipe/import/replay equivalence for settings, goals, transactions, quotes, snapshots and tombstones.
- [ ] Whole-app UX matrix: iPhone Safari, desktop, VI/DE, light/dark, safe-area, keyboard/focus, loading/error/empty states.
- [ ] CI gates: test, typecheck, build, release, preview/edge smoke.
- [ ] Production verification after merge.

## Merge policy
A green application CI run does not by itself prove H4/H5. Keep those evidence statuses explicit until controlled environment evidence exists.
