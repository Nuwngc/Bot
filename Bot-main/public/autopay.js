/* Quản trị: tự động cộng coin khi nạp bằng cách server tự gọi API lịch sử giao dịch ngân hàng (MB Bank) (Techcombank qua Casso hoặc đọc email biến động số dư, MB Bank qua dichvudark).
   Dùng các hàm có sẵn: $, api, say, esc, fmtDate, confirmBox. */
(() => {
  const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");
  const STATUS = { credited: ["Đã cộng", "ok"], unmatched: ["Chưa khớp", "off"], ignored: ["Bỏ qua", ""] };
  const anchor = $("depositsBox");
  if (!anchor) return;

  const box = document.createElement("section");
  box.id = "autopayBox";
  box.hidden = true;
  box.innerHTML = `
    <h2>Tự động cộng tiền khi nạp</h2>
    <p>Server tự gọi API lịch sử giao dịch ngân hàng. Khi có tiền vào với nội dung chứa mã nạp (NAP + 7 ký tự), coin được cộng ngay vào ví người nạp. Khoá API được mã hoá trên server, không gửi về trình duyệt. Techcombank không có API công khai cho tài khoản cá nhân nên có 2 cách: qua Casso (liên kết tài khoản vào Casso, lấy API Key) hoặc <b>đọc email biến động số dư</b> mà ngân hàng gửi vào hộp thư của bạn (không cần bên thứ ba, đăng nhập hộp thư qua IMAP bằng mật khẩu ứng dụng).</p>
    <label class="check"><input type="checkbox" id="apOn"> Bật tự động cộng coin</label>
    <p class="hint" id="apStat"></p>

    <details class="ls-src" id="apGuide">
      <summary>Cách cài đặt (làm một lần)</summary>
      <div class="ls-src-body">
        <p class="hint"><b>Techcombank (Casso):</b> đăng ký casso.vn, liên kết tài khoản Techcombank của bạn trên Casso (Casso có thể thu phí theo gói kết nối), vào phần tích hợp tạo <b>API Key</b>, dán vào ô API Key bên dưới. Số tài khoản có thể để trống (nếu điền, chỉ đọc giao dịch của tài khoản đó).</p>
        <p class="hint"><b>Đọc email ngân hàng (IMAP):</b> bật thông báo biến động số dư qua email trong app ngân hàng. Với Gmail: bật xác minh 2 bước, bật IMAP (Cài đặt, Chuyển tiếp và POP/IMAP), tạo <b>mật khẩu ứng dụng</b> tại myaccount.google.com/apppasswords rồi dán vào ô mật khẩu (máy chủ <b>imap.gmail.com</b>, cổng <b>993</b>). Ô người gửi điền tên miền email ngân hàng, ví dụ <b>techcombank.com.vn</b>. Brevo và SMTP chỉ để gửi mail nên không dùng được ở đây. Server chỉ đọc, không xoá, không đánh dấu đã đọc, và chỉ nhận thư đúng người gửi và đã qua xác thực DKIM/SPF (thư giả mạo bị loại). Số tiền đọc từ chữ trong thư nên nếu lớn hơn lệnh nạp thì để bạn xác nhận tay. Thư nằm ở Spam sẽ không được đọc.</p>
        <p class="hint"><b>MB Bank (dichvudark):</b> điền Token, Code và số tài khoản MB nhận tiền (đúng số đã khai báo ở phần Ngân hàng phía trên).</p>
        <p class="hint">Sau khi bấm \"Lưu cấu hình\", bấm \"Xem giao dịch gần nhất\" để kiểm tra server đọc được lịch sử (chưa cộng coin). Lần đọc đầu tiên sau khi lưu chỉ ghi nhớ các giao dịch cũ, không cộng coin cho chúng. Rồi chuyển thử một khoản nhỏ kèm mã nạp và bật công tắc phía trên.</p>
        <p class="hint">Server hỏi API mỗi 25 giây khi có lệnh nạp đang chờ, không có thì 5 phút một lần. Mỗi giao dịch chỉ cộng một lần. Tiền nhận bằng hoặc hơn lệnh nạp thì cộng đúng số tiền thực nhận, nhận ít hơn cũng cộng số đã nhận. Giao dịch không có mã nạp hợp lệ nằm ở \"chưa khớp\" để bạn gán tay. Đừng đưa Token và Code cho người khác.</p>
      </div>
    </details>

    <div class="field"><label for="apProv">Nguồn dữ liệu</label>
      <select id="apProv"><option value="casso">Techcombank và ngân hàng khác (qua Casso)</option><option value="dichvudark">MB Bank (qua dichvudark)</option><option value="email">Đọc email biến động số dư (IMAP)</option></select></div>
    <div class="field"><label for="apUrl">Địa chỉ API</label>
      <input type="text" id="apUrl" placeholder="https://api.dichvudark.vn/api/ApiMbBank" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
    <div class="field"><label for="apStk" id="apStkL">Số tài khoản nhận tiền</label>
      <input type="text" id="apStk" inputmode="numeric" placeholder="Số tài khoản MB" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
    <div class="field"><label for="apToken" id="apTokenL">Token</label>
      <input type="password" id="apToken" autocomplete="new-password" placeholder="Dán Token"></div>
    <div class="field" id="apCodeBox"><label for="apCode">Code</label>
      <input type="password" id="apCode" autocomplete="new-password" placeholder="Dán Code"></div>

    <div id="apMailBox" hidden>
      <div class="field"><label for="apHost">Máy chủ IMAP</label>
        <input type="text" id="apHost" placeholder="imap.gmail.com" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
      <div class="field"><label for="apPort">Cổng</label>
        <input type="text" id="apPort" inputmode="numeric" placeholder="993" autocomplete="off"></div>
      <div class="field"><label for="apUser">Email của hộp thư nhận thông báo</label>
        <input type="text" id="apUser" placeholder="ban@gmail.com" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
      <div class="field"><label for="apPass">Mật khẩu ứng dụng</label>
        <input type="password" id="apPass" autocomplete="new-password" placeholder="Dán mật khẩu ứng dụng"></div>
      <div class="field"><label for="apFrom">Email hoặc tên miền ngân hàng gửi</label>
        <input type="text" id="apFrom" placeholder="techcombank.com.vn" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
      <label class="check"><input type="checkbox" id="apStrict" checked> Chỉ nhận thư đã qua xác thực DKIM/SPF (nên bật, tránh thư giả mạo)</label>
    </div>

    <div class="ap-actions">
      <button type="button" class="primary" id="apSave">Lưu cấu hình</button>
      <button type="button" id="apPoll">Kiểm tra ngay</button>
      <button type="button" id="apTest">Xem giao dịch gần nhất</button>
      <button type="button" class="danger" id="apClear">Xoá cấu hình</button>
    </div>
    <div id="apTestOut"></div>

    <h3>Giao dịch ngân hàng gần đây</h3>
    <p class="hint">Khoản chưa khớp là tiền vào nhưng không có mã nạp hợp lệ (người dùng ghi sai nội dung). Gán cho đúng tài khoản để cộng coin, hoặc bỏ qua nếu không phải tiền nạp.</p>
    <div id="apEvents"></div>`;
  anchor.before(box);

  function evRow(e) {
    const [label, cls] = STATUS[e.status] || [e.status, ""];
    const act = e.status === "unmatched"
      ? `<div class="row ap-assign">
           <input type="text" data-user="${e.id}" placeholder="Tên tài khoản cần cộng" autocapitalize="off" spellcheck="false">
           <button type="button" class="primary" data-assign="${e.id}">Gán</button>
           <button type="button" data-ignore="${e.id}">Bỏ qua</button>
         </div>`
      : "";
    return `<div class="ap-ev">
      <div class="ap-top"><b>+${fmt(e.amount)}</b><span class="tag ${cls}">${label}</span>
        ${e.username ? `<span class="dim">${esc(e.username)}</span>` : ""}<span class="spacer"></span>
        <span class="dim">${fmtDate(e.created_at)}</span></div>
      <div class="ap-content">${esc(e.content || "(không có nội dung)")}</div>
      ${e.note ? `<div class="ap-note">${esc(e.note)}</div>` : ""}
      ${act}
    </div>`;
  }

  function applyProv() {
    const prov = $("apProv").value, cas = prov === "casso", mail = prov === "email";
    $("apMailBox").hidden = !mail;
    for (const id of ["apUrl", "apStk", "apToken"]) $(id).closest(".field").hidden = mail;
    $("apCodeBox").hidden = cas || mail;
    $("apTokenL").textContent = cas ? "API Key (Casso)" : "Token";
    $("apStkL").textContent = cas ? "Số tài khoản (không bắt buộc)" : "Số tài khoản nhận tiền";
    $("apUrl").placeholder = cas ? "https://oauth.casso.vn/v2/transactions" : "https://api.dichvudark.vn/api/ApiMbBank";
  }
  $("apProv").addEventListener("change", () => { applyProv(); load(); });

  function apiStatus(m) {
    if (!m.ready) return "Chưa nhập đủ thông tin kết nối API.";
    const s = m.status;
    if (!s) return "Đã lưu cấu hình, chưa kiểm tra.";
    return `${s.ok ? "" : "Lỗi: "}${s.msg} (${fmtDate(s.at)})`;
  }

  function render(d) {
    $("apOn").checked = d.enabled;
    const m = d.api;
    if (document.activeElement?.id !== "apProv") $("apProv").value = m.provider;
    applyProv();
    // Khong ghi de o dang go do khi render lai sau thao tac khac
    const keep = document.activeElement?.id;
    if (keep !== "apUrl") $("apUrl").value = m.url === m.defaultUrl ? "" : m.url || "";
    if (keep !== "apStk") $("apStk").value = m.stk || "";
    $("apUrl").placeholder = m.defaultUrl || "";
    const cas = $("apProv").value === "casso";
    $("apToken").placeholder = m.hasToken && m.provider === $("apProv").value ? "Đã lưu. Bỏ trống để giữ nguyên" : cas ? "Dán API Key" : "Dán Token";
    $("apCode").placeholder = m.hasCode && m.provider === $("apProv").value ? "Đã lưu. Bỏ trống để giữ nguyên" : "Dán Code";
    const mm = m.mail || {};
    if (keep !== "apHost") $("apHost").value = mm.host || "";
    if (keep !== "apPort") $("apPort").value = mm.host ? String(mm.port) : "";
    if (keep !== "apUser") $("apUser").value = mm.user || "";
    if (keep !== "apFrom") $("apFrom").value = mm.from || "";
    if (keep !== "apStrict") $("apStrict").checked = mm.host ? !!mm.strict : true;
    $("apPass").placeholder = mm.hasPass && m.provider === $("apProv").value ? "Đã lưu. Bỏ trống để giữ nguyên" : "Dán mật khẩu ứng dụng";
    $("apClear").hidden = !m.hasToken && !m.hasCode && !m.stk && !mm.hasPass;
    $("apPoll").disabled = !m.ready;
    $("apTest").disabled = !m.ready;
    if (!m.ready) $("apGuide").open = true;

    const bits = [apiStatus(m), `Hôm nay: ${fmt(d.today.n)} giao dịch tự cộng, tổng ${fmt(d.today.sum)} coin.`];
    if (d.unmatched) bits.push(`${fmt(d.unmatched)} giao dịch chưa khớp cần bạn xem.`);
    if (!d.bankReady) bits.push("Chưa khai báo ngân hàng ở phần Ngân hàng phía trên nên người dùng chưa có mã QR để nạp.");
    $("apStat").textContent = bits.join(" ");
    $("apEvents").innerHTML = d.events.length
      ? d.events.map(evRow).join("")
      : '<div class="empty">Chưa nhận được giao dịch nào từ ngân hàng.</div>';
  }

  async function load() {
    try { render(await api("/admin/autopay")); } catch (e) { say(e.message, "bad"); }
  }

  function busy(btn, text, fn) {
    return async () => {
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = text;
      try { await fn(); } finally { btn.disabled = false; btn.textContent = old; }
    };
  }

  $("apOn").addEventListener("change", async () => {
    try {
      render(await api("/admin/autopay", { method: "POST", body: JSON.stringify({ enabled: $("apOn").checked }) }));
      say($("apOn").checked ? "Đã bật tự động cộng coin." : "Đã tắt tự động cộng coin. Tiền vào sẽ được ghi lại để bạn gán tay.");
    } catch (e) { say(e.message, "bad"); load(); }
  });

  const formBody = () => ({
    provider: $("apProv").value,
    url: $("apUrl").value.trim(),
    stk: $("apStk").value.trim(),
    token: $("apToken").value.trim(),
    code: $("apCode").value.trim(),
    mail: {
      host: $("apHost").value.trim(),
      port: $("apPort").value.trim(),
      user: $("apUser").value.trim(),
      pass: $("apPass").value.trim(),
      from: $("apFrom").value.trim(),
      strict: $("apStrict").checked,
    },
  });

  $("apSave").addEventListener("click", busy($("apSave"), "Đang lưu...", async () => {
    try {
      const d = await api("/admin/autopay/api", { method: "POST", body: JSON.stringify(formBody()) });
      $("apToken").value = "";
      $("apCode").value = "";
      $("apPass").value = "";
      render(d);
      say("Đã lưu cấu hình.");
    } catch (e) { say(e.message, "bad"); }
  }));

  $("apPoll").addEventListener("click", busy($("apPoll"), "Đang kiểm tra...", async () => {
    try {
      const d = await api("/admin/autopay/poll", { method: "POST", body: "{}" });
      render(d);
      const s = d.api.status;
      say(s?.msg || "Đã kiểm tra.", s && s.ok ? "" : "bad");
    } catch (e) { say(e.message, "bad"); }
  }));

  $("apTest").addEventListener("click", busy($("apTest"), "Đang đọc...", async () => {
    const out = $("apTestOut");
    out.innerHTML = "";
    try {
      const r = await api("/admin/autopay/test", { method: "POST", body: "{}" });
      if (!r.items.length) {
        out.innerHTML = '<div class="ap-ev"><div class="ap-content">' + ($("apProv").value === "email"
          ? "Không thấy thư nào của ngân hàng trong 3 ngày gần đây. Kiểm tra ô người gửi, bật thông báo biến động số dư qua email trong app ngân hàng, rồi chuyển thử một khoản nhỏ (thư nằm ở Spam sẽ không được đọc)."
          : "API trả về lịch sử trống. Chuyển thử một khoản nhỏ rồi thử lại, hoặc kiểm tra lại số tài khoản.") + '</div></div>';
        return;
      }
      const KNOWN = { credited: "đã cộng", unmatched: "đã ghi, chưa khớp", ignored: "giao dịch cũ, bỏ qua" };
      out.innerHTML = `<p class="hint">Đây là ${r.items.length} giao dịch gần nhất trong tổng ${r.total} server đọc được (chưa cộng coin):</p>` + r.items.map((i) => {
        const incoming = i.amount > 0;
        const note = !incoming ? (i.note || "Tiền ra, sẽ bỏ qua")
          : i.known ? `Server ${KNOWN[i.known] || i.known}`
          : "Chưa xử lý";
        return `<div class="ap-ev">
          <div class="ap-top"><b>${incoming ? "+" + fmt(i.amount) : i.debit ? "-" + fmt(i.debit) : "—"}</b><span class="tag ${incoming ? "ok" : ""}">${incoming ? "Tiền vào" : i.debit ? "Tiền ra" : "Bỏ qua"}</span><span class="spacer"></span><span class="dim">${esc(i.date || "")}</span></div>
          <div class="ap-content">${esc(i.content || "(không có nội dung)")}</div>
          <div class="ap-note">${esc(note)}${incoming ? (i.codes.length ? " · mã nạp tìm thấy: " + esc(i.codes.join(", ")) : " · không thấy mã nạp NAPxxxxxxx") : ""}</div>
        </div>`;
      }).join("");
    } catch (e) { say(e.message, "bad"); }
  }));

  $("apClear").addEventListener("click", async () => {
    if (!(await confirmBox("Server sẽ quên khoá API, số tài khoản và tắt tự động cộng coin. Tiền vào sau đó phải duyệt tay.", { title: "Xoá cấu hình?", ok: "Xoá", cancel: "Giữ lại", danger: true }))) return;
    try { render(await api("/admin/autopay/clear", { method: "POST", body: "{}" })); $("apTestOut").innerHTML = ""; say("Đã xoá cấu hình."); }
    catch (e) { say(e.message, "bad"); }
  });

  box.addEventListener("click", async (e) => {
    const a = e.target.closest("button[data-assign]");
    const i = e.target.closest("button[data-ignore]");
    if (!a && !i) return;
    try {
      if (a) {
        const username = box.querySelector(`input[data-user="${a.dataset.assign}"]`).value.trim();
        if (!username) return say("Nhập tên tài khoản cần cộng coin.", "bad");
        const r = await api(`/admin/autopay/events/${a.dataset.assign}/assign`, { method: "POST", body: JSON.stringify({ username }) });
        say(`Đã cộng ${fmt(r.amount)} coin cho ${username}.`);
      } else {
        await api(`/admin/autopay/events/${i.dataset.ignore}/ignore`, { method: "POST", body: "{}" });
        say("Đã bỏ qua giao dịch này.");
      }
      load();
    } catch (err) { say(err.message, "bad"); }
  });

  const base = window.loadWalletAdmin;
  window.loadWalletAdmin = () => {
    base?.();
    box.hidden = false;
    load();
  };
})();
