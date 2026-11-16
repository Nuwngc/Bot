/* Quản trị: bật/tắt tự động cộng coin khi nạp, lấy link webhook + mã bí mật, xem giao dịch ngân hàng gần đây
   và gán tay những khoản chuyển sai nội dung. Dùng các hàm có sẵn: $, api, say, esc, fmtDate, confirmBox. */
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
    <p>Dùng dịch vụ báo biến động số dư ngân hàng (SePay hoặc Casso, đều có gói miễn phí). Khi tiền vào tài khoản với nội dung chứa mã nạp (NAP + 7 ký tự), coin được cộng ngay vào ví người nạp, bạn không cần bấm xác nhận. Số coin bằng số tiền thực nhận.</p>
    <label class="check"><input type="checkbox" id="apOn"> Bật tự động cộng coin</label>
    <p class="hint" id="apStat"></p>

    <details class="ls-src" id="apGuide">
      <summary>Cách cài đặt (làm một lần)</summary>
      <div class="ls-src-body">
        <p class="hint"><b>1.</b> Đăng ký my.sepay.vn (hoặc my.casso.vn), liên kết đúng tài khoản ngân hàng mà bạn đã khai báo ở phần Ngân hàng phía trên.</p>
        <p class="hint"><b>2. SePay:</b> vào WebHooks, chọn Thêm webhooks. "Gọi đến URL" dán link webhook bên dưới. Kiểu chứng thực chọn API Key và dán mã bí mật. Request Content type chọn application/json. Sự kiện chọn tiền vào.</p>
        <p class="hint"><b>2. Casso:</b> vào Cài đặt, Tích hợp, tạo Webhook. Dán link webhook bên dưới, phần Khoá bảo mật (Security Key) dán mã bí mật.</p>
        <p class="hint"><b>3.</b> Bật công tắc phía trên, rồi tự thử: tạo một lệnh nạp nhỏ ở tab Nạp tiền và chuyển khoản đúng nội dung. Coin phải vào ví sau chừng một phút. Nếu không thấy, xem danh sách giao dịch bên dưới.</p>
      </div>
    </details>

    <div class="field"><label for="apUrl">Link webhook</label>
      <div class="row"><input type="text" id="apUrl" readonly><button type="button" data-copy="apUrl">Sao chép</button></div></div>
    <div class="field"><label for="apSecret">Mã bí mật (API Key / Security Key)</label>
      <div class="row"><input type="text" id="apSecret" readonly><button type="button" data-copy="apSecret">Sao chép</button></div></div>
    <button type="button" class="danger" id="apNew">Tạo mã bí mật mới</button>

    <h3>Giao dịch ngân hàng gần đây</h3>
    <p class="hint">Khoản chưa khớp là tiền vào nhưng không có mã nạp hợp lệ (người dùng ghi sai nội dung). Gán cho đúng tài khoản để cộng coin, hoặc bỏ qua nếu không phải tiền nạp.</p>
    <div id="apEvents"></div>`;
  anchor.before(box);

  async function copy(id, btn) {
    const el = $(id);
    try { await navigator.clipboard.writeText(el.value); }
    catch (_) { el.select(); document.execCommand("copy"); }
    const t = btn.textContent;
    btn.textContent = "Đã chép";
    setTimeout(() => (btn.textContent = t), 1200);
  }

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

  function render(d) {
    $("apOn").checked = d.enabled;
    $("apUrl").value = d.url;
    $("apSecret").value = d.secret;
    const bits = [`Hôm nay: ${fmt(d.today.n)} giao dịch tự cộng, tổng ${fmt(d.today.sum)} coin.`];
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

  $("apOn").addEventListener("change", async () => {
    try {
      render(await api("/admin/autopay", { method: "POST", body: JSON.stringify({ enabled: $("apOn").checked }) }));
      say($("apOn").checked ? "Đã bật tự động cộng coin." : "Đã tắt tự động cộng coin. Tiền vào sẽ được ghi lại để bạn gán tay.");
    } catch (e) { say(e.message, "bad"); load(); }
  });

  $("apNew").addEventListener("click", async () => {
    if (!(await confirmBox("Mã cũ sẽ ngừng dùng được ngay. Bạn phải dán mã mới vào SePay hoặc Casso, nếu không tiền vào sẽ không được cộng tự động.", { title: "Tạo mã bí mật mới?", ok: "Tạo mã mới", cancel: "Giữ mã cũ", danger: true }))) return;
    try { render(await api("/admin/autopay/secret", { method: "POST", body: "{}" })); say("Đã tạo mã mới. Nhớ cập nhật vào SePay hoặc Casso."); }
    catch (e) { say(e.message, "bad"); }
  });

  box.addEventListener("click", async (e) => {
    const c = e.target.closest("button[data-copy]");
    if (c) return copy(c.dataset.copy, c);
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
