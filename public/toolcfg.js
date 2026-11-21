/* Tab Công cụ: áp dụng cấu hình của admin lên các thẻ công cụ (ẩn, tính coin, mở khoá theo phiên).
   Chạy độc lập với tools.js và office-tools.js: chờ các thẻ <details id="tl-ID"> xuất hiện rồi gắn thêm.
   Dùng các hàm có sẵn: api, say, esc. Server chặn thật với công cụ có dùng máy chủ, xem server/toolcfg.js. */
(() => {
  const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");
  const toast = (t, k) => (typeof say === "function" ? say(t, k) : alert(t));
  const TAG = '<span class="tl-price"></span>';

  const css = document.createElement("style");
  css.textContent = `
  details.tl-card.tl-locked > *:not(summary):not(.tl-lock){display:none !important}
  .tl-price{margin-left:auto;margin-right:.4rem;white-space:nowrap;font-size:.74rem;padding:.12rem .5rem;border-radius:999px;border:1px solid var(--line);color:var(--dim)}
  .tl-price.paid{color:var(--lamp2,#f6a);border-color:currentColor}
  .tl-price.open{color:#59d98e;border-color:currentColor}
  .tl-price.hid{color:#f2b04a;border-color:currentColor}
  .tl-lock{padding:.2rem 1rem 1rem;font-size:.88rem;line-height:1.55}
  .tl-lock p{margin:.2rem 0 .7rem}
  .tl-lock .row{display:flex;flex-wrap:wrap;gap:.5rem}
  .tl-lock button{padding:.5rem .9rem;border-radius:10px}`;
  document.head.append(css);

  let cfg = null;      // { tools, balance, admin }
  let expire = {};     // id -> thời điểm hết phiên (ms, theo đồng hồ máy này)
  let timer = 0;

  const cards = () => [...document.querySelectorAll('details.tl-card[id^="tl-"]')];
  const idOf = (card) => card.id.slice(3);
  const left = (id) => Math.max(0, Math.ceil(((expire[id] || 0) - Date.now()) / 1000));
  const minText = (s) => (s >= 90 ? `${Math.ceil(s / 60)} phút` : `${s} giây`);

  function take(d) {
    cfg = d;
    expire = {};
    for (const [id, t] of Object.entries(d.tools)) if (t.left > 0) expire[id] = Date.now() + t.left * 1000;
  }

  function apply() {
    if (!cfg) return;
    for (const card of cards()) {
      const id = idOf(card), t = cfg.tools[id];
      if (!t) continue;
      const sum = card.querySelector("summary");
      if (!sum) continue;
      // admin vẫn thấy công cụ đang ẩn (kèm nhãn) để kiểm tra, người dùng thường thì không
      card.hidden = t.hidden && !cfg.admin;
      let tag = sum.querySelector(".tl-price");
      const wantTag = t.hidden || t.price > 0;
      if (wantTag && !tag) { sum.querySelector(".tl-chev")?.insertAdjacentHTML("beforebegin", TAG); tag = sum.querySelector(".tl-price"); if (!tag) { sum.insertAdjacentHTML("beforeend", TAG); tag = sum.querySelector(".tl-price"); } }
      if (!wantTag) { tag?.remove(); tag = null; }

      const paid = t.price > 0 && !cfg.admin;
      const open = paid && left(id) > 0;
      const locked = paid && !open;
      card.classList.toggle("tl-locked", locked);

      if (tag) {
        if (t.hidden) { tag.className = "tl-price hid"; tag.textContent = "Đang ẩn"; }
        else if (cfg.admin) { tag.className = "tl-price paid"; tag.textContent = `${fmt(t.price)} coin (admin miễn phí)`; }
        else if (open) { tag.className = "tl-price open"; tag.textContent = `Còn ${minText(left(id))}`; }
        else { tag.className = "tl-price paid"; tag.textContent = `${fmt(t.price)} coin`; }
      }

      let lock = card.querySelector(":scope > .tl-lock");
      if (locked) {
        if (!lock) {
          lock = document.createElement("div");
          lock.className = "tl-lock";
          sum.after(lock);
        }
        lock.innerHTML = `<p>Công cụ này tính <b>${fmt(t.price)} coin</b> cho mỗi phiên <b>${fmt(t.minutes)} phút</b> (dùng thoải mái trong phiên). Ví của bạn đang có <b>${fmt(cfg.balance)} coin</b>.</p>
          <div class="row"><button type="button" class="primary" data-unlock="${esc(id)}">Mở khoá (${fmt(t.price)} coin)</button><button type="button" data-topup="1">Nạp coin</button></div>`;
      } else lock?.remove();
    }
    schedule();
  }

  // cập nhật chữ "Còn x phút" và khoá lại khi hết phiên
  function schedule() {
    clearInterval(timer);
    if (!Object.keys(expire).length) return;
    timer = setInterval(() => {
      const ids = Object.keys(expire);
      if (!ids.length) return clearInterval(timer);
      for (const id of ids) if (left(id) <= 0) delete expire[id];
      apply();
    }, 15000);
  }

  async function load() {
    try { take(await api("/tools/config")); apply(); } catch (_) {}
  }

  document.addEventListener("click", async (e) => {
    const top = e.target.closest("button[data-topup]");
    if (top) { document.querySelector('button[data-tab="wallet"]')?.click(); return; }
    const b = e.target.closest("button[data-unlock]");
    if (!b) return;
    b.disabled = true;
    try {
      take(await api("/tools/unlock", { method: "POST", body: JSON.stringify({ tool: b.dataset.unlock }) }));
      apply();
      toast("Đã mở khoá công cụ.");
    } catch (err) { toast(err.message, "bad"); }
    b.disabled = false;
  });

  // nạp lại khi mở tab Công cụ (số dư và thời gian còn lại luôn mới)
  document.addEventListener("click", (e) => { if (e.target.closest('button[data-tab="tools"]')) load(); });

  // các thẻ công cụ do hai file khác dựng, có thể xuất hiện muộn: gắn lại mỗi khi có thẻ mới
  let deb = 0;
  const mo = new MutationObserver(() => {
    clearTimeout(deb);
    deb = setTimeout(() => {
      const missing = cards().some((c) => !c.dataset.tcSeen);
      if (!missing) return;
      cards().forEach((c) => (c.dataset.tcSeen = "1"));
      if (cfg) apply(); else load();
    }, 200);
  });
  mo.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => mo.disconnect(), 60000);
  load();
})();
