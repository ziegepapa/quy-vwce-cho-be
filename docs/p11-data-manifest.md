# P11.0 — Data Manifest cho Lot Evidence

> **Trạng thái:** P11.0 — tài liệu phạm vi và nguồn. Chưa có UI lot, chưa có storage mới, chưa có migration, chưa có công thức FIFO/Vorabpauschale và chưa có tính toán thuế production.
>
> **Cảnh báo:** Tôi không phải chuyên gia thuế; tài liệu này là manifest kỹ thuật để review dữ liệu, không phải tư vấn thuế, khai thuế hoặc kết luận cho một cá nhân. Mọi diễn giải thuế sau này phải được chuyên gia thuế Đức review.

## 1. Quyết định phạm vi

P11.0 chỉ mô tả các trường có thể cần để xây dựng **lot evidence view chỉ đọc bằng fixture giả** ở P11.1. P11.0 không cấp quyền đọc vault thật, không thay đổi `src/lib/**` data/sync/auth, không thêm field vào `Transaction`, không thay đổi schema/Dexie, không sửa ledger và không gửi dữ liệu ra ngoài.

Các trường nhạy cảm như tên trẻ, liên hệ khẩn cấp, địa điểm tài liệu, thông tin tài khoản, ghi chú, wishes và nội dung hồ sơ khẩn cấp bị loại khỏi lot evidence. Chúng không cần thiết để đối chiếu hình dạng bằng chứng giao dịch.

## 2. Trạng thái dữ liệu hiện hành

Các kiểu dữ liệu dưới đây tồn tại trong `src/lib/types.ts` tại commit P10 hiện tại. Bảng này là inventory hiện trạng, không phải đề xuất migration.

| Nhóm | Trường hiện có | Nguồn hiện tại | Độ nhạy | Retention/backup hiện tại | Dùng trong P11.1? |
|---|---|---|---|---|---|
| Transaction identity | `id`, `date`, `createdAt`, `updatedAt`, `deletedAt` | `Transaction` local vault/backup | Financial + operational | Theo contract local backup hiện có; P11 không thay đổi | Chỉ fixture `id` giả và date giả; không hiển thị định danh owner |
| Transaction classification | `type`, `instrumentIsin`, `source`, `sourceVersion` | `Transaction` | Financial + provenance | Theo backup/sync contract hiện có | Có thể dùng enum/source giả để chứng minh evidence shape |
| Quantity/price | `quantity`, `unitPrice`, `amount`, `fee`, `tax` | `Transaction` | Highly financial | Theo backup contract hiện có | Không đưa số tiền/giá trị thật vào UI; fixture chỉ dùng giá trị tối thiểu nếu cần test shape |
| External evidence | `externalRef`, `sourceVersion`, `source` | `Transaction` import metadata | Financial + identifier | Theo backup/import contract hiện có | Chỉ dùng token fixture đã giả; không expose broker/account reference |
| Broker snapshot | `DepotStatement.statementId`, `date`, `broker`, `source`, `sourceVersion`, `deletedAt` | Read-only broker statement model | Financial + provenance | Nested settings/backup contract hiện có | Chỉ dùng fixture source/date/status; không dùng accountRef hoặc position content |
| Position evidence | `instrumentIsin`, `quantity`, `unitPrice`, `marketValue`, `currency` | `DepotPosition` | Highly financial | Nested broker snapshot contract hiện có | Không render trong P11.1; chỉ negative-test chứng minh bị loại |
| Settings/account | `accountType`, `planName`, `currency`, `startDate`, `endDate` | `AppSettings` | Personal/financial | Existing settings backup/sync contract | Không cần cho lot evidence; chỉ dùng trong manifest context |
| Sensitive handoff | `childName`, `notfallmappe`, contacts, documents, account notes | `AppSettings`/`Notfallmappe` | Highly personal/child/contact | Existing local backup/sync contract | **Cấm** đọc, render hoặc đưa vào fixture |

## 3. Candidate evidence fields cho P11.1

Đây là **allowlist conceptual** cho fixture giả, không phải schema mới. P11.1 chỉ được tạo object UI-local với các trường này hoặc trường tương đương đã được owner review.

| Candidate field | Mục đích | Nguồn fixture | Độ nhạy | Retention | Cho phép P11.1 |
|---|---|---|---|---|---|
| `evidenceId` | Phân biệt evidence trong một màn hình demo | Generated fixture token, không phải owner ID | Synthetic | Không lưu | Có, chỉ hiển thị dạng thân thiện |
| `eventKind` | Mô tả loại evidence như buy/sell/transfer/split | Enum fixture | Operational/financial shape | Không lưu | Có, không suy diễn thuế |
| `eventDate` | Sắp xếp evidence theo thời gian | ISO date giả | Low sensitivity khi giả | Không lưu | Có |
| `instrumentLabel` | Hiển thị công cụ ở mức demo | Label giả, không dùng ISIN thật | Synthetic | Không lưu | Có |
| `quantityStatus` | `known`/`missing`/`conflict` | Fixture validation state | Operational | Không lưu | Có |
| `sourceStatus` | `known`/`missing`/`conflict` | Fixture provenance state | Operational | Không lưu | Có |
| `lotStatus` | `known`/`incomplete`/`unknown` | Fixture-only state | Financial shape | Không lưu | Có; không tính FIFO |
| `reasonCode` | Giải thích thiếu dữ liệu | Enum local hóa | Operational | Không lưu | Có |
| `reviewState` | `reviewable`/`not_ready` | Deterministic fixture state | Operational | Không lưu | Có |

P11.1 không được thêm `lotId`, `costBasis`, `taxAmount`, `fifoOrder`, `vorabpauschale`, `accountRef` hoặc field tương tự vào production type. Nếu cần nghiên cứu hình dạng, các tên chỉ được tồn tại trong fixture/test-local contract và phải đánh dấu chưa xác định.

## 4. Negative/unknown contract

| Input fixture | Expected state | Hành vi bị cấm |
|---|---|---|
| Thiếu lot evidence | `lotStatus: unknown`, “Chưa đủ dữ liệu” | Không tự tạo lot hoặc chọn FIFO |
| Có transfer nhưng thiếu nguồn gốc | `sourceStatus: conflict`, `reviewState: not_ready` | Không tự nối hai account/broker |
| Có split/corporate action nhưng thiếu statement | `lotStatus: incomplete` | Không tự phân bổ quantity/cost |
| Partial sale nhưng không có lot mapping | `lotStatus: unknown` | Không tự chọn lot hoặc cost basis |
| Hai statement mâu thuẫn | `sourceStatus: conflict` | Không chọn bản ghi mới hơn một cách im lặng |
| Timestamp/currency/quantity không hợp lệ | `reviewState: not_ready` | Không loại im lặng rồi tính aggregate |
| Fixture rỗng | Empty state ổn định | Không đọc database thật |

Trong mọi trường hợp, “Chưa đủ dữ liệu/Không xác định” là output hợp lệ. Không được chuyển trạng thái này thành số tiền, tỷ lệ, nghĩa vụ thuế hoặc khuyến nghị.

## 5. Nguồn và version register

| ID | Nguồn | Mục đích | Version/ngày | Giới hạn sử dụng |
|---|---|---|---|---|
| `SRC-001` | [Bundesministerium der Finanzen — Investmentsteuer](https://www.bundesfinanzministerium.de/Web/DE/Themen/Steuern/Steuerarten/Investmentsteuer/investmentsteuer.html) | Điểm bắt đầu cho nghiên cứu phạm vi Investmentsteuer Đức | Trang được truy cập ngày **2026-08-20**; trang không cung cấp một version ứng dụng duy nhất trong repository | Chỉ làm nguồn nghiên cứu; chưa được chuyển thành công thức hoặc kết luận thuế |
| `SRC-002` | `src/lib/types.ts` tại main commit P10 hiện tại | Inventory kiểu dữ liệu local hiện hữu | Repository commit được pin trong PR P11.0 | Chỉ mô tả contract kỹ thuật; không chứng minh dữ liệu broker hoặc quy tắc thuế |
| `SRC-003` | `docs/p11-tax-lot-scope.md` | Quyết định tách P11 và gate chuyên gia | P10.5 merged document | Không thay thế review chuyên gia thuế Đức |

Nếu nguồn chính thức không có version number, manifest phải ghi **“version không được công bố trên trang; pin bằng URL + ngày truy cập”**, không tự đặt version giả. Khi mở P11.2, source register phải bổ sung ngày hiệu lực, thay đổi pháp lý liên quan và review chuyên gia.

## 6. Privacy, retention và deletion

P11.0 không tạo retention mới vì chưa tạo storage mới. Mọi candidate field P11.1 đều là fixture in-memory, không backup, không sync, không local persistence và được giải phóng khi rời màn hình. Không được đưa dữ liệu thật vào fixture, screenshot, test artifact hoặc PR comment.

Nếu P11.3 trong tương lai cần lưu metadata, phải tạo manifest revision, ADR, migration plan và deletion/retention decision riêng. Không được suy ra rằng các trường financial evidence được phép sync/backup chỉ vì một số transaction hiện có đã có backup contract.

## 7. Quyền truy cập và external boundary

P11.0/P11.1 không đọc Supabase, không gọi API, không gọi AI, không upload và không gửi dữ liệu owner. UI P11.1 phải nhận fixture qua module test/local-only; source scan phải chứng minh không có import từ database, sync engine, auth client hoặc Edge Function.

P11.1 không được đọc `Notfallmappe`, `childName`, contacts, documents, `accountRef`, notes, free text hoặc transaction payload thật. Mọi test chống rò dữ liệu phải assert rằng các field đó không xuất hiện trong output view-model và rendered text.

## 8. Điều kiện hoàn tất P11.0

P11.0 chỉ đạt khi owner review bảng hiện trạng, candidate allowlist, source register, negative contract và privacy boundary. CI phải kiểm tra Markdown/diff, forbidden scope và xác nhận không có runtime/schema change. Sau khi P11.0 merge mới được mở branch P11.1.

P11.0 **không mở P11.2**. P11.2 vẫn bị khóa cho tới khi có chuyên gia thuế Đức review độc lập; không có ngoại lệ vì CI hoặc fixture test xanh.

## References

[1]: https://www.bundesfinanzministerium.de/Web/DE/Themen/Steuern/Steuerarten/Investmentsteuer/investmentsteuer.html "Bundesministerium der Finanzen — Investmentsteuer"
[2]: ../src/lib/types.ts "VWCE Vault local type contracts"
[3]: ./p11-tax-lot-scope.md "P11 tax and lot research scope"
