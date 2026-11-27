# Shop acc (bán acc game bằng coin)

Tab **Shop acc** nằm cạnh tab Vượt link. Khách trả bằng coin trong ví, mua xong **hiện ngay tài khoản + mật khẩu**.

## Admin thêm acc
Vào tab Shop acc, kéo xuống mục **Quản lý shop**:
1. **Game**: có sẵn Liên Quân, Free Fire, Blox Fruits. Thêm/sửa/tắt game tuỳ ý. Ô *Giá random* > 0 thì game đó mở mục mua random.
2. **Thêm acc lên kho**:
   - *Acc thường*: có tiêu đề, giá, mô tả, ảnh riêng. Thêm từng acc một.
   - *Acc random*: dán nhiều dòng một lúc (tối đa 200). Khách trả giá random của game và nhận 1 acc ngẫu nhiên trong kho. Có thể gắn ảnh cho cả lô, rồi đổi ảnh riêng từng acc ở Kho acc. Có thể gắn ảnh cho cả lô, rồi đổi ảnh riêng từng acc ở Kho acc.
   - Định dạng mỗi dòng: `tài_khoản|mật_khẩu` hoặc `tài_khoản:mật_khẩu`, thêm `|thông tin thêm` nếu cần (mail khôi phục, 2FA...). Mật khẩu có dấu `|` thì dùng dấu `:` làm phân cách.
   - **Nạp acc random từ file**: chọn loại *Acc random* rồi bấm **Chọn file .txt** (hoặc kéo thả file vào ô Tài khoản). Mỗi dòng một acc, cùng định dạng ở trên; chọn nhiều file một lúc được, dòng của các file được gộp vào ô để xem lại trước khi bấm *Mã hoá & thêm vào kho*. File tối đa 5 MB, tối đa 5000 dòng trong ô. Dòng sai định dạng được báo số dòng ngay, chưa gửi gì lên server. Khi thêm, web tự chia thành từng gói 200 dòng gửi lần lượt; nếu giữa chừng bị lỗi, các gói đã thêm được bỏ khỏi ô và phần còn lại vẫn nằm trong ô để bấm thêm tiếp. Acc trùng tài khoản trong cùng game tự bị bỏ qua. File tạo từ tab Công cụ (*Tạo tài khoản + mật khẩu ngẫu nhiên*) dùng được luôn.
3. Kho acc: ẩn/hiện, đổi giá, xoá. Acc đã bán được giữ lại để đối chiếu đơn.

## Ảnh acc và ảnh bìa game (gửi trực tiếp, không cần link)
- Ở form *Thêm game*, *Thêm acc* và nút **Ảnh** của từng acc trong Kho acc: bấm *Chọn ảnh / chụp ảnh*, hoặc **kéo thả**, hoặc **dán (Ctrl+V)** ảnh chụp màn hình vào ô ảnh. Trình duyệt tự thu nhỏ về tối đa 1280px và nén WebP (ảnh vài MB chỉ còn khoảng 50-250 KB) rồi gửi lên server. Vẫn dùng được link `https://` như trước.
- **Acc random cũng đổi / gỡ ảnh được** bất cứ lúc nào (khi chưa bán) bằng nút **Ảnh**. Đổi ảnh một acc không ảnh hưởng các acc khác dùng chung ảnh cũ.
- Khách không thấy ảnh của acc random trước khi mở. Sau khi mua, ảnh hiện trong hộp tài khoản và khi xem lại ở *Acc đã mua*. Ảnh acc thường hiện ở thẻ acc, bấm vào để xem lớn.
- Ảnh lưu trong database (bảng `shop_images`), mã ảnh ngẫu nhiên 24 ký tự nên không đoán được địa chỉ. Server kiểm tra đúng định dạng JPG / PNG / WebP / GIF bằng nội dung file (từ chối SVG và file khác), giới hạn 3 MB mỗi ảnh. Ảnh không còn acc / game nào dùng sẽ tự bị xoá, ảnh tải lên mà không lưu sẽ được dọn sau 1 giờ.
- Vì ảnh nằm trong database nên cũng mất khi Render free khởi động lại, giống kho acc (xem lưu ý bên dưới).

## Giao diện cửa hàng
Theo web mẫu shopaccg.com: đầu trang có số dư và dải chữ chạy, bảng **TOP NẠP TIỀN** (lấy từ bảng xếp hạng nạp của tháng), lưới **Danh sách Games** (ảnh bìa, *Đang bán* / *Đã bán*), bấm vào game để xem acc, mua random và sắp xếp theo giá. Giao diện nằm trong `public/shop.css` và `public/shop.js`.

## Ảnh acc và ảnh bìa game (gửi trực tiếp, không cần link)
- Ở form *Thêm game*, *Thêm acc* và nút **Ảnh** của từng acc trong Kho acc: bấm *Chọn ảnh / chụp ảnh*, hoặc **kéo thả**, hoặc **dán (Ctrl+V)** ảnh chụp màn hình vào ô ảnh. Trình duyệt tự thu nhỏ về tối đa 1280px và nén WebP (ảnh vài MB chỉ còn khoảng 50-250 KB) rồi gửi lên server. Vẫn dùng được link `https://` như trước.
- **Acc random cũng đổi / gỡ ảnh được** bất cứ lúc nào (khi chưa bán) bằng nút **Ảnh**. Đổi ảnh một acc không ảnh hưởng các acc khác dùng chung ảnh cũ.
- Khách không thấy ảnh của acc random trước khi mở. Sau khi mua, ảnh hiện trong hộp tài khoản và khi xem lại ở *Acc đã mua*. Ảnh acc thường hiện ở thẻ acc, bấm vào để xem lớn.
- Ảnh lưu trong database (bảng `shop_images`), mã ảnh ngẫu nhiên 24 ký tự nên không đoán được địa chỉ. Server kiểm tra đúng định dạng JPG / PNG / WebP / GIF bằng nội dung file (từ chối SVG và file khác), giới hạn 3 MB mỗi ảnh. Ảnh không còn acc / game nào dùng sẽ tự bị xoá, ảnh tải lên mà không lưu sẽ được dọn sau 1 giờ.
- Vì ảnh nằm trong database nên cũng mất khi Render free khởi động lại, giống kho acc (xem lưu ý bên dưới).

## Giao diện cửa hàng
Theo web mẫu shopaccg.com: đầu trang có số dư và dải chữ chạy, bảng **TOP NẠP TIỀN** (lấy từ bảng xếp hạng nạp của tháng), lưới **Danh sách Games** (ảnh bìa, *Đang bán* / *Đã bán*), bấm vào game để xem acc, mua random và sắp xếp theo giá. Giao diện nằm trong `public/shop.css` và `public/shop.js`.

## Bảo mật
- Tài khoản, mật khẩu, thông tin thêm được mã hoá **AES-256-GCM** (cùng cơ chế với cookie Facebook) bằng `APP_SECRET` ngay trên server, rồi mới ghi database. Database bị lộ thì chỉ thấy chuỗi mã hoá.
- API không bao giờ trả mật khẩu ra danh sách, danh sách acc random của khách cũng không có ảnh. Admin chỉ thấy tài khoản đã che (`ab***`). Chỉ người mua mới nhận tk/mk, xem lại được ở mục *Acc đã mua* (chỉ đơn của chính mình).
- Mua hàng chạy trong 1 giao dịch: hai người bấm mua cùng lúc chỉ 1 người được, không bán trùng. Trừ coin và giao acc là một thể.
- Không thêm trùng acc (so sánh bằng mã băm, không lưu tài khoản thật dạng thường).

## Lưu ý quan trọng
- **Không đổi `APP_SECRET`** sau khi đã thêm acc, nếu không sẽ không giải mã được. Hãy sao lưu giá trị này ở nơi an toàn.
- Gói **Render free không có đĩa**: mỗi lần server khởi động lại hoặc deploy, database (kho acc, ví coin, đơn hàng) bị mất. Bán acc nên chạy trên gói có đĩa (Render Starter) hoặc VPS, xem `README-WEB.md`.
- Chỉ dán acc lên web qua địa chỉ `https://`.
- Coin mua acc ghi là loại giao dịch **Mua acc** (hiện trong lịch sử ví và sổ giao dịch của admin).
