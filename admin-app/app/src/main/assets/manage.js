/* botctl: tab "quản trị" và các hành động bổ sung, dựng trên các hàm của app.js.
   app.js gọi window.__botctlExt(B) trước khi khởi động và gộp views / actions / commands / tabs trả về.
   Cùng một API với trang quản trị trên web, nên mọi thứ làm được trên web đều làm được ở đây. */
window.__botctlExt = (B) => {
  "use strict";
  const { $, $$, esc, fmt, ago, kv, get, post, api, request, toast, fail, copy, ask, openSheet, closeSheet } = B;

  /* ---------- tiện ích ---------- */

  const num = (v) => Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")) || 0;
  const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));
  const day = (s) => String(s || "").slice(0, 10);
  /** Giá trị một ô trong vùng root: checkbox trả true/false, còn lại trả chuỗi đã cắt khoảng trắng */
  const val = (root, k) => {
    const e = root.querySelector(`[data-k="${k}"]`);
    return !e ? "" : e.type === "checkbox" ? e.checked : String(e.value).trim();
  };
  const input = (k, label, v, attrs = "") => `<div class="field"><label>${label}</label><input data-k="${k}" value="${esc(v ?? "")}" autocapitalize="off" autocomplete="off" spellcheck="false" ${attrs}></div>`;
  const secret = (k, label, ph) => `<div class="field"><label>${label}</label><input data-k="${k}" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="${esc(ph || "")}"></div>`;
  const nums = (k, label, v, min, max) => input(k, label, v, `type="number" inputmode="numeric" min="${min}" max="${max}" step="1"`);
  const sw = (k, label, sub, on) => `<div class="switch"><div class="t">${label}${sub ? `<small>${sub}</small>` : ""}</div><input type="checkbox" data-k="${k}"${on ? " checked" : ""}></div>`;
  const empty = (t) => `<div class="empty">${esc(t)}</div>`;
  const row = (l1, l2, extra = "") => `<div class="row"><div class="l1">${l1}</div>${l2 ? `<div class="l2">${l2}</div>` : ""}${extra}</div>`;
  const tag = (t, c = "") => `<span class="tag ${c}">${esc(t)}</span>`;
  const sp = '<span class="sp"></span>';

  const el = $("#v-manage");
  const body = () => $("#mgBody");
  const put = (html) => { const b = body(); if (b) { b.dataset.ok = "1"; b.innerHTML = html; } };

  /* ---------- đơn thuê bot ---------- */

  const ORDER = { pending: ["chờ", "warn"], paid: ["đã duyệt", "ok"], cancelled: ["đã huỷ", ""] };

  async function pgOrders() {
    const { orders } = await get("/admin/orders");
    put(orders.length
      ? `<div class="rows">${orders.map((o) => {
        const s = ORDER[o.status] || [o.status, ""];
        const acts = o.status === "pending"
          ? `<div class="bar"><button class="btn sm primary" data-act="ordApprove" data-id="${o.id}">✓ duyệt</button><button class="btn sm danger" data-act="ordCancel" data-id="${o.id}">✕ huỷ</button></div>` : "";
        return row(`<b>${esc(o.username)}</b>${tag(s[0], s[1])}${sp}<b class="y">${fmt(o.amount)}đ</b>`,
          `${esc(o.code)} · ${o.product === "zalo" ? "zalo" : "fb"} · ${esc(o.plan || "")}${o.days ? " " + o.days + "d" : ""}${o.bot_name ? " · " + esc(o.bot_name) : ""} · ${ago(o.created_at)}${o.note ? " · " + esc(o.note) : ""}`, acts);
      }).join("")}</div>`
      : empty("chưa có đơn thuê bot nào"));
  }

  /* ---------- doanh thu + lịch sử giao dịch ---------- */

  const R = { range: "month", chart: "daily", kind: "", q: "", from: "", to: "", page: 1, rows: [], more: false, total: 0, inn: 0, out: 0 };
  const KIND = { deposit: "nạp tiền", spend: "thanh toán", reward: "thưởng", task: "vượt link", adjust: "điều chỉnh", legacy: "đơn cũ" };
  const KIND_FILTER = [["", "tất cả"], ["deposit", "nạp"], ["spend", "thanh toán"], ["reward", "thưởng"], ["task", "vượt link"], ["adjust", "điều chỉnh"], ["legacy", "đơn cũ"]];

  const query = (page) => {
    const p = new URLSearchParams({ page: String(page), limit: "30" });
    if (R.kind) p.set("kind", R.kind);
    if (R.q) p.set("q", R.q);
    if (R.from) p.set("from", R.from);
    if (R.to) p.set("to", R.to);
    return p.toString();
  };

  function ledgerRows(rows) {
    return rows.map((t) => row(
      `<b>${esc(t.username)}</b>${tag(KIND[t.kind] || t.kind, t.kind === "deposit" || t.kind === "legacy" ? "ok" : t.kind === "spend" ? "info" : "")}${sp}<b class="${t.amount < 0 ? "r" : "g"}">${signed(t.amount)}</b>`,
      `${ago(t.at)}${t.balance != null ? " · dư " + fmt(t.balance) : ""}${t.note ? " · " + esc(t.note) : ""}${t.ref ? " · " + esc(t.ref) : ""}`
    )).join("");
  }

  async function pgRevenue() {
    const [s, l] = await Promise.all([get("/admin/stats"), get("/admin/transactions?" + query(1))]);
    R.page = 1; R.rows = l.rows; R.more = l.page < l.pages; R.total = l.total; R.inn = l.inn; R.out = l.out;
    const p = s[R.range];
    const prod = s.products[R.range === "all" ? "all" : "month"];
    const series = s[R.chart];
    const top = Math.max(1, ...series.map((d) => Math.max(d.cash, d.spend)));
    put(`
      <div class="chips">${[["today", "hôm nay"], ["week", "7 ngày"], ["month", "tháng này"], ["all", "tất cả"]].map(([k, t]) => `<button class="chip${k === R.range ? " on" : ""}" data-act="rvRange" data-v="${k}">${t}</button>`).join("")}</div>
      <div class="card">
        ${kv("tiền thật đã nhận", fmt(p.cash) + "đ", "g")}
        ${kv("coin nạp", `${fmt(p.deposit)} · ${fmt(p.depositCount)} lệnh · ${fmt(p.depositors)} người`)}
        ${kv("đơn chuyển khoản cũ", fmt(p.legacy) + "đ" + (p.legacyCount ? ` · ${fmt(p.legacyCount)} đơn` : ""))}
        ${kv("coin đã dùng thuê bot", `${fmt(p.spend)} · ${fmt(p.spendCount)} đơn`, "pu")}
        ${kv("coin thưởng đã trao", fmt(p.reward))}
        ${kv("admin cộng / trừ", signed(p.adjust), p.adjust < 0 ? "r" : "")}
      </div>
      <h3 class="sec">${R.range === "all" ? "tất cả" : "tháng này"} theo loại bot</h3>
      <div class="card">${kv("facebook", `${fmt(prod.fb.s)} coin · ${fmt(prod.fb.n)} đơn`)}${kv("zalo", `${fmt(prod.zalo.s)} coin · ${fmt(prod.zalo.n)} đơn`)}</div>
      <h3 class="sec">ví và lệnh chờ</h3>
      <div class="card">${kv("coin còn trong ví người dùng", `${fmt(s.wallets.balance)} · ${fmt(s.wallets.holders)} ví`)}${kv("lệnh nạp chờ duyệt", `${fmt(s.pending.n)} · ${fmt(s.pending.s)}đ`, s.pending.n ? "y" : "")}</div>
      <h3 class="sec">tiền nhận theo ${R.chart === "daily" ? "ngày" : "tháng"}</h3>
      <div class="chips">${[["daily", "30 ngày"], ["monthly", "12 tháng"]].map(([k, t]) => `<button class="chip${k === R.chart ? " on" : ""}" data-act="rvChart" data-v="${k}">${t}</button>`).join("")}</div>
      <div class="mg-bars">${series.map((d) => `<i style="height:${Math.max(1, Math.round((d.cash / top) * 100))}%" title="${esc(d.k)}: ${fmt(d.cash)}đ"></i>`).join("")}</div>
      <div class="hint">cao nhất ${fmt(top)}đ · ${esc(series[0].k)} đến ${esc(series[series.length - 1].k)}</div>
      <h3 class="sec">lịch sử giao dịch</h3>
      <div class="chips">${KIND_FILTER.map(([k, t]) => `<button class="chip${k === R.kind ? " on" : ""}" data-act="rvKind" data-v="${k}">${t}</button>`).join("")}</div>
      <div id="rvFilter">
        <div class="bar"><input data-k="q" type="search" placeholder="tên, ghi chú, mã…" value="${esc(R.q)}" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
        <div class="bar"><input data-k="from" type="date" value="${esc(R.from)}"><input data-k="to" type="date" value="${esc(R.to)}"></div>
        <div class="bar"><button class="btn sm primary" data-act="rvApply">lọc</button><button class="btn sm" data-act="rvCsv">chép CSV</button></div>
      </div>
      <div class="hint" id="rvSum"></div>
      <div class="rows" id="rvRows"></div>
      <div class="bar" id="rvMore"></div>`);
    drawLedger();
  }

  function drawLedger() {
    $("#rvSum").textContent = `${fmt(R.total)} giao dịch · vào +${fmt(R.inn)} · ra −${fmt(R.out)}`;
    $("#rvRows").innerHTML = R.rows.length ? ledgerRows(R.rows) : empty("không có giao dịch nào khớp bộ lọc");
    $("#rvMore").innerHTML = R.more ? '<button class="btn sm" data-act="rvMore">tải thêm</button>' : "";
  }

  /* ---------- nhà cung cấp vượt link ---------- */

  async function pgLinkProv() {
    const { providers } = await get("/admin/linkcoin");
    put(`<div class="bar"><button class="btn sm primary" data-act="lpEdit" data-id="0">+ thêm nhà cung cấp</button><button class="btn sm" data-go="money:link">thống kê vượt link</button></div>
      ${providers.length ? `<div class="rows">${providers.map((p) => `<button class="row${p.active ? "" : " off"}" data-act="lpEdit" data-id="${p.id}" data-json="${esc(JSON.stringify(p))}">
        <div class="l1"><b>${esc(p.name)}</b>${p.active ? tag("bật", "ok") : tag("tắt")}${p.hasToken ? "" : tag("thiếu token", "bad")}${sp}<b class="y">${fmt(p.reward)} coin</b></div>
        <div class="l2">${p.daily_limit} lượt/ngày · tối thiểu ${p.min_seconds}s · ${esc(String(p.api_url).slice(0, 60))}</div></button>`).join("")}</div>` : empty("chưa có nhà cung cấp nào")}
      <div class="hint">api url có {url} (link đích) và {token} nếu cần. Dán nguyên link api của nhà cung cấp cũng được, máy chủ tự đổi thành dạng đúng.</div>`);
  }

  function lpSheet(p) {
    const n = p || { id: 0, name: "", api_url: "", reward: 100, daily_limit: 3, min_seconds: 20, active: true, hasToken: false };
    openSheet(`<h4>${n.id ? "sửa" : "thêm"} nhà cung cấp</h4><div class="sub">${n.id ? "#" + n.id : "link rút gọn có kiểm tra người dùng đã vượt"}</div><div id="lpForm">
      ${input("name", "tên", n.name)}
      ${input("api_url", "api url (có {url}, và {token})", n.api_url, 'type="url" inputmode="url"')}
      ${secret("token", "token", n.hasToken ? "đã lưu, bỏ trống để giữ nguyên" : "dán token")}
      ${nums("reward", "coin thưởng mỗi lượt", n.reward, 1, 1000000)}
      ${nums("daily_limit", "số lượt tối đa mỗi người mỗi ngày", n.daily_limit, 1, 100)}
      ${nums("min_seconds", "thời gian tối thiểu (giây)", n.min_seconds, 5, 600)}
      ${sw("active", "đang bật", "tắt thì người dùng không thấy nhà cung cấp này", n.active)}
      <div class="bar"><button class="btn primary" data-act="lpSave" data-id="${n.id}">$ lưu</button>${n.id ? `<button class="btn danger" data-act="lpDel" data-id="${n.id}">xoá</button>` : ""}<button class="btn" data-act="closeSheet">huỷ</button></div></div>`);
  }

  /* ---------- bảng giá ---------- */

  let plans = [];
  const planRow = (p, i) => `<div class="row" data-plan="${i}">
    <div class="l1"><b>gói ${i + 1}</b>${sp}<button class="btn sm danger" data-act="plDel" data-i="${i}">xoá</button></div>
    ${input("name", "tên gói", p.name)}${nums("days", "số ngày", p.days, 1, 3650)}${nums("fb", "giá facebook (đ, 0 = không bán)", p.fb, 0, 100000000)}${nums("zalo", "giá zalo (đ, 0 = không bán)", p.zalo, 0, 100000000)}</div>`;
  const readPlans = () => $$("[data-plan]").map((r) => ({ id: plans[Number(r.dataset.plan)]?.id, name: val(r, "name"), days: num(val(r, "days")), fb: num(val(r, "fb")), zalo: num(val(r, "zalo")) }));
  const drawPlans = () => put(`<div class="hint">mỗi gói đã gồm 1 bot chạy cùng lúc. Giá 0 nghĩa là không bán gói đó cho loại bot này. Tối đa 10 gói.</div>
    <div class="rows" id="plList">${plans.map(planRow).join("")}</div>
    <div class="bar"><button class="btn sm" data-act="plAdd">+ thêm gói</button><button class="btn primary" data-act="plSave">$ lưu bảng giá</button></div>`);
  async function pgPlans() { plans = (await get("/admin/pricing")).plans; drawPlans(); }

  /* ---------- mã giảm giá ---------- */

  async function pgCoupons() {
    const { coupons } = await get("/admin/pricing");
    put(`<div class="bar"><button class="btn sm primary" data-act="cpNew">+ tạo mã giảm giá</button></div>
      ${coupons.length ? `<div class="rows">${coupons.map((c) => row(
        `<b>${esc(c.code)}</b>${c.active ? tag("bật", "ok") : tag("tắt")}${sp}<b class="y">${c.kind === "percent" ? c.value + "%" : fmt(c.value) + "đ"}</b>`,
        `${c.product === "all" ? "mọi bot" : c.product} · dùng ${fmt(c.used)}${c.max_uses ? "/" + fmt(c.max_uses) : ""}${c.once_per_user ? " · mỗi người 1 lần" : ""}${c.expires_at ? " · hết hạn " + day(c.expires_at) : ""}${c.note ? " · " + esc(c.note) : ""}`,
        `<div class="bar"><button class="btn sm" data-act="cpToggle" data-id="${c.id}" data-on="${c.active ? 0 : 1}">${c.active ? "tắt" : "bật"}</button><button class="btn sm danger" data-act="cpDel" data-id="${c.id}">xoá</button></div>`)).join("")}</div>` : empty("chưa có mã giảm giá nào")}`);
  }

  /* ---------- thưởng xếp hạng ---------- */

  async function pgRewards() {
    const { rewards } = await get("/admin/rewards");
    put(`<div class="hint">coin thưởng cho top nạp tháng trước, tự trao đầu tháng mới. 0 là không thưởng.</div>
      <div id="rwForm">${rewards.map((v, i) => nums("r" + i, "hạng " + (i + 1), v, 0, 100000000)).join("")}</div>
      <div class="bar"><button class="btn primary" data-act="rwSave">$ lưu phần thưởng</button></div>`);
  }

  /* ---------- cấu hình chung ---------- */

  async function pgSettings() {
    const d = await get("/admin/settings");
    const s = d.settings;
    put(`<div id="stForm">
      <div class="card">${sw("signup_open", "cho phép tự đăng ký", "tắt thì chỉ admin tạo tài khoản", s.signup_open === "1")}
      ${sw("hide_fb", "ẩn mục facebook", "người dùng thường không thấy, admin vẫn thấy", s.hide_fb === "1")}
      ${sw("hide_zalo", "ẩn mục zalo", "người dùng thường không thấy, admin vẫn thấy", s.hide_zalo === "1")}</div>
      ${nums("trial_days", "số ngày dùng thử khi đăng ký", s.trial_days, 0, 365)}
      <h3 class="sec">ngân hàng nhận tiền (vietqr)</h3>
      ${input("bank_id", "mã ngân hàng (MB, VCB, TCB, 970422…)", s.bank_id)}
      ${input("bank_account", "số tài khoản", s.bank_account, 'inputmode="numeric"')}
      ${input("bank_owner", "tên chủ tài khoản", s.bank_owner)}
      ${input("pay_note", "ghi chú thanh toán", s.pay_note)}
      <h3 class="sec">khoá ai dùng chung</h3>
      <div class="hint">${d.hasGlobalAiKey ? "đang có khoá: " + esc(d.globalAiKeyMasked) : "chưa có khoá dùng chung"}</div>
      ${secret("globalAiKey", "khoá api mới (bỏ trống để giữ nguyên)", "sk-ant-...")}
      ${input("global_ai_model", "model (để trống = mặc định)", s.global_ai_model)}
      <div class="field"><label>lời nhắn hệ thống</label><textarea data-k="global_ai_system" rows="4" spellcheck="false">${esc(s.global_ai_system || "")}</textarea></div>
      <div class="bar"><button class="btn primary" data-act="stSave">$ lưu cấu hình</button>${d.hasGlobalAiKey ? '<button class="btn danger" data-act="stClearKey">xoá khoá ai</button>' : ""}</div></div>`);
  }

  /* ---------- email gửi mã xác thực ---------- */

  async function pgMail() {
    const c = await get("/admin/mail");
    put(`<div class="card pad"><div class="l1">${c.enabled ? tag("đang bật", "ok") : tag("chưa bật", "warn")}${c.fromEnv ? tag("lấy từ biến môi trường") : ""}</div>
      <div class="hint">máy chủ gửi mã xác thực qua email khi đăng ký, quên mật khẩu. Có thể dùng brevo (api) hoặc smtp.</div></div>
      <div id="mlForm">
      <div class="field"><label>nhà cung cấp gửi mail</label><select data-k="provider">${[["", "tắt"], ["brevo", "brevo"], ["smtp", "smtp"]].map(([v, t]) => `<option value="${v}"${c.provider === v ? " selected" : ""}>${t}</option>`).join("")}</select></div>
      ${input("fromAddress", "email người gửi", c.fromAddress, 'type="email" inputmode="email"')}
      ${input("fromName", "tên hiển thị", c.fromName)}
      <h3 class="sec">brevo</h3>
      ${secret("brevoKey", "api key", c.hasBrevoKey ? "đã lưu, bỏ trống để giữ nguyên" : "xkeysib-...")}
      <h3 class="sec">smtp</h3>
      ${input("smtpHost", "máy chủ", c.smtp.host)}
      ${nums("smtpPort", "cổng", c.smtp.port || 587, 1, 65535)}
      ${input("smtpUser", "tài khoản", c.smtp.user)}
      ${secret("smtpPass", "mật khẩu", c.smtp.hasPass ? "đã lưu, bỏ trống để giữ nguyên" : "")}
      <div class="bar"><button class="btn primary" data-act="mlSave">$ lưu</button>${c.hasBrevoKey ? '<button class="btn danger" data-act="mlClear" data-w="brevo">xoá key brevo</button>' : ""}${c.smtp.hasPass ? '<button class="btn danger" data-act="mlClear" data-w="smtp">xoá mk smtp</button>' : ""}</div>
      <h3 class="sec">gửi thử</h3>
      ${input("to", "gửi một email thử tới", "", 'type="email" inputmode="email"')}
      <div class="bar"><button class="btn" data-act="mlTest">gửi thử</button></div></div>`);
  }

  /* ---------- khung tab ---------- */

  const MENU = [
    ["đơn hàng và tiền", [
      ["orders", "đơn thuê bot", "duyệt hoặc huỷ đơn chuyển khoản"],
      ["revenue", "doanh thu và giao dịch", "thống kê, biểu đồ, lịch sử có bộ lọc, chép CSV"],
      ["go:money:pending", "nạp coin chờ duyệt", "duyệt lệnh nạp"],
      ["go:money:bank", "tự động cộng tiền", "api ngân hàng, giao dịch chưa khớp"],
      ["plans", "bảng giá", "gói thuê bot"],
      ["coupons", "mã giảm giá", "tạo, bật tắt, xoá"],
      ["rewards", "thưởng xếp hạng", "coin thưởng top nạp mỗi tháng"],
    ]],
    ["vượt link", [
      ["linkprov", "nhà cung cấp vượt link", "thêm, sửa, xoá, bật tắt"],
      ["go:money:link", "thống kê vượt link", "thu nhập, lãi lỗ, người bất thường"],
    ]],
    ["hệ thống", [
      ["go:money:tools", "công cụ: ẩn và tính coin", "tab công cụ của người dùng"],
      ["settings", "cấu hình chung", "đăng ký, ngân hàng, khoá ai, ẩn facebook / zalo"],
      ["mail", "email gửi mã xác thực", "brevo hoặc smtp"],
    ]],
  ];
  const TITLE = { orders: "đơn thuê bot", revenue: "doanh thu và giao dịch", linkprov: "nhà cung cấp vượt link", plans: "bảng giá", coupons: "mã giảm giá", rewards: "thưởng xếp hạng", settings: "cấu hình chung", mail: "email gửi mã" };
  const PAGES = { orders: pgOrders, revenue: pgRevenue, linkprov: pgLinkProv, plans: pgPlans, coupons: pgCoupons, rewards: pgRewards, settings: pgSettings, mail: pgMail };

  const manage = {
    el,
    sub: "",
    enter() {
      if (!this.sub || !PAGES[this.sub]) { this.sub = ""; el.innerHTML = MENU.map(([g, items]) => `<h3 class="sec">${g}</h3><div class="rows">${items.map(([k, t, d]) => k.startsWith("go:")
        ? `<button class="row" data-go="${k.slice(3)}"><div class="l1"><b>${t}</b>${sp}<span class="dim">›</span></div><div class="l2">${d}</div></button>`
        : `<button class="row" data-act="mgOpen" data-sub="${k}"><div class="l1"><b>${t}</b>${sp}<span class="dim">›</span></div><div class="l2">${d}</div></button>`).join("")}</div>`).join(""); return; }
      el.innerHTML = `<div class="bar"><button class="btn sm" data-act="mgBack">← quản trị</button><b>${TITLE[this.sub]}</b></div><div id="mgBody"><div class="empty">đang tải…</div></div>`;
      this.load();
    },
    async load() {
      if (!this.sub) return;
      try { await PAGES[this.sub](); } catch (e) { const b = body(); if (b && !b.dataset.ok) b.innerHTML = empty(e.message); else fail(e); }
    },
  };

  /* ---------- hành động ---------- */

  const reload = () => manage.load();
  const sheetVal = (k) => val($("#sheet"), k);

  async function botsSheet(uid) {
    const { bots } = await get(`/admin/users/${uid}/bots`);
    openSheet(`<h4>bot của tài khoản #${uid}</h4><div class="sub">${bots.length} bot · khoá, tắt, cộng hoặc trừ ngày</div>${bots.length ? bots.map((b) => `<div class="card pad" style="margin-bottom:.5rem">
      <div class="l1"><b>${esc(b.name || "bot")}</b>${tag(b.product === "zalo" ? "zalo" : "fb", "info")}${b.running ? tag("chạy", "ok") : tag("dừng")}${b.locked ? tag("bị khoá", "bad") : ""}</div>
      <div class="l2">${b.unlimited ? "admin: không giới hạn" : b.active ? `còn ${b.daysLeft} ngày` : "hết hạn"}${b.expires ? " · " + day(b.expires) : ""}</div>
      <div class="bar">
        <button class="btn sm" data-act="botExt" data-p="${b.product}" data-id="${b.id}" data-u="${uid}" data-d="7">+7d</button>
        <button class="btn sm" data-act="botExt" data-p="${b.product}" data-id="${b.id}" data-u="${uid}" data-d="30">+30d</button>
        <button class="btn sm" data-act="botExt" data-p="${b.product}" data-id="${b.id}" data-u="${uid}" data-d="-7">−7d</button>
        <button class="btn sm" data-act="botLock" data-p="${b.product}" data-id="${b.id}" data-u="${uid}" data-l="${b.locked ? 0 : 1}">${b.locked ? "mở khoá" : "khoá bot"}</button>
        ${b.running ? `<button class="btn sm danger" data-act="botStop" data-p="${b.product}" data-id="${b.id}" data-u="${uid}">tắt bot</button>` : ""}
      </div></div>`).join("") : empty("tài khoản này chưa có bot")}
      <div class="bar"><button class="btn" data-act="closeSheet">đóng</button></div>`);
  }

  async function statsSheet(pid) {
    const d = await get("/admin/linkstats?range=week");
    const p = d.providers.find((x) => x.id === pid);
    if (!p) return fail(new Error("Không tìm thấy nhà cung cấp"));
    const st = p.stats || { url: "", path: "", kind: "total", mult: 1 };
    openSheet(`<h4>${esc(p.name)} · thu nhập</h4><div class="sub">cách app biết nhà cung cấp trả bao nhiêu tiền</div><div id="lkForm" data-id="${p.id}">
      <div class="hint">cách 1: nhập tay số tiền thu về mỗi lượt (dùng khi nhà cung cấp không có api xem thu nhập)</div>
      ${input("rate", "đồng mỗi lượt", String(p.rate || "").replace(".", ","), 'inputmode="decimal"')}
      <div class="bar"><button class="btn sm primary" data-act="lkRate">lưu số tiền mỗi lượt</button></div>
      <div class="hint">cách 2: máy chủ tự hỏi api của nhà cung cấp mỗi 30 phút và tính phần tăng thêm</div>
      ${input("stats_url", "api xem thu nhập (có thể chứa {token})", st.url, 'type="url" inputmode="url"')}
      ${input("stats_path", "trường chứa số tiền (để trống = tự dò)", st.path, 'placeholder="data.earnings"')}
      <div class="field"><label>kiểu số</label><select data-k="stats_kind"><option value="total"${st.kind !== "balance" ? " selected" : ""}>tổng đã kiếm (tăng dần)</option><option value="balance"${st.kind === "balance" ? " selected" : ""}>số dư (giảm khi rút)</option></select></div>
      ${input("stats_mult", "1 đơn vị api = ? đồng", String(st.mult ?? 1).replace(".", ","), 'inputmode="decimal"')}
      <div class="bar"><button class="btn sm primary" data-act="lkSource">lưu và lấy thử</button>${st.url ? '<button class="btn sm" data-act="lkFetch">lấy ngay</button>' : ""}<button class="btn sm" data-act="closeSheet">đóng</button></div>
      ${st.err ? `<div class="hint r">lỗi gần nhất: ${esc(st.err)}</div>` : st.last_ms ? `<div class="hint">lần gần nhất: ${fmt(st.last_value)} (${esc(st.last_path)}) · ${ago(new Date(st.last_ms).toISOString().slice(0, 19).replace("T", " "))}</div>` : ""}
      <div id="lkOut"></div></div>`);
  }

  const fetchMsg = (f) => !f ? "Đã lưu" : f.ok ? `Lấy được ${fmt(f.value)} (${f.path}) = ${fmt(f.vnd)}đ` : "Lỗi: " + f.error;
  const fieldChips = (f) => (f && f.fields && f.fields.length
    ? `<div class="hint">các trường tìm thấy, bấm để chọn:</div><div class="chips">${f.fields.map((x) => `<button class="chip" data-act="lkPick" data-path="${esc(x.path)}">${esc(x.path)} = ${fmt(x.value)}</button>`).join("")}</div>` : "");

  const actions = {
    mgOpen(a) { manage.sub = a.dataset.sub; manage.enter(); window.scrollTo(0, 0); },
    mgBack() { manage.sub = ""; manage.enter(); },
    closeSheet() { closeSheet(); },

    /* đơn thuê bot */
    async ordApprove(a) {
      a.disabled = true;
      try { const r = await post(`/admin/orders/${a.dataset.id}/approve`, { note: "" }); toast(`Đã duyệt${r.botName ? " · " + r.botName : ""}`); reload(); } catch (e) { fail(e); a.disabled = false; }
    },
    async ordCancel(a) {
      if (!(await ask("Huỷ đơn thuê bot này?", "huỷ đơn"))) return;
      try { await post(`/admin/orders/${a.dataset.id}/cancel`); toast("Đã huỷ đơn"); reload(); } catch (e) { fail(e); }
    },

    /* doanh thu */
    rvRange(a) { R.range = a.dataset.v; reload(); },
    rvChart(a) { R.chart = a.dataset.v; reload(); },
    rvKind(a) { R.kind = a.dataset.v; reload(); },
    rvApply() { const f = $("#rvFilter"); R.q = val(f, "q"); R.from = val(f, "from"); R.to = val(f, "to"); reload(); },
    async rvMore(a) {
      a.disabled = true;
      try {
        const l = await get("/admin/transactions?" + query(R.page + 1));
        R.page = l.page; R.rows = R.rows.concat(l.rows); R.more = l.page < l.pages; drawLedger();
      } catch (e) { fail(e); a.disabled = false; }
    },
    async rvCsv(a) {
      a.disabled = true;
      const f = $("#rvFilter"); R.q = val(f, "q"); R.from = val(f, "from"); R.to = val(f, "to");
      const p = new URLSearchParams();
      if (R.kind) p.set("kind", R.kind);
      if (R.q) p.set("q", R.q);
      if (R.from) p.set("from", R.from);
      if (R.to) p.set("to", R.to);
      const r = await request("GET", "/admin/transactions.csv" + (p.toString() ? "?" + p : ""));
      if (r.status === 200) copy(r.text, "Đã chép CSV, dán vào Google Sheets hoặc Excel"); else toast(r.error || "Không tải được CSV (HTTP " + r.status + ")", true);
      a.disabled = false;
    },

    /* nhà cung cấp link */
    lpEdit(a) {
      let p = null;
      if (a.dataset.json) { try { p = JSON.parse(a.dataset.json); } catch (_) {} }
      lpSheet(a.dataset.id === "0" ? null : p);
    },
    async lpSave(a) {
      const f = $("#lpForm");
      const body = { name: val(f, "name"), api_url: val(f, "api_url"), token: val(f, "token"), reward: num(val(f, "reward")), daily_limit: num(val(f, "daily_limit")), min_seconds: num(val(f, "min_seconds")), active: val(f, "active") };
      if (Number(a.dataset.id)) body.id = Number(a.dataset.id);
      a.disabled = true;
      try { await post("/admin/linkcoin", body); closeSheet(); toast("Đã lưu nhà cung cấp"); if (manage.sub === "linkprov") reload(); } catch (e) { fail(e); a.disabled = false; }
    },
    async lpDel(a) {
      if (!(await ask("Xoá nhà cung cấp này? Lịch sử vượt link cũ vẫn giữ.", "xoá"))) return;
      try { await post(`/admin/linkcoin/${a.dataset.id}/delete`); closeSheet(); toast("Đã xoá"); if (manage.sub === "linkprov") reload(); } catch (e) { fail(e); }
    },

    /* thu nhập từng nhà cung cấp (mở từ money > vượt link) */
    async lkStats(a) { try { await statsSheet(Number(a.dataset.id)); } catch (e) { fail(e); } },
    async lkRate(a) {
      const f = $("#lkForm");
      a.disabled = true;
      try { await post("/admin/linkstats/rate", { id: Number(f.dataset.id), pay_per_view: val(f, "rate") }); toast("Đã lưu số tiền mỗi lượt"); B.views.money?.load?.(); } catch (e) { fail(e); }
      a.disabled = false;
    },
    async lkSource(a) {
      const f = $("#lkForm");
      a.disabled = true;
      try {
        const r = await post("/admin/linkstats/source", { id: Number(f.dataset.id), stats_url: val(f, "stats_url"), stats_path: val(f, "stats_path"), stats_kind: val(f, "stats_kind"), stats_mult: val(f, "stats_mult") });
        $("#lkOut").innerHTML = `<div class="hint ${r.fetch && r.fetch.ok ? "g" : r.fetch ? "r" : ""}">${esc(fetchMsg(r.fetch))}</div>${fieldChips(r.fetch)}`;
        B.views.money?.load?.();
      } catch (e) { fail(e); }
      a.disabled = false;
    },
    async lkFetch(a) {
      const f = $("#lkForm");
      a.disabled = true;
      try {
        const r = await post("/admin/linkstats/fetch", { id: Number(f.dataset.id) });
        $("#lkOut").innerHTML = `<div class="hint ${r.fetch.ok ? "g" : "r"}">${esc(fetchMsg(r.fetch))}</div>${fieldChips(r.fetch)}`;
        B.views.money?.load?.();
      } catch (e) { fail(e); }
      a.disabled = false;
    },
    lkPick(a) { const i = $('#lkForm [data-k="stats_path"]'); if (i) i.value = a.dataset.path; },

    /* bảng giá */
    plAdd() {
      plans = readPlans();
      if (plans.length >= 10) return toast("Tối đa 10 gói", true);
      plans.push({ id: "", name: "", days: 30, fb: 0, zalo: 0 });
      drawPlans();
    },
    plDel(a) { plans = readPlans(); plans.splice(Number(a.dataset.i), 1); drawPlans(); },
    async plSave(a) {
      a.disabled = true;
      try { const r = await post("/admin/plans", { plans: readPlans() }); plans = r.plans; drawPlans(); toast("Đã lưu bảng giá"); } catch (e) { fail(e); a.disabled = false; }
    },

    /* mã giảm giá */
    cpNew() {
      openSheet(`<h4>tạo mã giảm giá</h4><div class="sub">mã gồm chữ, số, _ và -</div><div id="cpForm">
        ${input("code", "mã (3-20 ký tự)", "", 'autocapitalize="characters"')}
        <div class="field"><label>kiểu giảm</label><select data-k="kind"><option value="percent">theo %</option><option value="amount">số tiền (đ)</option></select></div>
        ${nums("value", "giá trị giảm (% hoặc đ)", "", 1, 100000000)}
        <div class="field"><label>áp dụng cho</label><select data-k="product"><option value="all">mọi bot</option><option value="fb">facebook</option><option value="zalo">zalo</option></select></div>
        ${nums("maxUses", "số lần dùng tối đa (0 = không giới hạn)", 0, 0, 1000000)}
        ${input("expiresAt", "hết hạn (để trống = không hết)", "", 'type="date"')}
        ${input("note", "ghi chú", "")}
        ${sw("oncePerUser", "mỗi người chỉ dùng 1 lần", "", true)}
        <div class="bar"><button class="btn primary" data-act="cpSave">$ tạo mã</button><button class="btn" data-act="closeSheet">huỷ</button></div></div>`);
    },
    async cpSave(a) {
      const f = $("#cpForm");
      a.disabled = true;
      try {
        await post("/admin/coupons", { code: val(f, "code"), kind: val(f, "kind"), value: val(f, "value"), product: val(f, "product"), maxUses: num(val(f, "maxUses")), expiresAt: val(f, "expiresAt"), note: val(f, "note"), oncePerUser: val(f, "oncePerUser") });
        closeSheet(); toast("Đã tạo mã"); if (manage.sub === "coupons") reload();
      } catch (e) { fail(e); a.disabled = false; }
    },
    async cpToggle(a) { try { await post(`/admin/coupons/${a.dataset.id}/active`, { active: a.dataset.on === "1" }); reload(); } catch (e) { fail(e); } },
    async cpDel(a) {
      if (!(await ask("Xoá mã giảm giá này?", "xoá"))) return;
      try { await api("DELETE", `/admin/coupons/${a.dataset.id}`); toast("Đã xoá"); reload(); } catch (e) { fail(e); }
    },

    /* thưởng xếp hạng */
    async rwSave(a) {
      const f = $("#rwForm");
      a.disabled = true;
      try { await post("/admin/rewards", { rewards: Array.from({ length: 10 }, (_, i) => num(val(f, "r" + i))) }); toast("Đã lưu phần thưởng"); } catch (e) { fail(e); }
      a.disabled = false;
    },

    /* cấu hình chung */
    async stSave(a) {
      const f = $("#stForm");
      const b = {
        signup_open: val(f, "signup_open") ? "1" : "0", hide_fb: val(f, "hide_fb") ? "1" : "0", hide_zalo: val(f, "hide_zalo") ? "1" : "0",
        trial_days: val(f, "trial_days"), bank_id: val(f, "bank_id"), bank_account: val(f, "bank_account"), bank_owner: val(f, "bank_owner"), pay_note: val(f, "pay_note"),
        global_ai_model: val(f, "global_ai_model"), global_ai_system: val(f, "global_ai_system"),
      };
      const key = val(f, "globalAiKey");
      if (key) b.globalAiKey = key;
      a.disabled = true;
      try { await post("/admin/settings", b); toast("Đã lưu cấu hình"); reload(); } catch (e) { fail(e); a.disabled = false; }
    },
    async stClearKey() {
      if (!(await ask("Xoá khoá AI dùng chung? Người dùng không có khoá riêng sẽ không dùng được trả lời AI.", "xoá khoá"))) return;
      try { await post("/admin/settings", { globalAiKey: "" }); toast("Đã xoá khoá AI"); reload(); } catch (e) { fail(e); }
    },

    /* email */
    async mlSave(a) {
      const f = $("#mlForm");
      const body = { provider: val(f, "provider"), fromAddress: val(f, "fromAddress"), fromName: val(f, "fromName"), smtp: { host: val(f, "smtpHost"), port: num(val(f, "smtpPort")) || 587, user: val(f, "smtpUser") } };
      if (val(f, "brevoKey")) body.brevoKey = val(f, "brevoKey");
      if (val(f, "smtpPass")) body.smtp.pass = val(f, "smtpPass");
      a.disabled = true;
      try { await post("/admin/mail", body); toast("Đã lưu cấu hình email"); reload(); } catch (e) { fail(e); a.disabled = false; }
    },
    async mlClear(a) {
      const c = await get("/admin/mail");
      const body = { provider: c.provider, fromAddress: c.fromAddress, fromName: c.fromName, smtp: { host: c.smtp.host, port: c.smtp.port, user: c.smtp.user } };
      if (a.dataset.w === "brevo") body.clearBrevoKey = true; else body.smtp.clearPass = true;
      try { await post("/admin/mail", body); toast("Đã xoá"); reload(); } catch (e) { fail(e); }
    },
    async mlTest(a) {
      const to = val($("#mlForm"), "to");
      if (!to) return toast("Nhập email nhận thử", true);
      a.disabled = true;
      try { await post("/admin/mail/test", { to }); toast("Đã gửi email thử, kiểm tra hộp thư"); } catch (e) { fail(e); }
      a.disabled = false;
    },

    /* bot của một tài khoản (mở từ tab users) */
    async userBots(a) { try { await botsSheet(Number(a.dataset.id)); } catch (e) { fail(e); } },
    async botExt(a) {
      try { const r = await post(`/admin/bots/${a.dataset.p}/${a.dataset.id}/extend`, { days: Number(a.dataset.d) }); toast("Hạn mới: " + day(r.expires)); await botsSheet(Number(a.dataset.u)); } catch (e) { fail(e); }
    },
    async botLock(a) {
      try { await post(`/admin/bots/${a.dataset.p}/${a.dataset.id}/flags`, { locked: a.dataset.l === "1" }); toast(a.dataset.l === "1" ? "Đã khoá bot" : "Đã mở khoá bot"); await botsSheet(Number(a.dataset.u)); } catch (e) { fail(e); }
    },
    async botStop(a) {
      try { await post(`/admin/bots/${a.dataset.p}/${a.dataset.id}/stop`); toast("Đã tắt bot"); await botsSheet(Number(a.dataset.u)); } catch (e) { fail(e); }
    },
  };

  // bấm tab quản trị ở thanh dưới luôn về menu (chạy trước bộ xử lý chuyển tab của app.js)
  $("#nav").addEventListener("click", (e) => { if (e.target.closest('button[data-tab="manage"]')) manage.sub = ""; }, true);

  /* chip, input trong view: lọc bằng Enter */
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.closest("#rvFilter")) { e.preventDefault(); actions.rvApply(); } });

  const open = (sub) => () => { manage.sub = sub; B.go("manage"); };
  return {
    tabs: ["manage"],
    views: { manage },
    actions,
    commands: [
      { n: "quản trị", h: "menu quản trị", run: () => { manage.sub = ""; B.go("manage"); } },
      { n: "đơn thuê bot", h: "quản trị › đơn thuê bot", run: open("orders") },
      { n: "doanh thu", h: "quản trị › doanh thu", run: open("revenue") },
      { n: "nhà cung cấp link", h: "quản trị › vượt link", run: open("linkprov") },
      { n: "bảng giá", h: "quản trị › bảng giá", run: open("plans") },
      { n: "mã giảm giá", h: "quản trị › mã giảm giá", run: open("coupons") },
      { n: "thưởng xếp hạng", h: "quản trị › thưởng", run: open("rewards") },
      { n: "cấu hình chung", h: "quản trị › cấu hình", run: open("settings") },
      { n: "email xác thực", h: "quản trị › email", run: open("mail") },
    ],
  };
};
