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

Backup là file do owner chủ động lưu tại nơi mình kiểm soát; ứng dụng không upload, không kiểm tra vị trí lưu bên ngoài và không thể khẳng định file còn có thể khôi phục. Trước đổi thiết bị/chuyển người vận hành hoặc định kỳ hằng năm, hãy thực hiện recovery drill trên browser profile/vault thử nghiệm với fixture tổng hợp theo [`runbook`](./docs/OPERATIONS_RUNBOOK.md), không dùng file backup gia đình để thử lỗi.

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

Giá vốn bình quân chỉ để theo dõi nội bộ — thuế Đức có thể dùng FIFO và khác kết quả app. Ứng dụng hiện **không** tính Vorabpauschale, không tạo tax lot/FIFO reconciliation và không tạo kết quả để khai thuế. Những hạng mục này được tách thành discovery P11, chỉ bắt đầu sau khi có nguồn dữ liệu, fiscal-year contract và chuyên gia thuế Đức kiểm tra.

## Trạng thái AI Trace legacy

**Không có phần AI nào đang hiển thị trong giao diện production.** P9 AI được owner tạm hoãn. Repository hiện còn client module `src/lib/aiTraceExplanation.ts` và Edge Function `supabase/functions/explain-trace` từ một thử nghiệm Trace legacy, nhưng không có page/component runtime nào import chúng để tạo nút hoặc panel AI. Vì vậy owner sẽ không thấy phần AI trong app hiện tại.

Trace deterministic là phần diễn giải cục bộ từ dữ liệu/công thức có sẵn, không gọi mạng và không phải AI. P10.0 đề xuất retire toàn bộ hạ tầng Trace legacy trong P10.4, thay vì giữ provider/env surface dormant; việc retire vẫn cần ADR/PR riêng và regression đầy đủ theo [`P10 risk register`](./docs/p10-baseline-and-long-term-risk-register.md).

## Cấu hình public và quyền riêng tư

`VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` là cấu hình public cần có trong static build để client kết nối Supabase; chúng không được dùng như server secret. Bất kỳ service-role key, provider key hoặc credential riêng nào đều bị cấm trong PWA, bundle, backup, diagnostics và repository. Source migration định nghĩa Row Level Security theo user, nhưng owner vẫn cần xác minh policy của **đúng production project** theo runbook; source không thay thế bằng chứng cấu hình production.

## Miễn trừ

Ứng dụng chỉ hỗ trợ theo dõi và mô phỏng. **Không phải** tư vấn đầu tư, tư vấn thuế hay cam kết lợi nhuận.

## Trạng thái phát hành

Core web, biểu đồ Simulation, PWA, backup/restore, pipeline giá, CI và production monitoring đã có cổng kiểm tra tự động. Hạ tầng AI Trace legacy không có UI caller, không được bật trong P8 và không nằm trên đường vận hành cốt lõi; ứng dụng hoạt động đầy đủ bằng các diễn giải deterministic cục bộ.
