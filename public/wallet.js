/* Ví coin, bảng xếp hạng nạp và phần quản trị ví.
   Dùng các hàm có sẵn của app.js: $, api, say, esc, fmtDate, confirmBox. */
(() => {
  const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");
  const num = (s) => Number(String(s).replace(/[^\d]/g, "")) || 0;
  const KIND = { deposit: "Nạp tiền", spend: "Thanh toán", reward: "Thưởng", adjust: "Điều chỉnh" };
  const CHIPS = [20000, 50000, 100000, 200000, 500000];
  const MEDAL = ["gold", "silver", "bronze"];
  const RANKS = 10;
  let wal = null;

  /* Số dư hiện ngay trên thanh trên cùng */
  const short = (n) => n >= 1e9 ? (n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " tỷ"
    : n >= 1e7 ? (n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " tr" : fmt(n);
  function setChip(n) {
    const b = $("chipBal");
    if (!b) return;
    const t = short(n);
    if (b.textContent === t) return;
    const first = b.textContent === "…";
    b.textContent = t;
    $("walletChip").title = `${fmt(n)} coin`;
    if (!first) { b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
  }
  const refreshBalance = () => api("/wallet/balance").then((d) => setChip(d.balance)).catch(() => {});
  $("walletChip")?.addEventListener("click", () => showTab("wallet"));
  const baseBilling = window.onBillingLoaded;
  window.onBillingLoaded = function () { baseBilling?.(); if (billingData && billingData.wallet != null) setChip(billingData.wallet); };
  refreshBalance();
  setInterval(() => { if (!document.hidden) refreshBalance(); }, 45000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshBalance(); });
  const money = (el) => el.addEventListener("input", () => { const n = num(el.value); el.value = n ? fmt(n) : ""; });

  /* ================= Ví ================= */

  $("wChips").innerHTML = CHIPS.map((v) => `<button type="button" data-chip="${v}">${fmt(v)}</button>`).join("");
  $("wChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-chip]");
    if (b) { $("wAmount").value = fmt(b.dataset.chip); $("wAmount").focus(); }
  });
  money($("wAmount"));

  function depositCard(d) {
    const b = wal.bank;
    const qr = d.qr
      ? `<img src="${d.qr}" alt="Mã QR chuyển khoản" style="width:100%;max-width:15rem;border-radius:8px;margin:0.75rem 0">`
      : `<p style="color:var(--alert);font-size:0.85rem">Quản trị viên chưa khai báo tài khoản ngân hàng. Liên hệ trực tiếp để nạp.</p>`;
    return `<div class="state order-card">
      <div class="dim" style="font-size:0.85rem">Lệnh nạp chờ xác nhận</div>
      <div class="state-word" style="font-size:1.15rem">${fmt(d.amount)} coin</div>
      ${qr}
      <div style="font-size:0.9rem;line-height:1.8">
        ${b.account ? `Ngân hàng: ${esc(b.id)}<br>Số tài khoản: ${esc(b.account)}<br>Chủ tài khoản: ${esc(b.owner || "")}<br>` : ""}
        Nội dung chuyển khoản: <strong>${esc(d.code)}</strong>
      </div>
      ${b.note ? `<p class="hint" style="margin-top:0.5rem">${esc(b.note)}</p>` : ""}
      <p class="hint">Chuyển đúng số tiền và nội dung. Coin vào ví sau khi quản trị viên xác nhận.</p>
      <button class="danger" data-cancel="${d.id}">Huỷ lệnh nạp</button>
    </div>`;
  }

  async function loadWallet() {
    try { wal = await api("/wallet"); } catch (e) { return say(e.message, "bad"); }
    setChip(wal.balance);
    $("wBalance").textContent = fmt(wal.balance);
    $("wTotal").textContent = fmt(wal.totalDeposited);
    $("wMonth").textContent = fmt(wal.monthDeposited);
    $("wPending").innerHTML = wal.pending.map(depositCard).join("");
    histKind = "";
    for (const b of $("wKinds").children) b.classList.toggle("on", b.dataset.kind === "");
    $("wHistory").innerHTML = "";
    addHistory(wal.history, wal.history.length >= 30);
  }

  /* Lịch sử ví đầy đủ: 30 giao dịch mỗi lần, bấm "Xem thêm" để tải tiếp, lọc theo loại */
  let histKind = "", histBusy = false;
  const histRow = (h) => `<div class="user" data-id="${h.id}">
    <span class="name">${esc(h.note || KIND[h.kind] || h.kind)}</span>
    <span class="tag ${h.amount > 0 ? "ok" : "off"}">${h.amount > 0 ? "+" : "−"}${fmt(Math.abs(h.amount))}</span>
    <span class="spacer"></span><span class="dim" style="font-size:0.8rem">${fmtDate(h.created_at)}</span></div>`;
  function addHistory(rows, more) {
    const box = $("wHistory");
    box.querySelector(".empty")?.remove();
    box.insertAdjacentHTML("beforeend", rows.map(histRow).join(""));
    if (!box.children.length) box.innerHTML = '<div class="empty">Chưa có giao dịch nào.</div>';
    $("wMore").hidden = !more;
  }
  async function moreHistory(reset) {
    if (histBusy) return;
    histBusy = true;
    try {
      const last = reset ? "" : $("wHistory").lastElementChild?.dataset.id;
      const d = await api(`/wallet/history?kind=${histKind}${last ? "&before=" + last : ""}`);
      if (reset) $("wHistory").innerHTML = "";
      addHistory(d.rows, d.more);
    } catch (e) { say(e.message, "bad"); } finally { histBusy = false; }
  }
  $("wMore").addEventListener("click", () => moreHistory(false));
  $("wKinds").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-kind]");
    if (!b) return;
    histKind = b.dataset.kind;
    for (const x of $("wKinds").children) x.classList.toggle("on", x === b);
    moreHistory(true);
  });

  $("wDeposit").addEventListener("click", async () => {
    const amount = num($("wAmount").value);
    if (!amount) return say("Nhập số tiền muốn nạp.", "bad");
    const btn = $("wDeposit");
    btn.disabled = true;
    try {
      await api("/wallet/deposit", { method: "POST", body: JSON.stringify({ amount }) });
      $("wAmount").value = "";
      say("Đã tạo lệnh nạp. Chuyển khoản theo thông tin bên dưới.");
      await loadWallet();
    } catch (e) { say(e.message, "bad"); } finally { btn.disabled = false; }
  });

  $("wPending").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-cancel]");
    if (!b) return;
    if (!(await confirmBox("Lệnh nạp này sẽ bị huỷ.", { title: "Huỷ lệnh nạp?", ok: "Huỷ lệnh", cancel: "Giữ lại", danger: true }))) return;
    try { await api(`/wallet/deposit/${b.dataset.cancel}/cancel`, { method: "POST" }); say("Đã huỷ lệnh nạp."); loadWallet(); }
    catch (err) { say(err.message, "bad"); }
  });

  /* ================= Xếp hạng ================= */

  async function loadRank() {
    let d;
    try { d = await api("/leaderboard"); } catch (e) { return say(e.message, "bad"); }
    const left = Math.max(0, Math.ceil((new Date(d.endsAt) - Date.now()) / 86400000));
    $("rkTitle").textContent = `Bảng xếp hạng nạp tháng ${d.label}`;
    $("rkSub").textContent = `Xếp theo tổng coin nạp trong tháng. Còn ${left} ngày. Hết tháng, các hạng có thưởng được tự động cộng coin vào ví.`;

    const slot = (i) => {
      const r = d.top[i];
      return `<div class="pod ${MEDAL[i]}${r?.me ? " me" : ""}">
        <div class="pod-name">${r ? esc(r.name) : "Chưa có"}</div>
        <div class="pod-amt">${r ? fmt(r.total) + " coin" : "—"}</div>
        <div class="pod-step"><b>${i + 1}</b><span>${d.rewards[i] ? "Thưởng " + fmt(d.rewards[i]) : "Không thưởng"}</span></div></div>`;
    };
    $("rkPodium").innerHTML = [1, 0, 2].map(slot).join("");

    $("rkMe").innerHTML = d.me
      ? `Hạng của bạn: <strong>#${d.me.rank}</strong> · ${fmt(d.me.total)} coin` + (d.me.toNext ? ` · cần thêm ${fmt(d.me.toNext)} coin để lên hạng` : " · đang dẫn đầu")
      : `Bạn chưa nạp trong tháng này. <button type="button" class="link-btn" data-wallet>Nạp ngay</button>`;

    const rows = [];
    for (let i = 3; i < RANKS; i++) {
      const r = d.top[i], rw = d.rewards[i];
      rows.push(`<div class="user${r?.me ? " me" : ""}${r ? "" : " vacant"}"><span class="rk-n">#${i + 1}</span>
        <span class="name">${r ? esc(r.name) : "Chưa có"}</span>${rw ? `<span class="tag ok">Thưởng ${fmt(rw)}</span>` : ""}
        <span class="spacer"></span><span class="tag">${r ? fmt(r.total) + " coin" : "—"}</span></div>`);
    }
    $("rkList").innerHTML = rows.join("");

    $("rkLastBox").hidden = !d.last.winners.length;
    $("rkLast").innerHTML = d.last.winners.map((w) => `<div class="user"><span class="rk-n">#${w.rank}</span>
      <span class="name">${esc(w.name)}</span><span class="dim" style="font-size:0.8rem">tháng ${d.last.label}</span>
      <span class="spacer"></span><span class="tag ok">+${fmt(w.reward)} coin</span></div>`).join("");
  }
  $("rkMe").addEventListener("click", (e) => { if (e.target.closest("[data-wallet]")) showTab("wallet"); });

  /* Nạp dữ liệu khi vào tab */
  const baseShow = window.showTab;
  window.showTab = function (name) {
    baseShow(name);
    if (name === "wallet") loadWallet();
    if (name === "rank") loadRank();
  };
  if (current === "wallet") loadWallet();
  if (current === "rank") loadRank();

  /* ================= Quản trị ================= */

  const STATUS = { pending: "chờ", paid: "đã duyệt", cancelled: "đã huỷ" };
  async function loadDeposits() {
    const { deposits } = await api("/admin/deposits");
    $("deposits").innerHTML = deposits.length
      ? deposits.map((d) => `<div class="user">
          <span class="name">${esc(d.username)}</span><span class="tag">${fmt(d.amount)} coin</span>
          <span class="tag">${esc(d.code)}</span>
          <span class="tag ${d.status === "paid" ? "ok" : d.status === "cancelled" ? "off" : ""}">${STATUS[d.status]}</span>
          <span class="spacer"></span>
          ${d.status === "pending" ? `<button class="primary" data-ok="${d.id}">Xác nhận</button><button class="danger" data-no="${d.id}">Huỷ</button>` : ""}
        </div>`).join("")
      : '<div class="empty">Chưa có lệnh nạp nào.</div>';
  }

  $("deposits").addEventListener("click", async (e) => {
    const ok = e.target.closest("button[data-ok]"), no = e.target.closest("button[data-no]");
    try {
      if (ok) {
        const r = await api(`/admin/deposits/${ok.dataset.ok}/approve`, { method: "POST", body: "{}" });
        say(`Đã cộng ${fmt(r.amount)} coin vào ví.`);
      } else if (no) {
        await api(`/admin/deposits/${no.dataset.no}/cancel`, { method: "POST", body: "{}" });
        say("Đã huỷ lệnh nạp.");
      } else return;
      loadDeposits();
    } catch (err) { say(err.message, "bad"); }
  });

  $("rwGrid").innerHTML = Array.from({ length: RANKS }, (_, i) =>
    `<div class="field"><label for="rw${i + 1}">Top ${i + 1}</label><input type="text" id="rw${i + 1}" inputmode="numeric" placeholder="0"></div>`).join("");
  for (let i = 1; i <= RANKS; i++) money($("rw" + i));

  async function loadRewards() {
    const { rewards } = await api("/admin/rewards");
    rewards.forEach((v, i) => ($("rw" + (i + 1)).value = fmt(v)));
  }
  $("rwSave").addEventListener("click", async () => {
    try {
      await api("/admin/rewards", { method: "POST", body: JSON.stringify({ rewards: Array.from({ length: RANKS }, (_, i) => num($("rw" + (i + 1)).value)) }) });
      say("Đã lưu phần thưởng xếp hạng.");
    } catch (e) { say(e.message, "bad"); }
  });

  $("adjGo").addEventListener("click", async () => {
    const raw = $("adjAmount").value.trim();
    const amount = (raw.startsWith("-") ? -1 : 1) * num(raw);
    try {
      const r = await api("/admin/wallet/adjust", { method: "POST", body: JSON.stringify({ username: $("adjUser").value, amount, note: $("adjNote").value }) });
      say(`Đã cập nhật. Số dư mới: ${fmt(r.balance)} coin.`);
      $("adjAmount").value = $("adjNote").value = "";
    } catch (e) { say(e.message, "bad"); }
  });

  window.loadWalletAdmin = () => {
    $("depositsBox").hidden = false;
    $("rewardBox").hidden = false;
    loadDeposits().catch(() => {});
    loadRewards().catch(() => {});
  };
})();
