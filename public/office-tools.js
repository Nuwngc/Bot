/* Công cụ VĂN PHÒNG cho tab Công cụ: ảnh → PDF, nén/đổi cỡ ảnh, số thành chữ, tính VAT và %, đếm văn bản.
   Mọi thứ chạy ngay trên trình duyệt, ảnh và văn bản không gửi lên máy chủ. Tự gắn vào #tab-tools (do tools.js dựng). */
(() => {
  const g = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const toast = (t, kind) => (typeof say === "function" ? say(t, kind) : alert(t));
  const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");
  const ic = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const sizeText = (b) => (b >= 1048576 ? (b / 1048576).toFixed(2) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
  const safeName = (s, def) => (String(s || "").trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\.(pdf|jpe?g|png|webp)$/i, "").slice(0, 80) || def);

  /* ---------- số thành chữ (tiếng Việt) ---------- */
  /*NUM-START*/
  const DIGIT = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  function read3(n, full) {
    const tr = Math.floor(n / 100), ch = Math.floor((n % 100) / 10), dv = n % 10, out = [];
    if (tr > 0 || full) out.push(DIGIT[tr] + " trăm");
    if (ch > 1) {
      out.push(DIGIT[ch] + " mươi");
      if (dv === 1) out.push("mốt");
      else if (dv === 4) out.push("tư");
      else if (dv === 5) out.push("lăm");
      else if (dv > 0) out.push(DIGIT[dv]);
    } else if (ch === 1) {
      out.push("mười");
      if (dv === 5) out.push("lăm");
      else if (dv > 0) out.push(DIGIT[dv]);
    } else if (dv > 0) {
      if (tr > 0 || full) out.push("lẻ");
      out.push(DIGIT[dv]);
    }
    return out.join(" ");
  }
  function numToVi(digits) {
    digits = String(digits).replace(/^0+(?=\d)/, "");
    if (!/^\d+$/.test(digits)) throw new Error("Chỉ nhập chữ số.");
    if (digits.length > 15) throw new Error("Số quá lớn (tối đa 15 chữ số).");
    if (/^0+$/.test(digits)) return "không";
    const groups = [];
    for (let i = digits.length; i > 0; i -= 3) groups.unshift(Number(digits.slice(Math.max(0, i - 3), i)));
    const parts = [];
    let started = false;
    groups.forEach((val, idx) => {
      const k = groups.length - 1 - idx;
      if (val === 0) return;
      const small = ["", "nghìn", "triệu"][k % 3];
      const big = "tỷ ".repeat(Math.floor(k / 3)).trim();
      parts.push([read3(val, started), small, big].filter(Boolean).join(" "));
      started = true;
    });
    return parts.join(" ");
  }
  /*NUM-END*/

  /* ---------- đọc ảnh, vẽ lên canvas, xuất JPEG/WebP/PNG ---------- */
  const MAX_FILES = 50;

  async function loadImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new Error(`Không đọc được ảnh "${file.name}". Định dạng này có thể chưa được hỗ trợ (ví dụ HEIC). Hãy chọn JPG, PNG hoặc WebP.`);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  }

  function toBlob(canvas, type, q) {
    return new Promise((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("Trình duyệt không xuất được ảnh."))), type, q));
  }

  function enhance(ctx, w, h) {
    const im = ctx.getImageData(0, 0, w, h), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      v = (v - 128) * 1.45 + 128 + 18;
      d[i] = d[i + 1] = d[i + 2] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    ctx.putImageData(im, 0, 0);
  }

  /** Vẽ ảnh (có xoay) vào canvas với cạnh dài tối đa maxSide, nền trắng. */
  async function draw(file, rot, maxSide, doEnhance) {
    const img = await loadImage(file);
    let w = img.naturalWidth, h = img.naturalHeight;
    const k = Math.min(1, maxSide / Math.max(w, h));
    w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
    const swap = rot % 180 !== 0;
    const c = document.createElement("canvas");
    c.width = swap ? h : w; c.height = swap ? w : h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (doEnhance) enhance(ctx, c.width, c.height);
    return c;
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    return url;
  }

  /* ---------- danh sách các công cụ ---------- */
  const TOOLS = [
    { id: "img2pdf", title: "Ảnh sang PDF", desc: "Ghép nhiều ảnh thành một file PDF, chọn khổ giấy, sắp xếp và xoay", icon: ic('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 16l2-2.5 1.5 1.5 2-2.5"/>'), html: `
      <p class="tl-note">Chọn hoặc chụp nhiều ảnh, sắp xếp thứ tự rồi tạo một file PDF. Ảnh được xử lý ngay trên máy bạn và không gửi đi đâu.</p>
      <div class="row"><button class="primary" id="ip-pick" type="button">Chọn ảnh</button><button id="ip-cam" type="button">Chụp ảnh</button><button id="ip-clear" type="button" hidden>Xoá hết</button></div>
      <input id="ip-file" type="file" accept="image/*" multiple hidden>
      <input id="ip-camfile" type="file" accept="image/*" capture="environment" hidden>
      <div class="of-list" id="ip-list"></div>
      <div class="of-grid">
        <div class="field"><label for="ip-size">Khổ giấy</label><select id="ip-size"><option value="a4">A4</option><option value="a5">A5</option><option value="letter">Letter</option><option value="fit">Vừa khít ảnh</option></select></div>
        <div class="field"><label for="ip-orient">Hướng giấy</label><select id="ip-orient"><option value="auto">Tự động theo ảnh</option><option value="portrait">Dọc</option><option value="landscape">Ngang</option></select></div>
        <div class="field"><label for="ip-margin">Lề</label><select id="ip-margin"><option value="0">Không lề</option><option value="5">Hẹp (5 mm)</option><option value="10" selected>Vừa (10 mm)</option><option value="20">Rộng (20 mm)</option></select></div>
        <div class="field"><label for="ip-q">Chất lượng</label><select id="ip-q"><option value="1400|0.72">Gọn nhẹ</option><option value="1800|0.82" selected>Cân bằng</option><option value="2480|0.9">Sắc nét</option></select></div>
      </div>
      <label class="of-check"><input type="checkbox" id="ip-enh"> Làm rõ chữ (dùng cho ảnh chụp giấy tờ, chuyển sang đen trắng)</label>
      <div class="field"><label for="ip-name">Tên file</label><input id="ip-name" type="text" autocomplete="off" spellcheck="false" placeholder="anh-sang-pdf"></div>
      <button class="primary wide" id="ip-go" type="button" disabled>Tạo PDF</button>
      <div class="tl-result of-res" id="ip-res" hidden></div>` },

    { id: "imgtool", title: "Nén và đổi cỡ ảnh", desc: "Giảm dung lượng, thu nhỏ kích thước, đổi sang JPG, PNG hoặc WebP", icon: ic('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 14l3-3 2 2 3-3 3 3M9 8.5h.01"/>'), html: `
      <p class="tl-note">Thu nhỏ ảnh để gửi qua mạng xã hội, email hoặc tải lên web. Ảnh gốc không bị thay đổi.</p>
      <div class="row"><button class="primary" id="it-pick" type="button">Chọn ảnh</button></div>
      <input id="it-file" type="file" accept="image/*" multiple hidden>
      <div class="of-list" id="it-list"></div>
      <div class="of-grid">
        <div class="field"><label for="it-w">Cạnh dài tối đa</label><select id="it-w"><option value="0">Giữ nguyên</option><option value="3840">3840 px</option><option value="2560">2560 px</option><option value="1920" selected>1920 px</option><option value="1280">1280 px</option><option value="800">800 px</option></select></div>
        <div class="field"><label for="it-fmt">Định dạng</label><select id="it-fmt"><option value="image/jpeg">JPG</option><option value="image/webp">WebP</option><option value="image/png">PNG</option></select></div>
      </div>
      <div class="field"><label for="it-q">Chất lượng: <b id="it-qv">80</b>%</label><input id="it-q" type="range" min="30" max="100" value="80"></div>
      <button class="primary wide" id="it-go" type="button" disabled>Xử lý ảnh</button>
      <div class="of-list" id="it-out"></div>` },

    { id: "num2vi", title: "Số thành chữ", desc: "Đọc số tiền bằng chữ tiếng Việt cho hoá đơn, hợp đồng", icon: ic('<path d="M5 8h14M5 12h9M5 16h6"/><path d="M16 15l2 2 3-4"/>'), html: `
      <div class="field"><label for="nv-in">Số tiền hoặc số cần đọc</label><input id="nv-in" type="text" inputmode="numeric" autocomplete="off" placeholder="Ví dụ: 1250000"></div>
      <div class="seg row" id="nv-unit"><button class="primary" data-u="dong" type="button">Đồng</button><button data-u="none" type="button">Chỉ đọc số</button></div>
      <div class="tl-result of-res" id="nv-out" hidden></div>
      <div class="row"><button id="nv-copy" type="button">Sao chép</button></div>` },

    { id: "vat", title: "Tính VAT và phần trăm", desc: "Cộng hoặc tách thuế GTGT, tính % tăng giảm", icon: ic('<path d="M6 18L18 6"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>'), html: `
      <div class="seg row" id="vt-mode"><button class="primary" data-m="add" type="button">Cộng VAT</button><button data-m="split" type="button">Tách VAT</button><button data-m="pct" type="button">Phần trăm</button></div>
      <div id="vt-vat">
        <div class="field"><label for="vt-amt" id="vt-amtl">Giá chưa VAT (đồng)</label><input id="vt-amt" type="text" inputmode="numeric" autocomplete="off" placeholder="1000000"></div>
        <div class="field"><label for="vt-rate">Thuế suất VAT (%)</label><input id="vt-rate" type="text" inputmode="decimal" autocomplete="off" value="10"></div>
        <div class="tl-btns" id="vt-chips"><button data-r="5" type="button">5%</button><button data-r="8" type="button">8%</button><button data-r="10" type="button">10%</button></div>
      </div>
      <div id="vt-pct" hidden>
        <div class="field"><label for="pc-op">Phép tính</label><select id="pc-op"><option value="of">a% của b</option><option value="what">a là bao nhiêu % của b</option><option value="up">b tăng a%</option><option value="down">b giảm a%</option></select></div>
        <div class="of-grid"><div class="field"><label for="pc-a">Số a</label><input id="pc-a" type="text" inputmode="decimal" autocomplete="off"></div><div class="field"><label for="pc-b">Số b</label><input id="pc-b" type="text" inputmode="decimal" autocomplete="off"></div></div>
      </div>
      <div class="tl-result of-res" id="vt-out" hidden></div>` },

    { id: "wcount", title: "Đếm chữ", desc: "Đếm từ, ký tự, dòng, đoạn và thời gian đọc", icon: ic('<path d="M4 7h16M4 12h10M4 17h7"/>'), html: `
      <div class="field"><label for="wc-in">Dán hoặc gõ văn bản</label><textarea id="wc-in" rows="6" spellcheck="false" placeholder="Nội dung cần đếm…"></textarea></div>
      <div class="tl-chips" id="wc-out"></div>
      <div class="row"><button id="wc-clr" type="button">Xoá</button></div>` },
  ];

  const CSS = `
  .of-title{margin:1.3rem 0 .6rem;font-size:.9rem;color:var(--lamp)}
  .of-grid{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}.of-grid .field{min-width:0}
  .of-check{display:flex;gap:.6rem;align-items:flex-start;margin:.1rem 0 1rem;font-size:.88rem;color:var(--paper);cursor:pointer}
  .of-check input{margin-top:.2rem;flex:none}
  .of-list{display:grid;gap:.5rem;margin:.6rem 0}
  .of-list:empty{display:none}
  .of-item{display:flex;align-items:center;gap:.65rem;padding:.5rem;border:1px solid var(--line);border-radius:14px;background:var(--raised)}
  .of-th{flex:none;width:3.2rem;height:3.2rem;border-radius:10px;object-fit:cover;background:var(--field)}
  .of-nm{flex:1;min-width:0;font-size:.88rem}.of-nm b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .of-nm small{color:var(--dim);font-size:.76rem}
  .of-btns{display:flex;gap:.25rem;flex:none}
  .of-btns button{width:2.1rem;height:2.1rem;padding:0;border-radius:10px;font-size:1rem;line-height:1}
  .of-res{font-family:inherit;white-space:normal;word-break:normal}
  .of-res a{color:var(--lamp2);word-break:break-all}
  .of-dl{display:inline-flex;align-items:center;padding:.4rem .75rem;font-size:.82rem;border-radius:10px;border:1px solid var(--line);background:var(--field);color:var(--paper);text-decoration:none}
  @media(max-width:420px){.of-grid{grid-template-columns:1fr}}`;

  function mount(section) {
    const st = document.createElement("style");
    st.textContent = CSS;
    document.head.append(st);

    const CHEV = '<svg class="tl-chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
    const wrap = document.createElement("div");
    wrap.innerHTML = `<h4 class="of-title">Công cụ văn phòng</h4>` + TOOLS.map((t) =>
      `<details class="tl-card" id="tl-${t.id}"><summary><span class="tl-ic">${t.icon}</span><span class="tl-t"><b>${esc(t.title)}</b><small>${esc(t.desc)}</small></span>${CHEV}</summary><div class="tl-body">${t.html}</div></details>`
    ).join("");
    section.append(...wrap.childNodes);

    initImg2Pdf();
    initImgTool();
    initNum2Vi();
    initVat();
    initWordCount();
  }

  /* ================= 1. ẢNH SANG PDF ================= */
  function initImg2Pdf() {
    let items = [], uid = 0, lastUrl = null;
    const list = g("ip-list"), go = g("ip-go");

    const render = () => {
      list.innerHTML = items.map((it, i) => `
        <div class="of-item" data-id="${it.id}">
          <img class="of-th" src="${it.url}" alt="" style="transform:rotate(${it.rot}deg)">
          <div class="of-nm"><b>${i + 1}. ${esc(it.file.name)}</b><small>${sizeText(it.file.size)}${it.rot ? " · xoay " + it.rot + "°" : ""}</small></div>
          <div class="of-btns">
            <button type="button" data-a="up" title="Lên" ${i === 0 ? "disabled" : ""}>↑</button>
            <button type="button" data-a="down" title="Xuống" ${i === items.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" data-a="rot" title="Xoay 90°">⟳</button>
            <button type="button" class="danger" data-a="del" title="Bỏ ảnh">✕</button>
          </div>
        </div>`).join("");
      go.disabled = !items.length;
      g("ip-clear").hidden = !items.length;
    };

    const add = (files) => {
      const imgs = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name));
      if (!imgs.length) return toast("Hãy chọn file ảnh.", "bad");
      const room = MAX_FILES - items.length;
      if (imgs.length > room) toast(`Chỉ thêm được tối đa ${MAX_FILES} ảnh mỗi lần tạo PDF.`, "bad");
      imgs.slice(0, Math.max(0, room)).forEach((f) => items.push({ id: ++uid, file: f, rot: 0, url: URL.createObjectURL(f) }));
      render();
    };

    g("ip-pick").onclick = () => g("ip-file").click();
    g("ip-cam").onclick = () => g("ip-camfile").click();
    g("ip-file").onchange = (e) => { add(e.target.files); e.target.value = ""; };
    g("ip-camfile").onchange = (e) => { add(e.target.files); e.target.value = ""; };
    g("ip-clear").onclick = () => { items.forEach((it) => URL.revokeObjectURL(it.url)); items = []; render(); g("ip-res").hidden = true; };

    list.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-a]");
      if (!b) return;
      const id = Number(b.closest(".of-item").dataset.id), i = items.findIndex((x) => x.id === id);
      if (i < 0) return;
      const a = b.dataset.a;
      if (a === "up" && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
      else if (a === "down" && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
      else if (a === "rot") items[i].rot = (items[i].rot + 90) % 360;
      else if (a === "del") { URL.revokeObjectURL(items[i].url); items.splice(i, 1); }
      render();
    });

    go.onclick = async () => {
      if (!items.length) return;
      const [maxSide, q] = g("ip-q").value.split("|").map(Number);
      const opts = { size: g("ip-size").value, orient: g("ip-orient").value, marginMm: Number(g("ip-margin").value) };
      const res = g("ip-res");
      go.disabled = true;
      res.hidden = false;
      try {
        const pages = [];
        for (let i = 0; i < items.length; i++) {
          res.textContent = `Đang xử lý ảnh ${i + 1}/${items.length}…`;
          await new Promise((r) => setTimeout(r, 0)); // nhường trình duyệt cập nhật giao diện
          const c = await draw(items[i].file, items[i].rot, maxSide, g("ip-enh").checked);
          const blob = await toBlob(c, "image/jpeg", q);
          pages.push({ jpg: new Uint8Array(await blob.arrayBuffer()), iw: c.width, ih: c.height, ...PdfLite.layout(c.width, c.height, opts) });
          c.width = c.height = 0; // giải phóng bộ nhớ canvas
        }
        res.textContent = "Đang ghép file PDF…";
        const pdf = PdfLite.build(pages);
        const name = safeName(g("ip-name").value, "anh-sang-pdf") + ".pdf";
        if (lastUrl) URL.revokeObjectURL(lastUrl);
        lastUrl = saveBlob(pdf, name);
        res.innerHTML = `Đã tạo <b>${esc(name)}</b>: ${pages.length} trang, ${sizeText(pdf.size)}.<br><a class="of-dl" href="${lastUrl}" download="${esc(name)}">Tải lại file PDF</a>`;
        toast("Đã tạo file PDF.");
      } catch (e) {
        res.textContent = e.message;
        toast(e.message, "bad");
      } finally {
        go.disabled = !items.length;
      }
    };
    render();
  }

  /* ================= 2. NÉN VÀ ĐỔI CỠ ẢNH ================= */
  function initImgTool() {
    let files = [];
    const go = g("it-go"), out = g("it-out"), urls = [];
    const EXT = { "image/jpeg": "jpg", "image/webp": "webp", "image/png": "png" };

    g("it-pick").onclick = () => g("it-file").click();
    g("it-file").onchange = (e) => {
      files = [...e.target.files].filter((f) => /^image\//.test(f.type)).slice(0, MAX_FILES);
      e.target.value = "";
      g("it-list").innerHTML = files.map((f) => `<div class="of-item"><div class="of-nm"><b>${esc(f.name)}</b><small>${sizeText(f.size)}</small></div></div>`).join("");
      out.textContent = "";
      go.disabled = !files.length;
    };
    const syncQ = () => { g("it-qv").textContent = g("it-q").value; g("it-q").disabled = g("it-fmt").value === "image/png"; };
    g("it-q").oninput = syncQ;
    g("it-fmt").onchange = syncQ;
    syncQ();

    go.onclick = async () => {
      if (!files.length) return;
      const maxW = Number(g("it-w").value) || 100000, type = g("it-fmt").value, q = Number(g("it-q").value) / 100;
      go.disabled = true;
      urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
      out.textContent = "";
      try {
        for (let i = 0; i < files.length; i++) {
          go.textContent = `Đang xử lý ${i + 1}/${files.length}…`;
          await new Promise((r) => setTimeout(r, 0));
          const f = files[i];
          const c = await draw(f, 0, maxW, false);
          const blob = await toBlob(c, type, q);
          c.width = c.height = 0;
          const name = safeName(f.name.replace(/\.[^.]+$/, ""), "anh") + "-nho." + EXT[type];
          const url = URL.createObjectURL(blob);
          urls.push(url);
          const row = document.createElement("div");
          row.className = "of-item";
          const pct = f.size ? Math.round((1 - blob.size / f.size) * 100) : 0;
          row.innerHTML = `<img class="of-th" src="${url}" alt=""><div class="of-nm"><b>${esc(name)}</b><small>${sizeText(f.size)} → ${sizeText(blob.size)}${pct > 0 ? ` (giảm ${pct}%)` : ""}</small></div><a class="of-dl" href="${url}" download="${esc(name)}">Tải về</a>`;
          out.append(row);
        }
        toast("Đã xử lý xong.");
      } catch (e) { toast(e.message, "bad"); }
      go.textContent = "Xử lý ảnh";
      go.disabled = !files.length;
    };
  }

  /* ================= 3. SỐ THÀNH CHỮ ================= */
  function initNum2Vi() {
    let unit = "dong", text = "";
    const inp = g("nv-in"), out = g("nv-out");
    const run = () => {
      const digits = inp.value.replace(/\D/g, "");
      if (!digits) { out.hidden = true; text = ""; return; }
      try {
        let s = numToVi(digits);
        s = s.charAt(0).toUpperCase() + s.slice(1);
        text = unit === "dong" ? `${s} đồng chẵn.` : s + ".";
        out.hidden = false;
        out.innerHTML = `<b>${fmt(digits)}</b>${unit === "dong" ? " đồng" : ""}<br>${esc(text)}`;
      } catch (e) { text = ""; out.hidden = false; out.textContent = e.message; }
    };
    inp.addEventListener("input", () => {
      const d = inp.value.replace(/\D/g, "");
      inp.value = d ? Number(d.slice(0, 15)).toLocaleString("vi-VN") : "";
      run();
    });
    g("nv-unit").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-u]");
      if (!b) return;
      unit = b.dataset.u;
      g("nv-unit").querySelectorAll("button").forEach((x) => x.classList.toggle("primary", x === b));
      run();
    });
    g("nv-copy").onclick = async () => {
      if (!text) return toast("Chưa có nội dung để sao chép.", "bad");
      try { await navigator.clipboard.writeText(text); toast("Đã sao chép."); } catch { toast("Không sao chép được, hãy bôi đen và copy thủ công.", "bad"); }
    };
  }

  /* ================= 4. VAT VÀ PHẦN TRĂM ================= */
  function initVat() {
    let mode = "add";
    const out = g("vt-out");
    const val = (id) => Number(String(g(id).value).replace(/\./g, "").replace(",", ".")) || 0;
    const money = (n) => fmt(Math.round(n)) + " đồng";
    const num = (n) => (Math.round(n * 100) / 100).toLocaleString("vi-VN");

    const run = () => {
      out.hidden = false;
      if (mode === "pct") {
        const a = val("pc-a"), b = val("pc-b"), op = g("pc-op").value;
        if (!g("pc-a").value || !g("pc-b").value) { out.hidden = true; return; }
        if (op === "of") out.innerHTML = `${num(a)}% của ${num(b)} là <b>${num((a / 100) * b)}</b>`;
        else if (op === "what") out.innerHTML = b ? `${num(a)} là <b>${num((a / b) * 100)}%</b> của ${num(b)}` : "Số b phải khác 0.";
        else if (op === "up") out.innerHTML = `${num(b)} tăng ${num(a)}% thành <b>${num(b * (1 + a / 100))}</b>`;
        else out.innerHTML = `${num(b)} giảm ${num(a)}% còn <b>${num(b * (1 - a / 100))}</b>`;
        return;
      }
      if (!g("vt-amt").value) { out.hidden = true; return; }
      const amt = val("vt-amt"), r = val("vt-rate") / 100;
      if (mode === "add") {
        const vat = amt * r;
        out.innerHTML = `Giá chưa VAT: <b>${money(amt)}</b><br>Tiền VAT (${num(r * 100)}%): <b>${money(vat)}</b><br>Tổng thanh toán: <b>${money(amt + vat)}</b>`;
      } else {
        const net = amt / (1 + r);
        out.innerHTML = `Giá đã gồm VAT: <b>${money(amt)}</b><br>Giá chưa VAT: <b>${money(net)}</b><br>Tiền VAT (${num(r * 100)}%): <b>${money(amt - net)}</b>`;
      }
    };

    g("vt-mode").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-m]");
      if (!b) return;
      mode = b.dataset.m;
      g("vt-mode").querySelectorAll("button").forEach((x) => x.classList.toggle("primary", x === b));
      g("vt-vat").hidden = mode === "pct";
      g("vt-pct").hidden = mode !== "pct";
      g("vt-amtl").textContent = mode === "split" ? "Giá đã gồm VAT (đồng)" : "Giá chưa VAT (đồng)";
      run();
    });
    g("vt-chips").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-r]");
      if (b) { g("vt-rate").value = b.dataset.r; run(); }
    });
    g("vt-amt").addEventListener("input", () => {
      const d = g("vt-amt").value.replace(/\D/g, "");
      g("vt-amt").value = d ? Number(d.slice(0, 15)).toLocaleString("vi-VN") : "";
      run();
    });
    ["vt-rate", "pc-a", "pc-b"].forEach((id) => g(id).addEventListener("input", run));
    g("pc-op").addEventListener("change", run);
  }

  /* ================= 5. ĐẾM CHỮ ================= */
  function initWordCount() {
    const inp = g("wc-in"), out = g("wc-out");
    const run = () => {
      const t = inp.value;
      const words = (t.trim().match(/\S+/g) || []).length;
      const lines = t ? t.split(/\r?\n/).length : 0;
      const paras = t.split(/\r?\n\s*\r?\n/).filter((p) => p.trim()).length;
      const mins = words / 200;
      const read = !words ? "0 phút" : mins < 1 ? "dưới 1 phút" : `khoảng ${Math.round(mins)} phút`;
      out.innerHTML = [
        `${fmt(words)} từ`, `${fmt(t.length)} ký tự`, `${fmt(t.replace(/\s/g, "").length)} ký tự không khoảng trắng`,
        `${fmt(lines)} dòng`, `${fmt(paras)} đoạn`, `Đọc ${read}`,
      ].map((x) => `<span class="tl-chip">${x}</span>`).join("");
    };
    inp.addEventListener("input", run);
    g("wc-clr").onclick = () => { inp.value = ""; run(); };
    run();
  }

  /* ---------- chờ tab Công cụ được dựng xong rồi mới gắn vào ---------- */
  function start() {
    const find = () => (g("tab-tools") ? g("tab-tools").querySelector("section") : null);
    const now = find();
    if (now) return mount(now);
    const mo = new MutationObserver(() => {
      const s = find();
      if (s) { mo.disconnect(); mount(s); }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 20000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
