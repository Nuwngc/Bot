# Trợ lý AI Gemini cho bot Zalo (khoá API tự cấu hình trên web)

File mới:
- server/gemini.js          : gọi thử Gemini cho nút "Thử khoá"
- public/zalo-gemini.js     : khung "Trợ lý AI (Gemini)" trong chi tiết bot Zalo

File sửa:
- server/zalo.js            : thêm 3 cột (khoá mã hoá, model, lời dặn), truyền sang tiến trình Python qua file config tạm (quyền 600)
- server/zaloRoutes.js      : thêm GET/POST /zalo/bots/:id/gemini và POST /zalo/bots/:id/gemini/test
- public/dashboard.html     : thêm thẻ <script src="/zalo-gemini.js">
- zalo/config.py            : đọc gemini_key, gemini_model, gemini_prompt (khoá riêng của bot, hoặc biến GEMINI_API_KEY dùng chung)
- zalo/modules/AI_GEMINI/pro_gemini.py : lệnh <prefix>chat dùng Gemini thật (nhớ hội thoại, giới hạn 5 giây/người)

Cách dùng:
1. Web > Zalo > chọn bot > "Trợ lý AI (Gemini)": dán khoá, bấm "Thử khoá", bấm "Lưu cấu hình AI".
2. Tắt rồi bật lại bot.
3. Trong Zalo: <prefix>chat <câu hỏi>. Trong nhóm, admin bot gõ <prefix>chat on để bật. Tin nhắn riêng dùng được luôn.
   <prefix>chat reset: xoá trí nhớ hội thoại.

Khoá dùng chung cho mọi bot: đặt biến môi trường GEMINI_API_KEY trên Render (bot nào có khoá riêng thì dùng khoá riêng).
Nên xoá file cũ có khoá viết cứng:  git rm zalo/modules/AI_GEMINI/pro_gemini.py.mk
