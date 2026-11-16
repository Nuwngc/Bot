# Tự động cộng coin khi nạp

Trước đây admin phải bấm "Xác nhận" từng lệnh nạp. Giờ có thể để hệ thống tự cộng khi ngân hàng báo có tiền.

File mới: server/autopay.js (webhook + quản trị), public/autopay.js (giao diện quản trị)
File sửa: server/app.js (mở /api/webhooks/bank, không cần đăng nhập), server/routes.js (route admin, ẩn mã bí mật khỏi /admin/settings),
server/wallet.js (confirmByCode, assignManual, cờ autopay trong /wallet), public/wallet.js (người dùng thấy "Đang chờ tiền về" và số dư tự cập nhật),
public/dashboard.html, public/style.css

## Cách hoạt động
1. Dịch vụ trung gian (SePay hoặc Casso, có gói miễn phí) theo dõi tài khoản ngân hàng của admin.
2. Có tiền vào, họ gọi POST https://<tên-miền>/api/webhooks/bank.
3. Server kiểm tra mã bí mật, tìm mã NAPxxxxxxx trong nội dung chuyển khoản, tìm lệnh nạp tương ứng và cộng coin ngay.
   Coin = số tiền thực nhận (nếu người dùng chuyển khác số tiền trong lệnh thì cộng theo số thực nhận).

## Cài đặt (làm một lần, trong tab Quản trị, mục "Tự động cộng tiền khi nạp")
- SePay: WebHooks, Thêm webhooks. URL = link webhook trong mục này. Kiểu chứng thực = API Key, dán mã bí mật. Content type = application/json.
- Casso: Cài đặt, Tích hợp, Webhook. Dán link, Khoá bảo mật = mã bí mật.
- Bật công tắc "Bật tự động cộng coin", rồi thử nạp một khoản nhỏ.
- Server cũng nhận mã bí mật qua header "Authorization: Apikey <mã>", "Bearer <mã>", "secure-token" hoặc ?key=<mã>.

## An toàn
- Mã bí mật sinh ngẫu nhiên, lưu mã hoá, so sánh hằng số thời gian, sai nhiều lần từ một IP thì tạm khoá 10 phút. Có nút tạo mã mới.
- Mỗi giao dịch chỉ cộng một lần (bảng bank_events, UNIQUE(provider, ext_id), ghi sự kiện và cộng coin trong cùng một giao dịch CSDL),
  nên dịch vụ gửi lại webhook cũng không bị cộng trùng.
- Chỉ nhận tiền vào. Lệnh nạp đã huỷ mà tiền vẫn về thì vẫn cộng (tiền đã vào tài khoản). Chuyển lần 2 cùng mã thì không cộng, để ở "chưa khớp".
- Giao dịch không có mã nạp hợp lệ nằm ở danh sách "chưa khớp": admin gán cho tài khoản (tính như nạp thật, vào bảng xếp hạng) hoặc bỏ qua.
- Khi tắt tự động, tiền vào vẫn được ghi lại ở "chưa khớp" để gán tay, không mất.
- Duyệt tay trong mục "Nạp coin chờ duyệt" vẫn dùng được như cũ.
