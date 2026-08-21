# ADR H7 — Reproducibility, client security and release baseline

**Trạng thái:** Được chấp nhận.  
**Ngày:** 21-08-2026  
**Phạm vi:** VWCE Vault / Quỹ VWCE cho bé.

> **Quyết định:** H7 làm release pipeline deterministic bằng lockfile, `npm ci` và browser-client/container parity; thêm client-side static security boundary guard; và ghi nhận PWA, quote freshness, ledger performance cùng dependency-audit facts. H7 không tự chạy dependency major upgrade, không thay đổi quote economics, và không claim một static GitHub Pages deployment có server headers/RLS proof mà nó không kiểm soát.

## Reproducible install contract

`package.json` and `package-lock.json` are both committed. Lockfile v3 is authoritative for CI. `@playwright/test` is pinned exactly to **1.62.1**, and preview uses `mcr.microsoft.com/playwright:v1.62.1-jammy`. Test/build, Edge smoke and scheduled quote update run `npm ci`; the former `npm install --no-save` browser-client override is removed.

`check-reproducible-install.mjs` fails closed if the lockfile version, locked Playwright version, manifest version, preview image or scheduled quote workflow diverges. The contract makes dependency resolution and browser revision reviewable in a normal PR.

## Static client security boundary

The static entry HTML carries a Content Security Policy appropriate to the GitHub Pages runtime. It requires self-only scripts, disables plugin objects, constrains form/base/worker/manifest sources, permits only `self` and required Supabase HTTPS/WSS endpoints for connections, and blocks `unsafe-inline`/`unsafe-eval` in `script-src`.

The client-security guard scans `src/**` and fails on service-role references, `eval`/`new Function`, `dangerouslySetInnerHTML`, or raw `.innerHTML` writes. It is a source boundary, not a substitute for server-side authorization or a production penetration test.

> `style-src 'unsafe-inline'` remains necessary for existing React inline style attributes. It does not permit inline JavaScript. Removing it would require a separate CSS refactor and visual/locale regression scope.

GitHub Pages does not let this project configure HTTP response headers. The meta CSP is defense-in-depth for the static shell; a stronger header policy remains a hosting change, not an evidence claim in H7.

## Dependency audit status

### H7 historical snapshot

At the H7 lockfile snapshot on 21-08-2026, direct Playwright high advisories were remediated by pinning **1.62.1** and matching its CI container. The remaining audit result was **five moderate, one high and one critical** advisory. That historical result motivated the dedicated H8 dependency plan; it is not the audit state of the current baseline.

| Direct path at H7 | Historical severity | Planned remediation | H7 decision |
|---|---:|---|---|
| Vitest / vite-node | Critical / moderate | Vitest `3.2.6` bridge, then Vitest `4.1.11` with Vite 8 | Defer to controlled compatibility PRs. |
| Vite / esbuild | High / moderate | Vite `8.2.2` ecosystem PR | Defer to controlled build/PWA/CI compatibility PR. |
| React Router | Moderate | React Router DOM `7.18.2` PR | Defer to routing/browser regression PR. |

### Resolution after H7

H8.1, H8.2, H8.3 and the follow-on Actions runtime update were completed in separate PRs #236, #237, #238 and #241. The current `npm audit --json` result is **0 total vulnerabilities**. This resolves the dependency-audit blocker described by the H7 snapshot; it does not prove H4 behavioral RLS or H5 migration reproducibility, so it does not independently change the `CONDITIONAL — NOT READY` readiness decision. [1]

H7 and H8 intentionally did not use `npm audit fix --force`. Any future dependency update remains a small, deterministic, fully-regressed PR rather than an auto-fix.

## Operational evidence

The existing release pipeline remains responsible for production PWA/quote verification, isolated browser smoke and edge boundary smoke. H7 additionally records the latest 10,000-transaction ledger benchmark assertion. The benchmark runs the existing visible/expanded journal query scenarios under the 100 ms budget; it is a regression guard, not a device-performance guarantee.

Quote freshness remains derived from the existing closed-session quote rules and production verification. H7 does not fabricate a cached historical price, alter the quote source, or add a price recommendation/alert.

## Non-goals

H7 does not change H0–H6 contracts, financial semantics, ledger replay, schema/Dexie version, backup format, Supabase schema/RLS, sync conflict handling, quote economics, PWA product semantics, tax/FIFO/Vorabpauschale, AI, automatic remediation, server hosting headers, penetration testing, or P11.2.

## References

[1]: ../LONG_TERM_READINESS.md "Current dependency audit, H4/H5 status and readiness decision"

## Rollback

Revert the H7 commit. There is no data migration, persisted security state, generated dataset, schema change or historical-data rewrite.
