/* Trang HƯỚNG DẪN SỬ DỤNG trong web.
   File độc lập: tự thêm tab "Hướng dẫn", nội dung và CSS vào trang (không sửa dashboard.html / style.css).
   Dùng các hàm có sẵn: showTab (bots.js), isAdmin (app.js). */
(() => {
  const tabs = document.getElementById("tabs");
  if (!tabs || document.getElementById("tab-guide")) return;

  /* ---------- tiện ích dựng nội dung (tự escape; `mã` -> <code>, **đậm** -> <strong>) ---------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const f = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const p = (s) => `<p>${f(s)}</p>`;
  const steps = (a) => `<ol class="gd-steps">${a.map((s) => `<li>${f(s)}</li>`).join("")}</ol>`;
  const list = (a) => `<ul class="gd-list">${a.map((s) => `<li>${f(s)}</li>`).join("")}</ul>`;
  const cmds = (a) => `<div class="gd-cmds">${a.map(([c, d]) => `<div><code>${esc(c)}</code><span>${f(d)}</span></div>`).join("")}</div>`;
  const note = (kind, s) => `<div class="gd-note ${kind}">${f(s)}</div>`;
  const h = (s) => `<h4>${esc(s)}</h4>`;
  const qa = (a) => a.map(([q, r]) => `<div class="gd-qa"><strong>${esc(q)}</strong>${p(r)}</div>`).join("");

  /* ---------- nội dung ---------- */
  const SECTIONS = [
    { id: "start", title: "Bắt đầu nhanh", open: true, html:
      steps([
        "Đăng nhập bằng tài khoản của bạn, hoặc bấm **Tạo tài khoản** ở trang đăng nhập nếu web đang mở đăng ký. Sau đó liên kết email ở tab **Cá nhân**.",
        "Vào tab **Facebook** hoặc **Zalo**, bấm **+ Thêm bot** rồi đăng nhập tài khoản mạng xã hội cho bot (dán cookie).",
        "Bấm **Bật**, sau đó xem phần **Nhật ký** bên dưới để chắc chắn bot đã chạy.",
        "Vào nhóm chat và gõ lệnh, ví dụ `!help` (Messenger).",
        "Bot sắp hết hạn thì **nạp coin** ở tab Nạp tiền, rồi gia hạn ở tab Thanh toán.",
      ]) + note("warn", "Nên dùng **tài khoản phụ** làm bot. Tài khoản chạy bot có thể bị Facebook hoặc Zalo yêu cầu xác minh hoặc khoá.") },

    { id: "fb", title: "Bot Facebook (Messenger)", html:
      h("Thêm và đăng nhập") +
      steps([
        "Bấm **+ Thêm bot** và đặt tên cho bot.",
        "Chọn bot vừa tạo, kéo xuống mục **Đăng nhập Facebook**.",
        "Tab **Dán cookie** (khuyên dùng): dán mảng JSON xuất từ extension, hoặc chuỗi `tên=giá_trị; …` copy từ DevTools của trình duyệt đang đăng nhập Facebook.",
        "Tab **Email + mật khẩu** (thử nghiệm): không dùng được với tài khoản bật 2FA và dễ bị Facebook đánh dấu hơn. Lỗi thì quay lại dán cookie.",
      ]) +
      h("Cài đặt bot") +
      list(["**Tên bot**: tên hiển thị trong danh sách.", "**Ký tự lệnh**: mặc định là `!`, bạn đổi được.", "**Tự bật khi server khởi động lại**: bot tự chạy lại sau khi server bảo trì."]) +
      h("Điều khiển") +
      p("Nút **Bật** và **Tắt** điều khiển bot. Phần **Nhật ký** hiện hoạt động và lỗi gần nhất. Bot hết hạn sẽ tự dừng.") +
      h("Trả lời bằng AI") +
      p("Tag bot trong một tin nhắn bất kỳ để hỏi AI. Ở mục **Cài đặt AI** bạn chỉnh được **Model AI** và **Tính cách của bot**. Khoá API do quản trị viên cấu hình dùng chung.") },

    { id: "zalo", title: "Bot Zalo", html:
      steps([
        "Vào tab **Zalo**, bấm **+ Thêm bot** và đặt tên.",
        "Mục **Đăng nhập Zalo** cần **IMEI** và **Cookie**: lấy khi bạn đang đăng nhập `chat.zalo.me` trên trình duyệt.",
        "Đặt **Ký tự lệnh** (ví dụ `/`), bấm **Bật** và xem **Nhật ký**.",
      ]) +
      p("Bot Zalo có các game riêng như `/baucua`, `/dhbc`, `/taixiu`, `/masoi`. Một số game cần admin bot bật cho từng nhóm trước, ví dụ `/masoi on`. Bot không trả lời thì nhờ admin bot bật game cho nhóm.") +
      note("warn", "Bot Zalo cũng nên chạy bằng tài khoản phụ. Muốn chơi ma sói với bot, mọi người cần **nhắn cho bot một câu trước** để bot nhắn riêng được.") },

    { id: "cmds", title: "Lệnh của bot Messenger", html:
      p("Ký tự lệnh mặc định là `!`. Gõ `!help` để xem danh sách đầy đủ.") +
      h("Game") +
      cmds([["!noitu", "Chơi nối từ với bot. Kèm `bxh` xem bảng xếp hạng, `check <từ>` kiểm tra từ."],
            ["!baucua  (!bc)", "Bầu cua."], ["!taixiu  (!tx)", "Tài xỉu."],
            ["!dhbc", "Đuổi hình bắt chữ. Kèm `top`, `goiy`, `boqua`."],
            ["!vi  (!xu)", "Xem ví xu trong game. Xu này khác với coin nạp trên web."],
            ["!masoi", "Mở phòng ma sói (xem mục Ma sói)."]]) +
      h("Tiện ích") +
      cmds([["!chat  (!ai, !hoi)", "Hỏi AI."], ["!dich  (!translate)", "Dịch văn bản."], ["!thoitiet  (!tt)", "Thời tiết."],
            ["!tygia  (!doitien)", "Tỷ giá."], ["!giavang  (!vang)", "Giá vàng."], ["!news  (!tintuc)", "Tin tức."]]) +
      h("Giải trí") +
      cmds([["!thinh  (!thathinh)", "Thả thính."], ["!sad  (!thobuon)", "Thơ buồn."]]) },

    { id: "masoi", title: "Chơi ma sói", html:
      p("Cần từ **4 người** chơi. Số sói là 1 trên mỗi 4 người. Càng đông càng có thêm vai trò: Tiên tri từ 5 người, Bảo vệ từ 6, Thợ săn từ 7, Phù thủy từ 8, Cupid từ 9. Người còn lại là Dân làng.") +
      h("Cách chơi") +
      steps([
        "Mở phòng: `!masoi` (Messenger) hoặc `/masoi tao` (Zalo, có ảnh sảnh chờ).",
        "Mọi người vào phòng: `!join` hoặc `/masoi join`.",
        "Bắt đầu: `!start` hoặc `/masoi start`. Bot nhắn riêng vai trò cho từng người.",
        "**Ban đêm**: người có chức năng nhắn riêng cho bot để hành động.",
        "**Ban ngày**: cả nhóm thảo luận, rồi bỏ phiếu treo cổ: `!vote <số>` hoặc `/masoi vote <số>`.",
        "Lặp lại đêm và ngày cho đến khi một phe thắng. `!stop` hoặc `/masoi stop` để dừng ván.",
      ]) +
      h("Hành động ban đêm (nhắn riêng cho bot)") +
      cmds([["kill <số>", "Sói chọn người để cắn."], ["soi <số>", "Tiên tri soi một người có phải sói không."],
            ["bv <số>", "Bảo vệ che chở một người, không chọn cùng một người hai đêm liền."],
            ["cuu / doc <số>", "Phù thủy dùng bình cứu hoặc bình độc, mỗi loại một lần cả ván. Zalo có thêm `bo` để bỏ qua đêm đó."],
            ["gheptinh <số1> <số2>", "Cupid ghép đôi hai người ở đêm đầu."], ["ban <số>", "Thợ săn bắn theo một người khi chết."]]) +
      p("Trên Messenger đặt ký tự lệnh trước, ví dụ `!kill 3`. Trên Zalo gõ `/masoi kill 3`, hoặc chỉ `/masoi 3` để dùng năng lực chính của vai trò.") +
      h("Ai thắng") +
      list(["**Dân làng** thắng khi hết sói.", "**Phe sói** thắng khi số sói bằng hoặc nhiều hơn số dân.", "**Cặp đôi Cupid** thắng khi chỉ còn hai người yêu nhau."]) +
      note("info", "Bot cần nhắn riêng được cho bạn: hãy **nhắn cho bot một câu** trước khi chơi.") },

    { id: "pay", title: "Nạp coin và thanh toán", html:
      p("**1 coin = 1đ.** Số dư ví luôn hiện ở thanh trên cùng, bấm vào để nạp thêm.") +
      h("Nạp coin") +
      steps([
        "Vào tab **Nạp tiền**, nhập số tiền tuỳ ý (từ 10.000 đến 50.000.000 coin mỗi lần) hoặc chọn nhanh một mức.",
        "Bấm **Nạp tiền**. Web hiện mã QR và thông tin chuyển khoản.",
        "Chuyển khoản **đúng số tiền và đúng nội dung** (mã dạng `NAPxxxxxxx`).",
        "Quản trị viên đối chiếu rồi xác nhận, coin vào ví ngay. Mỗi người giữ tối đa 3 lệnh nạp đang chờ.",
      ]) +
      h("Thanh toán gia hạn bot") +
      steps([
        "Vào tab **Thanh toán**, chọn bot cần gia hạn và chọn gói.",
        "Có mã giảm giá thì nhập vào và bấm áp dụng.",
        "Bấm **Thanh toán bằng ví**: coin bị trừ và bot được cộng thêm hạn ngay, không cần chờ duyệt.",
      ]) +
      p("Không đủ coin thì web báo còn thiếu bao nhiêu và có nút **Nạp thêm**. Lịch sử ví gần đây nằm ở cuối tab Nạp tiền.") },

    { id: "rank", title: "Bảng xếp hạng và thưởng", html:
      list([
        "Xếp hạng theo **tổng coin nạp trong tháng** (tính theo giờ Việt Nam). Hiện top 10, tên người chơi được ẩn bớt.",
        "Hết tháng, những hạng có thưởng được **cộng coin vào ví tự động**. Mức thưởng do quản trị viên đặt cho từng hạng.",
        "Tiền thưởng và coin được cộng thủ công **không** tính vào xếp hạng. Tài khoản quản trị không tham gia xếp hạng.",
        "Tab **Xếp hạng** cho thấy hạng của bạn, còn thiếu bao nhiêu coin để lên hạng, và danh sách vinh danh tháng trước.",
      ]) },

    { id: "tools", title: "Công cụ tiện ích", html:
      p("Tab **Công cụ** có các tiện ích chạy ngay trên trình duyệt, không lưu dữ liệu của bạn. Bấm vào từng công cụ để mở.") +
      list([
        "**Chuyển đổi cookie**: đổi cookie giữa dạng chuỗi và JSON, hiện UID Facebook và cho biết thiếu `c_user` hay `xs`. Cookie không gửi lên máy chủ.",
        "**Tạo mã QR**: từ văn bản, liên kết, hoặc mã QR chuyển khoản VietQR (chọn ngân hàng, số tài khoản, số tiền, nội dung). Ảnh QR do dịch vụ bên ngoài tạo.",
        "**Xử lý văn bản**: bỏ dấu tiếng Việt, đổi chữ hoa thường, tạo slug, xoá dòng trùng, sắp xếp, đếm ký tự.",
        "**Tạo mật khẩu mạnh**: ngẫu nhiên an toàn, chọn độ dài và loại ký tự.",
        "**Chọn ngẫu nhiên / chia đội**: bốc thăm người trúng thưởng hoặc chia đội đều nhau từ danh sách tên.",
        "**Đổi thời gian**: đổi timestamp sang giờ Việt Nam và ngược lại, tính ngày sau khi cộng thêm N ngày.",
      ]) },

    { id: "tips", title: "Mẹo dùng trên điện thoại", html:
      list([
        "Nút **3 gạch** ở thanh trên mở menu chuyển tab.",
        "Nút **mặt trời, mặt trăng** đổi giao diện sáng hoặc tối, web nhớ lựa chọn của bạn.",
        "Bấm vào **logo** để tải lại trang, vẫn ở tab đang mở.",
        "Muốn có biểu tượng trên màn hình chính: trong menu trình duyệt chọn **Thêm vào màn hình chính**.",
      ]) },

    { id: "account", title: "Tài khoản cá nhân và lấy lại mật khẩu", html:
      h("Liên kết email") +
      steps([
        "Vào tab **Cá nhân**.",
        "Nhập **địa chỉ email** của bạn và bấm **Gửi mã xác thực**.",
        "Mở email, lấy mã 6 số, nhập vào ô mã và bấm **Xác nhận**.",
      ]) +
      p("Cần thay email thì bấm **Đổi email**, muốn bỏ thì bấm **Gỡ liên kết**. Nên liên kết email ngay sau khi tạo tài khoản.") +
      h("Quên mật khẩu") +
      steps([
        "Ở trang đăng nhập bấm **Quên mật khẩu?**.",
        "Nhập tên đăng nhập hoặc email đã liên kết, bấm **Gửi mã**. Hệ thống gửi mã 6 số tới email đó.",
        "Nhập mã 6 số và mật khẩu mới (tối thiểu 8 ký tự), bấm **Đặt lại mật khẩu**.",
        "Chưa nhận được mã thì bấm **Gửi lại mã**.",
      ]) +
      note("warn", "Chỉ lấy lại được tài khoản đã **liên kết email**. Chưa liên kết thì liên hệ quản trị viên.") },

    { id: "faq", title: "Hỏi đáp nhanh", html: qa([
      ["Bot không trả lời lệnh?", "Kiểm tra bot đã bấm Bật, còn hạn ở tab Thanh toán, và xem Nhật ký có báo lỗi đăng nhập không. Lệnh phải bắt đầu đúng ký tự lệnh bạn đã đặt."],
      ["Nhật ký báo cookie hết hạn hoặc bị checkpoint?", "Đăng nhập lại tài khoản bot trên trình duyệt, xử lý yêu cầu xác minh nếu có, rồi dán cookie mới vào web."],
      ["Chuyển khoản rồi mà chưa thấy coin?", "Coin vào ví sau khi quản trị viên xác nhận. Kiểm tra bạn đã chuyển đúng số tiền và đúng nội dung có mã `NAP`. Chờ lâu thì báo quản trị viên."],
      ["Bot hết hạn thì sao?", "Bot tự dừng. Nạp coin rồi thanh toán gia hạn, sau đó bấm Bật lại."],
      ["Ma sói không nhắn riêng được cho tôi?", "Hãy nhắn cho bot một câu bất kỳ trước, rồi vào phòng chơi."],
      ["Quên mật khẩu?", "Ở trang đăng nhập bấm Quên mật khẩu? rồi làm theo mã 6 số gửi về email (xem mục Tài khoản cá nhân). Tài khoản chưa liên kết email thì liên hệ quản trị viên."],
    ]) },

    { id: "admin", title: "Dành cho quản trị viên", admin: true, html:
      list([
        "**Tài khoản**: tạo tài khoản mới (mật khẩu tối thiểu 8 ký tự), cấp quyền quản trị, khoá hoặc xoá.",
        "**Doanh thu**: thống kê tiền nạp và coin chi thuê bot, xem danh sách giao dịch toàn hệ thống và lọc theo nhu cầu.",
        "**Nạp coin chờ duyệt**: đối chiếu nội dung chuyển khoản với mã `NAP` rồi bấm **Xác nhận**. Bấm **Huỷ** nếu không hợp lệ.",
        "**Phần thưởng xếp hạng**: đặt mức thưởng cho top 1 đến top 10, hệ thống tự cộng đầu tháng. Đặt 0 để hạng đó không có thưởng.",
        "**Cộng hoặc trừ coin thủ công**: nhập tên tài khoản, số coin (số âm là trừ) và ghi chú.",
        "**Bảng giá** và **Mã giảm giá**: chỉnh giá các gói và tạo mã giảm theo số lượt hoặc hạn dùng.",
        "**Đơn thuê bot** và **Thời hạn các bot**: theo dõi và duyệt các đơn cũ, chỉnh hạn từng bot.",
        "**Cấu hình chung**: bật hoặc tắt đăng ký, số ngày dùng thử, tài khoản ngân hàng VietQR (mã ngân hàng, số tài khoản, chủ tài khoản, ghi chú), khoá AI, model và tính cách mặc định dùng chung.",
      ]) },
  ];

  const CHIPS = [["start", "Bắt đầu"], ["fb", "Facebook"], ["zalo", "Zalo"], ["cmds", "Lệnh"], ["masoi", "Ma sói"], ["pay", "Nạp & thanh toán"], ["rank", "Xếp hạng"], ["tools", "Công cụ"], ["account", "Cá nhân"], ["faq", "Hỏi đáp"]];

  /* ---------- CSS ---------- */
  const css = document.createElement("style");
  css.textContent = `
  .gd-hero{padding:1.2rem;border-radius:20px;border:1px solid var(--line);margin-bottom:1rem;
    background:linear-gradient(135deg,rgba(167,125,255,.16),rgba(232,64,122,.18)),var(--panel)}
  .gd-hero h2{margin:0 0 .25rem;font-size:1.25rem}.gd-hero h2::before{display:none}
  .gd-hero p{margin:0 0 .9rem;color:var(--dim);font-size:.9rem;max-width:none}
  .gd-search{position:relative}.gd-search input{padding-left:2.6rem}
  .gd-search svg{position:absolute;left:.85rem;top:50%;width:1.1rem;height:1.1rem;transform:translateY(-50%);fill:none;stroke:var(--dim);stroke-width:2;stroke-linecap:round}
  .gd-chips{display:flex;gap:.45rem;flex-wrap:wrap;margin-top:.8rem}
  .gd-chips button{padding:.35rem .8rem;border-radius:99px;font-size:.82rem}
  details.gd-sec{background:var(--panel);border:1px solid var(--line);border-radius:16px;margin-bottom:.6rem;scroll-margin-top:5.5rem;transition:border-color .3s,box-shadow .3s}
  details.gd-sec[open]{border-color:rgba(232,64,122,.4);box-shadow:0 14px 34px -24px var(--lamp)}
  details.gd-sec summary{display:flex;align-items:center;gap:.8rem;padding:.9rem 1rem;cursor:pointer;list-style:none;font-weight:600}
  details.gd-sec summary::-webkit-details-marker{display:none}
  .gd-n{display:grid;place-items:center;flex:none;width:1.8rem;height:1.8rem;border-radius:50%;background:var(--grad);color:#fff;font-size:.85rem}
  .gd-sec summary .gd-t{flex:1}
  .gd-chev{width:1.1rem;height:1.1rem;fill:none;stroke:var(--dim);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .3s var(--ease)}
  details[open] .gd-chev{transform:rotate(180deg)}
  .gd-body{padding:0 1rem 1rem;font-size:.92rem;line-height:1.65}
  details[open] .gd-body{animation:in .35s var(--ease)}
  .gd-body p{margin:.5rem 0;max-width:none;color:var(--paper)}
  .gd-body h4{margin:1.1rem 0 .4rem;font-size:.85rem;color:var(--lamp);letter-spacing:.02em}
  .gd-body code,.gd-cmds code{font:.82em ui-monospace,Menlo,monospace;background:var(--raised);padding:.1rem .4rem;border-radius:6px;color:var(--lamp2);word-break:break-word}
  .gd-steps{list-style:none;counter-reset:s;padding:0;margin:.5rem 0}
  .gd-steps li{counter-increment:s;position:relative;padding:.2rem 0 .55rem 2.3rem}
  .gd-steps li::before{content:counter(s);position:absolute;left:0;top:.1rem;width:1.6rem;height:1.6rem;border-radius:50%;display:grid;place-items:center;font-size:.78rem;font-weight:700;color:var(--lamp);background:rgba(232,64,122,.14);box-shadow:inset 0 0 0 1px rgba(232,64,122,.35)}
  .gd-list{margin:.4rem 0;padding-left:1.1rem}.gd-list li{margin:.3rem 0}
  .gd-cmds{display:grid;gap:.35rem;margin:.4rem 0}
  .gd-cmds>div{display:grid;grid-template-columns:minmax(7.5rem,32%) 1fr;gap:.6rem;align-items:start;padding:.45rem .6rem;border-radius:10px;background:var(--raised)}
  .gd-cmds span{color:var(--dim)}
  .gd-note{margin:.7rem 0 .2rem;padding:.65rem .8rem;border-radius:12px;font-size:.88rem;border:1px solid var(--line);background:var(--raised)}
  .gd-note.warn{border-color:rgba(255,184,107,.5);background:rgba(255,184,107,.1)}
  .gd-note.info{border-color:rgba(167,125,255,.45);background:rgba(167,125,255,.1)}
  .gd-qa{padding:.55rem 0;border-bottom:1px solid var(--line)}.gd-qa:last-child{border:0}.gd-qa p{margin:.2rem 0 0;color:var(--dim)}
  .gd-empty{padding:1.4rem;text-align:center;color:var(--dim)}
  @media(max-width:480px){.gd-cmds>div{grid-template-columns:1fr;gap:.15rem}}`;
  document.head.append(css);

  /* ---------- dựng trang ---------- */
  const SEARCH_ICON = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
  const CHEV = '<svg class="gd-chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
  const panel = document.createElement("div");
  panel.className = "tab";
  panel.id = "tab-guide";
  panel.hidden = true;
  panel.innerHTML = `
    <section>
      <div class="gd-hero">
        <h2>Hướng dẫn sử dụng</h2>
        <p>Cách thêm bot, nạp coin, thanh toán và chơi game. Gõ từ khoá để tìm nhanh.</p>
        <div class="gd-search">${SEARCH_ICON}<input type="text" id="gdSearch" placeholder="Tìm: cookie, nạp, ma sói..." autocomplete="off"></div>
        <div class="gd-chips" id="gdChips">${CHIPS.map(([id, t]) => `<button type="button" data-go="${id}">${esc(t)}</button>`).join("")}</div>
      </div>
      <div id="gdList">${SECTIONS.map((s, i) => `
        <details class="gd-sec" id="gd-${s.id}"${s.open ? " open" : ""}${s.admin ? " hidden data-admin" : ""}>
          <summary><span class="gd-n">${i + 1}</span><span class="gd-t">${esc(s.title)}</span>${CHEV}</summary>
          <div class="gd-body">${s.html}</div>
        </details>`).join("")}</div>
      <div class="gd-empty" id="gdEmpty" hidden>Không tìm thấy nội dung phù hợp.</div>
    </section>`;
  const after = document.getElementById("tab-plan");
  if (after) after.after(panel); else (document.querySelector(".wrap") || document.body).append(panel);

  const btn = document.createElement("button");
  btn.dataset.tab = "guide";
  btn.textContent = "Hướng dẫn";
  btn.dataset.icon = '<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16zM4 21.5A2.5 2.5 0 0 1 6.5 19H20M9 7h7"/></svg>';
  // đứng sau tab Cá nhân, trước các tab dành cho admin (Doanh thu, Quản trị)
  const anchor = document.getElementById("tabStatsBtn") || document.getElementById("tabAdminBtn");
  if (anchor) anchor.before(btn); else tabs.append(btn);

  /* ---------- tương tác ---------- */
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  const secs = [...panel.querySelectorAll("details.gd-sec")];
  const texts = new Map(secs.map((d) => [d, norm(d.textContent)]));
  const input = panel.querySelector("#gdSearch");
  const empty = panel.querySelector("#gdEmpty");
  const wasOpen = new Map();

  function refreshAdmin() {
    const admin = typeof isAdmin !== "undefined" && isAdmin;
    secs.forEach((d) => { if (d.hasAttribute("data-admin")) d.hidden = !admin; });
    applyFilter();
  }
  function applyFilter() {
    const q = norm(input.value.trim()).split(/\s+/).filter(Boolean);
    let shown = 0;
    secs.forEach((d) => {
      const isAdminSec = d.hasAttribute("data-admin");
      const adminOk = !isAdminSec || (typeof isAdmin !== "undefined" && isAdmin);
      const match = adminOk && q.every((w) => texts.get(d).includes(w));
      d.hidden = !match;
      if (match) shown++;
      if (q.length) { if (match) { if (!wasOpen.has(d)) wasOpen.set(d, d.open); d.open = true; } }
      else if (wasOpen.has(d)) { d.open = wasOpen.get(d); wasOpen.delete(d); }
    });
    empty.hidden = shown > 0;
  }
  input.addEventListener("input", applyFilter);

  panel.querySelector("#gdChips").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-go]");
    if (!b) return;
    input.value = ""; applyFilter();
    const d = document.getElementById("gd-" + b.dataset.go);
    d.open = true;
    d.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const baseShow = window.showTab;
  window.showTab = function (name) {
    baseShow(name);
    if (name === "guide") refreshAdmin();
  };
  // bots.js đã đổi #guide thành #fb trước khi file này nạp xong, nên đọc địa chỉ gốc lúc mở trang
  const nav = performance.getEntriesByType("navigation")[0];
  const wanted = nav ? new URL(nav.name).hash : location.hash;
  if (wanted === "#guide") window.showTab("guide");
})();
