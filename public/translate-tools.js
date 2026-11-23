/* Bộ công cụ DỊCH Trung · Nhật · Hàn sang tiếng Việt cho tab Công cụ:
   1. Dịch truyện: chia đoạn, quét tên riêng, ép đúng bảng tên, dịch tuần tự có mạch văn, tự kiểm tra lỗi tên.
   2. Dịch nhanh: đoạn ngắn kèm phiên âm (pinyin, romaji, romaja).
   3. Bảng tên riêng: lưu theo từng truyện (trong trình duyệt), sửa tên là đổi luôn trong bản dịch, nhập / xuất.
   Phần dịch chạy ở máy chủ (server/translate.js). Tự gắn vào #tab-tools do tools.js dựng. */
(() => {
  const g = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const toast = (t, kind) => (typeof say === "function" ? say(t, kind) : alert(t));
  const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");
  const ic = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /* ---------- gọi máy chủ (giữ lại mã lỗi) ---------- */
  async function post(path, body) {
    let r;
    try {
      r = await fetch("/api" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch (_) { const e = new Error("Mất kết nối mạng"); e.code = "net"; throw e; }
    if (r.status === 401) { location.href = "/login.html"; throw new Error("Phiên đăng nhập đã hết"); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || "Có lỗi xảy ra"); e.code = d.code || (r.status === 402 ? "locked" : r.status === 429 ? "rate" : ""); e.status = r.status; throw e; }
    return d;
  }

  /* ---------- ngôn ngữ ---------- */
  const RE_KANA = /[\u3040-\u30ff\u31f0-\u31ff]/g, RE_HANGUL = /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/g, RE_HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
  function detect(t) {
    const k = (t.match(RE_KANA) || []).length, h = (t.match(RE_HANGUL) || []).length, z = (t.match(RE_HAN) || []).length, n = k + h + z;
    if (!n) return "";
    if (h / n > 0.15) return "ko";
    if (k / n > 0.05) return "ja";
    if (z / n > 0.5) return "zh";
    return "";
  }
  const LANG = { zh: "Tiếng Trung", ja: "Tiếng Nhật", ko: "Tiếng Hàn" };

  /** Đọc file văn bản, tự đoán bảng mã (UTF-8, GB18030, Big5, Shift-JIS, EUC-JP, EUC-KR) */
  function decodeSmart(buf) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (_) {}
    let best = "", bestScore = -1;
    for (const enc of ["gb18030", "big5", "shift_jis", "euc-jp", "euc-kr"]) {
      let t;
      try { t = new TextDecoder(enc).decode(buf); } catch (_) { continue; }
      const sample = t.slice(0, 20000);
      const cjk = (sample.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) || []).length;
      const bad = (sample.match(/[\ufffd\u0080-\u009f]/g) || []).length;
      const score = cjk - bad * 20;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    return best || new TextDecoder("utf-8").decode(buf);
  }

  /* ---------- chia đoạn ---------- */
  function sentenceSplit(p, max) {
    const parts = p.match(/[^。！？!?…\n]*[。！？!?…]+["”』」）)]*|[^。！？!?…\n]+$/g) || [p];
    const res = []; let cur = "";
    for (const s of parts) {
      if (cur && cur.length + s.length > max) { res.push(cur); cur = ""; }
      if (s.length > max) { for (let i = 0; i < s.length; i += max) res.push(s.slice(i, i + max)); } else cur += s;
    }
    if (cur) res.push(cur);
    return res;
  }
  function splitText(text, max) {
    const out = []; let cur = [], len = 0;
    const flush = () => { if (cur.length) { out.push(cur.join("\n")); cur = []; len = 0; } };
    for (const p of text.replace(/\r\n?/g, "\n").split("\n")) {
      if (p.length > max) { flush(); out.push(...sentenceSplit(p, max)); continue; }
      if (cur.length && len + p.length + 1 > max) flush();
      cur.push(p); len += p.length + 1;
    }
    flush();
    return out.filter((s) => s.trim());
  }
  const CHUNK = 2000, SCAN = 8000, QUICK_MAX = 2500;

  /* ---------- kho truyện + bảng tên (localStorage) ---------- */
  const LS = "tr.v1";
  const TYPES = { person: "nhân vật", place: "địa danh", org: "môn phái / tổ chức", skill: "chiêu thức", item: "vật phẩm", title: "danh hiệu", term: "thuật ngữ", other: "khác" };
  const Store = {
    d: { stories: [], current: "", key: "", quality: "fast" },
    load() {
      try { const x = JSON.parse(localStorage.getItem(LS) || "null"); if (x && Array.isArray(x.stories)) this.d = { ...this.d, ...x }; } catch (_) {}
      if (!this.d.stories.length) this.create("Truyện của tôi");
      if (!this.cur()) this.d.current = this.d.stories[0].id;
    },
    save() { try { localStorage.setItem(LS, JSON.stringify(this.d)); } catch (_) {} document.dispatchEvent(new CustomEvent("tr:update")); },
    cur() { return this.d.stories.find((s) => s.id === this.d.current); },
    create(name) {
      const s = { id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: String(name || "Truyện mới").trim().slice(0, 60) || "Truyện mới", genre: "auto", nameStyle: "auto", note: "", entries: [] };
      this.d.stories.push(s); this.d.current = s.id; return s;
    },
    /** Thêm tên mới (không ghi đè tên đã có). Trả về số tên thêm được. */
    add(list, auto) {
      const s = this.cur(); let n = 0;
      for (const e of list) {
        const src = String(e.src || "").trim(), vi = String(e.vi || "").trim();
        if (!src || !vi || s.entries.some((x) => x.src === src)) continue;
        s.entries.push({ src, vi, type: TYPES[e.type] ? e.type : "other", auto: !!auto });
        n++;
      }
      return n;
    },
  };

  /* ---------- trạng thái dịch ---------- */
  const T = { id: "", chunks: [], next: 0, running: false, abort: false };

  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h) + ":" + s.length; };
  const tail = (s, n) => (s.length > n ? s.slice(s.length - n) : s);
  const relevant = (entries, ...texts) => { const all = texts.join("\n"); return entries.filter((e) => all.includes(e.src)).map((e) => ({ src: e.src, vi: e.vi })); };

  /** Biểu thức tìm đúng cụm oldV (không dính vào giữa một từ khác). Trả null nếu trình duyệt không hỗ trợ. */
  function wordRe(oldV, flags) {
    try { return new RegExp("(?<![\\p{L}\\p{M}\\p{N}])" + escRe(oldV) + "(?![\\p{L}\\p{M}\\p{N}])", flags + "u"); } catch (_) { return null; }
  }

  function replaceInResults(oldV, newV) {
    if (!oldV || !newV || oldV === newV) return 0;
    let n = 0;
    const re = wordRe(oldV, "g");
    for (const c of T.chunks) {
      if (!c.vi) continue;
      if (re) c.vi = c.vi.replace(re, () => { n++; return newV; });
      else { const parts = c.vi.split(oldV); n += parts.length - 1; c.vi = parts.join(newV); }
    }
    if (n) renderOut();
    return n;
  }

  /* ---------- giao diện ---------- */
  const TOOLS = [
    {
      id: "dichtruyen", title: "Dịch truyện Trung · Nhật · Hàn", desc: "Dịch như dịch giả: giữ đúng tên nhân vật, thuật ngữ nhất quán cả chương",
      icon: ic('<path d="M4 5h9M8.5 3v2M6 5c.3 3.6 3 6.4 6.5 8M12 5c-.8 3.6-3.6 6.6-8 8"/><path d="M13 21l4-9 4 9M14.5 18h5"/>'),
      html: `
      <p class="tl-note">Dán chương truyện (hoặc mở file .txt) bằng tiếng Trung, Nhật hoặc Hàn. Nên <b>quét tên riêng</b> trước để tên nhân vật, địa danh, môn phái được phiên đúng (ví dụ 洛水寒 là Lạc Thủy Hàn, không bị dịch thành "Lạc nước lạnh"), sửa nếu cần rồi mới dịch. Dịch tuần tự từng đoạn để giữ mạch văn và xưng hô.</p>
      <div class="of-grid">
        <div class="field"><label for="tr-story">Truyện (bảng tên riêng lưu theo truyện)</label><select id="tr-story"></select></div>
        <div class="field"><label for="tr-newname">Tạo truyện mới</label><div class="tr-inline"><input type="text" id="tr-newname" placeholder="Tên truyện" maxlength="60"><button type="button" id="tr-new">Tạo</button></div></div>
      </div>
      <div class="of-grid">
        <div class="field"><label for="tr-genre">Thể loại, văn phong</label><select id="tr-genre">
          <option value="auto">Tự nhận biết</option><option value="tienhiep">Tiên hiệp, huyền huyễn, kiếm hiệp (Hán Việt đậm)</option><option value="ngontinh">Ngôn tình (cổ đại hoặc hiện đại)</option><option value="hiendai">Đô thị, hiện đại</option><option value="lightnovel">Light novel, anime Nhật</option><option value="hanquoc">Web novel, webtoon, phim Hàn</option></select></div>
        <div class="field"><label for="tr-style">Cách viết tên riêng</label><select id="tr-style">
          <option value="auto">Tự động (Trung: Hán Việt, Nhật: romaji, Hàn: romaja)</option><option value="hanviet">Hán Việt cho mọi tên (cả tên Nhật, Hàn)</option><option value="phienam">Pinyin, romaji, romaja</option><option value="giunguyen">Giữ nguyên chữ gốc</option></select></div>
      </div>
      <div class="of-grid">
        <div class="field"><label for="tr-q">Chất lượng</label><select id="tr-q"><option value="fast">Nhanh</option><option value="best">Chuẩn (kỹ hơn, chậm hơn)</option></select></div>
        <div class="field"><label for="tr-note">Ghi chú cho người dịch (không bắt buộc)</label><input type="text" id="tr-note" maxlength="600" placeholder="vd: nam chính xưng ta, gọi nữ chính là nàng"></div>
      </div>
      <details class="of-alt"><summary>Dùng khoá Gemini của riêng bạn (không bắt buộc)</summary><div class="of-alt-body">
        <p class="tl-note">Nếu máy chủ chưa có khoá AI hoặc bạn muốn dùng khoá của mình. Khoá chỉ lưu trong trình duyệt này và được gửi kèm mỗi lần dịch, máy chủ không lưu lại.</p>
        <input type="password" id="tr-key" autocomplete="off" placeholder="AIza..." spellcheck="false">
      </div></details>
      <div class="field" style="margin-top:.9rem"><label for="tr-in">Văn bản gốc (Trung, Nhật, Hàn)</label><textarea id="tr-in" rows="9" spellcheck="false" placeholder="Dán nội dung chương vào đây..."></textarea></div>
      <div class="row"><button type="button" id="tr-open">Mở file .txt</button><input type="file" id="tr-file" accept=".txt,text/plain" hidden><button type="button" id="tr-clear">Xoá hết</button></div>
      <div class="tl-chips" id="tr-info"></div>
      <div class="row"><button type="button" class="primary" id="tr-scan">1. Quét tên riêng</button><button type="button" class="primary" id="tr-go">2. Dịch</button><button type="button" id="tr-stop" hidden>Dừng</button><button type="button" id="tr-reset" hidden>Làm lại từ đầu</button></div>
      <div class="tl-chips" id="tr-prog"></div>
      <div id="tr-sum"></div>
      <label class="of-check"><input type="checkbox" id="tr-bi"> Hiện song ngữ (kèm bản gốc từng đoạn)</label>
      <div id="tr-out"></div>
      <div class="row"><button type="button" id="tr-copy" hidden>Chép bản dịch</button><button type="button" id="tr-dl" hidden>Tải .txt</button></div>`,
    },
    {
      id: "dichnhanh", title: "Dịch nhanh Trung · Nhật · Hàn", desc: "Dịch đoạn ngắn, câu thoại, tin nhắn kèm phiên âm pinyin, romaji, romaja",
      icon: ic('<path d="M5 6h14M5 12h8M5 18h5"/><path d="M16 14l2.5 2.5L22 12"/>'),
      html: `
      <p class="tl-note">Dùng cho đoạn ngắn (tối đa ${QUICK_MAX.toLocaleString("vi-VN")} ký tự). Có thể dùng bảng tên riêng của truyện đang chọn để tên nhân vật luôn đúng.</p>
      <div class="field"><label for="tq-in">Văn bản gốc</label><textarea id="tq-in" rows="5" spellcheck="false" maxlength="${QUICK_MAX}" placeholder="Dán câu hoặc đoạn tiếng Trung, Nhật, Hàn..."></textarea></div>
      <label class="of-check"><input type="checkbox" id="tq-gl" checked> Dùng bảng tên riêng của truyện đang chọn</label>
      <div class="row"><button type="button" class="primary" id="tq-go">Dịch</button><button type="button" id="tq-clear">Xoá</button></div>
      <div class="tl-chips" id="tq-info"></div>
      <div id="tq-out"></div>`,
    },
    {
      id: "tentruyen", title: "Bảng tên riêng (dịch truyện)", desc: "Quản lý tên nhân vật, địa danh, thuật ngữ theo từng truyện, nhập và xuất",
      icon: ic('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/>'),
      html: `
      <p class="tl-note">Mỗi truyện một bảng riêng, lưu trong trình duyệt này. Sửa một tên ở đây thì tên đó trong bản dịch đang có cũng được đổi theo. Khi dịch, máy chủ bắt buộc dùng đúng các tên trong bảng.</p>
      <div class="of-grid">
        <div class="field"><label for="tg-story">Truyện</label><select id="tg-story"></select></div>
        <div class="field"><label for="tg-name">Đổi tên truyện</label><div class="tr-inline"><input type="text" id="tg-name" maxlength="60"><button type="button" id="tg-rename">Lưu</button></div></div>
      </div>
      <div class="field"><label for="tg-q">Tìm trong bảng</label><input type="search" id="tg-q" placeholder="gõ chữ gốc hoặc tên tiếng Việt" autocomplete="off"></div>
      <div class="tl-chips" id="tg-info"></div>
      <div id="tg-list"></div>
      <div class="row"><button type="button" class="primary" id="tg-add">+ Thêm tên</button><button type="button" id="tg-ok" hidden>Xác nhận các tên mới</button></div>
      <div class="row"><button type="button" id="tg-imp">Nhập từ file</button><input type="file" id="tg-file" accept=".json,.csv,.txt,text/plain,application/json" hidden><button type="button" id="tg-json">Xuất JSON</button><button type="button" id="tg-csv">Xuất CSV</button><button type="button" id="tg-copy">Chép dạng văn bản</button></div>
      <p class="tl-note">Nhập được file JSON (mảng {src, vi, type}) hoặc mỗi dòng một tên dạng <code>洛水寒=Lạc Thủy Hàn</code>, <code>洛水寒,Lạc Thủy Hàn</code>, <code>洛水寒 → Lạc Thủy Hàn</code>.</p>
      <div class="row"><button type="button" class="danger" id="tg-del">Xoá truyện này</button></div>`,
    },
  ];

  const CSS = `
  .tr-title{margin:1.3rem 0 .6rem;font-size:.9rem;color:var(--lamp)}
  .tr-inline{display:flex;gap:.4rem}.tr-inline input{flex:1;min-width:0}
  .tr-blk{margin:.5rem 0;padding:.65rem .8rem;border:1px solid var(--line);border-radius:14px;background:var(--raised)}
  .tr-blk.bad{border-color:rgba(255,107,141,.55)}
  .tr-bh{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:.35rem;font-size:.78rem;color:var(--dim)}
  .tr-bh .sp{flex:1}.tr-bh button{padding:.2rem .55rem;font-size:.76rem;border-radius:9px}
  .tr-tx{white-space:pre-wrap;line-height:1.7;font-size:.95rem;color:var(--paper)}
  .tr-src{white-space:pre-wrap;line-height:1.55;font-size:.84rem;color:var(--dim);margin-bottom:.5rem;padding-bottom:.5rem;border-bottom:1px dashed var(--line)}
  .tr-rd{white-space:pre-wrap;line-height:1.6;font-size:.86rem;color:var(--lamp2)}
  .tr-warn{color:var(--alert);font-size:.8rem;margin:.25rem 0}
  .tg-row{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;padding:.45rem;margin-bottom:.4rem;border:1px solid var(--line);border-radius:12px;background:var(--raised)}
  .tg-row.new{border-color:rgba(79,224,176,.5)}
  .tg-row input{min-width:0;flex:1 1 7rem}.tg-row select{flex:1 1 7rem;min-width:0}.tg-row button{flex:none;padding:.35rem .6rem}
  .tg-row .tg-src{font-family:inherit}
  @media(max-width:420px){.tr-inline{flex-wrap:wrap}}`;

  function mount(section) {
    const st = document.createElement("style");
    st.textContent = CSS;
    document.head.append(st);
    const CHEV = '<svg class="tl-chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
    const wrap = document.createElement("div");
    wrap.innerHTML = `<h4 class="tr-title">Dịch Trung · Nhật · Hàn</h4>` + TOOLS.map((t) =>
      `<details class="tl-card" id="tl-${t.id}"><summary><span class="tl-ic">${t.icon}</span><span class="tl-t"><b>${esc(t.title)}</b><small>${esc(t.desc)}</small></span>${CHEV}</summary><div class="tl-body">${t.html}</div></details>`
    ).join("");
    section.append(...wrap.childNodes);
    Store.load();
    initTranslate();
    initQuick();
    initGlossary();
    document.dispatchEvent(new CustomEvent("tr:update"));
  }

  /* ---------- dùng chung: chọn truyện ---------- */
  function fillStorySelect(sel) {
    sel.innerHTML = Store.d.stories.map((s) => `<option value="${esc(s.id)}">${esc(s.name)} (${s.entries.length} tên)</option>`).join("");
    sel.value = Store.d.current;
  }
  const openCard = (id) => { const d = g("tl-" + id); if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "start" }); } };
  const errText = (e) => (e.code === "locked" ? "Công cụ này tính coin, hãy bấm Mở khoá trong thẻ công cụ." : e.message);

  /* ================= 1. DỊCH TRUYỆN ================= */
  function opts() {
    const s = Store.cur();
    return { genre: s.genre, nameStyle: s.nameStyle, note: s.note, quality: Store.d.quality, key: Store.d.key || undefined };
  }

  function renderInfo() {
    const text = g("tr-in").value, lang = detect(text);
    const chips = [];
    if (text.trim()) {
      chips.push(`<span class="tl-chip ${lang ? "ok" : "bad"}">${lang ? LANG[lang] : "Chưa nhận ra tiếng Trung, Nhật, Hàn"}</span>`, `<span class="tl-chip">${fmt(text.length)} ký tự</span>`, `<span class="tl-chip">${fmt(splitText(text, CHUNK).length)} đoạn</span>`);
    }
    g("tr-info").innerHTML = chips.join("");
  }

  function renderSum() {
    const bad = T.chunks.filter((c) => c.flags).length;
    const fail = T.chunks.filter((c) => c.err).length;
    const done = T.chunks.filter((c) => c.done).length;
    const warn = [];
    if (fail) warn.push(`${fail} đoạn lỗi, bấm "Dịch lại" ở đoạn đó hoặc "Tiếp tục".`);
    if (bad) warn.push(`${bad} đoạn máy chủ thấy có thể sai tên hoặc thiếu nội dung (đã tự dịch lại một lần). Xem phần cảnh báo màu đỏ ở từng đoạn.`);
    g("tr-sum").innerHTML = warn.length ? `<p class="tr-warn">${warn.map(esc).join("<br>")}</p>` : "";
    g("tr-copy").hidden = g("tr-dl").hidden = !done;
  }

  function renderOut() {
    const bi = g("tr-bi").checked;
    g("tr-out").innerHTML = T.chunks.map((c, i) => {
      if (!c.done && !c.err && !c.running) return "";
      const f = c.flags;
      const warn = [];
      if (f) {
        if (f.missing?.length) warn.push("Thiếu tên theo bảng: " + f.missing.map((m) => `${m.src} → ${m.vi}`).join(", "));
        if (f.cjk) warn.push("Còn sót chữ gốc: " + f.cjk);
        if (f.short) warn.push("Bản dịch có vẻ thiếu nội dung so với bản gốc");
      }
      return `<div class="tr-blk${f || c.err ? " bad" : ""}" data-i="${i}">
        <div class="tr-bh"><b>Đoạn ${i + 1}/${T.chunks.length}</b>${c.running ? "<span>đang dịch...</span>" : ""}<span class="sp"></span>${c.running ? "" : `<button type="button" data-redo="${i}">Dịch lại đoạn</button>`}</div>
        ${bi ? `<div class="tr-src">${esc(c.src)}</div>` : ""}
        ${c.err ? `<div class="tr-warn">${esc(c.err)}</div>` : ""}
        ${warn.map((w) => `<div class="tr-warn">${esc(w)}</div>`).join("")}
        ${c.done ? `<div class="tr-tx">${esc(c.vi)}</div>` : ""}
      </div>`;
    }).join("");
    renderSum();
  }

  function setBusy(b, label) {
    T.running = b;
    g("tr-stop").hidden = !b;
    g("tr-scan").disabled = g("tr-go").disabled = b;
    if (!b) g("tr-prog").innerHTML = label ? `<span class="tl-chip ok">${esc(label)}</span>` : "";
  }
  const prog = (t) => { g("tr-prog").innerHTML = `<span class="tl-chip ok">${esc(t)}</span>`; };

  function syncGoButton() {
    const text = g("tr-in").value;
    const same = T.id && T.id === hash(text) && T.chunks.length;
    const left = same ? T.chunks.findIndex((c) => !c.done) : -1;
    g("tr-go").textContent = same && left > 0 ? `2. Tiếp tục dịch (đoạn ${left + 1}/${T.chunks.length})` : "2. Dịch";
    g("tr-reset").hidden = !(same && left > 0) || T.running;
  }

  /** Dịch một đoạn (tự chia đôi khi quá dài, đợi khi bị giới hạn tốc độ) */
  async function translateChunk(i) {
    const c = T.chunks[i];
    c.running = true; c.err = ""; renderOut();
    const s = Store.cur();
    const prevC = T.chunks[i - 1];
    const prev = prevC && prevC.done ? { src: tail(prevC.src, 300), vi: tail(prevC.vi, 450) } : undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (T.abort) { c.running = false; return "abort"; }
      try {
        const r = await post("/translate/chunk", { ...opts(), text: c.src, glossary: relevant(s.entries, c.src, prev ? prev.src : ""), prev });
        c.vi = r.vi; c.flags = r.flags || null; c.done = true; c.running = false; c.err = "";
        const added = Store.add(r.names || [], true);
        if (added) Store.save();
        return "ok";
      } catch (e) {
        if (e.code === "rate" && attempt < 3) { for (let k = 20; k > 0 && !T.abort; k--) { prog(`Đang chờ giới hạn tốc độ (${k}s)...`); await sleep(1000); } continue; }
        if (e.code === "too_long" && c.src.length > 300) {
          const parts = splitText(c.src, Math.max(200, Math.floor(c.src.length / 2) + 40));
          if (parts.length > 1) { T.chunks.splice(i, 1, ...parts.map((p) => ({ src: p, vi: "", flags: null, done: false, err: "" }))); renderOut(); return "split"; }
        }
        c.running = false; c.done = false; c.err = errText(e);
        return "fail";
      }
    }
    c.running = false; c.err = "Máy chủ đang giới hạn tốc độ, thử lại sau ít phút.";
    return "fail";
  }

  async function runTranslate(fromScratch) {
    const text = g("tr-in").value;
    if (!text.trim()) return toast("Chưa có văn bản để dịch.", "bad");
    if (!detect(text)) return toast("Văn bản không có chữ Trung, Nhật hoặc Hàn.", "bad");
    const id = hash(text);
    if (fromScratch || T.id !== id) {
      T.id = id;
      T.chunks = splitText(text, CHUNK).map((src) => ({ src, vi: "", flags: null, done: false, err: "", running: false }));
    }
    T.abort = false;
    setBusy(true);
    if (!Store.cur().entries.length) toast("Chưa quét tên riêng: tên nhân vật ở các đoạn đầu có thể chưa nhất quán. Bạn có thể dừng lại để quét trước.");
    let failed = false;
    for (let i = 0; i < T.chunks.length && !T.abort; i++) {
      if (T.chunks[i].done) continue;
      prog(`Đang dịch đoạn ${i + 1}/${T.chunks.length}...`);
      const r = await translateChunk(i);
      renderOut();
      if (r === "split") { i--; continue; }
      if (r === "fail") { failed = true; toast(T.chunks[i].err, "bad"); break; }
      if (r === "abort") break;
    }
    const done = T.chunks.filter((c) => c.done).length;
    setBusy(false, T.abort ? `Đã dừng, xong ${done}/${T.chunks.length} đoạn` : failed ? `Dừng vì lỗi, xong ${done}/${T.chunks.length} đoạn` : `Xong ${done}/${T.chunks.length} đoạn`);
    renderOut();
    syncGoButton();
  }

  async function redoChunk(i) {
    if (T.running) return toast("Đang dịch, hãy đợi hoặc bấm Dừng.", "bad");
    T.abort = false; setBusy(true);
    prog(`Đang dịch lại đoạn ${i + 1}...`);
    T.chunks[i].done = false;
    const r = await translateChunk(i);
    renderOut();
    if (r === "split") { setBusy(false); return redoChunkRange(i); }
    if (r === "fail") toast(T.chunks[i].err, "bad");
    setBusy(false, r === "ok" ? `Đã dịch lại đoạn ${i + 1}` : "");
    syncGoButton();
  }
  async function redoChunkRange(i) { await runTranslate(false); }

  async function runScan() {
    const text = g("tr-in").value;
    if (!text.trim()) return toast("Chưa có văn bản để quét.", "bad");
    if (!detect(text)) return toast("Văn bản không có chữ Trung, Nhật hoặc Hàn.", "bad");
    T.abort = false; setBusy(true);
    const segs = splitText(text, SCAN);
    let total = 0;
    try {
      for (let i = 0; i < segs.length && !T.abort; i++) {
        prog(`Đang quét tên riêng ${i + 1}/${segs.length}...`);
        const s = Store.cur();
        let r = null;
        for (let attempt = 0; attempt < 3 && !r; attempt++) {
          try { r = await post("/translate/extract", { ...opts(), text: segs[i], glossary: s.entries.slice(0, 200).map((e) => ({ src: e.src, vi: e.vi })) }); }
          catch (e) { if (e.code === "rate" && attempt < 2) { for (let k = 20; k > 0 && !T.abort; k--) { prog(`Đang chờ giới hạn tốc độ (${k}s)...`); await sleep(1000); } } else throw e; }
        }
        if (r) { const n = Store.add(r.names || [], true); total += n; if (n) Store.save(); }
      }
      setBusy(false, T.abort ? "Đã dừng quét" : `Quét xong: thêm ${total} tên mới vào bảng`);
      if (!T.abort) {
        g("tr-sum").innerHTML = `<p class="tl-note">Đã thêm <b>${fmt(total)}</b> tên mới vào bảng tên riêng của truyện (đánh dấu xanh). <b>Hãy xem lại và sửa</b> những tên chưa đúng trước khi dịch. <button type="button" id="tr-opengl">Mở bảng tên riêng</button></p>`;
      }
    } catch (e) {
      setBusy(false);
      toast(errText(e), "bad");
    }
  }

  function initTranslate() {
    const sel = g("tr-story");
    const loadStory = () => {
      const s = Store.cur();
      fillStorySelect(sel);
      g("tr-genre").value = s.genre; g("tr-style").value = s.nameStyle; g("tr-note").value = s.note || "";
      g("tr-q").value = Store.d.quality; if (document.activeElement !== g("tr-key")) g("tr-key").value = Store.d.key || "";
    };
    const saveOpt = () => {
      const s = Store.cur();
      s.genre = g("tr-genre").value; s.nameStyle = g("tr-style").value; s.note = g("tr-note").value.trim().slice(0, 600);
      Store.d.quality = g("tr-q").value; Store.d.key = g("tr-key").value.trim();
      Store.save();
    };
    document.addEventListener("tr:update", () => { if (!g("tr-story")) return; const a = document.activeElement; if (a && ["tr-note", "tr-key"].includes(a.id)) { fillStorySelect(sel); return; } loadStory(); });
    sel.onchange = () => { Store.d.current = sel.value; Store.save(); };
    ["tr-genre", "tr-style", "tr-q"].forEach((id) => g(id).addEventListener("change", saveOpt));
    ["tr-note", "tr-key"].forEach((id) => g(id).addEventListener("change", saveOpt));
    g("tr-new").onclick = () => {
      const name = g("tr-newname").value.trim();
      if (!name) return toast("Nhập tên truyện.", "bad");
      Store.create(name); g("tr-newname").value = ""; Store.save(); toast("Đã tạo truyện mới.");
    };
    g("tr-in").addEventListener("input", () => { renderInfo(); syncGoButton(); });
    g("tr-open").onclick = () => g("tr-file").click();
    g("tr-file").onchange = async () => {
      const f = g("tr-file").files[0]; g("tr-file").value = "";
      if (!f) return;
      if (f.size > 8 * 1048576) return toast("File quá lớn (tối đa 8 MB).", "bad");
      g("tr-in").value = decodeSmart(await f.arrayBuffer());
      renderInfo(); syncGoButton();
      toast(`Đã mở ${f.name}`);
    };
    g("tr-clear").onclick = () => { if (T.running) return toast("Đang dịch, bấm Dừng trước.", "bad"); g("tr-in").value = ""; T.id = ""; T.chunks = []; renderInfo(); renderOut(); syncGoButton(); g("tr-prog").innerHTML = ""; };
    g("tr-scan").onclick = runScan;
    g("tr-go").onclick = () => runTranslate(false);
    g("tr-reset").onclick = () => runTranslate(true);
    g("tr-stop").onclick = () => { T.abort = true; prog("Đang dừng..."); };
    g("tr-bi").onchange = renderOut;
    g("tl-dichtruyen").addEventListener("click", (e) => {
      const r = e.target.closest("[data-redo]");
      if (r) redoChunk(Number(r.dataset.redo));
      if (e.target.id === "tr-opengl") openCard("tentruyen");
    });
    const full = () => T.chunks.filter((c) => c.done).map((c) => c.vi).join("\n\n");
    g("tr-copy").onclick = async () => { try { await navigator.clipboard.writeText(full()); toast("Đã chép bản dịch."); } catch (_) { toast("Không chép được, hãy bôi đen và chép tay.", "bad"); } };
    g("tr-dl").onclick = () => {
      const blob = new Blob(["\ufeff" + full()], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (Store.cur().name.replace(/[\\/:*?"<>|]+/g, "") || "ban-dich") + "-" + new Date().toISOString().slice(0, 10) + ".txt";
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    loadStory(); renderInfo(); syncGoButton();
  }

  /* ================= 2. DỊCH NHANH ================= */
  function initQuick() {
    g("tq-clear").onclick = () => { g("tq-in").value = ""; g("tq-out").innerHTML = ""; g("tq-info").innerHTML = ""; };
    g("tq-in").addEventListener("input", () => {
      const t = g("tq-in").value, l = detect(t);
      g("tq-info").innerHTML = t.trim() ? `<span class="tl-chip ${l ? "ok" : "bad"}">${l ? LANG[l] : "Chưa nhận ra tiếng Trung, Nhật, Hàn"}</span><span class="tl-chip">${fmt(t.length)} ký tự</span>` : "";
    });
    g("tq-go").onclick = async () => {
      const text = g("tq-in").value;
      if (!text.trim()) return toast("Chưa có văn bản để dịch.", "bad");
      if (text.length > QUICK_MAX) return toast(`Tối đa ${fmt(QUICK_MAX)} ký tự, hãy dùng "Dịch truyện" cho văn bản dài.`, "bad");
      const b = g("tq-go"); b.disabled = true; b.textContent = "Đang dịch...";
      try {
        const s = Store.cur();
        const r = await post("/translate/quick", { ...opts(), text, glossary: g("tq-gl").checked ? relevant(s.entries, text) : [] });
        const f = r.flags, warn = [];
        if (f?.missing?.length) warn.push("Thiếu tên theo bảng: " + f.missing.map((m) => `${m.src} → ${m.vi}`).join(", "));
        if (f?.cjk) warn.push("Còn sót chữ gốc: " + f.cjk);
        g("tq-out").innerHTML = `<div class="tr-blk${warn.length ? " bad" : ""}">
          <div class="tr-bh"><b>Bản dịch${r.lang && LANG[r.lang] ? " từ " + LANG[r.lang].toLowerCase() : ""}</b><span class="sp"></span><button type="button" id="tq-copy">Chép</button></div>
          ${warn.map((w) => `<div class="tr-warn">${esc(w)}</div>`).join("")}
          <div class="tr-tx">${esc(r.vi)}</div>
          ${r.reading ? `<div class="tr-bh" style="margin-top:.7rem"><b>Phiên âm</b></div><div class="tr-rd">${esc(r.reading)}</div>` : ""}
          ${r.notes ? `<div class="tr-bh" style="margin-top:.7rem"><b>Ghi chú</b></div><div class="tl-note">${esc(r.notes)}</div>` : ""}
        </div>`;
        g("tq-copy").onclick = async () => { try { await navigator.clipboard.writeText(r.vi); toast("Đã chép bản dịch."); } catch (_) { toast("Không chép được.", "bad"); } };
      } catch (e) { toast(errText(e), "bad"); }
      b.disabled = false; b.textContent = "Dịch";
    };
  }

  /* ================= 3. BẢNG TÊN RIÊNG ================= */
  function parseImport(text) {
    const out = [];
    const t = text.trim();
    if (t.startsWith("[") || t.startsWith("{")) {
      try {
        const j = JSON.parse(t);
        const arr = Array.isArray(j) ? j : j.entries || j.names || [];
        for (const e of arr) if (e && e.src && e.vi) out.push({ src: e.src, vi: e.vi, type: e.type });
        return out;
      } catch (_) {}
    }
    for (const line of t.split(/\r?\n/)) {
      const m = line.trim().match(/^(.+?)\s*(?:\t|=|→|->|,|;)\s*(.+?)(?:\s*(?:\t|,|;)\s*([a-z]+))?$/);
      if (m && !/^(src|gốc)$/i.test(m[1])) out.push({ src: m[1], vi: m[2], type: m[3] });
    }
    return out;
  }

  function download(name, text, mime) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + text], { type: mime + ";charset=utf-8" }));
    a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function initGlossary() {
    const sel = g("tg-story"), list = g("tg-list");
    let q = "";
    const draw = () => {
      const s = Store.cur();
      fillStorySelect(sel);
      if (document.activeElement !== g("tg-name")) g("tg-name").value = s.name;
      const needle = q.trim().toLowerCase();
      const rows = s.entries.map((e, i) => ({ e, i })).filter(({ e }) => !needle || e.src.toLowerCase().includes(needle) || e.vi.toLowerCase().includes(needle));
      rows.sort((a, b) => (b.e.auto ? 1 : 0) - (a.e.auto ? 1 : 0));
      const shown = rows.slice(0, 300);
      const nNew = s.entries.filter((e) => e.auto).length;
      g("tg-info").innerHTML = `<span class="tl-chip">${fmt(s.entries.length)} tên</span>${nNew ? `<span class="tl-chip ok">${fmt(nNew)} tên mới tự thêm</span>` : ""}${rows.length > shown.length ? `<span class="tl-chip">Đang hiện ${shown.length}/${fmt(rows.length)}</span>` : ""}`;
      g("tg-ok").hidden = !nNew;
      list.innerHTML = shown.length ? shown.map(({ e, i }) => `<div class="tg-row${e.auto ? " new" : ""}" data-i="${i}">
        <input class="tg-src" data-f="src" value="${esc(e.src)}" spellcheck="false" aria-label="Chữ gốc">
        <input data-f="vi" value="${esc(e.vi)}" spellcheck="false" aria-label="Tên tiếng Việt">
        <select data-f="type" aria-label="Loại">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}"${e.type === k ? " selected" : ""}>${v}</option>`).join("")}</select>
        <button type="button" data-del="${i}" aria-label="Xoá tên">✕</button></div>`).join("") : `<p class="tl-note">${needle ? "Không có tên nào khớp." : 'Bảng đang trống. Bấm "Quét tên riêng" ở thẻ Dịch truyện, nhập từ file hoặc thêm tay.'}</p>`;
    };
    document.addEventListener("tr:update", () => { if (g("tg-list")) draw(); });
    sel.onchange = () => { Store.d.current = sel.value; Store.save(); };
    g("tg-q").addEventListener("input", () => { q = g("tg-q").value; draw(); });
    g("tg-rename").onclick = () => { const n = g("tg-name").value.trim().slice(0, 60); if (!n) return toast("Nhập tên truyện.", "bad"); Store.cur().name = n; Store.save(); toast("Đã đổi tên truyện."); };

    list.addEventListener("change", (e) => {
      const row = e.target.closest(".tg-row"), f = e.target.dataset.f;
      if (!row || !f) return;
      const s = Store.cur(), ent = s.entries[Number(row.dataset.i)];
      if (!ent) return;
      const v = e.target.value.trim();
      if (f === "src") {
        if (!v) { e.target.value = ent.src; return; }
        if (s.entries.some((x, k) => x !== ent && x.src === v)) { toast("Chữ gốc này đã có trong bảng.", "bad"); e.target.value = ent.src; return; }
        ent.src = v;
      } else if (f === "vi") {
        if (!v) { e.target.value = ent.vi; return; }
        const old = ent.vi; ent.vi = v;
        // tên đầy đủ chứa tên ngắn vừa sửa (Lạc Thủy Hàn chứa Thủy Hàn) cũng đổi theo để bảng không bị lệch
        let linked = 0;
        const probe = wordRe(old, ""), swap = wordRe(old, "g");
        if (probe && swap) for (const x of s.entries) if (x !== ent && probe.test(x.vi)) { x.vi = x.vi.replace(swap, v); linked++; }
        const n = replaceInResults(old, v);
        if (n || linked) toast(`${n ? `Đã đổi ${n} chỗ trong bản dịch hiện có. ` : ""}${linked ? `Cập nhật thêm ${linked} tên khác trong bảng có chứa cụm này.` : ""}`.trim());
      } else ent.type = v;
      ent.auto = false;
      Store.save();
    });
    list.addEventListener("click", (e) => {
      const d = e.target.closest("[data-del]");
      if (!d) return;
      Store.cur().entries.splice(Number(d.dataset.del), 1);
      Store.save();
    });
    g("tg-add").onclick = () => {
      const s = Store.cur();
      let k = 1; while (s.entries.some((x) => x.src === "名字" + k)) k++;
      s.entries.unshift({ src: "名字" + k, vi: "Tên", type: "person", auto: true });
      q = ""; g("tg-q").value = ""; Store.save();
      toast("Đã thêm một dòng, hãy sửa chữ gốc và tên tiếng Việt.");
    };
    g("tg-ok").onclick = () => { Store.cur().entries.forEach((e) => (e.auto = false)); Store.save(); };
    g("tg-imp").onclick = () => g("tg-file").click();
    g("tg-file").onchange = async () => {
      const f = g("tg-file").files[0]; g("tg-file").value = "";
      if (!f) return;
      const items = parseImport(decodeSmart(await f.arrayBuffer()));
      const n = Store.add(items, false);
      Store.save();
      toast(n ? `Đã nhập ${n} tên mới (bỏ qua ${items.length - n} tên đã có hoặc lỗi).` : "Không nhập được tên nào mới từ file này.", n ? "" : "bad");
    };
    g("tg-json").onclick = () => { const s = Store.cur(); download(`${s.name}-ten-rieng.json`, JSON.stringify(s.entries.map(({ src, vi, type }) => ({ src, vi, type })), null, 2), "application/json"); };
    const csvCell = (v) => (/[",\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v);
    g("tg-csv").onclick = () => { const s = Store.cur(); download(`${s.name}-ten-rieng.csv`, "src,vi,type\r\n" + s.entries.map((e) => [e.src, e.vi, e.type].map(csvCell).join(",")).join("\r\n"), "text/csv"); };
    g("tg-copy").onclick = async () => { try { await navigator.clipboard.writeText(Store.cur().entries.map((e) => `${e.src}=${e.vi}`).join("\n")); toast("Đã chép bảng tên."); } catch (_) { toast("Không chép được.", "bad"); } };
    g("tg-del").onclick = async () => {
      const s = Store.cur();
      const okf = typeof confirmBox === "function" ? await confirmBox(`Xoá truyện "${s.name}" và toàn bộ ${s.entries.length} tên riêng của nó?`, { title: "Xoá truyện?", ok: "Xoá", cancel: "Giữ lại", danger: true }) : confirm("Xoá truyện này?");
      if (!okf) return;
      Store.d.stories = Store.d.stories.filter((x) => x.id !== s.id);
      if (!Store.d.stories.length) Store.create("Truyện của tôi");
      Store.d.current = Store.d.stories[0].id;
      Store.save();
      toast("Đã xoá truyện.");
    };
    draw();
  }

  /* ---------- chờ tab Công cụ dựng xong rồi mới gắn vào ---------- */
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
