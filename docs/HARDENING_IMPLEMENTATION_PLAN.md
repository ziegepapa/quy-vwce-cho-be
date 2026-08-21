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

## H1 — File plan

H1 is a version-contract PR. It should make the **app release** version deterministic without coupling it to storage schema versions.

| File | Planned change | Financial / schema effect |
|---|---|---|
| `package.json` | Retain the canonical release-version source or explicitly document an imported/generated source selected by implementation. Add only version verification scripts. | No financial semantic change; no schema effect. |
| `src/lib/types.ts` | Replace hard-coded `APP_VERSION` only if runtime can safely import generated/build version; keep `DEXIE_DB_VERSION` and `BACKUP_SCHEMA_VERSION` independent. | No ledger change. |
| `scripts/check-version-contract.mjs` *(new)* | Read package/runtime/build metadata and fail on mismatch. | No runtime data mutation. |
| `scripts/check-version-contract.test.mjs` *(new)* | Prove match/mismatch and schema-version non-coupling cases. | No schema change. |
| `scripts/verify-release.mjs` | Assert release artifact exposes the same app release version only if there is a stable artifact location. | No PWA/quote semantic change. |
| `scripts/verify-production.mjs` | Verify deployed release version only after deploy architecture provides a reliable location. | No data/sync change. |
| `.github/workflows/deploy.yml` | Invoke version contract before build/deploy; move from `npm install` to `npm ci` only in H7, unless lockfile exists and H7 is explicitly split first. | No financial change. |
| `docs/DESIGN_SYSTEM.md`, `README.md`, `docs/OPERATIONS_RUNBOOK.md` | Remove stale hard-coded app version; cite the canonical source. | Documentation-only. |

**H1 tests:** exact-match, each mismatch failure, build artifact assertion, stale documentation scan if machine-checkable, and regression that `APP_RELEASE_VERSION`, `DEXIE_DB_VERSION`, `BACKUP_SCHEMA_VERSION` and an eventual Supabase migration version are distinct concepts.

**H1 rollback:** revert only the source/version guard change; no data or schema rollback is needed.

## H2 — File plan (proposal only; do not implement before semantic ADR approval)

H2 is the highest-risk phase because it can change which persisted historical transactions affect financial replay. It needs an ADR that defines the exact distinction among **new input rejected**, **legacy evidence retained but ineffective**, and **valid canonical transaction accepted**.

| File / area | Proposed role | Mandatory caution |
|---|---|---|
| `docs/adr/ADR-canonical-transaction-safety.md` *(new; prerequisite)* | Define type/date/ISIN/sign/quantity/price rules; define status/result contract; define legacy behavior and no-rewrite guarantee. | Requires owner review before production code. |
| `src/lib/transactionValidation.ts` | Evolve into one pure canonical normalization/validation contract or split a pure `transactionCanonical.ts` helper. | It must not silently coerce financial values. |
| `src/lib/instrument.ts` | Reuse normalized ISIN/type rules; avoid duplicate validation. | Legacy VWCE alias compatibility must be explicit. |
| `src/lib/calc.ts` | Make replay ignore/reject unsafe security sale and negative economics without cash/proceeds/cost-basis/quantity mutation. | Changing this affects historical portfolio state; no silent clamp. |
| `src/lib/db.m01a.ts` and transaction writer modules | Enforce new-input persistence boundary using the canonical validator. | Do not block DB opening solely because legacy rows exist. |
| `src/lib/backupSchema.ts`, public backup import gate, `src/lib/db.m09.ts` | Validate imported new payload before clear/restore; preserve legacy evidence under ADR rules. | Invalid payload must fail closed; no partial import. |
| `src/lib/sync/engine.ts` and sync guard tests | Apply the same boundary to remote hydration/outbox without auto-resolve. | Must preserve local-first/outbox/tombstone/conflict behavior. |
| `src/pages/transactionQualityInbox.ts` | Display legacy invalid/incomplete state read-only after its semantic contract exists. | Health UI cannot mutate or “fix” a transaction. |
| Calculation, validation, DB, backup, sync and UI test files | Golden regression matrix and deterministic replay proof. | Tests must specify cash, position, cost basis and totalSold exact no-effect outcomes. |

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

## H2 risk assessment

| Risk | Severity | Why it matters | Required mitigation before merge |
|---|---|---|---|
| Historical portfolio total changes after replay no longer accepts unsafe legacy sale | Critical | It may reveal prior incorrect cash/proceeds and surprise owner. | ADR defines policy; before/after synthetic golden fixtures; read-only quality issue; no raw row mutation; explicit release note. |
| New validator accidentally rejects valid legacy alias/import rows | Critical | Could block restore, sync or normal data entry. | Compatibility table for `buy_vwce`/`sell_vwce`; fixtures for v1–v4 backup and Trade Republic import; staged no-write read path tests. |
| Inconsistent enforcement across UI/import/sync/backup | Critical | Different paths would produce divergent ledger state. | One pure exported contract invoked by every path; import-graph/code search guard plus cross-path tests. |
| Sync hydration loses unsafe remote raw evidence | Critical | Violates non-destructive history and recovery guarantees. | Preserve raw record, classify it; never silently delete/overwrite; unresolved conflict remains owner-controlled. |
| H2 silently becomes a schema migration | High | It increases backup/sync/recovery risk. | No new field or Dexie bump unless a separate ADR/migration PR explicitly approved. |
| Performance regression on large transaction history | Medium | Validation during replay could affect UI responsiveness. | Pure function benchmark at 1k/10k fixture scale and current ledger benchmark gate. |

## PR contract template

Every H1–H7 PR description must state the following fields exactly: purpose, narrow scope, files changed, **financial semantics changed (YES/NO)**, schema changed (YES/NO), backup compatibility changed (YES/NO), sync semantics changed (YES/NO), migration required (YES/NO), tests added, tests passed, rollback strategy and known limitations.

A PR with financial semantics, schema, backup compatibility or sync semantics marked YES cannot merge without its linked ADR and explicit compatibility assessment.

## No-go boundaries throughout execution

The roadmap does not authorize a German tax engine, FIFO, Vorabpauschale, tax optimization, broker execution, trading, investment recommendation, AI critical path, destructive migration, historical auto-repair, auto conflict resolution, missing-price-as-zero or assumption-as-fact behavior.

P11.2 remains blocked until independent German tax expert review. H5 may preserve evidence only; it does not open tax/lot calculation work.

## References

[1]: ./LONG_TERM_AUDIT.md "Long-Term Financial Integrity Audit"
[2]: ./adr/ADR-financial-policy-boundary.md "Financial Policy Boundary"
