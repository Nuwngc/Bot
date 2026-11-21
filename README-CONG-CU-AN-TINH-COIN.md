# Ẩn công cụ và tính coin cho từng công cụ (tab Công cụ)

Admin chỉnh cho mỗi công cụ: **ẩn** khỏi người dùng, **giá** (coin cho một phiên) và **thời gian phiên** (phút). Giá 0 là miễn phí.
Người dùng thấy nhãn giá trên thẻ công cụ, bấm "Mở khoá" thì bị trừ coin trong ví rồi dùng thoải mái trong phiên (mặc định 30 phút).
Bấm Mở khoá lần nữa trong lúc phiên còn hiệu lực thì không bị trừ thêm. Hết phiên thì khoá lại. Admin luôn dùng miễn phí và vẫn thấy công cụ đang ẩn (có nhãn "Đang ẩn").

## File
- server/toolcfg.js (mới): danh sách công cụ, lưu cấu hình (settings.tools_config), bảng tool_unlocks, API, chặn ở máy chủ
- server/routes.js : thêm 1 dòng đăng ký `require("./toolcfg").register(router, auth)` TRƯỚC tempmail / tts / pagetext
- public/toolcfg.js (mới): áp cấu hình lên các thẻ công cụ (ẩn, nhãn giá, khoá / mở khoá). Không sửa tools.js và office-tools.js
- public/toolcfg-admin.js (mới): khung "Công cụ: ẩn và tính coin" trong tab Quản trị web
- public/dashboard.html : nạp 2 file trên
- admin-app/app/src/main/assets/app.js : tab money, mục con "công cụ" (cần build lại APK)

## API
- GET /api/tools/config : trạng thái từng công cụ cho người đang đăng nhập (ẩn, giá, phút, số giây còn lại) và số dư
- POST /api/tools/unlock { tool } : mở khoá, trừ coin (ghi vào lịch sử ví dạng "Công cụ: tên · số phút")
- GET /api/admin/tools, POST /api/admin/tools { tools: { id: { hidden, price, minutes } } } : chỉ admin. Chỉ gửi id nào cần đổi.

## Mức độ chặn
- Máy chủ chặn thật (gọi thẳng API cũng bị từ chối): Đọc văn bản (tts), Lấy văn bản từ link (pagetext), Mail 5 phút, Mail 12h / 24h.
  Với hai công cụ mail, giá chỉ áp cho việc tạo hộp thư mới; hộp thư đã có vẫn xem được. Nghe thử giọng đọc luôn miễn phí. Công cụ bị ẩn thì chặn mọi thao tác.
- Các công cụ còn lại chạy hoàn toàn trên trình duyệt người dùng nên chỉ chặn ở giao diện. Người rành kỹ thuật vẫn có thể vượt qua.
  Muốn chặn chắc chắn thì phải chuyển công cụ đó sang xử lý ở máy chủ.
