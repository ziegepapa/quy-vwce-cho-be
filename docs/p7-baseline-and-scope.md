# P7.0 — Baseline, phạm vi và tiêu chí chấp nhận

**Baseline commit:** `054dda0` (P6 hoàn tất)  
**Mục tiêu P7:** Cải thiện khả năng phục hồi dữ liệu, hiệu năng tải trang và quyền kiểm soát dữ liệu mà không thay đổi các quy tắc tài chính, schema hoặc cơ chế tự động xử lý đồng bộ.

> **Nguyên tắc fail closed:** Nếu backup, import, recovery, đồng bộ hoặc quyền riêng tư không thể được xác minh an toàn, ứng dụng phải giữ dữ liệu hiện tại và dừng thao tác có rủi ro. Không được suy đoán thành công hoặc tự thử thao tác destructive.

## 1. Các bất biến khóa

| Miền | Bất biến P7 |
|---|---|
| Ledger | Không thay đổi công thức, số dư, lãi/lỗ, mô phỏng, hoặc thứ tự kinh tế của ledger. |
| Giao dịch | Không tự tạo, sửa, điền, xóa hoặc quyết định giao dịch vì lỗi/backup/AI. |
| Conflict | Không auto-resolve, không gộp bản local/server và không tự chọn resolution. |
| Dữ liệu | Không schema/Dexie migration, version bump hoặc thay đổi payload contract nếu chưa có đặc tả và PR riêng. |
| `src/lib/**` | Không sửa data/sync/auth logic trong P7.1–P7.3; chỉ được thêm test không đổi production behavior khi thật sự cần. |
| Locale/a11y | Mọi UI reachable phải thuần Việt hoặc Đức; Escape chỉ đóng/back an toàn, không confirm/destructive. |
| API/AI | Không có call ngoài, credential hoặc telemetry mặc định. P7.4 chỉ là architecture decision; implementation thực cần giai đoạn riêng. |

## 2. Baseline artifact và performance budget đề xuất

Baseline được tạo từ `npm run build` trên P7.0, không dùng dữ liệu owner.

| Artifact | Raw bytes | Gzip bytes | Ý nghĩa |
|---|---:|---:|---|
| Initial JavaScript entry `index-*.js` | 1,210,542 | 356,495 | Entry app hiện tại; ứng viên chính cho P7.2. |
| Initial CSS `index-*.css` | 161,323 | 29,788 | Style entry hiện tại. |
| PDF worker | 1,325,124 | Không thuộc entry JS | Asset lớn cần giữ ngoài critical path khi có thể. |

P7.2 dùng budget ban đầu sau đây. Chúng là **guard chống regression**, không phải tuyên bố rằng kích thước hiện tại tối ưu.

| Metric | Budget CI ban đầu | Lý do |
|---|---:|---|
| Initial JS gzip | ≤ 400 KiB | Baseline 356,495 B + headroom có kiểm soát. |
| Initial CSS gzip | ≤ 40 KiB | Baseline 29,788 B + headroom. |
| Một asset JS đơn lẻ không phải entry | Chỉ báo cáo trong P7.2 | Không buộc fail trước khi biết asset có thực sự ở critical path hay không. |
| App shell precache | Bắt buộc có `index.html` | Contract P6.5, không được suy giảm bởi code splitting. |

## 3. Matrix P7.1 — backup, import và recovery

P7.1 là ưu tiên đầu tiên sau P7.0. Nó mở rộng **bằng chứng kiểm thử** cho luồng đang có; không thay đổi schema hoặc tự thay dữ liệu.

| Case | Input/điều kiện | Kết quả bắt buộc |
|---|---|---|
| Export hợp lệ | Vault fixture xác định, có settings và giao dịch mẫu. | Tạo `BackupPayload` có schema được hỗ trợ, timestamp hợp lệ và các collection có contract đúng. |
| Pre-import backup | Một import hợp lệ được xác nhận. | Export safety backup phải hoàn tất trước khi gọi import. Nếu export lỗi, import không được chạy. |
| JSON hỏng | File không parse được. | Alert locale an toàn; modal đóng; không gọi import, không thay dữ liệu. |
| Payload sai cấu trúc | JSON parse được nhưng không phải backup object hợp lệ. | Fail closed, không gọi import. |
| Schema không hỗ trợ | `schemaVersion` ngoài allowlist. | Alert locale an toàn, không gọi import. |
| Pending sync | Engine nêu `PendingSyncImportBlockedError`. | Không import im lặng; giữ confirm; yêu cầu push-first hoặc chấp nhận rủi ro rõ ràng. |
| Push-first lỗi | Pending sync có và push outbox thất bại. | Hiện copy an toàn, không lộ error gốc, vẫn không import. |
| Import lỗi | Import reject không phải pending gate. | Hiện copy an toàn, gọi reload = 0, dữ liệu hiện tại được giữ. |
| Round trip | Export fixture → validate/import vào storage cô lập → đọc lại. | Các thuộc tính được chọn trong contract giữ nguyên; không kiểm tra bằng object identity hoặc dữ liệu thật. |

## 4. Coverage hiện có và gap P7.1

Các regression UI hiện đã chứng minh: pending-sync warning, push-first, accept-risk, pre-import backup fail và non-leak error copy. P7.1 cần bổ sung kiểm chứng sâu hơn ở phạm vi fixture xác định:

1. **Round-trip contract** qua backup payload hợp lệ, xác nhận chỉ các field/số lượng đã đặc tả.
2. **Tính nguyên tử khi import lỗi**: state source fixture còn nguyên sau reject.
3. **Đối xứng Việt/Đức** cho case invalid JSON, unsupported schema và pre-import backup fail trên các control reachable.
4. **Không rò payload** cho path backup/import trong UI và test integration.

## 5. P7.2–P7.4 acceptance gates

| Pha | Điều phải đúng trước PR | Điều phải đúng trước merge |
|---|---|---|
| P7.2 | Script analyzer đọc `dist` xác định; budget dựa trên baseline này. | `npm run build`, release/preview pass; app shell vẫn precache. |
| P7.3 | Data inventory là allowlist; action xóa có scope rõ và non-destructive với ledger trừ khi owner xác nhận luồng hiện có. | Canary không lộ secret/payload; locale audit 0 active candidate. |
| P7.4 | ADR nêu use case, data minimization, consent, failure/cost và fallback local. | Mặc định là **không call API**. Nếu cần AI/API thật, dừng P7 và mở phạm vi mới. |

## 6. Pipeline bắt buộc cho mọi PR P7

```bash
npm test
npm run benchmark:ledger:check
npm run audit:locale
npm run build
npm run test:release
npm run test:preview
```

Chỉ merge khi `test-build`, `edge-smoke`, `preview-smoke` đều xanh. Sau merge, phải kiểm tra workflow `main` gồm deploy trước khi đánh dấu pha hoàn tất.

## 7. Quyết định thực thi tiếp theo

Bắt đầu **P7.1** bằng một PR riêng trên nhánh `feat/p7-1-backup-recovery-contract`. PR này giới hạn ở fixture/test contract, copy locale hoặc guard UI cần thiết; không thay đổi schema/Dexie, `src/lib/**` production logic, ledger economics hoặc engine sync/auth.
