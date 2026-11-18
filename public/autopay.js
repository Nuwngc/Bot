/* Quản trị: tự động cộng coin khi nạp bằng cách server tự đọc email báo biến động số dư của ngân hàng.
   Không dùng dịch vụ bên thứ ba, không cần mật khẩu ngân hàng. Dùng các hàm có sẵn: $, api, say, esc, fmtDate, confirmBox. */
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
    <p>Server tự đọc email báo biến động số dư mà ngân hàng gửi cho bạn. Khi có tiền vào với nội dung chứa mã nạp (NAP + 7 ký tự), coin được cộng ngay vào ví người nạp. Không dùng dịch vụ bên thứ ba, không cần mật khẩu hay quyền gì trên tài khoản ngân hàng, server chỉ đọc email.</p>
    <label class="check"><input type="checkbox" id="apOn"> Bật tự động cộng coin</label>
    <p class="hint" id="apStat"></p>

    <details class="ls-src" id="apGuide">
      <summary>Cách cài đặt (làm một lần)</summary>
      <div class="ls-src-body">
        <p class="hint"><b>1.</b> Tạo một Gmail riêng chỉ để nhận thông báo ngân hàng (đừng dùng Gmail chính). Bật Xác minh 2 bước, rồi vào myaccount.google.com/apppasswords tạo một "Mật khẩu ứng dụng" gồm 16 ký tự.</p>
        <p class="hint"><b>2.</b> Trong app ngân hàng, bật thông báo biến động số dư qua email và điền Gmail riêng đó (tên gọi tuỳ ngân hàng). Mở một email thật của ngân hàng, xem phần "Từ" để biết địa chỉ hoặc tên miền ngân hàng gửi (ví dụ mbbank.com.vn).</p>
        <p class="hint"><b>3.</b> Điền form bên dưới rồi bấm "Lưu và kết nối". Nếu báo kết nối thành công thì xong phần kết nối.</p>
        <p class="hint"><b>4.</b> Chuyển thử một khoản nhỏ vào tài khoản, rồi bấm "Thử đọc email gần nhất" để xem server đọc đúng số tiền và nội dung chưa. Cuối cùng bật công tắc phía trên và tự thử nạp một khoản nhỏ.</p>
        <p class="hint">An toàn: mật khẩu ứng dụng được mã hoá trong cơ sở dữ liệu và không bao giờ gửi lại về trình duyệt. Server chỉ đọc email, không có quyền chuyển tiền. Chỉ email từ đúng địa chỉ ngân hàng và vượt qua xác thực người gửi mới được tin. Khoản nhận lớn hơn lệnh nạp sẽ không tự cộng, để bạn xem lại.</p>
      </div>
    </details>

    <div class="field"><label for="apUser">Gmail nhận thông báo ngân hàng</label>
      <input type="text" id="apUser" placeholder="ten.rieng@gmail.com" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
    <div class="field"><label for="apPass">Mật khẩu ứng dụng</label>
      <input type="password" id="apPass" autocomplete="new-password" placeholder="16 ký tự do Google cấp"></div>
    <div class="field"><label for="apFrom">Email hoặc tên miền ngân hàng gửi</label>
      <input type="text" id="apFrom" placeholder="mbbank.com.vn" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
    <label class="check"><input type="checkbox" id="apStrict" checked> Chế độ chặt: chỉ tin email qua được xác thực người gửi (nên bật)</label>

    <details class="ls-src" id="apAdv">
      <summary>Nâng cao</summary>
      <div class="ls-src-body">
        <div class="ls-src-grid">
          <div class="field"><label for="apHost">Máy chủ IMAP</label><input type="text" id="apHost" placeholder="imap.gmail.com" autocapitalize="off" spellcheck="false"></div>
          <div class="field"><label for="apBox">Hộp thư</label><input type="text" id="apBox" placeholder="INBOX" autocapitalize="off" spellcheck="false"></div>
        </div>
      </div>
    </details>

    <div class="ap-actions">
      <button type="button" class="primary" id="apSave">Lưu và kết nối</button>
      <button type="button" id="apPoll">Kiểm tra ngay</button>
      <button type="button" id="apTest">Thử đọc email gần nhất</button>
      <button type="button" class="danger" id="apClear">Xoá cấu hình</button>
    </div>
    <div id="apTestOut"></div>

    <h3>Giao dịch ngân hàng gần đây</h3>
    <p class="hint">Khoản chưa khớp là tiền vào nhưng không có mã nạp hợp lệ (người dùng ghi sai nội dung), hoặc nhận nhiều hơn lệnh nạp. Gán cho đúng tài khoản để cộng coin, hoặc bỏ qua nếu không phải tiền nạp.</p>
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

  function mailStatus(m) {
    if (!m.ready) return "Chưa kết nối hộp thư nhận thông báo ngân hàng.";
    const s = m.status;
    if (!s) return "Đã lưu cấu hình, chưa kiểm tra.";
    return `${s.ok ? "Hộp thư: " : "Lỗi hộp thư: "}${s.msg} (${fmtDate(s.at)})`;
  }

  function render(d) {
    $("apOn").checked = d.enabled;
    const m = d.mail;
    // Khong ghi de o dang go do khi render lai sau thao tac khac
    if (document.activeElement?.id !== "apUser") $("apUser").value = m.user || "";
    if (document.activeElement?.id !== "apFrom") $("apFrom").value = m.from || "";
    if (document.activeElement?.id !== "apHost") $("apHost").value = m.host === "imap.gmail.com" ? "" : m.host || "";
    if (document.activeElement?.id !== "apBox") $("apBox").value = m.box === "INBOX" ? "" : m.box || "";
    $("apStrict").checked = m.strict;
    $("apPass").placeholder = m.hasPass ? "Đã lưu. Bỏ trống để giữ nguyên" : "16 ký tự do Google cấp";
    $("apClear").hidden = !m.user && !m.hasPass;
    $("apPoll").disabled = !m.ready;
    $("apTest").disabled = !m.ready;
    if (!m.ready) $("apGuide").open = true;

    const bits = [mailStatus(m), `Hôm nay: ${fmt(d.today.n)} giao dịch tự cộng, tổng ${fmt(d.today.sum)} coin.`];
    if (d.unmatched) bits.push(`${fmt(d.unmatched)} giao dịch chưa khớp cần bạn xem.`);
    if (!d.bankReady) bits.push("Chưa khai báo ngân hàng ở phần Ngân hàng phía trên nên người dùng chưa có mã QR để nạp.");
    $("apStat").textContent = bits.join(" ");
    if (m.status?.warn) {
      const w = document.createElement("div");
      w.className = "ap-warn";
      w.textContent = m.status.warn.text;
      $("apStat").append(w);
    }
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

  $("apSave").addEventListener("click", busy($("apSave"), "Đang kết nối...", async () => {
    try {
      const d = await api("/admin/autopay/mail", {
        method: "POST",
        body: JSON.stringify({
          user: $("apUser").value.trim(),
          pass: $("apPass").value,
          from: $("apFrom").value.trim(),
          host: $("apHost").value.trim(),
          box: $("apBox").value.trim(),
          strict: $("apStrict").checked,
        }),
      });
      $("apPass").value = "";
      render(d);
      const s = d.mail.status;
      if (s && s.ok) say("Đã kết nối hộp thư. Hãy thử đọc email ngân hàng rồi bật tự động cộng coin.");
      else say(s?.msg || "Chưa kết nối được hộp thư.", "bad");
    } catch (e) { say(e.message, "bad"); }
  }));

  $("apPoll").addEventListener("click", busy($("apPoll"), "Đang kiểm tra...", async () => {
    try {
      const d = await api("/admin/autopay/mail/poll", { method: "POST", body: "{}" });
      render(d);
      const s = d.mail.status;
      say(s?.msg || "Đã kiểm tra.", s && s.ok ? "" : "bad");
    } catch (e) { say(e.message, "bad"); }
  }));

  $("apTest").addEventListener("click", busy($("apTest"), "Đang đọc...", async () => {
    const out = $("apTestOut");
    out.innerHTML = "";
    try {
      const r = await api("/admin/autopay/mail/test", { method: "POST", body: "{}" });
      if (!r.items.length) {
        out.innerHTML = '<div class="ap-ev"><div class="ap-content">Hộp thư chưa có email nào từ địa chỉ ngân hàng này. Kiểm tra lại ô "Email hoặc tên miền ngân hàng gửi", hoặc chuyển thử một khoản nhỏ rồi thử lại.</div></div>';
        return;
      }
      const KIND = {
        credit: ["Hiểu là tiền vào", "ok"],
        other: ["Không phải tiền vào, sẽ bỏ qua", ""],
        unreadable: ["Giống tiền vào nhưng không đọc được số tiền", "off"],
      };
      out.innerHTML = `<p class="hint">${fmt(r.total)} email từ ngân hàng trong hộp thư. Đây là ${r.items.length} email gần nhất và cách server hiểu (chưa cộng coin):</p>` + r.items.map((i) => {
        const [label, cls] = KIND[i.kind] || [i.kind, ""];
        const trust = !i.fromOk ? "Địa chỉ gửi không khớp, sẽ bị bỏ qua"
          : r.strict && !i.authOk ? "Không qua xác thực người gửi, sẽ bị bỏ qua (tắt chế độ chặt nếu đây là email thật)"
          : "Người gửi hợp lệ";
        return `<div class="ap-ev">
          <div class="ap-top"><b>${i.amount ? "+" + fmt(i.amount) : "?"}</b><span class="tag ${cls}">${label}</span><span class="spacer"></span><span class="dim">${esc(i.date || "")}</span></div>
          <div class="ap-content">${esc(i.subject || "(không có tiêu đề)")}</div>
          <div class="ap-note">${esc(trust)}${i.codes.length ? " · mã nạp tìm thấy: " + esc(i.codes.join(", ")) : " · không thấy mã nạp NAPxxxxxxx"}</div>
          ${i.content ? `<div class="ap-note">Nội dung đọc được: ${esc(i.content)}</div>` : ""}
          ${i.why ? `<div class="ap-note">${esc(i.why)}</div>` : ""}
          <details class="ap-raw"><summary>Xem văn bản email</summary><div class="ap-note">${esc(i.snippet)}</div></details>
        </div>`;
      }).join("");
    } catch (e) { say(e.message, "bad"); }
  }));

  $("apClear").addEventListener("click", async () => {
    if (!(await confirmBox("Server sẽ quên hộp thư và mật khẩu ứng dụng, đồng thời tắt tự động cộng coin. Tiền vào sau đó phải duyệt tay.", { title: "Xoá cấu hình email?", ok: "Xoá", cancel: "Giữ lại", danger: true }))) return;
    try { render(await api("/admin/autopay/mail/clear", { method: "POST", body: "{}" })); $("apTestOut").innerHTML = ""; say("Đã xoá cấu hình email."); }
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
