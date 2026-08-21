# VWCE Vault — Hardening Implementation Plan H1–H7

> **Baseline:** [`LONG_TERM_AUDIT.md`](./LONG_TERM_AUDIT.md) tại `main` commit `43cd59d`.
>
> **Policy gate:** [`ADR-financial-policy-boundary.md`](./adr/ADR-financial-policy-boundary.md).
>
> **Execution rule:** Mỗi hàng trong roadmap là một PR nhỏ. Không bắt đầu phase kế tiếp trước khi phase hiện tại có review, CI gate xanh, diff review, compatibility statement và decision record khi semantics có thể đổi.

## H0 acknowledgement

Audit P0 được xác nhận như baseline triển khai: version truth bị phân mảnh; unsafe security sale có thể tạo cash/proceeds; validation không giữ đầy đủ economic semantics; và tax/prescriptive glide surface hiện trái policy. H0 đã ghi policy quyết định, nhưng không remediated runtime P0-04. H0 không chứa source application, schema, migration, sync, backup hay ledger change.

## Ordered roadmap

| Phase | Mục tiêu hẹp | Điều cấm | Gate mở phase kế tiếp |
|---:|---|---|---|
| H1 | Một contract app release version được machine-check giữa package, runtime, build/release metadata và docs. | Không bump Dexie/backup/Supabase schema; không đổi financial semantics. | Version contract test + CI guard + full existing gate xanh. |
| H2 | Canonical transaction validation/normalization và safe replay: invalid/legacy unsafe evidence không có economic effect. | Không rewrite historical data; không silent clamp; không auto-repair; không migration destructive. | ADR semantics riêng, golden financial regressions, compatibility plan, full test/build/preview. |
| H3 | Backward-compatible backup metadata và full synthetic restore equivalence drill. | Không dùng owner data; không bypass pending-sync gate; không auto-repair backup. | Export→wipe→import→reopen→replay equivalence + corrupt fixture fail-closed. |
| H4 | Reproducible migration discipline và RLS evidence trên controlled environment; giữ sync engine semantics. | Không service-role key trong frontend; không auto-merge; không claim production RLS without evidence. | User A/B/anonymous proof, migration-order/upgrade checks, source+environment evidence. |
| H5 | Provenance/import ADR và incremental implementation chỉ nếu data contract thực sự được phê duyệt. | Không FIFO/Vorab/tax engine; không schema field “just in case”; không partial import. | Provenance ADR, retention/dedupe rules, migration/rollback plan, importer regressions. |
| H6 | Deterministic read-only Portfolio Data Health và factual Yearly Review. | Không AI, auto repair, mutation or advice; không present scenario as fact. | View-model reason/source/severity tests and locale/UI accessibility gates. |
| H7 | Reproducible dependencies, release/document policy and legacy-AI freeze/retire decision. | Không major upgrade without dedicated PR; no AI critical path. | Clean `npm ci`, security/dependency review, CI release gates, ADR evidence. |
| Final | Verify all evidence and issue final readiness document. | Không label SAFE with any P0 open. | All required tests, restore/RLS evidence and production health pass. |

## H1 — Application version contract (implemented)

`package.json` is the sole source of truth for **APP_RELEASE_VERSION**. Vite reads that value at build time, injects it into `src/lib/appVersion.ts`, renders it in Settings, and emits it as `vwce-app-release-version` metadata in the release HTML artifact. No application release version is persisted in IndexedDB, backup, Supabase or user data.

| File / boundary | Implemented H1 contract | Financial / schema effect |
|---|---|---|
| `package.json` | Canonical application release version source. | No financial semantic or schema effect. |
| `vite.config.ts`, `src/lib/appVersion.ts` | Build-time injection and artifact metadata derive exclusively from `package.json`. | No database/runtime-data mutation. |
| `src/pages/Settings.tsx` | Visible release marker reads `APP_RELEASE_VERSION`; no UI hard-code remains. | Layout and settings persistence unchanged. |
| `scripts/app-release-version.mjs` | Package reader, exact-match assertion and artifact metadata parser. | No runtime data mutation. |
| `scripts/check-app-version-contract.mjs` | Fail-closed source/runtime/UI/release-checker/doc contract; records namespace independence. | No schema change. |
| `scripts/verify-release.mjs` | Asserts generated artifact metadata equals package release version. | PWA/quote behavior unchanged. |
| `scripts/verify-production.mjs` | Asserts deployed artifact metadata equals local expected package release version. | No data/sync change. |
| `docs/DESIGN_SYSTEM.md` | No hard-coded app version claim; documents canonical source. | Documentation-only. |

**H1 tests:** exact-match pass; runtime/artifact mismatch failure; missing metadata failure; artifact assertion; stale active UI/documentation claim scan; and regression that APP release, Dexie, backup and Supabase migration namespaces stay separate.

**Namespace inventory:** `APP_RELEASE_VERSION` is package-driven; `DEXIE_DB_VERSION` remains 4; `BACKUP_SCHEMA_VERSION` remains 4; and the latest committed Supabase migration namespace remains 2. Equal numeric values never imply shared lifecycle or compatibility semantics.

**H1 rollback:** revert only the source/version guard change; no data or schema rollback is needed.

## H2 — Canonical transaction integrity (H2-A/H2-B implemented)

H2 is the highest-risk phase because it can change which persisted historical transactions affect financial replay. H2-A recorded the approved semantic contract in [`ADR-H2-financial-semantics.md`](./adr/ADR-H2-financial-semantics.md). H2-B implements that contract with the exact distinction among **new input rejected**, **legacy evidence retained but ineffective**, and **valid canonical transaction accepted**. It does not rewrite historical evidence or introduce a data migration.

| File / area | Implemented H2-B role | Mandatory caution retained |
|---|---|---|
| [`docs/adr/ADR-H2-financial-semantics.md`](./adr/ADR-H2-financial-semantics.md) | Approved type/date/ISIN/sign/quantity/price contract, status/reason taxonomy, deterministic ordering and legacy Option B quarantine. | No production policy may extend this contract without a separate reviewed ADR. |
| `src/lib/transactionValidation.ts` | One pure canonical classifier, normalizer, ordering comparator and strict new-ingestion assertion. | It must not silently coerce financial values. |
| `src/lib/instrument.ts` | Shared normalized ISIN/type rules. | Legacy VWCE alias compatibility remains explicit. |
| `src/lib/calc.ts` | Applies accepted transactions only; unsafe sale or negative economics has no cash/proceeds/cost-basis/quantity effect. | Historical replay safety changes are limited to derived quarantine; no clamp. |
| `src/lib/db.m07b.ts` and transaction writer modules | Enforce canonical new-input validation and holdings-aware oversell rejection. | DB opening and raw legacy storage remain available. |
| `src/lib/backupSchema.ts` and public backup import gate | Classify finite legacy payload evidence without rewrite; preserve it for replay quarantine. | Malformed/non-finite payload remains fail-closed; no partial restore. |
| `src/lib/sync/engine.ts` and sync guard tests | Classify remote evidence at hydration while preserving raw finite rows and existing outbox/tombstone/conflict behavior. | No auto-resolve or raw-row deletion. |
| `src/pages/Transactions.tsx` | Shows classifier reason in the active locale and blocks false success. | UI never repairs or alters existing legacy evidence. |
| Calculation, validation, DB, backup, sync and UI test files | Golden regression matrix and deterministic replay proof. | Tests specify exact cash, position, cost basis and totalSold no-effect outcomes where relevant. |

### H2 acceptance matrix

| Input | Canonical effect required |
|---|---|
| Holding 2; sale quantity 10 | Reject/quarantine; cash, position, cost basis and totalSold remain unchanged. |
| Security sale missing quantity | Incomplete/reject; no economic effect. |
| Security sale quantity 0 | Incomplete/reject; no economic effect. |
| `amount < 0`, `fee < 0`, `tax < 0`, `quantity < 0` | Reject new input; legacy preserved but cannot alter canonical replay. |
| Invalid type/date/ISIN/unit price | Reject new input; no financial effect. |
| Deleted transaction | No replay effect. |
| Same canonical set replayed twice | Exact same portfolio state. |
| UI filtered list | Cannot change ledger/portfolio totals. |
| Duplicate candidate | Deduplication rule must be deterministic and evidence-preserving; no automatic removal of existing history. |

### H2-B implementation status

The single canonical classifier in `src/lib/transactionValidation.ts` assigns every transaction to `accepted`, `incomplete`, or `invalid`, with an explicit reason code. New manual and importer ingestion requires `accepted`. The persistence write boundary also evaluates a candidate in the canonical `date → createdAt → id` ledger order, so a newly submitted oversell is rejected against the actual replayed holding rather than relying on a UI-only check.

| Contract boundary | H2-B behavior | Evidence |
|---|---|---|
| New manual write | Rejects incomplete or invalid semantics; rejects oversell against canonical holdings; leaves transaction/outbox unchanged. | `db.transactionNumericInvariant.test.ts` |
| Trade Republic draft | Uses the shared classifier before ingesting a draft. | `tr/toTransaction.test.ts` |
| Deterministic replay | Sorts by `date → createdAt → id`; only `accepted` rows reach ledger application. | `calc.replay.test.ts`, `transactionValidation.test.ts` |
| Legacy backup/sync/direct evidence | Retains finite raw evidence without repair or a schema field, then gives unsafe rows zero replay effect. | `backupSchema.test.ts`, `sync/engineTransactionGuard.test.ts`, `db.transactionTableGuard.test.ts` |
| Manual UI | Shows an exact Vietnamese or German classifier reason, retains the entered form values, and does not present false success. | `Transactions.loadState.test.tsx` |

**Compatibility statement.** H2-B changes financial replay safety for invalid/incomplete legacy evidence by derived quarantine only. It does **not** change Dexie schema/version, backup schema/version, Supabase migration namespace, sync conflict semantics, raw backup/sync evidence, or historical data. It performs no auto-repair, automatic conflict resolution, FIFO, tax calculation, or tax advice.

## H2 risk assessment

| Risk | Severity | Why it matters | Required mitigation before merge |
|---|---|---|---|
| Historical portfolio total changes after replay no longer accepts unsafe legacy sale | Critical | It may reveal prior incorrect cash/proceeds and surprise owner. | ADR defines policy; before/after synthetic golden fixtures; read-only quality issue; no raw row mutation; explicit release note. |
| New validator accidentally rejects valid legacy alias/import rows | Critical | Could block restore, sync or normal data entry. | Compatibility table for `buy_vwce`/`sell_vwce`; fixtures for v1–v4 backup and Trade Republic import; staged no-write read path tests. |
| Inconsistent enforcement across UI/import/sync/backup | Critical | Different paths would produce divergent ledger state. | One pure exported contract invoked by every path; import-graph/code search guard plus cross-path tests. |
| Sync hydration loses unsafe remote raw evidence | Critical | Violates non-destructive history and recovery guarantees. | Preserve raw record, classify it; never silently delete/overwrite; unresolved conflict remains owner-controlled. |
| H2 silently becomes a schema migration | High | It increases backup/sync/recovery risk. | No new field or Dexie bump unless a separate ADR/migration PR explicitly approved. |
| Performance regression on large transaction history | Medium | Validation during replay could affect UI responsiveness. | Pure function benchmark at 1k/10k fixture scale and current ledger benchmark gate. |

## H3 — Backup integrity and deterministic restore drill (implemented)

H3 extends the existing v1–v4 backup contract without changing its compatibility namespace. New exports retain `schemaVersion: 4` and add optional descriptive metadata for backup schema, canonical app release, Dexie version label, portable domain allowlist and exact record counts. Existing backups without metadata remain valid. If metadata is present but internally inconsistent, import fails before the existing destructive restore path is entered.

| H3 boundary | Implemented contract | Compatibility / safety limit |
|---|---|---|
| Export metadata | Uses `package.json`-derived `APP_RELEASE_VERSION`; keeps app, backup and Dexie version namespaces separate; reports portable domain counts. | Metadata does not gate app/Dexie compatibility and does not bump any schema version. |
| Import preflight | Validates metadata shape, schema-label agreement, fixed domain allowlist and exact payload counts before restore. | This detects inconsistency/truncation only; it is not a cryptographic checksum, signature, source proof or tamper guarantee. |
| Legacy files | v1–v4 files emitted before H3 omit `metadata` and remain readable. | No historical file is rewritten or automatically enriched. |
| Synthetic restore drill | Exercises calculate → export → JSON boundary → wipe → import → reopen → replay → compare with settings, goals, snapshots, instruments, quote evidence/candidates/preferences, live/tombstone transactions and a finite quarantined legacy row. | Fixture only; no owner vault or family backup is read. |
| Existing recovery gates | Pending-sync/conflict import block, safety-export UI, fail-before-clear and atomic tombstone behavior remain covered. | H3 does not alter outbox, conflicts, syncMeta or conflict-resolution semantics. |

**H3 compatibility statement.** No Dexie migration, Supabase migration, backup schema bump, historical-data rewrite, raw-evidence repair, tax calculation or transaction semantic change is introduced. H2-B remains the sole classifier/replay contract. Rollback is a code revert; a backup emitted with optional metadata remains readable by pre-H3 parsers because its required v4 payload fields and `schemaVersion` are unchanged.

## H4 — RLS and auth boundary (partial evidence; not closed)

The repository and a read-only controlled-project catalog inspection confirm enabled RLS and authenticated owner-only policy definitions for all current sync collections. This is useful production policy evidence but is **not** behavioral proof: no User-A/User-B/anonymous token matrix has been executed. The owner chose not to create a paid Supabase development branch and production family data must not be used as a test fixture.

| H4 evidence | Status | Readiness consequence |
|---|---|---|
| RLS enabled and owner-only policy catalog | Verified read-only. | Supports the intended boundary but does not close H4. |
| Frontend service-role/secret static scan | No matching TypeScript/TSX surface found. | Supports source boundary only. |
| User-A/User-B/anonymous behavioral matrix | **Blocked.** | No claim that production RLS is behavioral-verified. |
| Sync conflict/tombstone behavior | Preserved by existing contracts/tests. | H4 introduces no auto-merge or mutation workaround. |

See [`H4-RLS-EVIDENCE.md`](./H4-RLS-EVIDENCE.md) for the safe evidence boundary and reopening conditions. A no-cost decision is a valid blocker; it must remain visible in final readiness rather than being bypassed with production test data or administrative-role simulation.

## H5 — Provenance and migration discipline (policy complete; implementation blocked)

Current Trade Republic execution import already persists a source-specific `source`, `sourceVersion` and document-derived `externalRef`, validates reviewed fields, checks duplicate execution evidence before write, and rechecks immediately before persistence. Depot statements remain read-only reconciliation evidence. Manual records intentionally have no broker-document identity and therefore must not receive generic auto-dedupe.

Repository migration reproducibility is not yet proven: `schema.sql` remains a manual bootstrap artifact, local tree contains only the later `002_soft_delete_and_triggers.sql`, and read-only environment inventory reports no recorded migration history. H5 does not manufacture baseline migrations, perform DDL, backfill data, add provenance fields, add CSV/broker import batches, or test upgrades against production family data. No approved data contract requires any of those changes today.

See [`ADR-H5-provenance-and-migration-discipline.md`](./adr/ADR-H5-provenance-and-migration-discipline.md). Any future data/schema/import PR must clear the ADR, ordered-migration, controlled-upgrade, RLS, backup/sync compatibility and rollback gates defined there. Until a no-family-data controlled environment is permitted, that work is explicitly blocked rather than silently deferred.

## H6 — Data Health, Yearly Review and household handoff (implemented)

H6 adds a local, deterministic Portfolio Data Health model and card. It groups existing canonical transaction health, effective quote snapshot and backup bookkeeping facts into reason/source/severity/count/link rows. It has no numeric score, no auto-repair and no background task. Transaction links open the existing journal; quote/backup links open Settings. Missing metadata remains unknown, rather than producing a false backup warning.

Yearly Review now records live calendar-year withdrawals, unique contribution months and a same-year Plan-vs-Reality missing-month fact, alongside prior contribution/fee/tax/quality/snapshot values. Different-year plan data remains unknown; the app still stores no price history and makes no price-performance inference from a current quote. Household Handoff remains aggregate-only and local/owner-triggered: it excludes contacts, document locations, account/broker identifiers, wishes, transaction rows and portfolio amounts.

See [`ADR-H6-data-health-yearly-review-handoff.md`](./adr/ADR-H6-data-health-yearly-review-handoff.md). H6 changes no financial classifier/replay semantics, schema/Dexie version, backup format, Supabase migration/RLS policy, sync behavior, tax behavior, AI behavior or P11.2 status.

## H7 — Reproducibility, client security and release evidence (implemented with explicit security blocker)

H7 commits lockfile v3 and moves test/build, edge-smoke, preview-smoke and scheduled quote update workflows to `npm ci`. The Playwright client is exact-pinned and must match the pinned preview browser image; a regression guard fails on lockfile/workflow/image drift. Direct Playwright high advisories were remediated while preserving explicit browser parity.

The static shell now has a restrictive meta CSP, and a client-security boundary guard rejects service-role references, dynamic code evaluation and raw HTML sinks in `src/**`. It is deliberately source-level defense-in-depth: GitHub Pages cannot set server response headers, React inline styles still require `style-src 'unsafe-inline'`, and the guard cannot replace RLS/behavioral authorization proof.

PWA/quote/edge production verification and the 10,000-transaction ledger benchmark remain required operational evidence. The H7 dependency audit still has five moderate, one high and one critical advisory whose available fixes require major Vite, Vitest or React Router migrations. H7 does not run `npm audit fix --force`; this unresolved critical advisory blocks a security-complete readiness decision.

See [`ADR-H7-reproducibility-security-release-baseline.md`](./adr/ADR-H7-reproducibility-security-release-baseline.md). H7 changes no financial ledger semantics, schema/version, backup format, Supabase migration/RLS, sync/conflict behavior, quote economics or P11.2 status.

## PR contract template

Every H1–H7 PR description must state the following fields exactly: purpose, narrow scope, files changed, **financial semantics changed (YES/NO)**, schema changed (YES/NO), backup compatibility changed (YES/NO), sync semantics changed (YES/NO), migration required (YES/NO), tests added, tests passed, rollback strategy and known limitations.

A PR with financial semantics, schema, backup compatibility or sync semantics marked YES cannot merge without its linked ADR and explicit compatibility assessment.

## No-go boundaries throughout execution

The roadmap does not authorize a German tax engine, FIFO, Vorabpauschale, tax optimization, broker execution, trading, investment recommendation, AI critical path, destructive migration, historical auto-repair, auto conflict resolution, missing-price-as-zero or assumption-as-fact behavior.

P11.2 remains blocked until independent German tax expert review. H5 may preserve evidence only; it does not open tax/lot calculation work.

## References

[1]: ./LONG_TERM_AUDIT.md "Long-Term Financial Integrity Audit"
[2]: ./adr/ADR-financial-policy-boundary.md "Financial Policy Boundary"
