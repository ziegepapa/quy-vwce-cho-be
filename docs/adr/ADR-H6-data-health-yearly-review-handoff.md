# ADR H6 — Read-Only Data Health, Yearly Review and Household Handoff

**Trạng thái:** Được chấp nhận.  
**Ngày:** 21-08-2026  
**Phạm vi:** VWCE Vault / Quỹ VWCE cho bé.

> **Quyết định:** H6 chỉ tổng hợp các fact đã tồn tại thành UI review cục bộ. Nó không tạo health score, không tự sửa ledger, không suy luận price history, không forecast, không tính thuế, không gửi dữ liệu và không biến household handoff thành bản sao dữ liệu nhạy cảm.

## Data Health contract

`buildPortfolioDataHealth` là view-model deterministic, không persistence. Mỗi issue có **reason code, source, severity, count và direct link** tới màn hình owner-controlled hiện hữu. Link chỉ đưa người dùng tới nơi rà soát; không thực hiện remediation.

| Fact source | Reason hiện có | Severity | Direct review surface | Giới hạn |
|---|---|---|---|---|
| Canonical H2-B transaction replay | Invalid/incomplete/oversold legacy evidence và completeness issue. | `action`, `review` hoặc `tip` theo fact. | `#/transactions` | Row raw legacy được giữ nguyên; health audit không repair hoặc apply nó. |
| Effective quote snapshot | Missing hoặc stale instrument quote. | `review` / `tip`. | `#/settings` | Không suy ra price zero, valuation history hoặc price forecast. |
| App backup metadata | Không có backup export recorded (`lastBackupAt === ""`). | `review`. | `#/settings` | Metadata unavailable (`null`) là unknown, không tạo warning giả. H6 không đặt ngưỡng “backup quá cũ” vì chưa có retention policy được owner phê duyệt. |

Portfolio Data Health intentionally does **not** aggregate a numeric score. A score would hide why something needs attention and imply a risk model that the local evidence does not support.

## Yearly Review contract

Yearly Review remains a calendar-year, local and live-row-only view. In addition to existing contributions, transaction count, fees/taxes, quality count and one same-year price snapshot, H6 reports the following factual values:

| Field | Evidence source | Unknown / exclusion behavior |
|---|---|---|
| Withdrawn amount | Live `cash_out` rows in selected calendar year. | Excludes deleted rows and non-positive/non-finite values. It is not a tax or realized-gain figure. |
| Contribution months | Unique `YYYY-MM` containing counted authoritative contribution rows using the same cash-first/securities-first mode as Overview. | Does not infer missed deposits from absent transactions. |
| Planned and missing contribution months | Existing Plan-vs-Reality result only when its selected year equals Yearly Review year. | Displays unknown instead of reusing a different year's plan fact. |
| Price snapshot | Existing positive quote only when its `asOf` belongs to selected year. | `priceHistoryAvailable` remains `false`; no current quote becomes historical evidence. |

The export uses exactly the same values and labels as the visible review card. It remains an internal factual review, not a broker statement, tax filing, recommendation or financial report.

## Household Handoff contract

Existing Household Handoff/Continuity Snapshot is retained as H6’s privacy-safe family continuity surface. It exposes aggregate readiness/counts and never returns contact values, document locations, broker/account identifiers, wishes, transaction rows or portfolio amounts. Browser print remains owner-triggered, local, unsent and explicitly not a backup.

## Verification

H6 regression coverage locks canonical invalid/incomplete/oversell health facts, source/severity/route labels, quote dedupe, unavailable metadata no-claim, German/Vietnamese rendering, factual Yearly Review fields, same-year plan boundary, and aggregate-only handoff serialization.

## Non-goals

H6 does not change H2-B classifier/replay, financial economics, Dexie schema/version, backup format, Supabase schema/migration/RLS, sync conflict behavior, quote feed protocol, tax/FIFO/Vorabpauschale, AI, alerts/background jobs, automatic data remediation, generic data health scoring, or P11.2.

## Rollback

Rollback is a code revert. H6 persists no health result or year-review preference and writes no data, so there is no data migration or recovery action.
