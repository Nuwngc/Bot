# Lấy văn bản từ link: thêm "Cách 2" chạy trên trình duyệt

File sửa:
- public/office-tools.js : thêm mục "Cách 2" (mã mở khoá sao chép dạng bookmarklet, có hướng dẫn 4 bước).
                           Mục này tự mở ra khi cách 1 báo lỗi (HTTP 401/403 hoặc trang ít chữ).
- server/pagetext.js     : gửi thêm các tiêu đề trình duyệt thông thường (Sec-Fetch-*), thông báo lỗi 403 gợi ý Cách 2.

Cách 2 chạy ngay trên trang người dùng đang mở nên dùng được cả với trang cần đăng nhập hoặc chặn máy chủ.
Cần bản lay-van-ban-tu-link.zip đã được đẩy lên trước.
