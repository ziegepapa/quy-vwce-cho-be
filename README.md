# Quỹ VWCE cho bé

PWA local-first theo dõi kế hoạch đầu tư **Vanguard FTSE All-World UCITS ETF (VWCE, IE00BK5BQT80)** từ **07/2026 đến 06/2042**.

- IndexedDB (Dexie) là lớp dữ liệu local/offline chính
- Supabase bảo vệ đăng nhập và đồng bộ dữ liệu theo từng người dùng
- Không analytics; AI giải thích là tùy chọn, chạy phía server và mặc định tắt
- Tối ưu cho Safari iPhone, cài được lên Màn hình chính và có chế độ offline

## Production

**https://ziegepapa.github.io/quy-vwce-cho-be/**

## Màn hình chính

1. **Tổng quan** — tài sản, vốn đóng, lãi/lỗ, việc cần làm và tiến độ mục tiêu
2. **Giao dịch** — mua/bán VWCE, nạp/rút cash, phí, thuế và bộ lọc
3. **Mục tiêu** — các mốc 2038 / 2039 / 2042, lạm phát, buffer và số đã bảo vệ
4. **Mô phỏng** — kịch bản 3% / 5% / 7%, biểu đồ SVG và bảng theo năm
5. **Cài đặt** — giá VWCE, checklist năm, backup JSON/CSV và PWA
6. **Hồ sơ khẩn cấp** — bản in dành cho người thân khi cần

## Công nghệ

React · TypeScript · Vite · Dexie · Supabase · vite-plugin-pwa · Vitest · Playwright · GitHub Actions · GitHub Pages

```text
src/lib/       tính toán, IndexedDB, đồng bộ, Trace và kiểu dữ liệu
src/pages/     giao diện ứng dụng, đăng nhập và onboarding
scripts/       cập nhật giá, tạo icon và kiểm tra release/production
supabase/      Edge Function AI tùy chọn
```

## Chạy local

Yêu cầu Node.js 22+.

```bash
npm install
npm run dev
npm test
npm run build
npm run test:release
```

Kiểm thử trình duyệt trong production preview:

```bash
npx playwright install chromium
npm run build
npm run test:preview
```

Biến môi trường frontend được mô tả trong `.env.example`. Không đưa khóa provider AI vào biến `VITE_*` hoặc mã nguồn.

## Deploy và cổng chất lượng

Push lên `main` kích hoạt workflow **Test and Deploy**:

1. Unit test và kiểm thử pipeline giá
2. TypeScript + production build
3. Kiểm tra release artifact: manifest, icon PNG/maskable, offline cache và hai feed giá
4. Deno check + mock smoke test cho Edge Function AI
5. Playwright trên production preview cô lập
6. Chỉ deploy GitHub Pages khi toàn bộ cổng trên xanh

Workflow **Production Health** chạy hằng ngày và có thể chạy thủ công để kiểm tra shell, PWA, service worker, độ mới và tính nhất quán của hai feed giá.

## Cài PWA trên iPhone

1. Mở URL production bằng **Safari**
2. Chọn **Chia sẻ → Thêm vào Màn hình chính**
3. Mở icon ở chế độ standalone; app dùng được offline sau lần tải đầu

Build tự tạo icon PNG 180/192/512, gồm icon maskable cho Android và Apple touch icon cho iOS.

## Backup / restore

- **Xuất JSON**: Cài đặt → Xuất JSON
- **Nhập JSON**: xem trước số record → tự tải backup hiện tại → ghi đè trong transaction
- **CSV giao dịch**: UTF-8 BOM và escaping chuẩn cho Excel

## Quy ước dòng tiền

| Loại | Cash | Vốn đóng |
|------|------|----------|
| cash_in | + | + |
| cash_out | − | tăng phần đã rút |
| buy_vwce | − toàn bộ thanh toán | không |
| sell_vwce | + sau phí/thuế | không |
| fee / tax | − | không |
| safe_interest | + | không |
| adjust | ±, bắt buộc ghi chú | không |

Giá vốn bình quân chỉ để theo dõi nội bộ — thuế Đức có thể dùng FIFO và khác kết quả app.

## AI giải thích Trace (tùy chọn)

Trace deterministic luôn hoạt động kể cả khi AI tắt hoặc lỗi. Để bật AI production cần deploy `supabase/functions/explain-trace`, cấu hình provider secret phía Supabase, chạy smoke test bằng tài khoản đã xác thực, rồi mới đặt repository variable `VITE_AI_TRACE_ENABLED=true`. Xem `supabase/functions/explain-trace/README.md`.

## Miễn trừ

Ứng dụng chỉ hỗ trợ theo dõi và mô phỏng. **Không phải** tư vấn đầu tư, tư vấn thuế hay cam kết lợi nhuận.

## Trạng thái phát hành

Core web, biểu đồ Simulation, PWA, backup/restore, pipeline giá, CI và production monitoring đã có cổng kiểm tra tự động. AI provider là tiện ích tùy chọn duy nhất cần credential/hạ tầng bên ngoài; khi chưa bật, ứng dụng vẫn hoạt động đầy đủ bằng Trace deterministic.
