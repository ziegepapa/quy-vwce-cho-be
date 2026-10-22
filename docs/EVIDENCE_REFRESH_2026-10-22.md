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

## H4 / H5 status after PR #363 CI run

| Control | Result | Latest evidence | Remaining work |
|---|---|---|---|
| **H4** behavioral RLS | **PASS on candidate branch / isolated local Supabase** | [Run 39830035462](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/39830035462): RLS catalog precheck and Auth + PostgREST matrix succeeded at head `330ba04eaca0d1f147e7d6695392c73879e99cb1` | Merge/re-run or verify the identical tree on main; separately reconcile hosted database state (not accessed) |
| **H5** migration baseline | **PARTIAL** — clean install and order guard passed | [Run 39830035462](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/39830035462): migration order guard and `supabase db reset --yes` succeeded | Controlled pre-002 upgrade, hosted schema drift, backup/restore and rollback/recovery rehearsal |
| Frontend / Simulation | **PASS** for release gates | No formula change in this branch; Mode A/B/C already on main (#357/#361) | Visual polish only if owner requests; not a ledger blocker |
| P11.2 tax | **BLOCKED** | — | Independent German tax expert review |

## Explicit non-claims

- A green frontend Test and Deploy run alone **does not** close H4 or H5; the isolated H4/H5 evidence run above proves only the matrix and clean-install cases that actually executed.
- Static RLS policy SQL **does not** equal behavioral proof.
- H5 remains partial until upgrade, hosted schema-drift reconciliation, backup/restore and rollback/recovery are rehearsed.
- Stale branch `readiness/h4-h5-and-simulation-refresh` is superseded; do not merge it.

## Decision

**CONDITIONAL — NOT READY** as sole authoritative financial ledger until H4 matrix and H5 blank-install CI both pass.

Local-first daily tracking remains appropriate with independent broker statements and owner-controlled backups.
