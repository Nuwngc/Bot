# Đưa bot-hub lên VPS

Project này gộp bot Facebook, bot Zalo và web panel vào một thư mục:

```
bot-hub/
├── index.js, server/, src/, public/   ← web panel + bot FB (Node.js)
├── zalo/                              ← bot Zalo (Python), toàn bộ module
│   ├── main.py, modules/, core/, zlapi/, ...
│   └── requirements.txt
└── scripts/install-vps.sh             ← cài tự động
```

Web tự tìm bot Zalo trong `zalo/` và dùng Python trong `zalo/.venv` nếu có, nên không cần đặt `ZALO_DIR`.

## Yêu cầu

- VPS Ubuntu 22.04/24.04 hoặc Debian 12.
- RAM: tối thiểu 1 GB; mỗi bot FB tốn khoảng 100–150 MB, mỗi bot Zalo tương tự.

## Cài đặt

```bash
# Trên máy của bạn: đẩy file zip lên VPS
scp bot-hub.zip user@IP-VPS:~

# Trên VPS
sudo apt-get install -y unzip
unzip bot-hub.zip && cd bot-hub
bash scripts/install-vps.sh
```

Script sẽ cài Node 22, Python, ffmpeg, thư viện của cả hai bot, tạo `.env` (in ra mật khẩu admin) và chạy nền bằng systemd.

Nếu VPS bật tường lửa: `sudo ufw allow 3000/tcp`.

## Chuyển dữ liệu từ Termux sang (giữ tài khoản, cookie, gói cước)

1. **Tắt bot trên Termux trước.** Cùng một cookie chạy ở hai nơi thì hai phiên sẽ đá nhau.
2. Chép `.env` và thư mục `data/` từ `~/fb-bot` trên Termux vào `bot-hub/` trên VPS **trước khi** chạy script cài đặt. Phải giữ nguyên `APP_SECRET`, nếu không cookie đã lưu sẽ không giải mã được.
3. Chạy `bash scripts/install-vps.sh`.

## Lệnh hay dùng

```bash
sudo journalctl -u bot-hub -f        # xem log
sudo systemctl restart bot-hub       # khởi động lại
sudo systemctl stop bot-hub          # tắt
```

## Dùng tên miền + HTTPS (tuỳ chọn)

Khi đã có tên miền trỏ về VPS và reverse proxy (Caddy hoặc Nginx) có HTTPS, đặt `NODE_ENV=production` trong `.env` rồi restart. Nếu chỉ truy cập bằng `http://IP:3000` thì **giữ `NODE_ENV=development`**, nếu không trình duyệt sẽ không giữ được phiên đăng nhập.

## Chạy trên Termux

Bản gộp vẫn chạy được trên Termux: `npm install` rồi `npm start`. Bot Zalo dùng `python3` có sẵn của Termux (thư viện Python đã cài từ trước).
