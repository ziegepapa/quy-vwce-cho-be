# P10.0 — Baseline Continuity & Long-Term Risk Register

**Baseline:** `main` tại `2271190` (P8 hoàn tất).  
**Trạng thái:** Đặc tả/risk register; không bật AI/API, không thay đổi dữ liệu, không tính thuế và không deploy endpoint mới.  
**Mục đích:** Biến đánh giá owner về độ bền 16 năm thành một chuỗi thay đổi nhỏ, có thể kiểm chứng và không làm suy yếu local-first.

> **Quyết định P10:** Giá trị ưu tiên là khả năng tiếp quản, khôi phục, hiểu trạng thái và kiểm chứng boundary. P10 không biến tracker thành phần mềm kê khai thuế, broker, dịch vụ backup cloud hay AI assistant.

## 1. Các bất biến P10

| Miền | Contract P10 |
|---|---|
| **Ledger** | Không thay công thức, cost basis, P&L, dòng tiền, lot, transaction type hay simulation. Không tự tạo/sửa/xóa/dedupe giao dịch. |
| **Tax** | Không tính Vorabpauschale, FIFO, Kapitalertragsteuer hay tạo tax filing/export trong P10. App tiếp tục là công cụ theo dõi nội bộ, không phải kết quả thuế. |
| **Backup/recovery** | Giữ safety backup và import fail-closed. Không upload/scan file, không tự nhắc bằng background job, không khẳng định file backup nằm ở nơi an toàn. |
| **Data/sync/auth** | Không migration/Dexie version bump, không thay đổi `src/lib/**` data/sync/auth, không polling/webhook/auto-resolve. |
| **Privacy** | Không đưa contact, document location, account, ID giao dịch, amount, quantity, note, backup, raw diagnostic hay raw sync error vào bề mặt mới. |
| **AI/API** | P9 tạm hoãn. Không có UI AI, provider call, secret, endpoint hay feature flag mới. Legacy AI chỉ được xử lý qua quyết định retire riêng ở P10.4. |
| **Release** | `test-build`, `edge-smoke`, `preview-smoke`, deploy main và production verification vẫn là gate bắt buộc; JS entry ≤400 KiB gzip, CSS ≤40 KiB gzip. |

## 2. Phân loại yêu cầu owner

| Nhận xét owner | Kết luận P10 | Đầu ra dự kiến | Không làm trong P10 |
|---|---|---|---|
| Làm rõ FIFO/Vorabpauschale và tax export theo lot | **P11 design-only.** Đây là phạm vi thuế có tính hệ quả; cần đặc tả source/fiscal-year/lot/reconciliation riêng. | P10.5 tạo `P11 tax/lot discovery brief`, nêu giới hạn app hiện tại và câu hỏi cho Steuerberater. | Không công thức, số thuế, recommendation, tax export hoặc schema/ledger change. |
| Backup nhiều nơi và recovery drill hàng năm | **P10.4.** Đưa recovery drill/readiness vào UI/runbook bằng guidance local-only. | Read-only Recovery Readiness guide, annual drill checklist, evidence tối thiểu không nhạy cảm. | Không cloud upload, scheduled job, file-system scan hay “backup verified” badge. |
| Bus factor/Supabase/GitHub Pages dependency | **P10.1, P10.3, P10.5.** Làm handoff route/print an toàn và dependency exit register. | Family Readiness Center, continuity snapshot local, dependency ownership/exit steps trong runbook. | Không chuyển nhà cung cấp, không export credential, không thêm shared cloud account. |
| Static-app security/RLS posture | **P10.4.** Kiểm source/build boundary và tạo production verification runbook. | Secret exposure canary, RLS evidence checklist, auth/privacy wording chính xác. | Không kết luận RLS production đang đúng chỉ từ source migration; không đọc/ghi production row của owner. |
| AI legacy debt | **P10.4.** Đề xuất retire, không giữ dormant provider surface khi P9 hoãn. | ADR/PR retire `aiTraceExplanation` + `explain-trace`, xóa CI AI smoke/flag sau replacement guard. | Không “bật để thử” hoặc giữ endpoint chỉ để dự phòng. |
| Thiếu bằng chứng UX/chất lượng | **P10.3.** Public-safe product evidence dùng fixture tổng hợp và số test/build đã kiểm chứng. | README/docs evidence index, synthetic screenshots; không dùng vault/capture owner. | Không public backup, sync state, account/tài sản hay screenshot dữ liệu thật. |

## 3. Rủi ro dài hạn và control

| Rủi ro | Dấu hiệu/trust boundary | Control P10 | Bằng chứng chấp nhận |
|---|---|---|---|
| Owner/maintainer không thể tiếp quản | Người thân không biết mở route nào hoặc xử lý pending/recovery ra sao. | Readiness Center + print snapshot + runbook theo vai trò. | CTA deep-link local, mobile/locale review, snapshot không lộ dữ liệu. |
| Khôi phục “có vẻ” an toàn nhưng chưa drill | Owner có file export nhưng không có evidence fail-closed/restore flow. | Test-vault annual drill checklist và Recovery Readiness guide. | Drill mô tả fixture-only, malformed/unsupported input rejected, no mutation/reload canary. |
| Nhà cung cấp thay đổi/gián đoạn | GitHub Pages, Supabase, quote source hoặc domain config thay đổi. | Dependency register: owner, purpose, minimum viable exit action, test frequency. | Runbook có entry cho Pages/Supabase/backup, không có secret. |
| RLS/source drift | Public anon key phải ở static bundle, còn service-role/secret không được phép xuất hiện. Migration có RLS nhưng production state không được source chứng minh. | Source/bundle canary + owner-run production RLS evidence procedure. | CI cấm service-role/private env marker; checklist ghi bằng chứng dashboard/CLI owner cần lưu. |
| AI legacy attack surface | Dormant Edge Function/flag/CI smoke vẫn tồn tại trong khi P9 hoãn. | Retire toàn bộ legacy module/function/flag/smoke/docs references và thay bằng AI-absence guard. | Build/source/import/CI check không còn provider/Edge AI routes; no outbound endpoint in PWA. |
| Tax misunderstanding | User nhầm cost basis nội bộ là số thuế Đức, hoặc dùng tracker để khai thuế. | README/runbook wording + P11 discovery scope. | UI/docs nói rõ internal tracking; không output calculation/filing claim. |
| Public evidence leak | Screenshot/demo vô tình lộ dữ liệu gia đình. | Synthetic fixture only, pre-publication sensitive-data scan. | Visual assets không có canary hoặc owner data; review checklist. |

## 4. Security posture: điều đã chứng minh và điều chưa thể kết luận

### 4.1. Evidence từ source hiện tại

Source migration đã bật Row Level Security và policy `auth.uid() = user_id` cho các bảng sync được định nghĩa trong repository. Client static khởi tạo Supabase bằng `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`; đây là public client configuration, không phải server secret. `.env.example` để `VITE_AI_TRACE_ENABLED=false`.

> **Giới hạn quan trọng:** Source/migration cho thấy _intended policy_, không phải bằng chứng chắc chắn về policy đang áp dụng trên production Supabase. P10 không được tuyên bố “RLS production đã đạt” nếu không có evidence owner thu thập từ dashboard/CLI/migration history của đúng project.

### 4.2. Control P10.4 đề xuất

| Control | Loại | Hành vi |
|---|---|---|
| `check:public-config-boundary` | CI source/build scan | Cho phép anon URL/key public contract; từ chối `service_role`, private key prefix, server secret, `SUPABASE_SERVICE_ROLE_KEY` hoặc provider key trong source/bundle. |
| RLS evidence checklist | Runbook, owner-run | Xác nhận đúng project/ref, RLS enabled và policy per user trên bảng sync; capture chỉ metadata policy, không export row/data. |
| Auth role test plan | Test/environment-specific | Kế hoạch test anonymous/cross-user access tại staging/test project bằng fixture synthetic; không chạy trên owner vault. |
| Secret rotation/exit note | Runbook | Owner biết nơi rotate/revoke URL/key credentials; public anon key leak không được xem là license để tắt RLS. |

## 5. AI legacy retirement decision

### 5.1. Quyết định đề xuất

**Retire AI legacy trong P10.4.** P9 đã được owner tạm hoãn, không có runtime UI caller, và dormant code giữ provider/env/CI surface không tạo giá trị hiện tại. Không nên giữ `aiTraceExplanation.ts` hay `explain-trace` như “có thể bật sau” vì P9 tương lai đã yêu cầu capability/consent/gateway mới, không nên tái sử dụng prototype legacy.

| Artefact legacy cần retire | Lý do | Hành động P10.4 |
|---|---|---|
| `src/lib/aiTraceExplanation.ts` và test | Không có UI caller; client design không phù hợp cho P9 consent/gateway mới. | Xóa module/test, xác nhận import graph rỗng. |
| `supabase/functions/explain-trace/` | Có khả năng gọi provider qua env; dormant egress risk. | Xóa function/README, Deno check/smoke liên quan. |
| `scripts/smoke-ai-edge.mjs` | Chỉ phục vụ function legacy. | Xóa script và job/step CI liên quan sau source guard replacement. |
| `VITE_AI_TRACE_ENABLED` | Feature flag build không dùng. | Xóa .env example/type/workflow injection và docs mentions. |
| External-boundary guard P8.4 | Có thể giữ assumptions về legacy smoke. | Thay bằng guard `no-ai-runtime` kiểm tra không có AI/client/provider/function references. |

P10.4 phải vẫn giữ `test-build`, `preview-smoke` và deploy. Nếu workflow `edge-smoke` hiện chỉ có mục đích AI legacy, rename/re-scope hoặc remove sau khi xác nhận không còn Edge Function khác cần check — không giữ gate “xanh giả” không bảo vệ runtime.

### 5.2. Điều kiện rollback

Retirement không xóa tính năng owner đang dùng vì không có UI caller. Nếu owner quyết định trở lại P9 AI, bắt đầu từ ADR/data manifest/consent gateway mới; không revert dormant function như một shortcut. Git history vẫn là evidence, nhưng app/CI production không giữ code provider dormant.

## 6. P11 discovery: German tax and lot reconciliation

> **Lưu ý thuế:** Tôi không phải chuyên gia thuế; mọi tính toán, khai báo hoặc quyết định liên quan Vorabpauschale/FIFO/Kapitalertragsteuer cần được Steuerberater hoặc chuyên gia thuế Đức kiểm tra trước khi dựa vào hay nộp.

P11 bắt đầu bằng research/ADR, không bằng calculator. Mục tiêu là trả lời app có thể cung cấp **evidence export/read-only** nào để owner đối chiếu broker/tax advisor, và dữ liệu nào không đủ tin cậy để mô phỏng thuế.

| Câu hỏi P11 bắt buộc | Tại sao phải khóa trước mã |
|---|---|
| Source-of-truth nào cho taxable event: broker statement, tax certificate, transaction lot hay price history? | Internal cost basis không tự động là tax basis. |
| FIFO áp dụng chính xác ở level nào và app có đủ lot identity/order/corporate action data không? | Không được suy diễn tax lot từ transaction aggregate. |
| Vorabpauschale cần tax-year inputs/rates/exemptions nào, ai nhập và nguồn nào được cite? | Các tham số có thể thay đổi theo năm; calculator cố định dễ gây kết quả sai. |
| Broker đã khấu trừ/điều chỉnh gì và khi nào? | Tránh double counting hoặc trùng với dữ liệu internal. |
| Export target là evidence CSV hay tax computation? | Evidence-only có risk thấp hơn nhiều; tax computation cần review/chuyên gia. |
| Data model có cần migration không? | Nếu cần, nó là project riêng với backup/import/sync review đầy đủ. |

Trang Investmentsteuer của Bộ Tài chính Đức là nguồn khởi đầu chính thức cho research P11; không có công thức hoặc tax output nào được đưa vào app từ P10.[1]

## 7. Definition of Done P10.0

1. Mọi điểm từ đánh giá owner đã được phân loại vào P10, P11 discovery hoặc explicit non-goal.
2. README/runbook không hiểu nhầm tracker là tax calculator, backup cloud service, audit log đầy đủ hoặc AI-enabled app.
3. AI legacy retirement được đặt thành P10.4 với bảng artefact/CI transition rõ ràng; không bật flag để test.
4. Security wording tách biệt source evidence và production RLS evidence; không đưa claim không kiểm chứng.
5. Không sửa schema, `src/lib/**` data/sync/auth, economics ledger hoặc runtime product.
6. `npm test`, ledger benchmark, locale audit, boundary guard, build, bundle/release/preview đều xanh trước merge docs baseline.

## References

[1]: https://www.bundesfinanzministerium.de/Web/DE/Themen/Steuern/Steuerarten/Investmentsteuer/investmentsteuer.html "Bundesfinanzministerium — Investmentsteuer"
[2]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/docs/OPERATIONS_RUNBOOK.md "VWCE Vault Operations Runbook"
[3]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/docs/ADR-007-optional-ai-api-boundary.md "ADR-007 — Optional AI/API boundary"
