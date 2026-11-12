# Giọng đọc tiếng Việt từ máy chủ (cho máy không có giọng đọc)

File mới:
- server/tts.js : /api/tts (lấy âm thanh tiếng Việt) và /api/tts/voices

File sửa:
- server/routes.js : thêm 1 dòng sau dòng linkcoin:  require("./tts").register(router, auth);
- public/office-tools.js : công cụ "Đọc văn bản" có giọng máy chủ, tự chuyển khi máy không có giọng tiếng Việt

Giọng mặc định: Google (không cần khoá, không chính thức, máy chủ có thể bị giới hạn).
Muốn ổn định và nhiều giọng (Bắc/Trung/Nam): trên Render thêm biến môi trường FPT_TTS_KEY (khoá lấy ở fpt.ai, mục Text to Speech).
