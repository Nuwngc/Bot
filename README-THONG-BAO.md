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
- Chỉ nhận link http / https. Gõ `m.me/abc` không có https:// thì tự thêm.

## Kỹ thuật
- Server: `server/site.js` (API `/api/site/*`, bảng `site_images`), gắn trong `server/app.js` trước `/api` để khách chưa đăng nhập cũng xem được.
- Giao diện khách: `public/site.js` + `public/site.css`, nạp ở dashboard / login / register / forgot. Giao diện admin: `public/site-admin.js`.
