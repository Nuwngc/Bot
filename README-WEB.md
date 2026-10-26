# Web panel + triển khai lên Render

Phiên bản 2: bot không còn đọc `appstate.json` trên đĩa. Thay vào đó có một trang web
đăng nhập bằng tài khoản do quản trị viên cấp; mỗi người tự dán cookie Messenger của
mình vào, bật/tắt bot riêng và xem nhật ký.

## Chạy thử trên máy (Termux hoặc PC)

```bash
npm install
cp .env.example .env
npm run secret          # copy chuỗi in ra, dán vào APP_SECRET trong .env
nano .env               # điền thêm ADMIN_PASS
npm start
```

Mở `http://localhost:3000`, đăng nhập bằng `ADMIN_USER` / `ADMIN_PASS`.

## Sự thật về gói Render miễn phí

Cần nói thẳng trước khi bạn mất thời gian:

| | Free | Starter ($7/tháng) |
|---|---|---|
| Ngủ sau 15 phút không có request | Có | Không |
| Ổ đĩa lưu dữ liệu | Không có | Có |
| Hệ quả với bot | Kết nối Messenger đứt khi ngủ; mỗi lần khởi động lại mất sạch tài khoản và cookie đã lưu | Chạy liên tục, dữ liệu giữ nguyên |

Bot Messenger giữ một kết nối MQTT thường trực — đây chính là kiểu ứng dụng mà gói
free của Render phục vụ kém nhất.

**Nếu vẫn muốn dùng free:** thêm dịch vụ ping (UptimeRobot, cron-job.org) gọi
`https://<tên-app>.onrender.com/healthz` mỗi 5 phút để app không ngủ. Nhưng đĩa vẫn
là tạm thời, nên mỗi lần Render khởi động lại (deploy mới, bảo trì, crash) thì:
- Tài khoản admin được tạo lại từ `ADMIN_USER`/`ADMIN_PASS` — không mất
- Các tài khoản khác và toàn bộ cookie đã lưu — **mất hết**, phải tạo và dán lại

**Lựa chọn tốt hơn, cùng tầm giá hoặc rẻ hơn:**
- **Oracle Cloud Free Tier** — máy ảo ARM miễn phí vĩnh viễn, 24GB RAM, chạy được nhiều bot. Miễn phí thật, đổi lại phải tự cài đặt như một VPS bình thường (xem `TMUX.md`).
- **Fly.io** — có volume lưu dữ liệu, không ngủ.
- **VPS Việt Nam** ~50k/tháng.

## Triển khai lên Render

1. Đẩy code lên GitHub (đừng commit file `.env` — `.gitignore` đã chặn sẵn).

2. Trên Render: **New → Blueprint**, trỏ tới repo. Render đọc `render.yaml` và tạo service.

3. Render sẽ hỏi giá trị cho `ADMIN_PASS` — nhập mật khẩu admin bạn muốn.

4. Đợi build xong, mở đường dẫn `https://<tên-app>.onrender.com`.

Nếu dùng gói free, sửa `render.yaml`: đổi `plan: starter` thành `plan: free` và **xoá
toàn bộ khối `disk:`** (gói free không gắn được đĩa), rồi đổi `DB_PATH` thành `./data/app.db`.

## Khoá AI dùng chung

Người dùng thường không còn thấy ô nhập khoá API riêng — mục đó chỉ hiện với
admin, ở "Cấu hình chung" → "Khoá AI dùng chung". Khoá này áp dụng cho mọi bot
không tự có khoá riêng. Người dùng vẫn tự chỉnh được model và tính cách bot ở
mục Cài đặt của họ, chỉ không thấy hoặc nhập được khoá.

Lý do làm vậy: khoá API tính phí theo lượt dùng. Để mỗi người tự nhập khoá của
họ thì bạn không kiểm soát được chi phí, và khoá dễ bị lộ khi có nhiều người
dùng chung một trình duyệt/máy. Cách này giữ khoá chỉ nằm trong tay admin.

## Đăng nhập Facebook bằng email/mật khẩu (thử nghiệm)

Ngoài cách dán cookie, tài khoản giờ có thêm tab "Email + mật khẩu" khi khai báo
tài khoản Facebook cho bot.

**Đọc kỹ trước khi dùng cách này:**
- `ws3-fca` xử lý đăng nhập mật khẩu bằng một API cũ của Facebook (kiểu app
  Android đời trước), đã bị khai tử phần lớn tính năng theo thời gian.
- **Không hỗ trợ 2FA.** Tài khoản bật xác thực 2 lớp sẽ báo lỗi ngay.
- Dễ bị Facebook đánh dấu truy cập bất thường hơn nhiều so với dán cookie lấy
  từ trình duyệt thật.

Khuyến nghị: dùng cách dán cookie làm chính. Cách mật khẩu chỉ nên thử với tài
khoản phụ, chưa bật 2FA, và chấp nhận rủi ro checkpoint cao hơn. Đăng nhập thất
bại thì giao diện tự nhắc quay lại tab dán cookie.

## Tự đăng ký và thuê bot

**Bật/tắt đăng ký:** mục "Cấu hình chung" trong bảng điều khiển (chỉ admin thấy).
Tắt đi thì trang `/register.html` khoá lại, chỉ admin cấp tài khoản được như trước.

**Dùng thử:** người mới đăng ký được cấp số ngày miễn phí theo cấu hình (mặc định 3).
Đặt về 0 nếu muốn họ phải trả tiền ngay.

**Bảng giá:** sửa trực tiếp trong `server/billing.js`, mảng `PLANS`.

```js
const PLANS = [
  { id: "trial", name: "Dung thu", days: 3,  amount: 0, hidden: true },
  { id: "w1",    name: "1 tuan",   days: 7,  amount: 20000 },
  { id: "m1",    name: "1 thang",  days: 30, amount: 60000 },
  { id: "m3",    name: "3 thang",  days: 90, amount: 150000 },
];
```

**Luồng thanh toán:**

1. Khách chọn gói → hệ thống sinh mã duy nhất, ví dụ `BOTVUNFSQ`
2. Panel hiện mã QR VietQR kèm số tài khoản và nội dung chuyển khoản
3. Khách chuyển tiền, ghi đúng mã vào nội dung
4. Admin đối chiếu sao kê rồi bấm **Xác nhận** ở mục "Đơn thuê bot"
5. Hạn dùng cộng ngay. Còn hạn cũ thì cộng dồn, hết hạn rồi thì tính từ hôm nay

Mã QR lấy từ dịch vụ công khai `img.vietqr.io`, không cần đăng ký API. Khai báo
`Mã ngân hàng` / `Số tài khoản` / `Tên chủ tài khoản` trong Cấu hình chung là QR hiện ra.
Chưa khai báo thì khách vẫn tạo được đơn, chỉ không có QR.

**Hết hạn:** bot tự tắt. Cứ 10 phút hệ thống quét một lần, và khi server khởi động
lại thì bỏ qua không bật bot của người đã hết hạn.

**Tự động xác nhận:** hiện phải duyệt tay. Muốn tự động thì dùng dịch vụ đọc biến động
số dư (Casso, SePay) gọi webhook về server — phần khung đã ghi chú sẵn ở cuối
`server/billing.js`.

## Ma sói: các vai mở rộng

Ma sói (lệnh `!masoi`) giờ có 7 vai, tự thêm theo số người chơi:

| Số người | Vai được thêm |
|---|---|
| 4+ | Sói, Dân làng |
| 5+ | Tiên tri |
| 6+ | Bảo vệ |
| 7+ | Thợ săn (chết thì bắn theo một người) |
| 8+ | Phù thủy (1 bình cứu + 1 bình độc) |
| 9+ | Cupid (đêm đầu ghép đôi; một người chết, người kia chết theo) |

Hành động đêm nhắn riêng cho bot: `!kill`, `!soi`, `!bv` (bảo vệ), `!cuu` / `!doc`
(phù thủy), `!gheptinh <số1> <số2>` (cupid), `!ban <số>` (thợ săn khi chết).

## Module có sẵn

Thư mục `examples/` có sẵn vài module tải lên được ngay ở mục Module:

- `vi.js` — tiền ảo: `!vi`, `!vi daily`, `!vi work`, `!vi pay @tên <số>`, `!vi top`
- `taixiu.js` — `!taixiu tai/xiu <số xu>`, dùng chung ví với `vi.js`
- `chaomung.js` — tự chào người mới vào và tạm biệt người rời nhóm; `!chaomung` để chỉnh lời
- `tiktok.js` — `!tiktok <link>` tải video không logo
- `doanso.js` — game đoán số, làm mẫu

Tải lên rồi tắt/bật lại bot là dùng được. Muốn viết thêm, xem MODULE.md.

## Module: thêm trò chơi mới

Tải một file `.js` lên ở mục "Module" là xong, không phải sửa code gốc hay deploy lại.
Tắt rồi bật lại bot để áp dụng. Xem **[MODULE.md](MODULE.md)** để biết cách viết,
và `examples/doanso.js` để có file mẫu chạy được ngay.

**Đây là tính năng nguy hiểm nhất trong hệ thống.** File tải lên chạy trực tiếp trên
server cùng tiến trình với bot — ai up được module thì đọc được biến môi trường,
database, và cookie Facebook của toàn bộ khách thuê. Hệ thống chỉ cho admin tải lên,
và đừng bao giờ mở quyền này ra cho người thuê bot.

Bộ lọc chặn `require`, `process`, `eval`, `new Function`, `globalThis`,
`child_process`, `__dirname`. Nó chống sai sót vô tình, không chống được người cố ý.
Tự đọc code trước khi tải lên.

## Dùng panel

**Quản trị viên** có thể tạo tài khoản sẵn trong mục "Tài khoản", hoặc bật tự đăng ký
để người dùng tự tạo ở `/register.html`. Trong danh sách tài khoản còn có nút cộng/trừ
ngày thủ công, dùng khi muốn tặng thêm hạn mà không qua đơn.

**Mỗi người** sau khi đăng nhập:
1. Dán cookie Messenger vào ô "Cookie Messenger" → Lưu cookie
2. (tuỳ chọn) Dán khoá API vào ô AI → Lưu khoá
3. Bấm **Bật bot**

Lấy cookie: đăng nhập Facebook bằng **tài khoản phụ** trên trình duyệt, dùng extension
xuất cookie JSON (C3C FBState, J2TEAM Cookies), copy toàn bộ và dán vào.

Bật "Tự bật bot khi server khởi động lại" nếu muốn bot tự lên sau mỗi lần deploy.

## Thư viện Messenger: @dongdev/fca-unofficial

Từ bản 3.2 dùng `@dongdev/fca-unofficial` thay cho `ws3-fca` (ngừng cập nhật từ
8/2025, không còn đăng nhập được). Phiên bản được **ghim cứng 4.0.3** trong
`package.json` — không có dấu `^`, nên `npm install` không tự kéo bản mới chưa kiểm tra.

Thư viện này có ba hành vi mặc định không an toàn với một server giữ cookie của
nhiều người. Cả ba đã bị chặn trong `src/adapters/fca.js`:

| Mặc định của thư viện | Rủi ro | Đã xử lý |
|---|---|---|
| `autoUpdate` + `checkUpdate.install: true` | tự `npm install` phiên bản mới lúc đang chạy, code lạ chạy thẳng trên server | ghi đè `fca-config.json`, tắt hết trước mỗi lần đăng nhập |
| `autoLogin` + `apiServer` | khi có mật khẩu trong config, **gửi email + mật khẩu + mã 2FA** tới máy chủ riêng của tác giả thư viện | tắt `autoLogin`, xoá `apiServer`, không bao giờ truyền mật khẩu vào config |
| sao lưu cookie vào `Fca_Database/database.sqlite` | cookie mọi tài khoản nằm dạng văn bản thô trên đĩa, vô hiệu lớp mã hoá AES | trigger SQLite chặn mọi lệnh ghi backup, xoá dữ liệu cũ và `VACUUM` |

Đã kiểm thử: sau khi bật bot, không còn chuỗi cookie nào trong file `Fca_Database`.
**Đừng xoá hay sửa các hàm `lockConfig()` và `neuterBackups()`** khi cập nhật code.

Khi nâng cấp thư viện lên bản mới hơn, phải đọc lại changelog và kiểm tra lại cả ba
điểm trên — bản mới có thể thêm tên cấu hình hoặc đường dẫn khác.

## Bảo mật

Cookie Facebook tương đương toàn quyền truy cập tài khoản. Những gì đã làm:

- Cookie và khoá API mã hoá **AES-256-GCM** bằng `APP_SECRET` trước khi ghi vào DB.
  `APP_SECRET` chỉ nằm trong biến môi trường, không nằm trong database.
- Sau khi lưu, cookie **không bao giờ được trả về trình duyệt** — panel chỉ hiển thị
  số lượng cookie. Khoá API hiển thị dạng che `sk-ant-…4f2a`.
- Mật khẩu băm bằng bcrypt. Sai 8 lần thì khoá IP 10 phút.
- Session cookie `httpOnly`, `secure` khi chạy production.
- Cookie được kiểm tra thật với Facebook khi bật bot, nên cookie hết hạn báo lỗi ngay
  thay vì "bật thành công" rồi chết âm thầm.

Những gì bạn vẫn phải tự lo:
- **Chỉ cấp tài khoản cho người bạn thực sự tin.** Admin có toàn quyền trên panel.
- Đổi `APP_SECRET` sẽ làm mọi cookie đã lưu không giải mã được — mọi người phải dán lại.
- Dùng tài khoản Facebook phụ. Cách chạy bot này vi phạm điều khoản của Meta và có thể
  bị khoá bất cứ lúc nào.

## Giới hạn tài nguyên

Mỗi bot đang chạy tốn khoảng 100–150MB RAM. Gói Render starter có 512MB, nên
`MAX_BOTS` mặc định là 3. Vượt quá, panel sẽ từ chối bật thêm thay vì để server chết
vì hết bộ nhớ. Sửa số này trong biến môi trường nếu máy khoẻ hơn.

## Cấu trúc thư mục

```
index.js              khởi động web server, tự bật các bot đã bật autostart
render.yaml           cấu hình triển khai Render
server/
  app.js              express, session, security header
  routes.js           REST API
  auth.js             mật khẩu, chặn dò, phân quyền, tự đăng ký
  db.js               SQLite (node:sqlite, không cần biên dịch native)
  crypto.js           mã hoá AES-256-GCM
  billing.js          gói cước, mã chuyển khoản, VietQR, hạn dùng
  modules.js          kiểm tra và lưu module tải lên
public/               giao diện panel
src/
  bot/manager.js      vòng đời bot cho từng người dùng
  adapters/fca.js     lớp cách ly Facebook
  core/router.js      phân luồng lệnh (mỗi bot một instance)
  core/registry.js    nạp module đã bật vào bot
  games/              nối từ, ma sói
  ai/reply.js         gọi API trả lời khi bị tag
examples/doanso.js    module mẫu để copy
```
