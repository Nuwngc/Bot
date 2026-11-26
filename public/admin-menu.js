/* Nhóm "Quản trị" trong menu 3 gạch: mỗi mục quản trị là một trang riêng, xếp trong danh sách sổ xuống.
   Chỉ tài khoản admin thấy; tài khoản thường không có các nút này nên không hiện gì.
   File này chỉ dời các khối có sẵn sang trang mới (giữ nguyên id), nên app.js, wallet.js, linkcoin.js, shop.js... chạy như cũ.
   Phải nạp sau mọi file chèn mục admin (autopay.js, toolcfg-admin.js, linkcoin.js, shop.js, revenue.js, linkstats.js) và trước ui.js. */
(() => {
  const tabs = document.getElementById("tabs");
  if (!tabs) return;
  const ic = (d) => '<svg viewBox="0 0 24 24"><path d="' + d + '"/></svg>';

  /* Danh sách trang, theo đúng thứ tự trong menu.
     tab: tên tab (dùng cho #địa-chỉ và showTab). Không có "sections" nghĩa là nút tab đã có sẵn, chỉ đưa vào nhóm.
     sections: id các khối dời sang trang này (id của chính khối <section>, hoặc id một ô bên trong khối). */
  const PAGES = [
    { tab: "stats", title: "Doanh thu", sub: "Thống kê" },
    { tab: "ledger", title: "Lịch sử giao dịch", sub: "Thống kê", sections: ["lgKind"],
      icon: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" },
    { tab: "linkstats", title: "Thống kê link", sub: "Thống kê" },

    { tab: "adm-deposits", title: "Duyệt nạp coin", sub: "Tiền và coin", sections: ["depositsBox"],
      icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l3 3 5-6" },
    { tab: "adm-autopay", title: "Tự động cộng tiền", sub: "Tiền và coin", sections: ["autopayBox"],
      icon: "M13 3 5 13.5h6L10 21l8-10.5h-6L13 3z" },
    { tab: "adm-adjust", title: "Cộng / trừ coin", sub: "Tiền và coin", sections: ["adjustBox"],
      icon: "M12 5v8M8 9h8M8 18h8" },
    { tab: "adm-orders", title: "Đơn thuê bot", sub: "Tiền và coin", sections: ["ordersBox"],
      icon: "M9 4h6v3H9zM7 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1M8.5 12h7M8.5 16h5" },
    { tab: "adm-pricing", title: "Bảng giá", sub: "Tiền và coin", sections: ["pricingBox"],
      icon: "M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01" },
    { tab: "adm-coupons", title: "Mã giảm giá", sub: "Tiền và coin", sections: ["couponBox"],
      icon: "M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6zM13 6v2M13 11v2M13 16v2" },

    { tab: "adm-rank", title: "Thưởng xếp hạng", sub: "Tính năng", sections: ["rewardBox"],
      icon: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" },
    { tab: "adm-linkcoin", title: "Nhà cung cấp link", sub: "Tính năng", sections: ["lcAdmin"],
      icon: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" },
    { tab: "adm-shop", title: "Quản lý shop acc", sub: "Tính năng", sections: ["shAdmin"],
      icon: "M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.5L20 8H6M10 20.5h.01M17 20.5h.01" },
    { tab: "adm-tools", title: "Cấu hình công cụ", sub: "Tính năng", sections: ["toolcfgBox"],
      icon: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" },

    { tab: "adm-users", title: "Tài khoản", sub: "Hệ thống", sections: ["adminBox"],
      icon: "M16 21v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 21v-1a4 4 0 0 0-3-3.9M16 4.1a4 4 0 0 1 0 7.8" },
    { tab: "adm-sections", title: "Ẩn mục", sub: "Hệ thống", sections: ["sectionsBox"],
      icon: "M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 4M6.5 7.6A16 16 0 0 0 2 12s3.6 6 10 6a10 10 0 0 0 3.2-.5M9.9 9.9a3 3 0 0 0 4.2 4.2" },
    { tab: "adm-mail", title: "Email xác thực", sub: "Hệ thống", sections: ["mailBox"],
      icon: "M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM3.5 7.5l8.5 6 8.5-6" },
    { tab: "adm-settings", title: "Cấu hình chung", sub: "Hệ thống", sections: ["settingsBox"],
      icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" },
  ];

  const stage = document.getElementById("tab-admin");           // khung chứa tạm trong dashboard.html
  const host = (stage && stage.parentNode) || document.querySelector(".wrap") || document.body;
  const sectionOf = (id) => {
    const e = document.getElementById(id);
    return e ? (e.tagName === "SECTION" ? e : e.closest("section")) : null;
  };

  const buttons = [];
  const pageNames = new Set();
  let lastPanel = stage || document.getElementById("tab-stats");

  PAGES.forEach((pg) => {
    let btn = tabs.querySelector(`button[data-tab="${pg.tab}"]`);

    if (pg.sections) {
      const found = pg.sections.map(sectionOf).filter(Boolean);
      if (!found.length) return;                                  // khối không tồn tại (file chèn nó chưa nạp): bỏ qua trang này
      const panel = document.createElement("div");
      panel.className = "tab";
      panel.id = "tab-" + pg.tab;
      panel.hidden = true;
      panel.append(...found);
      if (lastPanel) lastPanel.after(panel); else host.append(panel);
      lastPanel = panel;
      btn = document.createElement("button");
      btn.dataset.tab = pg.tab;
      btn.textContent = pg.title;
      if (pg.icon) btn.dataset.icon = ic(pg.icon);
    } else if (!btn) {
      return;
    }

    btn.dataset.group = "admin";
    btn.dataset.sub = pg.sub;
    if (!btn.dataset.icon && pg.icon) btn.dataset.icon = ic(pg.icon);
    btn.hidden = true;                                            // chỉ mở khi biết là admin
    tabs.append(btn);                                             // chuyển xuống cuối theo đúng thứ tự trong danh sách
    buttons.push(btn);
    pageNames.add(pg.tab);
  });

  /* Khung chứa tạm không còn gì thì bỏ */
  if (stage && !stage.querySelector("section")) stage.remove();

  /* ---------- Địa chỉ cũ #admin chuyển tới trang Tài khoản ---------- */

  const baseShow = window.showTab;
  window.showTab = function (name) {
    if (name === "admin") name = pageNames.has("adm-users") ? "adm-users" : "fb";
    baseShow(name);
  };

  /* ---------- Bật / tắt theo quyền (app.js gọi sau khi biết vai trò) ---------- */

  let opened = false;
  window.setAdminTabs = (on) => {
    buttons.forEach((b) => { b.hidden = !on; });
    // Vào bằng địa chỉ #adm-... thì lúc đó chưa biết là admin nên bots.js đã mở tab Facebook: giờ mở lại đúng trang
    if (on && !opened && typeof startTab === "string" && (pageNames.has(startTab) || startTab === "admin") && current === "fb") {
      opened = true;
      window.showTab(startTab);
    }
  };
  if (typeof isAdmin !== "undefined" && isAdmin) window.setAdminTabs(true);   // /me đã xong trước khi file này nạp
})();
