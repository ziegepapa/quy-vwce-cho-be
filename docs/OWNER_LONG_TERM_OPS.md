# Quy trình vận hành dài hạn (owner)

Tài liệu này **không** thay H4/H5 behavioral proof. Nó đóng các hạng mục vận hành mà owner/CI có thể làm ngay.

## 1. H4 / H5 — trạng thái

| Hạng mục | Trạng thái | Việc cần |
|----------|------------|----------|
| H4 RLS hành vi (A/B/anonymous) | **BLOCKED** | Staging Supabase + anon/service credentials; không dùng production data |
| H5 migration reset/upgrade | **BLOCKED** | Controlled DB + ordered baseline; repo hiện có `schema.sql` + `002_…` (SQL Editor) |

Static policy: `docs/H4-RLS-EVIDENCE.md`, `supabase/schema.sql`.

## 2. Diễn tập backup thật (bắt buộc định kỳ)

1. **Thiết bị A:** Cài đặt → Dữ liệu → **Sao lưu JSON** → lưu file an toàn (không commit Git).
2. Ghi lại: số giao dịch, tổng góp, số dư hiển thị (Overview).
3. **Thiết bị B** (hoặc xóa dữ liệu local trên A sau khi đã có bản sao): Cài đặt → **Khôi phục dữ liệu** → chọn file.
4. So khớp: giao dịch, Overview, Settings kế hoạch.
5. Nếu lệch: **không** ghi đè thêm; giữ file backup và kiểm tra conflict/sync trước khi thao tác tiếp.

CI backup round-trip **không** thay bước này.

## 3. Checklist production sau mỗi deploy

Trên **iPhone Safari / PWA** (và desktop nếu tiện):

- [ ] App load (`/#/` hoặc start URL)
- [ ] PWA: thông báo cập nhật chỉ khi owner xác nhận (không force reload bất ngờ)
- [ ] Quote / giá VWCE hiển thị, không lỗi feed
- [ ] Overview: số liệu và data health hợp lý
- [ ] Transactions: danh sách, lọc, sheet không bị dock che
- [ ] Settings: 3 tab Chung / Giá / Dữ liệu; plan sheet mở được; bảng năm hiện
- [ ] PDF import (nếu dùng): sheet trên dock, nút reachable

CI: workflow `Production Health` (`verify:production`, `MAX_QUOTE_AGE_DAYS=7`).

## 4. Quote feed

- Workflow: `.github/workflows/update-vwce-price.yml`
  - Tối T2–T6 ~17:30 UTC + catch-up sáng T3–T7 06:00 UTC
- Chỉ ghi **phiên đã đóng**; không bịa giá trong ngày.
- Nếu `asOf` già hơn vài phiên: Actions → **Update VWCE price** → Run workflow; xem log commit `chore(data): update quotes…`.

## 5. Đồng bộ & conflict (nhiều thiết bị)

1. Cài đặt → **Dữ liệu**.
2. Xem health: pending / conflict / dead outbox.
3. **Xử lý conflict thủ công** (owner chọn bản ghi) — app **không** auto-merge.
4. Dead outbox: chỉ revive khi đã hiểu nguyên nhân.
5. **Đăng xuất chỉ khi** không còn blocker sync/recovery (banner/recovery phải xong).

## 6. Chất lượng giao dịch

- Inbox “cần rà soát”: thiếu note, thiếu quantity, oversell, …
- Ưu tiên severity **action** trước.
- Nhập đủ chứng từ (PDF TR / thủ công); không để tồn đọng lâu.

## 7. Settings / Horizon

- Bảng kế hoạch năm = **minh họa thực tế từ góp + pha**, không phải lệnh mua/bán.
- **Không** đưa lại control “Preview chuyển đổi/năm” 8/12/16%.
- Giả định mô phỏng chỉ ảnh hưởng preview, không sửa ledger.

## 8. CSP

- CSP hiện là **meta** trong `index.html` (phù hợp GitHub Pages).
- Không phải HTTP response header cứng — giới hạn đã biết; không block ship.
