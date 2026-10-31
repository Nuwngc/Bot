/* Tab Cá nhân: liên kết email (mã xác thực gửi qua email), đổi mật khẩu; nhắc liên kết email;
   và ô cấu hình gửi email cho admin.
   Dùng các hàm có sẵn: $, api, say, esc, fmtDate, confirmBox, promptBox, showTab. */
(() => {
  let prof = null;
  let editing = false;     // đang nhập email mới dù đã có email liên kết
  let tick = null;
  const NOTICE_KEY = "mailNoticeHidden";
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  /* ================= Tab Cá nhân ================= */

  async function loadProfile() {
    try { prof = await api("/profile"); } catch (e) { return; }
    render();
    updateNotice();
  }

  function render() {
    if (!prof) return;
    $("pfName").textContent = prof.username;
    $("pfAvatar").textContent = prof.username.slice(0, 1).toUpperCase();
    $("pfSub").textContent = `${prof.role === "admin" ? "Quản trị viên" : "Thành viên"} · tham gia ${fmtDate(prof.createdAt)}`;

    const box = $("pfEmail");
    clearInterval(tick);
    if (prof.pending) {
      const p = prof.pending;
      box.innerHTML = `<div class="mail-card">
        <div class="mail-line"><span class="dim">Mã đã gửi tới</span> <b>${esc(p.email)}</b></div>
        <div class="field" style="margin-top:.8rem">
          <label for="pfCode">Nhập mã 6 số trong email</label>
          <input type="text" id="pfCode" class="code-input" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••">
        </div>
        <p class="hint" id="pfLeft"></p>
        <div class="row">
          <button class="primary" data-act="verify">Xác nhận</button>
          <button data-act="resend" id="pfResend">Gửi lại mã</button>
        </div>
        <p class="hint" style="margin-top:.7rem">Không thấy email? Kiểm tra thư mục Spam. <button type="button" class="link-btn" data-act="other">Dùng email khác</button></p>
      </div>`;
      let ttl = p.expiresIn, cd = prof.cooldown;
      const paint = () => {
        const left = $("pfLeft"), rs = $("pfResend");
        if (!left || !rs) return clearInterval(tick);
        left.textContent = ttl > 0 ? `Mã hết hạn sau ${mmss(ttl)}.` : "Mã đã hết hạn, hãy gửi lại mã mới.";
        rs.disabled = cd > 0;
        rs.textContent = cd > 0 ? `Gửi lại sau ${cd}s` : "Gửi lại mã";
        ttl = Math.max(0, ttl - 1); cd = Math.max(0, cd - 1);
      };
      paint();
      tick = setInterval(paint, 1000);
      $("pfCode").addEventListener("input", (e) => (e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6)));
      $("pfCode").addEventListener("keydown", (e) => { if (e.key === "Enter") box.querySelector('[data-act="verify"]').click(); });
    } else if (prof.email && !editing) {
      box.innerHTML = `<div class="mail-card ok">
        <div class="mail-line"><span class="verified"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12.4 2.6 2.6L16 9.6"/></svg>Đã xác thực</span> <b>${esc(prof.email)}</b></div>
        <p class="hint" style="margin:.5rem 0 .8rem">Bạn có thể dùng email này để lấy lại mật khẩu ở trang đăng nhập (mục "Quên mật khẩu").</p>
        <div class="row">
          <button data-act="change">Đổi email</button>
          <button class="danger" data-act="unlink">Gỡ liên kết</button>
        </div>
      </div>`;
    } else if (!prof.mailEnabled) {
      box.innerHTML = `<div class="mail-card off"><p class="hint" style="margin:0">Quản trị viên chưa bật gửi email nên bạn chưa liên kết được lúc này. Hãy nhắn quản trị viên bật tính năng này.</p></div>`;
    } else {
      box.innerHTML = `<div class="mail-card">
        <div class="field">
          <label for="pfMail">${prof.email ? "Email mới" : "Địa chỉ email"}</label>
          <input type="text" id="pfMail" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="vidu@gmail.com">
        </div>
        <div class="row">
          <button class="primary" data-act="send">Gửi mã xác thực</button>
          ${prof.email ? '<button data-act="cancel">Huỷ</button>' : ""}
        </div>
      </div>`;
      $("pfMail").addEventListener("keydown", (e) => { if (e.key === "Enter") box.querySelector('[data-act="send"]').click(); });
    }
  }

  async function sendCode(email, btn) {
    btn.disabled = true;
    try {
      const r = await api("/profile/email", { method: "POST", body: JSON.stringify({ email }) });
      say(`Đã gửi mã tới ${r.sentTo}.`);
      editing = false;
      await loadProfile();
      $("pfCode")?.focus();
    } catch (e) {
      say(e.message, "bad");
      btn.disabled = false;
    }
  }

  $("pfEmail").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === "send") return sendCode($("pfMail").value, b);
    if (act === "resend") return sendCode(prof.pending.email, b);
    if (act === "change") { editing = true; return render(); }
    if (act === "cancel") { editing = false; return render(); }
    if (act === "other") { prof.pending = null; editing = true; return render(); }
    if (act === "verify") {
      b.disabled = true;
      try {
        await api("/profile/email/verify", { method: "POST", body: JSON.stringify({ code: $("pfCode").value }) });
        say("Đã liên kết email. Từ giờ bạn có thể lấy lại mật khẩu bằng email này.");
        editing = false;
        await loadProfile();
      } catch (err) {
        say(err.message, "bad");
        b.disabled = false;
        $("pfCode")?.select();
      }
      return;
    }
    if (act === "unlink") {
      const pw = await promptBox("Nhập mật khẩu để gỡ liên kết. Sau đó bạn sẽ không lấy lại được tài khoản bằng email này.", {
        title: "Gỡ liên kết email?",
        ok: "Gỡ liên kết",
        type: "password",
        kind: "danger",
        placeholder: "Mật khẩu hiện tại",
      });
      if (pw === null) return;
      try {
        await api("/profile/email", { method: "DELETE", body: JSON.stringify({ password: pw }) });
        say("Đã gỡ liên kết email.");
        await loadProfile();
      } catch (err) { say(err.message, "bad"); }
    }
  });

  /* ---------- Đổi mật khẩu ---------- */

  $("pwSave").addEventListener("click", async () => {
    const cur = $("pwCur").value, n1 = $("pwNew").value, n2 = $("pwNew2").value;
    if (!cur) return say("Nhập mật khẩu hiện tại.", "bad");
    if (n1.length < 8) return say("Mật khẩu mới tối thiểu 8 ký tự.", "bad");
    if (n1 !== n2) return say("Hai lần nhập mật khẩu mới chưa giống nhau.", "bad");
    const btn = $("pwSave");
    btn.disabled = true;
    try {
      await api("/profile/password", { method: "POST", body: JSON.stringify({ current: cur, password: n1 }) });
      $("pwCur").value = $("pwNew").value = $("pwNew2").value = "";
      say("Đã đổi mật khẩu. Các thiết bị khác sẽ phải đăng nhập lại.");
    } catch (e) { say(e.message, "bad"); } finally { btn.disabled = false; }
  });

  /* ================= Nhắc liên kết email ================= */

  function updateNotice() {
    const n = $("mailNotice");
    if (!prof || sessionStorage.getItem(NOTICE_KEY) || current === "profile") { n.hidden = true; return; }
    const admin = prof.role === "admin";
    if (!prof.email && prof.mailEnabled) {
      $("mailNoticeText").textContent = "Liên kết email để lấy lại tài khoản khi quên mật khẩu.";
      $("mailNoticeGo").textContent = "Liên kết ngay";
      n.dataset.go = "profile";
      n.hidden = false;
    } else if (admin && !prof.mailEnabled) {
      $("mailNoticeText").textContent = "Chưa bật gửi email nên người dùng chưa thể tự lấy lại mật khẩu.";
      $("mailNoticeGo").textContent = "Cấu hình";
      n.dataset.go = "admin";
      n.hidden = false;
    } else {
      n.hidden = true;
    }
  }
  $("mailNoticeGo").addEventListener("click", () => {
    const go = $("mailNotice").dataset.go;
    showTab(go);
    if (go === "admin") setTimeout(() => $("mailBox").scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  });
  $("mailNoticeX").addEventListener("click", () => {
    sessionStorage.setItem(NOTICE_KEY, "1");
    $("mailNotice").hidden = true;
  });

  const baseShow = window.showTab;
  window.showTab = function (name) {
    baseShow(name);
    if (name === "profile") { editing = false; loadProfile(); } else updateNotice();
  };
  loadProfile();

  /* ================= Cấu hình gửi email (admin) ================= */

  const showMailGroups = () => {
    const p = $("mailProvider").value;
    $("mailCommon").hidden = !p;
    $("mailBrevo").hidden = p !== "brevo";
    $("mailSmtp").hidden = p !== "smtp";
  };
  $("mailProvider").addEventListener("change", showMailGroups);

  function fillMail(c) {
    $("mailProvider").value = ["brevo", "smtp"].includes(c.provider) ? c.provider : "";
    $("mailFrom").value = c.fromAddress || "";
    $("mailName").value = c.fromName || "";
    $("brevoKey").value = "";
    $("brevoKey").placeholder = c.hasBrevoKey ? "Đã lưu key. Dán key mới để thay" : "Dán API key Brevo";
    $("smtpHost").value = c.smtp.host || "";
    $("smtpPort").value = c.smtp.port || 587;
    $("smtpUser").value = c.smtp.user || "";
    $("smtpPass").value = "";
    $("smtpPass").placeholder = c.smtp.hasPass ? "Đã lưu mật khẩu. Nhập để thay" : "Mật khẩu hoặc mật khẩu ứng dụng";
    const st = $("mailState");
    st.textContent = c.enabled ? "Đang bật" : "Chưa bật";
    st.className = "tag " + (c.enabled ? "ok" : "off");
    $("mailFromEnv").hidden = !c.fromEnv;
    showMailGroups();
  }

  window.loadMailAdmin = async () => {
    $("mailBox").hidden = false;
    try { fillMail(await api("/admin/mail")); } catch (e) { /* admin mới thấy */ }
  };

  $("mailSave").addEventListener("click", async () => {
    try {
      const c = await api("/admin/mail", {
        method: "POST",
        body: JSON.stringify({
          provider: $("mailProvider").value,
          fromAddress: $("mailFrom").value,
          fromName: $("mailName").value,
          brevoKey: $("brevoKey").value.trim(),
          smtp: { host: $("smtpHost").value, port: $("smtpPort").value, user: $("smtpUser").value, pass: $("smtpPass").value },
        }),
      });
      fillMail(c);
      say(c.enabled ? "Đã lưu. Gửi email đang bật." : "Đã lưu, nhưng cấu hình chưa đủ để gửi (thiếu email người gửi hoặc khoá).", c.enabled ? "good" : "bad");
      loadProfile();
    } catch (e) { say(e.message, "bad"); }
  });

  $("mailTest").addEventListener("click", async () => {
    const btn = $("mailTest");
    btn.disabled = true;
    try {
      await api("/admin/mail/test", { method: "POST", body: JSON.stringify({ to: $("mailTo").value }) });
      say("Đã gửi email thử. Hãy kiểm tra hộp thư (cả mục Spam).");
    } catch (e) { say(e.message, "bad"); } finally { btn.disabled = false; }
  });
})();
