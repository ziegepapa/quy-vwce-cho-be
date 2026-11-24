# H5 — đối chiếu hosted và diễn tập phục hồi toàn database (24/11/2026)

**Trạng thái: PARTIAL.** H4 đã PASS trên baseline local; H5 chưa thể PASS cho production. Draft này không triển khai MU2, không thay đổi schema/migration, RLS, dữ liệu, secret hay Edge Function production.

## 1. Bằng chứng production chỉ đọc

Query `scripts/h5-schema-inventory.sql` chạy trong `BEGIN READ ONLY; ... ROLLBACK;` trên project đã được owner chỉ định. Chỉ đọc catalog, không đọc hàng dữ liệu, không lấy nội dung function (MD5 definition), không gọi RPC. Migration history đọc bằng API metadata. Kết quả: `docs/evidence/h5-hosted-catalog-2026-11-24.json`. So sánh với baseline 001 + 002 qua CI; diff exact theo metadata, nên cả khác biệt biểu diễn/version cũng được giữ lại để review.

| Phạm vi | Hosted | Repo 001/002 |
|---|---|---|
| Public tables | 6, RLS và FORCE RLS bật | 6, RLS bật, không có FORCE |
| Policies | 23, scoped authenticated; 4 operation policies cho mỗi sync table, 3 profiles | 8; 5 FOR ALL và 3 profiles, mặc định PUBLIC |
| Sync ownership | composite PK (user_id,id), FK auth.users cascade | cùng mô hình |
| Defaults | user_id default auth.uid() trên 5 sync tables | không khai báo default |
| Columns | deleted_at, created_at, version | 002 bổ sung deleted_at/created_at; version có từ 001 |
| Indexes | 21 public indexes: 6 PK, 5 unique trùng PK, 10 user/updated indexes | 6 PK + 5 indexes 002 |
| Triggers | 5 version/update, 1 signup | 002 + 001 tương ứng, cần đối chiếu definition |
| Internal schemas | 4 AI tables, 4 Guardian tables + 1 sequence | không nằm trong 001/002 |
| Migration history | 5 version timestamp 21–22/11, không có 001/002 trong ledger | 001/002; ops SQL riêng |

Tổng inventory: 15 relations (14 bảng + 1 sequence), 85 columns, 33 constraints, 30 indexes, 23 policies, 6 triggers, 11 routines, 126 table grant rows, 16 routine grant rows, 9 schema/role access entries. Private schemas deny USAGE/CREATE cho anon/authenticated/service_role; Guardian tables không bật RLS nhưng schema/tables không cấp client access. Không đánh đồng RLS với quyền TRUNCATE: public grants có TRUNCATE/REFERENCES/TRIGGER cho anon/authenticated; cần review effective grants và Data API exposure trước MU2, không tự REVOKE. RPC Gemini/Guardian public chỉ grant EXECUTE cho service_role trong snapshot; handle_new_user/bump trigger routines có PUBLIC EXECUTE, cần review riêng. Không chứng minh exploit chỉ từ catalog.

Ops source: `supabase/ops/silent-guardian-install.sql`, `gemini-explain-install.sql`, `gemini-explain-upgrade-20.sql`, `gemini-flash-routing-install.sql`. Không chạy trong CI: các file có giới hạn manual-only, Guardian chứa URL production. Hosted history khác 001/002, chưa có mapping lịch sử chứng minh tương đương. Không tự reconcile hoặc thêm migration.

## 2. Rehearsal tự động, chỉ dữ liệu tổng hợp

1. Reset local bằng 001/002, so metadata với snapshot hosted offline.
2. Tạo hai synthetic Auth users và đăng nhập thật; mỗi user có live + tombstone trên 5 bảng, update probe version.
3. Dump **toàn database** local bằng pg_dump custom format và cluster globals bằng pg_dumpall; không filter schema hoặc table. Backup temporary mode 0600, không upload.
4. Tạo container cùng image PostgreSQL, `--network none`, initdb sạch, phục hồi globals, pg_restore single transaction/exit-on-error.
5. So catalog, exact row fingerprints và counts của auth.users, auth.identities, 6 public tables; kiểm tra RLS role-level và cascade FK trên restored DB. H4 hiện có riêng Auth+PostgREST behavioral matrix.
6. Upload chỉ JSON evidence (không dump, mật khẩu, JWT, row hashes/contents); dọn container và file tạm. PASS chỉ khi CI thực chạy thành công.

**Giới hạn:** full logical database của baseline local, không phải full hosted project; không bao gồm hosted-only AI/Guardian schemas, managed service configuration, external storage bytes, secrets, cron dispatch hoặc khôi phục HTTP Auth/PostgREST ở cluster mới. Không sử dụng production như test target. Cần sanitized local equivalents cho ops SQL, kiểm kê managed components, xác nhận historical baseline và rehearse service recovery trước khi đóng toàn bộ H5. Nếu CI fail, giữ PARTIAL, không bỏ kiểm tra để xanh.

## 3. Rollback/recovery

Forward-only migrations; không giả định có down migration. Khi lỗi production: dừng writes/sync có kiểm soát, giữ backup và broker statements, ghi nhận version/schema drift, không reset hosted hoặc import đè. Rehearse restore tại môi trường cô lập, xác nhận ownership/RLS, counts và checksums, rồi xin owner duyệt kế hoạch forward-fix hoặc restore vào target mới. Không tự chạy phục hồi production. H5 vẫn PARTIAL cho tới khi phạm vi hosted đã chứng minh.

## 4. MU2 — đề xuất thiết kế, chưa code

Bám ADR-MU1: owner-root giữ immutable user_id của dữ liệu hiện tại; account riêng được liên kết bằng membership server-side có trạng thái invited/active/revoked và role admin/member. OWNER đọc/ghi, quản lý thành viên và không thể bị revoke/demote; ADMIN active được đọc/ghi và quản lý non-owner theo ADR; MEMBER active chỉ SELECT trong vault được mời, không ghi giao dịch/mục tiêu/settings/backup/restore/resolve conflict; unrelated/anonymous deny. RLS per-operation + grants được kiểm tra trực tiếp Data API, không dựa vào React/localStorage/JWT user_metadata. Invite qua backend tin cậy, không chia sẻ mật khẩu hay service-role. Revoke cập nhật membership phía server, request tiếp theo bị từ chối ngay cả token cũ; app phải dừng pull/push và xử lý cache local theo vault namespace; không hứa xóa dữ liệu người đã sao chép khi còn quyền. AI/Guardian private owner state không được mở cho MEMBER. Bất kỳ migration/client sync nào là PR MU2 riêng sau owner approval, H5 và rollback review; không đổi tài khoản hay quyền thật trong H5.

## 5. Follow-up candidate — private state and HTTP recovery

The original #427 head `8f6ea28fd3c` passed full local database restore, exact row fingerprints and SQL RLS in [run 45449618354](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/45449618354), artifact 14948781038. Catalog comparison returned DRIFT, not parity. New candidate extends the same backup to eight private AI/Guardian tables with synthetic rows, sequence and effective ACL checks. The local-only fixture is a reviewed copy of selected DDL and non-dispatch RPCs from ops source; the manual production installers are not executed. Guardian enqueue/dispatch, owner discovery, cron and real provider access are omitted. Gemini RPC behavior is tested solely in a rolled-back SQL transaction in the network-isolated destination. Separately, the original disposable Supabase stack is reset and Auth identities plus all six public tables are restored from the same archive; fresh password sign-in and real PostgREST cross-user/anonymous denial and owner writes are tested. Credentials stay mode 0600 in runner temp and are removed, never uploaded. This is not a restoration of all hosted services or proof of hosted parity; H5 remains PARTIAL pending new CI and review of drift, managed components and provenance. MU2 remains design only.
