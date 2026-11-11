/* Tab "Vượt link": vượt link rút gọn để nhận coin. Dùng hàm có sẵn của app.js: $, api, say, esc. */
(() => {
  const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");

  // Chèn nút tab + khung nội dung (không cần sửa HTML)
  const btn = document.createElement("button");
  btn.dataset.tab = "linkcoin";
  btn.textContent = "Vượt link";
  const walletBtn = $("tabs").querySelector('[data-tab="wallet"]');
  walletBtn ? walletBtn.after(btn) : $("tabs").appendChild(btn);

  const tab = document.createElement("div");
  tab.className = "tab";
  tab.id = "tab-linkcoin";
  tab.hidden = true;
  tab.innerHTML = `
    <section>
      <div class="wallet-hero">
        <div class="wallet-label">Số dư ví</div>
        <div class="wallet-balance"><b id="lcBalance">0</b><span>coin</span></div>
      </div>
      <p class="hint">Chọn một nhà cung cấp, vượt link rồi quay lại để nhận coin. Lượt mới có từ 00:00 mỗi ngày.
        Không dùng tool bypass: vượt quá nhanh hoặc khác trình duyệt sẽ không được tính.</p>
      <div class="users" id="lcList"><div class="empty">Đang tải…</div></div>
    </section>
    <section id="lcAdmin" hidden>
      <h2>Quản trị: nhà cung cấp link</h2>
      <div class="users" id="lcAdminList"></div>
      <form id="lcForm" autocomplete="off">
        <input type="hidden" id="lcId">
        <input id="lcName" placeholder="Tên (vd link4m)" maxlength="40">
        <input id="lcApi" placeholder="API URL, chứa {token} và {url}">
        <input id="lcToken" placeholder="API token (để trống = giữ token cũ)">
        <input id="lcReward" inputmode="numeric" placeholder="Coin mỗi lượt">
        <input id="lcLimit" inputmode="numeric" placeholder="Số lượt / ngày / người">
        <input id="lcMin" inputmode="numeric" placeholder="Thời gian vượt tối thiểu (giây)">
        <button type="submit" class="wide">Lưu nhà cung cấp</button>
      </form>
      <p class="hint">Có thể dán nguyên link mẫu của nhà cung cấp (vd https://link4m.co/api-shorten/v2?api=TOKEN&amp;url=abc.com), hệ thống tự tách token và thay phần url= cho đúng.</p>
    </section>`;
  const anchor = $("tab-wallet");
  anchor ? anchor.after(tab) : document.body.appendChild(tab);

  /* ---------- Người dùng ---------- */

  async function load() {
    try {
      const d = await api("/linkcoin");
      $("lcBalance").textContent = fmt(d.balance);
      $("lcList").innerHTML = d.providers.length
        ? d.providers.map((p) => {
            const left = p.limit - p.used;
            return `<div class="user-row" style="display:flex;justify-content:space-between;align-items:center;gap:0.75rem;padding:0.6rem 0">
              <div><b>${esc(p.name)}</b> · +${fmt(p.reward)} coin<br><small class="dim">${left > 0 ? `Còn ${left}/${p.limit} lượt hôm nay` : "Hết lượt hôm nay"}</small></div>
              <button type="button" data-go="${p.id}" ${left > 0 ? "" : "disabled"}>Vượt link</button>
            </div>`;
          }).join("")
        : `<div class="empty">Chưa có nhà cung cấp nào đang mở.</div>`;
    } catch (e) { say(e.message, "bad"); }
  }

  $("lcList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-go]");
    if (!b) return;
    b.disabled = true;
    try {
      const r = await api("/linkcoin/start", { method: "POST", body: JSON.stringify({ providerId: Number(b.dataset.go) }) });
      location.href = r.url; // sang trang rút gọn; xong sẽ quay về /linkcoin/done
    } catch (err) {
      say(err.message, "bad");
      b.disabled = false;
    }
  });

  /* ---------- Quản trị ---------- */

  let providers = [];
  async function loadAdmin() {
    const d = await api("/admin/linkcoin");
    providers = d.providers;
    $("lcAdminList").innerHTML = providers.map((p) => `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;padding:0.5rem 0">
        <div><b>${esc(p.name)}</b> ${p.active ? "" : "(tắt)"}<br>
          <small class="dim">+${fmt(p.reward)} coin · ${p.daily_limit} lượt/ngày · ≥${p.min_seconds}s ${p.hasToken ? "" : "· chưa có token"}</small></div>
        <span><button type="button" data-edit="${p.id}">Sửa</button> <button type="button" class="danger" data-del="${p.id}">Xoá</button></span>
      </div>`).join("") || `<div class="empty">Chưa có nhà cung cấp.</div>`;
  }

  $("lcAdminList").addEventListener("click", async (e) => {
    const ed = e.target.closest("[data-edit]");
    const del = e.target.closest("[data-del]");
    if (ed) {
      const p = providers.find((x) => x.id === Number(ed.dataset.edit));
      $("lcId").value = p.id; $("lcName").value = p.name; $("lcApi").value = p.api_url; $("lcToken").value = "";
      $("lcReward").value = p.reward; $("lcLimit").value = p.daily_limit; $("lcMin").value = p.min_seconds;
      $("lcName").focus();
    } else if (del && confirm("Xoá nhà cung cấp này?")) {
      await api(`/admin/linkcoin/${del.dataset.del}/delete`, { method: "POST", body: "{}" });
      loadAdmin(); load();
    }
  });

  $("lcForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/admin/linkcoin", {
        method: "POST",
        body: JSON.stringify({
          id: $("lcId").value || undefined, name: $("lcName").value, api_url: $("lcApi").value, token: $("lcToken").value,
          reward: $("lcReward").value, daily_limit: $("lcLimit").value, min_seconds: $("lcMin").value,
        }),
      });
      e.target.reset(); $("lcId").value = "";
      say("Đã lưu nhà cung cấp");
      loadAdmin(); load();
    } catch (err) { say(err.message, "bad"); }
  });

  // Hiện khu quản trị nếu là admin
  api("/me").then((me) => { if (me.role === "admin") { $("lcAdmin").hidden = false; loadAdmin().catch(() => {}); } }).catch(() => {});

  // Mở tab -> tải dữ liệu
  btn.addEventListener("click", load);
  if (location.hash === "#linkcoin") setTimeout(load, 0);

  // Kết quả sau khi vượt xong (server chuyển về ?lc=ok|err&m=...)
  const qs = new URLSearchParams(location.search);
  if (qs.get("lc")) {
    say(qs.get("m") || "", qs.get("lc") === "ok" ? "good" : "bad");
    history.replaceState(null, "", "/dashboard.html#linkcoin");
  }
})();
