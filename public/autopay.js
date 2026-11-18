/* Quản trị: tự động cộng coin khi nạp bằng cách server tự đọc email báo biến động số dư của ngân hàng qua Đăng nhập bằng Google.
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
    <p>Server tự đọc email báo biến động số dư mà ngân hàng gửi cho bạn qua "Đăng nhập bằng Google" (chỉ quyền xem email). Khi có tiền vào với nội dung chứa mã nạp (NAP + 7 ký tự), coin được cộng ngay vào ví người nạp. Không dùng dịch vụ bên thứ ba, không cần mật khẩu hay quyền gì trên tài khoản ngân hàng.</p>
    <label class="check"><input type="checkbox" id="apOn"> Bật tự động cộng coin</label>
    <p class="hint" id="apStat"></p>

    <details class="ls-src" id="apGuide">
      <summary>Cách cài đặt (làm một lần)</summary>
      <div class="ls-src-body">
        <p class="hint"><b>1.</b> Tạo một Gmail riêng chỉ để nhận thông báo ngân hàng (đừng dùng Gmail chính). Trong app ngân hàng, bật thông báo biến động số dư qua email và điền Gmail đó.</p>
        <p class="hint"><b>2.</b> Vào console.cloud.google.com bằng Gmail riêng đó, tạo một Project mới. Vào APIs &amp; Services &gt; Library, tìm "Gmail API" và bấm Enable.</p>
        <p class="hint"><b>3.</b> Vào màn hình đồng ý OAuth (OAuth consent screen / Google Auth Platform): chọn loại External, điền tên app và email của bạn, thêm quyền (scope) <b>gmail.readonly</b>, thêm Gmail riêng vào danh sách Test users. Sau đó bấm <b>Publish app</b> (chuyển sang In production). Nếu để ở Testing thì quyền đăng nhập chỉ sống 7 ngày. Google sẽ cảnh báo "app chưa xác minh", đó là app của chính bạn nên bấm Nâng cao rồi tiếp tục.</p>
        <p class="hint"><b>4.</b> Vào Credentials &gt; Create credentials &gt; OAuth client ID, loại <b>Web application</b>. Ở "Authorized redirect URIs" dán đúng địa chỉ ở ô "Redirect URI" bên dưới. Tạo xong, chép Client ID và Client Secret vào form.</p>
        <p class="hint"><b>5.</b> Điền thêm email hoặc tên miền ngân hàng gửi (xem ở mục "Từ" của một email thật, ví dụ mbbank.com.vn), bấm "Đăng nhập bằng Google", chọn Gmail riêng và cho phép xem email.</p>
        <p class="hint"><b>6.</b> Chuyển thử một khoản nhỏ, bấm "Thử đọc email gần nhất" để xem server đọc đúng số tiền chưa, rồi bật công tắc phía trên.</p>
        <p class="hint">Tên các mục trong Google Cloud đôi khi đổi, làm theo ý chính nếu thấy hơi khác. An toàn: server chỉ có quyền xem email, không gửi hay xoá được gì và không có quyền chuyển tiền. Token Google được mã hoá trong cơ sở dữ liệu, không bao giờ gửi về trình duyệt. Chỉ email từ đúng địa chỉ ngân hàng và qua được xác thực người gửi mới được tin. Khoản nhận lớn hơn lệnh nạp sẽ không tự cộng, để bạn xem lại.</p>
      </div>
    </details>

    <div class="field"><label for="apRedir">Redirect URI (dán vào Google Cloud)</label>
      <div class="row"><input type="text" id="apRedir" readonly><button type="button" id="apCopy">Chép</button></div></div>
    <div class="field"><label for="apCid">Client ID</label>
      <input type="text" id="apCid" placeholder="xxxx.apps.googleusercontent.com" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
    <div class="field"><label for="apSec">Client Secret</label>
      <input type="password" id="apSec" autocomplete="new-password" placeholder="GOCSPX-..."></div>
    <div class="field"><label for="apFrom">Email hoặc tên miền ngân hàng gửi</label>
      <input type="text" id="apFrom" placeholder="mbbank.com.vn" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
    <label class="check"><input type="checkbox" id="apStrict" checked> Chế độ chặt: chỉ tin email qua được xác thực người gửi (nên bật)</label>

    <div class="ap-actions">
      <button type="button" class="primary" id="apLogin">Đăng nhập bằng Google</button>
      <button type="button" id="apSave">Lưu cấu hình</button>
      <button type="button" id="apPoll">Kiểm tra ngay</button>
      <button type="button" id="apTest">Thử đọc email gần nhất</button>
      <button type="button" id="apDisc">Ngắt kết nối Google</button>
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
    if (!m.connected) return "Chưa đăng nhập Google.";
    const who = `Đã đăng nhập Google: ${m.email || "Gmail"}.`;
    if (!m.from) return `${who} Chưa khai báo email ngân hàng gửi.`;
    const s = m.status;
    if (!s) return `${who} Chưa kiểm tra.`;
    return `${who} ${s.ok ? "" : "Lỗi: "}${s.msg} (${fmtDate(s.at)})`;
  }

  function render(d) {
    $("apOn").checked = d.enabled;
    const m = d.mail;
    // Khong ghi de o dang go do khi render lai sau thao tac khac
    const keep = document.activeElement?.id;
    if (keep !== "apCid") $("apCid").value = m.clientId || "";
    if (keep !== "apFrom") $("apFrom").value = m.from || "";
    $("apRedir").value = m.redirectUri || "";
    $("apStrict").checked = m.strict;
    $("apSec").placeholder = m.hasSecret ? "Đã lưu. Bỏ trống để giữ nguyên" : "GOCSPX-...";
    $("apLogin").textContent = m.connected ? "Đăng nhập Google lại" : "Đăng nhập bằng Google";
    $("apDisc").hidden = !m.connected;
    $("apClear").hidden = !m.clientId && !m.hasSecret && !m.connected;
    $("apPoll").disabled = !m.ready;
    $("apTest").disabled = !m.ready;
    if (!m.connected) $("apGuide").open = true;

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

  const formBody = () => ({
    clientId: $("apCid").value.trim(),
    clientSecret: $("apSec").value.trim(),
    from: $("apFrom").value.trim(),
    strict: $("apStrict").checked,
  });

  $("apCopy").addEventListener("click", () => {
    $("apRedir").select();
    navigator.clipboard?.writeText($("apRedir").value).then(() => say("Đã chép Redirect URI."), () => say("Hãy chép tay ô Redirect URI.", "bad"));
  });

  $("apLogin").addEventListener("click", busy($("apLogin"), "Đang mở Google...", async () => {
    try {
      const r = await api("/admin/autopay/google/start", { method: "POST", body: JSON.stringify(formBody()) });
      location.href = r.url; // Google hoi quyen roi chuyen ve server, trang ket qua co nut ve trang quan tri
    } catch (e) { say(e.message, "bad"); }
  }));

  $("apSave").addEventListener("click", busy($("apSave"), "Đang lưu...", async () => {
    try {
      const d = await api("/admin/autopay/google", { method: "POST", body: JSON.stringify(formBody()) });
      $("apSec").value = "";
      render(d);
      say("Đã lưu cấu hình.");
    } catch (e) { say(e.message, "bad"); }
  }));

  $("apPoll").addEventListener("click", busy($("apPoll"), "Đang kiểm tra...", async () => {
    try {
      const d = await api("/admin/autopay/poll", { method: "POST", body: "{}" });
      render(d);
      const s = d.mail.status;
      say(s?.msg || "Đã kiểm tra.", s && s.ok ? "" : "bad");
    } catch (e) { say(e.message, "bad"); }
  }));

  $("apTest").addEventListener("click", busy($("apTest"), "Đang đọc...", async () => {
    const out = $("apTestOut");
    out.innerHTML = "";
    try {
      const r = await api("/admin/autopay/test", { method: "POST", body: "{}" });
      if (!r.items.length) {
        out.innerHTML = '<div class="ap-ev"><div class="ap-content">Gmail chưa có email nào từ địa chỉ ngân hàng này. Kiểm tra lại ô "Email hoặc tên miền ngân hàng gửi", hoặc chuyển thử một khoản nhỏ rồi thử lại.</div></div>';
        return;
      }
      const KIND = {
        credit: ["Hiểu là tiền vào", "ok"],
        other: ["Không phải tiền vào, sẽ bỏ qua", ""],
        unreadable: ["Giống tiền vào nhưng không đọc được số tiền", "off"],
      };
      out.innerHTML = `<p class="hint">Đây là ${r.items.length} email gần nhất từ ngân hàng và cách server hiểu (chưa cộng coin):</p>` + r.items.map((i) => {
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

  $("apDisc").addEventListener("click", async () => {
    if (!(await confirmBox("Server sẽ thu hồi quyền đọc Gmail và tắt tự động cộng coin. Client ID và Client Secret vẫn được giữ để bạn đăng nhập lại.", { title: "Ngắt kết nối Google?", ok: "Ngắt kết nối", cancel: "Giữ lại", danger: true }))) return;
    try { render(await api("/admin/autopay/disconnect", { method: "POST", body: "{}" })); $("apTestOut").innerHTML = ""; say("Đã ngắt kết nối Google."); }
    catch (e) { say(e.message, "bad"); }
  });

  $("apClear").addEventListener("click", async () => {
    if (!(await confirmBox("Server sẽ thu hồi quyền Gmail, quên Client ID, Client Secret và email ngân hàng, đồng thời tắt tự động cộng coin. Tiền vào sau đó phải duyệt tay.", { title: "Xoá cấu hình?", ok: "Xoá", cancel: "Giữ lại", danger: true }))) return;
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
