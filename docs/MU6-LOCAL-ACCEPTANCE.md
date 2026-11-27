# MU6 — Nghiệm thu tổng thể chia sẻ quỹ gia đình (local)

Ngày mở nghiệm thu: 27/11/2026. Trạng thái: **CHỜ BẰNG CHỨNG MU6**, không phải chứng nhận production.

Base: `c63ebc84dbf9e256f17dc36a56504629e38f95e0`. [CI main](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/45870774844), [Pages](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/45871144754) (commit gh-pages b02d6dbb1c62113447adfc1d1ab053e02bdf8cf0 ghi đúng SHA base).

## Ma trận nghiệm thu

| Giai đoạn | Phạm vi cần xác minh | Bằng chứng trước MU6 |
|---|---|---|
| MU1 | Nền tảng, giới hạn local-only, owner bình thường | Kiểm tra lại operational posture và release artifact |
| MU2 | JWT thật local, quyền đọc, từ chối ghi, PG15/17 | [#430](https://github.com/ziegepapa/quy-vwce-cho-be/pull/430) |
| MU3 | Quản lý thành viên, hai tài khoản synthetic, không gửi email thật | [#431](https://github.com/ziegepapa/quy-vwce-cho-be/pull/431) |
| MU4 | Full app chỉ đọc, VI/DE, overview, VWCE/VALL, history, simulation, goals, không ghi owner Dexie/outbox, revoke | [#432](https://github.com/ziegepapa/quy-vwce-cho-be/pull/432), [CI trên head MU5](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/45686842513) |
| Hotfix | Portal, viewport, safe area, sheet iPhone Chromium/WebKit | [#433](https://github.com/ziegepapa/quy-vwce-cho-be/pull/433) |
| MU5 | PG15/17, direct writes deny, revoke JWT cũ, unrelated/anon deny, owner rows nguyên vẹn, rollback H5, offline isolation | [#435](https://github.com/ziegepapa/quy-vwce-cho-be/pull/435), [security](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/45686842684), [UI](https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/45686842540) |
| MU6 | Chạy lại toàn bộ trên cùng head, đọc logs/artifacts, xác minh main và Pages sau merge | Pending |

## Gate bắt buộc

Bảy workflow PR: Test and Deploy, H4 H5 Evidence, MU2 Local Authorization, MU3 Local Member Management, MU4 Local Read Only, MU5 Local Security Integration, MU5 Local UI Isolation. Thay đổi path filter chỉ bổ sung tài liệu này để kích hoạt các suite hiện hữu; không thay đổi test, quyền, budget hoặc điều kiện bảo mật.

Trước merge: đối chiếu head SHA của từng run, tất cả job bắt buộc xanh, đọc log PASS và kiểm tra artifact ảnh synthetic nếu có. Không coi job skipped là bằng chứng kiểm thử. Ghi nhận link run/job/artifact trong PR, không sửa tài liệu chỉ để ghi SHA tự tham chiếu. Nếu thiếu bằng chứng, giữ Draft. Sau squash: xác minh CI main và Pages đúng commit mới, ghi kết quả trong PR.

## Giới hạn còn mở

Chỉ disposable local, không tạo tài khoản thật, không gửi email thật, không thay secrets/billing, không áp dụng SQL/RLS hosted, không deploy Edge Functions production, không bật chia sẻ thật. Real invite acceptance/delivery, hosted release, H5 PARTIAL, Guardian và recovery production vẫn chưa đóng. Không tuyên bố chia sẻ live. GitHub Pages chỉ phát hành app với sharing flag local-only theo quy trình đã duyệt.
