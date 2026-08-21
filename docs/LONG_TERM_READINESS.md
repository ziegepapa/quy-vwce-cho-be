# Long-Term Stable Baseline Readiness

**Owner:** Gia đình sử dụng VWCE Vault.  
**Mốc đánh giá:** 21-08-2026.  
**Phạm vi:** H0 đến H7, local-first VWCE Vault v1.6.0.

> **Quyết định hiện tại: `NOT READY` cho nhãn “Long-Term Stable Baseline v1” đầy đủ.** Ứng dụng có một **operational baseline** đã được kiểm thử và có thể tiếp tục dùng theo mô hình local-first; tuy nhiên không được tuyên bố security-complete hoặc migration-complete cho đến khi các blocker dưới đây được xử lý bằng evidence độc lập.

## Readiness matrix

| Hạng mục | Trạng thái | Evidence đã có | Điều không được suy diễn |
|---|---|---|---|
| H0–H0.1 policy boundary | PASS | ADR policy boundary và CI guard cấm public tax estimate/prescriptive glide surface. | Đây không phải tư vấn đầu tư hoặc kết luận thuế. |
| H1 release identity | PASS | `package.json` canonical version, build metadata và release verification. | Không xác minh compatibility với mọi browser/thiết bị cũ. |
| H2-A/H2-B transaction integrity | PASS | Canonical accepted/incomplete/invalid classifier, strict new-ingestion, deterministic replay and legacy derived quarantine, golden persistence/replay/UI tests. | Raw legacy unsafe evidence không bị sửa; report không biến nó thành financial effect. |
| H3 backup/recovery | PASS, bounded | Additive metadata preflight, duplicate/missing-ID guard, synthetic export → wipe → import → reopen → replay equivalence drill, v1–v4 compatibility. | Metadata is not a checksum, signature, encryption proof or off-device backup confirmation. |
| H4 RLS/auth/sync authorization | PARTIAL / BLOCKED | Static repository policy and read-only actual policy-catalog evidence confirm intended owner-only RLS. | Chưa có User-A/User-B/anonymous behavioral proof. Không thể nói production isolation đã được independently verified. |
| H5 provenance/migration discipline | PARTIAL / BLOCKED | Trade Republic source/external-ref/dedupe boundary documented; actual environment migration inventory captured. | No ordered baseline migration history, controlled upgrade drill, generic broker import or data backfill has been proven. |
| H6 data health/review/handoff | PASS, factual-only | Source-labeled Data Health; canonical legacy issue inbox; Yearly Review facts; aggregate-only handoff/print regressions. | Không có numeric health score, forecast, synthetic price history, tax calculation or auto-fix. |
| H7 reproducibility/client security | PARTIAL | Lockfile v3, `npm ci` workflows, exact Playwright client/image parity, CSP and static client security guard, PWA/quote/ledger release checks. | Meta CSP is not a server response header; static guard is not penetration testing or RLS proof. |
| Dependency security | BLOCKED | Direct Playwright high advisories remediated at 1.62.1; `npm audit` inspected lock graph. | Remaining five moderate, one high and one critical advisory are not fixed. |
| P11.2 | BLOCKED by design | P11.1 remains read-only synthetic lot evidence only. | No FIFO, Vorabpauschale, tax output or German tax conclusion may be implemented. |

## Required evidence before readiness can change to `READY`

A future owner-approved, controlled follow-up must produce all of the following evidence. None can be substituted with an assertion that “the policy exists in source.”

| Gate | Required evidence | Safe execution boundary |
|---|---|---|
| H4 behavioral authorization | Anonymous denial plus User-A allow/User-B deny tests for every owner table and sync endpoint, run on disposable data. | A no-family-data Supabase branch/project. This is deferred under the current no-cost instruction. |
| H5 migration reproducibility | Ordered baseline migration history, blank-environment apply, representative upgrade, backup/sync compatibility and rollback drill. | Disposable no-family-data environment; no production-family DDL/backfill. |
| Dependency security | Approved major upgrades for Vitest, Vite and React Router, with migration notes, full test/build/preview/edge/production validation. | Separate small PRs; never `npm audit fix --force`. |
| Hosting CSP | Verified HTTP response-header CSP if hosting control becomes available, with browser/PWA regression evidence. | Hosting-configuration PR, not a source-only claim. |

## Operator checklist

The family may continue normal local-first use only with periodic export/restore practice and the existing review surfaces. A backup export remains an owner-controlled local file; it is not automatically off-device. Transaction Data Health and Yearly Review are review queues, not repair actions. When an issue is shown, the owner must inspect the existing record and consciously edit it; no row is silently repaired or skipped.

PWA availability, quote feed freshness, ledger performance and production shell are checked by the release/health workflows. A stale/missing quote remains an explicit incomplete valuation state. It must not be replaced with zero, a synthetic historical value or a suggested investment action.

## References

| Document | Purpose |
|---|---|
| [ADR H2 — Financial semantics](./adr/ADR-H2-financial-semantics.md) | Canonical transaction/replay contract. |
| [ADR H3 — Backup metadata and restore drill](./adr/ADR-H3-backup-metadata-and-restore-drill.md) | Bounded portable backup/restore integrity contract. |
| [H4 RLS evidence](./H4-RLS-EVIDENCE.md) | Actual policy catalog evidence and behavioral-proof blocker. |
| [ADR H5 — Provenance and migration discipline](./adr/ADR-H5-provenance-and-migration-discipline.md) | Import/migration boundaries and reproducibility blocker. |
| [ADR H6 — Data Health, Yearly Review and Handoff](./adr/ADR-H6-data-health-yearly-review-handoff.md) | Read-only factual and privacy boundary. |
| [ADR H7 — Reproducibility, security and release baseline](./adr/ADR-H7-reproducibility-security-release-baseline.md) | Lock, CI, CSP, audit and release evidence. |
| [Operations runbook](./OPERATIONS_RUNBOOK.md) | Owner backup/recovery operational steps. |
