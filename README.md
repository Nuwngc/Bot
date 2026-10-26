# Bot Messenger: Nối từ + Ma sói + AI trả lời khi bị tag

> **Phiên bản 2 đã có web panel.** Bot giờ chạy qua trang quản lý có đăng nhập,
> mỗi người tự dán cookie của mình, không còn dùng file `appstate.json` trên đĩa.
> Xem **[README-WEB.md](README-WEB.md)** để cài đặt và triển khai lên Render.
> File này giữ lại phần mô tả luật chơi và ghi chú về thư viện `ws3-fca`.

Bot chạy trên **tài khoản Facebook cá nhân** thông qua thư viện không chính thức `@dongdev/fca-unofficial` (4.0.3, xem README-WEB.md mục thư viện).
Đây là cách duy nhất để bot vào được group chat và chơi được ma sói.

## ⚠️ Đọc trước khi chạy

- Cách này **vi phạm Điều khoản sử dụng của Meta**. Tài khoản có thể bị khóa (checkpoint) bất cứ lúc nào.
- **Dùng tài khoản phụ**, đừng dùng tài khoản chính. Tài khoản phụ nên có vài bạn bè, ảnh đại diện, hoạt động vài ngày trước khi làm bot — acc mới tinh mà spam tin nhắn sẽ bị khóa rất nhanh.
- `ws3-fca` và các thư viện cùng loại hay hỏng mỗi khi Facebook đổi API nội bộ. Chuẩn bị tinh thần phải cập nhật/đổi thư viện định kỳ.
- Không tăng tần suất gửi tin lên quá cao. Các mốc thời gian mặc định trong `.env.example` đã để ở mức tương đối an toàn.

## Cài đặt

```bash
npm install
cp .env.example .env
```

Sửa `.env`, điền `ANTHROPIC_API_KEY` (lấy ở https://console.anthropic.com).

### Cookie đăng nhập

Giờ nhập trực tiếp trên web panel, xem [README-WEB.md](README-WEB.md).

### Chạy

```bash
npm start
```

## Lệnh

| Lệnh | Chức năng |
|---|---|
| `!help` | Danh sách lệnh |
| `!noitu` | Chơi nối từ với bot |
| `!masoi` | Mở phòng ma sói |
| `!join` | Vào phòng ma sói |
| `!start` | Bắt đầu ván |
| `!vote <số>` | Bỏ phiếu treo cổ |
| `!stop` | Dừng game đang chạy |
| Tag bot | AI trả lời |

Hành động ban đêm gửi qua **tin nhắn riêng** với bot: `!kill <số>`, `!soi <số>`, `!bv <số>`.

## Cấu trúc

```
index.js               khởi động
src/adapters/fca.js    lớp cách ly Facebook — đổi nền tảng chỉ sửa file này
src/core/router.js     phân luồng lệnh / input game / DM / mention
src/games/noitu.js     nối từ
src/games/masoi.js     ma sói (state machine)
src/ai/reply.js        gọi Claude API, giữ ngữ cảnh 8 lượt, rate limit
src/data/tudien.txt    từ điển nối từ
```

## Từ điển nối từ

File `src/data/tudien.txt` mới chỉ có ~167 từ để bot chạy được ngay — chơi vài lượt là bot hết từ.

Thay bằng từ điển đầy đủ: tìm trên GitHub các repo `vietnamese-wordlist`, `Vietnamese-Dictionary`, hoặc dữ liệu của `underthesea`. Định dạng cần: **mỗi dòng một từ, từ 2 âm tiết**. Code tự lọc bỏ dòng không đúng 2 âm tiết, nên cứ đổ nguyên file vào cũng được.

## Ma sói — vai trò

| Số người | Vai trò |
|---|---|
| 4+ | 1 Sói, còn lại Dân |
| 5+ | thêm Tiên tri |
| 7+ | thêm Bảo vệ |
| 8+ | 2 Sói (cứ 4 người 1 sói) |

Sói thắng khi số sói ≥ số dân còn lại. Dân thắng khi hết sói.

**Điểm yếu cần biết:** bot chỉ nhắn riêng được cho người đã từng nhắn tin với acc bot hoặc là bạn bè. Ai không nhận được DM sẽ bị bỏ qua trong đêm đó. Nhắc mọi người nhắn cho bot một câu trước khi chơi.

## Hosting

Bot cần online 24/7 nên chạy trên laptop không hợp lắm. Gợi ý:
- **Oracle Cloud Free Tier** — VM ARM miễn phí vĩnh viễn, đủ mạnh
- **Fly.io / Railway** — dễ deploy
- VPS Việt Nam ~50k/tháng

Dùng `pm2` để bot tự khởi động lại khi crash:
```bash
npm i -g pm2
pm2 start index.js --name fbbot
pm2 save
```

## Thêm game mới

Tạo `src/games/<ten>.js` export một hàm trả về object có:
```js
{
  name,
  handle(msg, adapter)   // tin nhắn thường trong nhóm -> trả true nếu đã xử lý
  command(cmd, args, msg, adapter)
  stop(adapter)
}
```
Rồi thêm một `case` trong `src/core/router.js`. Game tự gọi `onEnd()` khi kết thúc để router xoá khỏi danh sách.

## Ghi chú kỹ thuật (lịch sử): ws3-fca v3 — không còn dùng từ bản 3.2

API của v3 khác v1 khá nhiều. Nếu tham khảo code/tutorial cũ trên mạng, để ý:

| v1 (cũ) | v3 (đang dùng) |
|---|---|
| `const login = require("ws3-fca")` | `const { login } = require("ws3-fca")` |
| `login(cred, cb)` rồi `api.setOptions({...})` | `login(cred, options, cb)` — không còn `setOptions` |
| `api.sendMessage(msg, tid, cb, replyId)` | `api.sendMessage(msg, tid, replyId)` — trả về Promise |
| `api.getAppState()` | không còn — giữ nguyên file appstate ban đầu |
| chỉ `event.type === "message"` | có thêm `"message_reply"` khi người ta reply |

Toàn bộ khác biệt này đã được xử lý trong `src/adapters/fca.js`. Nếu thư viện
lại đổi API lần nữa, chỉ cần sửa một file đó, phần game không đụng tới.
