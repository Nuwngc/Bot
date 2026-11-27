# Tạo tài khoản + mật khẩu ngẫu nhiên (tab Công cụ)

Công cụ **Tạo mật khẩu mạnh** cũ được đổi thành **Tạo tài khoản + mật khẩu ngẫu nhiên** (id vẫn là `pass`, nên cấu hình bật/tắt công cụ trong trang quản trị không bị ảnh hưởng).

- Số tài khoản: 1 đến 1000 mỗi lần, tên không trùng nhau trong cùng danh sách.
- Tên tài khoản: tiền tố tuỳ chọn + phần ngẫu nhiên 5-20 ký tự (chữ thường và số, bắt đầu bằng chữ cái nếu không có tiền tố).
- Mật khẩu: 8-64 ký tự, chọn chữ thường / chữ hoa / số / ký hiệu, có tuỳ chọn bỏ ký tự dễ nhầm. Mặc định không có ký hiệu cho dễ dùng với game.
- Dấu ngăn: `|` (mặc định, khớp ô nhập acc random của Shop acc) hoặc `:`.
- Kết quả hiện trong ô văn bản, bấm **Sao chép** hoặc **Tải file .txt** (UTF-8, xuống dòng kiểu Windows, tên file `taikhoan-NGAYTHANG-GIO-SOacc.txt`).
- Mọi thứ tạo bằng bộ số ngẫu nhiên an toàn của trình duyệt (`crypto.getRandomValues`), không gửi lên máy chủ.

File sửa: `public/tools.js`, `server/toolcfg.js` (tên công cụ), `public/guide.js` (hướng dẫn).
Phần nạp file vào Shop acc: xem `README-SHOP-ACC.md`.
