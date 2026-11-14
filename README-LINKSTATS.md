# Thống kê vượt link (admin)

Tab mới "Thống kê link" (chỉ admin thấy, nằm sau tab Doanh thu).

File mới: server/linkstats.js, public/linkstats.js
File sửa (vài dòng): server/routes.js (đăng ký route), public/dashboard.html (thẻ script),
public/bots.js (cho phép mở thẳng #linkstats khi tải lại trang), public/style.css (cuối file)

Nội dung trang (chọn Hôm nay / 7 ngày / 30 ngày / Tất cả, không tính tài khoản admin):
1. Mỗi nhà cung cấp: số lượt vượt xong, số người, coin đã phát ra, tiền thu về, chênh lệch, thời gian vượt trung bình.
2. Coin phát ra so với tiền thu về của cả hệ thống:
   coin miễn phí (vượt link + thưởng xếp hạng + admin cộng) so với tiền thật (nạp + đơn chuyển khoản cũ + tiền nhà cung cấp trả).
3. Người vượt nhiều bất thường, kèm lý do:
   - vượt gấp nhiều lần mức trung vị (cần ít nhất 5 người vượt để so sánh)
   - ngày nào cũng chạm trần lượt/ngày (từ 3 ngày, chiếm ít nhất 70% số ngày có vượt)
   - từ 80% lượt trở lên vượt sát mức thời gian tối thiểu (từ 5 lượt)
   - dùng chung IP với từ 2 tài khoản khác (cùng wifi hoặc 4G cũng có thể trùng, chỉ để tham khảo)

Tiền thu về (ưu tiên từ trên xuống):
1. Tự động từ API xem thu nhập của nhà cung cấp: ở mỗi thẻ có mục "Tự lấy tiền thu về". Dán link API
   (key trong link tự đổi thành {token}), bấm "Lưu & lấy thử". Server dò số tiền trong phản hồi JSON
   (hoặc bạn chọn trường), gọi lại mỗi 30 phút và lưu mốc đo vào bảng link_earnings.
   Tiền nhận trong kỳ = phần tăng thêm giữa các mốc đo. Kiểu số "Tổng đã kiếm" hoặc "Số dư" (rút tiền thì số dư giảm).
   Nếu API trả USD thì nhập tỉ giá vào ô "1 đơn vị API = ? đ". Đổi cấu hình sẽ xoá mốc đo cũ.
   Số liệu chỉ đo được từ lúc bật, nên coin so sánh chỉ tính trong khoảng đã đo.
2. Ước tính: số lượt × "tiền thu về mỗi lượt" nhập tay (dùng khi nhà cung cấp không có API).
Chưa có cả hai thì cột tiền hiện "—".

Lưu ý: link4m và traffic24h chỉ công khai API rút gọn link, chưa thấy tài liệu API xem thu nhập. Hãy hỏi nhà cung cấp
hoặc xem mục API trong trang quản lý của họ. Server gửi key trong cả query, header X-API-Key và Authorization: Bearer.
Không gọi được địa chỉ nội bộ (localhost, IP riêng).

Cột mới của link_providers (pay_per_view, stats_*) và bảng link_earnings tự được thêm vào database cũ khi server khởi động.
