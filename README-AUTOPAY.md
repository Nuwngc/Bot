# Tự động cộng coin khi nạp (server tự đọc email báo biến động số dư)

Trước đây admin phải bấm "Xác nhận" từng lệnh nạp. Giờ server tự đọc email ngân hàng gửi khi có tiền vào và cộng coin ngay.
Không dùng SePay, Casso hay dịch vụ bên thứ ba nào. Server không giữ mật khẩu, thẻ hay token ngân hàng và không có quyền chuyển tiền.

File: server/autopay.js (đọc hộp thư, cộng coin, API quản trị), server/imap.js (client IMAP chỉ đọc, không cần cài thêm gói),
server/bankmail.js (đọc email, lấy số tiền), public/autopay.js (giao diện quản trị), server/wallet.js (confirmByCode có thêm tuỳ chọn maxOrder).

## Cách hoạt động
1. Ngân hàng gửi email "biến động số dư" vào một Gmail riêng của admin.
2. Server đăng nhập IMAP vào Gmail đó (chỉ đọc, dùng mật khẩu ứng dụng), tìm email mới từ ngân hàng.
   Khi có lệnh nạp đang chờ thì kiểm tra mỗi 25 giây, không có thì 5 phút một lần.
3. Từ email lấy số tiền VÀO và mã NAPxxxxxxx trong nội dung chuyển khoản, tìm lệnh nạp tương ứng và cộng coin.
   Coin = số tiền thực nhận (nếu nhận ít hơn lệnh thì cộng theo số nhận).

## Cài đặt (làm một lần, tab Quản trị, mục "Tự động cộng tiền khi nạp")
1. Tạo Gmail riêng chỉ để nhận thông báo ngân hàng. Bật Xác minh 2 bước, tạo "Mật khẩu ứng dụng" tại myaccount.google.com/apppasswords.
2. Trong app ngân hàng bật thông báo biến động số dư qua email, điền Gmail riêng đó.
3. Điền form: Gmail, mật khẩu ứng dụng, địa chỉ hoặc tên miền ngân hàng gửi (xem ở mục "Từ" của một email thật, ví dụ mbbank.com.vn). Bấm "Lưu và kết nối".
4. Chuyển thử khoản nhỏ, bấm "Thử đọc email gần nhất" để xem server đọc đúng số tiền chưa. Rồi bật công tắc "Bật tự động cộng coin".

Mỗi ngân hàng viết email một kiểu. Bộ đọc dựa vào các cụm chung (dấu +, "tăng", "ghi có", "số tiền"...). Nếu nút "Thử đọc" báo không đọc được số tiền,
gửi cho người bảo trì một email mẫu (xoá số tài khoản) để chỉnh bộ đọc.

## An toàn
- Server chỉ đọc email (IMAP chế độ chỉ đọc, BODY.PEEK nên không đánh dấu đã đọc). Mật khẩu ứng dụng mã hoá bằng APP_SECRET trong CSDL, không bao giờ trả về trình duyệt.
  Nên dùng Gmail riêng: lỡ lộ mật khẩu cũng chỉ lộ hộp thư thông báo, không liên quan tới tiền.
- Chỉ tin email từ đúng địa chỉ / tên miền ngân hàng đã khai báo, và (chế độ chặt, mặc định bật) email phải có xác thực DKIM hoặc SPF đạt cho đúng tên miền đó theo ghi nhận của Gmail.
  Người lạ gửi email giả "+10.000.000 NAPxxxx" sẽ bị bỏ qua.
- Mỗi email chỉ cộng một lần: bảng bank_events có UNIQUE(provider, ext_id) với ext_id là Message-ID, ghi sự kiện và cộng coin trong cùng một giao dịch CSDL.
  Server cũng nhớ UID email đã đọc, nên tắt/bật lại hay server ngủ dậy cũng không bị cộng trùng hay bỏ sót.
- Chỉ nhận tiền vào (email tiền ra bị bỏ qua). Lần đầu kết nối chỉ đọc email đến sau đó, không đọc lại email cũ.
- Tiền nhận NHIỀU HƠN lệnh nạp không tự cộng (phòng đọc sai số tiền): nằm ở "chưa khớp", admin duyệt lệnh hoặc gán tay. Nhận ít hơn thì cộng đúng số nhận.
- Giao dịch không có mã nạp hợp lệ nằm ở danh sách "chưa khớp": admin gán cho tài khoản (tính như nạp thật, vào bảng xếp hạng) hoặc bỏ qua.
- Khi tắt tự động, tiền vào vẫn được ghi lại ở "chưa khớp" để gán tay, không mất. Duyệt tay trong mục "Nạp coin chờ duyệt" vẫn dùng được như cũ.
- Kết nối ra ngoài bằng IMAP qua TLS, cổng 993. Ghi chú trong server/mailer.js nói Render gói free chặn cổng SMTP; cổng 993 chưa được kiểm chứng trên Render của bạn, nếu "Lưu và kết nối" báo lỗi kết nối thì báo lại để xử lý.
- Webhook SePay / Casso (/api/webhooks/bank) đã bỏ. Mã bí mật cũ trong CSDL được xoá khi server khởi động.
