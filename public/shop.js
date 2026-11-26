/* Tab "Shop acc": mua acc game bằng coin, mua acc random, xem lại acc đã mua; admin quản lý kho.
   Giao diện cửa hàng theo web mẫu (lưới game -> trang từng game), style nằm trong /shop.css.
   Ảnh acc / ảnh bìa game: admin chọn, chụp, kéo thả hoặc dán ảnh trực tiếp; trình duyệt tự nén nhỏ rồi gửi lên server.
   Dùng hàm có sẵn của app.js / dialog.js: $, api, say, fmtDate, confirmBox, promptBox. */
(() => {
  const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");
  const num = (s) => Number(String(s).replace(/[^\d]/g, "")) || 0;
  // esc của app.js không đổi dấu nháy; ở đây có dùng trong thuộc tính HTML nên dùng bản đầy đủ
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  if (!document.getElementById("shopCss")) {
    const l = document.createElement("link");
    l.id = "shopCss"; l.rel = "stylesheet"; l.href = "/shop.css";
    document.head.appendChild(l);
  }

  /* ---------- Chèn nút tab + khung nội dung ---------- */
  const btn = document.createElement("button");
  btn.dataset.tab = "shop";
  btn.textContent = "Shop acc";
  const anchor = $("tabs").querySelector('[data-tab="linkcoin"]') || $("tabs").querySelector('[data-tab="wallet"]');
  anchor ? anchor.after(btn) : $("tabs").appendChild(btn);

  const NOTICE = "Mua bằng coin trong ví · Tài khoản và mật khẩu hiện ngay sau khi mua · Acc đã giao không hoàn tiền, nhớ đổi mật khẩu ngay";

  const tab = document.createElement("div");
  tab.className = "tab";
  tab.id = "tab-shop";
  tab.hidden = true;
  tab.innerHTML = `
    <div class="sx" id="shStore">
      <header class="sx-hero">
        <div class="sx-hero-row">
          <div class="sx-brand"><span>Kho tài khoản game</span><h2>SHOP ACC</h2></div>
          <div class="sx-bal"><small>Số dư ví</small><b><span id="shBalance">0</span> <i>coin</i></b></div>
        </div>
        <div class="sx-stats">
          <div><small>Acc đang bán</small><strong id="shCount">0</strong></div>
          <div><small>Acc đã mua</small><strong id="shMine">0</strong></div>
        </div>
        <div class="sx-ticker"><div class="sx-track"><span>${esc(NOTICE)}</span><span aria-hidden="true">${esc(NOTICE)}</span></div></div>
      </header>

      <section class="sx-top" id="shTop" hidden></section>

      <div class="sx-pad">
        <div id="shHome">
          <h3 class="sx-title">Danh sách Games</h3>
          <div class="sx-games" id="shGameGrid"><div class="empty loading">Đang tải…</div></div>
        </div>

        <div id="shGameView" hidden>
          <div class="sx-bar">
            <button type="button" class="sx-btn ghost" id="shBack">← Tất cả game</button>
            <h3 class="sx-title sm" id="shGameName"></h3>
          </div>
          <div class="sx-ghead" id="shGameHead"></div>
          <div class="sx-rand" id="shRandom" hidden></div>
          <div class="sx-sort" id="shSort">
            <button type="button" class="sx-chip on" data-sort="new">Mới nhất</button>
            <button type="button" class="sx-chip" data-sort="asc">Giá thấp → cao</button>
            <button type="button" class="sx-chip" data-sort="desc">Giá cao → thấp</button>
          </div>
          <div class="sx-accs" id="shList"></div>
        </div>
      </div>
    </div>

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
          <div class="field"><label for="shGameName2">Tên game</label><input type="text" id="shGameName2" maxlength="40" placeholder="Liên Quân Mobile"></div>
          <div class="field"><label for="shGameEmoji">Biểu tượng</label><input type="text" id="shGameEmoji" maxlength="4" placeholder="🎮"></div>
          <div class="field"><label for="shGamePrice">Giá random</label><input type="text" id="shGamePrice" inputmode="numeric" placeholder="0 = tắt"></div>
        </div>
        <div class="field"><label>Ảnh bìa game (hiện ở danh sách game, không bắt buộc)</label><div id="shGamePick"></div></div>
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
        <div class="field" id="shImgBox">
          <label id="shImgLabel">Ảnh acc (không bắt buộc)</label>
          <div id="shAccPick"></div>
          <div class="hint" id="shImgHint" style="margin-top:.5rem"></div>
          <label for="shAccImg" style="margin-top:.4rem">Hoặc dán link ảnh https</label>
          <input type="text" id="shAccImg" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="https://…">
        </div>
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

  /* ---------- Xử lý ảnh: nén ở trình duyệt, gửi thẳng lên server ---------- */

  const decode = async (file) => {
    try { return await createImageBitmap(file); } catch (_) {}
    return new Promise((ok, no) => {                       // trình duyệt cũ chưa có createImageBitmap
      const u = URL.createObjectURL(file), im = new Image();
      im.onload = () => { URL.revokeObjectURL(u); ok(im); };
      im.onerror = () => { URL.revokeObjectURL(u); no(new Error("Không đọc được ảnh này, hãy thử ảnh JPG hoặc PNG")); };
      im.src = u;
    });
  };
  const toBlob = (canvas, type, q) => new Promise((ok) => canvas.toBlob(ok, type, q));

  /** Thu nhỏ về tối đa 1280px, đổi sang WebP (hoặc JPEG nếu trình duyệt không hỗ trợ WebP). Ảnh ra thường 80-250 KB. */
  async function prepImage(file) {
    if (/svg/i.test(file.type) || /\.svg$/i.test(file.name || "")) throw new Error("Chỉ nhận ảnh JPG, PNG, WebP hoặc GIF");
    if (file.size > 25 * 1024 * 1024) throw new Error("Ảnh quá lớn (tối đa 25 MB)");
    const src = await decode(file);
    const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
    if (!w0 || !h0) throw new Error("Không đọc được ảnh này");
    let scale = Math.min(1, 1280 / Math.max(w0, h0));
    for (let i = 0; i < 4; i++) {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w0 * scale));
      c.height = Math.max(1, Math.round(h0 * scale));
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";                               // ảnh PNG trong suốt -> nền trắng khi phải lưu JPEG
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(src, 0, 0, c.width, c.height);
      let blob = await toBlob(c, "image/webp", 0.86);
      if (!blob || blob.type !== "image/webp") blob = await toBlob(c, "image/jpeg", 0.86);
      if (!blob) throw new Error("Không nén được ảnh này, hãy thử ảnh khác");
      if (blob.size <= 2.8 * 1024 * 1024) { src.close?.(); return blob; }
      scale *= 0.75;                                        // vẫn to quá: thu nhỏ thêm rồi nén lại
    }
    throw new Error("Ảnh quá lớn, hãy chọn ảnh nhỏ hơn");
  }

  async function uploadBlob(blob) {
    const r = await fetch("/api/admin/shop/upload", { method: "POST", headers: { "content-type": blob.type }, body: blob });
    if (r.status === 401) { location.href = "/login.html"; throw new Error("Phiên đăng nhập đã hết"); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Tải ảnh lên thất bại");
    return d.url;
  }

  /**
   * Ô chọn ảnh: bấm chọn / chụp, kéo thả hoặc dán (Ctrl+V). Tải lên ngay khi chọn xong.
   * o.value: ảnh ban đầu; o.hint: dòng gợi ý; o.onPick(url) / o.onClear(): gọi sau khi tải xong / khi bấm Gỡ ảnh
   * (dùng khi đổi ảnh của acc đã có trong kho: lưu luôn, không cần bấm thêm nút).
   */
  function imgPicker(host, o = {}) {
    host.classList.add("sh-pick");
    host.innerHTML = `
      <div class="sh-pick-prev" tabindex="0" role="button" aria-label="Chọn ảnh" title="Bấm để chọn ảnh, hoặc kéo thả / dán ảnh vào đây"></div>
      <div class="sh-pick-act">
        <label class="sh-filebtn"><input type="file" accept="image/*">Chọn ảnh / chụp ảnh</label>
        <button type="button" class="sh-pick-clear" hidden>Gỡ ảnh</button>
        <small class="sh-pick-msg"></small>
      </div>`;
    const prev = host.querySelector(".sh-pick-prev");
    const file = host.querySelector("input[type=file]");
    const clr = host.querySelector(".sh-pick-clear");
    const msg = host.querySelector(".sh-pick-msg");
    const hint = o.hint || "JPG, PNG, WebP. Ảnh tự được nén nhỏ trước khi gửi.";
    let url = "", busy = false;

    const paint = () => {
      prev.innerHTML = url ? `<img src="${esc(url)}" alt="" referrerpolicy="no-referrer">` : "<span>Chưa có ảnh</span>";
      clr.hidden = !url;
    };
    const set = (u) => { url = u || ""; paint(); msg.textContent = hint; };

    async function take(f) {
      if (!f || busy) return;
      busy = true;
      prev.classList.add("busy");
      msg.textContent = "Đang nén và tải ảnh lên…";
      try {
        const blob = await prepImage(f);
        const u = await uploadBlob(blob);
        if (o.onPick) await o.onPick(u);
        url = u; paint();
        msg.textContent = `Đã tải lên (${Math.max(1, Math.round(blob.size / 1024))} KB).`;
      } catch (e) {
        msg.textContent = hint;
        say(e.message, "bad");
      } finally {
        busy = false;
        prev.classList.remove("busy");
        file.value = "";
      }
    }

    file.addEventListener("change", () => take(file.files[0]));
    prev.addEventListener("click", () => file.click());
    prev.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } });
    prev.addEventListener("dragover", (e) => { e.preventDefault(); prev.classList.add("drag"); });
    prev.addEventListener("dragleave", () => prev.classList.remove("drag"));
    prev.addEventListener("drop", (e) => { e.preventDefault(); prev.classList.remove("drag"); take(e.dataTransfer?.files?.[0]); });
    prev.addEventListener("paste", (e) => {
      const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith("image/"));
      if (f) { e.preventDefault(); take(f); }
    });
    clr.addEventListener("click", async () => {
      if (busy) return;
      try { if (o.onClear) await o.onClear(); set(""); } catch (e) { say(e.message, "bad"); }
    });

    set(o.value);
    return { get: () => url, set, reset: () => { set(""); file.value = ""; }, get busy() { return busy; } };
  }

  /* ---------- Hộp phóng to ảnh + hộp hiển thị tài khoản vừa mua ---------- */

  function zoom(url) {
    if (!url) return;
    const scrim = document.createElement("div");
    scrim.className = "sh-modal-scrim sx-zoom";
    scrim.innerHTML = `<img src="${esc(url)}" alt="" referrerpolicy="no-referrer">`;
    const close = () => { scrim.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    scrim.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    document.body.append(scrim);
  }
  document.addEventListener("click", (e) => {
    const z = e.target.closest("#tab-shop [data-zoom], .sh-modal [data-zoom]");
    if (z) zoom(z.dataset.zoom);
  });

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
        ${order.image ? `<img class="sx-cred-img" src="${esc(order.image)}" alt="Ảnh acc" data-zoom="${esc(order.image)}" referrerpolicy="no-referrer">` : ""}
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

  /* ---------- Khách hàng: lưới game -> trang từng game ---------- */

  let data = null;
  let cur = 0;          // 0 = danh sách game, khác 0 = đang xem game có id này
  let sortMode = "new";
  let topHasData = false;

  const cover = (g) => g.image
    ? `<img src="${esc(g.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<i class="sx-emoji">${esc(g.emoji)}</i>`;

  function renderHome() {
    $("shGameGrid").innerHTML = data.games.length
      ? data.games.map((g) => {
          const live = g.normalStock + g.randomStock;
          return `<div class="sx-game${live ? "" : " out"}" role="button" tabindex="0" data-game="${g.id}" aria-label="${esc(g.name)}">
            <span class="sx-cover">${cover(g)}${g.randomPrice > 0 ? `<em class="sx-badge">🎲 Random</em>` : ""}</span>
            <span class="sx-gname">${esc(g.name)}</span>
            <span class="sx-nums"><span>Đang bán: <b>${fmt(live)}</b></span><span>Đã bán: <b>${fmt(g.sold)}</b></span></span>
          </div>`;
        }).join("")
      : `<div class="empty">Shop chưa có game nào.</div>`;
  }

  function renderGame() {
    const g = data.games.find((x) => x.id === cur);
    if (!g) { cur = 0; return renderView(); }
    $("shGameName").textContent = g.name;
    $("shGameHead").innerHTML = `
      <span class="sx-cover">${cover(g)}</span>
      <div><b>${esc(g.name)}</b><small>Đang bán: ${fmt(g.normalStock + g.randomStock)} · Đã bán: ${fmt(g.sold)}</small></div>`;

    const rnd = $("shRandom");
    rnd.hidden = !(g.randomPrice > 0);
    if (g.randomPrice > 0) {
      rnd.innerHTML = `
        <div class="sx-rand-ico">🎲</div>
        <div class="sx-rand-info"><b>Random ${esc(g.name)}</b><small>${g.randomStock ? `Nhận ngẫu nhiên 1 acc trong kho, còn ${fmt(g.randomStock)} acc. Bạn không biết trước là acc gì.` : "Kho random tạm hết acc, quay lại sau nhé."}</small></div>
        <button type="button" class="sx-btn gold" data-rand="${g.id}" ${g.randomStock ? "" : "disabled"}>${fmt(g.randomPrice)} coin</button>`;
    }

    $("shSort").querySelectorAll("[data-sort]").forEach((b) => b.classList.toggle("on", b.dataset.sort === sortMode));
    const accs = data.accounts.filter((a) => a.game_id === g.id);
    if (sortMode === "asc") accs.sort((a, b) => a.price - b.price || b.id - a.id);
    else if (sortMode === "desc") accs.sort((a, b) => b.price - a.price || b.id - a.id);
    $("shList").innerHTML = accs.length
      ? accs.map((a) => `
        <article class="sx-acc">
          <span class="sx-shot${a.image_url ? " zoomable" : ""}" ${a.image_url ? `data-zoom="${esc(a.image_url)}"` : ""}>${cover({ image: a.image_url, emoji: g.emoji })}</span>
          <div class="sx-abody">
            <h4>${esc(a.title)}</h4>
            ${a.description ? `<p>${esc(a.description)}</p>` : ""}
            <div class="sx-afoot"><span class="sx-price">${fmt(a.price)} <small>coin</small></span><button type="button" class="sx-btn" data-buy="${a.id}">Mua ngay</button></div>
          </div>
        </article>`).join("")
      : `<div class="empty">Game này hiện chưa có acc thường nào đang bán${g.randomPrice > 0 ? ", bạn có thể thử mua random ở trên" : ""}.</div>`;
  }

  function renderView() {
    $("shHome").hidden = cur !== 0;
    $("shGameView").hidden = cur === 0;
    $("shTop").hidden = cur !== 0 || !topHasData;
    cur === 0 ? renderHome() : renderGame();
  }

  function render() {
    $("shBalance").textContent = fmt(data.balance);
    $("shCount").textContent = fmt(data.accounts.length + data.games.reduce((s, g) => s + g.randomStock, 0));
    renderView();
  }

  function openGame(id) {
    cur = id;
    sortMode = "new";
    renderView();
    $("shStore").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadTop() {
    try {
      const d = await api("/leaderboard");
      const top = (d.top || []).slice(0, 6);
      topHasData = top.length > 0;
      const medal = ["🥇", "🥈", "🥉"];
      $("shTop").innerHTML = topHasData
        ? `<h3>TOP NẠP TIỀN${d.label ? " · " + esc(d.label) : ""}</h3>` +
          top.map((r, i) => `<div class="sx-toprow${r.me ? " me" : ""}"><span><em>${medal[i] || "🎖️"}</em><b>${esc(r.name)}</b></span><b>${fmt(r.total)} coin</b></div>`).join("")
        : "";
      $("shTop").hidden = cur !== 0 || !topHasData;
    } catch (_) { /* bảng xếp hạng chỉ là phụ, lỗi thì bỏ qua */ }
  }

  async function load() {
    try {
      data = await api("/shop");
      render();
      loadOrders();
      loadTop();
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

  const onActivate = (el, fn) => {
    el.addEventListener("click", fn);
    el.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.closest("[data-game]")) { e.preventDefault(); fn(e); } });
  };
  onActivate($("shGameGrid"), (e) => {
    const c = e.target.closest("[data-game]");
    if (c) openGame(Number(c.dataset.game));
  });
  $("shBack").addEventListener("click", () => { cur = 0; renderView(); $("shStore").scrollIntoView({ behavior: "smooth", block: "start" }); });
  $("shSort").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sort]");
    if (!b) return;
    sortMode = b.dataset.sort;
    renderGame();
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
  const thumb = (url, label) => url
    ? `<img class="sh-thumb" src="${esc(url)}" alt="" loading="lazy" data-zoom="${esc(url)}" referrerpolicy="no-referrer">`
    : `<span class="sh-thumb none">${label || "Chưa có ảnh"}</span>`;

  const gamePick = imgPicker($("shGamePick"), { hint: "Ảnh ngang tỉ lệ 4:3 trông đẹp nhất. Không có ảnh thì hiện biểu tượng." });
  const accPick = imgPicker($("shAccPick"));

  function syncKindForm() {
    const rnd = $("shAccKind").value === "random";
    $("shTitleBox").hidden = rnd;
    $("shPriceBox").hidden = rnd;
    $("shDescBox").hidden = rnd;
    $("shImgLabel").textContent = rnd ? "Ảnh acc random (không bắt buộc)" : "Ảnh acc (không bắt buộc)";
    $("shImgHint").textContent = rnd
      ? "Ảnh này dùng chung cho cả lô vừa thêm. Muốn mỗi acc một ảnh riêng, bấm nút “Ảnh” ở từng acc trong Kho acc. Người mua chỉ thấy ảnh sau khi mở random."
      : "Chụp màn hình acc rồi chọn, kéo thả hoặc dán thẳng vào ô trên. Khách bấm vào ảnh để xem lớn.";
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
        ${thumb(g.image_url, esc(g.emoji))}
        <span class="name">${esc(g.emoji)} ${esc(g.name)}</span>
        <span class="tag">${fmt(g.stock.normal)} thường</span>
        <span class="tag">${fmt(g.stock.random)} random</span>
        <span class="tag ${g.random_price ? "ok" : "off"}">${g.random_price ? "Random " + fmt(g.random_price) : "Random tắt"}</span>
        <span class="spacer"></span>
        <button type="button" data-gedit="${g.id}">Sửa</button>
        <button type="button" class="danger" data-gdel="${g.id}">Xoá</button>
      </div>`).join("") || `<div class="empty">Chưa có game nào.</div>`;

    const keep = $("shAccGame").value;
    $("shAccGame").innerHTML = adm.games.map((g) => `<option value="${g.id}">${esc(g.emoji)} ${esc(g.name)}</option>`).join("");
    if (keep) $("shAccGame").value = keep;

    $("shStock").innerHTML = adm.accounts.length
      ? adm.accounts.map((a) => `
        <div class="user${a.status === "available" ? "" : " off"}">
          ${thumb(a.image_url)}
          <span class="name">#${a.id} ${esc(a.title)}</span>
          <span class="tag">${esc(a.game_name)}</span>
          <span class="tag ${a.kind === "random" ? "ok" : ""}">${a.kind === "random" ? "Random" : fmt(a.price) + " coin"}</span>
          <span class="tag">${esc(a.masked)}</span>
          <span class="tag ${a.status === "available" ? "ok" : "off"}">${STATUS[a.status]}${a.buyer ? " · " + esc(a.buyer) : ""}</span>
          <span class="spacer"></span>
          ${a.status === "sold" ? "" : `
            <button type="button" data-img="${a.id}">Ảnh</button>
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
    gamePick.reset();
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
      $("shGameName2").value = g.name;
      $("shGameEmoji").value = g.emoji;
      $("shGamePrice").value = g.random_price || "";
      $("shGameActive").checked = g.active;
      gamePick.set(g.image_url);
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
    if (gamePick.busy) return say("Ảnh đang tải lên, đợi một chút nhé.", "bad");
    const save = $("shGameSave");
    save.disabled = true;
    try {
      await api("/admin/shop/games", {
        method: "POST",
        body: JSON.stringify({
          id: $("shGameId").value || undefined,
          name: $("shGameName2").value,
          emoji: $("shGameEmoji").value,
          random_price: num($("shGamePrice").value),
          active: $("shGameActive").checked,
          image_url: gamePick.get(),
        }),
      });
      say("Đã lưu game"); resetGame(); reload();
    } catch (err) { say(err.message, "bad"); }
    save.disabled = false;
  });

  /* Thêm acc: dữ liệu gửi qua HTTPS, server mã hoá rồi mới lưu */
  $("shAccForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (accPick.busy) return say("Ảnh đang tải lên, đợi một chút nhé.", "bad");
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
          image_url: accPick.get() || $("shAccImg").value,
          lines: $("shAccLines").value,
        }),
      });
      say(`Đã mã hoá và thêm ${r.added} acc` + (r.duplicated ? `, bỏ qua ${r.duplicated} acc đã có trong kho` : ""));
      $("shAccLines").value = "";   // xoá ngay khỏi ô nhập
      $("shAccImg").value = "";
      accPick.reset();
      if (kind === "normal") { $("shAccTitle").value = ""; $("shAccPrice").value = ""; $("shAccDesc").value = ""; }
      reload();
    } catch (err) { say(err.message, "bad"); }
    save.disabled = false;
  });

  /* Đổi / gỡ ảnh của một acc đã có trong kho (acc thường lẫn acc random) */
  function editImage(a) {
    document.querySelector(".sh-modal-scrim")?.remove();
    const scrim = document.createElement("div");
    scrim.className = "sh-modal-scrim";
    scrim.innerHTML = `
      <div class="sh-modal" role="dialog" aria-modal="true" aria-label="Đổi ảnh acc">
        <h3>Ảnh của acc #${a.id}</h3>
        <p class="sh-sub">${esc(a.game_name)} · ${a.kind === "random" ? "Acc random: người mua chỉ thấy ảnh này sau khi mở random" : esc(a.title)}</p>
        <div id="shEditPick"></div>
        <div class="row" style="margin-top:1rem"><button type="button" class="primary" data-close>Xong</button></div>
      </div>`;
    const save = async (u) => {
      await api(`/admin/shop/accounts/${a.id}`, { method: "POST", body: JSON.stringify({ image_url: u }) });
      say(u ? "Đã đổi ảnh" : "Đã gỡ ảnh");
      loadAdmin().catch(() => {});
      load();
    };
    imgPicker(scrim.querySelector("#shEditPick"), { value: a.image_url, onPick: save, onClear: () => save("") });
    scrim.addEventListener("click", (e) => { if (e.target === scrim || e.target.closest("[data-close]")) scrim.remove(); });
    document.body.append(scrim);
  }

  $("shStock").addEventListener("click", async (e) => {
    const tog = e.target.closest("[data-tog]");
    const pr = e.target.closest("[data-price]");
    const del = e.target.closest("[data-adel]");
    const im = e.target.closest("[data-img]");
    try {
      if (im) {
        const a = adm.accounts.find((x) => x.id === Number(im.dataset.img));
        if (a) editImage(a);
      } else if (tog) {
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
