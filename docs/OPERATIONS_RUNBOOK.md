# Runbook vận hành và bàn giao VWCE Vault

**Phiên bản:** P6.6  
**Đối tượng:** Owner gia đình, người vận hành dự án, hoặc người bảo trì tiếp theo.  
**Phạm vi:** Hướng dẫn sử dụng và kiểm tra vận hành. Tài liệu này không phải tư vấn đầu tư, thuế hoặc dự báo lợi nhuận.

> **Nguyên tắc an toàn:** Ứng dụng không tự thay đổi giao dịch để xử lý lỗi, không tự gộp hoặc tự chọn phiên bản khi có xung đột, và không đưa ra khuyến nghị đầu tư hoặc thuế.

## 1. Mục tiêu vận hành

VWCE Vault là PWA ưu tiên thiết bị di động, lưu dữ liệu cục bộ và chỉ đồng bộ khi người dùng đã đăng nhập. Các trạng thái đồng bộ, khôi phục và xung đột được thiết kế theo nguyên tắc **fail closed**: nếu chưa thể xác minh an toàn, dữ liệu hiện có được giữ nguyên và thao tác có rủi ro sẽ không được tự động tiếp tục.

| Khu vực | Mục tiêu vận hành | Không được suy diễn thành |
|---|---|---|
| **Sync Health** | Biết trạng thái đồng bộ và bước tiếp theo an toàn. | Khẳng định giao dịch đã được server chấp nhận khi còn `pending`, `retry` hoặc `offline`. |
| **Xung đột dữ liệu** | Để owner xem từng xung đột và tự xác nhận lựa chọn. | Cơ chế gộp dữ liệu, tự chọn bản local/server, hoặc ghi đè tự động. |
| **Data Quality Inbox** | Rà soát giao dịch thiếu thông tin theo dạng chỉ đọc. | Tự điền, tự sửa hoặc kết luận về hiệu quả đầu tư. |
| **Diagnostics trên thiết bị** | Có dấu vết trạng thái kỹ thuật tối thiểu để tự kiểm tra. | Telemetry từ xa, theo dõi người dùng, hay log lỗi/giao dịch chi tiết. |
| **PWA/offline** | Tiếp tục mở app shell khi đã cài/nạp trước và mất mạng. | Cam kết mọi dữ liệu mới đã được đồng bộ khi đang offline. |

## 2. Kiểm tra nhanh hằng ngày

Sau khi mở ứng dụng, quan sát **Sync Health** ở header hoặc trong phần **Cài đặt → Nâng cao**. Trạng thái `Đã đồng bộ` / `Synchronisiert` chỉ cho biết hiện không có thay đổi hay xung đột đang được phát hiện. Nếu có việc đang chờ, hãy đọc dòng “bước tiếp theo” trong chính panel trước khi bấm hành động.

| Trạng thái Việt | Trạng thái Đức | Ý nghĩa thực tế | Hành động an toàn |
|---|---|---|---|
| **Đã đồng bộ** | **Synchronisiert** | Không phát hiện thay đổi hoặc xung đột đang chờ. | Có thể tiếp tục dùng app; đồng bộ lại là tùy chọn. |
| **Đang đồng bộ** | **Synchronisierung läuft** | Một lượt đồng bộ đang chạy. | Chờ hoàn tất; không cần bấm lại. Kết quả sẽ hoàn tất an toàn hoặc được đánh dấu để thử lại. |
| **Có thay đổi đang chờ** | **Änderungen ausstehend** | Thay đổi đã lưu cục bộ và đang chờ gửi. | Chỉ bấm đồng bộ khi có mạng ổn định. |
| **Đang ngoại tuyến** | **Offline** | Thay đổi vẫn nằm trên thiết bị; chưa thể gửi. | Kết nối lại mạng; hàng đợi sẽ được kiểm tra lại. |
| **Việc cần đồng bộ lại** | **Synchronisierung erneut erforderlich** | Một thao tác cần thử lại, dữ liệu cục bộ vẫn được giữ. | Bấm **Đồng bộ lại** / **Erneut synchronisieren** khi có mạng. Thử lại không tự chọn xung đột hoặc tự ghi đè. |
| **Xung đột dữ liệu** | **Datenkonflikt(e)** | Đồng bộ đang dừng để tránh ghi đè. | Mở **Xem xung đột** / **Konflikte prüfen** và quyết định từng mục. |
| **Cần khôi phục dữ liệu** | **Wiederherstellung erforderlich** | Trạng thái phục hồi chưa hoàn tất. | Hoàn tất khôi phục trước khi đồng bộ hoặc đăng xuất. |
| **Chỉ trên thiết bị này** | **Nur auf diesem Gerät** | Chưa đăng nhập; không có đồng bộ đa thiết bị. | Đăng nhập nếu muốn đồng bộ. |

## 3. Quy trình khi đồng bộ lỗi hoặc mất mạng

Khi ứng dụng hiển thị lỗi đồng bộ, không nhập lại hoặc xóa giao dịch chỉ để “ép” đồng bộ. Dữ liệu trên thiết bị được giữ nguyên. Trước hết kiểm tra kết nối, sau đó dùng hành động **Đồng bộ lại** hoặc **Đồng bộ ngay** một lần. Nếu lỗi vẫn lặp lại, mở **Cài đặt → Nâng cao → Chẩn đoán trên thiết bị** để xem mã trạng thái an toàn.

| Tình huống | Việc cần làm | Việc không được làm |
|---|---|---|
| Mất kết nối | Giữ ứng dụng mở hoặc quay lại sau khi có mạng; xem lại Sync Health. | Kết luận các thay đổi đã lên server. |
| `retry` sau một lượt đồng bộ | Dùng thao tác thử lại khi có mạng; xác nhận trạng thái đổi sau đó. | Chỉnh hoặc tạo giao dịch trùng lặp để thay thế thao tác cũ. |
| `sync-failed` trong diagnostics | Ghi nhận thời điểm/mã trạng thái, thử lại có kiểm soát. | Chia sẻ nội dung giao dịch, dữ liệu đăng nhập hoặc ảnh chụp màn hình có thông tin nhạy cảm chỉ vì cần “debug”. |
| Khôi phục đang chờ | Dùng nút tiếp tục khôi phục và làm theo các màn hình xác nhận. | Đăng xuất, xóa dữ liệu, hoặc khởi chạy một lượt đồng bộ mới. |

## 4. Xử lý xung đột dữ liệu

Xung đột luôn cần owner tự chọn. Panel chỉ hiển thị **loại dữ liệu** và **mốc thời gian**, không hiển thị nội dung của hai phiên bản để hạn chế lộ dữ liệu. Sau khi chọn local hoặc server, ứng dụng hiển thị tác động của lựa chọn và yêu cầu một bước xác nhận riêng.

> **Không có auto-resolve:** Ứng dụng không gộp hai bản ghi, không tự chọn local hoặc server, và Escape/Quay lại chỉ đóng màn hình xác nhận an toàn.

1. Vào **Cài đặt → Dữ liệu** hoặc bấm **Xem xung đột** từ Sync Health.
2. Đọc loại dữ liệu và thời điểm cập nhật trên thiết bị/server.
3. Chọn rõ **giữ bản trên thiết bị** hoặc **dùng bản đã đồng bộ**.
4. Đọc tác động trong màn hình xác nhận, rồi mới xác nhận lựa chọn.
5. Kiểm tra phản hồi. Nếu có trạng thái cần mạng hoặc xung đột mới, không coi là đã hoàn tất; quay lại danh sách và xử lý mục mới.

## 5. Diagnostics trên thiết bị và quyền riêng tư

**Cài đặt → Nâng cao → Chẩn đoán trên thiết bị** là nhật ký local-only, tối đa 30 dòng. Người dùng có thể làm mới hoặc xóa nhật ký bất cứ lúc nào. Nó không gửi API, không upload nền, và không dùng AI.

| Được lưu | Không được lưu |
|---|---|
| Thời điểm, nhóm trạng thái và mã allowlist như `sync-failed`, `offline`, `retry`, `synced`, `page-failure`. | Lỗi gốc, stack trace, số tiền, giao dịch, ghi chú, dữ liệu tài khoản, email, user ID, route hoặc payload đồng bộ. |

Nếu localStorage cũ có trường lạ, giao diện sẽ bỏ qua trước khi hiển thị. Nhật ký này phù hợp để mô tả “trạng thái nào xảy ra khi nào”, không phải là bằng chứng về dữ liệu tài chính hoặc toàn bộ lịch sử kỹ thuật.

## 6. Giao dịch, Data Quality Inbox và quy mô dữ liệu

Danh sách giao dịch dùng cửa sổ hiển thị lũy tiến: ban đầu tối đa 60 dòng, mỗi lần “Xem thêm” tăng thêm 60 dòng. Lọc, sắp xếp và nhóm tháng chỉ ảnh hưởng cách trình bày; chúng không đổi số dư, lãi/lỗ hoặc kinh tế ledger. Xem chi tiết thiết kế tại [`transactions-scale.md`](./transactions-scale.md).

Data Quality Inbox chỉ đánh dấu giao dịch có thể thiếu thông tin và mở đúng màn hình chỉnh sửa hiện có. Nó không tự điền, tự sửa hoặc tự quyết định dữ liệu. Khi dữ liệu tăng lớn, dùng lọc theo năm/loại/hoạt động, tìm kiếm, và “Xem thêm” thay vì cố tải lại hoặc xuất/nhập nhiều lần liên tục.

## 7. Sao lưu, nhập dữ liệu và đăng xuất

Trước khi nhập backup, hãy tạo và lưu một bản **Xuất JSON**. Nếu ứng dụng cảnh báo có thay đổi chưa đồng bộ, ưu tiên đồng bộ trước. Nếu không thể đồng bộ, chỉ tiếp tục nhập khi owner hiểu rằng dữ liệu cục bộ đang chờ có thể bị thay thế theo quy trình import đã xác nhận.

Đăng xuất bị chặn nếu còn thay đổi chờ, outbox lỗi, xung đột hoặc khôi phục chưa hoàn tất. Đây là cơ chế bảo vệ, không phải lỗi. Hãy giải quyết Sync Health hoặc lưu backup trước rồi mới đăng xuất.

| Tác vụ | Kiểm tra trước | Kết quả an toàn |
|---|---|---|
| Xuất JSON | Đảm bảo file được tải/xuất xong và lưu ở nơi owner kiểm soát. | Dữ liệu hiện tại được tạo bản sao; không làm thay đổi ledger. |
| Nhập backup | Có bản backup dự phòng; đọc toàn bộ bước xác nhận. | App chỉ thay dữ liệu sau xác nhận rõ ràng. |
| Xóa dữ liệu local | Có backup hoặc chắc chắn không cần phục hồi; không còn blocker. | Yêu cầu xác nhận; không dùng để “sửa” lỗi sync. |
| Đăng xuất | Sync Health không có blocker. | Không tự xóa dữ liệu khi tồn tại rủi ro chưa xử lý. |

## 8. PWA, offline và cập nhật

Sau khi ứng dụng đã được mở/cài và service worker hoạt động, app shell được precache để có thể mở giao diện khi mất mạng. Dữ liệu mới nhập khi offline vẫn chỉ ở thiết bị cho đến khi có kết nối và một lượt đồng bộ hoàn tất.

Nếu thấy giao diện cũ sau khi có bản phát hành mới, hãy đảm bảo mạng hoạt động, đóng/mở lại ứng dụng hoặc tải lại một lần. Không xóa dữ liệu local chỉ để ép cập nhật. Release gate kiểm tra `index.html`, icon và quote feed nằm trong service-worker precache; preview smoke kiểm tra registration/cache trên Chromium và WebKit, đồng thời kiểm tra fetch offline thực tế trên Chromium.

## 9. Runbook phát hành và rollback

Mọi thay đổi phải đi qua PR vào `main`. Chỉ merge khi các gate bắt buộc đều xanh: `test-build`, `edge-smoke`, `preview-smoke`. Deploy chạy sau merge `main`.

```bash
npm test
npm run benchmark:ledger:check
npm run audit:locale
npm run build
npm run test:release
npm run test:preview
```

| Gate | Điều được bảo vệ |
|---|---|
| `npm test` | Unit/UI regression, price scripts và regression locale audit. |
| `benchmark:ledger:check` | Cửa sổ giao dịch 60/120 dòng cho 100–10.000 giao dịch, qua scenario lọc/sắp xếp xác định. |
| `audit:locale` | Không có hard-coded locale candidate production-reachable; legacy được báo riêng. |
| `build` + `test:release` | Typecheck, artifact PWA, manifest/icon, app shell và quote feed precache. |
| `test:preview` | App boot, entry Việt/Đức, keyboard journey Đức, visual evidence, PWA registration/cache và offline app shell. |

Khi một gate lỗi, **không merge**. Xác định PR/commit gây lỗi, sửa tối thiểu trên nhánh đó, chạy lại toàn bộ các lệnh trên và chờ CI xanh. Không tự resolve conflict Git chứa thay đổi `src/lib/**`, schema/Dexie hoặc logic tài chính; hãy dừng và yêu cầu đặc tả/review riêng cho các phạm vi đó.

## 10. Bản đồ handover kỹ thuật

| Nhu cầu | Điểm bắt đầu | Ghi chú an toàn |
|---|---|---|
| Trạng thái sync | `src/components/syncHealth.ts`, `SyncHealthSummary.tsx` | Chỉ view-model/UI; ưu tiên recovery → conflict → retry → offline → syncing → pending → synced. |
| Conflict UX | `src/components/SyncConflictSection.tsx` | Không tự resolve; thao tác destructive cần xác nhận. |
| Diagnostics | `src/components/localDiagnostics.ts`, `LocalDiagnosticsPanel.tsx` | Local-only, allowlist, tối đa 30 dòng, không thêm payload lỗi. |
| Dữ liệu/giao dịch | `src/lib/**` | Không sửa khi chưa có đặc tả riêng, regression và review phạm vi. |
| Benchmark giao dịch | `src/pages/ledgerBenchmark.ts`, `scripts/benchmark-ledger.ts` | Fixture xác định, không dùng dữ liệu owner. |
| Locale | `src/lib/locale.tsx`, `scripts/audit-ui-localization.mjs` | Mọi UI reachable phải thuần Việt hoặc Đức; audit active candidate fail CI. |
| PWA | `vite.config.ts`, `scripts/verify-release.mjs`, `tests/preview.e2e.ts` | Không nới cache hay thay workbox trước khi có test artifact/runtime tương ứng. |

## 11. Ranh giới cho cải tiến tương lai

AI không cần thiết cho các luồng cốt lõi. Nếu sau này dùng API hoặc AI, đây phải là tính năng **tùy chọn**, không chặn theo dõi cục bộ, không gửi giao dịch/ghi chú/dữ liệu định danh mặc định, và phải có đặc tả riêng về dữ liệu gửi đi, quyền đồng ý, chi phí, khả năng tắt, lỗi mạng và regression test. API/AI không được thay thế quyết định của owner về giao dịch, backup, conflict, đầu tư hoặc thuế.

---

**Checklist bàn giao:** Owner biết vị trí Sync Health, biết export backup, biết xung đột không được tự xử lý, biết đọc diagnostics local-only, và biết rằng mọi phát hành chỉ merge sau khi CI xanh.
