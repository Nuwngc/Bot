/* Tab Doanh thu (admin): thống kê tiền nhận + lịch sử giao dịch đầy đủ + xuất CSV.
   Dùng các hàm có sẵn: $, api, say, esc, fmtDate, showTab. */
(() => {
  const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");
  const KIND = { deposit: "Nạp tiền", spend: "Thanh toán", reward: "Thưởng", adjust: "Điều chỉnh", legacy: "Đơn chuyển khoản cũ" };
  let st = null, range = "day", scope = "month", sel = -1;
  const lg = { page: 1 };

  /* ================= Thống kê ================= */

  const CARDS = [["today", "Hôm nay"], ["week", "7 ngày qua"], ["month", "Tháng này"], ["all", "Tất cả"]];

  function renderCards() {
    $("stCards").innerHTML = CARDS.map(([k, label]) => {
      const p = st[k];
      return `<div class="stat ${k === "month" ? "hi" : ""}">
        <small>${label}</small>
        <b>${fmt(p.cash)}<i>đ</i></b>
        <span>${p.depositCount} lệnh nạp${p.depositors ? ` · ${p.depositors} người` : ""}</span>
        <span class="dim">Đã chi thuê bot ${fmt(p.spend)} coin</span>
      </div>`;
    }).join("");
  }

  const shortDay = (k) => `${k.slice(8)}/${k.slice(5, 7)}`;
  const shortMonth = (k) => `${k.slice(5)}/${k.slice(2, 4)}`;

  function renderBars() {
    const data = range === "day" ? st.daily : st.monthly;
    const max = Math.max(1, ...data.map((d) => d.cash));
    if (sel < 0 || sel >= data.length) sel = data.length - 1;
    $("stBars").innerHTML = `<div class="bars-max">${fmt(max)}đ</div><div class="bars-row">${data
      .map((d, i) => `<button type="button" class="bar${i === sel ? " on" : ""}${d.cash ? "" : " zero"}" data-i="${i}" aria-label="${range === "day" ? shortDay(d.k) : shortMonth(d.k)}: ${fmt(d.cash)}đ"><i style="height:${Math.max(d.cash ? 4 : 1, Math.round((d.cash / max) * 100))}%"></i></button>`)
      .join("")}</div>
      <div class="bars-axis"><span>${range === "day" ? shortDay(data[0].k) : shortMonth(data[0].k)}</span><span>${range === "day" ? shortDay(data[data.length - 1].k) : shortMonth(data[data.length - 1].k)}</span></div>`;
    caption(data);
  }

  function caption(data) {
    const d = data[sel];
    const total = data.reduce((s, x) => s + x.cash, 0);
    $("stCap").innerHTML = `<b>${range === "day" ? shortDay(d.k) : "Tháng " + shortMonth(d.k)}</b>: nhận <b>${fmt(d.cash)}đ</b> · chi thuê bot ${fmt(d.spend)} coin<br><span class="dim">Cả ${range === "day" ? "30 ngày" : "12 tháng"}: ${fmt(total)}đ</span>`;
  }

  $("stBars").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (!b) return;
    sel = Number(b.dataset.i);
    renderBars();
  });
  $("stRange").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-range]");
    if (!b) return;
    range = b.dataset.range;
    sel = -1;
    for (const x of $("stRange").children) x.classList.toggle("on", x === b);
    renderBars();
  });
  $("stScope").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-scope]");
    if (!b) return;
    scope = b.dataset.scope;
    for (const x of $("stScope").children) x.classList.toggle("on", x === b);
    renderDetail();
  });

  function renderDetail() {
    const p = st[scope], pr = st.products[scope];
    const row = (name, val, sub = "", cls = "") =>
      `<div class="user"><span class="name">${name}</span>${sub ? `<span class="dim" style="font-size:.8rem">${sub}</span>` : ""}<span class="spacer"></span><span class="tag ${cls}">${val}</span></div>`;
    $("stDetail").innerHTML = [
      row("Coin nạp", fmt(p.deposit) + "đ", `${p.depositCount} lệnh`, "ok"),
      row("Đơn chuyển khoản cũ", fmt(p.legacy) + "đ", `${p.legacyCount} đơn`, p.legacy ? "ok" : ""),
      row("Thuê bot Facebook", fmt(pr.fb.s) + " coin", `${pr.fb.n} lượt`),
      row("Thuê bot Zalo", fmt(pr.zalo.s) + " coin", `${pr.zalo.n} lượt`),
      row("Thưởng xếp hạng đã trao", fmt(p.reward) + " coin"),
      row("Admin cộng / trừ coin", (p.adjust > 0 ? "+" : "") + fmt(p.adjust) + " coin"),
      row("Coin còn trong ví khách", fmt(st.wallets.balance) + " coin", `${st.wallets.holders} người`),
      row("Lệnh nạp chờ duyệt", fmt(st.pending.s) + "đ", `${st.pending.n} lệnh`, st.pending.n ? "off" : ""),
    ].join("");
  }

  async function loadStats() {
    try { st = await api("/admin/stats"); } catch (e) { return say(e.message, "bad"); }
    renderCards();
    renderBars();
    renderDetail();
  }

  /* ================= Lịch sử giao dịch ================= */

  function params(page) {
    const p = new URLSearchParams();
    const set = (k, v) => v && p.set(k, v);
    set("kind", $("lgKind").value);
    set("q", $("lgQ").value.trim());
    set("from", $("lgFrom").value);
    set("to", $("lgTo").value);
    if (page) p.set("page", page);
    return p;
  }

  function row(r) {
    const pos = r.amount > 0;
    return `<div class="lg-row">
      <div class="lg-main">
        <div class="lg-top"><b>${esc(r.username)}</b><span class="tag ${r.kind === "deposit" || r.kind === "legacy" ? "ok" : ""}">${KIND[r.kind] || r.kind}</span></div>
        <div class="lg-note">${esc(r.note || KIND[r.kind] || "")}</div>
        <div class="lg-time">${fmtDate(r.at)}${r.ref ? " · " + esc(r.ref) : ""}</div>
      </div>
      <div class="lg-amt ${pos ? "pos" : "neg"}">${pos ? "+" : "−"}${fmt(Math.abs(r.amount))}${r.balance != null ? `<small>còn ${fmt(r.balance)}</small>` : ""}</div>
    </div>`;
  }

  async function loadLedger(page = 1) {
    let d;
    try { d = await api("/admin/transactions?" + params(page)); } catch (e) { return say(e.message, "bad"); }
    lg.page = d.page;
    lg.pages = d.pages;
    $("lgList").innerHTML = d.rows.length ? d.rows.map(row).join("") : '<div class="empty">Không có giao dịch nào khớp bộ lọc.</div>';
    $("lgSum").textContent = `${fmt(d.total)} giao dịch · vào +${fmt(d.inn)} · ra −${fmt(d.out)}`;
    $("lgPager").hidden = d.pages <= 1;
    $("lgPage").textContent = `Trang ${d.page}/${d.pages}`;
    $("lgPrev").disabled = d.page <= 1;
    $("lgNext").disabled = d.page >= d.pages;
  }

  $("lgGo").addEventListener("click", () => loadLedger(1));
  for (const id of ["lgQ"]) $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") loadLedger(1); });
  for (const id of ["lgKind", "lgFrom", "lgTo"]) $(id).addEventListener("change", () => loadLedger(1));
  $("lgPrev").addEventListener("click", () => loadLedger(lg.page - 1));
  $("lgNext").addEventListener("click", () => loadLedger(lg.page + 1));
  $("lgCsv").addEventListener("click", () => {
    // Tải thẳng file: trình duyệt gửi kèm cookie đăng nhập
    location.href = "/api/admin/transactions.csv?" + params(0);
    say("Đang tải file CSV theo bộ lọc hiện tại.");
  });

  /* ================= Mở tab ================= */

  const baseShow = window.showTab;
  window.showTab = function (name) {
    baseShow(name);
    if (name === "stats") { loadStats(); loadLedger(lg.page || 1); }
  };
  if (current === "stats") { loadStats(); loadLedger(1); }
})();
