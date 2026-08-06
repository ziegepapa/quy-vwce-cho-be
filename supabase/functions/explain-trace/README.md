# `explain-trace` Edge Function

Lớp AI này là **tùy chọn**. Trace deterministic trong giao diện luôn được hiển thị trước và vẫn hoạt động khi AI lỗi hoặc chưa được cấu hình.

## Guardrails

- Chỉ nhận payload Trace đã allow-list và giới hạn kích thước; không nhận row ID, liên kết nội bộ hoặc bản ghi IndexedDB.
- Yêu cầu người dùng Supabase đã xác thực.
- API key của nhà cung cấp chỉ nằm trong Supabase secrets, không đưa vào Vite/browser.
- Không lưu request/response và không ghi log payload.
- Prompt coi toàn bộ Trace là dữ liệu không tin cậy, không làm theo chỉ dẫn nằm trong dữ liệu.
- Cấm khuyến nghị mua/bán và luôn giữ thông báo “không phải tư vấn đầu tư”.

## Triển khai

1. Deploy function với JWT verification mặc định; **không** dùng `--no-verify-jwt`:

   ```bash
   supabase functions deploy explain-trace
   ```

2. Cấu hình một endpoint tương thích OpenAI Chat Completions ở phía server:

   ```bash
   supabase secrets set \
     AI_API_URL=https://api.openai.com/v1/chat/completions \
     AI_API_KEY=YOUR_SERVER_SIDE_KEY \
     AI_MODEL=YOUR_MODEL
   ```

3. Nếu cần thêm origin ngoài production và Vite local:

   ```bash
   supabase secrets set AI_ALLOWED_ORIGINS=https://example.com
   ```

4. Sau khi function và provider hoạt động, đặt GitHub Actions repository variable `VITE_AI_TRACE_ENABLED=true`. Khi biến chưa có hoặc khác `true`, nút AI không xuất hiện.

## Thứ tự phát hành an toàn

1. Deploy/configure Edge Function.
2. Gọi thử bằng tài khoản đã đăng nhập và xác minh response không chứa dữ liệu ngoài Trace.
3. Bật `VITE_AI_TRACE_ENABLED=true`.
4. Merge/deploy frontend theo quy trình CI bình thường.

Nếu bất kỳ bước nào lỗi, giữ feature flag tắt; không ảnh hưởng Trace deterministic hiện tại.
