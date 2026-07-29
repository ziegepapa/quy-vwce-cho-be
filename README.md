# Quỹ VWCE cho bé

PWA theo dõi kế hoạch đầu tư **Vanguard FTSE All-World UCITS ETF (VWCE)** từ **07/2026 đến 06/2042**.

- Offline-first, dữ liệu lưu **IndexedDB** trên thiết bị
- Không kết nối broker, không analytics, không backend
- Tối ưu Safari iPhone, cài được lên màn hình chính

## Demo

**https://ziegepapa.github.io/quy-vwce-cho-be/**

## Công nghệ

React · TypeScript · Vite · Dexie · vite-plugin-pwa · Vitest · GitHub Pages

## Chạy local

```bash
npm install
npm run dev
npm test
npm run build
```

## Cài PWA trên iPhone

1. Mở bằng Safari
2. Chia sẻ → Thêm vào Màn hình chính

## Sao lưu

Cài đặt → Xuất JSON / Nhập JSON / Xuất CSV giao dịch.

## Miễn trừ trách nhiệm

Ứng dụng chỉ hỗ trợ theo dõi và mô phỏng. Không phải tư vấn đầu tư, tư vấn thuế hay cam kết lợi nhuận.

## Cấu trúc

```
src/lib/     tính toán, DB
src/pages/   5 màn hình
```
