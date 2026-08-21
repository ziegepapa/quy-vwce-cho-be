# ADR H2-A — Canonical Transaction Semantics and Evidence Boundary

**Trạng thái:** **Đề xuất — cần owner phê duyệt trước H2-B implementation.**

**Ngày:** 21-08-2026

**Phạm vi:** VWCE Vault / Quỹ VWCE cho bé
**Liên quan:** H0 Financial Policy Boundary, H1 Application Version Contract, H2-A evidence inventory.

> **H2-A là analysis/decision-record only.** ADR này không thay đổi `applyTransaction`, validator, UI, transaction data, schema, Dexie version, backup payload, sync protocol, restore behavior, import behavior, replay, outbox, conflict resolution hay tests hiện hữu. Nó cũng không quyết định đầu tư, phân bổ, thuế hay lot/FIFO/Vorabpauschale.

## 1. Decision context

Financial integrity requires one explicit semantic answer before a transaction can affect holdings, cash, proceeds, cost basis, aggregates, reporting or reconciliation. The audit shows that the current system has useful numeric and identity guards, but different entry paths enforce different subsets of meaning. The calculation engine currently clamps oversold quantity yet credits full proceeds; missing-quantity and zero-holding sales can also credit cash and `totalSold`. [1] [2]

The same raw transaction may arrive through manual entry, Trade Republic PDF import, backup restore, sync hydration/recovery/conflict resolution or legacy migration. Several non-UI paths write directly through the physical Dexie table and therefore bypass `upsertTransaction`; today they rely on the numeric hook rather than a canonical financial-semantic contract. [3] [4] [5] [6]

This ADR proposes a strict, pure, explainable transaction-classification contract for H2-B. It is intentionally separate from persistence and replay implementation so every future path can use the same answer without silently rewriting raw evidence.

## 2. Decision proposed for owner approval

### 2.1 One canonical semantic classifier

H2-B should introduce one pure, deterministic classifier/normalizer conceptually shaped as follows:

```ts
type TransactionClassification =
  | { status: "accepted"; normalized: CanonicalTransaction; evidence: EvidenceSummary }
  | { status: "incomplete"; reasonCode: SemanticReasonCode; evidence: EvidenceSummary }
  | { status: "invalid"; reasonCode: SemanticReasonCode; evidence: EvidenceSummary };
```

`EvidenceSummary` must state, at minimum, the source kind, whether quantity was explicit or deterministically derived, the supplied identity fields and the reason a record is not eligible. The classifier must have no I/O, no clock, no persistent side effect and no hidden fallback. It may normalize presentation-only identity values such as `trim + uppercase` ISIN, but it must never change raw financial meaning or silently repair economics.

| Classifier result | New manual/import input | Existing, sync, backup or legacy evidence | Replay effect |
|---|---|---|---|
| `accepted` | May be persisted after normal validation | May remain/replay | Exactly one canonical financial effect |
| `incomplete` | Must not be persisted as a new financial transaction | Raw row is preserved; visible as review-required under owner-selected legacy policy | No holdings, cash, proceeds, cost-basis, aggregate or position effect unless an explicitly approved compatibility policy says otherwise |
| `invalid` | Must be rejected with a precise user-facing error | Raw row is preserved as evidence where already stored/imported; never silently repaired | No holdings, cash, proceeds, cost-basis, aggregate or position effect |

The physical Dexie table hook remains necessary as last-line protection against generic `put`/`bulkPut`, but it must call the same canonical classification rule or a narrow shared enforcement adapter. UI-only validation is insufficient because backup, restore, sync and conflict paths write to the physical table directly. [3] [4] [5]

### 2.2 Explicitly safe derivation; no silent inference

A security **buy** may use a deterministically derived quantity only when every source field required for that derivation is present and valid: positive amount, positive unit price, finite non-negative fee/tax, fee+tax not exceeding amount, and a usable security identity. The classifier must mark the provenance as `quantityOrigin: "derived"`; it must not make a missing quantity silently disappear from evidence.

A security **sell** requires an explicit positive quantity. H2-B must not derive sale quantity from amount or price, because the sale receipt/lot evidence may not support that inference. A sell with missing or zero quantity is `incomplete`, receives no proceeds and cannot mutate `totalSold`.

> “No silent inference” means that replay cannot quietly manufacture missing execution information. Deterministic buy derivation is permitted only when it is mathematically complete, explicit in the classification evidence, and reproducible across UI/import/backup/sync paths.

## 3. Proposed per-type semantic matrix

The matrix defines the target H2-B contract. It is not implemented by H2-A.

| Transaction family | Required accepted fields | Sign / relationship rules | Eligibility outcome | Replay rule |
|---|---|---|---|---|
| `buy_vwce`, `buy_security` | Valid date; valid type; usable ISIN; positive amount; explicit positive quantity **or** explicit classifier-supported derived quantity | Fee/tax finite and non-negative; fee+tax must not exceed amount; unit price positive when quantity is derived | Reject invalid identity/date/type/sign; mark incomplete if quantity evidence is insufficient | Add quantity and securities cost basis exactly once |
| `sell_vwce`, `sell_security` | Valid date; valid type; usable ISIN; positive amount; **explicit positive quantity** | Fee/tax finite/non-negative and must not exceed amount; requested quantity must not exceed current accepted holdings | Reject invalid identity/date/type/sign; mark incomplete for missing/zero quantity; owner-selected reject/quarantine for oversell | Only an accepted holding-supported sale reduces position/cost basis and creates net proceeds/`totalSold` |
| `cash_in` | Valid date/type; positive amount | Amount must be finite and positive | Reject invalid sign/type/date | Increase in-app cash and contribution aggregate under existing ledger definition |
| `cash_out` | Valid date/type; positive amount | Amount must be finite and positive | Reject invalid sign/type/date | Preserve existing cash-withdrawal semantics; a separate cash-availability policy is out of H2-B unless owner explicitly adds it |
| `tax` | Valid date/type; positive recorded amount | Amount must be finite and positive; it is an owner/imported fact, not a calculated liability | Reject invalid sign/type/date | Preserve existing recorded-tax ledger semantics; do not derive tax |
| `fee` | Valid date/type; positive recorded amount | Amount must be finite and positive | Reject invalid sign/type/date | Preserve existing recorded-fee ledger semantics |
| `safe_interest` | Valid date/type; positive amount | Amount must be finite and positive | Reject invalid sign/type/date | Preserve existing credit semantics |
| `adjust` | Valid date/type; signed finite amount; non-empty explanatory note | Positive or negative amount allowed only for explicitly documented reconciliation adjustment | Reject missing/blank note or invalid amount/date/type | Preserve signed adjustment semantics; no automatic repair or inferred counter-entry |

The legacy aliases `buy_vwce` and `sell_vwce` retain their existing VWCE identity rule. Generic `buy_security` and `sell_security` require a valid explicit ISIN. [7]

## 4. Non-negotiable H2-B invariants

The following invariants are proposed as hard gates for every transaction route, including direct table writes, import, backup, restore, sync hydration, recovery and conflict resolution.

| Invariant | Required result |
|---|---|
| Invalid type | No persistent or replay financial effect; explicit `invalid_type` classification |
| Invalid calendar date | No persistent or replay financial effect; explicit `invalid_date` classification |
| Invalid amount / negative where type requires positive | No holdings, cash, proceeds, cost basis, totalSold or aggregate mutation |
| Negative fee or tax | No financial mutation; explicit sign error |
| Negative quantity | No financial mutation; explicit sign error |
| Invalid/missing security ISIN | No security effect; explicit identity error or incomplete evidence state |
| Missing/zero sale quantity | No sale cash, proceeds, `totalSold`, cost-basis or position effect |
| Oversell | Never clamp requested quantity while crediting full proceeds; explicit reject/quarantine outcome and no partial hidden effect |
| Deleted transaction | Never affects financial replay, analytics, current portfolio, simulation or depot reconciliation |
| Unresolved sync conflict | Never automatically selects financial data; remains owner-resolved |
| Same canonical ordered accepted set | Produces the same portfolio state in every replay consumer |
| UI filter/saved view | Never changes stored data or financial replay state |

### 4.1 Replay ordering

H2-B should explicitly use one comparator for all financial replay consumers: valid calendar `date`, then `createdAt`, then immutable `id`. Current consumers do not all state the same tie-break rule. [8] [9] [10] The comparator must be a pure shared helper and requires test cases for same-date entries, edits and imported records.

### 4.2 No financial side effect from rejected evidence

A rejected or incomplete record must not be replaced by zero, clamped to holdings, or converted to a different type. It must not produce an outbox financial effect. Existing raw evidence must remain inspectable; a user correction is a new owner-initiated edit, not an automatic system repair.

## 5. Error model and user experience contract

H2-B must separate machine-stable reason codes from localized copy. It must not expose generic “invalid transaction” text when a user can correct a specific field.

| Proposed reason code | Classification | Required user-visible behavior |
|---|---|---|
| `invalid_type` | Invalid | State that transaction type is unsupported; no save/import/replay effect |
| `invalid_date` | Invalid | Identify the invalid calendar date; focus the date field on manual entry |
| `invalid_amount` | Invalid | State that this transaction type requires a positive finite amount |
| `invalid_fee` / `invalid_tax` | Invalid | Identify fee/tax sign or amount relationship error |
| `invalid_isin` | Invalid | Identify invalid security identity; never substitute VWCE for a generic security |
| `missing_buy_quantity_evidence` | Incomplete | Explain which exact data is needed for an explicit/derivable buy quantity |
| `missing_sale_quantity` | Incomplete | State that an explicit sale quantity is required; no proceeds are counted |
| `zero_quantity` | Incomplete | State that security quantity must be greater than zero |
| `oversell` | Invalid or incomplete — owner decision | State that requested quantity exceeds accepted holdings; no partial implicit sale |
| `duplicate_evidence` | Invalid or review-required — source policy | State duplicate source/reference conflict without silently removing a row |
| `legacy_review_required` | Incomplete | Preserve raw record and show it is excluded/policy-dependent, never “fixed” silently |

Manual-entry and import feedback must be keyboard accessible: field-associated errors, summary status for multi-field errors, no destructive or confirm action on Escape, and clearing/resetting an input must clear only stale local errors after the next valid classification. The Data Quality Inbox may continue as a read-only review surface, but it cannot be the sole enforcement boundary. [11]

## 6. Import, sync, backup and restore consequences

### 6.1 Manual and PDF import

Manual entry must call the canonical classifier before persistence. The Trade Republic importer may retain its stricter document/reference rules, but its final reviewed draft must receive the same classifier result as equivalent manual data. It must preserve source, sourceVersion, document-derived `externalRef` and user-reviewed fields. [12]

### 6.2 Backup and restore

Backup preflight must validate each live transaction with the shared semantic classifier before any destructive clear. Restore must retain raw fields and backup format. No schema bump, data rewrite or auto-migration is authorized by H2-A. A backup containing an already-stored legacy unsafe record needs the owner-selected policy: reject the file, restore raw evidence but quarantine during replay, or a carefully defined compatibility mode. The choice must be deterministic across devices and must never partially clear the destination database. [5] [13]

### 6.3 Sync, recovery and conflict

Sync hydration, recovery confirmation and conflict resolution must apply the same classification before writing an incoming transaction. An invalid remote payload must leave trusted local data, outbox and sync watermark protected, as current numeric-invalid tests already demonstrate for `NaN`/`Infinity`. [4] [14]

No H2 change may auto-merge, rewrite a remote financial record, delete a row solely because it is semantically invalid, or resolve a conflict without the owner. If a remote/legacy row cannot be accepted, H2-B must follow the selected evidence-preservation policy and surface a deterministic review state.

## 7. Compatibility and historical-data options

Raw historical evidence must remain intact. The owner must choose one legacy policy before H2-B writes code.

| Option | New ingestion | Existing legacy/raw transaction | Current portfolio/reporting impact | Advantages | Risk / consequence |
|---|---|---|---|---|---|
| **A — Future-only strictness** | Reject/incomplete immediately | Replays as today | No historical visible delta | Lowest disruption | Unsafe historical proceeds can remain |
| **B — Derived quarantine** | Strict | Raw row retained but classified excluded from financial replay | Portfolio/reporting can change if unsafe rows exist | Strongest safety without schema/data rewrite | Requires clear user review state and cross-device determinism |
| **C — Explicit compatibility allowlist** | Strict | Only named legacy shapes retain documented behavior | Possibly limited historical delta | Less disruptive than B | Retains selected unsafe semantics; high audit burden |
| **D — Persisted acknowledgement/status model** | Strict | Raw row plus owner review state | Depends on selected replay policy | Richer review workflow | Requires separate ADR, migration/storage plan and cannot be smuggled into H2-B |

No option is selected in H2-A. The repository audit cannot inspect owner data, so it cannot forecast the exact effect on current holdings, cash, P&L, yearly review, simulation or depot reconciliation.

## 8. Required H2-B regression suite

The implementation PR must change only the unsafe tests identified in H2-A after an owner decision; it must retain valid financial, numeric, backup, tombstone, conflict and source-provenance tests.

| Suite | Required purpose |
|---|---|
| Canonical classifier unit suite | Every transaction type; type/date/sign/ISIN/quantity/fee/tax relationship; explicit vs derived quantity evidence |
| Ledger golden suite | Valid buy/sell exact effects; no proceeds/no mutation for missing quantity, zero quantity and oversell; deterministic same-date ordering |
| Persistence direct-write suite | Generic Dexie `put`/`bulkPut` cannot bypass canonical semantic enforcement; atomic rollback preserved |
| Manual UI suite | Localized field errors, valid correction clears stale error, no accidental destructive Escape behavior, no mutation before accepted save |
| PDF import suite | Reviewed draft, dedupe, source fields and canonical classifier alignment |
| Sync suite | Invalid remote/recovery/conflict payload cannot replace trusted accepted data or advance watermark; no auto resolution |
| Backup/restore suite | Fail before clear; raw-preservation policy; restore/replay equivalence for accepted data; no payload/schema change without a separate approved ADR |
| Reporting suite | Today Center, transaction analytics, Year in Review, simulation and depot reconciliation consume the same accepted replay state; UI filters do not change it |
| Legacy fixture suite | Owner-selected A/B/C behavior, raw evidence preservation, visible review state and rollback behavior |

Existing `calc.test.ts` assertions that oversell, missing-quantity sale and zero-holding sale still create cash/proceeds are **known unsafe behavior tests**. They are evidence in H2-A and must not be edited until owner approval opens H2-B. [2]

## 9. Owner decisions required before H2-B

| Decision | Choices | Required before code? |
|---|---|---:|
| D1 — Legacy policy | A future-only, B derived quarantine, C explicit compatibility allowlist, or defer to a separate D persisted-status ADR | **Yes** |
| D2 — Security fee/tax relationship | Confirm whether `fee + tax = amount` is valid recorded evidence or should be incomplete/invalid; H2-A proposes `fee + tax ≤ amount` | **Yes** |
| D3 — Oversell classification | Treat oversell as `invalid` reject or `incomplete` review-required; both have no financial effect | **Yes** |
| D4 — Buy derivation | Approve explicit classifier-marked deterministic derivation only when complete source inputs exist | **Yes** |
| D5 — Duplicate evidence scope | Define generic duplicate policy beyond Trade Republic `externalRef`; never silently deduplicate owner data | **Yes** |
| D6 — Same-date ordering | Approve shared `date → createdAt → id` deterministic comparator | **Yes** |
| D7 — User-facing terminology | Confirm VI/DE neutral labels for `invalid`, `incomplete`, `not counted`, and legacy review | Before UI implementation |

## 10. H2-A completion and non-goals

H2-A is complete only when the owner can review this ADR and the accompanying evidence inventory, select decisions D1–D6, and authorize a **separate H2-B implementation PR**. H2-B must be small, reversible and gated by full regression/build/release/preview/edge/production checks.

H2-A does not authorize a Dexie/Supabase migration, backup format change, transaction rewrite, importer redesign, mass data clean-up, ledger semantic change, tax calculation, FIFO/Vorabpauschale work, investment advice, automatic conflict resolution or AI/API integration.

## References

[1]: ../../src/lib/calc.ts#L183-L283 "Current `applyTransaction` financial effects"
[2]: ../../src/lib/calc.test.ts#L45-L156 "Current cash-flow tests, including unsafe proceeds assertions"
[3]: ../../src/lib/db.m01a.ts#L89-L99 "Physical Dexie transaction-table hook"
[4]: ../../src/lib/sync/engine.ts#L375-L385 "Recovery direct write" and ../../src/lib/sync/engine.ts#L514-L571 "Sync pull direct write"
[5]: ../../src/lib/backupSchema.ts#L50-L155 "Backup preflight" and ../../src/lib/db.m09.ts#L262-L396 "V4 restore bulk writes"
[6]: ../../src/lib/db.m01b.ts#L10-L56 "Legacy ISIN migration"
[7]: ../../src/lib/types.ts#L219-L245 "Transaction type and payload declarations" and ../../src/lib/instrument.ts#L51-L89 "Security identity helpers"
[8]: ../../src/lib/todayCenterAdapter.ts#L72-L82 "Today Center replay ordering"
[9]: ../../src/pages/Simulation.tsx#L103-L109 "Simulation replay"
[10]: ../../src/lib/depotReconciliation.ts#L129-L191 "Depot reconciliation replay"
[11]: ../../src/pages/transactionQualityInbox.ts#L31-L77 "Display-only quality inbox"
[12]: ../../src/lib/tr/toTransaction.ts#L23-L100 "Trade Republic source/draft validation" and ../../src/components/TradeRepublicPdfImport.tsx#L148-L203 "Reviewed import persistence"
[13]: ../../src/lib/db.backupRoundTrip.test.ts#L46-L110 "Backup durability and fail-before-clear tests"
[14]: ../../src/lib/sync/engineTransactionGuard.test.ts#L65-L101 "Sync numeric-invalid protection"
