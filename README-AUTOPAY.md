# Tự động cộng coin khi nạp (server tự đọc lịch sử giao dịch MB Bank qua API)

Trước đây admin phải bấm "Xác nhận" từng lệnh nạp. Giờ server tự hỏi API lịch sử giao dịch của MB Bank, thấy tiền vào có mã nạp thì cộng coin ngay.
Cách làm theo bộ code mẫu trong file rar (`api_check.php`: gọi API `lsgdv2` với Token, Code, Stk, rồi so số tiền và nội dung chứa mã giao dịch).

File: server/bankapi.js (gọi API, lưu Token/Code đã mã hoá), server/autopay.js (khớp mã nạp, cộng coin, API quản trị),
public/autopay.js (giao diện web admin), admin-app (giao diện app botctl), server/wallet.js (confirmByCode).

## Cách hoạt động
1. Người dùng tạo lệnh nạp, chuyển khoản kèm mã NAPxxxxxxx trong nội dung.
2. Server gọi API lịch sử giao dịch: khi có lệnh nạp đang chờ thì mỗi 25 giây, không có thì 5 phút một lần.
3. Với mỗi giao dịch tiền VÀO, lấy mã NAPxxxxxxx trong nội dung, tìm lệnh nạp tương ứng và cộng coin.
   Coin = số tiền thực nhận (nhận bằng hoặc hơn lệnh nạp thì cộng đúng số nhận, nhận ít hơn cũng cộng số đã nhận).

## Cài đặt (làm một lần, trong trang quản trị web hoặc tab money > bank của app)
1. Lấy Token và Code của dịch vụ API lịch sử giao dịch MB Bank (mặc định `https://api.dichvudark.vn/api/ApiMbBank`, loại API `lsgdv2`).
2. Điền số tài khoản MB nhận tiền (đúng số đã khai báo ở phần Ngân hàng), Token, Code, bấm Lưu cấu hình.
   Ô "Địa chỉ API" để trống thì dùng địa chỉ mặc định. Token/Code để trống khi lưu lại thì giữ nguyên giá trị cũ.
3. Bấm "Xem giao dịch gần nhất" để kiểm tra server đọc được lịch sử (chưa cộng coin).
4. Chuyển thử khoản nhỏ kèm mã nạp, rồi bật công tắc "Bật tự động cộng coin".

## An toàn
- Token và Code mã hoá bằng APP_SECRET trong CSDL, không bao giờ trả về trình duyệt hay app. Địa chỉ API bắt buộc là https và có kiểm tra chứng chỉ SSL
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
