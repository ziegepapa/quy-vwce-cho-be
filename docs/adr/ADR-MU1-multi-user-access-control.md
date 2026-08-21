# ADR-MU1 — Multi-user Access Control: ADMIN/OWNER và MEMBER Read-only

**Trạng thái:** Được chấp nhận như mô hình mục tiêu; **không có schema, RLS, backend hoặc UI change nào được ủy quyền bởi ADR này**.  
**Ngày:** 21-08-2026.  
**Phạm vi:** Chia sẻ có kiểm soát một vault owner-root giữa ADMIN/OWNER và MEMBER read-only. Đây là access-control, không phải financial, social, tax hay recommendation feature.

> **Quyết định cốt lõi:** Authorization nằm ở server-side database/backend state. Client role, button visibility, route guard, React state, localStorage, IndexedDB và sync outbox chỉ được dùng để tạo UX; chúng không bao giờ là authority.

## 1. Hiện trạng và nguyên nhân cần thay đổi

Schema hiện tại là **per-user**: `profiles` dùng `auth.users.id`; năm entity tables remote (`app_settings`, `goals`, `transactions`, `annual_checklists`, `monthly_snapshots`) có khóa `(user_id, id)` và policy `for all` khi `auth.uid() = user_id`. Không có `vault`, `vault_id`, membership, role, invitation state hay owner lifecycle. Sync client pull/fetch/push theo đúng `user_id` hiện đăng nhập và upsert theo `user_id,id`. [1] [2]

Do đó, chỉ thêm trạng thái `role === "member"` vào browser không tạo sharing an toàn, và chỉ nới RLS `user_id` sẽ vừa không làm client hiện tại đọc được owner data, vừa có nguy cơ cho member ghi trực tiếp qua Data API. RLS phải giới hạn **rows**, còn grants phải giới hạn **operations**; cả hai cần được thiết kế và migrate cùng nhau. [3]

## 2. Mô hình ownership và membership mục tiêu

Phiên bản đầu không chuyển đổi historical transaction hay thay primary key hiện có. Một **vault** được nhận diện bởi immutable `owner_user_id`, chính là `user_id` đang sở hữu các rows legacy. Owner-root luôn là ADMIN, không phải membership row có thể tự xóa hay tự hạ quyền.

| Principal | Trusted server-side relation | Quyền dữ liệu vault owner-root | Quyền membership |
|---|---|---|---|
| OWNER | `auth.uid() = owner_user_id` | Select và permitted existing writes. | Invite, role change, revoke; owner root không thể bị revoke/demote trong v1. |
| ADMIN | Active membership `role = admin` cho `owner_user_id`. | Select và permitted existing writes trong vault đó. | Manage non-owner memberships; không thể revoke/demote owner-root. |
| MEMBER | Active membership `role = member` cho `owner_user_id`. | Select-only trong vault đó. | Chỉ có thể xem own membership/status cần thiết; không write/manage. |
| ANONYMOUS hoặc unrelated authenticated user | Không có ownership/active membership. | Default deny select/insert/update/delete. | Default deny. |

Migration sau này có thể dùng một table membership với các field tối thiểu như `owner_user_id`, `member_user_id`, `role`, `status`, `invited_at`, `activated_at`, `revoked_at`, `invited_by`, timestamps và unique owner/member pair. Tên/field chính xác chỉ được chốt trong migration PR sau khi controlled schema evidence tồn tại; ADR không tự tạo column hay migration.

## 3. RLS và Data API model

Mọi entity table hiện hữu phải bỏ policy gộp `for all` và được thay bằng policy operation-specific. Owner hoặc active ADMIN được phép `SELECT` và permitted write trong rows có `user_id = owner_user_id`. Active MEMBER chỉ được phép `SELECT` trong chính rows đó. Không có `INSERT`, `UPDATE` hay `DELETE` policy nào cho MEMBER. Anonymous không có policy. Đây là default deny theo operation; Data API grants cũng phải được review trong cùng migration, vì RLS không thay thế grants. [3]

Membership table phải bật RLS và không cấp client write policy cho MEMBER. Query authorization trong policy phải dựa vào active server-side membership status, không lấy role claim từ browser. RLS policy dùng join/membership relation là mô hình many-to-many chính thức cho shared rows; claims chỉ có thể là optimization sau khi custom access-token hook, refresh/revocation behavior và security review được chứng minh. [4] [5]

> RLS phải được áp dụng trực tiếp cho Data API requests, sync requests và crafted REST calls. Việc hidden button không được dùng làm evidence deny.

## 4. Invitation, lifecycle và revocation

Invitation cần dùng **existing Supabase Auth infrastructure**, không tạo auth system thứ hai, không lưu/gửi password. Một trusted server component (Edge Function hoặc backend tương đương) mới được gọi documented Auth Admin invitation API bằng server-only secret. Static GitHub Pages client không nhận service-role key và không gọi `auth.admin` trực tiếp. [6]

| State | Trusted meaning | Transition authority |
|---|---|---|
| `invited` | Server đã tạo/bound Auth invitation với membership role, chưa có activation evidence. | Trusted server only. |
| `pending` | Chỉ dùng nếu provider flow không thể bind/activate ngay; không được fake bằng local email flag. | Trusted server only. |
| `active` | Membership server-side có hiệu lực với valid principal. | Trusted server only after verified auth/invite acceptance. |
| `revoked` | Membership không còn quyền read/write; RLS denies ở request kế tiếp. | OWNER/authorized ADMIN trusted path only. |

Admin UI có thể request invite, role change hoặc revoke, nhưng backend phải verify caller là owner/active ADMIN, target scope hợp lệ và last-admin rule trước mutation. MEMBER không thể self-promote, manage membership, modify invitation state hay bypass bằng crafted call. Provider behavior cho existing email/user và state transition phải được integration-tested trước release; nếu provider không hỗ trợ state cần thiết an toàn, UI phải document limitation thay vì giả trạng thái.

## 5. Last-admin và owner protection

Owner-root là một administrator tồn tại độc lập với membership entries; v1 không có ownership transfer. Vì thế owner cannot be removed/demoted/revoked, và ít nhất một valid ADMIN luôn tồn tại. Authorized ADMIN management endpoint/database function phải deny any mutation that targets owner-root or would leave zero active administrators. Không có backdoor admin, role flag trong client, self-promotion route hay service-role exposure.

## 6. Client, sync, backup và UI boundaries

Sau normal login, client resolves read-only presentation state from a server-derived membership result. Với MEMBER, Overview/holdings/transactions/data health/yearly review/simulation/quote/search/filter/navigation vẫn hoạt động; UI chỉ hiển thị indicator nhỏ **`Chỉ xem` / `Nur Lesen`**. Mutation controls biến mất thay vì disabled everywhere: add/edit/delete transaction, PDF/import, goal/settings/Sparplan mutations, backup export/import/restore, sync push/resolve conflict, financial acknowledgement/repair và Members admin section.

Client guard không phải authorization. Crafted local IndexedDB/outbox payload hoặc direct API request phải nhận RLS/backend denial. Sync engine không được coi denial là confirmed push, không được xóa outbox/historical evidence, không được silently discard valid admin sync và không được thêm auto conflict resolution. Vì existing sync queries/payloads gắn với `user_id`, membership sharing cần explicit compatibility design; không được chỉ đổi client filter để chia sẻ rows.

ADMIN-only backup/export/import/restore là product access policy. Member đã được grant đọc có thể quan sát/copy data mà server đã trả về; UI không được claim có thể ngăn tuyệt đối việc sao chép content được cấp quyền. Bảo mật cần bảo đảm **deny unauthorized visibility và all mutation**, không hứa DRM client-side.

## 7. Financial and compatibility non-goals

Không thay `src/lib` financial semantics: canonical classifier, accepted/incomplete/invalid, oversell handling, deterministic `date → createdAt → id` replay, cost basis, cash, holdings, P/L, legacy quarantine và backup data semantics. Authorization bao quanh existing financial system; nó không được cài bằng thay đổi calculations hoặc rewrite historical rows.

Không có Dexie version/schema change, backup format change, historical financial record migration, auto-repair, auto-conflict resolution, tax/FIFO/Vorabpauschale hoặc password/MFA/recovery weakening trong workstream này. Existing owner app phải tiếp tục own read/write sau rollout; member sharing chỉ được enable khi server contract, UI guard và behavioral tests cùng deploy.

## 8. Migration, controlled environment và rollback gate

Migration/RLS PR chỉ được mở khi có environment **free, isolated, disposable, synthetic-data-only** với full Supabase Auth + Data API + Postgres, và ordered migration baseline đủ để blank apply/rollback. Điều kiện này hiện chưa tồn tại: repository chỉ có manual `schema.sql` cùng `002_soft_delete_and_triggers.sql`; sandbox không có Supabase CLI/Docker/full Postgres server. H5 blocker vì thế không bị che khuất bởi ADR này. [7]

Migration candidate phải gồm membership schema, indexes, grants, RLS per operation, constrained trusted admin/invitation mechanism, owner bootstrap and last-admin protection, và rollback order. It must not modify financial payload rows. Rollback phải revoke shared access trước hoặc đồng thời với removal server capability, restore owner-only policies deterministically, preserve all owner rows, and require full behavioral matrix.

Không apply DDL lên production, không tạo paid branch/project, không dùng family data hoặc remote production như test environment. Nếu environment/rollback proof không available, dừng ở ADR/evidence; không merge UI-only sharing như một security feature.

## 9. Security test matrix bắt buộc trước feature release

| Principal / action | Expected request-level result |
|---|---|
| Anonymous read/write private vault data | DENY / DENY |
| OWNER read/write own vault | ALLOW / ALLOW |
| OWNER manage non-owner memberships | ALLOW |
| MEMBER read active authorized vault | ALLOW |
| MEMBER create/update/delete transaction | DENY / DENY / DENY |
| MEMBER modify goal/settings/Sparplan/import/restore/sync conflict | DENY |
| MEMBER invite/revoke/change role/self-promote | DENY |
| Member A read Vault A / Vault B | ALLOW / DENY |
| Member A write Vault A / Vault B | DENY / DENY |
| Revoked member read/write previously authorized vault | DENY / DENY |
| Last-admin removal or demotion | DENY |

Matrix phải chạy cả UI contract và direct backend/API calls với synthetic identities/data. UI test là bổ sung; chỉ request-level allow/deny mới đủ điều kiện cập nhật H4.

## 10. PR sequence và stop conditions

| PR | Phạm vi | Gate mở PR kế tiếp |
|---:|---|---|
| MU1 | ADR này. | ADR CI green và target model/restrictions rõ ràng. |
| MU2 | Membership migration, RLS/grants, trusted invitation backend, integration harness. | Controlled environment, ordered migration/rollback plan và synthetic behavioral matrix available. |
| MU3 | ADMIN member-management UI. | MU2 deployed/verified server authorization. |
| MU4 | MEMBER read-only UI/guards and localization. | MU2 server denial exists; MU3/4 cannot claim authority. |
| MU5 | Behavioral RLS/API tests and evidence. | Full allow/deny evidence pass. |
| MU6 | Readiness/final documentation. | Only update H4 when MU5 proves actual matrix. |

## 11. Readiness implication

This ADR does not change H4, H5 or P11.2. H4 may move from `PARTIAL` only after actual request-level behavioral proof. H5 remains blocked until migration reproducibility exists independently. P11.2 remains blocked pending independent German tax-expert review.

## References

[1]: ../H4-RLS-EVIDENCE.md "Existing static RLS evidence"
[2]: ../../supabase/schema.sql "Current per-user schema and RLS policies"
[3]: https://supabase.com/docs/guides/api/securing-your-api "Supabase Data API grants and RLS"
[4]: https://supabase.com/docs/guides/ai/rag-with-permissions "Supabase many-to-many access control through RLS"
[5]: https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac "Supabase custom claims and RBAC"
[6]: https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail "Supabase Auth Admin inviteUserByEmail"
[7]: ../H4-H5-POST_BASELINE_REEVALUATION.md "Current controlled-environment and migration baseline blocker"
