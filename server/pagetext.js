/**
 * LẤY VĂN BẢN TỪ LINK
 *
 * Cho trang web chặn bôi đen/sao chép: người dùng dán link, máy chủ tải trang về, lọc bỏ mã/menu/quảng cáo
 * và trả lại phần chữ để sao chép. Máy chủ chỉ tải được trang công khai (không đăng nhập, không chạy JavaScript).
 *
 * BẢO VỆ (rất quan trọng vì máy chủ tự tải link do người dùng nhập):
 *  - Chỉ http/https, cổng 80/443, không cho user:pass@ trong link.
 *  - Chặn mọi địa chỉ nội bộ/loopback/link-local/mạng riêng (kể cả khi tên miền trỏ vào đó hoặc chuyển hướng tới đó).
 *    Địa chỉ được kiểm tra đúng lúc kết nối nên không bị lừa bằng DNS rebinding.
 *  - Giới hạn 2 MB, 5 lần chuyển hướng, 12 giây, 15 lượt/phút/tài khoản.
 */

const http = require("http");
const https = require("https");
const dns = require("dns");
const net = require("net");
const zlib = require("zlib");

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 12000;
const TOTAL_MS = 20000;
const MAX_TEXT = 200000;
const LIMIT_PER_MIN = 15;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/* ---------- chặn địa chỉ nội bộ ---------- */

const blocked = new net.BlockList();
[
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
].forEach(([a, p]) => blocked.addSubnet(a, p, "ipv4"));
[
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32],
  ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
].forEach(([a, p]) => blocked.addSubnet(a, p, "ipv6"));

function isPrivateIp(ip) {
  ip = String(ip).replace(/^\[|\]$/g, "").split("%")[0];
  const fam = net.isIP(ip);
  if (!fam) return true; // không phải IP hợp lệ -> coi như không an toàn
  if (fam === 6) {
    // IPv4 nhúng trong IPv6 (::ffff:127.0.0.1 hoặc ::ffff:7f00:1): đổi về IPv4 rồi kiểm tra như IPv4
    let canon = ip;
    try { canon = new URL("http://[" + ip + "]/").hostname.replace(/^\[|\]$/g, ""); } catch { return true; }
    const m = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(canon);
    if (m) {
      const hi = parseInt(m[1], 16), lo = parseInt(m[2], 16);
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
  }
  return blocked.check(ip, fam === 4 ? "ipv4" : "ipv6");
}

/** Hàm tra DNS dùng cho chính kết nối: từ chối nếu bất kỳ địa chỉ nào là nội bộ. */
function safeLookup(hostname, opts, cb) {
  if (typeof opts === "function") { cb = opts; opts = {}; }
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs || !addrs.length) return cb(Object.assign(new Error("Không phân giải được tên miền"), { code: "ENOTFOUND" }));
    if (addrs.some((a) => isPrivateIp(a.address))) return cb(Object.assign(new Error("Địa chỉ nội bộ bị chặn"), { code: "EBLOCKED" }));
    if (opts && opts.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}

/* ---------- tải trang ---------- */

function parseTarget(raw, opts = {}) {
  let s = String(raw || "").trim();
  if (!s) throw Object.assign(new Error("Hãy dán link của trang cần lấy chữ."), { code: "BAD" });
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "https://" + s;
  let u;
  try { u = new URL(s); } catch { throw Object.assign(new Error("Link không hợp lệ."), { code: "BAD" }); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw Object.assign(new Error("Chỉ hỗ trợ link http hoặc https."), { code: "BAD" });
  if (u.username || u.password) throw Object.assign(new Error("Link không được chứa tên đăng nhập."), { code: "BAD" });
  if (opts.allowPrivate) return u; // chỉ để kiểm thử, route không bao giờ bật
  const port = u.port || (u.protocol === "https:" ? "443" : "80");
  if (port !== "80" && port !== "443") throw Object.assign(new Error("Chỉ hỗ trợ cổng web thông thường (80 hoặc 443)."), { code: "BAD" });
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw Object.assign(new Error("Địa chỉ nội bộ không được phép."), { code: "EBLOCKED" });
  }
  if (net.isIP(host) && isPrivateIp(host)) throw Object.assign(new Error("Địa chỉ nội bộ không được phép."), { code: "EBLOCKED" });
  return u;
}

function requestOnce(u, allowPrivate) {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request({
      protocol: u.protocol,
      hostname: u.hostname.replace(/^\[|\]$/g, ""),
      port: u.port || undefined,
      path: u.pathname + u.search,
      method: "GET",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "Accept-Language": "vi,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
      },
      lookup: allowPrivate ? undefined : safeLookup,
      timeout: TIMEOUT_MS,
    }, resolve);
    req.on("timeout", () => req.destroy(Object.assign(new Error("Hết thời gian chờ"), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    req.end();
  });
}

function readBody(res) {
  return new Promise((resolve, reject) => {
    const enc = String(res.headers["content-encoding"] || "").toLowerCase();
    let stream = res;
    if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
    else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
    else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
    const chunks = [];
    let n = 0, done = false;
    const finish = (truncated) => { if (!done) { done = true; resolve({ buf: Buffer.concat(chunks), truncated }); } };
    stream.on("data", (c) => {
      if (done) return;
      n += c.length;
      if (n > MAX_BYTES) { res.destroy(); stream.destroy(); return finish(true); } // giới hạn dung lượng sau khi giải nén
      chunks.push(c);
    });
    stream.on("end", () => finish(false));
    stream.on("error", (e) => { if (!done) { done = true; reject(e); } });
    res.on("error", (e) => { if (!done) { done = true; reject(e); } });
  });
}

function decodeBody(buf, contentType) {
  let label = (/charset\s*=\s*["']?([\w-]+)/i.exec(contentType || "") || [])[1];
  if (!label) {
    const head = buf.subarray(0, 4096).toString("latin1");
    label = (/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head) || [])[1];
  }
  try { return new TextDecoder(label || "utf-8").decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}

async function fetchPage(rawUrl, opts = {}) {
  const run = async () => {
    let u = parseTarget(rawUrl, opts);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await requestOnce(u, !!opts.allowPrivate);
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        if (hop === MAX_REDIRECTS) throw Object.assign(new Error("Link chuyển hướng quá nhiều lần."), { code: "BAD" });
        let next;
        try { next = new URL(res.headers.location, u).href; } catch { throw Object.assign(new Error("Link chuyển hướng không hợp lệ."), { code: "BAD" }); }
        u = parseTarget(next, opts); // kiểm tra lại từng chặng
        continue;
      }
      if (code >= 400) { res.resume(); throw Object.assign(new Error("HTTP " + code), { code: "HTTP", status: code }); }
      const type = String(res.headers["content-type"] || "").toLowerCase();
      if (type && !/^(text\/html|application\/xhtml\+xml|text\/plain)/.test(type)) {
        res.resume();
        throw Object.assign(new Error("Link này không phải trang web chứa chữ (loại: " + type.split(";")[0] + ")."), { code: "BAD" });
      }
      const { buf, truncated } = await readBody(res);
      return { url: u.href, html: decodeBody(buf, type), plain: type.startsWith("text/plain"), truncated };
    }
  };
  let timer;
  try {
    return await Promise.race([run(), new Promise((_, no) => { timer = setTimeout(() => no(Object.assign(new Error("Hết thời gian chờ"), { code: "ETIMEDOUT" })), TOTAL_MS); })]);
  } finally { clearTimeout(timer); }
}

/* ---------- HTML -> chữ ---------- */

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", copy: "©", reg: "®", bull: "•", middot: "·" };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m; } catch { return m; }
    }
    const v = ENT[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function removeTags(html, tags) {
  for (const t of tags) html = html.replace(new RegExp(`<${t}\\b[^>]*>[\\s\\S]*?<\\/${t}\\s*>`, "gi"), " ");
  return html;
}

function toText(html) {
  let s = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|blockquote|pre|ul|ol|table|figure|h[1-6]|tr|dl|details|header|footer|main|aside|nav|form|fieldset|address)\s*>/gi, "\n\n")
    .replace(/<\/(?:li|dd|dt|figcaption|caption|summary)\s*>/gi, "\n")
    .replace(/<\/(?:td|th)\s*>/gi, "  ")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<(?:p|div|section|article|blockquote|pre|ul|ol|table|h[1-6]|tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  const lines = s.split(/\r?\n/).map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim());
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** mode: "main" = chỉ phần nội dung chính; "all" = cả trang */
function htmlToText(html, mode = "main", plain = false) {
  if (plain) return { title: "", text: String(html).replace(/\r\n/g, "\n").trim() };
  const title = decodeEntities(
    ((/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html) || [])[1]) ||
    ((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1]) || ""
  ).replace(/\s+/g, " ").trim();

  let h = html.replace(/<!--[\s\S]*?-->/g, "");
  const body = (/<body\b[^>]*>([\s\S]*)<\/body\s*>/i.exec(h) || [null, h])[1];
  let clean = removeTags(body, ["script", "style", "noscript", "svg", "template", "iframe", "object", "embed", "canvas", "select", "button", "textarea", "dialog"]);

  if (mode === "main") {
    const pick = (tag) => {
      let best = "";
      for (const m of clean.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, "gi"))) {
        const t = toText(m[1]);
        if (t.length > best.length) best = t;
      }
      return best;
    };
    const whole = toText(removeTags(clean, ["nav", "header", "footer", "aside", "form"]));
    const art = pick("article"), mainEl = pick("main");
    const cand = art.length >= mainEl.length ? art : mainEl;
    if (cand.length >= 300 && cand.length >= whole.length * 0.3) return { title, text: cand };
    return { title, text: whole };
  }
  return { title, text: toText(clean) };
}

/* ---------- route ---------- */

const hits = new Map();
function allow(userId) {
  const now = Date.now();
  let h = hits.get(userId);
  if (!h || now > h.reset) { h = { n: 0, reset: now + 60000 }; hits.set(userId, h); }
  h.n++;
  if (hits.size > 5000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
  return h.n <= LIMIT_PER_MIN;
}

function explain(e) {
  if (e.code === "BAD" || e.code === "EBLOCKED") return e.message;
  if (e.code === "HTTP") {
    const s = e.status;
    if (s === 401 || s === 403) return "Trang này chặn truy cập tự động hoặc cần đăng nhập (HTTP " + s + "). Máy chủ không lấy được nội dung. Hãy thử Cách 2 ở bên dưới.";
    if (s === 404 || s === 410) return "Không tìm thấy trang này (HTTP " + s + ").";
    if (s === 429) return "Trang này đang giới hạn lượt truy cập (HTTP 429), thử lại sau.";
    return "Trang trả về lỗi (HTTP " + s + ").";
  }
  if (e.code === "ENOTFOUND" || e.code === "EAI_AGAIN") return "Không tìm thấy tên miền này.";
  if (e.code === "ETIMEDOUT" || e.code === "ECONNRESET" || e.code === "ECONNREFUSED") return "Không kết nối được tới trang hoặc trang phản hồi quá chậm.";
  if (/certificate|SSL|TLS/i.test(String(e.message))) return "Trang có chứng chỉ bảo mật không hợp lệ.";
  return "Không tải được trang này.";
}

function register(router) {
  router.post("/pagetext", async (req, res) => {
    try {
      if (!allow(req.user.id)) return res.status(429).json({ error: "Bạn thao tác quá nhanh, đợi một chút rồi thử lại." });
      const mode = req.body?.mode === "all" ? "all" : "main";
      const page = await fetchPage(req.body?.url);
      const out = htmlToText(page.html, mode, page.plain);
      let text = out.text, truncated = page.truncated;
      if (text.length > MAX_TEXT) { text = text.slice(0, MAX_TEXT); truncated = true; }
      let note = "";
      if (text.length < 200) note = "Trang có rất ít chữ. Có thể nội dung được nạp bằng JavaScript hoặc cần đăng nhập, máy chủ không lấy được.";
      else if (truncated) note = "Trang rất dài nên chỉ lấy phần đầu.";
      res.json({ title: out.title, url: page.url, text, chars: text.length, words: (text.match(/\S+/g) || []).length, note });
    } catch (e) {
      res.status(e.code === "BAD" || e.code === "EBLOCKED" ? 400 : 502).json({ error: explain(e) });
    }
  });
}

module.exports = { register, _test: { isPrivateIp, parseTarget, fetchPage, htmlToText, decodeEntities } };
