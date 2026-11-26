#!/bin/sh
# Thêm trang "Thông báo và liên hệ" vào nhóm Quản trị trong menu (public/admin-menu.js) bằng cách chèn đúng 2 dòng,
# KHÔNG ghi đè file. Chạy ở thư mục gốc repo. Chạy lại nhiều lần vẫn an toàn.
F=public/admin-menu.js
[ -f "$F" ] || { echo "Không thấy $F, hãy chạy trong thư mục gốc repo."; exit 1; }
if grep -q 'adm-site' "$F"; then echo "$F: đã có trang Thông báo và liên hệ"; exit 0; fi
if ! grep -q '{ tab: "adm-settings"' "$F"; then echo "KHÔNG tìm thấy mục adm-settings trong $F, gửi file này cho Claude."; exit 1; fi
sed -i \
  -e '\#{ tab: "adm-settings"#i\{ tab: "adm-site", title: "Thông báo và liên hệ", sub: "Hệ thống", sections: ["siteBox"],' \
  -e '\#{ tab: "adm-settings"#i\icon: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" },' \
  "$F"
grep -q 'adm-site' "$F" || { echo "Chèn thất bại, gửi file $F cho Claude."; exit 1; }
if command -v node >/dev/null 2>&1; then node --check "$F" && echo "$F: cú pháp OK"; fi
echo "$F: đã thêm trang Thông báo và liên hệ (nhóm Hệ thống)."
echo "Giờ chạy: git add -A && git commit -m 'Thêm trang Thông báo vào menu quản trị' && git push"
