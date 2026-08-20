# VWCE Vault — Product & UX Roadmap 2026

## Hướng sản phẩm

VWCE Vault nên vận hành như một **family investment operating system**: dữ liệu giao dịch là nguồn sự thật, còn giao diện biến dữ liệu ấy thành ngữ cảnh để gia đình biết hôm nay cần làm gì, điều gì thay đổi và kế hoạch còn đi đúng hướng không. Sản phẩm không cần bắt chước một broker với màn hình dày đặc; giá trị riêng nằm ở sự bình tĩnh, giải thích rõ và khả năng theo dõi một kế hoạch dài hạn cho trẻ.

## Đã triển khai trong nhánh Transactions journal 2026

| Nhu cầu | Trải nghiệm mới | Lý do |
|---|---|---|
| Ghi giao dịch nhanh | Hai hành động một chạm: **Mua VWCE** và **Góp tiền**. | Loại bỏ nhầm lẫn giữa lệnh mua chứng khoán và nạp tiền mặt. |
| Đọc nhiều giao dịch | Command deck cố định, activity chip **Đầu tư / Tiền vào / Chi ra**, sau đó là journal theo tháng. | Người dùng lọc theo ý định thay vì phải hiểu hết loại giao dịch kỹ thuật. |
| Tìm giao dịch cũ | Tìm theo ghi chú, ISIN và nhãn loại giao dịch theo ngôn ngữ đang dùng. | Tìm kiếm khớp đúng từ mà người dùng nhìn thấy. |
| Sắp xếp | Mới nhất, cũ nhất, hoặc số tiền cao nhất. | Hỗ trợ cả rà soát gần đây lẫn tìm khoản bất thường. |
| Sửa hoặc xóa | Menu hành động `…` hiện rõ trên từng hàng. | Thay thao tác chạm dài/chuột phải khó phát hiện trên điện thoại. |
| Ledger lớn | Window 60 hàng, thêm 60 hàng mỗi lần; lọc trước khi render. | Trải nghiệm vẫn nhẹ với 1.000+ giao dịch mà không đổi schema hoặc sync. |

> Nguyên tắc: Summary và phân tích danh mục luôn dùng toàn bộ ledger. Việc lọc hoặc tải thêm giao dịch không được phép làm thay đổi số dư, chi phí vốn hay lãi/lỗ.

## Ưu tiên đề xuất tiếp theo

| Ưu tiên | Hạng mục | Giá trị người dùng | Phạm vi kỹ thuật an toàn |
|---|---|---|---|
| P1 | **Smart time lens** | Một chạm xem Tháng này, 90 ngày, Năm nay hoặc Năm trước; journal hiển thị kết quả ngay trong ngữ cảnh kế hoạch. | Chỉ là filter hiển thị trên view-model Transactions. |
| P1 | **Saved views** | Lưu các góc xem như “Chỉ mua VWCE 2026”, “Khoản chi”, “Giao dịch cần kiểm tra”. | Lưu preference cục bộ; không can thiệp economics. |
| P1 | **Data quality inbox** | Một vùng nhỏ phát hiện thiếu giá, thiếu quantity ở giao dịch bán, giao dịch có ghi chú trống hoặc dòng mới nhập chưa kiểm tra. | Tái sử dụng các tín hiệu đã có từ quote status, analytics và validation. |
| P1 | **Portfolio heartbeat** | Trang Tổng quan trả lời ba câu: kỳ góp tiếp theo là khi nào, hiệu suất đang ở state nào, và có một việc nào cần xử lý không. | Mở rộng UI state trên Overview, không tính lại ledger song song. |
| P2 | **Import review workspace** | Với PDF/CSV, hiển thị preview, dedupe rõ và cho phép xác nhận theo từng nhóm trước khi ghi dữ liệu. | Mở rộng UI review quanh import hiện có, giữ guard external reference. |
| P2 | **Plan versus reality** | Một dải tiến độ theo năm: góp thực tế so với Sparplan, số tháng bỏ lỡ và một đề xuất hành động trung lập. | View-only dựa trên settings và giao dịch hiện có. |
| P2 | **Year-in-review** | Tóm tắt năm có thể xuất: số tiền đã góp, phí/thuế đã ghi, biến động giá và dữ liệu còn thiếu. | Báo cáo dữ liệu, không đưa khuyến nghị thuế hoặc đầu tư. |
| P3 | **Shared household handoff** | Chế độ “người chăm sóc” tối giản: Timeline, mốc sử dụng tiền, tài liệu khẩn cấp và trạng thái sync. | Kết nối các phần Notfallmappe, Settings và Overview đã có. |
| P3 | **Confidence timeline** | Nhật ký thay đổi dễ hiểu: giá cập nhật, import hoàn thành, chỉnh giao dịch, xung đột đã xử lý. | Dựa trên audit metadata/updatedAt hiện hữu, không thay nguồn dữ liệu tài chính. |

## Nguyên tắc thiết kế cho các bước sau

Transactions nên luôn ưu tiên **ý định trước, chi tiết sau**. Các thao tác thường dùng phải nằm trong vùng ngón tay cái; filter sâu chỉ mở khi cần; dữ liệu tài chính phải có nhãn trạng thái rõ thay vì tự suy diễn. Motion chỉ dùng để xác nhận hành động ngắn, tôn trọng reduced-motion và không làm chậm thao tác ghi giao dịch.

Mỗi tính năng mới cần giữ ba ranh giới: không render toàn bộ ledger khi không cần thiết, không làm thay đổi kết quả tài chính chỉ vì thay đổi view, và không nới schema/Dexie/sync nếu chỉ đang cải thiện trải nghiệm hiển thị.

## Thước đo chấp nhận

Một nâng cấp có thể được xem là hoàn thành khi người dùng có thể tìm hoặc ghi một giao dịch thông thường trong vài thao tác rõ ràng, vẫn hiểu giao dịch đang ảnh hưởng thế nào đến kế hoạch, và journal không mất tính phản hồi khi ledger đạt 1.000 giao dịch. Mỗi filter/sort mới phải có regression thuần và mỗi màn hình đổi cấu trúc phải được kiểm tra ở mobile viewport trước review.
