#!/bin/sh
# Ghép "thông báo tổng + liên hệ" vào các file CÓ SẴN bằng cách chèn thêm vài dòng, KHÔNG ghi đè file nào của bạn.
# Chạy ở thư mục gốc repo (có server/ và public/), sau khi đã giải nén zip. Chạy lại nhiều lần vẫn an toàn.
FAIL=""
say() { echo "  $1"; }

[ -f server/app.js ] && [ -f public/dashboard.html ] || { echo "Hãy chạy trong thư mục gốc repo (có server/ và public/)."; exit 1; }
for f in server/site.js public/site.js public/site.css public/site-admin.js; do
  [ -f "$f" ] || { echo "Thiếu $f, hãy giải nén zip trước."; exit 1; }
done

echo "server/app.js"
if grep -q '/api/site' server/app.js; then say "đã có sẵn"
elif grep -q 'app.use("/api/fb", fbApi);' server/app.js; then
  sed -i '\#app.use("/api/fb", fbApi);#i\app.use("/api/site", require("./site").createRouter(express)); // thong bao tong + lien he (khach chua dang nhap cung xem duoc)' server/app.js
  say "đã thêm"
elif grep -q 'app.use("/api", api);' server/app.js; then
  sed -i '\#app.use("/api", api);#i\app.use("/api/site", require("./site").createRouter(express)); // thong bao tong + lien he (khach chua dang nhap cung xem duoc)' server/app.js
  say "đã thêm"
else
  say "KHÔNG tìm thấy chỗ gắn, gửi server/app.js cho Claude"; FAIL=1
fi

# Chèn tag script ngay trước </body>
before_body_end() { # file  tag  dấu-nhận-biết
  [ -f "$1" ] || { say "$1: không có file, bỏ qua"; return; }
  if grep -q "$3" "$1"; then say "$1: đã có $3"; return; fi
  sed -i "s#</body>#$2\n</body>#" "$1"
  if grep -q "$3" "$1"; then say "$1: đã thêm $3"; else say "$1: KHÔNG thấy </body>"; FAIL=1; fi
}

echo "Các trang"
for f in public/dashboard.html public/login.html public/register.html public/forgot.html; do
  before_body_end "$f" '<script src="/site.js" defer></script>' 'site.js'
done

# site-admin.js phải nạp sau wallet.js và app.js, nên chèn ngay sau toolcfg-admin.js (hoặc autopay.js / wallet.js)
echo "Trang quản trị"
if grep -q 'site-admin.js' public/dashboard.html; then say "public/dashboard.html: đã có site-admin.js"
else
  for a in toolcfg-admin.js autopay.js wallet.js; do
    if grep -q "$a" public/dashboard.html; then
      sed -i "/$a/a\\<script src=\"/site-admin.js\"></script>" public/dashboard.html
      say "public/dashboard.html: đã thêm site-admin.js (sau $a)"; break
    fi
  done
  grep -q 'site-admin.js' public/dashboard.html || before_body_end public/dashboard.html '<script src="/site-admin.js"></script>' 'site-admin.js'
fi

[ -n "$FAIL" ] && { echo "CÓ LỖI, xem các dòng KHÔNG ở trên."; exit 1; }
if command -v node >/dev/null 2>&1; then node --check server/app.js && echo "server/app.js: cú pháp OK"; fi
echo "Xong. Giờ chạy: git add -A && git commit -m 'Thêm thông báo tổng' && git push"
