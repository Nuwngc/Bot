/* Thông báo tổng + thông tin liên hệ / chân trang / nút nổi cho mọi trang (đăng nhập, đăng ký, bảng điều khiển).
   Dữ liệu lấy từ /api/site/public (không cần đăng nhập). Admin chỉnh trong tab Quản trị, mục "Thông báo tổng và liên hệ".
   Server: server/site.js. Giao diện: site.css. */
(() => {
  if (window.siteNotice) return;

  const HIDE_KEY = "siteNoticeHide"; // localStorage: { v, until } khách bấm "Không hiện lại trong 12 giờ"
  const SEEN_KEY = "siteNoticeSeen"; // sessionStorage: đã đóng thông báo này trong phiên, không hiện lại khi chuyển trang
  const FAB_KEY = "siteFabOpen";
  const HOURS_12 = 12 * 3600 * 1000;

  const ea = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (/^https?:\/\/[^\s<>"'`]+$/i.test(String(u)) ? String(u) : "#");

  /** Văn bản thuần của admin -> HTML an toàn: thoát ký tự đặc biệt, tự biến link http(s) thành liên kết, xuống dòng thành <br> */
  function linkify(text) {
    return ea(text)
      .replace(/https?:\/\/[^\s<>"'`]+/g, (u) => {
        // &amp; do ea() tạo ra nằm trong link là đúng; chỉ cắt dấu câu cuối câu
        const tail = (/(?:[.,;:!?)\]]|&#39;|&quot;)+$/.exec(u) || [""])[0];
        const url = tail ? u.slice(0, -tail.length) : u;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${tail}`;
      })
      .replace(/\n/g, "<br>");
  }

  /* ---------- biểu tượng (viewBox 24, tô bằng currentColor) ---------- */
  const SVG = (inner) => `<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" aria-hidden="true">${inner}</svg>`;
  const MESSENGER = '<path d="M12 2C6.48 2 2 6.14 2 11.25c0 2.9 1.43 5.49 3.67 7.19V22l3.37-1.85c.9.25 1.86.39 2.96.39 5.52 0 10-4.14 10-9.29S17.52 2 12 2zm1.1 12.5-2.55-2.72-4.97 2.72 5.47-5.8 2.61 2.72 4.91-2.72-5.47 5.8z"/>';
  const ICON = {
    messenger: SVG(MESSENGER),
    community: SVG(MESSENGER),
    youtube: SVG('<path d="M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.27 5 12 5 12 5s-6.27 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2C2 8.78 2 12 2 12s0 3.22.4 4.8a2.5 2.5 0 0 0 1.76 1.77C5.73 19 12 19 12 19s6.27 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77C22 15.22 22 12 22 12s0-3.22-.4-4.8zM10 15V9l5.2 3L10 15z"/>'),
    facebook: SVG('<path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.6V21h2.9z"/>'),
    discord: SVG('<path d="M19.27 5.33A16.6 16.6 0 0 0 15.2 4.06l-.2.39c1.5.4 2.2 1 3 1.7a11 11 0 0 0-10 0c.8-.7 1.5-1.3 3-1.7l-.2-.39a16.6 16.6 0 0 0-4.07 1.27C2.1 9.2 1.4 13 1.7 16.7a16.8 16.8 0 0 0 5.1 2.6l1.1-1.8c-.6-.2-1.2-.5-1.7-.9l.4-.3a11.9 11.9 0 0 0 10.2 0l.4.3c-.5.4-1.1.7-1.7.9l1.1 1.8a16.8 16.8 0 0 0 5.1-2.6c.4-4.3-.7-8-3-11.4zM9 14.4c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z"/>'),
    zalo: SVG('<text x="12" y="15.5" text-anchor="middle" font-size="8.5" font-weight="700" font-family="Arial,Helvetica,sans-serif">Zalo</text>'),
    telegram: SVG('<path d="M21.5 4.4 2.9 11.6c-1.1.4-1.1 1.1-.2 1.4l4.8 1.5 1.8 5.6c.2.6.4.8.8.8.4 0 .6-.2.9-.4l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8L22.8 5.9c.3-1.3-.5-1.9-1.3-1.5zM8.5 13.7l9.3-5.8c.4-.3.8-.1.5.2l-7.6 6.9-.3 3.1z"/>'),
    tiktok: SVG('<path d="M16.5 3c.3 2.3 1.7 3.8 4 4v3.1c-1.5 0-2.8-.4-4-1.2v6.3A5.7 5.7 0 1 1 10.8 9v3.2a2.6 2.6 0 1 0 2.6 2.6V3h3.1z"/>'),
    link: SVG('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
    share: SVG('<circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="m8.3 10.7 7.4-4M8.3 13.3l7.4 4" fill="none" stroke="currentColor" stroke-width="1.8"/>'),
    up: SVG('<path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  };
  const COLOR = { messenger: "#0a84ff", community: "#8b5cf6", youtube: "#ff0000", facebook: "#1877f2", discord: "#5865f2", zalo: "#0068ff", telegram: "#26a5e4", tiktok: "#fe2c55", link: "#7c4ddb" };
  const kindOf = (k) => (ICON[k] && COLOR[k] ? k : "link");

  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  /* ---------- thông báo tổng ---------- */

  let openNotice = null; // { close }

  /** Mở bảng thông báo. opts.track = true: ghi nhớ đã đóng / tắt 12 giờ. Xem thử của admin thì không ghi nhớ. */
  function showNotice(n, opts = {}) {
    if (openNotice) openNotice.close(false);
    const prevFocus = document.activeElement;
    const scrim = el("div", "sn-scrim");
    scrim.setAttribute("role", "dialog");
    scrim.setAttribute("aria-modal", "true");
    const imgs = (n.images || []).map((u) => `<img src="${ea(u)}" alt="" decoding="async">`).join("");
    const btn = n.btnUrl ? `<a class="sn-btn main" href="${ea(safeUrl(n.btnUrl))}" target="_blank" rel="noopener noreferrer">${ea(n.btnLabel || "Xem chi tiết")}</a>` : "";
    scrim.innerHTML = `
      <div class="sn-card" tabindex="-1">
        <button type="button" class="sn-x" aria-label="Đóng thông báo">×</button>
        ${imgs ? `<div class="sn-imgs">${imgs}</div>` : ""}
        <div class="sn-body">
          ${n.title ? `<h2 class="sn-title" id="snTitle">${ea(n.title)}</h2>` : ""}
          ${n.text ? `<div class="sn-text">${linkify(n.text)}</div>` : ""}
          <div class="sn-actions">
            ${btn}
            <button type="button" class="sn-btn soft" data-a="h12">Không hiện lại trong 12 giờ</button>
            <button type="button" class="sn-btn ghost" data-a="close">Đóng</button>
          </div>
        </div>
      </div>`;
    if (n.title) scrim.setAttribute("aria-labelledby", "snTitle");
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden";

    function close(remember = true) {
      if (!scrim.isConnected) return;
      document.removeEventListener("keydown", onKey, true);
      root.style.overflow = prevOverflow;
      scrim.classList.add("out");
      setTimeout(() => scrim.remove(), 180);
      openNotice = null;
      if (remember && opts.track) { try { sessionStorage.setItem(SEEN_KEY, String(n.v || "")); } catch (_) {} }
      try { prevFocus?.focus?.(); } catch (_) {}
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Tab") { // giữ phím Tab trong bảng thông báo
        const f = [...scrim.querySelectorAll("a[href],button")].filter((x) => !x.disabled);
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    }
    scrim.addEventListener("click", (e) => {
      if (e.target === scrim || e.target.closest(".sn-x") || e.target.closest('[data-a="close"]')) close();
      else if (e.target.closest('[data-a="h12"]')) {
        if (opts.track) { try { localStorage.setItem(HIDE_KEY, JSON.stringify({ v: String(n.v || ""), until: Date.now() + HOURS_12 })); } catch (_) {} }
        close();
      }
    });
    document.addEventListener("keydown", onKey, true);
    document.body.append(scrim);
    openNotice = { close };
    scrim.querySelector(".sn-card").focus({ preventScroll: true });
  }

  function hiddenNow(v) {
    try {
      const o = JSON.parse(localStorage.getItem(HIDE_KEY) || "null");
      if (o && o.v === String(v) && o.until > Date.now()) return true;
    } catch (_) {}
    try { if (sessionStorage.getItem(SEEN_KEY) === String(v)) return true; } catch (_) {}
    return false;
  }

  /* ---------- chân trang + nút nổi ---------- */

  const LINK_CLASS = { gold: "c-gold", red: "c-red", blue: "c-blue", pink: "c-pink", green: "c-green" };

  function buildFooter(s) {
    if (document.querySelector(".site-foot")) return;
    const contacts = s.showContacts ? s.contacts || [] : [];
    const cards = contacts.map((c) => {
      const k = kindOf(c.kind);
      return `<a class="sc-card" href="${ea(safeUrl(c.url))}" target="_blank" rel="noopener noreferrer"><span class="sc-ico" style="--bg:${COLOR[k]}">${ICON[k]}</span><span class="sc-name">${ea(c.label)}</span></a>`;
    }).join("");
    const links = (s.links || []).map((l) => `<a${LINK_CLASS[l.color] ? ` class="${LINK_CLASS[l.color]}"` : ""} href="${ea(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${ea(l.label)}</a>`).join("");
    const f = el("footer", "site-foot",
      `<div class="site-foot-in">
        ${s.showOnline ? `<div class="site-online" hidden><i class="so-dot"></i><b class="so-n">0</b> người đang online</div>` : ""}
        ${cards ? `<div class="site-contacts">${cards}</div>` : ""}
        ${s.note ? `<p class="site-note">${linkify(s.note)}</p>` : ""}
        ${links ? `<nav class="site-links" aria-label="Liên kết chân trang">${links}</nav>` : ""}
        <p class="site-copy">Copyright © ${new Date().getFullYear()} ${ea(s.name)}${s.version ? ` · Phiên bản ${ea(s.version)}` : ""}</p>
      </div>`);
    document.body.append(f);
    if (s.showOnline) startOnline(f.querySelector(".site-online"));
  }

  /* ---------- số người đang online (cả khách chưa đăng nhập) ---------- */

  function visitorId() {
    let id = "";
    try { id = localStorage.getItem("siteVid") || ""; } catch (_) {}
    if (!/^[a-f0-9]{16}$/.test(id)) {
      const a = new Uint8Array(8);
      (window.crypto || window.msCrypto).getRandomValues(a);
      id = [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
      try { localStorage.setItem("siteVid", id); } catch (_) {}
    }
    return id;
  }

  function startOnline(chip) {
    if (!chip) return;
    const nEl = chip.querySelector(".so-n");
    const id = visitorId();
    let timer = 0;
    async function ping() {
      try {
        const r = await fetch("/api/site/ping", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }), cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (Number.isFinite(d.online)) { nEl.textContent = new Intl.NumberFormat("vi-VN").format(d.online); chip.hidden = false; }
      } catch (_) {}
    }
    const loop = () => { clearInterval(timer); timer = 0; if (!document.hidden) { ping(); timer = setInterval(ping, 30000); } };
    document.addEventListener("visibilitychange", loop); // tab bị ẩn thì ngừng gửi nhịp, quay lại thì gửi ngay
    loop();
  }

  function buildFab(s) {
    if (document.querySelector(".site-fab")) return;
    const contacts = s.floatBtns ? s.contacts || [] : [];
    const list = contacts.map((c) => {
      const k = kindOf(c.kind);
      return `<a class="fab" style="--bg:${COLOR[k]}" href="${ea(safeUrl(c.url))}" target="_blank" rel="noopener noreferrer" aria-label="${ea(c.label)}" title="${ea(c.label)}">${ICON[k]}</a>`;
    }).join("");
    const fab = el("div", "site-fab",
      `${list ? `<div class="fab-list" id="siteFabList" hidden>${list}</div>
        <button type="button" class="fab fab-share" aria-label="Liên hệ và mạng xã hội" aria-expanded="false" aria-controls="siteFabList">${ICON.share}</button>` : ""}
      <button type="button" class="fab fab-top" aria-label="Lên đầu trang" hidden>${ICON.up}</button>`);
    document.body.append(fab);

    const top = fab.querySelector(".fab-top");
    const share = fab.querySelector(".fab-share");
    const box = fab.querySelector(".fab-list");
    const setOpen = (on) => {
      if (!share) return;
      box.hidden = !on;
      share.setAttribute("aria-expanded", String(on));
      try { localStorage.setItem(FAB_KEY, on ? "1" : "0"); } catch (_) {}
    };
    if (share) {
      let was = false;
      try { was = localStorage.getItem(FAB_KEY) === "1"; } catch (_) {}
      box.hidden = !was;
      share.setAttribute("aria-expanded", String(was));
      share.addEventListener("click", () => setOpen(box.hidden));
    }
    top.addEventListener("click", () => {
      const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" });
    });
    let tick = false;
    const onScroll = () => {
      if (tick) return;
      tick = true;
      requestAnimationFrame(() => { tick = false; top.hidden = window.scrollY < 400; });
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- khởi động ---------- */

  function loadCss() {
    return new Promise((done) => {
      if (document.querySelector('link[href="/site.css"]')) return done();
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = "/site.css";
      l.onload = l.onerror = () => done();
      document.head.append(l);
      setTimeout(done, 2500);
    });
  }

  async function init() {
    let data;
    try {
      const r = await fetch("/api/site/public", { cache: "no-store" });
      if (!r.ok) return;
      data = await r.json();
    } catch (_) { return; }
    await loadCss();
    if (data.site) { buildFooter(data.site); buildFab(data.site); }
    if (data.notice && !hiddenNow(data.notice.v)) {
      // đợi hiệu ứng mở đầu của trang chạy xong rồi mới hiện bảng
      const wait = document.documentElement.classList.contains("intro-on") ? 1000 : 200;
      setTimeout(() => showNotice(data.notice, { track: true }), wait);
    }
  }

  window.siteNotice = {
    /** Admin xem thử: n = { title, text, images: [url], btnLabel, btnUrl } */
    preview: (n) => loadCss().then(() => showNotice(n, { track: false })),
    _linkify: linkify,
    _hiddenNow: hiddenNow,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
