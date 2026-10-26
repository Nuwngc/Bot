# Viết module mới

Thêm trò chơi hoặc lệnh cho bot mà không phải sửa code gốc: viết một file `.js`,
tải lên ở mục **Module** trong bảng điều khiển, tắt rồi bật lại bot.

File mẫu nằm trong thư mục `examples/`:
- `doanso.js` — game đơn giản (đoán số)
- `vi.js` — tiền ảo (điểm danh, làm việc, chuyển tiền, xếp hạng) dùng `ctx.store`
- `taixiu.js` — game cược, dùng chung ví với `vi.js`
- `chaomung.js` — chào/tạm biệt, dùng `onEvent`
- `tiktok.js` — lệnh tiện ích gọi API ngoài bằng `fetch`

Copy một file gần giống nhu cầu rồi sửa là nhanh nhất.

## Cảnh báo trước khi dùng

File bạn tải lên **chạy trực tiếp trên server**, cùng tiến trình với bot. Ai tải được
module lên thì thực tế có quyền ngang chủ server: đọc biến môi trường, đọc database,
lấy cookie Facebook của mọi người đang thuê bot.

Vì vậy hệ thống chỉ cho **admin** tải module. Đừng mở quyền này cho khách thuê bot,
dù họ có yêu cầu.

Bộ lọc khi tải lên chặn `require`, `process`, `eval`, `new Function`, `globalThis`,
`child_process`, `__dirname`. Nó ngăn được sai sót vô tình, **không phải hàng rào
an toàn thật sự** — người cố tình vẫn có cách lách. Luôn tự đọc code trước khi tải lên.

## Hai loại module

### Loại `command` — chạy một lần rồi thôi

```js
module.exports = {
  name: "Tung đồng xu",
  command: "tungxu",
  kind: "command",
  description: "Tung một đồng xu",

  async run(args, msg, adapter, ctx) {
    const kq = Math.random() < 0.5 ? "Ngửa" : "Sấp";
    await adapter.send(msg.threadId, `${msg.senderName} tung được: ${kq}`);
  },
};
```

### Loại `game` — giữ trạng thái qua nhiều lượt

```js
module.exports = {
  name: "Đếm ngược",
  command: "demnguoc",
  kind: "game",
  description: "Đếm ngược từ 5",

  start(msg, adapter, ctx) {
    let n = 5;
    adapter.send(msg.threadId, "Nhắn bất cứ gì để đếm ngược.");

    return {
      async handle(m, ad) {
        n--;
        if (n <= 0) {
          await ad.send(m.threadId, "Hết!");
          ctx.onEnd();          // báo bot dọn ván
          return true;
        }
        await ad.send(m.threadId, String(n));
        return true;            // true = đã xử lý, bot không làm gì thêm
      },
      async stop(ad) {
        await ad.send(msg.threadId, "Dừng đếm.");
        ctx.onEnd();
      },
    };
  },
};
```

Object trả về từ `start` có thể có thêm:

| Hàm | Khi nào được gọi |
|---|---|
| `handle(msg, adapter)` | tin nhắn thường trong nhóm — trả `true` nếu đã xử lý |
| `command(cmd, args, msg, adapter)` | lệnh có tiền tố, ví dụ `!vote 3` |
| `handleDM(msg, adapter)` | tin nhắn riêng, cần `ctx.registerDM` trước |
| `stop(adapter)` | khi có người gõ `!stop` |

### Loại sự kiện — bắt thành viên vào/ra nhóm

Module có hàm `onEvent(ev, adapter, ctx)` sẽ nhận sự kiện vào/ra nhóm. Có thể
kèm `command` (để cấu hình) hoặc chỉ có `onEvent`.

```js
module.exports = {
  name: "Chào mừng", command: "chaomung", kind: "command",
  async run(args, msg, adapter, ctx) { /* lệnh cấu hình */ },
  async onEvent(ev, adapter, ctx) {
    if (ev.kind === "join")  for (const id of ev.addedIds) {
      const ten = await adapter.getName(id);
      await adapter.send(ev.threadId, `Chào ${ten}!`);
    }
    if (ev.kind === "leave" && ev.leftId) {
      const ten = await adapter.getName(ev.leftId);
      await adapter.send(ev.threadId, `Tạm biệt ${ten}`);
    }
  },
};
```

`ev` có: `kind` ("join"/"leave"), `threadId`, `addedIds` (mảng, khi join),
`leftId` (khi leave), `authorId` (người thực hiện).

## Những thứ được cấp

**`ctx`**
- `ctx.prefix` — ký tự lệnh hiện tại
- `ctx.onEnd()` — gọi khi ván kết thúc
- `ctx.registerDM(userId, game)` / `ctx.unregisterDM(userId)` — nhận tin nhắn riêng của một người, dùng cho kiểu chơi có hành động bí mật như ma sói
- `ctx.store(tên)` — kho lưu trữ lâu dài riêng cho module. Trả về object có `get(key, mặc_định)`, `set(key, value)`, `del(key)`, `all()`, và `add(key, số)` để cộng dồn. Giá trị tự động JSON hoá. Dữ liệu lưu trong database, backup chung với bot. Ví dụ tiền ảo: `ctx.store("vi").add("bal:" + msg.senderId, 5000)`

**`adapter`**
- `adapter.send(threadId, text, { replyTo })`
- `adapter.dm(userId, text)`
- `adapter.getName(userId)` → Promise\<string\>

**`msg`**
- `threadId`, `senderId`, `senderName`, `text`, `messageId`, `isGroup`

## Quy tắc đặt tên

- Tên file: chữ thường, số, `_` hoặc `-`, kết thúc `.js`. Ví dụ `doan-so.js`
- `command`: 2–20 ký tự chữ/số thường, **không** kèm dấu `!`
- Không trùng lệnh hệ thống: `help`, `stop`, `noitu`, `masoi`, `join`, `start`, `vote`
- Không trùng lệnh của module khác — hệ thống sẽ báo lỗi và từ chối

## Lỗi hay gặp

| Thông báo | Nguyên nhân |
|---|---|
| `Module dung thu bi chan: …` | code chứa từ khoá bị cấm. Chú thích và chuỗi không bị tính |
| `Thieu 'command' hoac sai dinh dang` | thiếu trường `command`, hoặc có dấu `!`, chữ hoa, dấu tiếng Việt |
| `Module kieu game phai co ham start` | đặt `kind: "game"` nhưng quên hàm `start` |
| `Code loi khi nap` | file có lỗi cú pháp — sửa rồi tải lại |

Module tải lên thành công nhưng lỗi lúc bot chạy sẽ tự bị tắt, và nội dung lỗi hiện
ngay dưới tên module trong bảng điều khiển.
