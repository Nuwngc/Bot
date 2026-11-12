# Công cụ văn phòng (tab Công cụ)

File mới:
- public/pdf-lite.js     : ghi file PDF từ ảnh, không cần thư viện
- public/office-tools.js : Ảnh sang PDF, Nén và đổi cỡ ảnh, Số thành chữ, Tính VAT và %, Đếm chữ

File sửa:
- public/dashboard.html  : thêm 2 thẻ <script> (pdf-lite.js, office-tools.js) sau linkcoin.js
- server/app.js          : file tĩnh luôn gửi Cache-Control: no-cache (tránh giữ giao diện cũ sau khi deploy)
