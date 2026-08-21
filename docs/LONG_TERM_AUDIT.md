# VWCE Vault — Long-Term Financial Integrity Audit

> **Loại tài liệu:** Phase A — audit chỉ đọc.
>
> **Baseline đã audit:** `main` tại commit [`43cd59d`](https://github.com/ziegepapa/quy-vwce-cho-be/tree/43cd59d4ced08c88970896e3b13202d437dd9013), ngày 21-08-2026.
>
> **Cam kết phạm vi:** Báo cáo này không thay đổi code application, schema Dexie/Supabase, sync/auth, backup format, semantics ledger, dữ liệu người dùng, hay công thức thuế. Không có PR hardening nào được mở trong Phase A.

## Executive summary

VWCE Vault đã có một nền local-first đáng kể: IndexedDB có guard numeric tại physical table; tuyến sync có outbox, tombstone, conditional write, conflict record và browser lock; backup công khai chặn file sai và trạng thái pending sync trước restore; quote feed ghi provenance và từ chối dữ liệu lỗi. Test, build, release artifact và production smoke tại baseline đều xanh.

Tuy nhiên, baseline **chưa đủ điều kiện để được xem là financial record duy nhất, dài hạn và authoritative cho giai đoạn 2026–2042**. Có bốn nhóm P0 cần được đóng trước: version truth bị phân mảnh; ledger hiện có thể ghi nhận cash/proceeds cho sale không có hoặc vượt quantity; transaction validation không khóa sign economics; và production UI đang có công thức tax/German-tax toggle cùng glide path prescriptive, trái với boundary không tax engine/không investment recommendation. Các tồn tại này là feature/semantics kế thừa đã có trước P11; Phase A không thêm hoặc thay đổi bất kỳ công thức tax/FIFO/Vorabpauschale nào.

| Kết luận | Trạng thái |
|---|---|
| Dùng như dashboard local và công cụ theo dõi có kiểm tra thủ công | **Có thể, với cảnh báo P0 còn mở** |
| Dùng như bản ghi financial duy nhất hoặc nền tảng quyết định tax dài hạn | **Chưa nên** |
| Dùng làm hồ sơ khai thuế Đức/FIFO/Vorabpauschale | **Không được khuyến nghị** |
| Đủ điều kiện sau hardening | Chỉ khi toàn bộ P0 đóng, restore drill/RLS evidence đạt, và owner phê duyệt release gate mới |

## Phương pháp, giới hạn và kết quả kiểm chứng

Audit đã đối chiếu implementation, unit/UI tests, workflows, release checker, production checker, README, runbook, schema SQL và tài liệu P10–P11. Các kiểm chứng chỉ đọc tại baseline đã hoàn thành: **96 test files / 786 Vitest tests**, price/locale/bundle/external-boundary/operational-posture tests, TypeScript build, release artifact verification và production verification. Production checker xác nhận shell, PWA và hai feed quote đang được deploy; nó không xác nhận semantic financial correctness, RLS của project Supabase thực tế hoặc recoverability của backup gia đình.

| Phạm vi không thể kết luận chỉ từ repository | Lý do | Evidence cần có ở pha sau |
|---|---|---|
| RLS đang áp dụng đúng tại Supabase production | `schema.sql` là intended source, không phải migration history/DB state thực tế | Output dashboard/CLI của đúng project hoặc integration test với hai user test account |
| Một backup gia đình cụ thể có thể restore | Không đọc hoặc dùng dữ liệu owner thật trong audit | Recovery drill bằng fixture tổng hợp trên browser profile riêng |
| Quy tắc thuế Đức hợp lệ | Không có review độc lập của Steuerberater và P11.2 vẫn bị khóa | Evidence review chuyên gia độc lập, decision record và PR riêng |

## P0 — Critical: phải đóng trước khi tuyên bố financial-integrity baseline

### P0-01 — Version truth đang bị phân mảnh và CI không phát hiện mismatch

> **Trạng thái H1: đã giải quyết.** Đoạn dưới là evidence tại thời điểm audit trước H1. Sau H1, `package.json` là source duy nhất cho `APP_RELEASE_VERSION`; runtime/UI, artifact metadata, release verification và production verification cùng dùng contract fail-closed. Dexie, backup và Supabase migration vẫn là các namespace độc lập.

`package.json` công bố `1.6.0`, `APP_VERSION` runtime là `1.8.0`, trong khi design document còn ghi `1.4.0`. Release checker và production checker hiện không assert version runtime/package/release metadata cùng một giá trị. Vì vậy backup metadata, UI version và artifact verification chưa có một contract version duy nhất. [1] [2] [3] [4]

| Rủi ro | Hành vi yêu cầu ở pha sửa |
|---|---|
| Owner hoặc support đối chiếu nhầm version khi phục hồi, báo lỗi hoặc audit release | Chọn một source of truth cho app release version; schema/Dexie/backup version vẫn là namespace độc lập |
| Một artifact/version metadata lệch nhưng CI vẫn xanh | Thêm guard fail trong CI cho package, runtime, UI/release metadata và document status được machine-check nếu còn hiển thị |
| Phá backup cũ do gộp sai app version với schema version | Giữ explicit compatibility map cho backup schema 1–4; không bump Dexie chỉ để sửa version UI |

### P0-02 — Ledger cho phép sale không có quantity/không có holding tạo cash và totalSold

`applyTransaction` clamp quantity sell về quantity đang có, nhưng vẫn cộng toàn bộ `amount - fee - tax` vào cash và toàn bộ `amount` vào `totalSold`. Nhánh quantity bằng 0 cũng vẫn credit cash. Các regression hiện tại còn assert rằng sale `quantity: 10` khi chỉ nắm 2 đơn vị tạo cash `200`, và sale không quantity khi holding là 0 tạo cash `585`. Điều này giữ quantity không âm nhưng không giữ financial meaning: portfolio có thể nhận proceeds không có chứng cứ position. [5] [6]

> **Impact:** Đây không phải chỉ là vấn đề hiển thị. Một transaction persisted/imported/synced hợp lệ về kiểu số có thể làm sai cash, total sold, market total, yearly review và bất kỳ snapshot nào replay ledger.

| Hành vi hiện tại | Contract cần được owner phê duyệt trước khi sửa |
|---|---|
| Oversell bị clamp quantity nhưng proceeds vẫn được credit | Không được silent clamp rồi ghi economics khác. Reject/quarantine/hiển thị quality error trước khi ledger áp dụng; legacy record phải được giữ nguyên evidence và được đánh dấu, không tự sửa. |
| Sale không quantity credit cash | Security sale thiếu quantity phải là unknown/incomplete, không tạo proceeds hoặc cost-basis mutation. |
| Unit test mô tả behavior unsafe là “cannot sell more than owned” | Đổi test thành invariant semantic: state không đổi hoặc return explicit rejection; tuyệt đối không có silent fallback. |

### P0-03 — Persistence validation chỉ kiểm tra numeric finite; không khóa sign economics hoặc canonical transaction contract

Transaction table hook gọi `validateTransactionNumbers`, nhưng validator chỉ yêu cầu amount/optional numerics là finite và quantity không âm. `amount` âm, `fee` âm, `tax` âm, type/date không hợp lệ, security economics thiếu trường và ISIN invalid vẫn không bị một generic canonical validation layer chặn tại persistence boundary. Trong `applyTransaction`, fee/tax finite được dùng nguyên dấu; `cash_in` với amount âm sẽ làm contribution giảm. [7] [8]

| Invariant chưa được enforce end-to-end | Hậu quả |
|---|---|
| Fee và tax phải không âm | Fee/tax âm có thể đảo ngược fees/taxes hoặc thay đổi net quantity/cash. |
| Contribution không tự giảm; withdrawal không tự tăng contribution | Amount có sign sai có thể làm aggregates sai mà numeric guard vẫn pass. |
| Security buy/sell cần economic shape nhất quán | UI, import, sync hydration và backup restore không dùng một canonical normalizer/validator chung. |
| Date/type/ISIN phải hợp lệ trước ledger | Các caller chỉ fail-safe một phần; invalid input không nhất thiết bị reject tại ingestion. |

### P0-04 — Tax estimate và prescriptive glide path đang active trong production, mâu thuẫn policy hiện tại

Simulation production imports và gọi `estimateGermanExitTax`; helper chứa `TAX_RATE`, `TEILFREISTELLUNG`, `SPARERPAUSCH` và render after-tax result qua toggle `DE-Steuern + TER`. Đây là tax calculation active, dù không phải FIFO/Vorabpauschale. Nó không có provenance pháp lý/versioned tax-year model hoặc independent tax review. [9] [10]

Song song, glide path trả về tỷ trọng equity cố định và action copy trực tiếp như “chuyển khoảng 10%”, “đưa phần an toàn lên khoảng 70%” hoặc “dừng kế hoạch góp cổ phiếu”. Không có auto-trade, nhưng đây vẫn là recommendation derived from timeline cá nhân thay vì neutral informational awareness. [11]

| Quyết định policy cần chốt trước bất kỳ code nào | Safe containment được đề xuất cho PR riêng |
|---|---|
| App có được hiển thị tax calculation không? | Cho đến khi có Steuerberater review, remove/hide public tax control và after-tax output; không thay bằng công thức mới. |
| App có được đưa tỷ trọng hay action giao dịch cụ thể không? | Chuyển glide path thành neutral awareness: date, time horizon, risk concentration and review prompt; bỏ prescriptive allocation/sell/save instructions. |
| P11.2 có được mở không? | **Không.** P11.2 vẫn blocked, độc lập với việc triage technical debt này. |

## P1 — Important: triển khai theo các PR nhỏ sau khi P0 được chấp thuận

| ID | Phát hiện | Evidence audit | Hướng xử lý có kiểm soát |
|---|---|---|---|
| P1-01 | Backup có `schemaVersion`, `exportedAt`, domains và tombstones, nhưng không có app version, Dexie/schema version rõ ràng, record counts, supported-domain manifest hay integrity checksum. | Export payload hiện tạo metadata tối thiểu; validator có duplicate guard giữa live/deleted nhưng không kiểm duplicate trong từng collection. [12] [13] | ADR backup format; versioned, backward-compatible metadata; validate trước destructive action; không tự “repair” file. |
| P1-02 | Có round-trip và legacy migration tests, nhưng không có full restore drill so sánh pre/post portfolio, positions, cash, contributed, withdrawn, goals, snapshots và settings. | Round-trip hiện chỉ kiểm một settings field và một transaction sau JSON boundary. [14] | Tạo fixture tổng hợp + export → wipe → restore → reopen → canonical replay equivalence test; thêm CI gate rõ ràng. |
| P1-03 | Provenance/dedupe tốt cho Trade Republic PDF, nhưng không có generic provenance contract cho manual/CSV/broker/source-document hash/import batch. | TR draft có `source`, `sourceVersion`, `externalRef`; UI preview và re-check duplicate trước write. [15] [16] | ADR field/retention; không thêm schema lén. Import batch, hash/reference và dedupe key chỉ mở trong migration project riêng. |
| P1-04 | Migration discipline chưa hoàn chỉnh cho Supabase: `schema.sql` bảo owner chạy trong SQL Editor, trong khi migration tree chỉ có migration `002`. | Source schema đủ intended policy nhưng không phải chain bootstrap/reproducible complete. [17] | Chuẩn hóa migration chain từ initial schema, CI validate migration order; mỗi semantics/schema change cần ADR, compatibility plan và upgrade test. |
| P1-05 | RLS policy source dùng `auth.uid() = user_id`, nhưng không có RLS integration/security test user-A/user-B/anonymous và không có bằng chứng production policy state. | Repository không có test RLS/security tích hợp; current sync tests mock Supabase. [18] [19] | Test project riêng hoặc local Supabase CI: cross-user read/update/delete, anonymous denial, deleted-user cleanup. Không dùng service role trong frontend. |
| P1-06 | Data Quality Inbox chỉ kiểm sáu issue transaction. Không có deterministic Portfolio Data Health với stale/missing quote, duplicate candidate, missing externalRef, backup age, sync conflict/dead outbox, incomplete recovery hoặc version inconsistency. | View-model display-only và deterministic là đúng, nhưng scope hiện hẹp. [20] | Xây read-only health model compose từ module facts; mỗi score/reason giải thích được, không AI và không auto-repair. |
| P1-07 | Yearly review có contributions, transaction count, fees/taxes, quality count và một price snapshot; chưa có withdrawn/current value/months contributed/missed contributions/price quality lịch sử. | `priceHistoryAvailable` chủ ý luôn `false`; không suy diễn từ một quote. [21] | Mở rộng bằng factual data provenanced only; phân biệt snapshot, transaction facts và scenario. Không đưa forecast/advice. |
| P1-08 | Không có `package-lock.json`; workflows dùng `npm install`, kể cả CI/deploy. | Dependency ranges `^` có thể drift theo thời điểm install. [2] [22] | Commit lockfile rồi đổi CI sang `npm ci`; dependency update chỉ qua PR có test/security review. |

## P2 — Improvement: không chặn P0 remediation, nhưng phải có owner và maintenance policy

| ID | Phát hiện | Khuyến nghị |
|---|---|---|
| P2-01 | `DESIGN_SYSTEM.md` hard-code version đã stale. | Sau P0-01, chỉ link/cite source of truth hoặc test documentation claim. |
| P2-02 | Legacy AI module/Edge Function còn tồn tại nhưng không có production UI caller. Payload đã allowlist và feature flag mặc định off, nhưng dormant infrastructure vẫn có maintenance/security surface. [23] [24] | Giữ frozen theo runbook hoặc retire qua ADR/PR riêng, import-graph check và edge-smoke decision; không thêm AI mới. |
| P2-03 | Vite cảnh báo initial chunk > 500 kB minified, dù gzip budget hiện pass. | Sau correctness work, profile code split only if it giữ offline/PWA/release behavior; không đổi kiến trúc chỉ để làm đẹp. |

## Already good / do not touch without a narrowly scoped regression reason

| Area | Tại sao được đánh giá tốt | Ranh giới giữ nguyên |
|---|---|---|
| Local-first persistence | Dexie có typed stores, transaction numeric hook và migration version history; direct numeric invalid rows bị chặn tại physical table. [7] | Không reset DB, không bump Dexie cho UI-only work. |
| Canonical replay foundation | Today Center và depot reconciliation replay transaction qua `applyTransaction`, filter deleted rows và dùng market valuation layer thay vì hand-calculate holdings. [25] [26] | Sửa `applyTransaction` chỉ trong P0 financial PR có golden regressions và legacy-data plan. |
| Sync safety | Per-user queue/browser lock, conditional update, explicit unresolved conflicts, retry/dead items, pull-first hydration và tombstone acknowledgements có test coverage dày. [19] | Không auto-merge conflict hoặc silent overwrite. |
| Backup restore safety boundary | Public import validates before clear, blocks pending outbox/conflict by default, uses explicit risk override và atomic tombstone/outbox restore path. [13] [27] | Không bypass wrapper để gọi unchecked restore từ UI. |
| Quote provenance | Envelope/row validation, ISIN checksum, no future date, duplicate key reject, provider URL/provenance, offline/error states và shared ingestion promise đều rõ ràng. [28] | Không nới stale/cross-check/fallback protection chỉ để luôn có price. |
| Family handoff & P11.1 privacy | Handoff summary giới hạn count/status, không lộ contact/location/account. Lot Evidence dùng fixture synthetic, read-only, no tax/FIFO result và unknown states explicit. [29] | Không nối P11.1 vào vault/storage khi P11.2 còn blocked. |
| CI/release baseline | Main gate hiện chạy test, posture/ledger/locale guards, build, bundle/release, edge smoke, preview smoke và deploy sau các needs; production health check quote/PWA định kỳ. [22] [30] | Không dùng `continue-on-error` cho correctness/security tests. |

## Roadmap hardening đề xuất — không phải lệnh triển khai tự động

Mỗi hàng dưới đây phải là **một PR nhỏ**, có owner decision record và giữ P11.2 blocked. Không được gộp work UI với schema/ledger/sync semantics.

| Thứ tự | PR/pha đề xuất | Điều kiện merge tối thiểu |
|---:|---|---|
| H0 | Decision record: tax UI/active formula và glide-path policy; freeze/remove/hide theo policy đã chốt. | Không có tax formula mới; UI test chứng minh không render tax result/direct recommendation nếu policy cấm. |
| H1 | Single source of app version + CI contract. | package/runtime/release/prod checker cùng version; schema/backup compatibility giữ nguyên. |
| H2 | Canonical transaction validation + financial invariant hardening. | Reject/quarantine explicit for oversell, missing sale qty, negative economics and invalid semantics; no silent legacy rewrite; deterministic replay regression. |
| H3 | Backup integrity metadata and full restore drill. | Export/restore equivalence across all supported domains; corrupt/duplicate/unsupported payload fail closed. |
| H4 | RLS evidence and sync security. | User-A/User-B/anonymous tests against controlled Supabase environment, production evidence checklist signed off; no frontend secret. |
| H5 | Provenance/import and migration ADR. | Source/reference model, dedupe rule, migration/rollback/backward-compat plan, no partial import. |
| H6 | Read-only data health and annual factual review. | Deterministic reasons, no mutation, no investment advice; complete state coverage documented. |
| H7 | Dependency lock policy, legacy AI decision, documentation/release policy. | Lockfile reproducibility, docs align with actual code, AI frozen/retired by ADR. |

## Required test matrix before final long-term readiness claim

The following must be green in addition to current gates before this repository is rated “Safe after hardening”.

| Domain | Non-negotiable regression coverage |
|---|---|
| Financial ledger | Oversell rejection, zero/missing quantity sale, invalid sign, invalid ISIN/price/quantity, deleted transaction replay, duplicates, deterministic reorder rules and UI filtering non-interference. |
| Backup/restore | Export → serialize → wipe DB → import → reopen → canonical replay equivalence for positions, cost basis, cash, contributed, withdrawn, goals, snapshots and settings. |
| Sync | Offline/retry/dead outbox/conflict/delete/recovery/logout plus controlled multi-user RLS integration checks. |
| Price | Primary/fallback/cross-check/stale/jump/missing provider/previous quote retention and provenance display. |
| Release | `npm ci`, tests, build, bundle budget, release artifact, Playwright, production health and a documented recovery drill. |

## Maintenance policy recommendation

The lockfile must become the reproducible dependency source. Every production dependency update should be a dedicated reviewed PR with test/build/security output. Every future schema, backup payload or transaction semantic change must have an ADR, explicit version/compatibility decision, upgrade test and restore test. Every financial rule change must state its authoritative source, applicable date/version, owner, validation cases and user-facing limits.

No feature may auto-correct a financial transaction, resolve a sync conflict, infer a missing lot, turn a missing price into zero, or convert an assumption into historical fact. Tax rules, broker API execution, recommendations, trading and AI remain outside the critical path. P11.2 remains blocked pending independent German tax expert review.

## Final readiness rating

**Current rating: Conditional / not ready as sole long-term financial record.** The application is already valuable as a local-first tracker with strong recovery/sync/quote foundations. It is not yet safe to rely on as the only 2026–2042 financial history, because P0 ledger semantics can create unbacked cash, sign invariants are incomplete, and the active tax/recommendation surface conflicts with the stated safety policy.

> **Answer to the owner’s key question:** The system can be used now as a convenience tracker with independent broker statements and backups retained as the authoritative evidence. It should not be treated as the sole financial record or tax basis until the P0 issues are remediated, restore equivalence is automated, RLS is evidenced in the actual environment, and the final release gate is signed off.

## References

[1]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/package.json#L1-L5 "package version"
[2]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/package.json#L6-L53 "scripts and dependencies"
[3]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/lib/types.ts#L253-L282 "runtime and schema constants"
[4]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/docs/DESIGN_SYSTEM.md#L42 "stale design-system version"
[5]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/lib/calc.ts#L183-L283 "portfolio transaction application"
[6]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/lib/calc.test.ts#L69-L152 "sale regression behavior"
[7]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/lib/db.m01a.ts#L84-L103 "physical transaction table guard"
[8]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/lib/transactionValidation.ts#L1-L51 "numeric validator"
[9]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/lib/simulation/engine.ts#L34-L107 "active German tax estimate"
[10]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/pages/Simulation.tsx#L183-L209 "simulation tax caller"
[11]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/lib/planPhase.ts#L53-L184 "glide-path policy actions"
[12]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/lib/db.m08.ts#L21-L70 "backup export payload"
[13]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/lib/backupImport.ts#L1-L58 "public fail-closed backup import"
[14]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/lib/db.backupRoundTrip.test.ts#L1-L110 "current backup round trip coverage"
[15]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/lib/tr/toTransaction.ts#L1-L100 "Trade Republic transaction provenance"
[16]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/components/TradeRepublicPdfImport.tsx#L111-L203 "import review and dedupe"
[17]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/supabase/schema.sql#L1-L104 "Supabase bootstrap schema"
[18]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/supabase/schema.sql#L21-L84 "RLS policy source"
[19]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/lib/sync/engine.ts#L68-L89 "sync locking"
[20]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/pages/transactionQualityInbox.ts#L1-L78 "current quality inbox"
[21]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/pages/yearInReview.ts#L1-L117 "yearly factual review"
[22]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/.github/workflows/deploy.yml#L1-L143 "CI and deploy workflow"
[23]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/lib/aiTraceExplanation.ts#L1-L153 "legacy AI boundary"
[24]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/docs/OPERATIONS_RUNBOOK.md#L187-L195 "legacy AI operational decision"
[25]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/lib/todayCenterAdapter.ts#L72-L195 "canonical portfolio replay"
[26]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/lib/depotReconciliation.ts#L1-L289 "read-only depot reconciliation"
[27]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/lib/db.m09.ts#L262-L395 "atomic V4 restore path"
[28]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/lib/quoteFeed.ts#L123-L352 "quote feed validation and ingestion"
[29]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/src/pages/householdHandoff.ts#L1-L80 "privacy-preserving household handoff"
[30]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/43cd59d4ced08c88970896e3b13202d437dd9013/.github/workflows/production-health.yml#L1-L25 "scheduled production health"
