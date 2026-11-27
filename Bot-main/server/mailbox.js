/**
 * DOC EMAIL BIEN DONG SO DU CUA NGAN HANG QUA IMAP (khong can thu vien ngoai).
 *
 *  Brevo / SMTP chi dung de GUI mail. De DOC mail den thi phai dang nhap hop thu qua IMAP (cong 993, TLS):
 *  Gmail (mat khau ung dung), Outlook, Yahoo, ... Server chi doc (BODY.PEEK, EXAMINE), khong danh dau da doc, khong xoa, khong gui gi.
 *
 *  An toan: email co the bi gia mao, nen chi nhan thu thoa CA HAI dieu kien:
 *   1. dia chi nguoi gui (From) thuoc dung ten mien ngan hang admin khai bao;
 *   2. (mac dinh bat) may chu hop thu da xac thuc DKIM / SPF / DMARC dat cho dung ten mien do
 *      (doc dong Authentication-Results tren cung, do chinh may chu hop thu them vao; Gmail co dong nay).
 *  File nay khong dung CSDL: cau hinh duoc truyen vao tu bankapi.js.
 */
const tls = require("tls");
const crypto = require("crypto");

class MailError extends Error {}

const TIMEOUT_MS = 30000;
const MAX_LITERAL = 3 * 1024 * 1024;
const MAX_BODY = 120000;   // chi tai toi da ngan nay byte dau cua moi thu (du cho phan chu, bo qua anh dinh kem lon)
const SINCE_DAYS = 3;
const MAX_MAILS = 40;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ======================= IMAP toi thieu ======================= */

class Imap {
  constructor(sock) {
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.err = null;
    this.closed = false;
    this.wake = null;
    this.n = 0;
    sock.on("data", (d) => { this.buf = Buffer.concat([this.buf, d]); this._notify(); });
    sock.on("error", (e) => { this.err = e; this._notify(); });
    sock.on("close", () => { this.closed = true; this._notify(); });
  }

  _notify() { const w = this.wake; this.wake = null; if (w) w(); }

  _wait() {
    if (this.err) throw new MailError("Mất kết nối tới máy chủ hộp thư: " + (this.err.code || this.err.message));
    if (this.closed) throw new MailError("Máy chủ hộp thư đã đóng kết nối");
    return new Promise((resolve, reject) => {
      const left = this.deadline - Date.now();
      if (left <= 0) return reject(new MailError("Máy chủ hộp thư trả lời quá chậm"));
      const t = setTimeout(() => { this.wake = null; reject(new MailError("Máy chủ hộp thư trả lời quá chậm")); }, left);
      this.wake = () => { clearTimeout(t); resolve(); };
    });
  }

  async readLine() {
    for (;;) {
      const i = this.buf.indexOf("\r\n");
      if (i >= 0) {
        const line = this.buf.subarray(0, i).toString("latin1");
        this.buf = this.buf.subarray(i + 2);
        return line;
      }
      if (this.buf.length > 1e6) throw new MailError("Máy chủ hộp thư trả về dữ liệu lạ");
      await this._wait();
    }
  }

  async readBytes(n) {
    while (this.buf.length < n) await this._wait();
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }

  /** Doc 1 phan hoi (1 dong, hoac nhieu dong neu co literal {N}). Tra { text, lits } */
  async readItem() {
    let text = "";
    const lits = [];
    for (;;) {
      const line = await this.readLine();
      text += line;
      const m = /\{(\d+)\}$/.exec(line);
      if (!m) return { text, lits };
      const n = Number(m[1]);
      if (n > MAX_LITERAL) throw new MailError("Thư quá lớn");
      lits.push(await this.readBytes(n));
      text += "\u0000"; // cho literal, phan con lai cua dong nam o doan sau
    }
  }

  async command(cmd, secret) {
    const tag = "a" + ++this.n;
    this.deadline = Date.now() + TIMEOUT_MS;
    this.sock.write(`${tag} ${cmd}\r\n`);
    const untagged = [];
    for (;;) {
      const it = await this.readItem();
      if (it.text.startsWith(tag + " ")) {
        const st = it.text.slice(tag.length + 1);
        if (/^OK\b/i.test(st)) return untagged;
        const e = new MailError(st.replace(/^(NO|BAD)\s*/i, ""));
        e.imap = st;
        e.secret = !!secret;
        throw e;
      }
      untagged.push(it);
    }
  }
}

const quote = (s) => {
  s = String(s);
  if (/[^\x20-\x7e]/.test(s)) throw new MailError("Tài khoản hoặc mật khẩu chứa ký tự không hợp lệ");
  return '"' + s.replace(/(["\\])/g, "\\$1") + '"';
};

function connect(cfg) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host, ca: cfg.ca, rejectUnauthorized: true });
    const fail = (e) => {
      clearTimeout(t);
      sock.destroy();
      if (e && /CERT|certificate|self.signed|hostname/i.test(e.code + " " + e.message)) {
        return reject(new MailError("Chứng chỉ SSL của máy chủ hộp thư không hợp lệ. Kiểm tra lại địa chỉ máy chủ IMAP."));
      }
      reject(new MailError("Không kết nối được máy chủ IMAP " + cfg.host + ":" + cfg.port + (e?.code ? " (" + e.code + ")" : "")));
    };
    const t = setTimeout(() => fail(null), 15000);
    sock.once("error", fail);
    sock.once("secureConnect", async () => {
      clearTimeout(t);
      sock.removeListener("error", fail);
      const im = new Imap(sock);
      im.deadline = Date.now() + TIMEOUT_MS;
      try {
        const g = await im.readItem(); // loi chao "* OK ..."
        if (!/^\* (OK|PREAUTH)/i.test(g.text)) throw new MailError("Máy chủ không phải IMAP");
        resolve(im);
      } catch (e) { sock.destroy(); reject(e); }
    });
  });
}

function loginError(e) {
  const s = String(e.imap || e.message);
  if (/application-specific|app.?password|web login required|less secure/i.test(s)) {
    return new MailError("Máy chủ yêu cầu mật khẩu ứng dụng (Gmail: bật xác minh 2 bước rồi tạo mật khẩu ứng dụng) và phải bật IMAP trong cài đặt hộp thư.");
  }
  if (/AUTHENTICATIONFAILED|invalid credentials|login failed|authentication failed|incorrect|wrong/i.test(s)) {
    return new MailError("Sai email hoặc mật khẩu ứng dụng của hộp thư.");
  }
  return new MailError("Đăng nhập hộp thư thất bại: " + s.slice(0, 120));
}

/* ======================= MIME ======================= */

function splitHead(buf) {
  let i = buf.indexOf("\r\n\r\n"), skip = 4;
  const j = buf.indexOf("\n\n");
  if (i < 0 || (j >= 0 && j < i)) { i = j; skip = 2; }
  if (i < 0) return { head: buf.toString("latin1"), body: Buffer.alloc(0) };
  return { head: buf.subarray(0, i).toString("latin1"), body: buf.subarray(i + skip) };
}

/** Map ten-header-viet-thuong -> mang gia tri, theo thu tu xuat hien (phan tu dau = dong tren cung) */
function parseHeaders(head) {
  const h = new Map();
  for (const l of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const m = /^([!-9;-~]+):\s*(.*)$/.exec(l);
    if (!m) continue;
    const k = m[1].toLowerCase();
    if (!h.has(k)) h.set(k, []);
    h.get(k).push(m[2]);
  }
  return h;
}
const first = (h, k) => (h.get(k) || [])[0] || "";

function parseParams(v) {
  v = String(v || "");
  const p = {};
  for (const m of v.matchAll(/;\s*([\w*-]+)\s*=\s*(?:"([^"]*)"|([^;\s]+))/g)) p[m[1].toLowerCase()] = m[2] ?? m[3];
  return { type: v.split(";")[0].trim().toLowerCase(), p };
}

function qpDecode(buf) {
  const s = buf.toString("latin1").replace(/=\r?\n/g, "");
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) { out.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
    else out.push(s.charCodeAt(i) & 255);
  }
  return Buffer.from(out);
}

function decodeBody(buf, cte) {
  cte = String(cte || "").trim().toLowerCase();
  if (cte === "base64") return Buffer.from(buf.toString("latin1").replace(/[^A-Za-z0-9+/]/g, ""), "base64");
  if (cte === "quoted-printable") return qpDecode(buf);
  return buf;
}

function decodeText(buf, charset) {
  try { return new TextDecoder(String(charset || "utf-8").replace(/^"|"$/g, "")).decode(buf); }
  catch (_) { return buf.toString("utf8"); }
}

const ENT = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function htmlToText(h) {
  return String(h || "")
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch (_) { return " "; } }
      return ENT[e.toLowerCase()] ?? " ";
    });
}

/** Di qua cay MIME, gom phan chu (text/plain, text/html), bo qua tep dinh kem */
function walk(headers, body, out, depth) {
  if (depth > 6) return;
  const ct = parseParams(first(headers, "content-type") || "text/plain");
  if (/^attachment/i.test(first(headers, "content-disposition"))) return;
  if (ct.type.startsWith("multipart/") && ct.p.boundary) {
    const s = "\n" + body.toString("latin1").replace(/\r\n/g, "\n");
    const parts = s.split("\n--" + ct.p.boundary).slice(1);
    for (const part of parts) {
      if (part.startsWith("--")) break; // dong dong
      const nl = part.indexOf("\n");
      const { head, body: b } = splitHead(Buffer.from(nl < 0 ? "" : part.slice(nl + 1), "latin1"));
      walk(parseHeaders(head), b, out, depth + 1);
    }
    return;
  }
  if (ct.type !== "text/plain" && ct.type !== "text/html") return;
  const text = decodeText(decodeBody(body, first(headers, "content-transfer-encoding")), ct.p.charset);
  if (ct.type === "text/html") out.html += "\n" + text; else out.plain += "\n" + text;
}

/* ======================= Doc noi dung thu ngan hang ======================= */

/** "1.000.000", "1,000,000", "1,000,000.00", "500000" -> so nguyen VND */
function parseVnd(s) {
  s = String(s || "").trim().replace(/[.,]+$/, "");
  let m = /^(\d{1,3}(?:[.,]\d{3})+)(?:[.,]\d{1,2})?$/.exec(s); // nhom nghin (+ phan thap phan neu co)
  if (m) return Number(m[1].replace(/[.,]/g, ""));
  if (/^\d+$/.test(s)) return Number(s);
  m = /^(\d+)[.,]\d{1,2}$/.exec(s);
  return m ? Number(m[1]) : 0;
}

const CUR = "(?:VND|VNĐ|vnd|đ|₫)";

/** Tim so tien va huong (vao/ra) trong noi dung thu. Khong chac thi KHONG coi la tien vao. */
function findAmount(text) {
  const t = String(text || "").replace(/[\u00a0\u202f]/g, " ");
  // 1) So tien co dau + / - ngay truoc, kem don vi tien: "+1,000,000 VND"
  const sg = new RegExp(`(?:^|[^\\w.,])([+\\-−–])\\s*(\\d[\\d.,]*)\\s*${CUR}`, "mi").exec(t);
  if (sg) {
    const v = parseVnd(sg[2]);
    return sg[1] === "+" ? { credit: v, debit: 0, how: "dấu +" } : { credit: 0, debit: v, how: "dấu -" };
  }
  // 2) Co nhan "So tien", huong suy ra tu tu khoa
  const lb = new RegExp(`(?:số tiền(?: giao dịch)?|so tien|amount|giá trị)\\s*[:：]?\\s*(\\d[\\d.,]*)\\s*${CUR}?`, "i").exec(t);
  if (lb) {
    const v = parseVnd(lb[1]);
    const cr = /(ghi có|tiền vào|đã nhận|nhận được|credited|\bcredit\b|số dư tăng|\btăng\b)/i.test(t);
    const db = /(ghi nợ|tiền ra|chuyển đi|đã chuyển|debited|\bdebit\b|số dư giảm|\bgiảm\b|\brút\b)/i.test(t);
    if (cr && !db) return { credit: v, debit: 0, how: "từ khoá ghi có" };
    if (db && !cr) return { credit: 0, debit: v, how: "từ khoá ghi nợ" };
  }
  return { credit: 0, debit: 0, how: "" };
}

const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();

function contentLine(text) {
  const m = /(?:nội dung(?: giao dịch| chuyển khoản)?|noi dung|mô tả|description|remarks?|content|details?)\s*[:：]?\s*([^\n]{3,250})/i.exec(text);
  return oneLine(m ? m[1] : text).slice(0, 200);
}

const addrOf = (from) => {
  const m = /<([^>]+)>/.exec(from) || /([^\s<>"]+@[^\s<>"]+)/.exec(from);
  return (m ? m[1] : "").trim().toLowerCase();
};

/** Ten mien nguoi gui admin khai bao: "techcombank.com.vn", "@techcombank.com.vn" hoac "info@techcombank.com.vn" */
const domainOf = (s) => String(s || "").trim().toLowerCase().replace(/^.*@/, "");

function senderOk(from, cfgFrom) {
  const a = addrOf(from);
  if (!a) return false;
  const want = String(cfgFrom || "").trim().toLowerCase();
  if (/^[^@\s]+@/.test(want)) return a === want;
  const D = domainOf(want), ad = a.split("@")[1] || "";
  return !!D && (ad === D || ad.endsWith("." + D));
}

/** Dong Authentication-Results tren cung (do may chu hop thu cua minh them) co dat cho ten mien nguoi gui khong */
function authOk(headers, cfgFrom) {
  const ar = first(headers, "authentication-results");
  if (!ar) return { ok: false, why: "Thư không có kết quả xác thực DKIM/SPF (máy chủ hộp thư không thêm Authentication-Results). Gmail có dòng này; nếu hộp thư của bạn không có, tắt \"kiểm tra xác thực\" nhưng sẽ kém an toàn." };
  const D = domainOf(cfgFrom);
  const al = (x) => { x = String(x || "").toLowerCase().replace(/^.*@/, ""); return !!x && (x === D || x.endsWith("." + D)); };
  for (const seg of ar.split(";").slice(1)) {
    const m = /^\s*(dkim|spf|dmarc)\s*=\s*pass\b/i.exec(seg);
    if (!m) continue;
    const get = (k) => (new RegExp("\\b" + k + "\\s*=\\s*([^\\s;()]+)", "i").exec(seg) || [])[1];
    const kind = m[1].toLowerCase();
    if (kind === "dkim" && (al(get("header\\.d")) || al(get("header\\.i")))) return { ok: true };
    if (kind === "dmarc" && al(get("header\\.from"))) return { ok: true };
    if (kind === "spf" && al(get("smtp\\.mailfrom"))) return { ok: true };
  }
  return { ok: false, why: "Thư không qua kiểm tra DKIM/SPF/DMARC của " + D + " (nghi giả mạo)" };
}

/**
 * Doi 1 thu tho thanh { extId, amount, debit, content, search, date, rejected?, skip? }.
 * amount > 0 chi khi: dung nguoi gui, dat xac thuc, la thu tien VAO.
 */
function parseBankMail(raw, uid, uidv, cfg) {
  const { head, body } = splitHead(raw);
  const h = parseHeaders(head);
  const mid = first(h, "message-id").trim();
  const extId = "mail:" + crypto.createHash("sha1").update(mid || `${uidv}:${uid}`).digest("hex").slice(0, 24);
  const d = new Date(first(h, "date"));
  const date = Number.isNaN(d.getTime()) ? "" : d.toISOString();
  const res = { extId, amount: 0, debit: 0, content: "", search: "", date };

  const out = { plain: "", html: "" };
  walk(h, body, out, 0);
  const fromHtml = htmlToText(out.html);
  const text = out.plain.trim().length >= 20 ? out.plain : fromHtml;
  res.content = contentLine(text) || "(thư không có chữ)";
  res.search = oneLine(text + " " + (text === fromHtml ? "" : fromHtml)).slice(0, 4000);

  if (!senderOk(first(h, "from"), cfg.from)) { res.rejected = "Người gửi không phải " + cfg.from; return res; }
  if (cfg.strict !== false) {
    const a = authOk(h, cfg.from);
    if (!a.ok) { res.rejected = a.why; return res; }
  }
  let amt = findAmount(text);
  if (!amt.credit && !amt.debit && text !== fromHtml) amt = findAmount(fromHtml);
  if (amt.credit > 0 && amt.credit <= 1e9) res.amount = amt.credit;
  else if (amt.debit > 0) { res.debit = amt.debit; res.skip = "Tiền ra, bỏ qua"; }
  else res.skip = "Không đọc được số tiền vào trong thư này";
  return res;
}

/* ======================= Lay thu ======================= */

/**
 * Dang nhap, tim thu cua ngan hang trong SINCE_DAYS ngay gan nhat, tai nhung thu chua doc va doi thanh giao dich.
 * state: doi tuong giu giua cac lan goi ({ sig, uidv, map }) de khong tai lai thu da doc.
 * Tra ve mang moi nhat truoc.
 */
async function fetchBankMails(cfg, state) {
  const sig = [cfg.host, cfg.port, cfg.user, cfg.from, cfg.strict].join("|");
  if (state.sig !== sig) { state.sig = sig; state.uidv = null; state.map = new Map(); }

  const im = await connect(cfg);
  try {
    try { await im.command(`LOGIN ${quote(cfg.user)} ${quote(cfg.pass)}`, true); } catch (e) {
      if (e instanceof MailError && e.imap !== undefined) throw loginError(e);
      throw e;
    }
    const sel = await im.command("EXAMINE INBOX"); // chi doc
    const uv = /\[UIDVALIDITY (\d+)\]/i.exec(sel.map((x) => x.text).join("\n"));
    const uidv = uv ? uv[1] : "0";
    if (state.uidv !== uidv) { state.uidv = uidv; state.map = new Map(); }

    const d = new Date(Date.now() - SINCE_DAYS * 86400e3);
    const since = `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
    const sr = await im.command(`UID SEARCH SINCE ${since} FROM ${quote(cfg.from)}`);
    const uids = sr.flatMap((x) => (/^\* SEARCH\b(.*)$/i.exec(x.text)?.[1] || "").split(/\s+/).filter(Boolean).map(Number))
      .filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => b - a).slice(0, MAX_MAILS);

    const keep = new Map();
    const need = [];
    for (const u of uids) { const c = state.map.get(u); if (c) keep.set(u, c); else need.push(u); }

    for (let i = 0; i < need.length; i += 10) {
      const batch = need.slice(i, i + 10);
      const fr = await im.command(`UID FETCH ${batch.join(",")} (UID BODY.PEEK[]<0.${MAX_BODY}>)`);
      for (const it of fr) {
        const um = /\bUID (\d+)/i.exec(it.text);
        if (!um || !it.lits.length) continue;
        const u = Number(um[1]);
        keep.set(u, parseBankMail(it.lits[0], u, uidv, cfg));
      }
    }
    state.map = keep;
    try { await im.command("LOGOUT"); } catch (_) {}
    return uids.map((u) => keep.get(u)).filter(Boolean);
  } finally {
    im.sock.destroy();
  }
}

module.exports = { fetchBankMails, parseBankMail, findAmount, parseVnd, htmlToText, senderOk, authOk, MailError };
