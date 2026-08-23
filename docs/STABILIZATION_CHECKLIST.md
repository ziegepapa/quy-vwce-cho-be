# Stabilization verification checklist

- [x] Remove annual transfer-rate preview; keep yearly factual plan table.
- [x] Financial transaction invariants: reject/quarantine unsafe sale economics; no silent oversell clamp; non-negative fee/tax and canonical transaction shape at ingestion.
- [x] Backup: export/wipe/import/replay equivalence for settings, goals, transactions, quotes, snapshots and tombstones (synthetic).
- [x] Portfolio data health: transaction quality, quotes, backup age, plus factual sync conflict / dead outbox / recovery / missing externalRef signals (read-only, no auto-repair).
- [x] Year-in-review: factual withdrawn, contribution months, planned/missing months, fee/tax totals, same-year price snapshot when present; no forecasts.
- [x] Import provenance minimum: Trade Republic `externalRef` + document identity; generic dedupe remains deterministic at ingestion guards.
- [x] App version single source of truth (`package.json` → release metadata / Vite define); CI version contract retained.
- [x] AI/API: dormant infrastructure frozen per ADR-007 and operations runbook; no production AI surface.
- [x] yearlyPlan unit tests included in Vitest gate.
- [x] CI gates: test, typecheck, build, release, preview/edge smoke.
- [ ] H4: controlled Supabase Auth/JWT/PostgREST RLS matrix — **BLOCKED** until staging credentials.
- [ ] H5: ordered migration baseline + controlled upgrade/rollback — **BLOCKED** until controlled DB credentials/runner.
- [ ] Production verification after merge.
- [ ] Real iPhone device verification (not claimed from CI alone).

## Merge policy

H4/H5 are explicitly **BLOCKED**, not claimed as passed. This milestone is a production-safe non-H4/H5 stabilization merge, not full authoritative-record readiness.
