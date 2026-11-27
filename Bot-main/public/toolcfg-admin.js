/* Quản trị: ẩn công cụ và tính coin cho từng công cụ trong tab Công cụ.
   Dùng các hàm có sẵn: $, api, say, esc. Server: server/toolcfg.js */
(() => {
  const anchor = $("depositsBox");
  if (!anchor) return;
  const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");

  const box = document.createElement("section");
  box.id = "toolcfgBox";
  box.hidden = true;
  box.innerHTML = `
    <h2>Công cụ: ẩn và tính coin</h2>
    <p>Với mỗi công cụ trong tab Công cụ, bạn có thể ẩn khỏi người dùng hoặc đặt giá. Giá là số coin cho <b>một phiên</b>: người dùng bấm Mở khoá, bị trừ coin trong ví rồi dùng thoải mái trong số phút của phiên. Giá 0 là miễn phí. Admin luôn dùng miễn phí và vẫn thấy công cụ đang ẩn.</p>
    <p class="hint">Công cụ có <b>dấu máy chủ</b> (Đọc văn bản, Lấy văn bản từ link, Mail) được máy chủ chặn thật. Công cụ còn lại chạy hoàn toàn trên trình duyệt người dùng nên chỉ chặn ở giao diện, người rành kỹ thuật vẫn có thể vượt qua.</p>
    <div id="tcList"></div>
    <div class="ap-actions"><button type="button" class="primary" id="tcSave">Lưu cấu hình</button><button type="button" id="tcReload">Hoàn tác</button></div>`;
  anchor.before(box);

  const style = document.createElement("style");
  style.textContent = `
  .tc-row{padding:.7rem .8rem;border:1px solid var(--line);border-radius:14px;background:var(--raised);margin-bottom:.5rem}
  .tc-top{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
  .tc-top b{flex:1;min-width:8rem}
  .tc-srv{font-size:.7rem;padding:.1rem .45rem;border-radius:999px;border:1px solid var(--line);color:var(--dim)}
  .tc-f{display:flex;gap:.7rem;flex-wrap:wrap;align-items:center;margin-top:.5rem}
  .tc-f label{display:flex;align-items:center;gap:.4rem;font-size:.85rem}
  .tc-f input[type=number]{width:6.5rem}`;
  document.head.append(style);

  let data = null;

  function draw() {
    $("tcList").innerHTML = data.tools.map((t) => `
      <div class="tc-row" data-id="${esc(t.id)}">
        <div class="tc-top"><b>${esc(t.title)}</b>${t.server ? '<span class="tc-srv" title="Máy chủ chặn thật">máy chủ</span>' : ""}</div>
        <div class="tc-f">
          <label><input type="checkbox" data-k="hidden" ${t.hidden ? "checked" : ""}> Ẩn</label>
          <label>Giá <input type="number" data-k="price" min="0" max="${data.maxPrice}" step="1" inputmode="numeric" value="${t.price}"> coin</label>
          <label>Phiên <input type="number" data-k="minutes" min="1" max="1440" step="1" inputmode="numeric" value="${t.minutes}"> phút</label>
        </div>
      </div>`).join("");
  }

  async function load() {
    try { data = await api("/admin/tools"); draw(); } catch (e) { say(e.message, "bad"); }
  }

  $("tcSave").addEventListener("click", async () => {
    const tools = {};
    for (const row of $("tcList").querySelectorAll(".tc-row")) {
      const v = (k) => row.querySelector(`[data-k="${k}"]`);
      tools[row.dataset.id] = { hidden: v("hidden").checked, price: Number(v("price").value || 0), minutes: Number(v("minutes").value || 30) };
    }
    const b = $("tcSave");
    b.disabled = true;
    try {
      data = { ...data, ...(await api("/admin/tools", { method: "POST", body: JSON.stringify({ tools }) })) };
      draw();
      const paid = data.tools.filter((t) => t.price > 0).length, hid = data.tools.filter((t) => t.hidden).length;
      say(`Đã lưu. ${fmt(paid)} công cụ tính coin, ${fmt(hid)} công cụ đang ẩn.`);
    } catch (e) { say(e.message, "bad"); }
    b.disabled = false;
  });
  $("tcReload").addEventListener("click", load);

  const base = window.loadWalletAdmin;
  window.loadWalletAdmin = () => {
    base?.();
    box.hidden = false;
    load();
  };
})();
