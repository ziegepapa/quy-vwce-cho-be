# Quỹ VWCE cho bé

PWA **local-first** theo dõi kế hoạch đầu tư **Vanguard FTSE All-World UCITS ETF (VWCE, IE00BK5BQT80)** từ **07/2026 → 06/2042**.

- **Local-first:** IndexedDB (Dexie), hỗ trợ offline
- **Cloud:** Supabase Auth + đồng bộ theo người dùng
- **Privacy:** không analytics; AI tùy chọn và mặc định tắt
- **Platform:** tối ưu Safari/iPhone, hỗ trợ PWA

## Production

**https://ziegepapa.github.io/quy-vwce-cho-be/**

## Chức năng

- **Tổng quan:** tài sản, vốn, lãi/lỗ, tiến độ mục tiêu
- **Giao dịch:** mua/bán VWCE, cash, phí, thuế
- **Mục tiêu:** các mốc 2038 / 2039 / 2042, lạm phát và buffer
- **Mô phỏng:** kịch bản 3% / 5% / 7%
- **Cài đặt:** giá VWCE, checklist, backup/restore, PWA
- **Hồ sơ khẩn cấp:** thông tin dành cho người thân

## Công nghệ

React · TypeScript · Vite · Dexie · Supabase · Vitest · Playwright · GitHub Actions · GitHub Pages

```text
src/lib/       logic, IndexedDB, sync, Trace, types
src/pages/     UI, auth, onboarding
scripts/       price feed, icons, release/production checks
supabase/      Edge Function AI tùy chọn
```

## Phát triển

Yêu cầu **Node.js 22+**.

```bash
npm install
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

Frontend config nằm trong `.env.example`. **Không** đưa provider key hoặc secret vào `VITE_*` hay source code.

## CI / Deploy

Push lên `main` chạy workflow **Test and Deploy**: unit tests, TypeScript/build, release checks, price feeds, Edge Function smoke test và Playwright. GitHub Pages chỉ deploy khi các cổng kiểm tra đạt.

**Production Health** chạy hằng ngày để kiểm tra PWA, service worker, shell và price feeds.

## PWA trên iPhone

Mở production bằng **Safari → Chia sẻ → Thêm vào Màn hình chính**. App hỗ trợ offline sau lần tải đầu.

## Backup / restore

- **JSON:** Cài đặt → Xuất/Nhập JSON
- **CSV:** xuất giao dịch UTF-8, tương thích Excel
- Backup do owner tự lưu và tự chịu trách nhiệm. Recovery drill nên thực hiện bằng fixture tổng hợp theo [`runbook`](./docs/OPERATIONS_RUNBOOK.md), không dùng backup gia đình thật.

## Quy ước dòng tiền

| Loại | Cash | Vốn đóng |
|---|---:|---:|
| `cash_in` | + | + |
| `cash_out` | − | tăng phần đã rút |
| `buy_vwce` | − toàn bộ | — |
| `sell_vwce` | + sau phí/thuế | — |
| `fee` / `tax` | − | — |
| `safe_interest` | + | — |
| `adjust` | ±, bắt buộc ghi chú | — |

Giá vốn bình quân chỉ dùng theo dõi nội bộ. App **không** tính Vorabpauschale, tax lot/FIFO reconciliation hoặc kết quả khai thuế. Đây là discovery riêng, chỉ triển khai sau khi có nguồn dữ liệu và kiểm tra chuyên gia thuế Đức.

## AI Trace

Không có AI UI trong production. AI Trace legacy còn tồn tại trong source nhưng không được runtime gọi; deterministic Trace chạy cục bộ, không gọi mạng. Việc retire legacy được xử lý riêng bằng ADR/PR.

## Bảo mật & quyền riêng tư

`VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` là public client configuration. Service-role key, provider key và credential riêng **không được phép** xuất hiện trong PWA, bundle, backup, diagnostics hoặc repository.

RLS được thiết kế theo user; production policy phải được xác minh theo [`OPERATIONS_RUNBOOK`](./docs/OPERATIONS_RUNBOOK.md).

## Miễn trừ

Ứng dụng chỉ để **theo dõi và mô phỏng**. Không phải tư vấn đầu tư, tư vấn thuế và không cam kết lợi nhuận.

## Trạng thái

Core web, Simulation, PWA, backup/restore, price pipeline, CI và production monitoring đã có automated checks. AI Trace legacy không nằm trên đường vận hành cốt lõi.