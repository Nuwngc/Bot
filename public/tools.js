/* Tab CÔNG CỤ: các tiện ích nhỏ chạy ngay trên trình duyệt (không gửi dữ liệu lên máy chủ).
   Tự thêm tab + giao diện + CSS, được nạp từ ui.js (giống guide.js). */
(() => {
  const tabs = document.getElementById("tabs");
  if (!tabs || document.getElementById("tab-tools")) return;

  const g = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const toast = (t, kind) => (typeof say === "function" ? say(t, kind) : alert(t));
  const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");
  const num = (s) => Number(String(s).replace(/[^\d]/g, "")) || 0;

  async function copyText(t) {
    if (!t) return toast("Chưa có nội dung để sao chép.", "bad");
    try { await navigator.clipboard.writeText(t); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = t; ta.style.cssText = "position:fixed;opacity:0";
      document.body.append(ta); ta.select();
      try { document.execCommand("copy"); } catch (_) {}
      ta.remove();
    }
    toast("Đã sao chép.");
  }

  /* số ngẫu nhiên an toàn, không lệch (crypto + loại bỏ phần dư) */
  function rnd(n) {
    const max = Math.floor(0x100000000 / n) * n, a = new Uint32Array(1);
    let x;
    do { crypto.getRandomValues(a); x = a[0]; } while (x >= max);
    return x % n;
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* ================= 1. COOKIE ================= */
  const ATTRS = new Set(["path", "domain", "expires", "max-age", "secure", "httponly", "samesite"]);
  function parseCookies(raw) {
    raw = String(raw || "").trim().replace(/^cookie\s*:\s*/i, "");
    if (!raw) throw new Error("Chưa nhập cookie.");
    let list = [];
    if (raw[0] === "[" || raw[0] === "{") {
      let j;
      try { j = JSON.parse(raw); } catch { throw new Error("JSON không hợp lệ. Kiểm tra dấu ngoặc và dấu phẩy."); }
      if (!Array.isArray(j)) j = Array.isArray(j.cookies) ? j.cookies : Object.entries(j).map(([key, value]) => ({ key, value }));
      list = j.filter((c) => c && typeof c === "object").map((c) => ({
        key: String(c.key ?? c.name ?? ""), value: String(c.value ?? ""), domain: c.domain, path: c.path,
        expires: c.expirationDate ?? c.expires ?? null,
      }));
    } else {
      raw.split(/;|\r?\n/).forEach((part) => {
        const i = part.indexOf("=");
        if (i < 1) return;
        const key = part.slice(0, i).trim(), value = part.slice(i + 1).trim().replace(/^"|"$/g, "");
        if (key && !ATTRS.has(key.toLowerCase())) list.push({ key, value });
      });
    }
    const map = new Map();
    list.filter((c) => c.key).forEach((c) => map.set(c.key, c));
    if (!map.size) throw new Error("Không đọc được cookie nào. Dạng đúng: ten=giatri; ten2=giatri2");
    return [...map.values()];
  }
  const cookieHas = (l, k) => l.find((c) => c.key === k);
  function cookieToJson(list) {
    const now = new Date().toISOString();
    const dom = cookieHas(list, "c_user") || cookieHas(list, "xs") ? "facebook.com" : cookieHas(list, "zpw_sek") || cookieHas(list, "zpsid") ? "zalo.me" : "";
    return JSON.stringify(list.map((c) => {
      const o = { key: c.key, value: c.value };
      if (c.domain || dom) o.domain = c.domain || dom;
      o.path = c.path || "/"; o.hostOnly = false; o.creation = now; o.lastAccessed = now;
      return o;
    }), null, 2);
  }
  const cookieToString = (list) => list.map((c) => `${c.key}=${c.value}`).join("; ");
  function cookieInfo(list) {
    const chips = [`<span class="tl-chip">${list.length} cookie</span>`];
    const cu = cookieHas(list, "c_user"), xs = cookieHas(list, "xs");
    if (cu || xs || cookieHas(list, "datr")) {
      chips.push(cu ? `<span class="tl-chip ok">Facebook UID: ${esc(cu.value)}</span>` : `<span class="tl-chip bad">Thiếu c_user</span>`);
      chips.push(xs ? `<span class="tl-chip ok">Có xs</span>` : `<span class="tl-chip bad">Thiếu xs: không đăng nhập được</span>`);
    }
    if (cookieHas(list, "zpw_sek") || cookieHas(list, "zpsid")) chips.push(`<span class="tl-chip ok">Có dấu hiệu cookie Zalo</span>`);
    const nowS = Date.now() / 1000, dead = list.filter((c) => c.expires && Number(c.expires) > 1e9 && Number(c.expires) < nowS).length;
    if (dead) chips.push(`<span class="tl-chip bad">${dead} cookie đã hết hạn</span>`);
    return chips.join("");
  }

  /* ================= 2. MÃ QR ================= */
  const BANKS = [["MB", "MB Bank"], ["VCB", "Vietcombank"], ["TCB", "Techcombank"], ["ACB", "ACB"], ["BIDV", "BIDV"], ["ICB", "VietinBank"],
    ["VPB", "VPBank"], ["TPB", "TPBank"], ["STB", "Sacombank"], ["VIB", "VIB"], ["MSB", "MSB"], ["SHB", "SHB"], ["OCB", "OCB"], ["HDB", "HDBank"]];
  const vietQr = ({ bank, account, name, amount, note }) => {
    const p = new URLSearchParams();
    if (amount) p.set("amount", String(amount));
    if (note) p.set("addInfo", note);
    if (name) p.set("accountName", name);
    return `https://img.vietqr.io/image/${encodeURIComponent(bank)}-${encodeURIComponent(account)}-compact2.png?${p}`;
  };
  const textQr = (text, size) => `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&data=${encodeURIComponent(text)}`;

  /* ================= 3. VĂN BẢN ================= */
  const noTone = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
  const lines = (s) => s.split(/\r?\n/);
  const TEXT_OPS = {
    bodau: [noTone, "Bỏ dấu"],
    upper: [(s) => s.toLocaleUpperCase("vi"), "CHỮ HOA"],
    lower: [(s) => s.toLocaleLowerCase("vi"), "chữ thường"],
    title: [(s) => s.toLocaleLowerCase("vi").replace(/(^|[\s\-_.,;:!?()"'])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase("vi")), "Viết Hoa Đầu Từ"],
    slug: [(s) => noTone(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""), "Tạo slug"],
    dedup: [(s) => [...new Set(lines(s).map((l) => l.trim()))].join("\n"), "Xoá dòng trùng"],
    sort: [(s) => lines(s).sort((a, b) => a.localeCompare(b, "vi")).join("\n"), "Sắp xếp A-Z"],
    blank: [(s) => lines(s).filter((l) => l.trim()).join("\n"), "Xoá dòng trống"],
    join: [(s) => lines(s).map((l) => l.trim()).filter(Boolean).join(", "), "Gộp thành một dòng"],
  };

  /* ================= 4. MẬT KHẨU ================= */
  const SETS = { lower: "abcdefghijkmnopqrstuvwxyz", upper: "ABCDEFGHJKLMNPQRSTUVWXYZ", digit: "23456789", sym: "!@#$%^&*()-_=+?" };
  const FULL = { lower: "abcdefghijklmnopqrstuvwxyz", upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", digit: "0123456789", sym: SETS.sym };
  function makePassword(len, use, clear) {
    const src = clear ? SETS : FULL;
    const kinds = Object.keys(use).filter((k) => use[k]);
    if (!kinds.length) throw new Error("Chọn ít nhất một loại ký tự.");
    if (len < kinds.length) len = kinds.length;
    const pool = kinds.map((k) => src[k]).join("");
    const chars = kinds.map((k) => src[k][rnd(src[k].length)]);
    while (chars.length < len) chars.push(pool[rnd(pool.length)]);
    return { pw: shuffle(chars).join(""), bits: Math.round(len * Math.log2(pool.length)) };
  }
  const strength = (b) => (b < 40 ? ["Yếu", "bad"] : b < 60 ? ["Khá", ""] : b < 80 ? ["Mạnh", "ok"] : ["Rất mạnh", "ok"]);

  /* ================= 6. THỜI GIAN ================= */
  const VN = "Asia/Ho_Chi_Minh";
  const fmtVn = (ms) => new Date(ms).toLocaleString("vi-VN", { timeZone: VN, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  function relative(ms) {
    const d = ms - Date.now(), a = Math.abs(d), days = Math.floor(a / 864e5), hrs = Math.floor((a % 864e5) / 36e5), min = Math.floor((a % 36e5) / 6e4);
    const t = days ? `${days} ngày ${hrs} giờ` : hrs ? `${hrs} giờ ${min} phút` : `${min} phút`;
    return d >= 0 ? `còn ${t}` : `đã qua ${t}`;
  }
  const vnLocalToMs = (v) => { const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(v); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 7 * 36e5 : NaN; };

  /* ---------- giao diện ---------- */
  const ic = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const TOOLS = [
    { id: "cookie", title: "Chuyển đổi cookie", desc: "Chuỗi ↔ JSON, kiểm tra UID và c_user, xs", icon: ic('<circle cx="12" cy="12" r="9"/><path d="M8.5 9h.01M15 8h.01M10 14.5h.01M15.5 14h.01M12.5 11.5h.01"/>'), html: `
      <p class="tl-note">Xử lý ngay trên trình duyệt, cookie không gửi lên máy chủ.</p>
      <div class="field"><label for="ck-in">Dán cookie (chuỗi hoặc JSON)</label><textarea id="ck-in" rows="5" spellcheck="false" placeholder="c_user=...; xs=...   hoặc   [{&quot;key&quot;:&quot;c_user&quot;,&quot;value&quot;:&quot;...&quot;}]"></textarea></div>
      <div class="row"><button class="primary" id="ck-json" type="button">Sang JSON</button><button id="ck-str" type="button">Sang chuỗi</button><button id="ck-clr" type="button">Xoá</button></div>
      <div class="tl-chips" id="ck-info"></div>
      <div class="field"><label for="ck-out">Kết quả</label><textarea id="ck-out" rows="5" readonly spellcheck="false"></textarea></div>
      <button id="ck-copy" type="button">Sao chép kết quả</button>` },
    { id: "qr", title: "Tạo mã QR", desc: "Từ văn bản, liên kết hoặc thông tin chuyển khoản VietQR", icon: ic('<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM20 14v3M14 20h3M20 20h.01"/>'), html: `
      <div class="seg row" id="qr-mode"><button class="primary" data-m="text" type="button">Văn bản / liên kết</button><button data-m="bank" type="button">Chuyển khoản</button></div>
      <div id="qr-text">
        <div class="field"><label for="qr-t">Nội dung</label><textarea id="qr-t" rows="3" placeholder="https://... hoặc bất kỳ văn bản nào"></textarea></div>
        <div class="field"><label for="qr-size">Kích thước</label><select id="qr-size"><option value="240">Nhỏ (240)</option><option value="360" selected>Vừa (360)</option><option value="520">Lớn (520)</option></select></div>
      </div>
      <div id="qr-bank" hidden>
        <div class="field"><label for="qb-bank">Ngân hàng</label><select id="qb-bank">${BANKS.map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join("")}</select></div>
        <div class="field"><label for="qb-acc">Số tài khoản</label><input id="qb-acc" type="text" inputmode="numeric" autocomplete="off"></div>
        <div class="field"><label for="qb-name">Tên chủ tài khoản (không bắt buộc)</label><input id="qb-name" type="text" autocomplete="off"></div>
        <div class="field"><label for="qb-amt">Số tiền (không bắt buộc)</label><input id="qb-amt" type="text" inputmode="numeric" autocomplete="off"></div>
        <div class="field"><label for="qb-note">Nội dung chuyển khoản (không bắt buộc)</label><input id="qb-note" type="text" autocomplete="off"></div>
      </div>
      <button class="primary" id="qr-go" type="button">Tạo mã QR</button>
      <div class="tl-qrbox" id="qr-out" hidden><img id="qr-img" alt="Mã QR"><a id="qr-open" target="_blank" rel="noopener">Mở ảnh để lưu</a></div>
      <p class="tl-note">Ảnh QR được tạo bởi dịch vụ bên ngoài (qrserver.com, vietqr.io) nên nội dung bạn nhập sẽ được gửi tới đó. Đừng nhập thông tin bí mật.</p>` },
    { id: "text", title: "Xử lý văn bản", desc: "Bỏ dấu tiếng Việt, đổi kiểu chữ, slug, lọc dòng", icon: ic('<path d="M4 7V5h16v2M12 5v14M9 19h6"/>'), html: `
      <div class="field"><label for="tx-in">Văn bản</label><textarea id="tx-in" rows="6" placeholder="Dán hoặc gõ văn bản ở đây"></textarea></div>
      <div class="tl-stats" id="tx-stats">0 ký tự · 0 từ · 0 dòng</div>
      <div class="tl-btns">${Object.entries(TEXT_OPS).map(([k, [, n]]) => `<button type="button" data-op="${k}">${esc(n)}</button>`).join("")}</div>
      <div class="row"><button id="tx-undo" type="button">Hoàn tác</button><button id="tx-copy" type="button">Sao chép</button><button id="tx-clr" type="button">Xoá</button></div>` },
    { id: "pass", title: "Tạo mật khẩu mạnh", desc: "Ngẫu nhiên an toàn, tuỳ chọn độ dài và ký tự", icon: ic('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>'), html: `
      <div class="field"><label for="pw-len">Độ dài: <b id="pw-lenv">16</b></label><input id="pw-len" type="range" min="8" max="64" value="16"></div>
      <label class="check"><input type="checkbox" id="pw-lower" checked> Chữ thường (a-z)</label>
      <label class="check"><input type="checkbox" id="pw-upper" checked> Chữ hoa (A-Z)</label>
      <label class="check"><input type="checkbox" id="pw-digit" checked> Số (0-9)</label>
      <label class="check"><input type="checkbox" id="pw-sym" checked> Ký hiệu (!@#$...)</label>
      <label class="check"><input type="checkbox" id="pw-clear"> Bỏ ký tự dễ nhầm (0 O 1 l I)</label>
      <div class="tl-result" id="pw-out">Bấm Tạo mật khẩu</div>
      <div class="tl-chips" id="pw-meter"></div>
      <div class="row"><button class="primary" id="pw-go" type="button">Tạo mật khẩu</button><button id="pw-copy" type="button">Sao chép</button></div>` },
    { id: "pick", title: "Chọn ngẫu nhiên / chia đội", desc: "Bốc thăm người trúng thưởng, chia đội đều nhau", icon: ic('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"/>'), html: `
      <div class="field"><label for="pk-in">Danh sách (mỗi dòng hoặc cách nhau bằng dấu phẩy)</label><textarea id="pk-in" rows="5" placeholder="An&#10;Bình&#10;Chi"></textarea></div>
      <div class="seg row" id="pk-mode"><button class="primary" data-m="pick" type="button">Chọn người</button><button data-m="team" type="button">Chia đội</button></div>
      <div class="field"><label for="pk-n" id="pk-nl">Số người cần chọn</label><input id="pk-n" type="text" inputmode="numeric" value="1"></div>
      <button class="primary" id="pk-go" type="button">Bắt đầu</button>
      <div id="pk-out" class="tl-result" hidden></div>
      <button id="pk-copy" type="button" hidden>Sao chép kết quả</button>` },
    { id: "time", title: "Đổi thời gian", desc: "Timestamp ↔ ngày giờ Việt Nam, cộng thêm ngày", icon: ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), html: `
      <div class="field"><label for="tm-ts">Timestamp (giây hoặc mili giây)</label><input id="tm-ts" type="text" inputmode="numeric" placeholder="1700000000"></div>
      <div class="field"><label for="tm-dt">Hoặc chọn ngày giờ (giờ Việt Nam)</label><input id="tm-dt" type="datetime-local"></div>
      <div class="field"><label for="tm-add">Cộng thêm bao nhiêu ngày kể từ bây giờ</label><input id="tm-add" type="text" inputmode="numeric" placeholder="30"></div>
      <div class="row"><button class="primary" id="tm-go" type="button">Chuyển đổi</button><button id="tm-now" type="button">Bây giờ</button></div>
      <div class="tl-result" id="tm-out" hidden></div>` },
  ];

  const css = document.createElement("style");
  css.textContent = `
  .tl-hero{padding:1.2rem;border-radius:20px;border:1px solid var(--line);margin-bottom:1rem;background:linear-gradient(135deg,rgba(167,125,255,.16),rgba(232,64,122,.18)),var(--panel)}
  .tl-hero h2{margin:0 0 .25rem;font-size:1.25rem}.tl-hero p{margin:0;color:var(--dim);font-size:.9rem;max-width:none}
  details.tl-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;margin-bottom:.6rem;transition:border-color .3s,box-shadow .3s}
  details.tl-card[open]{border-color:rgba(232,64,122,.4);box-shadow:0 14px 34px -24px var(--lamp)}
  details.tl-card summary{display:flex;align-items:center;gap:.85rem;padding:.85rem 1rem;cursor:pointer;list-style:none}
  details.tl-card summary::-webkit-details-marker{display:none}
  .tl-ic{display:grid;place-items:center;flex:none;width:2.4rem;height:2.4rem;border-radius:12px;background:rgba(232,64,122,.14);box-shadow:inset 0 0 0 1px rgba(232,64,122,.3)}
  .tl-ic svg{width:1.3rem;height:1.3rem;fill:none;stroke:var(--lamp);stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
  .tl-t{flex:1;min-width:0}.tl-t b{display:block}.tl-t small{display:block;color:var(--dim);font-size:.8rem;line-height:1.35}
  .tl-chev{width:1.1rem;height:1.1rem;fill:none;stroke:var(--dim);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .3s var(--ease)}
  details[open] .tl-chev{transform:rotate(180deg)}
  .tl-body{padding:0 1rem 1rem;animation:in .35s var(--ease)}
  .tl-body .row{margin:.55rem 0}.tl-body .seg{margin-bottom:.9rem}.tl-body input[type=range]{width:100%;accent-color:var(--lamp)}
  .tl-note{font-size:.82rem;color:var(--dim);margin:.2rem 0 .8rem}
  .tl-chips{display:flex;gap:.4rem;flex-wrap:wrap;margin:.2rem 0 .8rem}
  .tl-chip{font-size:.78rem;padding:.15rem .6rem;border-radius:99px;border:1px solid var(--line);color:var(--dim)}
  .tl-chip.ok{color:var(--ok);border-color:rgba(79,224,176,.5)}.tl-chip.bad{color:var(--alert);border-color:rgba(255,107,141,.5)}
  .tl-stats{font-size:.82rem;color:var(--dim);margin:.4rem 0 .6rem}
  .tl-btns{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.6rem}.tl-btns button{padding:.4rem .8rem;border-radius:99px;font-size:.85rem}
  .tl-result{margin:.7rem 0;padding:.75rem .9rem;border-radius:12px;border:1px solid var(--line);background:var(--field);font:.92rem/1.6 ui-monospace,Menlo,monospace;word-break:break-all;white-space:pre-wrap}
  .tl-result b{color:var(--lamp2)}
  .tl-teams{display:grid;gap:.5rem;font-family:inherit;white-space:normal}.tl-teams div{padding:.5rem .7rem;border-radius:10px;background:var(--raised)}
  .tl-qrbox{margin:1rem 0 .4rem;text-align:center}.tl-qrbox img{display:block;margin:0 auto .6rem;max-width:100%;border-radius:12px;background:#fff;padding:6px}
  .tl-qrbox a{color:var(--lamp2)}
  .tl-win{animation:tlpop .35s var(--ease)}@keyframes tlpop{from{transform:scale(.92);opacity:.5}}`;
  document.head.append(css);

  const CHEV = '<svg class="tl-chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
  const panel = document.createElement("div");
  panel.className = "tab";
  panel.id = "tab-tools";
  panel.hidden = true;
  panel.innerHTML = `<section>
    <div class="tl-hero"><h2>Công cụ tiện ích</h2><p>Các tiện ích nhỏ cho bạn dùng ngay, chạy trên trình duyệt và không lưu dữ liệu của bạn.</p></div>
    ${TOOLS.map((t) => `<details class="tl-card" id="tl-${t.id}"><summary><span class="tl-ic">${t.icon}</span><span class="tl-t"><b>${esc(t.title)}</b><small>${esc(t.desc)}</small></span>${CHEV}</summary><div class="tl-body">${t.html}</div></details>`).join("")}
  </section>`;
  const after = document.getElementById("tab-plan");
  if (after) after.after(panel); else (document.querySelector(".wrap") || document.body).append(panel);

  const btn = document.createElement("button");
  btn.dataset.tab = "tools";
  btn.textContent = "Công cụ";
  const profileBtn = tabs.querySelector('button[data-tab="profile"]');
  if (profileBtn) profileBtn.before(btn); else (document.getElementById("tabStatsBtn") || document.getElementById("tabAdminBtn") || { before: (b) => tabs.append(b) }).before(btn);

  /* ---------- hành vi từng công cụ ---------- */
  // 1. cookie
  const ckRun = (mode) => {
    try {
      const list = parseCookies(g("ck-in").value);
      g("ck-out").value = mode === "json" ? cookieToJson(list) : cookieToString(list);
      g("ck-info").innerHTML = cookieInfo(list);
    } catch (e) { g("ck-out").value = ""; g("ck-info").innerHTML = `<span class="tl-chip bad">${esc(e.message)}</span>`; }
  };
  g("ck-json").onclick = () => ckRun("json");
  g("ck-str").onclick = () => ckRun("str");
  g("ck-copy").onclick = () => copyText(g("ck-out").value);
  g("ck-clr").onclick = () => { g("ck-in").value = g("ck-out").value = ""; g("ck-info").innerHTML = ""; };

  // 2. QR
  let qrMode = "text";
  g("qr-mode").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-m]"); if (!b) return;
    qrMode = b.dataset.m;
    g("qr-mode").querySelectorAll("button").forEach((x) => x.classList.toggle("primary", x === b));
    g("qr-text").hidden = qrMode !== "text"; g("qr-bank").hidden = qrMode !== "bank"; g("qr-out").hidden = true;
  });
  g("qb-amt").addEventListener("input", (e) => { const n = num(e.target.value); e.target.value = n ? fmt(n) : ""; });
  g("qr-go").onclick = () => {
    let url;
    if (qrMode === "text") {
      const t = g("qr-t").value.trim();
      if (!t) return toast("Nhập nội dung cần tạo mã QR.", "bad");
      if (t.length > 1000) return toast("Nội dung quá dài (tối đa 1000 ký tự).", "bad");
      url = textQr(t, g("qr-size").value);
    } else {
      const account = g("qb-acc").value.replace(/\s/g, "");
      if (!/^\d{6,19}$/.test(account)) return toast("Số tài khoản gồm 6 đến 19 chữ số.", "bad");
      url = vietQr({ bank: g("qb-bank").value, account, name: g("qb-name").value.trim(), amount: num(g("qb-amt").value) || "", note: g("qb-note").value.trim() });
    }
    g("qr-img").onerror = () => toast("Không tải được ảnh QR. Kiểm tra kết nối mạng.", "bad");
    g("qr-img").src = url; g("qr-open").href = url; g("qr-out").hidden = false;
  };

  // 3. văn bản
  const txIn = g("tx-in"), undo = [];
  const txStats = () => {
    const v = txIn.value, words = (v.match(/\S+/g) || []).length;
    g("tx-stats").textContent = `${fmt(v.length)} ký tự · ${fmt(words)} từ · ${fmt(v ? lines(v).length : 0)} dòng`;
  };
  txIn.addEventListener("input", txStats);
  panel.querySelector(".tl-btns").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-op]"); if (!b || !txIn.value) return;
    undo.push(txIn.value); if (undo.length > 20) undo.shift();
    txIn.value = TEXT_OPS[b.dataset.op][0](txIn.value); txStats();
  });
  g("tx-undo").onclick = () => { if (undo.length) { txIn.value = undo.pop(); txStats(); } };
  g("tx-copy").onclick = () => copyText(txIn.value);
  g("tx-clr").onclick = () => { if (txIn.value) undo.push(txIn.value); txIn.value = ""; txStats(); };

  // 4. mật khẩu
  g("pw-len").addEventListener("input", () => (g("pw-lenv").textContent = g("pw-len").value));
  g("pw-go").onclick = () => {
    try {
      const r = makePassword(+g("pw-len").value, { lower: g("pw-lower").checked, upper: g("pw-upper").checked, digit: g("pw-digit").checked, sym: g("pw-sym").checked }, g("pw-clear").checked);
      const [label, cls] = strength(r.bits);
      g("pw-out").textContent = r.pw; g("pw-out").classList.remove("tl-win"); void g("pw-out").offsetWidth; g("pw-out").classList.add("tl-win");
      g("pw-meter").innerHTML = `<span class="tl-chip ${cls}">Độ mạnh: ${label}</span><span class="tl-chip">${r.bits} bit</span>`;
    } catch (e) { toast(e.message, "bad"); }
  };
  g("pw-copy").onclick = () => { const t = g("pw-out").textContent; copyText(/^Bấm /.test(t) ? "" : t); };

  // 5. chọn ngẫu nhiên / chia đội
  let pkMode = "pick", pkText = "";
  const names = () => g("pk-in").value.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
  g("pk-mode").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-m]"); if (!b) return;
    pkMode = b.dataset.m;
    g("pk-mode").querySelectorAll("button").forEach((x) => x.classList.toggle("primary", x === b));
    g("pk-nl").textContent = pkMode === "pick" ? "Số người cần chọn" : "Số đội";
    g("pk-n").value = pkMode === "pick" ? "1" : "2";
  });
  g("pk-go").onclick = () => {
    const list = names(), n = num(g("pk-n").value), out = g("pk-out");
    if (list.length < 2) return toast("Nhập ít nhất 2 tên.", "bad");
    if (n < 1 || (pkMode === "pick" && n > list.length) || (pkMode === "team" && n > list.length)) return toast(pkMode === "pick" ? "Số người cần chọn lớn hơn danh sách." : "Số đội lớn hơn số người.", "bad");
    const sh = shuffle(list);
    if (pkMode === "pick") {
      const win = sh.slice(0, n);
      pkText = win.map((w, i) => `${i + 1}. ${w}`).join("\n");
      out.className = "tl-result tl-win"; out.innerHTML = "Được chọn:<br>" + win.map((w, i) => `${i + 1}. <b>${esc(w)}</b>`).join("<br>");
    } else {
      const teams = Array.from({ length: n }, () => []);
      sh.forEach((p, i) => teams[i % n].push(p));
      pkText = teams.map((t, i) => `Đội ${i + 1}: ${t.join(", ")}`).join("\n");
      out.className = "tl-result tl-win tl-teams"; out.innerHTML = teams.map((t, i) => `<div><b>Đội ${i + 1}</b> (${t.length}): ${t.map(esc).join(", ")}</div>`).join("");
    }
    out.hidden = false; g("pk-copy").hidden = false;
  };
  g("pk-copy").onclick = () => copyText(pkText);

  // 6. thời gian
  const tmShow = (ms, extra = "") => {
    const out = g("tm-out");
    out.hidden = false;
    out.innerHTML = `Giờ Việt Nam: <b>${esc(fmtVn(ms))}</b> (${esc(relative(ms))})${extra}<br>Timestamp (giây): <b>${Math.floor(ms / 1000)}</b><br>Timestamp (mili giây): <b>${Math.floor(ms)}</b><br>UTC: ${esc(new Date(ms).toISOString())}`;
  };
  g("tm-go").onclick = () => {
    const ts = g("tm-ts").value.trim(), dt = g("tm-dt").value, add = g("tm-add").value.trim();
    if (ts) {
      if (!/^\d{9,16}$/.test(ts)) return toast("Timestamp gồm 9 đến 16 chữ số.", "bad");
      const ms = ts.length >= 13 ? Number(ts) : Number(ts) * 1000;
      return tmShow(ms);
    }
    if (dt) { const ms = vnLocalToMs(dt); return Number.isNaN(ms) ? toast("Ngày giờ không hợp lệ.", "bad") : tmShow(ms); }
    if (add) return tmShow(Date.now() + num(add) * 864e5, `<br>Sau ${fmt(num(add))} ngày kể từ bây giờ`);
    toast("Nhập timestamp, chọn ngày giờ hoặc số ngày cần cộng.", "bad");
  };
  g("tm-now").onclick = () => { g("tm-ts").value = Math.floor(Date.now() / 1000); g("tm-dt").value = ""; g("tm-add").value = ""; tmShow(Date.now()); };

  // mở thẳng bằng #tools (bots.js đã đổi hash trước khi file này nạp xong)
  const baseShow = window.showTab;
  const nav = performance.getEntriesByType("navigation")[0];
  if ((nav ? new URL(nav.name).hash : location.hash) === "#tools") baseShow("tools");
})();
