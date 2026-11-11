# Vượt link nhận coin

File mới: server/linkcoin.js, public/linkcoin.js
File sửa (mỗi chỗ vài dòng, tìm "linkcoin" / "task"):
- server/wallet.js     : module.exports thêm `credit, tx`
- server/routes.js     : thêm `require("./linkcoin").register(router, auth);`
- server/app.js        : require linkcoin + `app.get("/linkcoin/done", requireLogin, linkcoin.doneHandler);`
- public/dashboard.html: thêm `<script src="/linkcoin.js"></script>` sau wallet.js
- server/revenue.js, public/revenue.js, public/wallet.js: thêm loại giao dịch `task` ("Vượt link")

Cấu hình:
1. Đặt biến môi trường PUBLIC_URL=https://ten-mien-shop-cua-ban (không có dấu / cuối).
2. Đăng nhập admin -> tab "Vượt link" -> thêm nhà cung cấp:
   API URL dạng https://.../api?api={token}&url={url} (lấy đúng từ tài liệu API của dịch vụ),
   token, coin mỗi lượt, số lượt/ngày, thời gian vượt tối thiểu.
