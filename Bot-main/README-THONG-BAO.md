# Thông báo tổng + thông tin liên hệ / chân trang

Quản trị: tab **Quản trị**, mục **Thông báo tổng và liên hệ** (nằm trên mục Nạp tiền chờ duyệt).

## Thông báo tổng
- Hiện thành bảng lớn khi khách vào web, kể cả trang đăng nhập / đăng ký.
- Gồm tiêu đề, nội dung (link https:// tự bấm được), tối đa 4 hình, và một nút bấm tuỳ chọn (chữ + link).
- Khách có 3 cách đóng: nút **Không hiện lại trong 12 giờ** (12 giờ sau hiện lại), nút **Đóng** hoặc dấu × (đóng tạm, mở tab mới thì hiện lại), phím Esc như nút Đóng.
- Mỗi lần admin bấm **Lưu thông báo** là một thông báo mới, hiện lại cho cả những người đã tắt 12 giờ. Muốn tắt hẳn thì bỏ tick **Bật thông báo** rồi Lưu.
- **Xem thử** hiện đúng như khách thấy mà không cần lưu.
- Hình: chọn ảnh từ máy, trình duyệt tự thu nhỏ còn tối đa 1280px rồi tải lên (GIF giữ nguyên, tối đa 2,5MB). Hình lưu trong CSDL cùng cấu hình, chỉ nhận JPG / PNG / GIF / WebP (kiểm tra bằng chữ ký file, không nhận SVG).

## Thông tin liên hệ và chân trang
- Các thẻ liên hệ ở cuối trang (Liên Hệ QTV, YouTube, Facebook, Discord, Community...), mỗi mục có biểu tượng riêng, đổi tên, đổi thứ tự được. Mục để trống link thì không hiện. Có sẵn 5 mục mẫu, chỉ cần dán link.
- Nút tròn nổi bên phải: bấm nút chia sẻ để mở / gập danh sách liên hệ (mặc định gập để khỏi che giao diện), nút mũi tên lên đầu trang hiện khi cuộn xuống.
- Link chân trang (Điều khoản sử dụng, Quy tắc nội dung...) và dòng Copyright © năm + tên web + phiên bản (lấy từ package.json).
- **Số người đang online** (viên thuốc có chấm xanh nhấp nháy ngay trên các thẻ liên hệ, giống trang mẫu): tính cả khách chưa đăng nhập. Mỗi trình duyệt tự sinh một mã ngẫu nhiên, cứ 30 giây báo một nhịp khi đang xem trang (tab bị ẩn thì ngừng); có nhịp trong 70 giây gần nhất là đang online. Chỉ lưu trong bộ nhớ máy chủ, không lưu IP, không ghi CSDL. Tắt bằng tick **Hiện số người đang online**. Con số này khác chút so với chấm "đang online" trên thanh trên của bảng điều khiển (chỗ đó chỉ đếm thành viên đã đăng nhập).
- **Dòng ghi chú** dưới các thẻ liên hệ (tối đa 300 ký tự, link https:// tự bấm được), ví dụ lời kêu gọi theo dõi trang chính thức.
- **Màu chữ cho link chân trang**: mỗi link chọn Màu thường / Vàng / Đỏ / Xanh dương / Hồng / Xanh lá để làm nổi bật (ví dụ "Đăng ký", "Thông tin donate"). Tự đổi sang tông đậm hơn khi bật giao diện sáng.
- Chỉ nhận link http / https. Gõ `m.me/abc` không có https:// thì tự thêm.

## Kỹ thuật
- Server: `server/site.js` (API `/api/site/*` gồm `public`, `img/:id`, `ping`, `admin`, `image`; bảng `site_images`), gắn trong `server/app.js` trước `/api` để khách chưa đăng nhập cũng xem được.
- Giao diện khách: `public/site.js` + `public/site.css`, nạp ở dashboard / login / register / forgot. Giao diện admin: `public/site-admin.js`.
