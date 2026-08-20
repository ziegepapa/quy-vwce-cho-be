# P8.0 — Baseline, dữ liệu report và kiểm kê AI legacy

**Baseline commit:** `a41af80` (P7.5 hoàn tất)  
**Trạng thái:** Đặc tả và kiểm kê; không kích hoạt AI/API.  
**Mục tiêu P8:** Cung cấp các bề mặt review gia đình chỉ đọc, local-first, dùng dữ liệu hiện có và không thay đổi ledger, backup, sync hay quyết định của owner.

> **Kết luận về AI hiện tại:** Không có nút, route, panel hoặc component AI nào được nối vào giao diện VWCE Vault. Vì vậy owner không thể thấy hay dùng AI trên production hiện tại. Các tệp Trace AI là hạ tầng legacy không được gọi từ UI; P8 không bật, không mở rộng và không gọi hạ tầng này.

## 1. Bất biến P8

| Miền | Bất biến áp dụng cho P8 |
|---|---|
| Ledger | Không có công thức, số dư, vốn góp, P&L, cost basis hoặc simulation thứ hai. Report dùng aggregate/view-model hiện có. |
| Giao dịch | Không tự tạo, sửa, xóa, dedupe, phân loại hoặc tự đồng bộ giao dịch. |
| Backup/recovery | Giữ safety backup trước import, validate fail-closed, không đổi payload/schema/Dexie version. |
| Sync/conflict | Không sửa `src/lib/**` data/sync/auth, không polling, không auto-resolve và không bypass logout/recovery guard. |
| Local-first | Không có upload, telemetry, API call hoặc background request mặc định. Mọi report phải hữu ích khi offline. |
| Locale/a11y | UI mới có đủ Việt/Đức; dữ liệu owner nhập không bị dịch; Escape/Hủy chỉ đóng an toàn. |
| Hiệu năng | Initial entry vẫn trong budget CI: JavaScript ≤400 KiB gzip và CSS ≤40 KiB gzip. Công cụ nặng tiếp tục lazy-load. |
| AI/API | Không bật, không mở rộng, không đưa vào core path và không gửi dữ liệu theo mặc định. |

## 2. AI hiện nằm ở đâu?

AI hiện chỉ tồn tại ở **hạ tầng legacy không có UI caller**. Bảng dưới là inventory chính xác tại baseline P8.0.

| Vị trí | Vai trò thực tế | Có xuất hiện trong UI không? | Trạng thái P8 |
|---|---|---|---|
| `src/lib/aiTraceExplanation.ts` | Định nghĩa feature flag `VITE_AI_TRACE_ENABLED`, dựng payload Trace giới hạn, kiểm session Supabase và có thể gọi Edge Function `explain-trace`. | **Không.** Không có component/page nào import module này ngoài test. | Giữ nguyên, không gọi và không mở rộng. |
| `src/lib/aiTraceExplanation.test.ts` | Test payload/response contract của module legacy. | Không. | Giữ test regression. |
| `supabase/functions/explain-trace/index.ts` | Edge Function nhận Trace payload sau khi có authenticated session, rồi mới có khả năng gọi provider nếu secrets server-side đã được cấu hình. | **Không.** Không được deploy hoặc kích hoạt từ UI trong P8. | Chỉ được Deno-check/smoke cách ly trong CI; không egress production qua P8. |
| `scripts/smoke-ai-edge.mjs` | Môi trường mock cách ly để smoke Edge Function. | Không. | Không gọi provider thật. |
| `.github/workflows/deploy.yml` | Truyền repository variable `VITE_AI_TRACE_ENABLED` vào build nếu variable tồn tại; chạy Deno check/smoke isolation. | Không tự sinh nút. | Không thay đổi variable hay secret trong P8. |
| `src/lib/todayCenterTrace.ts`, `traceModel.ts` | Tạo model “Trace” deterministic từ các số/công thức có sẵn. | Không phải AI và không tự gửi dữ liệu. | Có thể được dùng cho explainable UI local ở tương lai, nhưng không là AI integration. |

### Vì sao owner không thấy AI?

Để người dùng thấy AI, cần đồng thời có một component UI import module AI, một nút owner chủ động kích hoạt, feature flag build bật, Supabase được cấu hình, người dùng đã đăng nhập, Edge Function được deploy và provider secret hợp lệ. Baseline P8.0 không có điều kiện đầu tiên: **không có UI caller/import runtime cho `aiTraceExplanation.ts`**. Vì thế ngay cả nếu repository variable có giá trị, app hiện tại vẫn không có bề mặt AI để bấm.

Quyền đọc repository variables bị GitHub từ chối cho token hiện tại (`403 Resource not accessible by integration`). Điều này không làm thay đổi kết luận từ import graph: không có route/component runtime gọi module AI. P8 không yêu cầu quyền đó, không thay đổi variable và không cố gọi endpoint để suy luận cấu hình.

> **Phân biệt quan trọng:** “Trace deterministic” là diễn giải cục bộ dựa trên dữ liệu/công thức hiện có. Nó không là AI, không dùng mạng và không thay thế quyết định owner. Edge Function `explain-trace` là phần legacy có thể gọi provider ngoài nếu một triển khai riêng đã cấu hình nó; nó vẫn bị tách hoàn toàn khỏi UI P8.

## 3. Data contract cho P8.1 và P8.2

P8 chỉ có thể hiển thị dữ liệu nếu định nghĩa của nó được khóa ở lớp view-model/test trước. Các nhãn report không được suy diễn hành vi hoặc lời khuyên cho owner.

| Khái niệm UI P8 | Nguồn được phép | Nhãn trung lập | Không được suy diễn |
|---|---|---|---|
| Kế hoạch cấu hình | Setting/goal hiện có đã được owner lưu. | “Kế hoạch” / “Plan”. | Kế hoạch là lời khuyên hay cam kết lợi nhuận. |
| Khoản ghi nhận | Aggregate chỉ đọc từ transaction types được P8.1 xác minh theo fixture và quy ước dòng tiền hiện hành. | “Đã ghi nhận” / “Erfasst”. | Owner đã/nên nộp thêm tiền hay “bỏ lỡ” giao dịch. |
| Chênh lệch ghi nhận | Kế hoạch trừ aggregate cùng thời kỳ và cùng definition. | “Chênh lệch ghi nhận” / “Erfasste Differenz”. | Nợ, sai sót hoặc khuyến nghị hành động. |
| Phí/thuế đã ghi | Tổng các transaction record tương ứng trong report period. | “Đã ghi nhận” / “Erfasst”. | Nghĩa vụ thuế, con số phải nộp hoặc kết quả tư vấn. |
| Chất lượng dữ liệu | Tín hiệu display-only hiện có từ Data Quality Inbox. | “Cần kiểm tra dữ liệu” / “Daten prüfen”. | Một giao dịch sai; UI không được tự sửa. |

Nếu setting hoặc transaction không đủ để tính một card, card phải hiển thị trạng thái **chưa đủ dữ liệu** thay vì dùng default, extrapolate hoặc số 0 giả. Tombstone/deleted record không xuất hiện trong report. Thay đổi filter/report không được làm thay analytics, transaction, sync status hoặc backup.

## 4. Phạm vi P8 theo pha

| Pha | Đầu ra được phép | Điều bị cấm |
|---|---|---|
| **P8.0** | Tài liệu baseline, inventory AI, matrix data/locale/a11y, regression plan. | Bật flag, deploy Edge Function, gọi provider, schema/data/sync change. |
| **P8.1** | Plan-versus-recorded view-only theo tháng/năm, điều hướng đến filter Transactions hiện có. | Giao dịch mới, tự đổi Sparplan, advice, default data bịa. |
| **P8.2** | Year-in-review HTML/print-safe, handoff links local. | Upload, email/share tự động, tax/investment conclusions. |
| **P8.3** | Review/preview import, candidate warning và owner confirmation. | Auto-dedupe, auto-create, auto-sync, bypass import guards. |
| **P8.4** | Recovery drill/test, production handoff, policy audit external boundary. | Bật/đổi optional Trace hay gọi AI/API. |
| **P8.5** | Full smoke, CI/deploy verification và runbook. | Merge khi gate/deploy lỗi hoặc bỏ qua regression. |

## 5. Matrix kiểm thử bắt buộc

| Lớp | P8.1/P8.2 | P8.3 | P8.4/P8.5 |
|---|---|---|---|
| Correctness | Aggregate deterministic, empty/missing state, no mutation, tombstone excluded. | Malformed input, cancel/Escape, candidate duplicate, safety backup, pending sync. | Recovery drill fixture, no-egress canary, full regression. |
| Locale/a11y | Việt/Đức thuần, formatter, 320/390 px, keyboard/focus/print. | Việt/Đức, dialog focus/Escape, mobile review. | Locale policy, runbook terminology. |
| Performance | Không full-render ledger; bundle analysis/CI budget. | PDF importer vẫn lazy; không tăng entry path. | Budget/release/preview smoke. |
| CI/release | `npm test`, ledger benchmark, locale audit, build, bundle check, release, preview. | Các gate tương tự cùng import fixtures. | `test-build`, `edge-smoke`, `preview-smoke`, main deploy thành công. |

## 6. Quyết định trước P8.1

P8.1 chỉ bắt đầu sau khi owner chấp nhận các định nghĩa **“khoản ghi nhận”** và **“chênh lệch ghi nhận”** là ngôn ngữ trung lập, không phải đánh giá khoản góp. P8.2 chỉ thêm in/lưu bằng hành động browser owner-initiated. Optional Trace legacy không thuộc core P8; việc giữ nguyên hay retire nó cần ADR/PR độc lập sau P8.4, không được lồng vào màn plan hoặc report.

## References

[1]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/docs/ADR-007-optional-ai-api-boundary.md "ADR-007: Ranh giới AI/API tùy chọn"
[2]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/docs/OPERATIONS_RUNBOOK.md "Runbook vận hành và bàn giao VWCE Vault"
[3]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/src/lib/aiTraceExplanation.ts "Legacy AI Trace client module"
[4]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/supabase/functions/explain-trace/index.ts "Legacy explain-trace Edge Function"
[5]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/docs/transactions-scale.md "Transactions at scale"
