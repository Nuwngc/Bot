# Tự động cộng coin khi nạp (server tự đọc email báo biến động số dư, đăng nhập bằng Google)

Trước đây admin phải bấm "Xác nhận" từng lệnh nạp. Giờ server tự đọc email ngân hàng gửi khi có tiền vào và cộng coin ngay.
Không dùng SePay, Casso hay dịch vụ bên thứ ba nào. Server không giữ mật khẩu, thẻ hay token ngân hàng và không có quyền chuyển tiền.
Gmail được kết nối bằng "Đăng nhập bằng Google" (OAuth) như Google khuyên, không dùng mật khẩu ứng dụng.

File: server/autopay.js (đọc email, cộng coin, API quản trị), server/gmail.js (đăng nhập Google và đọc Gmail chỉ đọc),
server/bankmail.js (đọc email, lấy số tiền), public/autopay.js (giao diện web admin), admin-app (giao diện app botctl),
server/wallet.js (confirmByCode có thêm tuỳ chọn maxOrder), server/app.js (đường dẫn Google chuyển về sau khi đăng nhập).

## Cách hoạt động
1. Ngân hàng gửi email "biến động số dư" vào một Gmail riêng của admin.
2. Admin bấm "Đăng nhập bằng Google", cấp quyền gmail.readonly (chỉ xem email). Server giữ refresh token đã mã hoá.
3. Server hỏi Gmail API tìm email mới từ ngân hàng. Khi có lệnh nạp đang chờ thì kiểm tra mỗi 25 giây, không có thì 5 phút một lần.
4. Từ email lấy số tiền VÀO và mã NAPxxxxxxx trong nội dung chuyển khoản, tìm lệnh nạp tương ứng và cộng coin.
   Coin = số tiền thực nhận (nếu nhận ít hơn lệnh thì cộng theo số nhận).

## Cài đặt (làm một lần)
Google không cho dùng chung "ứng dụng đăng nhập" của người khác cho quyền đọc Gmail, nên bạn tạo một ứng dụng OAuth của riêng bạn (miễn phí, khoảng 5 phút):
1. Tạo Gmail riêng chỉ để nhận thông báo ngân hàng. Trong app ngân hàng bật thông báo biến động số dư qua email, điền Gmail đó.
2. Vào console.cloud.google.com bằng Gmail đó, tạo Project. APIs & Services > Library > Gmail API > Enable.
3. OAuth consent screen (Google Auth Platform): loại External, điền tên app và email, thêm scope gmail.readonly, thêm Gmail riêng vào Test users.
   Bấm Publish app (In production). Nếu để Testing thì quyền đăng nhập hết hạn sau 7 ngày. Google sẽ cảnh báo "app chưa xác minh": đó là app của chính bạn, bấm Nâng cao rồi tiếp tục.
4. Credentials > Create credentials > OAuth client ID > Web application. Authorized redirect URIs: dán đúng địa chỉ hiện ở ô "Redirect URI" trong trang quản trị
   (dạng https://<máy-chủ>/api/admin/autopay/google/callback). Nếu máy chủ có tên miền khác với địa chỉ bạn đang mở, đặt biến PUBLIC_URL cho đúng.
5. Chép Client ID và Client Secret vào form (web hoặc app admin), điền email/tên miền ngân hàng gửi (xem mục "Từ" của một email thật, vd mbbank.com.vn),
   bấm "Đăng nhập bằng Google", chọn Gmail riêng và cho phép xem email. App Android mở trình duyệt của máy để đăng nhập (Google không cho đăng nhập trong WebView), xong quay lại app.
6. Chuyển thử khoản nhỏ, bấm "Thử đọc email gần nhất" để xem server đọc đúng số tiền chưa, rồi bật công tắc "Bật tự động cộng coin".

Mỗi ngân hàng viết email một kiểu. Bộ đọc dựa vào các cụm chung (dấu +, "tăng", "ghi có", "số tiền"...). Nếu nút "Thử đọc" báo không đọc được số tiền,
gửi cho người bảo trì một email mẫu (xoá số tài khoản) để chỉnh bộ đọc.

## An toàn
- Quyền xin Google là gmail.readonly: chỉ xem email, không gửi, xoá hay sửa được gì. Dùng Gmail riêng nên lỡ lộ cũng chỉ lộ hộp thư thông báo, không liên quan tới tiền.
  Client Secret và refresh token mã hoá bằng APP_SECRET trong CSDL, không bao giờ trả về trình duyệt hay app. "Ngắt kết nối" thu hồi quyền ngay ở Google.
- Trang Google chuyển về (/api/admin/autopay/google/callback) không cần phiên đăng nhập (app mở bằng trình duyệt khác), bảo vệ bằng tham số state ngẫu nhiên,
  dùng một lần, hết hạn sau 10 phút, chỉ lưu phía server. Người ngoài gọi vào không thể kết nối hộp thư của họ.
- Chỉ tin email từ đúng địa chỉ / tên miền ngân hàng đã khai báo, và (chế độ chặt, mặc định bật) email phải có xác thực DKIM hoặc SPF đạt cho đúng tên miền đó theo ghi nhận của Gmail.
  Người lạ gửi email giả "+10.000.000 NAPxxxx" sẽ bị bỏ qua. Nếu nút "Thử đọc" cho thấy email thật bị báo "không qua xác thực" thì tắt chế độ chặt hoặc báo lại để chỉnh.
- Mỗi email chỉ cộng một lần: bảng bank_events có UNIQUE(provider, ext_id) với ext_id là Message-ID, ghi sự kiện và cộng coin trong cùng một giao dịch CSDL.
  Server nhớ mốc thời gian email đã đọc, nên tắt/bật lại hay server ngủ dậy cũng không bị cộng trùng hay bỏ sót. Lần đầu đăng nhập chỉ đọc email đến sau đó.
- Chỉ nhận tiền vào (email tiền ra bị bỏ qua).
- Tiền nhận NHIỀU HƠN lệnh nạp không tự cộng (phòng đọc sai số tiền): nằm ở "chưa khớp", admin duyệt lệnh hoặc gán tay. Nhận ít hơn thì cộng đúng số nhận.
- Giao dịch không có mã nạp hợp lệ nằm ở danh sách "chưa khớp": admin gán cho tài khoản (tính như nạp thật, vào bảng xếp hạng) hoặc bỏ qua.
- Khi tắt tự động, tiền vào vẫn được ghi lại ở "chưa khớp" để gán tay, không mất. Duyệt tay trong mục "Nạp coin chờ duyệt" vẫn dùng được như cũ.
- Mọi liên lạc với Google đi qua HTTPS (googleapis.com), không cần mở cổng IMAP/SMTP, nên không bị chặn như SMTP trên Render gói free.
- Nếu báo "Google đã thu hồi quyền": thường do app Google Cloud còn ở Testing (hết hạn 7 ngày) hoặc bạn gỡ quyền. Publish app rồi đăng nhập lại.
- Webhook SePay / Casso (/api/webhooks/bank) đã bỏ. Mã bí mật cũ trong CSDL được xoá khi server khởi động.
