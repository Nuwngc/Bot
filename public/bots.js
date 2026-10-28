/* Tab Facebook / Zalo: nhieu bot moi loai. Dung $, api, say, esc, fmtTime tu app.js */

const WORDS = {
  stopped: "Đã dừng",
  starting: "Đang kết nối",
  running: "Đang chạy",
  stopping: "Đang tắt",
  error: "Lỗi",
};
const lampOf = (s) => (s === "stopping" ? "starting" : s);
const isOn = (s) => s === "running" || s === "starting" || s === "stopping";

function renderLog(box, logs) {
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.innerHTML = logs.length
    ? logs
        .map((l) => `<div><span class="t">${l.t.slice(11, 19)}</span><span class="${l.level}">${esc(l.text)}</span></div>`)
        .join("")
    : '<div class="empty">Chưa có gì.</div>';
  if (atBottom) box.scrollTop = box.scrollHeight;
}

/**
 * Tao bo dieu khien cho mot loai bot.
 * cfg: { k: tien to id trong HTML, base: duong dan API, kind: ten hien thi,
 *        sub(bot), fill(bot), settings() }
 */
function makePanel(cfg) {
  const el = (s) => $(cfg.k + s);
  const st = { bots: [], sel: null, filledFor: null };

  const selected = () => st.bots.find((b) => b.id === st.sel) || null;

  function renderList(d) {
    const lim = d.limit == null ? "không giới hạn" : `${d.bots.length}/${d.limit}`;
    el("Slots").textContent = `Đã tạo ${lim} bot · Server: ${d.slots.running}/${d.slots.max} bot đang chạy`;
    el("Add").disabled = d.limit != null && d.bots.length >= d.limit;

    if (!d.bots.length) {
      el("List").innerHTML = '<div class="empty">Chưa có bot nào. Bấm “+ Thêm bot” để tạo.</div>';
      return;
    }
    el("List").innerHTML = d.bots
      .map(
        (b) => `
      <div class="bot-card${b.id === st.sel ? " sel" : ""}" data-id="${b.id}">
        <span class="lamp ${lampOf(b.status)}"></span>
        <div class="bot-main">
          <div class="bot-name">${esc(b.name)}</div>
          <div class="bot-sub">${esc(WORDS[b.status] || b.status)}${cfg.sub(b) ? " · " + esc(cfg.sub(b)) : ""}${b.locked ? " · 🔒 đã khoá" : ""}</div>
          ${b.plan.unlimited ? "" : `<div class="bot-exp ${b.plan.active ? "" : "bad"}">${esc(expiryLine(b.plan))}${b.pendingOrder ? " · có đơn chờ thanh toán" : ""}</div>`}
        </div>
        <button data-act="${isOn(b.status) ? "stop" : "start"}" data-id="${b.id}" ${b.status === "stopping" || b.locked ? "disabled" : ""}>
          ${isOn(b.status) ? "Tắt" : "Bật"}
        </button>
      </div>`
      )
      .join("");
  }

  function renderDetail() {
    const b = selected();
    el("Detail").hidden = !b;
    if (!b) {
      renderPay(cfg.product, null);
      return;
    }

    el("Lamp").className = "lamp " + lampOf(b.status);
    el("Title").textContent = `${b.name} · ${WORDS[b.status] || b.status}`;
    el("Meta").textContent =
      (b.status === "error" && b.error ? b.error : cfg.sub(b)) + (b.locked ? " · 🔒 Quản trị viên đã khoá bot này" : "");

    // Bot bi khoa: vo hieu hoa moi nut / o nhap trong chi tiet (nguoi dung chi xem nhat ky)
    el("Detail")
      .querySelectorAll("input, textarea, select, button")
      .forEach((x) => (x.disabled = !!b.locked));
    if (!b.locked) {
      el("Start").disabled = isOn(b.status);
      el("Stop").disabled = b.status === "stopped" || b.status === "stopping";
    }

    // Chi do du lieu vao form khi doi bot, tranh ghi de luc dang go
    if (st.filledFor !== b.id) {
      cfg.fill(b);
      st.filledFor = b.id;
    }
    renderPay(cfg.product, b);
  }

  async function load() {
    try {
      const d = await api(cfg.base + "/bots");
      st.bots = d.bots;
      if (st.sel && !selected()) st.sel = null;
      if (!st.sel && d.bots.length) st.sel = d.bots[0].id;
      renderList(d);
      renderDetail();
    } catch (_) {}
  }

  async function loadLogs() {
    if (!st.sel) return;
    try {
      const { logs } = await api(`${cfg.base}/bots/${st.sel}/logs`);
      renderLog(el("Log"), logs);
    } catch (_) {}
  }

  // refill: do lai form tu du lieu moi luu (sau khi luu cookie, cai dat...)
  async function act(path, opts, okText, refill = false) {
    try {
      const r = await api(path, opts);
      if (okText) say(typeof okText === "function" ? okText(r) : okText, r?.warn ? "bad" : "good");
      if (refill) st.filledFor = null;
      await load();
      loadLogs();
      return r;
    } catch (e) {
      say(e.message, "bad");
      return null;
    }
  }

  const botPath = (id, rest = "") => `${cfg.base}/bots/${id}${rest}`;
  const post = (body) => ({ method: "POST", body: JSON.stringify(body || {}) });

  // Danh sach: chon bot / bat tat nhanh
  el("List").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (btn) {
      const id = Number(btn.dataset.id);
      act(botPath(id, "/" + btn.dataset.act), post(), btn.dataset.act === "start" ? "Đang bật bot…" : "Đang tắt bot…");
      return;
    }
    const card = e.target.closest(".bot-card");
    if (!card) return;
    st.sel = Number(card.dataset.id);
    st.filledFor = null;
    el("Log").innerHTML = '<div class="empty">Đang tải…</div>';
    load().then(loadLogs);
    el("Detail").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  el("Add").onclick = async () => {
    const name = await promptBox(`Đặt tên cho bot ${cfg.kind} mới. Để trống thì hệ thống tự đặt tên.`, {
      title: `Thêm bot ${cfg.kind}`,
      ok: "Tạo bot",
      placeholder: "Ví dụ: Bot nhóm lớp",
      maxLength: 40,
      allowEmpty: true,
    });
    if (name === null) return;
    const r = await act(cfg.base + "/bots", post({ name }), (d) =>
      d.trial ? `Đã tạo bot, tặng ${d.trial.days} ngày dùng thử. Nhập đăng nhập bên dưới.` : "Đã tạo bot. Nhập đăng nhập bên dưới, rồi thanh toán cho bot."
    );
    if (r) {
      st.sel = r.id;
      st.filledFor = null;
      await load();
      el("Detail").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  el("Start").onclick = () => act(botPath(st.sel, "/start"), post(), "Đang bật bot…");
  el("Stop").onclick = () => act(botPath(st.sel, "/stop"), post(), "Đang tắt bot…");

  el("Save").onclick = () =>
    act(botPath(st.sel, "/settings"), post(cfg.settings()), "Đã lưu. Tắt rồi bật lại bot để áp dụng.", true);

  el("Delete").onclick = async () => {
    const b = selected();
    if (!b) return;
    const left = b.plan.active && !b.plan.unlimited ? `\nBot còn ${b.plan.daysLeft} ngày sử dụng, xoá là mất luôn.` : "";
    const yes = await confirmBox(`Cookie đã lưu sẽ mất.${left}`, { title: `Xoá bot "${b.name}"?`, ok: "Xoá bot", danger: true });
    if (!yes) return;
    st.sel = null;
    st.filledFor = null;
    act(botPath(b.id), { method: "DELETE" }, "Đã xoá bot.");
  };

  /** Mo chi tiet mot bot (dung khi bam "Thanh toan" o tab Thanh toan) */
  async function select(id) {
    st.sel = id;
    st.filledFor = null;
    await load();
    loadLogs();
  }

  return { st, load, loadLogs, act, botPath, post, selected, el, select };
}

/* ================= Facebook ================= */

const fb = makePanel({
  product: "fb",
  k: "fb",
  base: "/fb",
  kind: "Facebook",
  sub(b) {
    if (b.status === "running") {
      const who = b.fbName ? `${b.fbName}` : `UID ${b.fbUid}`;
      return `${who} · ${fmtTime(b.uptimeSec)}${b.activeGames ? ` · ${b.activeGames} ván` : ""}`;
    }
    if (b.status === "starting") return "đang đăng nhập";
    return b.hasLogin ? `${b.cookieCount} cookie${b.fbName ? " · " + b.fbName : ""}` : "chưa có cookie";
  },
  fill(b) {
    $("fbName").value = b.name;
    $("fbPrefix").value = b.prefix;
    $("fbAuto").checked = b.autostart;
    $("fbCookie").value = "";
    $("fbCookie").placeholder = b.hasLogin
      ? `Đã lưu ${b.cookieCount} cookie. Dán cookie mới để thay.`
      : "datr=...; c_user=...; xs=...; fr=...";
  },
  settings: () => ({ name: $("fbName").value, prefix: $("fbPrefix").value, autostart: $("fbAuto").checked }),
});

$("fbTabCookie").onclick = () => {
  $("fbTabCookie").className = "primary";
  $("fbTabPw").className = "";
  $("fbPaneCookie").hidden = false;
  $("fbPanePw").hidden = true;
};
$("fbTabPw").onclick = () => {
  $("fbTabPw").className = "primary";
  $("fbTabCookie").className = "";
  $("fbPanePw").hidden = false;
  $("fbPaneCookie").hidden = true;
};

$("fbSaveCookie").onclick = async () => {
  const v = $("fbCookie").value.trim();
  if (!v) return say("Chưa dán gì vào ô cookie.", "bad");
  await fb.act(fb.botPath(fb.st.sel, "/appstate"), fb.post({ appstate: v }), (d) => `Đã lưu ${d.count} cookie.`, true);
};

$("fbDelCookie").onclick = async () => {
  const yes = await confirmBox("Bot này sẽ bị tắt và phải dán cookie mới mới chạy lại được.", {
    title: "Xoá cookie?",
    ok: "Xoá cookie",
    danger: true,
  });
  if (!yes) return;
  await fb.act(fb.botPath(fb.st.sel, "/appstate"), { method: "DELETE" }, "Đã xoá cookie.", true);
};

$("fbLoginPw").onclick = async () => {
  const email = $("fbEmail").value.trim();
  const password = $("fbPassword").value;
  if (!email || !password) return say("Nhập đủ email và mật khẩu.", "bad");
  const btn = $("fbLoginPw");
  btn.disabled = true;
  btn.textContent = "Đang đăng nhập…";
  const r = await fb.act(
    fb.botPath(fb.st.sel, "/appstate/login"),
    fb.post({ email, password }),
    (d) => `Đăng nhập thành công, đã lưu ${d.count} cookie.`,
    true
  );
  if (r) $("fbPassword").value = "";
  btn.disabled = false;
  btn.textContent = "Đăng nhập";
};

/* ================= Zalo ================= */

const zl = makePanel({
  product: "zalo",
  k: "zl",
  base: "/zalo",
  kind: "Zalo",
  sub(b) {
    if (b.status === "running") return `${b.zaloUid ? "ID " + b.zaloUid + " · " : ""}chạy được ${fmtTime(b.uptimeSec)}`;
    if (!b.hasLogin) return "chưa đăng nhập Zalo";
    return `${b.cookieCount} cookie`;
  },
  fill(b) {
    $("zlName").value = b.name;
    $("zlPrefix").value = b.prefix;
    $("zlMain").checked = b.isMainBot;
    $("zlAuto").checked = b.autostart;
    $("zlImei").value = "";
    $("zlCookie").value = "";
    $("zlLoginHint").textContent = b.hasLogin
      ? `Đã lưu đăng nhập (${b.cookieCount} cookie). Nhập lại cả IMEI và cookie để thay.`
      : "Lấy khi đang đăng nhập chat.zalo.me trên trình duyệt.";
  },
  settings: () => ({
    name: $("zlName").value,
    prefix: $("zlPrefix").value,
    isMainBot: $("zlMain").checked,
    autostart: $("zlAuto").checked,
  }),
});

$("zlSaveLogin").onclick = async () => {
  await zl.act(
    zl.botPath(zl.st.sel, "/login"),
    zl.post({ imei: $("zlImei").value, cookies: $("zlCookie").value }),
    (d) => d.warn || `Đã lưu ${d.count} cookie Zalo.`,
    true
  );
};

$("zlDelLogin").onclick = async () => {
  const yes = await confirmBox("Bot này sẽ bị tắt và phải nhập lại đăng nhập Zalo mới chạy lại được.", {
    title: "Xoá đăng nhập Zalo?",
    ok: "Xoá đăng nhập",
    danger: true,
  });
  if (!yes) return;
  await zl.act(zl.botPath(zl.st.sel, "/login"), { method: "DELETE" }, "Đã xoá đăng nhập Zalo.", true);
};

/* ================= Tab ================= */

const panels = { fb, zalo: zl };
let current = "fb";

const tabHidden = (name) => {
  const b = $("tabs").querySelector(`button[data-tab="${name}"]`);
  return !b || b.hidden;
};

function showTab(name) {
  if (!$("tab-" + name) || tabHidden(name)) name = ["fb", "zalo", "plan"].find((n) => !tabHidden(n)) || "plan";
  current = name;
  for (const b of $("tabs").querySelectorAll("button")) b.classList.toggle("on", b.dataset.tab === name);
  for (const t of document.querySelectorAll(".tab")) t.hidden = t.id !== "tab-" + name;
  history.replaceState(null, "", "#" + name);
  const p = panels[name];
  if (p) p.load().then(p.loadLogs);
  if (name === "plan") loadBilling().catch(() => {});
}

$("tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (b) showTab(b.dataset.tab);
});

// Tab Quan tri chi hien sau khi app.js biet la admin -> mo tre mot chut
const startTab = location.hash.slice(1) || "fb";
showTab(startTab === "admin" ? "fb" : startTab);
if (startTab === "admin") setTimeout(() => showTab("admin"), 800);

setInterval(() => {
  if (document.hidden) return;
  const p = panels[current];
  if (p) {
    p.load();
    p.loadLogs();
  }
}, 4000);


/* ================= Thanh toán theo từng bot ================= */

const PAY_BOX = { fb: "fbPay", zalo: "zlPay" };
const PANEL = { fb, zalo: zl };
const payState = { fb: { botId: null, plan: null, coupon: "", sig: "" }, zalo: { botId: null, plan: null, coupon: "", sig: "" } };
let billingReloading = false;

function renderPay(product, b, force = false) {
  const box = $(PAY_BOX[product]);
  const ps = payState[product];
  if (!b) {
    box.innerHTML = "";
    ps.sig = "";
    return;
  }

  // Trang thai don thay doi (vua tao / vua duoc duyet) ma du lieu thanh toan cu -> nap lai
  const pending = billingData?.orders.find((o) => o.status === "pending" && o.product === product && o.bot_id === b.id);
  if (billingData && (b.pendingOrder || null) !== (pending?.code || null) && !billingReloading) {
    billingReloading = true;
    loadBilling().finally(() => (billingReloading = false));
  }

  const sig = [b.id, b.hasLogin, b.pendingOrder, b.plan.expires, b.plan.active, billingData ? billingData.orders.length : "-", pending?.code].join("|");
  if (!force && sig === ps.sig) return; // giu nguyen o nhap ma giam gia khi tu lam moi
  ps.sig = sig;
  if (ps.botId !== b.id) Object.assign(ps, { botId: b.id, plan: null, coupon: "" });

  const kind = PRODUCT_NAMES[product];
  if (b.plan.unlimited) {
    box.innerHTML = `<h3>Thanh toán</h3><p class="hint">Tài khoản quản trị: bot chạy không cần thanh toán.</p>`;
    return;
  }
  const head = `<h3>Thanh toán cho bot này</h3>
    <p class="pay-status ${b.plan.active ? "ok" : "bad"}">${esc(expiryLine(b.plan))}</p>`;

  if (!b.hasLogin) {
    box.innerHTML = head + `<p class="hint">Lưu đăng nhập ${kind} ở trên xong sẽ hiện phần thanh toán cho bot này.</p>`;
    return;
  }
  if (!billingData) {
    box.innerHTML = head + '<p class="hint">Đang tải bảng giá…</p>';
    return;
  }
  if (pending) {
    box.innerHTML = head + orderCard(pending, billingData.bank);
    return;
  }
  const plans = billingData.prices[product];
  if (!plans.length) {
    box.innerHTML = head + `<p class="hint">Chưa có gói nào cho bot ${kind}. Liên hệ quản trị viên.</p>`;
    return;
  }
  if (!plans.some((p) => p.id === ps.plan)) ps.plan = plans[Math.min(1, plans.length - 1)].id;

  box.innerHTML =
    head +
    `<div class="row seg plan-opts">
      ${plans
        .map(
          (p) => `<button data-plan="${p.id}" class="${p.id === ps.plan ? "primary" : ""}">
            ${esc(p.name)}<small>${vnd(p.amount)}</small></button>`
        )
        .join("")}
    </div>
    <div class="coupon-row">
      <input type="text" data-coupon placeholder="Mã giảm giá (nếu có)" value="${esc(ps.coupon)}" autocapitalize="characters" autocomplete="off">
      <button data-apply>Áp dụng</button>
    </div>
    <div class="quote" data-quote><span class="dim">Đang tính…</span></div>
    <button class="primary wide" data-order>${b.plan.active ? "Gia hạn bot này" : "Thanh toán bot này"}</button>`;
  updatePayQuote(product);
}

let quoteSeq = 0;
async function updatePayQuote(product) {
  const box = $(PAY_BOX[product]).querySelector("[data-quote]");
  if (!box) return;
  const ps = payState[product];
  const seq = ++quoteSeq;
  try {
    const qt = await api("/billing/quote", {
      method: "POST",
      body: JSON.stringify({ product, botId: ps.botId, plan: ps.plan, coupon: ps.coupon }),
    });
    if (seq !== quoteSeq) return;
    box.innerHTML = [
      `<div><span>${esc(qt.botName)} · ${esc(qt.planName)} (${qt.days} ngày)</span><span>${vnd(qt.base)}</span></div>`,
      qt.discount ? `<div class="ok"><span>Mã ${esc(qt.coupon.code)}</span><span>−${vnd(qt.discount)}</span></div>` : "",
      `<div class="total"><span>Tổng</span><span>${vnd(qt.total)}</span></div>`,
    ].join("");
  } catch (e) {
    if (seq !== quoteSeq) return;
    // Ma giam gia loi: bao loi va tinh lai gia goc
    if (ps.coupon) {
      say(e.message, "bad");
      ps.coupon = "";
      const inp = $(PAY_BOX[product]).querySelector("[data-coupon]");
      if (inp) inp.value = "";
      return updatePayQuote(product);
    }
    box.innerHTML = `<span class="dim">${esc(e.message)}</span>`;
  }
}

for (const product of ["fb", "zalo"]) {
  $(PAY_BOX[product]).addEventListener("click", async (e) => {
    const ps = payState[product];
    const box = $(PAY_BOX[product]);
    const planBtn = e.target.closest("button[data-plan]");
    const cancelBtn = e.target.closest("button[data-cancel]");

    if (planBtn) {
      ps.plan = planBtn.dataset.plan;
      for (const b of box.querySelectorAll("button[data-plan]")) b.className = b === planBtn ? "primary" : "";
      updatePayQuote(product);
    } else if (e.target.closest("button[data-apply]")) {
      ps.coupon = box.querySelector("[data-coupon]").value.trim().toUpperCase();
      updatePayQuote(product);
    } else if (e.target.closest("button[data-order]")) {
      const btn = e.target.closest("button[data-order]");
      ps.coupon = box.querySelector("[data-coupon]").value.trim().toUpperCase();
      btn.disabled = true;
      try {
        const r = await api("/billing/order", {
          method: "POST",
          body: JSON.stringify({ product, botId: ps.botId, plan: ps.plan, coupon: ps.coupon }),
        });
        say(
          r.order.autoApproved
            ? `Đã kích hoạt, bot hết hạn ${fmtDate(r.order.expires || r.order.paid_at)}.`
            : "Đã tạo đơn. Chuyển khoản theo thông tin bên dưới."
        );
        ps.coupon = "";
        await loadBilling();
        await PANEL[product].load();
      } catch (err) {
        say(err.message, "bad");
        btn.disabled = false;
      }
    } else if (cancelBtn) {
      await cancelOrder(cancelBtn.dataset.cancel);
      await PANEL[product].load();
    }
  });

  // Enter trong o ma giam gia = Ap dung
  $(PAY_BOX[product]).addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("[data-coupon]")) {
      e.preventDefault();
      $(PAY_BOX[product]).querySelector("button[data-apply]").click();
    }
  });
}

/** app.js goi sau moi lan nap du lieu thanh toan */
function onBillingLoaded() {
  for (const product of ["fb", "zalo"]) {
    const b = PANEL[product].selected();
    if (b) renderPay(product, b, true);
  }
}

/** Mo chi tiet mot bot tu tab Thanh toan */
async function openBot(product, id) {
  showTab(product === "fb" ? "fb" : "zalo");
  await PANEL[product].select(id);
  $(PAY_BOX[product]).scrollIntoView({ behavior: "smooth", block: "start" });
}
