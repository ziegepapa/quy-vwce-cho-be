# Quỹ VWCE cho bé

PWA offline-first theo dõi kế hoạch đầu tư **Vanguard FTSE All-World UCITS ETF (VWCE, IE00BK5BQT80)** từ **07/2026 đến 06/2042**.

- Dữ liệu chỉ lưu **IndexedDB** trên thiết bị (Dexie)
- Không backend, không analytics, không gửi dữ liệu tài chính ra ngoài
- Tối ưu Safari iPhone, cài được lên Màn hình chính

## Production

**https://ziegepapa.github.io/quy-vwce-cho-be/**

## 5 màn hình

1. **Tổng quan** — tài sản, vốn đóng, lãi/lỗ, việc cần làm, tiến độ mục tiêu
2. **Giao dịch** — mua/bán VWCE, nạp/rút cash, phí, thuế, lọc năm/loại
3. **Mục tiêu** — 2038 / 2039 / 2042, lạm phát, buffer, số đã bảo vệ
4. **Mô phỏng** — 3% / 5% / 7%, đóng góp, bảng theo năm
5. **Cài đặt** — giá VWCE, checklist năm, backup JSON/CSV, PWA

## Công nghệ

React · TypeScript · Vite · Dexie · vite-plugin-pwa · Vitest · GitHub Pages (HashRouter)

```
src/lib/     calc, db, types, defaults
src/pages/   5 màn hình + onboarding
```

## Chạy local

Yêu cầu Node.js 20+

```bash
npm install
npm run dev
npm test
npm run build
```

## Deploy

Push `main` → workflow **Test and Deploy** (`npm install` → test → build → `actions/deploy-pages`).

Pages Source phải là **GitHub Actions**.

## Cài PWA trên iPhone

1. Mở URL production bằng **Safari**
2. Chia sẻ → **Thêm vào Màn hình chính**
3. Mở icon (standalone); offline sau lần tải đầu

## Backup / restore

- **Xuất JSON**: Cài đặt → Xuất JSON (đủ settings, goals, transactions, checklist, snapshots)
- **Nhập JSON**: xem trước số record → tự tải backup hiện tại → ghi đè trong transaction
- **CSV giao dịch**: UTF-8 BOM, escaping chuẩn cho Excel

## Quy ước dòng tiền

| Loại | Cash | Vốn đóng |
|------|------|----------|
| cash_in | + | + |
| cash_out | − | (tăng rút) |
| buy_vwce | − (toàn bộ thanh toán) | **không** |
| sell_vwce | + (sau phí/thuế) | không |
| fee / tax | − | không |
| safe_interest | + | không |
| adjust | ± (bắt buộc ghi chú) | không |

Giá vốn bình quân chỉ để theo dõi nội bộ — thuế Đức có thể dùng FIFO và khác kết quả app.

## Miễn trừ

Ứng dụng chỉ hỗ trợ theo dõi và mô phỏng. **Không phải** tư vấn đầu tư, tư vấn thuế hay cam kết lợi nhuận.

## Giới hạn còn lại (v1.1)

- Biểu đồ SVG lịch sử đầy đủ chưa có (metrics + bảng năm đã có)
- Icon PWA hiện SVG; PNG/maskable/apple-touch nên bổ sung khi có asset
- Lịch đóng góp nhiều mốc và lộ trình 60/40–30/70 UI còn đơn giản trong Simulation
- Chưa có UI integration test tự động (unit test calc đã mở rộng)
