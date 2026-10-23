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
| **H4** behavioral RLS | **PASS — candidate branch / isolated local Supabase** | [Run 39846912976](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/39846912976) on head `57d52814200bdcb73975117f781cd7b53d8c6c95`: 119/119 behavioral assertions passed through Auth + PostgREST for profiles and five sync tables; non-local URL rejection and JSON evidence validation passed. Artifact `h4-h5-evidence-39846912976` (ID `12455258593`). | Candidate evidence only; hosted production policy/schema parity has not been checked. Re-run on merged main before treating as released baseline. |
| **H5** migration baseline / upgrade / fixture recovery | **PARTIAL** | [Run 39846912976](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/39846912976): normalized 001-vs-schema guard, ordered migration chain, blank install, synthetic pre-002 upgrade through 002, trigger/version/timestamp plus soft-delete tombstone checks and a selected synthetic Auth+goals backup/restore rehearsal passed. The artifact was inspected: H4 is 119 PASS / 0 FAIL, and H5 stages `blankInstall`, `pre002Upgrade` and `backupRestoreRecovery` each record PASS. Artifact `h4-h5-evidence-39846912976` (ID `12455258593`). | Hosted schema drift and actual production migration history remain unverified; fixture restore is not a full-project backup/restore or a general rollback proof. |
| Frontend / Simulation | **PASS** for release gates | No formula change in this branch; Mode A/B/C already on main (#357/#361) | Visual polish only if owner requests; not a ledger blocker |
| P11.2 tax | **BLOCKED** | — | Independent German tax expert review |

## Explicit non-claims

- A green frontend Test and Deploy run alone **does not** close H4 or H5; the isolated H4/H5 evidence run above proves only the matrix and clean-install cases that actually executed.
- Static RLS policy SQL **does not** equal behavioral proof.
- H5 remains partial: a selected synthetic pre-002 upgrade and a narrow Auth+goals restore-to-baseline drill passed in run 39846912976; hosted schema-drift reconciliation, production migration-history review and broader owner-approved recovery proof remain open.
- Stale branch `readiness/h4-h5-and-simulation-refresh` is superseded; do not merge it.

## Decision

**CONDITIONAL — NOT READY** as the sole authoritative financial ledger. H4's 119-case behavioral matrix and fail-closed URL check passed on this candidate branch. H5 migration-order, blank-install, selected pre-002 upgrade and synthetic restore-to-baseline checks passed in run 39846912976, but H5 remains **PARTIAL**: no hosted production schema or migration history was accessed; the restore test covers only a selected synthetic fixture and does not prove full project recovery or production rollback. The latest head additionally runs H5 guard contract tests and requires all three nested H5 stages to be PASS before accepting the artifact; that exact current-head rerun is tracked in Actions. P11.2 tax remains blocked pending independent German tax-expert review.

Local-first daily tracking remains appropriate with independent broker statements and owner-controlled backups.
