/* Tab "Shop acc": mua acc game bằng coin, mua acc random, xem lại acc đã mua; admin quản lý kho.
   Dùng hàm có sẵn của app.js / dialog.js: $, api, say, esc, confirmBox. */
(() => {
  const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");
  const num = (s) => Number(String(s).replace(/[^\d]/g, "")) || 0;
  // esc của app.js không đổi dấu nháy; ở đây có dùng trong thuộc tính HTML nên dùng bản đầy đủ
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Chèn nút tab + khung nội dung ---------- */
  const btn = document.createElement("button");
  btn.dataset.tab = "shop";
  btn.textContent = "Shop acc";
  const anchor = $("tabs").querySelector('[data-tab="linkcoin"]') || $("tabs").querySelector('[data-tab="wallet"]');
  anchor ? anchor.after(btn) : $("tabs").appendChild(btn);

  const tab = document.createElement("div");
  tab.className = "tab";
  tab.id = "tab-shop";
  tab.hidden = true;
  tab.innerHTML = `
    <section>
      <div class="wallet-hero">
        <div class="wallet-label">Số dư ví</div>
        <div class="wallet-balance"><b id="shBalance">0</b><span>coin</span></div>
        <div class="wallet-stats">
          <div><small>Acc đang bán</small><strong id="shCount">0</strong></div>
          <div><small>Acc đã mua</small><strong id="shMine">0</strong></div>
        </div>
      </div>
    </section>

    <section id="shRandomBox">
      <h2>Acc random</h2>
      <p>Trả một mức giá cố định và nhận ngẫu nhiên 1 acc trong kho của game. Bạn không biết trước là acc gì, có thể ra acc xịn hơn giá tiền. Tài khoản, mật khẩu hiện ngay sau khi mua.</p>
      <div class="sh-random" id="shRandom"><div class="empty loading">Đang tải…</div></div>
    </section>

    <section>
      <h2>Acc có sẵn</h2>
      <div class="chips" id="shGames"></div>
      <div class="sh-grid" id="shList"><div class="empty loading">Đang tải…</div></div>
    </section>

    <section>
      <h2>Acc đã mua</h2>
      <p>Tài khoản và mật khẩu chỉ hiện với bạn. Nên đổi mật khẩu ngay sau khi nhận acc.</p>
      <div class="users" id="shOrders"><div class="empty loading">Đang tải…</div></div>
    </section>

    <section id="shAdmin" hidden>
      <h2>Quản lý shop (admin)</h2>
      <p>Tài khoản và mật khẩu được mã hoá ngay trên server trước khi lưu vào database. Sau khi thêm, hệ thống không hiển thị lại mật khẩu cho ai, kể cả admin. Chỉ người mua mới nhận được.</p>

      <div class="sh-stats" id="shTotals"></div>

      <h3 class="sh-h3">Game</h3>
      <div class="users" id="shGameAdmin"></div>
      <form class="lc-card" id="shGameForm" autocomplete="off">
        <h3 id="shGameTitle">Thêm game</h3>
        <input type="hidden" id="shGameId">
        <div class="lc-grid">
          <div class="field"><label for="shGameName">Tên game</label><input type="text" id="shGameName" maxlength="40" placeholder="Liên Quân Mobile"></div>
          <div class="field"><label for="shGameEmoji">Biểu tượng</label><input type="text" id="shGameEmoji" maxlength="4" placeholder="🎮"></div>
          <div class="field"><label for="shGamePrice">Giá random</label><input type="text" id="shGamePrice" inputmode="numeric" placeholder="0 = tắt"></div>
        </div>
        <label class="lc-check"><input type="checkbox" id="shGameActive" checked> Đang mở bán</label>
        <div class="row">
          <button type="submit" class="primary" id="shGameSave">Lưu game</button>
          <button type="button" id="shGameCancel" hidden>Huỷ sửa</button>
        </div>
      </form>

      <h3 class="sh-h3">Thêm acc lên kho</h3>
      <form class="lc-card" id="shAccForm" autocomplete="off">
        <div class="lc-grid sh-two">
          <div class="field"><label for="shAccGame">Game</label><select id="shAccGame"></select></div>
          <div class="field"><label for="shAccKind">Loại</label>
            <select id="shAccKind"><option value="normal">Acc thường (có giá riêng)</option><option value="random">Acc random (kho random)</option></select>
          </div>
        </div>
        <div class="field" id="shTitleBox"><label for="shAccTitle">Tiêu đề</label><input type="text" id="shAccTitle" maxlength="80" placeholder="Rank Cao Thủ, 80 tướng, 150 skin"></div>
        <div class="field" id="shPriceBox"><label for="shAccPrice">Giá (coin)</label><input type="text" id="shAccPrice" inputmode="numeric" placeholder="50000"></div>
        <div class="field" id="shDescBox"><label for="shAccDesc">Mô tả (không bắt buộc)</label><textarea id="shAccDesc" rows="3" maxlength="1000" placeholder="Liên kết, rank, tướng, skin, đá quý…"></textarea></div>
        <div class="field" id="shImgBox"><label for="shAccImg">Link ảnh (https, không bắt buộc)</label><input type="text" id="shAccImg" inputmode="url" autocapitalize="off" spellcheck="false"></div>
        <div class="field">
          <label for="shAccLines">Tài khoản</label>
          <textarea id="shAccLines" rows="5" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="taikhoan|matkhau&#10;taikhoan2|matkhau2|thông tin thêm"></textarea>
          <div class="hint" id="shLinesHint">Mỗi dòng một acc: <code>tài_khoản|mật_khẩu</code> hoặc <code>tài_khoản:mật_khẩu</code>. Có thể thêm <code>|thông tin thêm</code> (mail khôi phục, mã 2FA…). Nếu mật khẩu có dấu <code>|</code> thì dùng dấu <code>:</code> làm phân cách.</div>
        </div>
        <div class="row"><button type="submit" class="primary" id="shAccSave">Mã hoá &amp; thêm vào kho</button></div>
      </form>

      <h3 class="sh-h3">Kho acc</h3>
      <div class="chips" id="shFilter">
        <button type="button" data-st="" class="on">Tất cả</button>
        <button type="button" data-st="available">Đang bán</button>
        <button type="button" data-st="hidden">Đang ẩn</button>
        <button type="button" data-st="sold">Đã bán</button>
      </div>
      <div class="users" id="shStock"></div>

      <h3 class="sh-h3">Đơn mới nhất</h3>
      <div class="users" id="shSales"></div>
    </section>`;
  const after = $("tab-linkcoin") || $("tab-wallet");
  after ? after.after(tab) : document.body.appendChild(tab);

  /* ---------- Hộp hiển thị tài khoản vừa mua ---------- */

  async function copy(t) {
    try { await navigator.clipboard.writeText(t); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = t; ta.style.cssText = "position:fixed;opacity:0";
      document.body.append(ta); ta.select();
      try { document.execCommand("copy"); } catch (_) {}
      ta.remove();
    }
    say("Đã sao chép");
  }

  function showCreds(order, c) {
    const old = document.querySelector(".sh-modal-scrim");
    old?.remove();
    const scrim = document.createElement("div");
    scrim.className = "sh-modal-scrim";
    const row = (label, val, key) => val
      ? `<div class="sh-cred"><small>${label}</small><div><code data-v="${key}"></code><button type="button" data-copy="${key}">Sao chép</button></div></div>` : "";
    scrim.innerHTML = `
      <div class="sh-modal" role="dialog" aria-modal="true" aria-label="Thông tin acc">
        <h3>${esc(order.title)}</h3>
        <p class="sh-sub">${esc(order.game)} · mã đơn <b>${esc(order.code)}</b></p>
        ${row("Tài khoản", c.username, "username")}
        ${row("Mật khẩu", c.password, "password")}
        ${row("Thông tin thêm", c.extra, "extra")}
        <p class="sh-warn">Hãy đăng nhập kiểm tra và đổi mật khẩu ngay. Có thể xem lại ở mục “Acc đã mua”.</p>
        <div class="row"><button type="button" class="primary" data-close>Đã lưu lại</button></div>
      </div>`;
    // Gắn nội dung bằng textContent (không chèn HTML) để tk/mk chứa ký tự đặc biệt không phá giao diện
    scrim.querySelectorAll("[data-v]").forEach((el) => { el.textContent = c[el.dataset.v]; });
    scrim.addEventListener("click", (e) => {
      const cp = e.target.closest("[data-copy]");
      if (cp) return copy(c[cp.dataset.copy]);
      if (e.target === scrim || e.target.closest("[data-close]")) scrim.remove();
    });
    document.body.append(scrim);
    scrim.querySelector("[data-close]").focus();
  }

  /* ---------- Khách hàng ---------- */

  let data = null;
  let gameFilter = 0;

  function renderList() {
    const accs = data.accounts.filter((a) => !gameFilter || a.game_id === gameFilter);
    const gname = Object.fromEntries(data.games.map((g) => [g.id, g]));
    $("shList").innerHTML = accs.length
      ? accs.map((a) => {
          const g = gname[a.game_id];
          return `<article class="sh-card">
            ${a.image_url ? `<img src="${esc(a.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
            <div class="sh-body">
              <span class="tag">${g ? esc(g.emoji + " " + g.name) : ""}</span>
              <h4>${esc(a.title)}</h4>
              ${a.description ? `<p>${esc(a.description)}</p>` : ""}
              <div class="sh-foot"><b>${fmt(a.price)} <small>coin</small></b><button type="button" class="primary" data-buy="${a.id}">Mua ngay</button></div>
            </div>
          </article>`;
        }).join("")
      : `<div class="empty">${gameFilter ? "Game này hiện chưa có acc nào." : "Chưa có acc nào đang bán."}</div>`;
  }

  function render() {
    $("shBalance").textContent = fmt(data.balance);
    $("shCount").textContent = fmt(data.accounts.length + data.games.reduce((s, g) => s + g.randomStock, 0));
    $("shGames").innerHTML =
      `<button type="button" data-g="0" class="${gameFilter ? "" : "on"}">Tất cả</button>` +
      data.games.map((g) => `<button type="button" data-g="${g.id}" class="${gameFilter === g.id ? "on" : ""}">${esc(g.emoji)} ${esc(g.name)}</button>`).join("");
    const rnd = data.games.filter((g) => g.randomPrice > 0);
    $("shRandomBox").hidden = !rnd.length;
    $("shRandom").innerHTML = rnd.map((g) => `
      <div class="sh-rand">
        <div class="sh-rand-ico">${esc(g.emoji)}</div>
        <div class="sh-rand-info"><b>Random ${esc(g.name)}</b><small>${g.randomStock ? `Còn ${fmt(g.randomStock)} acc` : "Tạm hết acc"}</small></div>
        <button type="button" class="primary" data-rand="${g.id}" ${g.randomStock ? "" : "disabled"}>${fmt(g.randomPrice)} coin</button>
      </div>`).join("");
    renderList();
  }

  async function load() {
    try {
      data = await api("/shop");
      render();
      loadOrders();
    } catch (e) { say(e.message, "bad"); }
  }

  async function loadOrders() {
    try {
      const { orders } = await api("/shop/orders");
      $("shMine").textContent = fmt(orders.length);
      $("shOrders").innerHTML = orders.length
        ? orders.map((o) => `
          <div class="user">
            <span class="name">${esc(o.title)}</span>
            <span class="tag">${esc(o.game_name)}</span>
            ${o.kind === "random" ? `<span class="tag ok">Random</span>` : ""}
            <span class="tag">${fmt(o.price)} coin</span>
            <span class="tag">${esc(fmtDate(o.created_at))}</span>
            <span class="spacer"></span>
            <button type="button" data-view="${o.id}">Xem tk/mk</button>
          </div>`).join("")
        : `<div class="empty">Bạn chưa mua acc nào.</div>`;
    } catch (e) { say(e.message, "bad"); }
  }

  async function purchase(path, body, busyBtn) {
    busyBtn.disabled = true;
    try {
      const r = await api(path, { method: "POST", body: JSON.stringify(body) });
      $("shBalance").textContent = fmt(r.balance);
      const chip = document.getElementById("chipBal");
      if (chip) chip.textContent = r.balance >= 1e9 ? (r.balance / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " tỷ"
        : r.balance >= 1e7 ? (r.balance / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " tr" : fmt(r.balance); // cùng cách hiển thị với wallet.js
      showCreds(r.order, r.credentials);
      await load();
    } catch (e) {
      say(e.message, "bad");
      busyBtn.disabled = false;
      load();
    }
  }

  $("shGames").addEventListener("click", (e) => {
    const b = e.target.closest("[data-g]");
    if (!b) return;
    gameFilter = Number(b.dataset.g);
    render();
  });

  $("shList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-buy]");
    if (!b) return;
    const a = data.accounts.find((x) => x.id === Number(b.dataset.buy));
    if (!a) return;
    const ok = await confirmBox(`Mua “${a.title}” với giá ${fmt(a.price)} coin? Tài khoản và mật khẩu sẽ hiện ngay sau khi mua. Acc đã giao không hoàn tiền.`, { title: "Xác nhận mua acc", ok: "Mua ngay" });
    if (ok) purchase("/shop/buy", { id: a.id }, b);
  });

  $("shRandom").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-rand]");
    if (!b) return;
    const g = data.games.find((x) => x.id === Number(b.dataset.rand));
    if (!g) return;
    const ok = await confirmBox(`Mở random ${g.name} với giá ${fmt(g.randomPrice)} coin? Bạn nhận 1 acc ngẫu nhiên và không chọn lại được.`, { title: "Mua acc random", ok: "Mở random" });
    if (ok) purchase("/shop/random", { game_id: g.id }, b);
  });

  $("shOrders").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-view]");
    if (!b) return;
    b.disabled = true;
    try {
      const r = await api(`/shop/orders/${b.dataset.view}`);
      showCreds(r.order, r.credentials);
    } catch (err) { say(err.message, "bad"); }
    b.disabled = false;
  });

  /* ---------- Quản trị ---------- */

  let adm = null;
  let stFilter = "";

  const STATUS = { available: "Đang bán", sold: "Đã bán", hidden: "Đang ẩn" };

  function syncKindForm() {
    const rnd = $("shAccKind").value === "random";
    $("shTitleBox").hidden = rnd;
    $("shPriceBox").hidden = rnd;
    $("shDescBox").hidden = rnd;
    $("shImgBox").hidden = rnd;
  }
  $("shAccKind").addEventListener("change", syncKindForm);
  syncKindForm();

  function renderAdmin() {
    const t = adm.totals || {};
    $("shTotals").innerHTML =
      `<div><small>Đang bán</small><strong>${fmt(t.available)}</strong></div>` +
      `<div><small>Đã bán</small><strong>${fmt(t.sold)}</strong></div>` +
      `<div><small>Đang ẩn</small><strong>${fmt(t.hidden)}</strong></div>`;

    $("shGameAdmin").innerHTML = adm.games.map((g) => `
      <div class="user${g.active ? "" : " off"}">
        <span class="name">${esc(g.emoji)} ${esc(g.name)}</span>
        <span class="tag">${fmt(g.stock.normal)} thường</span>
        <span class="tag">${fmt(g.stock.random)} random</span>
        <span class="tag ${g.random_price ? "ok" : "off"}">${g.random_price ? "Random " + fmt(g.random_price) : "Random tắt"}</span>
        <span class="spacer"></span>
        <button type="button" data-gedit="${g.id}">Sửa</button>
        <button type="button" class="danger" data-gdel="${g.id}">Xoá</button>
      </div>`).join("") || `<div class="empty">Chưa có game nào.</div>`;

    const cur = $("shAccGame").value;
    $("shAccGame").innerHTML = adm.games.map((g) => `<option value="${g.id}">${esc(g.emoji)} ${esc(g.name)}</option>`).join("");
    if (cur) $("shAccGame").value = cur;

    $("shStock").innerHTML = adm.accounts.length
      ? adm.accounts.map((a) => `
        <div class="user${a.status === "available" ? "" : " off"}">
          <span class="name">#${a.id} ${esc(a.title)}</span>
          <span class="tag">${esc(a.game_name)}</span>
          <span class="tag ${a.kind === "random" ? "ok" : ""}">${a.kind === "random" ? "Random" : fmt(a.price) + " coin"}</span>
          <span class="tag">${esc(a.masked)}</span>
          <span class="tag ${a.status === "available" ? "ok" : "off"}">${STATUS[a.status]}${a.buyer ? " · " + esc(a.buyer) : ""}</span>
          <span class="spacer"></span>
          ${a.status === "sold" ? "" : `
            <button type="button" data-tog="${a.id}" data-to="${a.status === "available" ? "hidden" : "available"}">${a.status === "available" ? "Ẩn" : "Hiện"}</button>
            ${a.kind === "normal" ? `<button type="button" data-price="${a.id}">Giá</button>` : ""}
            <button type="button" class="danger" data-adel="${a.id}">Xoá</button>`}
        </div>`).join("")
      : `<div class="empty">Kho trống.</div>`;

    $("shSales").innerHTML = adm.orders.length
      ? adm.orders.map((o) => `
        <div class="user">
          <span class="name">${esc(o.username)}</span>
          <span class="tag">${esc(o.title)}</span>
          <span class="tag ok">${fmt(o.price)} coin</span>
          <span class="tag">${esc(fmtDate(o.created_at))}</span>
        </div>`).join("")
      : `<div class="empty">Chưa bán được đơn nào.</div>`;
  }

  async function loadAdmin() {
    adm = await api(`/admin/shop?status=${stFilter}`);
    renderAdmin();
  }

  const reload = () => { loadAdmin().catch(() => {}); load(); };

  $("shFilter").addEventListener("click", (e) => {
    const b = e.target.closest("[data-st]");
    if (!b) return;
    stFilter = b.dataset.st;
    $("shFilter").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    loadAdmin().catch((err) => say(err.message, "bad"));
  });

  /* Game */
  function resetGame() {
    $("shGameForm").reset();
    $("shGameId").value = "";
    $("shGameActive").checked = true;
    $("shGameTitle").textContent = "Thêm game";
    $("shGameCancel").hidden = true;
  }
  $("shGameCancel").addEventListener("click", resetGame);

  $("shGameAdmin").addEventListener("click", async (e) => {
    const ed = e.target.closest("[data-gedit]");
    const del = e.target.closest("[data-gdel]");
    if (ed) {
      const g = adm.games.find((x) => x.id === Number(ed.dataset.gedit));
      $("shGameId").value = g.id;
      $("shGameName").value = g.name;
      $("shGameEmoji").value = g.emoji;
      $("shGamePrice").value = g.random_price || "";
      $("shGameActive").checked = g.active;
      $("shGameTitle").textContent = `Sửa: ${g.name}`;
      $("shGameCancel").hidden = false;
      $("shGameForm").scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (del) {
      if (!(await confirmBox("Xoá game này? Chỉ xoá được khi game chưa có acc nào.", { title: "Xoá game", ok: "Xoá", danger: true }))) return;
      try {
        await api(`/admin/shop/games/${del.dataset.gdel}/delete`, { method: "POST", body: "{}" });
        say("Đã xoá game"); resetGame(); reload();
      } catch (err) { say(err.message, "bad"); }
    }
  });

  $("shGameForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const save = $("shGameSave");
    save.disabled = true;
    try {
      await api("/admin/shop/games", {
        method: "POST",
        body: JSON.stringify({
          id: $("shGameId").value || undefined,
          name: $("shGameName").value,
          emoji: $("shGameEmoji").value,
          random_price: num($("shGamePrice").value),
          active: $("shGameActive").checked,
        }),
      });
      say("Đã lưu game"); resetGame(); reload();
    } catch (err) { say(err.message, "bad"); }
    save.disabled = false;
  });

  /* Thêm acc: dữ liệu gửi qua HTTPS, server mã hoá rồi mới lưu */
  $("shAccForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const save = $("shAccSave");
    save.disabled = true;
    try {
      const kind = $("shAccKind").value;
      const r = await api("/admin/shop/accounts", {
        method: "POST",
        body: JSON.stringify({
          game_id: Number($("shAccGame").value),
          kind,
          title: $("shAccTitle").value,
          price: num($("shAccPrice").value),
          description: $("shAccDesc").value,
          image_url: $("shAccImg").value,
          lines: $("shAccLines").value,
        }),
      });
      say(`Đã mã hoá và thêm ${r.added} acc` + (r.duplicated ? `, bỏ qua ${r.duplicated} acc đã có trong kho` : ""));
      $("shAccLines").value = "";   // xoá ngay khỏi ô nhập
      if (kind === "normal") { $("shAccTitle").value = ""; $("shAccPrice").value = ""; $("shAccDesc").value = ""; $("shAccImg").value = ""; }
      reload();
    } catch (err) { say(err.message, "bad"); }
    save.disabled = false;
  });

  $("shStock").addEventListener("click", async (e) => {
    const tog = e.target.closest("[data-tog]");
    const pr = e.target.closest("[data-price]");
    const del = e.target.closest("[data-adel]");
    try {
      if (tog) {
        await api(`/admin/shop/accounts/${tog.dataset.tog}`, { method: "POST", body: JSON.stringify({ status: tog.dataset.to }) });
        reload();
      } else if (pr) {
        const a = adm.accounts.find((x) => x.id === Number(pr.dataset.price));
        const v = await promptBox(`Giá mới (coin) cho “${a.title}”`, { title: "Đổi giá", value: String(a.price), validate: (s) => (num(s) >= 1 ? "" : "Nhập số coin lớn hơn 0") });
        if (v === null) return;
        await api(`/admin/shop/accounts/${a.id}`, { method: "POST", body: JSON.stringify({ price: num(v) }) });
        say("Đã đổi giá"); reload();
      } else if (del) {
        if (!(await confirmBox("Xoá acc này khỏi kho?", { title: "Xoá acc", ok: "Xoá", danger: true }))) return;
        await api(`/admin/shop/accounts/${del.dataset.adel}/delete`, { method: "POST", body: "{}" });
        say("Đã xoá acc"); reload();
      }
    } catch (err) { say(err.message, "bad"); }
  });

  api("/me").then((me) => { if (me.role === "admin") { $("shAdmin").hidden = false; loadAdmin().catch(() => {}); } }).catch(() => {});

  /* ---------- Mở tab ---------- */
  btn.addEventListener("click", () => { load(); if (!$("shAdmin").hidden) loadAdmin().catch(() => {}); });
  // bots.js đã đổi hash sang #fb (vì lúc đó tab này chưa tồn tại) nên đọc địa chỉ gốc lúc mở trang
  let startHash = location.hash;
  try { startHash = new URL(performance.getEntriesByType("navigation")[0].name).hash; } catch (_) {}
  if (startHash === "#shop") setTimeout(() => { if (typeof showTab === "function") showTab("shop"); load(); }, 0);
})();
