# Quỹ VWCE cho bé

**VWCE Vault** là PWA **local-first** để theo dõi, ghi nhận và mô phỏng kế hoạch đầu tư gia đình với **Vanguard FTSE All-World UCITS ETF (VWCE, ISIN IE00BK5BQT80)**.

> **Mốc 2042 chỉ là mục tiêu hiện tại của kế hoạch đầu tư cho bé.** VWCE Vault có **vòng đời vô thời hạn** (*indefinite lifecycle*), không có application end date, và được thiết kế để tiếp tục sử dụng cho các mục tiêu, năm và kế hoạch trong tương lai.

## Production

**https://ziegepapa.github.io/quy-vwce-cho-be/**

## Tính năng chính

- **Tổng quan:** giá trị danh mục, vốn đóng, lãi/lỗ và trạng thái kế hoạch.
- **Giao dịch:** mua/bán VWCE, cash, phí, thuế được ghi nhận và lịch sử giao dịch.
- **Mục tiêu:** ngày mục tiêu, thời gian còn lại, lạm phát và các thông số kế hoạch.
- **Mô phỏng:** các kịch bản lợi suất và dòng tiền theo giả định.
- **Cài đặt:** giá VWCE, checklist, backup/restore và PWA.
- **Hồ sơ khẩn cấp:** thông tin hỗ trợ người thân khi cần tiếp quản.

## Kiến trúc

- **Local-first:** IndexedDB/Dexie là lớp dữ liệu chính và hoạt động offline.
- **Cloud:** Supabase Auth + đồng bộ theo từng người dùng khi bật cloud.
- **PWA:** tối ưu Safari/iPhone và có thể cài lên Màn hình chính.
- **Privacy:** không analytics; không đưa secret vào frontend.
- **Financial core:** transaction classifier, deterministic replay, validation và legacy quarantine.

```text
src/lib/       logic, IndexedDB, financial calculations, sync, types
src/pages/     application UI, auth, onboarding
scripts/       price feeds, icons, release/production checks
supabase/      auth/database/optional legacy Edge Function
```

## Phát triển local

Yêu cầu **Node.js 22+**.

```bash
npm ci
npm run dev
npm test
npm run build
npm run test:release
```

Production preview:

```bash
npx playwright install chromium
npm run build
npm run test:preview
```

Frontend configuration nằm trong `.env.example`.

**Không** đưa service-role key, provider key, password hoặc secret vào `VITE_*`, PWA, bundle, backup, diagnostics hay repository.

## CI / Deploy

Push lên `main` chạy các quality gates của project, gồm test, TypeScript/build, release verification, price-feed checks, smoke tests và Playwright. GitHub Pages chỉ deploy sau khi các cổng bắt buộc đạt.

**Production Health** kiểm tra định kỳ shell, PWA/service worker và price feeds.

## PWA trên iPhone

Mở production bằng **Safari → Chia sẻ → Thêm vào Màn hình chính**.

## Backup / Restore

- **JSON:** xuất/nhập từ Cài đặt.
- **CSV:** xuất giao dịch dạng UTF-8, phù hợp Excel.
- Backup do owner tự lưu tại nơi mình kiểm soát.
- Recovery drill chỉ dùng **fixture tổng hợp**, không dùng backup gia đình thật để thử lỗi.
- Quy trình vận hành: [`docs/OPERATIONS_RUNBOOK.md`](./docs/OPERATIONS_RUNBOOK.md).

## Quy ước dòng tiền

| Loại | Cash | Vốn đóng |
|---|---:|---:|
| `cash_in` | + | + |
| `cash_out` | − | tăng phần đã rút |
| `buy_vwce` | − toàn bộ thanh toán | — |
| `sell_vwce` | + sau phí/thuế | — |
| `fee` / `tax` | − | — |
| `safe_interest` | + | — |
| `adjust` | ±, bắt buộc ghi chú | — |

**Financial safety:** giao dịch mới được phân loại `accepted / incomplete / invalid`; oversell và economics không hợp lệ không được tạo hiệu ứng tài chính; replay theo thứ tự xác định và legacy unsafe rows có thể bị quarantine khi replay.

## Thuế

Giá vốn bình quân chỉ dùng để theo dõi nội bộ. Ứng dụng **không phải phần mềm khai thuế Đức** và hiện không triển khai:

- FIFO / tax-lot reconciliation;
- Vorabpauschale;
- tax optimization;
- tax advice.

Mọi mở rộng về thuế phải có nguồn dữ liệu phù hợp và **independent German tax-expert review** trước khi triển khai.

## AI Trace

Không có AI UI trên production critical path. Legacy AI/Trace code có thể vẫn tồn tại trong repository nhưng không phải thành phần bắt buộc để ứng dụng hoạt động; deterministic explanations chạy cục bộ, không gọi mạng.

## Bảo mật & quyền riêng tư

`VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` là public client configuration. RLS được thiết kế theo user/owner boundary; production policy và security evidence phải được xác minh theo detailed readiness report.

`npm audit --json` tại baseline hiện hành báo **0 vulnerabilities**. Không dùng `npm audit fix --force`; mọi dependency upgrade phải là PR độc lập, có full release matrix và audit delta. [1]

Không dùng production financial data cho test fixtures hoặc recovery drills.

### Đặt lại mật khẩu

Chọn **Quên mật khẩu** trên màn hình đăng nhập rồi kiểm tra email. Link hợp lệ mở root application callback để Supabase xử lý recovery session; sau đó app chỉ hiển thị form đặt mật khẩu mới. Link sai hoặc hết hạn chỉ hiện thông báo an toàn bằng đúng locale, không hiển thị token hay raw provider error. Nếu link không dùng được, yêu cầu link mới; không gửi ảnh chụp email/link hoặc credential cho người bảo trì. [2]

## Trạng thái hiện tại

**Readiness: `CONDITIONAL — NOT READY`** cho vai trò **sổ cái tài chính duy nhất có thẩm quyền tuyệt đối**.

Ứng dụng vẫn phù hợp để sử dụng như **local-first family investment tracker**, cùng với backup do owner kiểm soát và **sao kê/chứng từ broker độc lập**.

Dependency audit không còn là blocker. Readiness vẫn chưa thể nâng vì H4 chưa có behavioral RLS proof, H5 chưa có migration reproducibility proof, và P11.2 chờ independent German tax-expert review. Đây là limitation của readiness hiện tại, **không phải giới hạn vòng đời phần mềm**. Xem [`docs/LONG_TERM_READINESS.md`](./docs/LONG_TERM_READINESS.md) để biết evidence và decision hiện hành. [1]

## Nguyên tắc dự án

`Correctness > Data integrity > Recovery > Security > Compatibility > Maintainability > UX > New features`

VWCE Vault được xây dựng cho **sử dụng dài hạn vô thời hạn**. Mốc mục tiêu của một kế hoạch cụ thể có thể thay đổi; phần mềm, dữ liệu lịch sử và schema phải tiếp tục có khả năng bảo trì và nâng cấp trong tương lai.

## Handover và vận hành

Người bảo trì phải dùng [`docs/OPERATIONS_RUNBOOK.md`](./docs/OPERATIONS_RUNBOOK.md) cho normal release, emergency recovery và dependency update; dùng [`docs/LONG_TERM_READINESS.md`](./docs/LONG_TERM_READINESS.md) cho các evidence/boundary chưa đóng. Recovery drill chỉ chạy với vault/profile thử nghiệm và fixture tổng hợp.

## Miễn trừ

VWCE Vault chỉ hỗ trợ **theo dõi, ghi nhận và mô phỏng**. Đây không phải tư vấn đầu tư, tư vấn thuế và không cam kết lợi nhuận.

## References

[1]: ./docs/LONG_TERM_READINESS.md "Current readiness decision and dependency-audit evidence"
[2]: https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail "Supabase JavaScript password recovery"
