# Evidence refresh — 2026-10-22

Verified against GitHub commit metadata, Actions run metadata and the quote artifact. Complements [LONG_TERM_READINESS.md](./LONG_TERM_READINESS.md); does **not** replace the August baseline narrative.

## Verified release surface

| Item | Value |
|---|---|
| Main SHA | `bd163ad296b2b4df944688f86974da8724113d52` |
| Message | `chore(data): update quotes.json, VWCE mirror, and price history (#362)` |
| Test and Deploy | [39672705971](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/39672705971) — **success** (completed 2026-10-21T20:45:34Z) |
| Production Health | [39761903168](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/39761903168) — **success** |
| Production site | https://ziegepapa.github.io/quy-vwce-cho-be/ — HTTP 200 |
| Quotes (schema 2) | VWCE `IE00BK5BQT80` **171.32 EUR** asOf **2026-10-21**; VALL `IE000VAHT5T0` **4.416 EUR** asOf **2026-10-21** |

## H4 / H5 status after this branch’s scaffolding

| Control | Result | What changed on branch | What still blocks PASS |
|---|---|---|---|
| **H4** behavioral RLS | **NOT RUN** (scaffolding ready) | `scripts/h4-rls-behavioral.mjs` + `.github/workflows/h4-h5-evidence.yml` | Workflow must complete green on disposable local Supabase with User A/B/anon JWT matrix |
| **H5** migration baseline | **PARTIAL** (ordered files in repo) | `supabase/migrations/001_baseline_schema.sql` + `scripts/h5-migration-guard.mjs` | `supabase db reset` / blank install + upgrade/rollback rehearsal must be evidenced in CI logs |
| Frontend / Simulation | **PASS** for release gates | No formula change in this branch; Mode A/B/C already on main (#357/#361) | Visual polish only if owner requests; not a ledger blocker |
| P11.2 tax | **BLOCKED** | — | Independent German tax expert review |

## Explicit non-claims

- CI green on Test and Deploy **does not** close H4 or H5.
- Static RLS policy SQL **does not** equal behavioral proof.
- Copying `schema.sql` into `001_*.sql` **without** CI blank-install evidence **does not** close H5.
- Stale branch `readiness/h4-h5-and-simulation-refresh` is superseded; do not merge it.

## Decision

**CONDITIONAL — NOT READY** as sole authoritative financial ledger until H4 matrix and H5 blank-install CI both pass.

Local-first daily tracking remains appropriate with independent broker statements and owner-controlled backups.
