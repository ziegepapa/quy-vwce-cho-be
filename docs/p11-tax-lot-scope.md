# P11 — Đặc tả phạm vi nghiên cứu thuế và lô giao dịch

> **Cảnh báo phạm vi:** Tôi không phải chuyên gia thuế; tài liệu này là đặc tả kỹ thuật để nghiên cứu và kiểm thử, không phải tư vấn thuế, khai thuế hoặc kết luận áp dụng cho một cá nhân. Mọi kết quả có ý nghĩa thực tế phải được kiểm tra với chuyên gia thuế trước khi sử dụng.

## 1. Quyết định tại P10.5

P10 không tính thuế, không tự xác định FIFO, không tính Vorabpauschale, không khuyến nghị bán/mua và không tạo báo cáo để nộp cho cơ quan thuế. Những nội dung này được tách thành **P11 candidate** vì chúng phụ thuộc vào dữ liệu broker, thời điểm giao dịch, loại tài khoản, quy định hiện hành và bối cảnh thuế của từng người.

Nguồn chính thức về Investmentsteuer của Bộ Tài chính Liên bang Đức sẽ là điểm bắt đầu cho nghiên cứu P11; nguồn này không được diễn giải thành công thức sản phẩm cho tới khi có đặc tả pháp lý/thuế và review chuyên môn riêng.[1]

## 2. Câu hỏi cần trả lời trước khi viết code

| Nhóm | Câu hỏi cần khóa | Trạng thái P10 |
|---|---|---|
| Lô | Hệ thống cần mô hình hóa lot, corporate action, partial sale và transfer thế nào? | Chưa triển khai |
| FIFO | FIFO là cách trình bày nội bộ, dữ liệu broker hay quy tắc cần xác nhận theo bối cảnh cụ thể? | Không suy diễn |
| Vorabpauschale | Dữ liệu giá, kỳ tính, miễn giảm, phân bổ và số thuế đã khấu trừ lấy từ đâu? | Chưa tính |
| Broker evidence | Statement nào là nguồn sự thật và cách đối soát khi thiếu/khác dữ liệu? | Chưa khóa |
| Rounding | Quy tắc tiền tệ, ngày hiệu lực, làm tròn và sai số chấp nhận là gì? | Chưa khóa |
| Export | Báo cáo chỉ để review nội bộ hay có ý định dùng cho filing? | Không xuất trong P10 |
| Privacy | Có cần lưu lot/tax metadata không, lưu local hay đồng bộ, retention bao lâu? | Chưa mở schema |

## 3. Ranh giới dữ liệu bắt buộc

Nếu P11 được phê duyệt, mọi thay đổi phải bắt đầu bằng **data manifest**. Manifest phải liệt kê trường nguồn, nguồn chứng cứ, độ nhạy, thời hạn lưu, cách xóa và việc có được đưa vào backup/sync hay không. Không được dùng tên trẻ, địa chỉ, liên hệ, ghi chú khẩn cấp hoặc dữ liệu không cần thiết để tính một aggregate lot/tax.

P11 không được sửa `src/lib/**` data/sync/auth, schema Dexie hoặc economics ledger trong cùng PR. Nếu cần mô hình lot mới hoặc lưu tax metadata, phải có ADR và migration plan riêng; không được lén thêm trường vào payload hiện có.

## 4. Tiêu chí Go/No-Go

| Tiêu chí | Điều kiện Go |
|---|---|
| Nguồn | Có nguồn broker và tài liệu chính thức, có version/date rõ ràng. |
| Tính đúng | Có fixture đã được chuyên gia kiểm tra; test negative cho thiếu lot, transfer, split, partial sale và dữ liệu mâu thuẫn. |
| Trung thực | Trạng thái “chưa đủ dữ liệu/không xác định” được giữ nguyên; không silent fallback hoặc tự chọn lot. |
| Quyền owner | Mọi export/review là owner-initiated; không tự gửi, nộp hoặc chia sẻ. |
| Riêng tư | Có allowlist và regression chứng minh không rò dữ liệu ngoài manifest. |
| Ngôn ngữ | Toàn bộ UI Việt/Đức được audit, không trộn ngôn ngữ và không dùng wording khẳng định nghĩa vụ thuế khi chưa có review. |
| Vận hành | Có backup/restore contract, recovery drill, bundle budget và CI gate riêng. |

## 5. Những điều bị cấm trong P11 nếu chưa có phê duyệt riêng

P11 không được tự động tạo hoặc sửa giao dịch, tự chọn resolution khi dữ liệu broker mâu thuẫn, tự xác nhận số thuế phải nộp, tự gửi dữ liệu ra ngoài, gọi AI/API, đọc hồ sơ khẩn cấp, hoặc biến một ước tính thành “báo cáo thuế chính thức”. Không được dùng output để khuyến nghị mua, bán, giữ hoặc thay đổi savings plan.

## 6. Thứ tự đề xuất nếu owner mở P11

P11.0 sẽ khóa nguồn và data manifest. P11.1 sẽ xây dựng lot evidence view chỉ đọc bằng fixture không chứa dữ liệu thật. P11.2 sẽ nghiên cứu các quy tắc tính candidate với trạng thái không xác định và review chuyên môn. P11.3 mới xem xét storage/export nếu P11.0–P11.2 đạt Go. Mỗi pha có PR nhỏ, CI độc lập và quyền dừng mà không ảnh hưởng tới P10.

## References

[1]: https://www.bundesfinanzministerium.de/Web/DE/Themen/Steuern/Steuerarten/Investmentsteuer/investmentsteuer.html "Bundesministerium der Finanzen — Investmentsteuer"
