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

The older `docs/LONG_TERM_AUDIT.md` and `docs/adr/ADR-financial-policy-boundary.md` describe the German-tax UI caller and prescriptive glide-path UI as active behavior. That accurately records the historical baseline, but should not be read as a statement about the current UI: the active Simulation source is guarded against tax-result/toggle code, and the current `PlanRoadmapSection` is informational-only. The legacy tax helper remains intentionally frozen per ADR A.3 and is not to be reactivated without a separate policy decision. The historical audit should be treated as a dated snapshot, not a live source-code inventory. The detailed `docs/LONG_TERM_READINESS.md` also identifies its evidence date as 21 August 2026 and names an August commit, while the application has continued changing through October. The README still states the conservative conditional-readiness decision; however, the detailed evidence and release SHA should be refreshed before anyone treats that report as a current release attestation.

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
