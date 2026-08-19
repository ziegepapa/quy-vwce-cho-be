# Transactions at scale

This document defines the transaction-list contract for the VWCE Vault PWA. It is intentionally independent of the synchronization engine and of database schema migrations.

## Operating envelope

The application must remain usable with **100–1,000+ active transactions** on a phone. The IndexedDB read may load the ledger into memory because this envelope is small for local storage, but the screen must never render the entire ledger into the DOM at once. Rendering is bounded by the visible-row limit.

| Concern | Contract |
|---|---|
| Source of truth | `listTransactions()` remains the single local-ledger read; no parallel cache is introduced. |
| Ordering | Rows are ordered descending by date, then `updatedAt`, then stable `id`. |
| Filtering | Year, type and text filters are applied before grouping and before visibility limiting. |
| Rendering | The initial screen renders at most 60 transaction rows; **Show more** adds another 60. |
| Grouping | Month headers render only when that month contains at least one visible transaction. |
| Summaries | Portfolio analysis continues to use the full filtered-independent ledger, so list paging cannot change balances or P&L. |
| Mutations | Create, edit and delete reload the source ledger, reset the visible limit and preserve existing recovery/read-only gates. |
| Accessibility | The visible/total result count is announced politely; the expansion control states how many rows are added. |

## Why bounded progressive rendering, not a new virtual-list dependency

For a vertically grouped, variable-height, editable mobile ledger, a fixed-height virtualizer would complicate focus restoration, month headers, error states and future maintenance. A bounded progressive window keeps the DOM small, has deterministic behavior, needs no dependency, and is straightforward to test. If the product later exceeds the documented envelope by an order of magnitude, replace the window implementation behind the view-model contract without changing database, sync or transaction rules.

## Regression requirements

The pure list view model must be tested with a ledger of at least 1,000 entries. Tests must prove that filtering is deterministic, no more than the requested row limit is rendered, groups are not empty, and expanding the window reveals the next chronological rows without duplicating or losing a transaction.

## Data integrity boundary

This feature does not add indexes, alter Dexie versions, change `Transaction`, change backup payloads, or alter synchronization. All economics remain in the existing analytics and ledger functions. The list view performs display grouping only.
