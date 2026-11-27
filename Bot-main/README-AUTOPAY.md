# Tự động cộng coin khi nạp (server tự đọc lịch sử giao dịch ngân hàng qua API)

Trước đây admin phải bấm "Xác nhận" từng lệnh nạp. Giờ server tự hỏi API lịch sử giao dịch, thấy tiền vào có mã nạp thì cộng coin ngay. Có 2 nguồn dữ liệu, chọn trong form:
- **Casso** (dùng cho Techcombank và nhiều ngân hàng khác): `GET https://oauth.casso.vn/v2/transactions`, header `Authorization: Apikey <key>`.
  Techcombank không có API công khai cho tài khoản cá nhân, nên phải liên kết tài khoản Techcombank vào Casso (casso.vn) rồi tạo API Key. Casso có thể thu phí theo gói kết nối.
- **dichvudark** (MB Bank, theo code mẫu trong file rar `api_check.php`): gọi API `lsgdv2` với Token, Code, Stk.

File: server/bankapi.js (gọi API, lưu Token/Code đã mã hoá), server/autopay.js (khớp mã nạp, cộng coin, API quản trị),
public/autopay.js (giao diện web admin), admin-app (giao diện app botctl), server/wallet.js (confirmByCode).

## Cách hoạt động
1. Người dùng tạo lệnh nạp, chuyển khoản kèm mã NAPxxxxxxx trong nội dung.
2. Server gọi API lịch sử giao dịch: khi có lệnh nạp đang chờ thì mỗi 25 giây, không có thì 5 phút một lần.
3. Với mỗi giao dịch tiền VÀO, lấy mã NAPxxxxxxx trong nội dung, tìm lệnh nạp tương ứng và cộng coin.
   Coin = số tiền thực nhận (nhận bằng hoặc hơn lệnh nạp thì cộng đúng số nhận, nhận ít hơn cũng cộng số đã nhận).

## Cài đặt (làm một lần, trong trang quản trị web hoặc tab money > bank của app)
**Techcombank (Casso):**
1. Đăng ký casso.vn, liên kết tài khoản Techcombank, tạo API Key.
2. Ở form chọn "Techcombank và ngân hàng khác (qua Casso)", dán API Key, bấm Lưu cấu hình. Số tài khoản có thể để trống (nếu điền, chỉ đọc giao dịch của tài khoản đó).

**MB Bank (dichvudark):** chọn "MB Bank", điền số tài khoản MB, Token, Code, bấm Lưu cấu hình.

Cả hai: bấm "Xem giao dịch gần nhất" kiểm tra (chưa cộng coin), chuyển thử khoản nhỏ kèm mã nạp, rồi bật công tắc "Bật tự động cộng coin".
Ô "Địa chỉ API" để trống thì dùng địa chỉ mặc định của nguồn đã chọn. Khoá để trống khi lưu lại thì giữ nguyên giá trị cũ. Đổi nguồn dữ liệu thì phải nhập lại khoá.
Với Casso, server đọc 50 giao dịch mới nhất trong 3 ngày gần đây mỗi lần hỏi.

## An toàn
- Khoá API (Token, Code hoặc API Key) mã hoá bằng APP_SECRET trong CSDL, không bao giờ trả về trình duyệt hay app. Địa chỉ API bắt buộc là https và có kiểm tra chứng chỉ SSL
  (code mẫu tắt kiểm tra này, ở đây đã bật).
- Lần đọc đầu tiên sau khi lưu cấu hình (hoặc đổi Token/Code/số tài khoản/địa chỉ) chỉ GHI NHỚ các giao dịch cũ ở trạng thái "bỏ qua", không cộng coin.
  Nhờ vậy lịch sử cũ không bị cộng nhầm.
- Mỗi giao dịch chỉ cộng một lần: bảng bank_events có UNIQUE(provider, ext_id), ext_id là mã giao dịch (refNo) hoặc dấu vân tay của dòng lịch sử.
  Ghi sự kiện và cộng coin nằm trong cùng một giao dịch CSDL.
- Code mẫu chỉ xét giao dịch đầu tiên trong danh sách. Ở đây xét TỪNG giao dịch nên không bỏ sót khi có nhiều khoản vào gần nhau.
- Chỉ nhận tiền vào (creditAmount > 0), tiền ra bị bỏ qua.
- Giao dịch không có mã nạp hợp lệ nằm ở danh sách "chưa khớp": admin gán cho tài khoản (tính như nạp thật) hoặc bỏ qua.
- Khi tắt tự động, tiền vào vẫn được ghi ở "chưa khớp" để gán tay, không mất. Duyệt tay trong mục "Nạp coin chờ duyệt" vẫn dùng được như cũ.
- Cấu hình Gmail/Google cũ đã bỏ. Khi server khởi động, token Google cũ trong CSDL bị xoá. Bạn có thể thu hồi quyền ở myaccount.google.com > Bảo mật.
  Nếu trước đó đang bật tự động mà chưa nhập API thì công tắc tự về tắt.
- Code mẫu trong file rar có kèm Token và Code của người làm video. Đừng dùng lại chúng, hãy dùng Token/Code của chính bạn.

## Cách thứ 3: đọc email biến động số dư của ngân hàng (không cần Casso hay dịch vụ bên thứ ba)
Ngân hàng gửi email "biến động số dư" vào hộp thư của bạn. Server đăng nhập hộp thư đó qua **IMAP** (cổng 993, TLS), đọc thư mới và cộng coin. Chọn nguồn "Đọc email biến động số dư (IMAP)" trong trang quản trị web.
Brevo và SMTP chỉ dùng để GỬI mail, không đọc được thư đến nên không dùng cho việc này.

Cài đặt (một lần):
1. Trong app ngân hàng, bật nhận thông báo biến động số dư qua email.
2. Gmail: bật xác minh 2 bước, bật IMAP (Cài đặt, Chuyển tiếp và POP/IMAP), tạo mật khẩu ứng dụng tại myaccount.google.com/apppasswords.
3. Trang quản trị: máy chủ `imap.gmail.com`, cổng `993`, email hộp thư, mật khẩu ứng dụng, người gửi là tên miền email ngân hàng (ví dụ `techcombank.com.vn`). Bấm Lưu, rồi "Xem giao dịch gần nhất" để kiểm tra, chuyển thử khoản nhỏ kèm mã nạp, rồi bật công tắc.

An toàn:
- Chỉ đọc (EXAMINE + BODY.PEEK): không xoá, không đánh dấu đã đọc, không gửi gì. Mật khẩu ứng dụng mã hoá bằng APP_SECRET, không trả về trình duyệt.
- Email có thể giả mạo, nên chỉ nhận thư có From thuộc đúng tên miền đã khai VÀ máy chủ hộp thư đã xác thực DKIM/SPF/DMARC đạt cho tên miền đó (đọc dòng Authentication-Results trên cùng, do chính máy chủ hộp thư thêm). Công tắc này mặc định bật. Hộp thư không có dòng đó (một số nhà cung cấp) thì thư bị loại; chỉ tắt khi hiểu rủi ro.
- Số tiền được đọc từ chữ trong thư, nên nếu lớn hơn lệnh nạp thì KHÔNG tự cộng mà để ở "chưa khớp" cho bạn xác nhận (nhận bằng hoặc ít hơn lệnh nạp thì cộng đúng số nhận).
- Thư tiền ra, thư quảng cáo, thư không đọc được số tiền đều bị bỏ qua. Lần đọc đầu sau khi lưu chỉ ghi nhớ thư cũ (3 ngày gần nhất), không cộng coin. Mỗi thư chỉ cộng một lần (bank_events UNIQUE).
- Thư nằm ở Spam hoặc thư mục khác ngoài Hộp thư đến sẽ không được đọc. Độ trễ phụ thuộc lúc ngân hàng gửi mail.
- Form trong app Android botctl chưa có nguồn email; hãy cấu hình ở trang quản trị web.
