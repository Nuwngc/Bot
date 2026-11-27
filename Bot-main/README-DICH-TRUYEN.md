# Bộ công cụ dịch Trung · Nhật · Hàn sang tiếng Việt (tab Công cụ)

Ba công cụ mới trong tab Công cụ (mục "Dịch Trung · Nhật · Hàn"):
1. **Dịch truyện**: dán chương hoặc mở file .txt (tự nhận bảng mã UTF-8, GB18030, Big5, Shift-JIS, EUC-JP, EUC-KR), chia đoạn, dịch tuần tự có mạch văn.
2. **Dịch nhanh**: đoạn ngắn tối đa 2.500 ký tự, kèm phiên âm (pinyin, romaji, romaja) và ghi chú thành ngữ.
3. **Bảng tên riêng**: tên nhân vật, địa danh, môn phái, chiêu thức, thuật ngữ, lưu theo từng truyện trong trình duyệt. Nhập, xuất JSON / CSV.

## Chống lỗi dịch nghĩa tên riêng (ví dụ 洛水寒 thành "Lạc nước lạnh")
- Prompt bắt buộc: tên riêng chỉ được phiên âm, không dịch nghĩa (Trung: Hán Việt, Nhật: romaji, Hàn: romaja, đổi được ở "Cách viết tên riêng"), kèm ví dụ đúng sai.
- **Quét tên riêng** trước khi dịch: tự lập bảng tên cả chương, bạn xem và sửa. Máy chủ **ép dùng đúng bảng** khi dịch (chỉ gửi các tên xuất hiện trong đoạn đang dịch).
- Mỗi đoạn dịch xong, mô hình báo thêm tên mới tìm thấy, tên được ghi vào bảng ngay để các đoạn sau dùng lại (nhất quán cả truyện).
- **Máy chủ tự kiểm tra** từng đoạn: thiếu tên có trong bảng, còn sót chữ Trung / Nhật / Hàn, bản dịch ngắn bất thường. Có lỗi thì tự dịch lại một lần kèm danh sách lỗi. Vẫn còn lỗi thì đoạn đó viền đỏ kèm cảnh báo, bấm "Dịch lại đoạn".
- Sửa một tên trong bảng thì tên đó trong bản dịch hiện có đổi theo (đúng ranh giới từ), các tên đầy đủ chứa tên ngắn đó cũng đổi theo để bảng không lệch.
- Truyền mạch: mỗi đoạn được gửi kèm phần cuối của đoạn trước (gốc + dịch) để giữ xưng hô, giọng văn.
- Đoạn quá dài so với giới hạn của mô hình thì tự chia đôi. Bị giới hạn tốc độ thì tự đợi rồi thử lại. Dịch dở có thể "Tiếp tục" từ đoạn đang dở.

Lưu ý: nếu **không có tên trong bảng** thì máy chủ không có gì để đối chiếu, nên hãy quét tên trước khi dịch. Chất lượng cuối cùng vẫn phụ thuộc mô hình, nên xem lại các đoạn có cảnh báo.

## File
- server/translate.js (mới): API `/api/translate/extract`, `/chunk`, `/quick`, `/info`. Prompt, kiểm tra, thử lại, giới hạn 90 lượt / 10 phút / người dùng
- public/translate-tools.js (mới): giao diện 3 công cụ
- server/toolcfg.js: thêm 3 công cụ vào danh sách (ẩn / tính coin được như các công cụ khác; Dịch truyện và Dịch nhanh được máy chủ chặn thật)
- server/routes.js (1 dòng đăng ký), public/dashboard.html (1 dòng nạp script)

## Khoá AI và model
- Dùng **Gemini**. Ưu tiên khoá riêng của người dùng (nhập trong thẻ Dịch truyện, lưu trong trình duyệt, gửi kèm từng lần dịch, máy chủ không lưu), nếu không có thì dùng khoá dùng chung của admin (Cấu hình chung > khoá AI dùng chung).
- Model nhanh: biến môi trường `TRANSLATE_MODEL`, không có thì lấy model dùng chung, không có nữa thì `gemini-flash-latest`.
- Model chuẩn (chọn "Chuẩn" ở Chất lượng): `TRANSLATE_MODEL_BEST`, mặc định `gemini-pro-latest`. Không có model này thì tự lùi về model nhanh.
- Truyện có cảnh đánh nhau, tình cảm: bộ lọc nội dung đặt ở mức chỉ chặn nội dung rất nặng. Đoạn bị Gemini chặn sẽ báo rõ để bạn chia nhỏ hoặc sửa.

## Chi phí và coin
Mỗi đoạn dịch tốn một lượt gọi Gemini (và có thể thêm một lượt khi tự dịch lại). Nên đặt giá coin cho "Dịch truyện" và "Dịch nhanh" ở tab Công cụ trong Quản trị (web hoặc app) để người dùng không dùng khoá của admin miễn phí không giới hạn.
