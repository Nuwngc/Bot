# Lấy văn bản từ link (tab Công cụ)

File mới:
- server/pagetext.js : POST /api/pagetext. Tải trang từ link, lọc menu/quảng cáo/mã, trả chữ.
                       Có chặn địa chỉ nội bộ (SSRF), giới hạn 2 MB, 5 lần chuyển hướng, 12 giây, 15 lượt/phút/tài khoản.

File sửa:
- server/routes.js       : thêm 1 dòng sau dòng tts:  require("./pagetext").register(router, auth);
- public/office-tools.js : thêm công cụ "Lấy văn bản từ link" (dán link, chọn nội dung chính/cả trang, sao chép, đọc to)

Giới hạn: không lấy được trang cần đăng nhập, trang nạp chữ bằng JavaScript, hoặc trang chặn máy chủ (HTTP 403).
