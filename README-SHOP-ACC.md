# Shop acc (bán acc game bằng coin)

Tab **Shop acc** nằm cạnh tab Vượt link. Khách trả bằng coin trong ví, mua xong **hiện ngay tài khoản + mật khẩu**.

## Admin thêm acc
Vào tab Shop acc, kéo xuống mục **Quản lý shop**:
1. **Game**: có sẵn Liên Quân, Free Fire, Blox Fruits. Thêm/sửa/tắt game tuỳ ý. Ô *Giá random* > 0 thì game đó mở mục mua random.
2. **Thêm acc lên kho**:
   - *Acc thường*: có tiêu đề, giá, mô tả, ảnh riêng. Thêm từng acc một.
   - *Acc random*: dán nhiều dòng một lúc (tối đa 200). Khách trả giá random của game và nhận 1 acc ngẫu nhiên trong kho.
   - Định dạng mỗi dòng: `tài_khoản|mật_khẩu` hoặc `tài_khoản:mật_khẩu`, thêm `|thông tin thêm` nếu cần (mail khôi phục, 2FA...). Mật khẩu có dấu `|` thì dùng dấu `:` làm phân cách.
3. Kho acc: ẩn/hiện, đổi giá, xoá. Acc đã bán được giữ lại để đối chiếu đơn.

## Bảo mật
- Tài khoản, mật khẩu, thông tin thêm được mã hoá **AES-256-GCM** (cùng cơ chế với cookie Facebook) bằng `APP_SECRET` ngay trên server, rồi mới ghi database. Database bị lộ thì chỉ thấy chuỗi mã hoá.
- API không bao giờ trả mật khẩu ra danh sách. Admin chỉ thấy tài khoản đã che (`ab***`). Chỉ người mua mới nhận tk/mk, xem lại được ở mục *Acc đã mua* (chỉ đơn của chính mình).
- Mua hàng chạy trong 1 giao dịch: hai người bấm mua cùng lúc chỉ 1 người được, không bán trùng. Trừ coin và giao acc là một thể.
- Không thêm trùng acc (so sánh bằng mã băm, không lưu tài khoản thật dạng thường).

## Lưu ý quan trọng
- **Không đổi `APP_SECRET`** sau khi đã thêm acc, nếu không sẽ không giải mã được. Hãy sao lưu giá trị này ở nơi an toàn.
- Gói **Render free không có đĩa**: mỗi lần server khởi động lại hoặc deploy, database (kho acc, ví coin, đơn hàng) bị mất. Bán acc nên chạy trên gói có đĩa (Render Starter) hoặc VPS, xem `README-WEB.md`.
- Chỉ dán acc lên web qua địa chỉ `https://`.
- Coin mua acc ghi là loại giao dịch **Mua acc** (hiện trong lịch sử ví và sổ giao dịch của admin).
