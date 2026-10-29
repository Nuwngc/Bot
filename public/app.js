const $ = (id) => document.getElementById(id);
const note = $("note");

let isAdmin = false;

function say(text, kind = "good") {
  clearTimeout(say._t);
  clearTimeout(say._t2);
  note.className = "note " + kind;
  note.textContent = text;
  say._t = setTimeout(hideNote, 5000);
}

/** Thông báo trượt xuống rồi mất; bấm vào thông báo cũng đóng được */
function hideNote() {
  clearTimeout(say._t);
  if (!note.textContent) return;
  note.classList.add("out");
  say._t2 = setTimeout(() => {
    note.className = "note";
    note.textContent = "";
  }, 220);
}
note.addEventListener("click", hideNote);
note.setAttribute("role", "status");
note.setAttribute("aria-live", "polite");

async function api(path, opts = {}) {
  const r = await fetch("/api" + path, {
    headers: { "content-type": "application/json" },
    ...opts,
  });
  if (r.status === 401) {
    location.href = "/login.html";
    throw new Error("Phiên đăng nhập đã hết");
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Có lỗi xảy ra");
  return d;
}

/* ---------- Nạp thông tin ---------- */

async function loadMe() {
  const me = await api("/me");
  $("who").textContent = me.username;
  isAdmin = me.role === "admin";
  $("adminBox").hidden = !isAdmin;
  $("tabAdminBtn").hidden = !isAdmin;
  applySections(me.sections);

  $("aiModel").value = me.settings.aiModel;
  $("aiSystem").value = me.settings.aiSystem;


  if (me.showAiKeyField) {
    $("aiKeyBox").hidden = false;
    $("aiManagedNote").hidden = true;
    $("aikey").placeholder = me.hasAiKey ? me.aiKeyMasked : "sk-ant-...";
  } else {
    $("aiKeyBox").hidden = true;
    $("aiManagedNote").hidden = false;
  }

  loadBilling();
  if (isAdmin) {
    loadUsers();
    $("ordersBox").hidden = false;
    $("sectionsBox").hidden = false;
    $("settingsBox").hidden = false;
    loadOrders();
    loadGlobalSettings();
    loadPricing();
    if (typeof loadWalletAdmin === "function") loadWalletAdmin();
  }
}

/** Ẩn tab Facebook / Zalo nếu admin đã ẩn (chỉ ẩn với người dùng thường) */
function applySections(sec) {
  sec = sec || { fb: true, zalo: true };
  for (const name of ["fb", "zalo"]) {
    const b = document.querySelector(`#tabs button[data-tab="${name}"]`);
    if (b) b.hidden = !sec[name];
  }
  // Đang đứng ở tab vừa bị ẩn thì chuyển sang tab còn lại
  if (typeof showTab === "function") showTab(current);
}

function fmtDate(s) {
  const d = new Date(s.replace(" ", "T") + "Z");
  return d.toLocaleDateString("vi-VN") + " " + d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

const vnd = (n) => n.toLocaleString("vi-VN") + "đ";
const coin = (n) => Number(n || 0).toLocaleString("vi-VN") + " coin";

/* ---------- Thanh toán ---------- */

const PRODUCT_NAMES = { fb: "Facebook", zalo: "Zalo" };
let billingData = null;

function expiryLine(st) {
  if (st.unlimited) return "Không giới hạn (quản trị)";
  if (st.active) return `Còn ${st.daysLeft} ngày · hết hạn ${fmtDate(st.expires)}`;
  if (st.expires) return `Đã hết hạn từ ${fmtDate(st.expires)}`;
  return "Chưa thanh toán";
}

async function loadBilling() {
  const b = await api("/billing");
  billingData = b;

  $("billBots").innerHTML = b.bots.length
    ? b.bots
        .map(
          (x) => `<div class="user">
      <span class="name">${esc(x.name)}</span>
      <span class="tag">${PRODUCT_NAMES[x.product]}</span>
      <span class="tag ${x.active ? "ok" : "off"}">${esc(expiryLine(x))}</span>
      <span class="spacer"></span>
      ${b.unlimited ? "" : `<button data-goto="${x.product}" data-id="${x.id}">${x.active ? "Gia hạn" : "Thanh toán"}</button>`}
    </div>`
        )
        .join("")
    : '<div class="empty">Chưa có bot nào. Tạo bot ở tab Facebook hoặc Zalo.</div>';

  const pending = b.orders.filter((o) => o.status === "pending");
  $("orderBox").innerHTML = pending.length
    ? `<h2>Đơn chờ thanh toán</h2>${pending.map((o) => orderCard(o, b.bank)).join("")}`
    : "";

  const done = b.orders.filter((o) => o.status !== "pending");
  $("orderHistory").innerHTML = done.length
    ? `<h3>Lịch sử đơn</h3><div class="users">${done
        .map(
          (o) =>
            `<div class="user"><span class="name">${o.code}</span>
             <span class="tag">${PRODUCT_NAMES[o.product] || "Facebook"}${o.bot_name ? " · " + esc(o.bot_name) : ""}</span>
             <span class="tag">${vnd(o.amount)}${o.coupon ? " · mã " + esc(o.coupon) : ""}</span>
             <span class="tag">${o.status === "paid" ? "đã thanh toán" : "đã huỷ"}</span></div>`
        )
        .join("")}</div>`
    : "";

  if (typeof onBillingLoaded === "function") onBillingLoaded();
}

function orderCard(o, bank) {
  const qr = o.qr
    ? `<img src="${o.qr}" alt="Mã QR chuyển khoản" style="width:100%;max-width:15rem;border-radius:8px;margin:0.75rem 0">`
    : `<p style="color:var(--alert);font-size:0.85rem">Quản trị viên chưa khai báo tài khoản ngân hàng. Liên hệ trực tiếp để thanh toán.</p>`;
  const disc = o.discount ? ` <span class="dim">(đã giảm ${vnd(o.discount)}${o.coupon ? " với mã " + esc(o.coupon) : ""})</span>` : "";

  return `<div class="state order-card">
    <div style="font-size:0.85rem;color:var(--dim)">Đơn chờ thanh toán · Bot ${PRODUCT_NAMES[o.product] || "Facebook"}${o.bot_name ? " · " + esc(o.bot_name) : ""}</div>
    <div class="state-word" style="font-size:1.15rem">${vnd(o.amount)} · ${o.days} ngày</div>${disc}
    ${qr}
    <div style="font-size:0.9rem;line-height:1.8">
      ${bank.account ? `Ngân hàng: ${esc(bank.id)}<br>Số tài khoản: ${esc(bank.account)}<br>Chủ tài khoản: ${esc(bank.owner || "")}<br>` : ""}
      Nội dung chuyển khoản: <strong>${o.code}</strong>
    </div>
    ${bank.note ? `<p style="font-size:0.85rem;color:var(--dim);margin-top:0.5rem">${esc(bank.note)}</p>` : ""}
    <p style="font-size:0.85rem;color:var(--dim)">Ghi đúng nội dung để được duyệt. Thời hạn được cộng cho bot này sau khi quản trị viên xác nhận.</p>
    <button class="danger" data-cancel="${o.id}">Huỷ đơn</button>
  </div>`;
}

async function cancelOrder(id) {
  const yes = await confirmBox("Đơn này sẽ bị huỷ.", { title: "Huỷ đơn?", ok: "Huỷ đơn", cancel: "Giữ lại", danger: true });
  if (!yes) return;
  try {
    await api(`/billing/cancel/${id}`, { method: "POST" });
    say("Đã huỷ đơn.");
    await loadBilling();
  } catch (e) {
    say(e.message, "bad");
  }
}

$("orderBox").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-cancel]");
  if (b) cancelOrder(b.dataset.cancel);
});

$("billBots").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-goto]");
  if (b && typeof openBot === "function") openBot(b.dataset.goto, Number(b.dataset.id));
});

function esc(s) {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
}

function fmtTime(sec) {
  if (sec < 60) return sec + " giây";
  if (sec < 3600) return Math.floor(sec / 60) + " phút";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m ? `${h} giờ ${m} phút` : `${h} giờ`;
}

/* ---------- Hành động ---------- */

$("btnSaveKey").onclick = async () => {
  await api("/aikey", { method: "POST", body: JSON.stringify({ key: $("aikey").value.trim() }) });
  $("aikey").value = "";
  say("Đã lưu khoá.");
  loadMe();
};

$("btnSaveSettings").onclick = async () => {
  try {
    await api("/settings", {
      method: "POST",
      body: JSON.stringify({ aiModel: $("aiModel").value, aiSystem: $("aiSystem").value }),
    });
    say("Đã lưu. Tắt rồi bật lại bot FB để áp dụng.");
  } catch (e) {
    say(e.message, "bad");
  }
};

$("logout").onclick = async (e) => {
  e.preventDefault();
  await api("/logout", { method: "POST" });
  location.href = "/login.html";
};

/* ---------- Admin ---------- */

async function showUserBots(userId) {
  const box = $("ub-" + userId);
  const { bots } = await api(`/admin/users/${userId}/bots`);
  box.innerHTML = bots.length
    ? bots
        .map(
          (x) => `<div class="user sub">
        <span class="name">${esc(x.name)}</span>
        <span class="tag">${PRODUCT_NAMES[x.product]}</span>
        <span class="tag ${x.active ? "ok" : "off"}">${esc(expiryLine(x))}</span>
        ${x.locked ? '<span class="tag off">đang khoá</span>' : ""}
        <span class="spacer"></span>
        <button data-act="ext" data-id="${userId}" data-product="${x.product}" data-bot="${x.id}" data-name="${esc(x.name)}">+ ngày</button>
        <button data-act="lockbot" data-id="${userId}" data-product="${x.product}" data-bot="${x.id}" data-on="${x.locked ? 0 : 1}">${x.locked ? "Mở khoá" : "Khoá"}</button>
        ${x.running ? `<button class="danger" data-act="stopbot" data-id="${userId}" data-product="${x.product}" data-bot="${x.id}">Dừng</button>` : ""}
      </div>`
        )
        .join("")
    : '<div class="empty">Tài khoản này chưa tạo bot nào.</div>';
  box.hidden = false;
}


async function loadUsers() {
  const { users } = await api("/admin/users");
  $("users").innerHTML = users
    .map(
      (u) => `
    <div class="user ${u.active ? "" : "off"}">
      <span class="name">${esc(u.username)}</span>
      ${u.role === "admin" ? '<span class="tag">quản trị</span>' : ""}
      ${u.bots.fbTotal ? `<span class="tag">FB ${u.bots.fbRunning}/${u.bots.fbTotal}</span>` : ""}
      ${u.bots.zaloTotal ? `<span class="tag">Zalo ${u.bots.zaloRunning}/${u.bots.zaloTotal}</span>` : ""}
      ${u.bots.fbTotal ? `<span class="tag">FB đã trả ${u.bots.fbPaid}/${u.bots.fbTotal}</span>` : ""}
      ${u.bots.zaloTotal ? `<span class="tag">Zalo đã trả ${u.bots.zaloPaid}/${u.bots.zaloTotal}</span>` : ""}
      <span class="spacer"></span>
      <button data-act="bots" data-id="${u.id}">Bot & hạn</button>
      <button data-act="pw" data-id="${u.id}">Đổi mật khẩu</button>
      <button data-act="toggle" data-id="${u.id}" data-active="${u.active ? 0 : 1}">${
        u.active ? "Khoá" : "Mở"
      }</button>
      <button class="danger" data-act="del" data-id="${u.id}" data-name="${esc(u.username)}">Xoá</button>
    </div>
    <div class="user-bots" id="ub-${u.id}" hidden></div>`
    )
    .join("");
}

$("users").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const id = b.dataset.id;
  try {
    if (b.dataset.act === "bots") {
      const box = $("ub-" + id);
      if (!box.hidden) {
        box.hidden = true;
        return;
      }
      await showUserBots(id);
      return;
    }
    if (b.dataset.act === "ext") {
      const d = await promptBox(`Cộng thêm bao nhiêu ngày cho bot "${b.dataset.name}"? Nhập số âm để trừ ngày.`, {
        title: "Gia hạn bot",
        value: "30",
        ok: "Áp dụng",
        validate: (v) => (Number.isFinite(Number(v)) && Number(v) !== 0 ? "" : "Nhập số ngày khác 0, ví dụ 30 hoặc -7."),
      });
      if (d === null) return;
      const r = await api(`/admin/bots/${b.dataset.product}/${b.dataset.bot}/extend`, {
        method: "POST",
        body: JSON.stringify({ days: Number(d) }),
      });
      say(`Bot "${b.dataset.name}" hết hạn ${fmtDate(r.expires)}.`);
      await showUserBots(id);
      return;
    }
    if (b.dataset.act === "lockbot") {
      await api(`/admin/bots/${b.dataset.product}/${b.dataset.bot}/flags`, {
        method: "POST",
        body: JSON.stringify({ locked: Number(b.dataset.on) }),
      });
      await showUserBots(id);
      return;
    }
    if (b.dataset.act === "stopbot") {
      await api(`/admin/bots/${b.dataset.product}/${b.dataset.bot}/stop`, { method: "POST" });
      say("Đã tắt bot.");
      await showUserBots(id);
      return;
    }
    if (b.dataset.act === "pw") {
      const p = await promptBox("Nhập mật khẩu mới cho tài khoản này.", {
        title: "Đổi mật khẩu",
        ok: "Đổi mật khẩu",
        placeholder: "Tối thiểu 8 ký tự",
        validate: (v) => (v.length >= 8 ? "" : "Mật khẩu tối thiểu 8 ký tự."),
      });
      if (p === null) return;
      await api(`/admin/users/${id}/password`, { method: "POST", body: JSON.stringify({ password: p }) });
      say("Đã đổi mật khẩu.");
    }
    if (b.dataset.act === "toggle") {
      await api(`/admin/users/${id}/active`, {
        method: "POST",
        body: JSON.stringify({ active: Number(b.dataset.active) }),
      });
    }
    if (b.dataset.act === "del") {
      const yes = await confirmBox(`Tài khoản "${b.dataset.name}" và toàn bộ bot của họ sẽ bị xoá. Không khôi phục được.`, {
        title: "Xoá tài khoản?",
        ok: "Xoá tài khoản",
        danger: true,
      });
      if (!yes) return;
      await api(`/admin/users/${id}`, { method: "DELETE" });
      say("Đã xoá tài khoản.");
    }
    loadUsers();
  } catch (err) {
    say(err.message, "bad");
  }
});

$("btnAddUser").onclick = async () => {
  try {
    await api("/admin/users", {
      method: "POST",
      body: JSON.stringify({
        username: $("nu").value,
        password: $("np").value,
        role: $("nr").checked ? "admin" : "user",
      }),
    });
    say(`Đã tạo tài khoản ${$("nu").value}.`);
    $("nu").value = "";
    $("np").value = "";
    $("nr").checked = false;
    loadUsers();
  } catch (e) {
    say(e.message, "bad");
  }
};

/* ---------- Khởi động ---------- */

loadMe().catch((e) => say(e.message, "bad"));

/* ---------- Admin: đơn thuê bot ---------- */

async function loadOrders() {
  const { orders } = await api("/admin/orders");
  $("orders").innerHTML = orders.length
    ? orders
        .map(
          (o) => `
    <div class="user">
      <span class="name">${o.code}</span>
      <span class="tag">${esc(o.username)}</span>
      <span class="tag">${PRODUCT_NAMES[o.product] || "Facebook"}${o.bot_name ? " · " + esc(o.bot_name) : ""}</span>
      ${o.coupon ? `<span class="tag">mã ${esc(o.coupon)}</span>` : ""}
      <span class="tag">${vnd(o.amount)} · ${o.days}n</span>
      <span class="tag">${
        o.status === "pending" ? "chờ" : o.status === "paid" ? "đã thu" : "huỷ"
      }</span>
      <span class="spacer"></span>
      ${
        o.status === "pending"
          ? `<button data-ord="approve" data-id="${o.id}">Xác nhận</button>
             <button class="danger" data-ord="cancel" data-id="${o.id}">Huỷ</button>`
          : ""
      }
    </div>`
        )
        .join("")
    : '<p style="color:var(--dim);font-size:0.85rem">Chưa có đơn nào.</p>';
}

$("orders").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-ord]");
  if (!b) return;
  try {
    if (b.dataset.ord === "approve") {
      const yes = await confirmBox("Hạn dùng của bot sẽ được cộng ngay khi bạn xác nhận.", {
        title: "Đã nhận được tiền của đơn này?",
        ok: "Đã nhận tiền",
        cancel: "Chưa",
        kind: "ok",
      });
      if (!yes) return;
      const d = await api(`/admin/orders/${b.dataset.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ note: "" }),
      });
      say(`Đã xác nhận. Bot "${d.botName || ""}" hết hạn ${fmtDate(d.expires)}.`);
    } else {
      await api(`/admin/orders/${b.dataset.id}/cancel`, { method: "POST" });
      say("Đã huỷ đơn.");
    }
    loadOrders();
    loadUsers();
  } catch (err) {
    say(err.message, "bad");
  }
});

/* ---------- Admin: ẩn mục Facebook / Zalo ---------- */

const SECTIONS = { fb: "Facebook", zalo: "Zalo" };

/** Mỗi mục một dòng: tên + trạng thái + nút (Ẩn khi đang hiện, Hiện lại khi đã ẩn) */
function renderSections(s) {
  $("sectionRows").innerHTML = Object.entries(SECTIONS)
    .map(([name, label]) => {
      const hidden = s["hide_" + name] === "1";
      return `<div class="user ${hidden ? "off" : ""}">
        <span class="name">${label}</span>
        <span class="tag ${hidden ? "off" : "ok"}">${hidden ? "Đã ẩn" : "Đang hiện"}</span>
        <span class="spacer"></span>
        <button class="${hidden ? "primary" : "danger"}" data-sec="${name}" data-hidden="${hidden ? 1 : 0}">${
          hidden ? "Hiện lại" : "Ẩn"
        }</button>
      </div>`;
    })
    .join("");
}

$("sectionRows").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-sec]");
  if (!b || b.disabled) return;
  const name = b.dataset.sec;
  const willHide = b.dataset.hidden !== "1";
  b.disabled = true;
  try {
    const d = await api("/admin/settings", {
      method: "POST",
      body: JSON.stringify({ ["hide_" + name]: willHide ? "1" : "0" }),
    });
    renderSections(d.settings); // đổi nút ngay theo trạng thái server vừa lưu
    say(willHide ? `Đã ẩn mục ${SECTIONS[name]} với mọi người dùng.` : `Đã hiện lại mục ${SECTIONS[name]}.`);
  } catch (err) {
    b.disabled = false;
    say(err.message, "bad");
  }
});

/* ---------- Admin: cấu hình chung ---------- */

async function loadGlobalSettings() {
  const d = await api("/admin/settings");
  const s = d.settings;
  renderSections(s);
  $("signupOpen").checked = s.signup_open === "1";
  $("trialDays").value = s.trial_days;
  $("bankId").value = s.bank_id;
  $("bankAccount").value = s.bank_account;
  $("bankOwner").value = s.bank_owner;
  $("payNote").value = s.pay_note;
  $("globalAiModel").value = s.global_ai_model || "";
  $("globalAiSystem").value = s.global_ai_system || "";
  $("globalAiKey").placeholder = d.hasGlobalAiKey ? d.globalAiKeyMasked : "sk-ant-...";
}


$("btnSaveGlobal").onclick = async () => {
  try {
    await api("/admin/settings", {
      method: "POST",
      body: JSON.stringify({
        signup_open: $("signupOpen").checked ? "1" : "0",
        trial_days: $("trialDays").value,
        bank_id: $("bankId").value.trim(),
        bank_account: $("bankAccount").value.trim(),
        bank_owner: $("bankOwner").value.trim(),
        pay_note: $("payNote").value.trim(),
        global_ai_model: $("globalAiModel").value.trim(),
        global_ai_system: $("globalAiSystem").value.trim(),
        globalAiKey: $("globalAiKey").value.trim(),
      }),
    });
    $("globalAiKey").value = "";
    say("Đã lưu cấu hình.");
    loadGlobalSettings();
    loadBilling();
  } catch (e) {
    say(e.message, "bad");
  }
};


/* ---------- Admin: bảng giá ---------- */

let planDraft = [];

function planRow(p, i) {
  return `<div class="plan-row" data-i="${i}">
    <input type="text" data-f="name" value="${esc(p.name)}" placeholder="Tên gói" maxlength="30">
    <input type="text" inputmode="numeric" data-f="days" value="${p.days}" placeholder="Ngày">
    <input type="text" inputmode="numeric" data-f="fb" value="${p.fb}" placeholder="Giá FB">
    <input type="text" inputmode="numeric" data-f="zalo" value="${p.zalo}" placeholder="Giá Zalo">
    <button class="danger" data-del="${i}" title="Xoá gói">✕</button>
  </div>`;
}

function renderPlanRows() {
  $("planRows").innerHTML =
    `<div class="plan-row head"><span>Tên gói</span><span>Số ngày</span><span>Giá FB</span><span>Giá Zalo</span><span></span></div>` +
    planDraft.map(planRow).join("");
}

function readPlanRows() {
  for (const row of $("planRows").querySelectorAll(".plan-row[data-i]")) {
    const p = planDraft[Number(row.dataset.i)];
    for (const inp of row.querySelectorAll("input")) {
      const v = inp.value.trim();
      p[inp.dataset.f] = inp.dataset.f === "name" ? v : Number(v.replace(/[^0-9]/g, "")) || 0;
    }
  }
}

async function loadPricing() {
  const d = await api("/admin/pricing");
  planDraft = d.plans.map((p) => ({ ...p }));
  renderPlanRows();
  renderCoupons(d.coupons);
}

$("planRows").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-del]");
  if (!b) return;
  readPlanRows();
  planDraft.splice(Number(b.dataset.del), 1);
  renderPlanRows();
});

$("btnAddPlan").onclick = () => {
  readPlanRows();
  planDraft.push({ name: "", days: 30, fb: 0, zalo: 0 });
  renderPlanRows();
};

$("btnSavePlans").onclick = async () => {
  readPlanRows();
  try {
    await api("/admin/plans", { method: "POST", body: JSON.stringify({ plans: planDraft }) });
    say("Đã lưu bảng giá.");
    loadPricing();
    loadBilling();
  } catch (e) {
    say(e.message, "bad");
  }
};

/* ---------- Admin: mã giảm giá ---------- */

function renderCoupons(list) {
  $("coupons").innerHTML = list.length
    ? list
        .map(
          (c) => `<div class="user ${c.active ? "" : "off"}">
      <span class="name">${esc(c.code)}</span>
      <span class="tag">${c.kind === "percent" ? "-" + c.value + "%" : "-" + vnd(c.value)}</span>
      <span class="tag">${c.product === "all" ? "mọi bot" : PRODUCT_NAMES[c.product]}</span>
      <span class="tag">đã dùng ${c.used}/${c.max_uses || "∞"}</span>
      ${c.expires_at ? `<span class="tag">HSD ${fmtDate(c.expires_at)}</span>` : ""}
      ${c.once_per_user ? "" : '<span class="tag">dùng nhiều lần</span>'}
      <span class="spacer"></span>
      <button data-cp="toggle" data-id="${c.id}" data-active="${c.active ? 0 : 1}">${c.active ? "Tắt" : "Bật"}</button>
      <button class="danger" data-cp="del" data-id="${c.id}" data-code="${esc(c.code)}">Xoá</button>
    </div>`
        )
        .join("")
    : '<div class="empty">Chưa có mã nào.</div>';
}

$("btnAddCoupon").onclick = async () => {
  try {
    await api("/admin/coupons", {
      method: "POST",
      body: JSON.stringify({
        code: $("cpCode").value.replace(/\s+/g, ""),
        kind: $("cpKind").value,
        value: $("cpValue").value,
        product: $("cpProduct").value,
        maxUses: $("cpMax").value,
        expiresAt: $("cpExpires").value,
        oncePerUser: $("cpOnce").checked,
      }),
    });
    say(`Đã tạo mã ${$("cpCode").value.toUpperCase()}.`);
    $("cpCode").value = "";
    $("cpValue").value = "";
    loadPricing();
  } catch (e) {
    say(e.message, "bad");
  }
};

$("coupons").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-cp]");
  if (!b) return;
  try {
    if (b.dataset.cp === "toggle") {
      await api(`/admin/coupons/${b.dataset.id}/active`, {
        method: "POST",
        body: JSON.stringify({ active: b.dataset.active === "1" }),
      });
    } else {
      const yes = await confirmBox("Các đơn đã dùng mã này vẫn giữ nguyên.", {
        title: `Xoá mã ${b.dataset.code}?`,
        ok: "Xoá mã",
        danger: true,
      });
      if (!yes) return;
      await api(`/admin/coupons/${b.dataset.id}`, { method: "DELETE" });
    }
    loadPricing();
  } catch (err) {
    say(err.message, "bad");
  }
});


/* ---------- Số người online / bot đang chạy ---------- */

function setLive(id, value) {
  const b = $(id);
  if (b.textContent === String(value)) return;
  const first = b.dataset.init !== "1";
  b.textContent = value;
  b.dataset.init = "1";
  if (!first) {
    b.classList.remove("bump");
    void b.offsetWidth;
    b.classList.add("bump");
  }
}

async function loadStats() {
  try {
    const d = await api("/stats");
    setLive("liveOnline", d.online);
    setLive("liveBots", d.botsRunning);
    const parts = [];
    if (d.fb !== null) parts.push(`Facebook ${d.fb}`);
    if (d.zalo !== null) parts.push(`Zalo ${d.zalo}`);
    $("liveBotsChip").title = parts.join(" · ");
    $("live").hidden = false;
  } catch (_) {
    /* mất mạng một lúc thì thôi, lần sau tự cập nhật lại */
  }
}

loadStats();
// Mỗi lần gọi là một "nhịp online": chỉ gọi khi đang xem trang, tab bị ẩn thì ngừng
setInterval(() => { if (!document.hidden) loadStats(); }, 20000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadStats(); });
