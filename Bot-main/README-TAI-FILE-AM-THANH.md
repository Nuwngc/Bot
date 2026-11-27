# Tải file âm thanh (MP3) trong công cụ "Đọc văn bản"

- public/office-tools.js : thêm nút "Tải file âm thanh (.mp3)" dưới công cụ "Đọc văn bản" (tab Công cụ). Không cần sửa server.

## Cách hoạt động
1. Văn bản được cắt thành các câu ngắn (như khi đọc to), mỗi câu gửi lên `/api/tts` để lấy MP3 bằng giọng máy chủ.
2. Trình duyệt ghép các đoạn MP3 thành một file (bỏ thẻ ID3 của từng đoạn để nối liền mạch) rồi tự tải về, tên dạng `doc-van-ban-20261121-1015.mp3`.
3. Có thanh tiến độ "câu x/y" và nút Huỷ trong lúc tạo. Xong thì có link "Tải lại file âm thanh".

## Lưu ý
- Giọng đọc có sẵn trên máy (speechSynthesis) không xuất ra file được. Nếu đang chọn giọng trên máy thì nút tải tự dùng giọng máy chủ đầu tiên.
- Tối đa 10.000 ký tự mỗi file. Mỗi câu là một lượt gọi, giới hạn 60 lượt/phút/tài khoản. Gặp giới hạn thì tự đợi vài giây rồi thử lại.
- File ở tốc độ bình thường (thanh tốc độ chỉ áp dụng khi nghe trực tiếp). Muốn nhanh hơn thì chỉnh trong trình phát nhạc.
- Giọng Google không chính thức nên có thể bị giới hạn; giọng FPT (đặt `FPT_TTS_KEY`) ổn định hơn và có nhiều giọng Bắc/Trung/Nam.
