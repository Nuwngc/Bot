# Chạy bot 24/7 bằng tmux

tmux giữ cho bot chạy ngay cả khi bạn ngắt kết nối SSH. Không có tmux (hoặc pm2),
bot sẽ tắt ngay khi bạn đóng terminal / mất kết nối.

## 1. Cài tmux

```bash
# Ubuntu / Debian
sudo apt update && sudo apt install -y tmux

# CentOS / RHEL
sudo yum install -y tmux

# Kiểm tra
tmux -V
```

## 2. Tạo một phiên (session) riêng cho bot

```bash
cd ~/fb-bot          # vào đúng thư mục project
tmux new -s fbbot    # tạo session ten "fbbot"
```

Sau lệnh này màn hình sẽ chuyển vào bên trong tmux — nhìn giống terminal bình
thường, chỉ khác có một thanh xanh ở dưới cùng ghi tên session.

## 3. Chạy bot bên trong session

```bash
npm install     # chỉ cần lần đầu, hoặc sau khi đổi package.json
npm start
```

Bot sẽ in log trực tiếp lên màn hình này (đăng nhập thành công, tin nhắn nhận
được, lỗi nếu có...).

## 4. Thoát ra mà KHÔNG tắt bot (detach)

Nhấn tổ hợp phím:

```
Ctrl + b   rồi thả ra, sau đó nhấn   d
```

(Không giữ 3 phím cùng lúc — nhấn `Ctrl+b`, thả, rồi nhấn `d`.)

Bạn sẽ thấy dòng `[detached (from session fbbot)]` và quay lại terminal bình
thường. Bot **vẫn đang chạy ngầm**. Giờ có thể đóng SSH, tắt laptop, bot vẫn sống
trên server.

## 5. Quay lại xem log (attach)

Lần sau SSH vào server, gõ:

```bash
tmux attach -t fbbot
```

Xem đúng lại màn hình log lúc nãy, như chưa từng rời đi.

## 6. Các lệnh tmux hay dùng

| Lệnh | Tác dụng |
|---|---|
| `tmux new -s fbbot` | Tạo session mới tên "fbbot" |
| `tmux attach -t fbbot` | Quay lại session "fbbot" |
| `tmux ls` | Liệt kê tất cả session đang chạy |
| `tmux kill-session -t fbbot` | Tắt hẳn session (và bot bên trong) |
| `Ctrl+b` rồi `d` | Detach — thoát ra mà không tắt |
| `Ctrl+b` rồi `[` | Vào chế độ cuộn xem log cũ, `q` để thoát chế độ này |
| `Ctrl+c` | Dừng bot (Node process) — dùng khi đang **attach** và muốn tắt bot để sửa code |

## 7. Sửa code rồi chạy lại

```bash
tmux attach -t fbbot   # vào lại session
# Ctrl+C để dừng bot
# sửa code, git pull, hoặc npm install nếu cần
npm start               # chạy lại
# Ctrl+b rồi d để detach
```

## 8. Tự khởi động session sau khi restart server (tuỳ chọn)

tmux không tự nhớ session sau khi server reboot. Muốn bot tự chạy lại sau khi
server khởi động lại, thêm vào crontab:

```bash
crontab -e
```

Thêm dòng:

```
@reboot tmux new -d -s fbbot 'cd /home/USER/fb-bot && npm start'
```

Thay `USER` và đường dẫn cho đúng. Lệnh này tạo session "fbbot" ở chế độ nền
(`-d`) ngay khi máy khởi động, không cần bạn SSH vào bấm gì.

## 9. Thay thế: dùng pm2 thay vì tmux

Nếu muốn bot **tự khởi động lại khi crash** (tmux không tự làm việc này), dùng
`pm2` thay cho `npm start` trực tiếp — vẫn có thể chạy pm2 bên trong tmux để dễ
theo dõi log:

```bash
npm i -g pm2
tmux new -s fbbot
cd ~/fb-bot
pm2 start index.js --name fbbot
pm2 logs fbbot     # xem log
pm2 save           # lưu lại danh sách process
pm2 startup        # in ra lệnh để pm2 tự chạy khi server reboot — copy và chạy lệnh đó
```

Sau đó `Ctrl+b` rồi `d` để detach như bình thường. Muốn xem log sau này chỉ cần
`pm2 logs fbbot`, không nhất thiết phải attach lại tmux.

## 10. Sự cố thường gặp

- **`tmux: command not found`** → chưa cài tmux, xem bước 1.
- **Attach vào thấy màn hình trắng / không có log** → bot có thể đã tắt (crash).
  Gõ `npm start` lại để xem lỗi.
- **`duplicate session: fbbot`** khi tạo mới → session đã tồn tại, dùng
  `tmux attach -t fbbot` thay vì `tmux new`.
- **Mất kết nối SSH giữa chừng mà không kịp detach** → không sao, tmux tự giữ
  session. SSH lại và `tmux attach -t fbbot` là vào lại được.
