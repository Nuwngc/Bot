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
