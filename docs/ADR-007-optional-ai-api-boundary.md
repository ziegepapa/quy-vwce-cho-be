# ADR-007: Ranh giới AI/API tùy chọn

**Trạng thái:** Được chấp nhận trong P7.4  
**Ngày:** 20-08-2026  
**Quyết định:** **Không tích hợp AI hoặc API bên ngoài trong P7.**

> **Kết luận:** VWCE Vault phải vận hành đầy đủ khi không có AI, không có API bên ngoài và không có kết nối mạng. Mọi AI/API trong tương lai chỉ có thể là lớp hỗ trợ do owner chủ động bật cho một mục đích hẹp đã được phê duyệt riêng.

## Bối cảnh

Các luồng quan trọng của VWCE Vault là ghi nhận dữ liệu, xem ledger, sao lưu/phục hồi, đồng bộ, xử lý xung đột và kiểm tra chất lượng dữ liệu. Các luồng này đã có hành vi local-first, fail-closed và không tự thay đổi giao dịch. Việc thêm AI/API không giải quyết một blocker vận hành hiện tại, nhưng có thể mở rộng bề mặt gửi dữ liệu, chi phí, lỗi mạng và kỳ vọng không đúng về tự động hóa.

| Điều đã có | Bảo đảm hiện tại | AI/API không được làm suy yếu |
|---|---|---|
| Ledger và giao dịch | Owner tạo, sửa và xác nhận giao dịch. | Không tự tạo, sửa, xóa, phân loại hoặc suy diễn giao dịch. |
| Backup/phục hồi | Import fail-closed, có backup bảo vệ trước import. | Không tải backup lên dịch vụ ngoài hoặc dùng AI để diễn giải/tự sửa file. |
| Sync/conflict | Owner chọn từng resolution; không auto-resolve. | Không đề xuất rồi tự áp dụng, tự gộp hoặc tự ghi đè. |
| Diagnostics | Local-only, allowlist, không có lỗi/payload gốc. | Không dùng diagnostics làm telemetry/prompt mặc định. |
| Locale | Việt/Đức thuần theo route reachable. | Không đưa copy chưa được kiểm duyệt vào UI production. |

## Quyết định và phạm vi

P7.4 chỉ ghi nhận quyết định kiến trúc. Không có SDK AI, API key, connector, endpoint, scheduled job, webhook, analytics từ xa, prompt, hay dữ liệu owner nào được thêm vào repository hoặc được gọi khi chạy ứng dụng.

Các cấu hình hoặc feature có tên “AI” đã tồn tại trong môi trường phát hành không được hiểu là một quyền cho tính năng AI trong product. Chúng không được dùng để gửi dữ liệu, thay đổi luồng ứng dụng hoặc mở kết nối mới nếu chưa có ADR/PR riêng.

## Yêu cầu bắt buộc trước một đề xuất AI/API tương lai

Một đề xuất chỉ được bắt đầu khi tất cả điều kiện dưới đây đã được phê duyệt trong một đặc tả và PR riêng. Việc có API khả dụng hoặc có API key không phải lý do đủ để triển khai.

| Chủ đề | Yêu cầu tối thiểu |
|---|---|
| Use case | Một tác vụ hỗ trợ cụ thể, có lợi ích đo được, không thay thế chức năng local-first hiện có. |
| Tính tùy chọn | App hoạt động không suy giảm khi owner không bật, từ chối hoặc thu hồi quyền. Không có prompt/API call nền. |
| Đồng ý | Màn hình đồng ý nêu rõ mục đích, nhà cung cấp, loại dữ liệu, thời điểm gửi, giới hạn sử dụng và cách tắt. Đồng ý phải diễn ra trước mỗi loại dữ liệu mới; không suy diễn từ đăng nhập. |
| Tối thiểu hóa dữ liệu | Chỉ gửi trường tối thiểu đã được allowlist. Mặc định cấm giao dịch, số tiền, số lượng, ghi chú, ISIN, goal, backup, file PDF, email, user ID, token, diagnostics, outbox/conflict payload và thông tin khẩn cấp. |
| Kiến trúc khóa bí mật | Không để credential hoặc API key trong PWA/browser, `localStorage`, backup, source bundle hoặc log. Bất kỳ proxy server-side nào cần threat model, authz, rate limit, timeout và deletion policy riêng. |
| Hành vi lỗi | Timeout, offline, quota, lỗi nhà cung cấp hoặc dữ liệu phản hồi không hợp lệ chỉ cho trạng thái an toàn; không retry vô hạn, không chặn app, không làm mất/sửa dữ liệu local. |
| Quyền quyết định | Output chỉ là thông tin hỗ trợ. Nó không được là tư vấn đầu tư/thuế/pháp lý, không auto-submit, auto-save, auto-resolve conflict, auto-import hay auto-export. |
| Đánh giá chi phí | Trước khi bật, owner phải thấy đơn vị tính, giới hạn chi phí, cách tắt và hành vi khi đạt giới hạn. Không cam kết mức phí hoặc mức sử dụng trong UI khi chưa có nguồn chính thức. |
| Khả năng kiểm thử | Có unit/UI/contract test cho đồng ý, từ chối, thu hồi, payload allowlist, offline/timeout, locale Việt/Đức, accessibility, no-secret canary và no-mutation canary. |

## Mô hình đồng ý được chấp nhận nếu có pha triển khai riêng

Nếu có use case hợp lệ sau này, luồng tối thiểu phải là: owner mở một công cụ hỗ trợ tùy chọn, đọc data manifest, chọn rõ **Đồng ý gửi một yêu cầu**, xem kết quả chỉ đọc, rồi tự quyết định thao tác tiếp theo ở UI local hiện có. Nút Đóng/Hủy/Escape luôn đóng an toàn và không phát yêu cầu.

> **Không dùng đồng ý gộp:** Không có lựa chọn “đồng ý cho mọi AI/API trong tương lai”, không bật ngầm qua setting mặc định, và không tái sử dụng đồng ý cho loại dữ liệu hoặc nhà cung cấp khác.

## Ví dụ phạm vi bị từ chối

| Đề xuất | Lý do từ chối ở trạng thái hiện tại |
|---|---|
| Gửi JSON backup lên AI để “sửa lỗi” | Bao gồm dữ liệu ledger/goal và có nguy cơ thay đổi phục hồi. |
| Tự phân loại/tạo giao dịch từ PDF | Có thể tạo hoặc thay đổi ledger; PDF là dữ liệu nhạy cảm. |
| Tự chọn bản local/server khi có conflict | Vi phạm owner-confirmed conflict contract. |
| Tạo khuyến nghị mua/bán, dự báo hoặc thuế | Không thuộc mục đích tracker và vượt ranh giới tư vấn. |
| Telemetry AI ngầm từ diagnostics | Vi phạm local-only diagnostics và consent. |

## Checklist review cho PR AI/API tương lai

1. ADR này vẫn còn phù hợp hoặc được thay thế rõ ràng.
2. Có use case, data manifest và luồng đồng ý được owner phê duyệt.
3. Không thay đổi schema/Dexie, `src/lib/**` data/sync/auth, economics ledger hoặc semantics backup/conflict trừ khi có đặc tả riêng.
4. Kiểm tra mã nguồn/bundle/log không chứa API key, prompt thô, payload cấm hoặc dữ liệu canary.
5. Có test Việt/Đức, keyboard/dialog safety, offline/timeout, deny/revoke và no-mutation.
6. `npm test`, performance guard, locale policy, build, bundle budget, release verification, preview smoke và các gate CI đều đạt trước merge.

## Hệ quả

P7 giữ app đơn giản hơn, riêng tư hơn và không phụ thuộc vào dịch vụ ngoài. Đổi lại, không có tính năng AI mới trong P7. Đây là kết quả có chủ đích: khi chưa có use case owner-approved và ranh giới dữ liệu đủ chặt, **không gọi API** là lựa chọn an toàn nhất.
