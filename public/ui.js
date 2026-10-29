/* Giao diện: sáng/tối, menu 3 gạch, xem mật khẩu, hiệu ứng gợn sóng.
   File này độc lập, không đụng tới app.js và bots.js. */
(() => {
  const root = document.documentElement, $ = (s) => document.querySelector(s);
  const store = {
    get: () => { try { return localStorage.getItem("theme"); } catch { return null; } },
    set: (v) => { try { localStorage.setItem("theme", v); } catch {} },
  };
  const apply = (t) => {
    root.dataset.theme = t;
    document.querySelectorAll(".theme-toggle").forEach((b) => b.setAttribute("aria-checked", t === "light"));
    const m = $("meta[name=theme-color]"); if (m) m.content = t === "light" ? "#f3f4ff" : "#12142b";
  };
  apply(root.dataset.theme || store.get() || "dark");
  const flip = () => { const t = root.dataset.theme === "light" ? "dark" : "light"; apply(t); store.set(t); };

  const ic = (d) => '<svg viewBox="0 0 24 24"><path d="' + d + '"/></svg>';
  const ICONS = {
    fb: ic("M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.7A8 8 0 1 1 21 12z"),
    zalo: ic("M4 5h16v11H9l-5 4V5zM8 9.5h8M8 12.5h5"),
    wallet: ic("M4 7a2 2 0 0 1 2-2h11v3M4 7v11a2 2 0 0 0 2 2h13V8H6a2 2 0 0 1-2-1zM16 14h2"),
    rank: ic("M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"),
    plan: ic("M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6"),
    admin: ic("M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"),
  };
  const SUN = '<svg class="sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg class="moon" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
  const btn = (cls, label, html) => { const b = el("button", cls, html); b.type = "button"; b.setAttribute("aria-label", label); return b; };
  const toggle = () => {
    const b = btn("theme-toggle", "Chế độ sáng", '<span class="knob">' + SUN + MOON + "</span>");
    b.setAttribute("role", "switch"); b.setAttribute("aria-checked", root.dataset.theme === "light"); b.onclick = flip; return b;
  };

  /* Cụm nút góc phải: sáng/tối (+ 3 gạch ở trang bảng điều khiển) */
  const bar = $(".topbar"), actions = el("div", "top-actions" + (bar ? "" : " floating"));
  actions.append(toggle());
  const chip = document.getElementById("walletChip");
  if (chip) actions.prepend(chip);
  (bar || document.body).append(actions);

  const tabs = document.getElementById("tabs");
  if (tabs) {
    const burger = btn("burger", "Mở menu", "<i></i><i></i><i></i>");
    burger.setAttribute("aria-expanded", "false"); burger.setAttribute("aria-controls", "drawer");
    const h1 = bar && bar.querySelector("h1");
    if (h1) h1.after(burger); else actions.append(burger);

    const scrim = el("div", "scrim"), drawer = el("aside", "drawer");
    drawer.id = "drawer"; drawer.setAttribute("aria-label", "Menu");
    const user = el("strong", "drawer-user"), nav = el("nav");
    const close = btn("drawer-close", "Đóng menu", '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>');
    const head = el("div", "drawer-head"); head.append(user, close);
    const row = el("div", "drawer-row", "<span>Giao diện sáng</span>"); row.append(toggle());
    const out = btn("danger wide", "Thoát", "Thoát"); out.onclick = () => { set(false); document.getElementById("logout")?.click(); };
    const foot = el("div", "drawer-foot"); foot.append(row, out);
    drawer.append(head, nav, foot); document.body.append(scrim, drawer);

    const sync = () => {
      nav.textContent = "";
      [...tabs.querySelectorAll("button")].filter((b) => !b.hidden).forEach((b, i) => {
        const n = btn(b.classList.contains("on") ? "on" : "", b.textContent.trim(), (ICONS[b.dataset.tab] || "") + "<span></span>");
        n.lastChild.textContent = b.textContent.trim();
        n.style.setProperty("--i", i); n.onclick = () => { b.click(); set(false); }; nav.append(n);
      });
      user.textContent = (document.getElementById("who")?.textContent || "Tài khoản").trim();
    };
    function set(open) {
      document.body.classList.toggle("menu-open", open);
      burger.setAttribute("aria-expanded", open); burger.setAttribute("aria-label", open ? "Đóng menu" : "Mở menu");
      document.body.style.overflow = open ? "hidden" : "";
      if (open) { sync(); close.focus(); }
    }
    burger.onclick = () => set(!document.body.classList.contains("menu-open"));
    close.onclick = scrim.onclick = () => { set(false); burger.focus(); };
    addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("menu-open")) set(false); });
  }

  /* Nút xem/ẩn mật khẩu */
  const EYE = '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  document.querySelectorAll("input[type=password]").forEach((i) => {
    const w = el("span", "pw"); i.before(w); w.append(i);
    const b = btn("eye", "Hiện mật khẩu", EYE);
    b.onclick = () => { const show = i.type === "password"; i.type = show ? "text" : "password"; b.classList.toggle("on", show); b.setAttribute("aria-label", show ? "Ẩn mật khẩu" : "Hiện mật khẩu"); };
    w.append(b);
  });

  /* Gợn sóng khi bấm nút */
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled || b.matches(".burger,.theme-toggle,.eye,.drawer-close")) return;
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height), s = el("span", "ripple");
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.append(s); setTimeout(() => s.remove(), 650);
  });

  /* Đánh dấu các dòng "Đang tải…" để hiện vòng quay */
  const mark = () => document.querySelectorAll(".empty").forEach((e) => e.classList.toggle("loading", /^Đang tải/.test(e.textContent.trim())));
  mark();
  new MutationObserver(() => requestAnimationFrame(mark)).observe(document.body, { childList: true, subtree: true, characterData: true });

  /* Bấm logo: xoay nhẹ rồi tải lại trang (giữ nguyên tab đang mở) */
  const logo = document.getElementById("logo");
  if (logo) logo.addEventListener("click", (e) => {
    e.preventDefault();
    logo.classList.add("spin");
    setTimeout(() => location.reload(), 320);
  });

  /* Tách tiêu đề thành từng chữ cho hiệu ứng mở màn (chỉ khi hiệu ứng đang bật) */
  if (root.classList.contains("intro-on")) {
    document.querySelectorAll(".login-card h1, .list-head h2").forEach((h) => {
      if (h.children.length || !h.textContent.trim()) return;
      const text = h.textContent.trim(); let c = 0;
      h.setAttribute("aria-label", text); h.textContent = "";
      text.split(" ").forEach((word, wi, all) => {
        const w = el("span", "w"); w.setAttribute("aria-hidden", "true");
        [...word].forEach((ch) => { const s = el("span", "ch"); s.textContent = ch; s.style.setProperty("--c", c++); w.append(s); });
        h.append(w);
        if (wi < all.length - 1) { h.append(" "); c++; }
      });
    });
  }

  /* Hết hiệu ứng mở màn: bỏ độ trễ để chuyển tab hiện ngay */
  if (root.classList.contains("intro-on")) setTimeout(() => root.classList.add("intro-done"), 2200);
})();
