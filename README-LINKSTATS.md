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

Tiền thu về: server không thấy được tiền nhà cung cấp trả, nên ở mỗi thẻ nhà cung cấp có ô
"Tiền thu về mỗi lượt (đ)" (xem trong trang thu nhập của link4m, traffic24h...). Tiền thu về = số lượt × số này.
Chưa nhập thì cột tiền hiện "—". Cột mới link_providers.pay_per_view tự được thêm vào database cũ khi server khởi động.
