/* botctl — bảng điều khiển admin.
   Trong app Android: mọi cuộc gọi mạng đi qua cầu nối Native (HttpURLConnection thật, mật khẩu nằm trong Keystore).
   Mở bằng trình duyệt (cùng địa chỉ với máy chủ) cũng chạy được, dùng để thử giao diện. */
(() => {
  "use strict";

  /* ================= tiện ích ================= */

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");
  const pad = (n) => String(n).padStart(2, "0");
  const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const dur = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
  const sqlDate = (s) => new Date(String(s || "").replace(" ", "T") + "Z");
  function ago(s) {
    const t = sqlDate(s).getTime();
    if (!t) return "—";
    const d = Math.max(0, (Date.now() - t) / 1000);
    return d < 60 ? "vừa xong" : d < 3600 ? `${Math.floor(d / 60)}p trước` : d < 86400 ? `${Math.floor(d / 3600)}h trước` : `${Math.floor(d / 86400)}d trước`;
  }
  const kv = (k, v, cls = "", go = "") => `<div class="kv${go ? " go" : ""}"${go ? ` data-go="${go}"` : ""}><span>${esc(k)}</span><i></i><b class="${cls}">${v}</b></div>`;

  /** Tô màu JSON: trả về HTML đã escape */
  function hl(text) {
    let out = "", last = 0;
    const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
    for (let m; (m = re.exec(text)); ) {
      out += esc(text.slice(last, m.index));
      const cls = m[1] ? (m[2] ? "jk" : "js") : m[3] ? "jb" : "jn";
      out += `<span class="${cls}">${esc(m[1] || m[0])}</span>${m[2] ? esc(m[2]) : ""}`;
      last = re.lastIndex;
    }
    return out + esc(text.slice(last));
  }

  /* ================= cầu nối ================= */

  const native = typeof window.Native !== "undefined" ? window.Native : null;
  const waiting = new Map();
  let seq = 0;
  window.__nativeResolve = (id, json) => { const f = waiting.get(id); if (f) { waiting.delete(id); f(json); } };
  const ncall = (fn, ...args) => new Promise((resolve) => { const id = "r" + ++seq; waiting.set(id, resolve); native[fn](id, ...args); });

  async function webRequest(method, path, body) {
    const t0 = performance.now();
    try {
      const r = await fetch(path === "/healthz" ? "/healthz" : "/api" + path, {
        method, credentials: "same-origin",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: method === "GET" ? undefined : body || undefined,
      });
      return { status: r.status, text: await r.text(), ms: Math.round(performance.now() - t0) };
    } catch (e) { return { status: 0, error: String(e.message || e) }; }
  }

  /** Gọi thô: luôn trả { status, text, ms, error? }, không ném lỗi */
  async function request(method, path, body) {
    if (native) { try { return JSON.parse(await ncall("request", method, path, body || "")); } catch (e) { return { status: 0, error: String(e) }; } }
    return webRequest(method, path, body);
  }

  class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

  /** Gọi và parse JSON, lỗi thì ném ApiError với thông báo từ máy chủ */
  async function api(method, path, body) {
    const r = await request(method, path, body === undefined ? "" : JSON.stringify(body));
    if (r.status === 0) throw new ApiError(r.error || "Không kết nối được máy chủ", 0);
    let data = null;
    try { data = JSON.parse(r.text); } catch (_) { /* không phải JSON */ }
    if (r.status === 401) { showLogin("Phiên hết hạn hoặc sai tài khoản"); throw new ApiError("Chưa đăng nhập", 401); }
    if (r.status < 200 || r.status >= 300) throw new ApiError((data && data.error) || `HTTP ${r.status}`, r.status);
    return data;
  }
  const get = (p) => api("GET", p);
  const post = (p, b) => api("POST", p, b === undefined ? {} : b);

  /* ================= giao diện chung ================= */

  let cfg = { server: "", user: "", hasPass: false, lock: false, watch: false, secure: false, lockAvailable: false, version: "web" };

  function toast(msg, bad) {
    const box = $("#toast"), el = document.createElement("div");
    el.textContent = msg;
    if (bad) el.className = "bad";
    box.append(el);
    setTimeout(() => el.remove(), 2600);
  }
  const fail = (e) => toast(e.message || String(e), true);

  function copy(text, label = "Đã chép") {
    if (native) native.copy(text);
    else if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    toast(label);
  }

  let askDone = null;
  function openSheet(html) { $("#sheet").innerHTML = html; $("#sheetWrap").hidden = false; }
  function closeSheet() {
    $("#sheetWrap").hidden = true;
    $("#sheet").innerHTML = "";
    if (askDone) { const f = askDone; askDone = null; f(false); }
  }
  /** Hộp xác nhận của app (window.confirm không dùng được trong WebView này) */
  function ask(message, okLabel = "đồng ý") {
    return new Promise((resolve) => {
      openSheet(`<h4>xác nhận</h4><div class="sub">${esc(message)}</div>
        <div class="bar"><button class="btn danger" data-ask="1">${esc(okLabel)}</button><button class="btn" data-ask="0">huỷ</button></div>`);
      askDone = resolve;
    });
  }
  $("#sheetWrap").addEventListener("click", (e) => { if (e.target.id === "sheetWrap") closeSheet(); });

  /* ================= định tuyến + vòng lặp làm mới ================= */

  const TABS = ["overview", "users", "money", "logs", "api", "config"];
  const views = {};
  let tab = "overview";
  let timers = [];
  const every = (fn, ms) => { timers.push(setInterval(() => { if (!document.hidden) fn(); }, ms)); };
  const stopTimers = () => { timers.forEach(clearInterval); timers = []; };

  function go(name) {
    if (!views[name]) return;
    stopTimers();
    tab = name;
    try { localStorage.setItem("botctl.tab", name); } catch (_) {}
    for (const v of $$(".view")) v.hidden = v.id !== "v-" + name;
    for (const b of $$("#nav button")) b.classList.toggle("on", b.dataset.tab === name);
    window.scrollTo(0, 0);
    views[name].enter();
  }
  $("#nav").addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (b) go(b.dataset.tab); });

  /* ================= ping ================= */

  async function ping(quiet) {
    const h = $("#host"), r = await request("GET", "/healthz");
    const ok = r.status === 200;
    h.className = "host " + (ok ? "ok" : "bad");
    $("#lat").textContent = ok ? `${r.ms}ms` : "down";
    if (!quiet) toast(ok ? `pong ${r.ms}ms` : `Không kết nối được (${r.error || "HTTP " + r.status})`, !ok);
    return ok;
  }

  /* ================= overview ================= */

  views.overview = {
    el: $("#v-overview"),
    data: null,
    enter() { this.load(); every(() => this.load(), 15000); },
    async load() {
      try { this.data = await get("/admin/app/overview"); this.render(this.data); } catch (e) { if (!this.data) this.el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },
    render(d) {
      const s = d.server, u = d.users, b = d.bots, m = d.money, r = d.revenue;
      const peak = Math.max(1, ...r.daily.map((x) => Math.max(x.cash, x.spend)));
      const bars = r.daily.map((x) => `<div class="d" title="${esc(x.k)}: +${fmt(x.cash)} / -${fmt(x.spend)}"><i class="c" style="height:${Math.round((x.cash / peak) * 100)}%"></i><i class="s" style="height:${Math.round((x.spend / peak) * 100)}%"></i></div>`).join("");
      this.el.innerHTML = `
        <h3 class="sec">server</h3>
        <div class="card">
          ${kv("version", esc(s.version || "?"))}${kv("uptime", dur(s.uptime))}${kv("node", esc(s.node))}${kv("env", esc(s.env))}
          ${kv("memory", `${s.rssMb}MB rss · ${s.heapMb}MB heap`)}${kv("cập nhật", clock(s.now))}
        </div>

        <h3 class="sec">users &amp; bots</h3>
        <div class="tiles">
          <button class="tile" data-go="users"><small>users</small><b>${fmt(u.total)}</b><span>${fmt(u.active)} active · ${fmt(u.online)} online · ${fmt(u.admins)} admin</span></button>
          <button class="tile" data-go="users"><small>bots đang chạy</small><b class="${b.running ? "g" : ""}">${b.running ?? "—"}</b><span>fb ${b.fb ?? "—"} · zalo ${b.zalo ?? "—"}</span></button>
        </div>

        <h3 class="sec">money</h3>
        <div class="card">
          ${kv("lệnh nạp chờ duyệt", `${m.pendingDeposits ? `${fmt(m.pendingDeposits)} · ${fmt(m.pendingSum)}` : "0"}`, m.pendingDeposits ? "y" : "dim", "money:pending")}
          ${kv("tiền vào chưa khớp", m.unmatched ? `${fmt(m.unmatched)} · ${fmt(m.unmatchedSum)}đ` : "0", m.unmatched ? "r" : "dim", "money:bank")}
          ${kv("tự động cộng coin", m.autopay ? "on" : "off", m.autopay ? "g" : "y", "money:bank")}
          ${kv("coin miễn phí hôm nay", fmt(m.freeCoinToday))}
          ${kv("coin đang nằm trong ví", `${fmt(m.walletBalance)} · ${fmt(m.walletHolders)} ví`)}
        </div>

        <h3 class="sec">revenue</h3>
        <div class="card pad">
          ${kv("hôm nay", `<span class="g">+${fmt(r.today.cash)}</span> <span class="dim">/</span> <span class="pu">-${fmt(r.today.spend)}</span>`)}
          ${kv("7 ngày", `<span class="g">+${fmt(r.week.cash)}</span> <span class="dim">/</span> <span class="pu">-${fmt(r.week.spend)}</span>`)}
          ${kv("tháng này", `<span class="g">+${fmt(r.month.cash)}</span> <span class="dim">/</span> <span class="pu">-${fmt(r.month.spend)}</span>`)}
          <div class="spark">${bars}</div>
          <div class="legend"><span><b style="background:var(--g)"></b>tiền nạp</span><span><b style="background:var(--p)"></b>coin tiêu</span><span>14 ngày gần nhất</span></div>
        </div>

        <h3 class="sec">bank events</h3>
        ${d.events.length ? `<div class="rows">${d.events.map((e) => eventRow(e)).join("")}</div>` : '<div class="empty">chưa có giao dịch ngân hàng</div>'}`;
    },
  };

  const STATUS = { credited: ["đã cộng", "ok"], unmatched: ["chưa khớp", "bad"], ignored: ["bỏ qua", ""] };
  function eventRow(e, withAct) {
    const [label, cls] = STATUS[e.status] || [e.status, ""];
    return `<div class="row">
      <div class="l1"><b class="${e.status === "credited" ? "g" : ""}">+${fmt(e.amount)}</b><span class="tag ${cls}">${label}</span>${e.username ? `<span class="dim">${esc(e.username)}</span>` : ""}<span class="sp"></span><span class="dim">${ago(e.created_at)}</span></div>
      <div class="l2">${esc(e.content || "(không có nội dung)")}${e.note ? `<br>↳ ${esc(e.note)}` : ""}</div>
      ${withAct && e.status === "unmatched" ? `<div class="bar"><button class="btn sm primary" data-act="assign" data-id="${e.id}" data-amount="${e.amount}">gán cho tài khoản</button><button class="btn sm" data-act="ignoreEv" data-id="${e.id}">bỏ qua</button></div>` : ""}
    </div>`;
  }

  /* ================= users ================= */

  views.users = {
    el: $("#v-users"),
    list: [],
    q: "",
    enter() {
      this.el.innerHTML = `
        <div class="bar"><input id="uq" type="search" placeholder="lọc theo tên…" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(this.q)}"><button class="btn sm primary" data-act="newUser">+ user</button></div>
        <div id="uList"></div>`;
      $("#uq").addEventListener("input", (e) => { this.q = e.target.value.trim().toLowerCase(); this.draw(); });
      this.draw();
      this.load();
    },
    async load() {
      try { this.list = (await get("/admin/app/users")).users; this.draw(); } catch (e) { fail(e); }
    },
    draw() {
      const box = $("#uList");
      if (!box) return;
      const rows = this.list.filter((u) => !this.q || u.username.includes(this.q)).sort((a, b) => b.id - a.id);
      box.innerHTML = rows.length
        ? `<div class="rows">${rows.map((u) => {
            const bo = u.bots ? `fb ${u.bots.fbRunning}/${u.bots.fbTotal} · zalo ${u.bots.zaloRunning}/${u.bots.zaloTotal}` : "";
            return `<button class="row${u.active ? "" : " off"}" data-act="user" data-id="${u.id}">
              <div class="l1"><b>${esc(u.username)}</b>${u.role === "admin" ? '<span class="tag info">admin</span>' : ""}${u.active ? "" : '<span class="tag bad">locked</span>'}<span class="sp"></span><b class="y">${fmt(u.balance)}</b></div>
              <div class="l2">#${u.id} · login ${u.last_login ? ago(u.last_login) : "chưa"}${bo ? " · " + bo : ""}${u.plan_expires ? " · hạn " + esc(String(u.plan_expires).slice(0, 10)) : ""}</div>
            </button>`;
          }).join("")}</div>`
        : '<div class="empty">không có tài khoản nào</div>';
    },
    find(id) { return this.list.find((u) => u.id === Number(id)); },
  };

  function userSheet(u) {
    openSheet(`
      <h4>${esc(u.username)} ${u.role === "admin" ? '<span class="tag info">admin</span>' : ""}</h4>
      <div class="sub">#${u.id} · ${fmt(u.balance)} coin · tạo ${esc(String(u.created_at).slice(0, 10))}</div>
      <div class="act">
        <button class="btn" data-act="adjust" data-id="${u.id}">± chỉnh coin</button>
        <button class="btn" data-act="resetPw" data-id="${u.id}">🔑 đặt lại mật khẩu</button>
        <button class="btn ${u.active ? "danger" : "primary"}" data-act="toggle" data-id="${u.id}">${u.active ? "⏻ khoá tài khoản" : "⏻ mở khoá"}</button>
        <button class="btn danger" data-act="delUser" data-id="${u.id}">✕ xoá tài khoản</button>
      </div>`);
  }

  /* ================= money ================= */

  views.money = {
    el: $("#v-money"),
    seg: "pending",
    range: "week",
    enter(seg) {
      stopTimers();
      if (seg) this.seg = seg;
      this.el.innerHTML = `
        <div class="seg" id="mSeg">${[["pending", "chờ duyệt"], ["bank", "ngân hàng"], ["link", "vượt link"]].map(([k, l]) => `<button data-seg="${k}" class="${k === this.seg ? "on" : ""}">${l}</button>`).join("")}</div>
        <div id="mBody"><div class="empty">đang tải…</div></div>`;
      this.load();
      every(() => this.load(true), 20000);
    },
    async load() {
      try {
        if (this.seg === "pending") await this.pending();
        else if (this.seg === "bank") await this.bank();
        else await this.link();
      } catch (e) { const b = $("#mBody"); if (b && !b.dataset.ok) b.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    },
    async pending() {
      const { deposits } = await get("/admin/deposits");
      const list = [...deposits].sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || b.id - a.id).slice(0, 60);
      const S = { pending: ["chờ", "warn"], paid: ["đã duyệt", "ok"], cancelled: ["đã huỷ", ""] };
      $("#mBody").dataset.ok = "1";
      $("#mBody").innerHTML = list.length
        ? `<div class="rows">${list.map((d) => `<div class="row">
            <div class="l1"><b>${esc(d.username)}</b><span class="tag ${S[d.status][1]}">${S[d.status][0]}</span><span class="sp"></span><b class="y">${fmt(d.amount)}</b></div>
            <div class="l2">${esc(d.code)} · ${ago(d.created_at)}${d.note ? " · " + esc(d.note) : ""}</div>
            ${d.status === "pending" ? `<div class="bar"><button class="btn sm primary" data-act="approve" data-id="${d.id}">✓ duyệt</button><button class="btn sm danger" data-act="cancelDep" data-id="${d.id}">✕ huỷ</button></div>` : ""}
          </div>`).join("")}</div>`
        : '<div class="empty">không có lệnh nạp nào</div>';
    },
    async bank() {
      const d = await get("/admin/autopay");
      $("#mBody").dataset.ok = "1";
      $("#mBody").innerHTML = `
        <div class="card">
          <div class="switch"><div class="t">tự động cộng coin khi nạp<small>${d.today.n} giao dịch hôm nay · ${fmt(d.today.sum)} coin${d.unmatched ? ` · <span class="r">${d.unmatched} chưa khớp</span>` : ""}</small></div><input type="checkbox" id="apOn"${d.enabled ? " checked" : ""}></div>
        </div>
        <h3 class="sec">webhook</h3>
        <div class="card pad">
          <div class="field"><label>url</label><input readonly value="${esc(d.url)}"></div>
          <div class="bar"><button class="btn sm" data-act="copy" data-v="${esc(d.url)}">chép url</button><button class="btn sm" data-act="copy" data-v="${esc(d.secret)}">chép mã bí mật</button></div>
          <div class="hint">Dán vào SePay (API Key) hoặc Casso (Security Key). Mã bí mật không hiện ra màn hình.</div>
        </div>
        <h3 class="sec">giao dịch gần đây</h3>
        ${d.events.length ? `<div class="rows">${d.events.map((e) => eventRow(e, true)).join("")}</div>` : '<div class="empty">chưa nhận được giao dịch nào</div>'}`;
    },
    async link() {
      const d = await get("/admin/linkstats?range=" + this.range);
      const t = d.total, known = d.has_cash;
      $("#mBody").dataset.ok = "1";
      $("#mBody").innerHTML = `
        <div class="chips">${[["today", "hôm nay"], ["week", "7 ngày"], ["month", "30 ngày"], ["all", "tất cả"]].map(([k, l]) => `<button class="chip${k === this.range ? " on" : ""}" data-range="${k}">${l}</button>`).join("")}</div>
        <div class="card">
          ${kv("lượt vượt", fmt(t.n))}${kv("coin phát ra", fmt(t.coin), "pu")}${kv("tiền thu về", known ? fmt(t.cash) + "đ" : "—", "g")}
          ${kv("chênh lệch", known ? (t.diff >= 0 ? "+" : "−") + fmt(Math.abs(t.diff)) + "đ" : "—", known ? (t.diff < 0 ? "r" : "g") : "dim")}
        </div>
        <h3 class="sec">nhà cung cấp</h3>
        ${d.providers.length ? `<div class="rows">${d.providers.map((p) => `<div class="row">
          <div class="l1"><b>${esc(p.name)}</b>${p.src === "api" ? '<span class="tag ok">api</span>' : p.src === "rate" ? '<span class="tag warn">ước tính</span>' : ""}${p.active ? "" : '<span class="tag">off</span>'}<span class="sp"></span><b>${fmt(p.n)} lượt</b></div>
          <div class="l2">coin ${fmt(p.coin)} · tiền ${p.src ? fmt(p.cash) + "đ" : "—"}${p.src ? ` · <span class="${p.diff < 0 ? "r" : "g"}">${p.diff < 0 ? "lỗ" : "lãi"} ${fmt(Math.abs(p.diff))}đ</span>` : ""}</div>
        </div>`).join("")}</div>` : '<div class="empty">chưa có nhà cung cấp</div>'}
        <h3 class="sec">vượt nhiều bất thường (${d.suspects.total})</h3>
        ${d.suspects.list.length ? `<div class="rows">${d.suspects.list.slice(0, 12).map((u) => `<div class="row">
          <div class="l1"><b>${esc(u.username)}</b><span class="tag ${u.reasons.length >= 2 ? "bad" : "warn"}">${u.reasons.length} dấu hiệu</span><span class="sp"></span><span>${fmt(u.n)} lượt</span></div>
          <div class="l2">${u.reasons.map((r) => "• " + esc(r)).join("<br>")}</div></div>`).join("")}</div>` : '<div class="empty">không có ai bất thường</div>'}`;
    },
  };

  $("#v-money").addEventListener("click", (e) => {
    const s = e.target.closest("button[data-seg]");
    if (s) { views.money.seg = s.dataset.seg; views.money.enter(); return; }
    const r = e.target.closest("button[data-range]");
    if (r) { views.money.range = r.dataset.range; views.money.load(); }
  });
  $("#v-money").addEventListener("change", async (e) => {
    if (e.target.id !== "apOn") return;
    try { await post("/admin/autopay", { enabled: e.target.checked }); toast(e.target.checked ? "Đã bật tự động cộng coin" : "Đã tắt tự động cộng coin"); }
    catch (err) { fail(err); }
    views.money.load();
  });

  /* ================= logs ================= */

  views.logs = {
    el: $("#v-logs"),
    lines: [],
    last: 0,
    lvl: "",
    paused: false,
    enter() {
      this.el.innerHTML = `
        <div class="chips" id="lgChips">${[["", "all"], ["warn", "warn"], ["error", "error"]].map(([k, l]) => `<button class="chip${k === this.lvl ? " on" : ""}" data-lvl="${k}">${l}</button>`).join("")}
          <button class="chip" data-act="logPause" id="lgPause">${this.paused ? "▶ tiếp tục" : "❚❚ dừng"}</button><button class="chip" data-act="logCopy">chép</button><button class="chip" data-act="logClear">xoá</button></div>
        <div class="logbox" id="logBox"></div>`;
      this.draw(true);
      this.pull();
      every(() => this.pull(), 3000);
    },
    async pull() {
      if (this.paused) return;
      try {
        const d = await get(`/admin/app/logs?after=${this.last}&limit=300`);
        this.last = d.last;
        if (d.lines.length) { this.lines.push(...d.lines); if (this.lines.length > 800) this.lines.splice(0, this.lines.length - 800); this.draw(); }
      } catch (e) { /* lần sau thử lại */ }
    },
    draw(force) {
      const box = $("#logBox");
      if (!box) return;
      const stick = force || box.scrollHeight - box.scrollTop - box.clientHeight < 40;
      const shown = this.lines.filter((l) => !this.lvl || (this.lvl === "warn" ? l.lvl !== "info" : l.lvl === "error"));
      box.innerHTML = shown.length
        ? shown.map((l) => `<div class="ln ${l.lvl}"><span class="tm">${clock(l.t)}</span> ${esc(l.msg)}</div>`).join("")
        : '<div class="dim">// chưa có log</div>';
      if (stick) box.scrollTop = box.scrollHeight;
    },
  };
  $("#v-logs").addEventListener("click", (e) => {
    const c = e.target.closest("button[data-lvl]");
    if (!c) return;
    views.logs.lvl = c.dataset.lvl;
    for (const x of $$("#lgChips [data-lvl]")) x.classList.toggle("on", x === c);
    views.logs.draw(true);
  });

  /* ================= api console ================= */

  const PRESETS = [["overview", "GET", "/admin/app/overview"], ["users", "GET", "/admin/app/users"], ["deposits", "GET", "/admin/deposits"], ["autopay", "GET", "/admin/autopay"],
    ["linkstats", "GET", "/admin/linkstats?range=week"], ["revenue", "GET", "/admin/stats"], ["settings", "GET", "/admin/settings"], ["healthz", "GET", "/healthz"]];
  const hist = () => { try { return JSON.parse(localStorage.getItem("botctl.hist") || "[]"); } catch (_) { return []; } };

  views.api = {
    el: $("#v-api"),
    enter() {
      const h = hist();
      this.el.innerHTML = `
        <div class="chips">${PRESETS.map(([n, m, p], i) => `<button class="chip" data-preset="${i}">${n}</button>`).join("")}</div>
        <div class="bar"><select id="aM" style="flex:0 0 5.6rem;width:5.6rem"><option>GET</option><option>POST</option><option>DELETE</option></select><input id="aP" type="text" value="${esc(h[0]?.p || "/admin/app/overview")}" autocapitalize="off" spellcheck="false"></div>
        <textarea id="aB" placeholder='body JSON (POST)  vd: {"enabled":true}' spellcheck="false" hidden></textarea>
        <div class="bar"><button class="btn primary" data-act="send">$ send</button><button class="btn sm" data-act="copyResp">chép phản hồi</button></div>
        <div id="aOut"></div>
        ${h.length ? `<h3 class="sec">lịch sử</h3><div class="rows">${h.map((x, i) => `<button class="row" data-hist="${i}"><div class="l1"><span class="tag info">${esc(x.m)}</span><b>${esc(x.p)}</b></div></button>`).join("")}</div>` : ""}`;
      $("#aM").addEventListener("change", () => { $("#aB").hidden = $("#aM").value !== "POST"; });
      if (h[0]) { $("#aM").value = h[0].m; $("#aB").value = h[0].b || ""; $("#aB").hidden = h[0].m !== "POST"; }
    },
    last: "",
    async send() {
      const m = $("#aM").value, p = $("#aP").value.trim(), b = $("#aB").value.trim();
      if (!p.startsWith("/")) return toast("Đường dẫn phải bắt đầu bằng /", true);
      if (m === "POST" && b) { try { JSON.parse(b); } catch (_) { return toast("Body không phải JSON hợp lệ", true); } }
      if (m === "DELETE" && !(await ask(`DELETE ${p} ?`, "gửi DELETE"))) return;
      $("#aOut").innerHTML = '<div class="hint">đang gửi…</div>';
      const r = await request(m, p, m === "POST" ? b || "{}" : "");
      let body = r.text || "", pretty = body;
      try { pretty = JSON.stringify(JSON.parse(body), null, 2); } catch (_) { /* giữ nguyên */ }
      this.last = r.error ? r.error : pretty;
      const cls = r.status >= 200 && r.status < 300 ? "ok" : r.status === 0 ? "bad" : "warn";
      $("#aOut").innerHTML = `<div class="resp"><span class="tag ${cls}">${r.status || "ERR"}</span><span class="dim">${r.ms ?? 0}ms · ${body.length.toLocaleString("vi-VN")} B</span></div>
        <div class="json">${r.error ? `<span class="r">${esc(r.error)}</span>` : hl(pretty)}</div>`;
      const h = hist().filter((x) => !(x.m === m && x.p === p)); h.unshift({ m, p, b: m === "POST" ? b : "" });
      try { localStorage.setItem("botctl.hist", JSON.stringify(h.slice(0, 12))); } catch (_) {}
    },
  };
  $("#v-api").addEventListener("click", (e) => {
    const pr = e.target.closest("[data-preset]");
    if (pr) { const [, m, p] = PRESETS[pr.dataset.preset]; $("#aM").value = m; $("#aP").value = p; $("#aB").hidden = true; views.api.send(); return; }
    const hi = e.target.closest("[data-hist]");
    if (hi) { const x = hist()[hi.dataset.hist]; $("#aM").value = x.m; $("#aP").value = x.p; $("#aB").value = x.b || ""; $("#aB").hidden = x.m !== "POST"; window.scrollTo(0, 0); }
  });

  /* ================= config ================= */

  views.config = {
    el: $("#v-config"),
    enter() {
      const c = cfg, can = !!native;
      this.el.innerHTML = `
        <h3 class="sec">kết nối</h3>
        <div class="card pad">
          <div class="field"><label>server</label><input id="cS" value="${esc(c.server)}" ${can ? "" : "disabled"} autocapitalize="off" spellcheck="false"></div>
          <div class="field"><label>user</label><input id="cU" value="${esc(c.user)}" ${can ? "" : "disabled"} autocapitalize="off" spellcheck="false"></div>
          <div class="field"><label>pass</label><input id="cP" type="password" placeholder="${c.hasPass ? "•••••••• (giữ nguyên nếu để trống)" : ""}" ${can ? "" : "disabled"}></div>
          <div class="bar"><button class="btn primary" data-act="saveCfg" ${can ? "" : "disabled"}>$ lưu &amp; kết nối lại</button><button class="btn" data-act="ping">ping</button></div>
          ${can ? "" : '<div class="hint">Đang chạy trong trình duyệt: dùng phiên đăng nhập của trang web. Phần kết nối chỉ có trong app Android.</div>'}
        </div>
        <h3 class="sec">bảo mật &amp; thông báo</h3>
        <div class="card">
          <div class="switch"><div class="t">khoá app<small>${c.lockAvailable || !can ? "hỏi mật khẩu / vân tay của máy khi mở lại app" : "máy chưa đặt khoá màn hình"}</small></div><input type="checkbox" data-flag="lock" ${c.lock ? "checked" : ""} ${can && c.lockAvailable ? "" : "disabled"}></div>
          <div class="switch"><div class="t">thông báo nền<small>mỗi ~15 phút kiểm tra tiền vào, giao dịch chưa khớp, lệnh nạp chờ duyệt</small></div><input type="checkbox" data-flag="watch" ${c.watch ? "checked" : ""} ${can ? "" : "disabled"}></div>
          <div class="switch"><div class="t">chặn chụp màn hình<small>ẩn nội dung trong ảnh chụp và danh sách app gần đây</small></div><input type="checkbox" data-flag="secure" ${c.secure ? "checked" : ""} ${can ? "" : "disabled"}></div>
        </div>
        <h3 class="sec">phiên</h3>
        <div class="bar"><button class="btn danger" data-act="logout" ${can ? "" : "disabled"}>$ logout</button></div>
        <div class="ver">botctl ${esc(c.version)}${native ? " · android " + esc(c.sdk) : " · web"}</div>`;
    },
  };
  $("#v-config").addEventListener("change", async (e) => {
    const f = e.target.dataset.flag;
    if (!f || !native) return;
    const on = e.target.checked;
    if (f === "watch" && on) {
      const r = JSON.parse(await ncall("requestNotify"));
      if (!r.ok) { e.target.checked = false; return toast("Chưa được cấp quyền gửi thông báo", true); }
    }
    native.setFlag(f, on);
    cfg[f] = on;
    toast(on ? "đã bật" : "đã tắt");
  });

  /* ================= bảng lệnh ================= */

  const COMMANDS = [
    ...TABS.map((t) => ({ n: "go " + t, h: "chuyển tab", run: () => go(t) })),
    { n: "ping", h: "kiểm tra máy chủ", run: () => ping() },
    { n: "duyệt lệnh nạp", h: "money › chờ duyệt", run: () => { go("money"); views.money.seg = "pending"; views.money.enter(); } },
    { n: "giao dịch chưa khớp", h: "money › ngân hàng", run: () => { go("money"); views.money.seg = "bank"; views.money.enter(); } },
    { n: "thống kê vượt link", h: "money › vượt link", run: () => { go("money"); views.money.seg = "link"; views.money.enter(); } },
    { n: "logs lỗi", h: "logs › error", run: () => { views.logs.lvl = "error"; go("logs"); } },
    { n: "tải lại dữ liệu", h: "làm mới tab hiện tại", run: () => go(tab) },
    { n: "thêm user", h: "tạo tài khoản mới", run: () => { go("users"); newUserSheet(); } },
  ];
  let palSel = 0;
  function palDraw() {
    const q = $("#palIn").value.trim().toLowerCase();
    const list = COMMANDS.filter((c) => !q || c.n.includes(q) || c.h.includes(q));
    palSel = Math.min(palSel, Math.max(0, list.length - 1));
    $("#palList").innerHTML = list.map((c, i) => `<button class="${i === palSel ? "sel" : ""}" data-cmd="${COMMANDS.indexOf(c)}"><b>${esc(c.n)}</b><small>${esc(c.h)}</small></button>`).join("") || '<div class="hint" style="padding:.8rem .9rem">không có lệnh khớp</div>';
    return list;
  }
  const openPalette = () => { $("#palette").hidden = false; $("#palIn").value = ""; palSel = 0; palDraw(); setTimeout(() => $("#palIn").focus(), 30); };
  const closePalette = () => { $("#palette").hidden = true; $("#palIn").blur(); };
  $("#palIn").addEventListener("input", () => { palSel = 0; palDraw(); });
  $("#palIn").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const l = palDraw(); if (l[palSel]) { closePalette(); l[palSel].run(); } }
    if (e.key === "Escape") closePalette();
  });
  $("#palette").addEventListener("click", (e) => {
    if (e.target.id === "palette") return closePalette();
    const b = e.target.closest("[data-cmd]");
    if (b) { closePalette(); COMMANDS[b.dataset.cmd].run(); }
  });

  /* ================= hành động (ủy quyền sự kiện) ================= */

  function newUserSheet() {
    openSheet(`<h4>tạo tài khoản</h4><div class="sub">tên 3-24 ký tự a-z 0-9 . _ -, mật khẩu từ 8 ký tự</div>
      <div class="field"><label>username</label><input id="nuU" autocapitalize="off" spellcheck="false"></div>
      <div class="field"><label>password</label><input id="nuP" type="text" autocapitalize="off" spellcheck="false"></div>
      <div class="field"><label>role</label><select id="nuR"><option value="user">user</option><option value="admin">admin</option></select></div>
      <div class="bar"><button class="btn primary" data-act="createUser">$ create</button><button class="btn" data-act="closeSheet">huỷ</button></div>`);
  }

  const actions = {
    ping: () => ping(),
    palette: openPalette,
    closeSheet,
    copy: (el) => copy(el.dataset.v),
    unlock: () => unlock(),
    user: (el) => { const u = views.users.find(el.dataset.id); if (u) userSheet(u); },
    newUser: newUserSheet,
    async createUser() {
      try {
        await post("/admin/users", { username: $("#nuU").value.trim(), password: $("#nuP").value, role: $("#nuR").value });
        closeSheet(); toast("Đã tạo tài khoản"); views.users.load();
      } catch (e) { fail(e); }
    },
    adjust(el) {
      const u = views.users.find(el.dataset.id);
      openSheet(`<h4>chỉnh coin · ${esc(u.username)}</h4><div class="sub">hiện có ${fmt(u.balance)} coin. Số âm để trừ.</div>
        <div class="field"><label>số coin (+/−)</label><input id="adA" inputmode="numeric" placeholder="vd 50000 hoặc -20000"></div>
        <div class="field"><label>ghi chú</label><input id="adN" maxlength="80"></div>
        <div class="bar"><button class="btn primary" data-act="doAdjust" data-id="${u.id}">$ apply</button><button class="btn" data-act="closeSheet">huỷ</button></div>`);
    },
    async doAdjust(el) {
      const u = views.users.find(el.dataset.id);
      try {
        const r = await post("/admin/wallet/adjust", { username: u.username, amount: Number($("#adA").value), note: $("#adN").value });
        closeSheet(); toast(`Số dư mới: ${fmt(r.balance)}`); views.users.load();
      } catch (e) { fail(e); }
    },
    resetPw(el) {
      const u = views.users.find(el.dataset.id);
      openSheet(`<h4>đặt lại mật khẩu · ${esc(u.username)}</h4><div class="sub">tối thiểu 8 ký tự</div>
        <div class="field"><label>mật khẩu mới</label><input id="rpP" type="text" autocapitalize="off" spellcheck="false"></div>
        <div class="bar"><button class="btn primary" data-act="doReset" data-id="${u.id}">$ set</button><button class="btn" data-act="closeSheet">huỷ</button></div>`);
    },
    async doReset(el) {
      try { await post(`/admin/users/${el.dataset.id}/password`, { password: $("#rpP").value }); closeSheet(); toast("Đã đổi mật khẩu"); } catch (e) { fail(e); }
    },
    async toggle(el) {
      const u = views.users.find(el.dataset.id);
      try { await post(`/admin/users/${u.id}/active`, { active: u.active ? 0 : 1 }); closeSheet(); toast(u.active ? "Đã khoá" : "Đã mở khoá"); views.users.load(); } catch (e) { fail(e); }
    },
    async delUser(el) {
      const u = views.users.find(el.dataset.id);
      if (!(await ask(`Xoá tài khoản ${u.username}? Không hoàn tác được.`, "xoá"))) return;
      try { await api("DELETE", `/admin/users/${u.id}`); closeSheet(); toast("Đã xoá"); views.users.load(); } catch (e) { fail(e); }
    },
    async approve(el) {
      try { const r = await post(`/admin/deposits/${el.dataset.id}/approve`); toast(`Đã duyệt${r && r.amount ? " +" + fmt(r.amount) : ""}`); views.money.load(); } catch (e) { fail(e); }
    },
    async cancelDep(el) {
      if (!(await ask("Huỷ lệnh nạp này?", "huỷ lệnh"))) return;
      try { await post(`/admin/deposits/${el.dataset.id}/cancel`); toast("Đã huỷ"); views.money.load(); } catch (e) { fail(e); }
    },
    assign(el) {
      openSheet(`<h4>gán +${fmt(el.dataset.amount)} cho tài khoản</h4><div class="sub">Coin được cộng như một lần nạp thật.</div>
        <div class="field"><label>username</label><input id="asU" autocapitalize="off" spellcheck="false"></div>
        <div class="bar"><button class="btn primary" data-act="doAssign" data-id="${el.dataset.id}">$ assign</button><button class="btn" data-act="closeSheet">huỷ</button></div>`);
    },
    async doAssign(el) {
      try { const r = await post(`/admin/autopay/events/${el.dataset.id}/assign`, { username: $("#asU").value }); closeSheet(); toast(`Đã cộng ${fmt(r.amount)} coin`); views.money.load(); } catch (e) { fail(e); }
    },
    async ignoreEv(el) {
      try { await post(`/admin/autopay/events/${el.dataset.id}/ignore`); toast("Đã bỏ qua"); views.money.load(); } catch (e) { fail(e); }
    },
    logPause() { views.logs.paused = !views.logs.paused; $("#lgPause").textContent = views.logs.paused ? "▶ tiếp tục" : "❚❚ dừng"; },
    logCopy() { copy(views.logs.lines.map((l) => `${clock(l.t)} ${l.lvl} ${l.msg}`).join("\n"), "Đã chép log"); },
    logClear() { views.logs.lines = []; views.logs.draw(true); },
    send: () => views.api.send(),
    copyResp: () => copy(views.api.last || "", "Đã chép phản hồi"),
    async saveCfg() {
      if (!native) return;
      const r = JSON.parse(native.saveConfig($("#cS").value, $("#cU").value, $("#cP").value));
      if (!r.ok) return toast(r.error, true);
      const l = JSON.parse(await ncall("login"));
      if (!l.ok) return toast(l.error || "Đăng nhập thất bại", true);
      cfg = JSON.parse(native.config());
      $("#hostName").textContent = hostOf(cfg.server);
      toast("Đã kết nối");
      ping(true);
    },
    async logout() {
      if (!(await ask("Đăng xuất và xoá mật khẩu đã lưu trong máy?", "đăng xuất"))) return;
      native.logout();
      cfg = JSON.parse(native.config());
      showLogin();
    },
  };

  document.addEventListener("click", (e) => {
    const k = e.target.closest("[data-ask]");
    if (k) { const f = askDone; askDone = null; closeSheet(); if (f) f(k.dataset.ask === "1"); return; }
    const g = e.target.closest("[data-go]");
    if (g) {
      const [t, seg] = g.dataset.go.split(":");
      if (seg) views.money.seg = seg;
      go(t);
      return;
    }
    const a = e.target.closest("[data-act]");
    if (a && actions[a.dataset.act]) { e.preventDefault(); actions[a.dataset.act](a, e); }
  });

  /* ================= đăng nhập, khoá, khởi động ================= */

  const hostOf = (u) => String(u || "").replace(/^https?:\/\//, "") || "chưa kết nối";

  function showLogin(err) {
    stopTimers();
    $("#lock").hidden = true;
    $("#login").hidden = false;
    $("#lgServer").value = cfg.server || (native ? "" : location.origin);
    $("#lgServer").parentElement.hidden = !native;
    $("#lgUser").value = cfg.user || "";
    $("#lgPass").value = "";
    $("#lgErr").textContent = err || "";
  }

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#lgBtn"), err = $("#lgErr");
    err.textContent = "";
    btn.disabled = true;
    btn.textContent = "… đang kết nối";
    try {
      if (native) {
        const s = JSON.parse(native.saveConfig($("#lgServer").value, $("#lgUser").value, $("#lgPass").value));
        if (!s.ok) throw new Error(s.error);
        const l = JSON.parse(await ncall("login"));
        if (!l.ok) throw new Error(l.error || "Đăng nhập thất bại");
        cfg = JSON.parse(native.config());
      } else {
        const r = await webRequest("POST", "/login", JSON.stringify({ username: $("#lgUser").value.trim(), password: $("#lgPass").value }));
        const j = JSON.parse(r.text || "{}");
        if (r.status !== 200) throw new Error(j.error || `HTTP ${r.status}`);
        if (j.role !== "admin") throw new Error("Tài khoản này không phải admin");
      }
      $("#login").hidden = true;
      start();
    } catch (ex) { err.textContent = ex.message; }
    btn.disabled = false;
    btn.textContent = "$ connect";
  });

  let hiddenAt = 0, locking = false;
  async function unlock() {
    if (locking) return;
    locking = true;
    const r = native ? JSON.parse(await ncall("unlock")) : { ok: true };
    locking = false;
    if (r.ok) $("#lock").hidden = true;
  }
  function lock() {
    if (!native || !cfg.lock || !$("#login").hidden) return;
    $("#lock").hidden = false;
    unlock();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 30000) lock();
    views[tab] && tab !== "logs" && tab !== "api" && tab !== "config" && views[tab].load && views[tab].load();
  });

  /** Nút Back của Android: đóng lớp phủ trước, rồi về tab đầu, hết thì thoát app */
  window.__onBack = () => {
    if (!$("#palette").hidden) { closePalette(); return true; }
    if (!$("#sheetWrap").hidden) { closeSheet(); return true; }
    if (!$("#lock").hidden || !$("#login").hidden) return false;
    if (tab !== "overview") { go("overview"); return true; }
    return false;
  };

  /* chấm đỏ số việc cần xử lý trên tab money */
  async function badge() {
    try {
      const a = await get("/admin/app/alerts?after=999999999");
      const n = a.pendingDeposits + a.unmatched;
      let b = $("#nav [data-tab=money] .badge");
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement("em"); b.className = "badge"; b.style.fontStyle = "normal"; $("#nav [data-tab=money]").append(b); }
      b.textContent = n > 99 ? "99+" : n;
    } catch (_) {}
  }

  let started = false;
  function start() {
    $("#hostName").textContent = hostOf(native ? cfg.server : location.origin);
    ping(true);
    badge();
    if (!started) { started = true; setInterval(() => { if (!document.hidden && $("#login").hidden) { badge(); ping(true); } }, 20000); }
    let saved = "overview";
    try { saved = localStorage.getItem("botctl.tab") || "overview"; } catch (_) {}
    go(TABS.includes(saved) ? saved : "overview");
  }

  async function boot() {
    if (native) {
      try { cfg = JSON.parse(native.config()); } catch (_) {}
      if (!cfg.server || !cfg.user || !cfg.hasPass) return showLogin();
      if (cfg.lock) { $("#lock").hidden = false; unlock(); }
      const l = JSON.parse(await ncall("login"));
      if (!l.ok) return showLogin(l.error);
      start();
    } else {
      const me = await webRequest("GET", "/me");
      let role = "";
      try { role = JSON.parse(me.text).role; } catch (_) {}
      if (me.status !== 200 || role !== "admin") return showLogin(me.status === 200 ? "Tài khoản này không phải admin" : "");
      start();
    }
  }
  boot();
})();
