# botctl — app Android cho admin

Bảng điều khiển dành riêng cho admin của web panel, giao diện kiểu editor/terminal (monospace, nền tối).
Chỉ tài khoản có quyền admin đăng nhập được.

## Cài đặt
1. Đẩy thư mục này lên GitHub (cùng repo). Workflow `.github/workflows/admin-apk.yml` tự build.
2. Vào GitHub > Releases > "botctl (bản mới nhất)" > tải `botctl.apk` về điện thoại > cài.
3. Mở app, nhập địa chỉ máy chủ (https://...onrender.com), tài khoản admin và mật khẩu.

Build lại bằng tay: tab Actions > Build botctl APK > Run workflow. Mỗi lần build tăng số phiên bản và ký bằng cùng một khoá
(`botctl.keystore`), nên cài đè lên bản cũ được, không phải gỡ app.

## Có gì trong app
| tab | nội dung |
|---|---|
| overview | tình trạng máy chủ (uptime, bộ nhớ), số người dùng và bot, tiền chờ duyệt, tiền vào chưa khớp, doanh thu 14 ngày, giao dịch ngân hàng gần đây. Tự làm mới 15 giây |
| users | danh sách và lọc, chỉnh coin, đặt lại mật khẩu, khoá/mở, xoá, tạo tài khoản |
| money | duyệt lệnh nạp; bật/tắt tự động cộng coin, đăng nhập Google để server tự đọc email biến động số dư của ngân hàng (app mở trình duyệt của máy để đăng nhập), kiểm tra ngay, thử đọc email gần nhất, ngắt kết nối, gán hoặc bỏ qua tiền vào chưa khớp; thống kê vượt link |
| logs | log máy chủ trực tiếp (cập nhật 3 giây), lọc warn/error, chép, tạm dừng. Giá trị nhạy cảm như api=, token=, password= bị che |
| api | gửi bất kỳ yêu cầu GET/POST/DELETE tới API của máy chủ, xem JSON tô màu, thời gian, dung lượng, lịch sử |
| config | đổi máy chủ/tài khoản, khoá app, thông báo nền, chặn chụp màn hình, đăng xuất |

Nút ⌘ trên cùng mở bảng lệnh (gõ "logs", "ping", "duyệt"...). Nút Back của Android đóng hộp thoại, rồi về tab đầu, rồi thoát.

## Phần Android thật (không chỉ là trang web)
- Mạng: `HttpURLConnection` trong `ApiClient.java`, tự giữ cookie phiên, gặp 401 thì tự đăng nhập lại.
- Mật khẩu: mã hoá AES-GCM, khoá nằm trong Android Keystore (`SecureStore.java`). Giao diện không bao giờ đọc được mật khẩu.
- Khoá app: dùng màn hình khoá của máy (PIN, hình mở khoá, vân tay) mỗi khi mở lại sau 30 giây.
- Thông báo nền: `WatchJob.java` (JobScheduler) mỗi ~15 phút hỏi `/api/admin/app/alerts`, báo tiền tự động cộng, giao dịch chưa khớp, lệnh nạp chờ duyệt. Chạy cả khi tắt app. 15 phút là giới hạn thấp nhất của Android.
- WebView chỉ tải tệp trong app (`assets/`), chặn mọi địa chỉ khác, có CSP nghiêm ngặt.
- Đăng nhập Google: `NativeBridge.openUrl` mở trình duyệt của máy, chỉ cho phép địa chỉ `https://accounts.google.com/` (Google không cho đăng nhập trong WebView).

## Phía máy chủ
`server/adminApp.js` (overview, users, alerts, logs) và `server/logbuf.js` (bộ đệm 500 dòng log). Các tính năng khác dùng lại API admin sẵn có.

## Thử giao diện bằng trình duyệt
Mở `https://<máy-chủ>/` không có sẵn trang này; để xem thử, chép thư mục `app/src/main/assets/` vào `public/` của web panel và mở `/index.html`
(đăng nhập bằng tài khoản admin của trang web). Khi đó mọi cuộc gọi đi thẳng bằng `fetch` cùng địa chỉ.

## Lưu ý về khoá ký
`botctl.keystore` được đưa vào repo để mọi bản build đều ký giống nhau. Đây là khoá "tự dùng" để cài tay, không dùng để phát hành lên kho ứng dụng.
Nếu muốn khoá riêng, tạo keystore mới, thay file và đổi mật khẩu trong `app/build.gradle` (tốt hơn: đưa vào GitHub Secrets).
