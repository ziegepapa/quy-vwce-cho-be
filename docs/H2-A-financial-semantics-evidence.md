# H2-A — Financial Semantics Evidence and Test Inventory

> **Status:** Documentation-only design evidence. This document does **not** approve or implement H2. It does not change financial code, transaction records, schemas, sync, backups, imports, replay, UI behavior, or existing test behavior.
>
> **Scope boundary:** The repository was inspected read-only. No owner vault, browser IndexedDB, Supabase production data, or personal financial data was read. Therefore, the repository can prove possible shapes and fixture behavior, but cannot quantify whether an owner's historical ledger contains any unsafe record.

## 1. Audit method and ingestion topology

The audit followed every production-reachable transaction path from entry to downstream consumption. The current topology is not one validation boundary; it is a set of paths that converge at the physical Dexie transaction-table hook.

| Path | Current path | Current semantic boundary | Evidence |
|---|---|---|---|
| Manual entry | `Transactions.tsx` → `upsertTransaction` → `db.transactions.put` → outbox | UI requires some fields; `upsertTransaction` and Dexie hook perform numeric/ISIN checks, not full financial semantics | [1] [2] [3] |
| Trade Republic invoice | PDF parse → review draft → `validateTrImportDraft` → `upsertTransaction` | This importer is stricter: positive amount/quantity/price, non-negative fee/tax, valid ISIN and invoice dedupe | [4] [5] |
| Backup restore | Settings preflight → `validateBackupPayload` → destructive transaction → `bulkPut` | Payload/schema and numeric checks exist; live transaction economics are not validated per type | [6] [7] |
| Sync pull/recovery/conflict | remote row → direct `store.put` | Remote metadata is parsed; direct writes rely on the Dexie numeric hook rather than `upsertTransaction` semantic checks | [8] [9] |
| Legacy migration | stored transaction → ISIN normalization → `bulkPut` | Identity-only migration; it normalizes resolvable ISINs and does not classify economics | [10] |
| Replay/portfolio | transaction list → chronological `applyTransaction` | `applyTransaction` owns current cash, quantity, cost-basis and aggregate effects | [11] [12] [13] [14] |
| Reporting/reconciliation | analytics, yearly review, depot reconciliation | Read-only consumers either suppress incomplete valuation or mirror the current replay; they do not repair records | [15] [16] [17] [18] |

## 2. Current behavior established by source and tests

### 2.1 Unsafe financial behavior

The calculation engine clamps an over-sale quantity to the position quantity, but it keeps the original sale amount when it adds `totalSold` and cash. A security sale with no quantity is assigned zero quantity but still adds sale amount to `totalSold` and proceeds net of fee/tax to cash. A sale when no position is held has the same proceeds behavior. These are demonstrated by existing unit tests, not inferred from UI copy. [11] [19]

| Current input | Current replay effect | Why H2 flags it |
|---|---|---|
| Holding 2, sell quantity 10, amount 200 | Quantity becomes 0; cash becomes 200 | Proceeds are credited for a requested sale that cannot be fully evidenced by holdings |
| Sell has no quantity, amount 500, fee 10, tax 5 | Quantity stays 0; cash becomes 585 after a prior cash-in; `totalSold` grows 500 | Missing execution quantity still produces proceeds and sales aggregate |
| Sell quantity 5 with no holding, amount 100, fee 2, tax 3 | Quantity stays 0; cash grows 95; `totalSold` grows 100 | Zero effective sale still mutates financial state |
| Negative amount, fee or tax | Numeric validator accepts finite values except negative quantity | Numeric finiteness is not economic sign validation |
| Unknown runtime type or invalid calendar date | No shared runtime type/date validator at persistence/import/sync boundary | Untrusted payload can take a path whose semantics are not explicitly classified |

### 2.2 Current safeguards that should be retained

The existing system already contains important safety behavior. H2-B must preserve these guarantees while adding semantic classification.

| Safeguard | Current behavior | H2-A classification |
|---|---|---|
| Invalid/missing security ISIN in replay | Security replay returns the original state unchanged | Keep as hard no-mutation invariant, but surface an explicit classification rather than silent no-op [11] |
| Non-finite numeric values | Local table hook rejects non-finite amount/optional numeric fields; sync and backup inherit that hook | Keep and extend; do not weaken to UI-only validation [3] [6] [20] |
| Negative quantity | Rejected before local table/outbox writes | Keep as hard invariant [2] [20] |
| Deleted records | Live list and primary replay adapters exclude tombstones | Keep: deleted transaction has no financial replay effect [2] [12] [15] |
| Backup validation before destructive clear | Invalid schema/payload is rejected before replacing local data | Keep fail-closed ordering and atomic restore [6] [21] |
| PDF import review/dedupe | Importer requires a reviewable valid execution and rejects duplicate `externalRef` | Keep source evidence and no-silent-duplicate contract [4] [5] |
| Depot statement | Statement is reconciliation evidence only; it creates no trade | Keep read-only evidence boundary [17] |
| Sync conflicts | Resolution is explicit local/remote choice, not automatic merge | Preserve; H2 must not introduce auto-resolution [9] |

## 3. Validation coverage by boundary

| Requirement | Manual UI | PDF importer | `upsertTransaction` / Dexie hook | Backup | Sync hydration | Replay today |
|---|---:|---:|---:|---:|---:|---:|
| Finite amount | Partial | Yes | Yes | Yes | Indirectly via hook | Converts invalid to zero |
| Positive amount for financial type | Partial UI only | Yes | No | No | No | No |
| Non-negative fee/tax | No | Yes | No | No | No | No |
| Positive security quantity | Sale only | Yes | No, only non-negative | No | No | Clamps/zeroes |
| Positive unit price | UI only if deriving | Yes | No | No | No | `calcQuantity` returns zero |
| Valid security ISIN | Yes | Yes | Yes for `upsertTransaction` | No per transaction | No per transaction | No-op |
| Valid calendar date | Non-empty only | Regex shape only | No | No per transaction | No | Sorts string |
| Runtime transaction type enum | TypeScript/UI select | Derived mapper | No runtime guard | No | No | Switch/no-op fallback |
| Holding-aware oversell | No | No | No | No | No | Clamp plus proceeds |
| Duplicate execution evidence | Manual ID/update semantics only | `externalRef` dedupe | No generic rule | No | Remote identity/version only | Replays every live row |

> **Finding:** No current path provides the same canonical financial answer for type, date, sign, security shape, holding availability and replay eligibility. The H2-B design must converge these paths on one pure classifier/normalizer contract; the physical Dexie hook remains the last-line enforcement mechanism, not the only semantic design.

## 4. Existing test inventory and classification

| Test / suite | Current role | H2-A classification for H2-B |
|---|---|---|
| `src/lib/calc.test.ts` valid cash-in/buy/partial sell/sell-all/multi-asset/ISIN cases | Intended current economics and identity behavior | Retain valid cases; replace only unsafe proceeds assertions after owner decision |
| `calc.test.ts` — `cannot sell more than owned` | Locks oversell clamp plus cash 200 | **Unsafe behavior test: must change** after owner decision |
| `calc.test.ts` — `sell without quantity still credits cash` | Locks missing-quantity cash/`totalSold` mutation | **Unsafe behavior test: must change** after owner decision |
| `calc.test.ts` — `sell when qty held is zero still credits cash` | Locks zero-holding proceeds | **Unsafe behavior test: must change** after owner decision |
| `src/lib/calc.invariants.test.ts` | Finite aggregates and non-negative quantities under pathological values | Retain and strengthen with no-proceeds/no-state-mutation golden invariants |
| `src/lib/db.transactionNumericInvariant.test.ts` and `db.transactionTableGuard.test.ts` | Numeric/directed direct-write rejection | Retain; expand type/date/sign/security-shape/oversell cases |
| `src/lib/sync/engineTransactionGuard.test.ts` | Numeric-invalid remote payload fails before local write | Retain; add semantic-invalid remote behavior after owner decision |
| `src/lib/db.backupRoundTrip.test.ts`, backup migration/tombstone suites | Restore durability and fail-before-clear behavior | Retain; add semantic-invalid and legacy replay cases without changing backup format |
| `src/lib/tr/toTransaction.test.ts` and PDF review tests | Strict source-specific importer validation/dedupe | Retain; align outcomes with canonical classifier |
| `src/pages/transactionQualityInbox.test.ts` | Read-only review classification and buy quantity inference | Retain display-only role; update only if owner chooses new invalid/quarantine UX labels |
| `src/lib/transactionAnalytics.test.ts`, `yearInReview.test.ts`, depot reconciliation tests | Downstream factual/reporting behavior | Retain as downstream non-interference tests; add golden assertions where replay eligibility changes |

## 5. Golden regression matrix proposed for H2-B

No test is implemented by H2-A. The matrix below is the minimum required before H2-B can merge.

| # | Case | Required expected outcome |
|---:|---|---|
| 1 | Valid security buy | Accepted; deterministic quantity/economic effects; cost basis and holdings increase once |
| 2 | Valid security sell within holdings | Accepted; quantity and proportional cost basis fall; net proceeds and `totalSold` change once |
| 3 | Oversell | Never silently clamped with full proceeds; owner-selected reject or quarantine; no unintended cash/proceeds/cost-basis mutation |
| 4 | Sell without quantity | Never creates cash, proceeds, `totalSold` or cost-basis mutation; explicit classification |
| 5 | Sell zero quantity | Explicit invalid/incomplete classification; no financial mutation |
| 6 | Negative amount | Explicit invalid sign classification; no financial mutation for types requiring positive amount |
| 7 | Negative fee | Explicit invalid sign classification; no financial mutation |
| 8 | Negative tax | Explicit invalid sign classification; no financial mutation |
| 9 | Negative quantity | Explicit invalid sign classification; no financial mutation |
| 10 | Invalid/non-positive unit price | No inferred quantity or security financial mutation |
| 11 | Invalid ISIN | Explicit invalid ISIN classification; no security financial mutation |
| 12 | Invalid type | Explicit invalid type classification; no financial mutation |
| 13 | Invalid calendar date | Explicit invalid date classification; no financial mutation |
| 14 | Deleted transaction | No replay effect in all consumers |
| 15 | Duplicate transaction evidence | No silent duplicate financial effect; source-aware evidence/ID rule is explicit |
| 16 | Legacy unsafe sale | Owner-selected compatibility policy is deterministic, visible and preserves raw evidence |
| 17 | Deterministic replay | Same valid ordered transaction set produces same state across all replay consumers |
| 18 | UI filtering | Filters/saved views do not alter replay or financial state |
| 19 | Import validation | Invalid input cannot become valid merely by entering through PDF/import path |
| 20 | Backup restore replay | Restore has no schema/data rewrite; semantic classification outcome matches local/sync replay policy |

## 6. Legacy-data handling options — no option selected

| Option | Current portfolio effect | Raw data preservation | User-visible behavior | Backup/sync compatibility | Rollback complexity | Long-term correctness |
|---|---|---|---|---|---|---|
| A. Reject on future ingestion only | Existing replay remains unchanged, including unsafe historical effects | Complete | New invalid entry is refused; legacy remains as today | No payload change; existing sync/backup rows remain | Low | Does not correct existing unsafe replay |
| B. Quarantine unsafe rows during replay | Current totals/holdings/cash may change wherever an unsafe legacy row exists | Complete; row retained | Explicit "not counted—review required" state is needed | Payload unchanged; all devices need identical classifier/version rollout | Medium | Prevents invalid effects but can alter existing portfolio views |
| C. Legacy compatibility classification | Only selected documented legacy shapes retain behavior; new rows are strict | Complete | Legacy banner/review evidence required; no silent compatibility | Payload unchanged if classification is derived; cross-device determinism is mandatory | High | Reduces disruption but risks retaining unsafe semantics |
| D. Preserve records, introduce owner acknowledgement state | Effect depends on owner-selected replay policy; requires a new status model | Complete | Review/acknowledge workflow | Likely requires ADR and a data/storage plan; cannot be assumed schema-free | High | More explicit, but exceeds minimal H2 scope unless separately approved |

No owner vault data was inspected. Therefore H2-A cannot select an option or forecast an exact current-portfolio delta. H2-B must not change replay until the owner chooses an option and an implementation PR includes before/after synthetic fixtures plus a rollback plan.

## 7. Evidence references

[1]: ../src/pages/Transactions.tsx#L194-L287 "Manual transaction save flow"
[2]: ../src/lib/db.m07b.ts#L116-L148 "Transaction upsert and outbox path"
[3]: ../src/lib/db.m01a.ts#L89-L99 "Dexie transaction-table numeric hook"
[4]: ../src/lib/tr/toTransaction.ts#L23-L100 "Trade Republic draft mapping and validation"
[5]: ../src/components/TradeRepublicPdfImport.tsx#L148-L203 "PDF review, duplicate check and persistence"
[6]: ../src/lib/backupSchema.ts#L50-L155 "Backup pre-destructive validation"
[7]: ../src/lib/db.m09.ts#L104-L156 "Restore transaction bulk-write path"
[8]: ../src/lib/sync/engine.ts#L375-L385 "Recovery direct write"
[9]: ../src/lib/sync/engine.ts#L514-L571 "Pull hydration" and ../src/lib/sync/engine.ts#L634-L695 "Conflict resolution"
[10]: ../src/lib/db.m01b.ts#L10-L56 "Legacy ISIN normalization migration"
[11]: ../src/lib/calc.ts#L183-L283 "Current canonical calculation effects"
[12]: ../src/lib/todayCenterAdapter.ts#L72-L82 "Today-center replay"
[13]: ../src/pages/Simulation.tsx#L103-L109 "Simulation replay"
[14]: ../src/lib/depotReconciliation.ts#L129-L191 "Depot reconciliation replay"
[15]: ../src/lib/transactionAnalytics.ts#L36-L129 "Read-only analytics and incomplete lots"
[16]: ../src/pages/yearInReview.ts#L64-L116 "Yearly factual review"
[17]: ../src/lib/depotReconciliation.ts#L1-L18 "Statement evidence boundary"
[18]: ../src/pages/transactionQualityInbox.ts#L31-L77 "Display-only quality inbox"
[19]: ../src/lib/calc.test.ts#L45-L156 "Existing cash-flow tests including unsafe proceeds assertions"
[20]: ../src/lib/db.transactionNumericInvariant.test.ts#L32-L103 "Current persistence numeric invariant tests"
[21]: ../src/lib/db.backupRoundTrip.test.ts#L46-L110 "Backup durability and fail-before-clear tests"
