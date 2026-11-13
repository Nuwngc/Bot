/* Tab "Thống kê link" (admin): lượt vượt của từng nhà cung cấp, coin phát ra so với tiền thu về,
   người vượt nhiều bất thường. Dùng các hàm có sẵn: $, api, say, esc. */
(() => {
  const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");
  const dec = (n) => Number(n || 0).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));
  const RANGES = [["today", "Hôm nay"], ["week", "7 ngày"], ["month", "30 ngày"], ["all", "Tất cả"]];
  let range = "week", data = null;

  /* ---------- Nút tab + khung nội dung (không cần sửa HTML) ---------- */

  const tabs = $("tabs");
  const statsBtn = $("tabStatsBtn");
  const btn = document.createElement("button");
  btn.dataset.tab = "linkstats";
  btn.textContent = "Thống kê link";
  btn.dataset.icon = '<svg viewBox="0 0 24 24"><path d="M12 3v9h9M12 3a9 9 0 1 0 9 9"/></svg>';
  btn.hidden = true;
  const adminBtn = $("tabAdminBtn");
  if (adminBtn) adminBtn.before(btn); else tabs.append(btn);

  // Chỉ admin thấy: theo dõi nút Doanh thu (app.js bật/tắt nút này theo quyền)
  if (statsBtn) {
    const sync = () => { btn.hidden = statsBtn.hidden; };
    new MutationObserver(sync).observe(statsBtn, { attributes: true, attributeFilter: ["hidden"] });
    sync();
  }

  const tab = document.createElement("div");
  tab.className = "tab";
  tab.id = "tab-linkstats";
  tab.hidden = true;
  tab.innerHTML = `
    <section>
      <h2>Thống kê vượt link</h2>
      <p>Lượt vượt xong của từng nhà cung cấp, coin đã phát ra so với tiền thu về và những tài khoản vượt nhiều bất thường. Không tính tài khoản quản trị. Ngày theo giờ Việt Nam.</p>
      <div class="chips" id="lsRange">${RANGES.map(([k, l]) => `<button type="button" data-range="${k}"${k === range ? ' class="on"' : ""}>${l}</button>`).join("")}</div>
      <div class="stat-grid" id="lsCards"><div class="empty">Đang tải…</div></div>
    </section>

    <section>
      <h3>Theo nhà cung cấp</h3>
      <p class="hint" id="lsRateHint" hidden>Server không thấy được tiền nhà cung cấp trả cho bạn. Hãy nhập "Tiền thu về mỗi lượt" (xem trong trang thu nhập của họ) ở từng thẻ bên dưới để so sánh với coin đã phát.</p>
      <div class="ls-list" id="lsProviders"></div>
    </section>

    <section>
      <h3>Coin phát ra so với tiền thu về</h3>
      <p class="hint">Coin miễn phí = vượt link + thưởng xếp hạng + admin cộng (chỉ tính phần cộng). Tiền thu về = tiền nạp thật + đơn chuyển khoản cũ + tiền nhà cung cấp trả (ước tính). 1 coin = 1đ.</p>
      <div class="users" id="lsSystem"></div>
    </section>

    <section>
      <h3>Người vượt nhiều bất thường</h3>
      <p class="hint" id="lsSusNote"></p>
      <div class="users ledger" id="lsSus"></div>
    </section>`;
  const anchor = $("tab-stats");
  if (anchor) anchor.after(tab); else document.body.append(tab);

  /* ---------- Hiển thị ---------- */

  function renderCards() {
    const t = data.total;
    const known = data.has_rate;
    const card = (cls, label, big, sub, bigCls = "") =>
      `<div class="stat ${cls}"><small>${label}</small><b class="${bigCls}">${big}</b><span class="dim">${sub}</span></div>`;
    $("lsCards").innerHTML = [
      card("", "Lượt vượt xong", fmt(t.n), `${fmt(t.users)} người vượt`),
      card("", "Coin đã phát ra", `${fmt(t.coin)}<i>coin</i>`, "từ vượt link"),
      card("", "Tiền thu về (ước tính)", known ? `${fmt(t.cash)}<i>đ</i>` : "—", known ? "từ các nhà cung cấp" : "chưa nhập tiền mỗi lượt"),
      card("hi", "Chênh lệch", known ? `${signed(t.diff)}<i>đ</i>` : "—", "thu về − coin phát ra", known ? (t.diff < 0 ? "neg" : "pos") : ""),
    ].join("");
  }

  function bar(kind, label, value, max) {
    const w = value > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
    return `<div class="ls-bar"><span>${label}</span><div class="ls-track"><i class="${kind}" style="width:${w}%"></i></div><em>${fmt(value)}</em></div>`;
  }

  function providerCard(p) {
    const known = p.rate > 0;
    const max = Math.max(p.coin, p.cash, 1);
    let verdict;
    if (p.deleted) verdict = '<span class="dim">Nhà cung cấp đã bị xoá, chỉ còn lịch sử lượt vượt</span>';
    else if (!known) verdict = '<span class="dim">Chưa nhập tiền thu về mỗi lượt</span>';
    else if (!p.n) verdict = '<span class="dim">Chưa có lượt nào trong kỳ này</span>';
    else if (p.diff < 0) verdict = `<span class="neg">Đang lỗ ${fmt(-p.diff)}đ</span>${p.cash ? ` · coin phát ra gấp ${dec(p.coin / p.cash)} lần tiền thu` : ""}`;
    else verdict = `<span class="pos">Lãi ${fmt(p.diff)}đ</span>`;
    const tags = [
      p.deleted ? '<span class="tag off">Đã xoá</span>' : p.active ? "" : '<span class="tag off">Đang tắt</span>',
      p.reward != null ? `<span class="tag ok">+${fmt(p.reward)} coin/lượt</span>` : "",
    ].join("");
    return `<div class="ls-card${p.active ? "" : " off"}">
      <div class="ls-head"><b>${esc(p.name)}</b>${tags}</div>
      <div class="ls-nums">
        <div><small>Lượt vượt</small><b>${fmt(p.n)}</b><span>${fmt(p.users)} người</span></div>
        <div><small>Coin phát ra</small><b>${fmt(p.coin)}</b><span>coin</span></div>
        <div><small>Tiền thu về</small><b>${known ? fmt(p.cash) : "—"}</b><span>${known ? "đ ước tính" : "chưa nhập"}</span></div>
      </div>
      <div class="ls-bars">${bar("coin", "Coin", p.coin, max)}${known ? bar("cash", "Tiền", p.cash, max) : ""}</div>
      <div class="ls-foot">${verdict}${p.avg_s != null ? ` · trung bình ${dec(p.avg_s)} giây/lượt` : ""}</div>
      ${p.deleted ? "" : `<div class="ls-rate">
        <label for="lsRate${p.id}">Tiền thu về mỗi lượt (đ)</label>
        <input type="text" id="lsRate${p.id}" data-rate-in="${p.id}" inputmode="decimal" autocomplete="off" placeholder="Ví dụ: 25" value="${p.rate ? String(p.rate).replace(".", ",") : ""}">
        <button type="button" data-rate="${p.id}">Lưu</button>
      </div>`}
    </div>`;
  }

  function renderProviders() {
    $("lsRateHint").hidden = data.has_rate;
    const list = [...data.providers].sort((a, b) => b.coin - a.coin || b.n - a.n || a.id - b.id);
    $("lsProviders").innerHTML = list.length
      ? list.map(providerCard).join("")
      : '<div class="empty">Chưa có nhà cung cấp nào. Thêm ở tab Vượt link.</div>';
  }

  function renderSystem() {
    const s = data.system, known = data.has_rate;
    const row = (name, val, sub = "", cls = "") =>
      `<div class="user"><span class="name">${name}</span>${sub ? `<span class="dim" style="font-size:.8rem">${sub}</span>` : ""}<span class="spacer"></span><span class="tag ${cls}">${val}</span></div>`;
    $("lsSystem").innerHTML = [
      row("Coin vượt link", `${fmt(s.free.task)} coin`),
      row("Thưởng xếp hạng", `${fmt(s.free.reward)} coin`),
      row("Admin cộng coin", `${fmt(s.free.adjust)} coin`),
      row("<b>Tổng coin miễn phí đã phát</b>", `${fmt(s.free_total)} coin`, "", s.free_total ? "off" : ""),
      row("Tiền nạp thật", `${fmt(s.deposit)}đ`, "", s.deposit ? "ok" : ""),
      row("Đơn chuyển khoản cũ", `${fmt(s.legacy)}đ`, "", s.legacy ? "ok" : ""),
      row("Tiền từ nhà cung cấp", known ? `${fmt(s.provider_cash)}đ` : "chưa nhập", "ước tính", known ? "ok" : ""),
      row("<b>Tổng tiền thu về</b>", `${fmt(s.cash_total)}đ`, "", s.cash_total ? "ok" : ""),
      row("<b>Thu về − coin phát ra</b>", `${signed(s.diff)}đ`, "", s.diff < 0 ? "off" : "ok"),
    ].join("");
  }

  function susRow(u) {
    const strong = u.reasons.length >= 2;
    return `<div class="lg-row">
      <div class="lg-main">
        <div class="lg-top"><b>${esc(u.username)}</b><span class="tag ${strong ? "off" : ""}">${u.reasons.length} dấu hiệu</span>${u.active ? "" : '<span class="tag off">Đã khoá</span>'}</div>
        <div class="lg-note">${u.reasons.map((r) => `• ${esc(r)}`).join("<br>")}</div>
        <div class="lg-time">${fmt(u.n)} lượt · ${fmt(u.days)} ngày · đã nạp ${fmt(u.deposited)}đ</div>
      </div>
      <div class="lg-amt pos">+${fmt(u.coin)}<small>coin kiếm được</small></div>
    </div>`;
  }

  function renderSuspects() {
    const s = data.suspects;
    $("lsSusNote").textContent =
      `Xét ${fmt(s.active_users)} người đã vượt trong kỳ này (trung vị ${dec(s.median)} lượt/người${s.daily_cap ? `, tối đa ${fmt(s.daily_cap)} lượt/ngày` : ""}). ` +
      "Các dấu hiệu: vượt gấp nhiều lần số đông, ngày nào cũng chạm trần, luôn vượt sát mức thời gian tối thiểu, dùng chung IP với tài khoản khác. Chỉ để tham khảo: cùng wifi hoặc 4G cũng có thể trùng IP. Khoá tài khoản ở tab Quản trị.";
    $("lsSus").innerHTML = s.list.length
      ? s.list.map(susRow).join("") + (s.total > s.list.length ? `<div class="empty">Đang hiện ${s.list.length}/${s.total} người nghi vấn nhiều nhất.</div>` : "")
      : `<div class="empty">Không có ai vượt nhiều bất thường trong kỳ này.${s.active_users < 5 ? " (Cần ít nhất 5 người vượt thì mới so được với số đông; các dấu hiệu khác vẫn được kiểm tra.)" : ""}</div>`;
  }

  async function load() {
    try { data = await api("/admin/linkstats?range=" + range); } catch (e) { return say(e.message, "bad"); }
    renderCards();
    renderProviders();
    renderSystem();
    renderSuspects();
  }

  /* ---------- Thao tác ---------- */

  $("lsRange").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-range]");
    if (!b) return;
    range = b.dataset.range;
    for (const x of $("lsRange").children) x.classList.toggle("on", x === b);
    load();
  });

  $("lsProviders").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-rate]");
    if (!b) return;
    const input = tab.querySelector(`[data-rate-in="${b.dataset.rate}"]`);
    b.disabled = true;
    try {
      await api("/admin/linkstats/rate", { method: "POST", body: JSON.stringify({ id: Number(b.dataset.rate), pay_per_view: input.value }) });
      say("Đã lưu tiền thu về mỗi lượt");
      await load();
    } catch (err) { say(err.message, "bad"); }
    b.disabled = false;
  });

  $("lsProviders").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.matches("[data-rate-in]")) return;
    e.preventDefault();
    tab.querySelector(`button[data-rate="${e.target.dataset.rateIn}"]`)?.click();
  });

  /* ---------- Mở tab ---------- */

  const baseShow = window.showTab;
  window.showTab = function (name) {
    baseShow(name);
    if (name === "linkstats") load();
  };
  if (current === "linkstats") load();
})();
