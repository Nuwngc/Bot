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
        <div class="wallet-stats">
          <div><small>Lượt còn hôm nay</small><strong id="lcLeft">0</strong></div>
          <div><small>Coin có thể nhận</small><strong id="lcMax">0</strong></div>
        </div>
      </div>
    </section>

    <section>
      <h2>Vượt link nhận coin</h2>
      <p>Chọn một nhà cung cấp, vượt link rồi quay lại web để nhận coin. Lượt mới có từ 00:00 mỗi ngày. Vượt quá nhanh, dùng tool bypass hoặc đổi trình duyệt giữa chừng sẽ không được tính.</p>
      <div class="users" id="lcList"><div class="empty loading">Đang tải…</div></div>
    </section>

    <section id="lcAdmin" hidden>
      <h2>Quản lý nhà cung cấp</h2>
      <p>Mỗi nhà cung cấp là một dịch vụ rút gọn link. Bạn đặt số coin thưởng, số lượt mỗi ngày và thời gian vượt tối thiểu.</p>
      <div class="users" id="lcAdminList"></div>

      <form class="lc-card" id="lcForm" autocomplete="off">
        <h3 id="lcFormTitle">Thêm nhà cung cấp</h3>
        <input type="hidden" id="lcId">
        <div class="field">
          <label for="lcName">Tên hiển thị</label>
          <input type="text" id="lcName" placeholder="Ví dụ: link4m" maxlength="40">
        </div>
        <div class="field">
          <label for="lcApi">API URL</label>
          <input type="text" id="lcApi" placeholder="https://link4m.co/api-shorten/v2?api=...&url=..." inputmode="url" autocapitalize="off" spellcheck="false">
          <div class="hint">Dán nguyên link mẫu của nhà cung cấp, hệ thống tự tách token và thay phần <code>url=</code>.</div>
        </div>
        <div class="field">
          <label for="lcToken">API token</label>
          <input type="text" id="lcToken" placeholder="Để trống nếu link trên đã chứa token" autocapitalize="off" spellcheck="false">
          <div class="hint" id="lcTokenHint">Token được mã hoá khi lưu và không hiển thị lại.</div>
        </div>
        <div class="lc-grid">
          <div class="field">
            <label for="lcReward">Coin mỗi lượt</label>
            <input type="text" id="lcReward" inputmode="numeric" placeholder="300">
          </div>
          <div class="field">
            <label for="lcLimit">Lượt / ngày</label>
            <input type="text" id="lcLimit" inputmode="numeric" placeholder="3">
          </div>
          <div class="field">
            <label for="lcMin">Tối thiểu (giây)</label>
            <input type="text" id="lcMin" inputmode="numeric" placeholder="20">
          </div>
        </div>
        <label class="lc-check"><input type="checkbox" id="lcActive" checked> Đang bật cho khách sử dụng</label>
        <div class="row">
          <button type="submit" class="primary" id="lcSave">Lưu nhà cung cấp</button>
          <button type="button" id="lcCancel" hidden>Huỷ sửa</button>
        </div>
      </form>
    </section>`;
  const anchor = $("tab-wallet");
  anchor ? anchor.after(tab) : document.body.appendChild(tab);

  /* ---------- Người dùng ---------- */

  async function load() {
    try {
      const d = await api("/linkcoin");
      $("lcBalance").textContent = fmt(d.balance);
      let left = 0, max = 0;
      for (const p of d.providers) { const l = Math.max(0, p.limit - p.used); left += l; max += l * p.reward; }
      $("lcLeft").textContent = fmt(left);
      $("lcMax").textContent = fmt(max);
      $("lcList").innerHTML = d.providers.length
        ? d.providers.map((p) => {
            const l = Math.max(0, p.limit - p.used);
            return `<div class="user${l ? "" : " off"}">
              <span class="name">${esc(p.name)}</span>
              <span class="tag ok">+${fmt(p.reward)} coin</span>
              <span class="tag ${l ? "" : "off"}">${l ? `Còn ${l}/${p.limit} lượt` : "Hết lượt hôm nay"}</span>
              <span class="spacer"></span>
              <button type="button" class="primary" data-go="${p.id}" ${l ? "" : "disabled"}>Vượt link</button>
            </div>`;
          }).join("")
        : `<div class="empty">Chưa có nhà cung cấp nào đang mở.</div>`;
    } catch (e) { say(e.message, "bad"); }
  }

  $("lcList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-go]");
    if (!b) return;
    b.disabled = true;
    b.textContent = "Đang tạo link…";
    try {
      const r = await api("/linkcoin/start", { method: "POST", body: JSON.stringify({ providerId: Number(b.dataset.go) }) });
      location.href = r.url; // sang trang rút gọn; xong sẽ quay về /linkcoin/done
    } catch (err) {
      say(err.message, "bad");
      b.disabled = false;
      b.textContent = "Vượt link";
    }
  });

  /* ---------- Quản trị ---------- */

  let providers = [];

  function resetForm() {
    $("lcForm").reset();
    $("lcId").value = "";
    $("lcActive").checked = true;
    $("lcFormTitle").textContent = "Thêm nhà cung cấp";
    $("lcTokenHint").textContent = "Token được mã hoá khi lưu và không hiển thị lại.";
    $("lcCancel").hidden = true;
  }

  async function loadAdmin() {
    const d = await api("/admin/linkcoin");
    providers = d.providers;
    $("lcAdminList").innerHTML = providers.length
      ? providers.map((p) => `
        <div class="user${p.active ? "" : " off"}">
          <span class="name">${esc(p.name)}</span>
          <span class="tag ok">+${fmt(p.reward)} coin</span>
          <span class="tag">${p.daily_limit} lượt/ngày</span>
          <span class="tag">≥ ${p.min_seconds}s</span>
          <span class="tag ${p.hasToken ? "ok" : "off"}">${p.hasToken ? "Có token" : "Thiếu token"}</span>
          ${p.active ? "" : `<span class="tag off">Đang tắt</span>`}
          <span class="spacer"></span>
          <button type="button" data-edit="${p.id}">Sửa</button>
          <button type="button" class="danger" data-del="${p.id}">Xoá</button>
        </div>`).join("")
      : `<div class="empty">Chưa có nhà cung cấp nào. Thêm ở form bên dưới.</div>`;
  }

  $("lcAdminList").addEventListener("click", async (e) => {
    const ed = e.target.closest("[data-edit]");
    const del = e.target.closest("[data-del]");
    if (ed) {
      const p = providers.find((x) => x.id === Number(ed.dataset.edit));
      $("lcId").value = p.id;
      $("lcName").value = p.name;
      $("lcApi").value = p.api_url;
      $("lcToken").value = "";
      $("lcReward").value = p.reward;
      $("lcLimit").value = p.daily_limit;
      $("lcMin").value = p.min_seconds;
      $("lcActive").checked = p.active;
      $("lcFormTitle").textContent = `Sửa: ${p.name}`;
      $("lcTokenHint").textContent = p.hasToken ? "Để trống để giữ token hiện tại." : "Nhà cung cấp này chưa có token.";
      $("lcCancel").hidden = false;
      $("lcForm").scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (del && confirm("Xoá nhà cung cấp này?")) {
      try {
        await api(`/admin/linkcoin/${del.dataset.del}/delete`, { method: "POST", body: "{}" });
        say("Đã xoá nhà cung cấp");
        resetForm(); loadAdmin(); load();
      } catch (err) { say(err.message, "bad"); }
    }
  });

  $("lcCancel").addEventListener("click", resetForm);

  $("lcForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const save = $("lcSave");
    save.disabled = true;
    try {
      await api("/admin/linkcoin", {
        method: "POST",
        body: JSON.stringify({
          id: $("lcId").value || undefined,
          name: $("lcName").value,
          api_url: $("lcApi").value,
          token: $("lcToken").value,
          reward: $("lcReward").value,
          daily_limit: $("lcLimit").value,
          min_seconds: $("lcMin").value,
          active: $("lcActive").checked,
        }),
      });
      say("Đã lưu nhà cung cấp");
      resetForm(); loadAdmin(); load();
    } catch (err) { say(err.message, "bad"); }
    save.disabled = false;
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
