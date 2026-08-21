# H4 — RLS, Auth Boundary and Sync Security Evidence

**Trạng thái:** **Partial evidence; behavioral proof blocked by no-cost constraint.**  
**Ngày kiểm tra:** 21-08-2026  
**Phạm vi:** Project Supabase VWCE Vault đang active; chỉ kiểm tra read-only schema/policy metadata. Không truy vấn nội dung giao dịch, settings, goals hay dữ liệu gia đình.

> **Decision boundary:** H4 không được đóng và app không được tuyên bố production RLS đã được behavioral-verified cho đến khi có môi trường controlled riêng và User-A/User-B/anonymous tests thực tế. Không tạo Supabase project/branch, không phát sinh chi phí và không dùng production owner data làm test fixture theo quyết định owner ngày 21-08-2026.

## 1. Evidence đã thu thập miễn phí

| Kiểm tra | Kết quả | Ý nghĩa | Giới hạn |
|---|---|---|---|
| Project health | Project đang active/healthy. | Có endpoint database hiện hữu để đối chiếu source với environment. | Không suy ra RLS behavior chỉ từ health. |
| Table RLS flag | `profiles`, `app_settings`, `goals`, `transactions`, `annual_checklists`, `monthly_snapshots` đều báo `rls_enabled = true`. | Xác nhận environment không bỏ RLS cho các collection sync chính. | RLS enabled không tự chứng minh mọi policy đúng. |
| Policy catalog | Các table business có policy `SELECT` / `INSERT` / `UPDATE` / `DELETE` cho role `authenticated`, dùng `auth.uid() = user_id` (profile dùng `auth.uid() = id`). | Khớp intended owner-only model trong repository. | Catalog definition không thay thế test request bằng JWT của từng user. |
| Frontend secret scan | Không tìm thấy service-role key, secret runtime variable hoặc HTML execution surface trong source TypeScript/TSX được scan. | Hỗ trợ boundary “không service-role key ở frontend”. | Không thay thế dependency/SBOM hoặc runtime browser audit. |
| Sync design | Existing sync tests và H0/H2-B contract giữ owner-selected conflict resolution, outbox/tombstone semantics và không auto-merge. | H4 không được làm yếu để xử lý conflict. | Không chứng minh policy enforcement từ client token thực tế. |

## 2. Behavioral proof bắt buộc còn thiếu

| Test cần có | Trạng thái | Lý do chưa chạy |
|---|---|---|
| User A đọc/sửa/xóa record của chính mình | Chưa chạy | Không có controlled test branch. |
| User B đọc/sửa/xóa record của User A phải bị từ chối | Chưa chạy | Không dùng production family data hoặc account thực làm fixture. |
| Anonymous read/write phải bị từ chối | Chưa chạy | Cần isolated test token/environment. |
| Deleted-user cleanup / foreign-key behavior | Chưa chạy | Cần test users riêng trong controlled environment. |
| Client flow qua published auth/token path | Chưa chạy | Catalog query chạy với administrative inspection path, không thay thế client JWT request. |

## 3. Tại sao không dùng production để “test nhanh”

Production project có row data thật và catalog inspection cho thấy đã có accounts/data hiện hữu. Chạy cross-user test trực tiếp, tạo test account hoặc ghi/delete fixture vào môi trường đó sẽ vi phạm boundary controlled environment và có thể tác động dữ liệu gia đình. H4 không được lách requirement này bằng service-role query, role simulation hoặc viết migration test vào production.

Một Supabase development branch tạm thời là hướng phù hợp cho behavioral proof, nhưng việc tạo branch yêu cầu cost confirmation. Owner đã chọn **không phát sinh phí**, nên blocker này là quyết định có chủ ý, không phải failure bị che giấu.

## 4. Điều kiện mở lại H4 behavioral proof

Khi owner cho phép controlled environment không chứa dữ liệu gia đình và đã xác nhận chi phí (nếu provider yêu cầu), H4 phải chạy matrix User-A/User-B/anonymous cho mọi table sync, lưu chỉ pass/fail và policy metadata, xóa test identities/branch theo quy trình provider, và cập nhật tài liệu này. Chỉ khi đó mới có thể chuyển H4 từ **partial evidence** sang **verified**.

## 5. Non-goals

Tài liệu này không thay đổi RLS policy, Supabase migration, database schema, sync protocol, data, token, credential, financial semantics hoặc P11.2. Nó cũng không khẳng định app an toàn tuyệt đối hay đủ điều kiện làm hệ thống hồ sơ tài chính authoritative.
