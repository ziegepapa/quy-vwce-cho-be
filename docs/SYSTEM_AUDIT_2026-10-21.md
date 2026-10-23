# System audit — 21 October 2026

## Purpose and boundary

This is a focused implementation audit of the active production paths, not a claim that every file or every external service has been exhaustively proven. The repository is a local-first family portfolio tracker; correctness and recovery take priority over new features.

## Areas inspected

- Product/architecture contract in README and the long-term readiness report.
- Active Overview valuation path: transaction replay, effective quotes, multi-ISIN market value, cash-as-asset semantics and missing-price handling.
- Active Simulation page, projection engine, scenario bounds, target search, chart/summary presentation and persistence boundary.
- Quote resolution policy and the existing deterministic portfolio snapshot adapter.
- Existing simulation and route regression tests, plus current CI/release-gate setup.

## Findings and changes implemented in this audit

| Priority | Finding | Action |
|---|---|---|
| P1 | Simulation's default starting balance used only the legacy VWCE price and VWCE quantity, even though the ledger supports multiple ISINs. This could omit VALL or another held security. | Reuse the same snapshot/quote valuation path as Overview for all holdings. |
| P1 | An unpriced held instrument could be silently absent from the starting balance without a warning. | Return missing ISINs from the valuation helper and disclose the partial starting balance in the active UI. |
| P1 | The base return input was clamped to 0% or higher, and the cautious scenario also clamped its return to 0%. A downside scenario could not show negative annual returns. | Permit negative nominal assumptions and let the cautious scenario fall below zero. |
| P1 | The displayed profit figure was clamped at zero and could hide a projected loss. In purchasing-power view, it also compared a real-valued headline against nominal contributions. | Keep profit/loss signed and explicitly label it nominal, independent of the purchasing-power headline. |
| P2 | Mode C could stop at the 40-year horizon when a target was unreachable without clearly stating that the target was not reached. | Show an explicit unreachable-target state. |

## Safety and compatibility decisions

- No transaction records, quote rows, backup schema, IndexedDB schema, sync protocol, or stored financial assumptions were migrated or rewritten.
- The simulation start value uses the existing quote validity rules and legacy VWCE fallback rather than inventing quote data.
- Missing prices are not imputed. The UI warns that the start value is partial.
- Negative returns are assumptions for illustration, not market predictions.
- No tax estimate, tax advice, trade execution, or automatic portfolio action was added.

## Documentation drift found during the audit

The older `docs/LONG_TERM_AUDIT.md` and `docs/adr/ADR-financial-policy-boundary.md` describe the German-tax UI caller and prescriptive glide-path UI as active behavior. That accurately records the historical baseline, but should not be read as a statement about the current UI: the active Simulation source is guarded against tax-result/toggle code, and the current `PlanRoadmapSection` is informational-only. The legacy tax helper remains intentionally frozen per ADR A.3 and is not to be reactivated without a separate policy decision. The historical audit should be treated as a dated snapshot, not a live source-code inventory. The readiness report now separates the August baseline from the verified 21 October production release (`4fbca10b8e8ad04cb41fc7d965f5fda960035625`, Actions run `39646030050`). H4/H5 remain open: a successful frontend release does not substitute for request-level RLS behavior or migration replay/recovery evidence.

## Existing system-level risks not closed by this UI/Simulation pass

The current readiness report remains the source of truth for these separate blockers:

1. H4: behavioral Supabase RLS proof using isolated, disposable, synthetic-data-only infrastructure is still missing.
2. H5: a complete ordered migration baseline and controlled upgrade/rollback proof are still missing.
3. P11.2: independent German tax-expert review is still required before any tax-calculation scope is added.

These cannot responsibly be marked resolved by frontend tests. No production Supabase project or family data was accessed or modified during this audit.

## Verification required before release

- Unit tests for multi-ISIN starting balance, missing-price disclosure, negative return behavior, and unreachable target behavior.
- TypeScript/build and the repository's full CI/release gates.
- Browser preview and production deployment health after merge.

## Long-term next priorities

1. Close H4/H5 only when the owner-approved isolated environment and evidence exist.
2. Keep all asset valuation routed through one shared deterministic adapter; do not create screen-specific price fallbacks.
3. Maintain a single clear simulation vocabulary: nominal projection, purchasing-power projection, signed gain/loss, and explicit missing-price/unreachable-target states.
4. Treat stale/unknown quotes as evidence states, never as a zero price or a reason to alter the ledger.


## Addendum — 22-10-2026: H4/H5 candidate CI evidence

The base audit above remains a dated, source-reviewed snapshot; the latest source and run evidence is maintained in [`docs/LONG_TERM_READINESS.md`](./LONG_TERM_READINESS.md).

- PR [#363](https://github.com/ziegepapa/quy-vwce-cho-be/pull/363), candidate head `57d52814200bdcb73975117f781cd7b53d8c6c95`, passed [H4 H5 Evidence run 39846912976](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/39846912976) on an ephemeral local Supabase stack. H4's machine-readable evidence records **119 passed, 0 failed** behavioral assertions. The run includes synthetic A/B/anonymous Auth + PostgREST checks, non-local URL fail-closed test, catalog precheck and JSON artifact validation.
- H5 passed migration ordering, explicit dependency contract tests, baseline comparison, blank install, a selected synthetic pre-002 upgrade through `002_soft_delete_and_triggers.sql` (including soft-delete/tombstone/version checks), and a selected Auth+goals fixture restore into a fresh baseline. Evidence artifact: `h4-h5-evidence-39846912976` (ID `12455258593`).
- H4/H5 code remains on an open candidate PR and is not yet part of the production `main` tree. The later workflow hardening requires all three H5 stage results to be PASS and adds an automatic main-branch push run; that current-head rerun must pass before merge. The hosted Supabase schema and actual production migration history were not accessed. The selected restore fixture is not a complete project recovery/rollback certification; H5 remains **PARTIAL**.
- The production release and quote data are unchanged by this candidate work. Simulation calculation and persistence code are not changed by PR #363. Readiness remains **`CONDITIONAL — NOT READY`** as the sole authoritative financial ledger; P11.2 remains blocked pending independent German tax-expert review.

No production Supabase writes, family data, production credentials or paid Supabase project were used for this evidence run.


## Evidence refresh — 23 October 2026 (post-merge verification)

This addendum supersedes the prior statement below that PR #363 remained open. It preserves the 21 October audit findings and does not rewrite their historical scope.

- **Verified main:** `dcbacd420d76bf4c4c0e0e7ed678679282e48b55`, merge of PR #363.
- **Release/deploy:** [Test and Deploy run 39857582904](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/39857582904) completed SUCCESS on the main commit. Its `test-build`, `edge-smoke`, `preview-smoke` and `deploy` jobs all passed.
- **H4/H5 isolated CI:** [run 39857582898](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/39857582898) completed SUCCESS on the same main commit. The behavioral RLS matrix and clean install/selected upgrade/restore steps passed on disposable local Supabase; migration-order/dependency guard passed. Redacted artifact `h4-h5-evidence-39857582898` (ID `12459519740`).
- **H4 status:** PASS for the checked-in schema/policy behavioral matrix in local Supabase. Hosted production schema, grants/policies and migration history remain unverified.
- **H5 status:** PARTIAL. The tested upgrade and restore scope is selected synthetic fixtures, not full-project recovery, hosted migration reconciliation or generic rollback certification.
- **Simulation:** main release gates pass with the current active route and regression suite. The accessibility/mobile polish merged in PR #364 (merge commit `fa722600950f96d670c83d311803b0e7e308cd22`, parent of the H4/H5 merge) keeps the existing A/B/C engine and save/undo behavior; it improves labels/semantics, compact metrics, wrapping, theme-aware chart colors and localized axis units. Automated smoke is not a manual iPhone/VoiceOver sign-off.
- **Overall readiness:** remains `CONDITIONAL — NOT READY` as the sole authoritative ledger; P11.2 German tax review remains BLOCKED.

No production Supabase database was queried or modified during this evidence refresh. This is repository/CI evidence only.
