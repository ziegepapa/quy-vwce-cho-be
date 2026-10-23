# Evidence refresh — 23-10-2026

**Scope:** Repository source, GitHub Actions run metadata and release/deploy workflow on the current `main`. This report distinguishes automated evidence from hosted database state and manual device acceptance.

## Verified current release

| Item | Result |
|---|---|
| Main SHA | `dcbacd420d76bf4c4c0e0e7ed678679282e48b55` |
| Merge | PR [#363](https://github.com/ziegepapa/quy-vwce-cho-be/pull/363), merged 2026-10-22T21:28:44Z |
| Test and Deploy | [Run 39857582904](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/39857582904) — **SUCCESS** on main SHA |
| Jobs verified | `test-build`, `edge-smoke`, `preview-smoke`, `deploy` — all completed SUCCESS |
| H4/H5 Evidence | [Run 39857582898](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/39857582898) — **SUCCESS** on the same main SHA |
| H4/H5 jobs | Behavioral RLS + clean install, and migration-order/dependency guard — both SUCCESS |
| Latest scheduled price workflow | [Run 39875369470](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/39875369470) — **SUCCESS** |
| Production target | https://ziegepapa.github.io/quy-vwce-cho-be/ |

## H4 — behavioral RLS

**Status: PASS for the isolated checked-in schema/policy matrix.**

The main-branch H4/H5 workflow started a disposable local Supabase stack, applied the ordered migrations to a clean database, verified RLS catalog prerequisites, and ran the behavioral matrix through Auth + PostgREST. The workflow step and containing job both completed successfully. The workflow also ran the non-local target fail-closed check, validated machine-readable evidence JSON and uploaded a redacted artifact: `h4-h5-evidence-39857582898` (artifact ID `12459519740`).

**Does not prove:** hosted production schema/grants/policies match the checked-in SQL; production migration history is reconciled; production credentials were exercised; or a live production database is secure. The hosted project was not queried or modified.

## H5 — migration reproducibility, upgrade and recovery

**Status: PARTIAL.**

On main run `39857582898`, CI successfully:
- ran migration numbering/dependency guard contract tests;
- applied the ordered migrations from a clean local Supabase database;
- ran a selected synthetic pre-002 upgrade through migration 002;
- rehearsed a selected synthetic Auth + goals backup/restore path against a fresh baseline;
- validated the machine-readable evidence output.

**Still open:** owner-approved inventory of hosted schema drift and actual production migration history; a reviewed adoption/reconciliation plan for an existing hosted database; broader representative data/relationship coverage; full-project backup/restore rehearsal; and an explicit rollback/recovery procedure for failures beyond the selected fixture. Do not claim generic rollback support where only forward migrations exist.

## Simulation and release verification

The active Simulation route remains the production route. The main release workflow completed `npm test`, build, operational/locale/bundle guards, release artifact verification, preview smoke, Edge smoke and deploy successfully. The existing engine and A/B/C modes were not replaced by a demo page. Regression coverage includes multi-ISIN start valuation, missing/stale quote warnings, negative return assumptions, signed nominal profit/loss and unreachable-target behavior; the UI changes add compact mobile result metrics, localized chart units, theme-token chart colors and accessible input/summary/table/save-dialog semantics.

**Not run as part of this verification:** a manual visual acceptance session on physical iPhone Safari at narrow viewport sizes, VoiceOver, and a manual end-to-end save/undo walkthrough on owner data. Automated preview smoke is not a substitute for those checks.

## Other readiness boundaries

| Control | Status | Remaining evidence |
|---|---|---|
| H4 isolated behavioral RLS | **PASS** | Hosted production parity remains unverified |
| H5 migrations/recovery | **PARTIAL** | Existing hosted DB reconciliation, broad restore and rollback/recovery review |
| Simulation release gates | **PASS** | Manual iPhone/Safari visual and assistive-technology acceptance not recorded here |
| Overall authoritative-ledger readiness | **CONDITIONAL — NOT READY** | Independent recovery evidence and remaining financial-integrity gates |
| P11.2 German tax | **BLOCKED** | Independent German tax expert review |

## Historical records and non-claims

The 22-10 evidence section and earlier baseline audits are preserved in `docs/LONG_TERM_READINESS.md` and `docs/SYSTEM_AUDIT_2026-10-21.md`. Their older commit/run identifiers remain historical; they must not be read as the current main state.

- A successful frontend release alone does not prove RLS behavior or migration safety.
- A successful local H4 matrix does not prove hosted production parity.
- A selected synthetic restore drill does not prove full project recovery or production rollback.
- No production database write, family data or production secret was used for these tests.
- Readiness remains **CONDITIONAL — NOT READY** as the sole authoritative financial ledger.

