/* Quản trị: thông báo tổng toàn web (có hình) + thông tin liên hệ / chân trang / nút nổi.
   Dùng các hàm có sẵn: $, api, say. Server: server/site.js. Hiển thị cho khách: site.js. */
(() => {
  const anchor = $("depositsBox");
  if (!anchor) return;

  const KIND_LABEL = {
    messenger: "Messenger", youtube: "YouTube", facebook: "Facebook", discord: "Discord",
    community: "Community (Messenger tím)", zalo: "Zalo", telegram: "Telegram", tiktok: "TikTok", link: "Liên kết khác",
  };
  const ea = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const box = document.createElement("section");
  box.id = "siteBox";
  box.hidden = true;
  box.innerHTML = `
    <h2>Thông báo tổng và liên hệ</h2>

    <h3 class="sa-h">Thông báo tổng toàn web</h3>
    <p>Hiện thành bảng lớn khi khách vào web (cả trang đăng nhập). Khách bấm <b>Không hiện lại trong 12 giờ</b> thì 12 giờ sau mới hiện lại. Mỗi lần bạn bấm Lưu, thông báo được coi là mới nên hiện lại cho mọi người.</p>
    <label class="check"><input type="checkbox" id="saOn"> Bật thông báo</label>
    <div class="field"><label for="saTitle">Tiêu đề</label><input type="text" id="saTitle" maxlength="120" placeholder="Ví dụ: Bảo trì lúc 22h tối nay"></div>
    <div class="field"><label for="saText">Nội dung</label><textarea id="saText" rows="5" maxlength="4000" placeholder="Xuống dòng bình thường. Dán link https://… sẽ tự bấm được."></textarea></div>
    <div class="field">
      <label>Hình (tối đa <span id="saMax">4</span>)</label>
      <div class="sa-imgs" id="saImgs"></div>
      <input type="file" id="saFile" accept="image/*">
      <p class="hint" id="saFileHint">Ảnh được thu nhỏ tự động trước khi tải lên. GIF giữ nguyên, tối đa 2,5MB.</p>
    </div>
    <div class="field"><label for="saBtnLabel">Nút bấm (không bắt buộc)</label>
      <div class="sa-two"><input type="text" id="saBtnLabel" maxlength="40" placeholder="Chữ trên nút, ví dụ Xem chi tiết"><input type="text" id="saBtnUrl" placeholder="https://…" autocapitalize="off" spellcheck="false"></div></div>
    <div class="ap-actions"><button type="button" class="primary" id="saSaveN">Lưu thông báo</button><button type="button" id="saPrev">Xem thử</button></div>

    <h3 class="sa-h" style="margin-top:1.8rem">Thông tin liên hệ và chân trang</h3>
    <p>Hiện ở cuối mọi trang dưới dạng các thẻ liên hệ, kèm nút tròn nổi bên phải (bấm nút chia sẻ để mở ra) và dòng bản quyền. Mục nào để trống link sẽ không hiện.</p>
    <div class="field"><label for="saName">Tên web (dòng bản quyền)</label><input type="text" id="saName" maxlength="60"></div>
    <label class="check"><input type="checkbox" id="saShow"> Hiện các thẻ liên hệ ở cuối trang</label>
    <label class="check"><input type="checkbox" id="saFloat"> Hiện nút tròn nổi bên phải</label>
    <div class="field" style="margin-top:.8rem"><label>Các mục liên hệ</label><div id="saContacts"></div>
      <button type="button" id="saAddC">+ Thêm mục</button></div>
    <div class="field"><label>Link ở chân trang (Điều khoản, Quy tắc, Liên hệ…)</label><div id="saLinks"></div>
      <button type="button" id="saAddL">+ Thêm link</button></div>
    <div class="ap-actions"><button type="button" class="primary" id="saSaveI">Lưu liên hệ</button><button type="button" id="saReload">Hoàn tác</button></div>`;
  anchor.before(box);

  const style = document.createElement("style");
  style.textContent = `
  .sa-h{margin:1.1rem 0 .3rem;font-size:1.02rem}
  .sa-imgs{display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:.6rem}
  .sa-img{position:relative;width:5.6rem;height:5.6rem;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:var(--field)}
  .sa-img img{width:100%;height:100%;object-fit:cover;display:block}
  .sa-img button{position:absolute;top:.2rem;right:.2rem;width:1.5rem;height:1.5rem;padding:0;border-radius:50%;line-height:1;background:rgba(0,0,0,.65);color:#fff;border:1px solid rgba(255,255,255,.3)}
  .sa-two{display:grid;gap:.5rem;grid-template-columns:1fr}
  @media(min-width:34rem){.sa-two{grid-template-columns:1fr 1.4fr}}
  .sa-row{display:grid;gap:.4rem;grid-template-columns:1fr auto auto auto;padding:.6rem;border:1px solid var(--line);border-radius:14px;background:var(--raised);margin-bottom:.5rem}
  .sa-row .sa-kind,.sa-row .sa-label{grid-column:1 / -1}
  .sa-row .sa-url{grid-column:1 / 2}
  .sa-row.l .sa-label{grid-column:1 / -1}
  .sa-row button{padding:.4rem .7rem}
  @media(min-width:34rem){
    .sa-row{grid-template-columns:9.5rem 1fr 1.6fr auto auto auto}
    .sa-row .sa-kind,.sa-row .sa-label,.sa-row .sa-url{grid-column:auto}
    .sa-row.l{grid-template-columns:1fr 1.6fr auto auto auto}
  }`;
  document.head.append(style);

  let data = null;
  let imgs = []; // [{id,url}] của thông báo đang sửa

  /* ---------- thông báo ---------- */

  function drawImgs() {
    $("saImgs").innerHTML = imgs.map((m, i) => `<div class="sa-img"><img src="${ea(m.url)}" alt=""><button type="button" data-i="${i}" aria-label="Bỏ hình này">×</button></div>`).join("");
    $("saFile").disabled = imgs.length >= data.maxImages;
    $("saMax").textContent = data.maxImages;
  }

  function fillNotice() {
    const n = data.notice;
    $("saOn").checked = n.enabled;
    $("saTitle").value = n.title;
    $("saText").value = n.text;
    $("saBtnLabel").value = n.btnLabel;
    $("saBtnUrl").value = n.btnUrl;
    imgs = n.images.slice();
    drawImgs();
  }

  const noticeForm = () => ({
    enabled: $("saOn").checked,
    title: $("saTitle").value.trim(),
    text: $("saText").value.trim(),
    images: imgs.map((m) => m.id),
    btnLabel: $("saBtnLabel").value.trim(),
    btnUrl: $("saBtnUrl").value.trim(),
  });

  $("saImgs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (!b) return;
    imgs.splice(Number(b.dataset.i), 1);
    drawImgs();
  });

  /** Thu nhỏ về tối đa 1280px, nén JPEG (nền trắng cho ảnh trong suốt). GIF giữ nguyên để còn chuyển động. */
  async function prepImage(file) {
    if (!/^image\//.test(file.type)) throw new Error("Hãy chọn một file ảnh");
    if (file.type === "image/gif") {
      if (file.size > 2.5 * 1024 * 1024) throw new Error("GIF quá lớn (tối đa 2,5MB)");
      return file;
    }
    let bmp;
    try { bmp = await createImageBitmap(file); } catch (_) { throw new Error("Không đọc được ảnh này, thử ảnh JPG hoặc PNG"); }
    const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, h);
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.86));
    if (!blob) throw new Error("Không xử lý được ảnh này");
    if (blob.size > 2.9 * 1024 * 1024) throw new Error("Ảnh vẫn quá lớn, hãy chọn ảnh nhỏ hơn");
    return blob;
  }

  $("saFile").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (imgs.length >= data.maxImages) return say(`Tối đa ${data.maxImages} hình`, "bad");
    $("saFileHint").textContent = "Đang tải ảnh lên…";
    try {
      const blob = await prepImage(f);
      const r = await fetch("/api/site/image", { method: "POST", headers: { "content-type": blob.type }, body: blob });
      if (r.status === 401) { location.href = "/login.html"; return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Tải ảnh lên thất bại");
      imgs.push({ id: d.id, url: d.url });
      drawImgs();
      say("Đã thêm hình. Nhớ bấm Lưu thông báo.");
    } catch (err) { say(err.message, "bad"); }
    $("saFileHint").textContent = "Ảnh được thu nhỏ tự động trước khi tải lên. GIF giữ nguyên, tối đa 2,5MB.";
  });

  $("saSaveN").addEventListener("click", async () => {
    const b = $("saSaveN");
    b.disabled = true;
    try {
      data = await api("/site/admin", { method: "POST", body: JSON.stringify({ notice: noticeForm() }) });
      fillNotice();
      say(data.notice.enabled ? "Đã lưu. Thông báo đang bật, khách vào web sẽ thấy." : "Đã lưu. Thông báo đang tắt.");
    } catch (e) { say(e.message, "bad"); }
    b.disabled = false;
  });

  $("saPrev").addEventListener("click", () => {
    const f = noticeForm();
    if (!f.title && !f.text && !imgs.length) return say("Chưa có gì để xem thử", "bad");
    window.siteNotice?.preview({ title: f.title, text: f.text, images: imgs.map((m) => m.url), btnLabel: f.btnLabel, btnUrl: f.btnUrl });
  });

  /* ---------- liên hệ + chân trang ---------- */

  const contactRow = (c) => `
    <div class="sa-row c">
      <select class="sa-kind">${data.kinds.map((k) => `<option value="${k}" ${k === c.kind ? "selected" : ""}>${ea(KIND_LABEL[k] || k)}</option>`).join("")}</select>
      <input type="text" class="sa-label" maxlength="40" placeholder="Tên hiển thị" value="${ea(c.label)}">
      <input type="text" class="sa-url" placeholder="https://…" autocapitalize="off" spellcheck="false" value="${ea(c.url)}">
      <button type="button" data-a="up" aria-label="Lên">▲</button><button type="button" data-a="dn" aria-label="Xuống">▼</button><button type="button" data-a="del" aria-label="Xoá">✕</button>
    </div>`;
  const linkRow = (l) => `
    <div class="sa-row l">
      <input type="text" class="sa-label" maxlength="40" placeholder="Tên link" value="${ea(l.label)}">
      <input type="text" class="sa-url" placeholder="https://…" autocapitalize="off" spellcheck="false" value="${ea(l.url)}">
      <button type="button" data-a="up" aria-label="Lên">▲</button><button type="button" data-a="dn" aria-label="Xuống">▼</button><button type="button" data-a="del" aria-label="Xoá">✕</button>
    </div>`;

  const readC = () => [...$("saContacts").querySelectorAll(".sa-row")].map((r) => ({ kind: r.querySelector(".sa-kind").value, label: r.querySelector(".sa-label").value.trim(), url: r.querySelector(".sa-url").value.trim() }));
  const readL = () => [...$("saLinks").querySelectorAll(".sa-row")].map((r) => ({ label: r.querySelector(".sa-label").value.trim(), url: r.querySelector(".sa-url").value.trim() }));
  const drawC = (a) => { $("saContacts").innerHTML = a.map(contactRow).join("") || '<p class="hint">Chưa có mục nào.</p>'; };
  const drawL = (a) => { $("saLinks").innerHTML = a.map(linkRow).join("") || '<p class="hint">Chưa có link nào.</p>'; };

  function fillInfo() {
    const i = data.info;
    $("saName").value = i.name;
    $("saShow").checked = i.showContacts;
    $("saFloat").checked = i.floatBtns;
    drawC(i.contacts);
    drawL(i.links);
  }

  function rowAction(read, draw) {
    return (e) => {
      const b = e.target.closest("button[data-a]");
      if (!b) return;
      const rows = [...b.closest(".sa-row").parentElement.querySelectorAll(".sa-row")];
      const i = rows.indexOf(b.closest(".sa-row"));
      const a = read();
      if (b.dataset.a === "del") a.splice(i, 1);
      else if (b.dataset.a === "up" && i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]];
      else if (b.dataset.a === "dn" && i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]];
      draw(a);
    };
  }
  $("saContacts").addEventListener("click", rowAction(readC, drawC));
  $("saLinks").addEventListener("click", rowAction(readL, drawL));
  $("saAddC").addEventListener("click", () => { const a = readC(); if (a.length >= 10) return say("Tối đa 10 mục liên hệ", "bad"); a.push({ kind: "link", label: "", url: "" }); drawC(a); });
  $("saAddL").addEventListener("click", () => { const a = readL(); if (a.length >= 12) return say("Tối đa 12 link", "bad"); a.push({ label: "", url: "" }); drawL(a); });

  $("saSaveI").addEventListener("click", async () => {
    const b = $("saSaveI");
    b.disabled = true;
    try {
      const info = { name: $("saName").value.trim(), showContacts: $("saShow").checked, floatBtns: $("saFloat").checked, contacts: readC(), links: readL() };
      data = await api("/site/admin", { method: "POST", body: JSON.stringify({ info }) });
      fillInfo();
      say("Đã lưu thông tin liên hệ. Tải lại trang để thấy thay đổi.");
    } catch (e) { say(e.message, "bad"); }
    b.disabled = false;
  });

  async function load() {
    try {
      data = await api("/site/admin");
      fillNotice();
      fillInfo();
    } catch (e) { say(e.message, "bad"); }
  }
  $("saReload").addEventListener("click", load);

  const base = window.loadWalletAdmin;
  window.loadWalletAdmin = () => {
    base?.();
    box.hidden = false;
    load();
  };
})();
