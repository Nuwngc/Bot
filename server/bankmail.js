/**
 * DOC EMAIL BAO BIEN DONG SO DU CUA NGAN HANG
 *
 *  1. parseMime(buf): tach email tho thanh header + van ban (xu ly multipart, base64, quoted-printable, HTML, tieu de ma hoa).
 *  2. senderOk(...): chi tin email tu dung dia chi / ten mien ngan hang, va (che do chat) phai co xac thuc DKIM/SPF dat
 *     do may chu thu ghi nhan. Chong nguoi la gui email gia "+10.000.000 NAPxxxx" vao hop thu.
 *  3. parseBankMail(...): lay SO TIEN VAO va chi nhan email tien vao. Email tien ra / khong hieu duoc thi bo qua.
 *
 *  Moi ngan hang viet email mot kieu, nen bo doc dung cac cum tu chung (+, "tang", "ghi co", "so tien"...).
 *  Admin co nut "Thu doc email gan nhat" de xem server hieu dung chua truoc khi bat tu dong.
 */

/* ---------- MIME ---------- */

function splitHeaderBody(raw) {
  const m = /\r?\n\r?\n/.exec(raw);
  return m ? [raw.slice(0, m.index), raw.slice(m.index + m[0].length)] : [raw, ""];
}

function parseHeaders(block) {
  const h = {};
  for (const line of block.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i < 1) continue;
    (h[line.slice(0, i).trim().toLowerCase()] ||= []).push(line.slice(i + 1).trim());
  }
  return h;
}

const paramOf = (value, name) => {
  const m = new RegExp(`;\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, "i").exec(value || "");
  return m ? m[1] ?? m[2] : "";
};

function qpToBuffer(s) {
  s = s.replace(/=\r?\n/g, "");
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(s.charCodeAt(i) & 0xff);
  }
  return Buffer.from(out);
}

function bytesToText(buf, charset) {
  try { return new TextDecoder((charset || "utf-8").toLowerCase()).decode(buf); }
  catch (_) { return buf.toString("utf8"); }
}

function decodeBody(body, encoding, charset) {
  const enc = String(encoding || "").toLowerCase();
  let buf;
  if (enc === "base64") buf = Buffer.from(body.replace(/[^A-Za-z0-9+/=]/g, ""), "base64");
  else if (enc === "quoted-printable") buf = qpToBuffer(body);
  else buf = Buffer.from(body, "latin1");
  return bytesToText(buf, charset);
}

/** Tieu de dang =?utf-8?B?...?= hoac =?utf-8?Q?...?= */
function decodeWords(s) {
  return String(s || "")
    .replace(/(\?=)\s+(=\?)/g, "$1$2")
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs, kind, data) => {
      try {
        const buf = kind.toUpperCase() === "B" ? Buffer.from(data, "base64") : qpToBuffer(data.replace(/_/g, " "));
        return bytesToText(buf, cs);
      } catch (_) { return data; }
    });
}

function htmlToText(html) {
  const ent = (n) => { try { return String.fromCodePoint(n); } catch (_) { return " "; } };
  return String(html)
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table)>/gi, "\n")
    .replace(/<\/(td|th)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => ent(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => ent(parseInt(n, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function walk(raw, out, depth) {
  if (depth > 6) return;
  const [hb, body] = splitHeaderBody(raw);
  const h = parseHeaders(hb);
  const ctRaw = (h["content-type"] || ["text/plain"])[0];
  const ct = ctRaw.toLowerCase();

  if (ct.startsWith("multipart/")) {
    const boundary = paramOf(ctRaw, "boundary");
    if (!boundary) return;
    const esc = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pieces = body.split(new RegExp(`(?:^|\\r?\\n)--${esc}(--)?[ \\t]*(?=\\r?\\n|$)`));
    // pieces = [preamble, closing?, part1, closing?, part2, ...]
    for (let i = 1; i < pieces.length; i += 2) {
      const closing = pieces[i];
      const part = pieces[i + 1];
      if (part !== undefined) walk(part.replace(/^\r?\n/, ""), out, depth + 1);
      if (closing === "--") break;
    }
    return;
  }
  if (/^attachment/i.test((h["content-disposition"] || [""])[0])) return;
  const isHtml = ct.startsWith("text/html");
  if (!isHtml && !ct.startsWith("text/plain")) return;
  const text = decodeBody(body, (h["content-transfer-encoding"] || [""])[0], paramOf(ctRaw, "charset"));
  (isHtml ? out.html : out.plain).push(text);
}

/** buf: Buffer email tho. Tra ve { headers, from, subject, date, messageId, text } */
function parseMime(buf) {
  const raw = Buffer.isBuffer(buf) ? buf.toString("latin1") : String(buf);
  const [hb] = splitHeaderBody(raw);
  const headers = parseHeaders(hb);
  const out = { plain: [], html: [] };
  walk(raw, out, 0);
  const plain = out.plain.join("\n").trim();
  const text = plain || htmlToText(out.html.join("\n"));
  const first = (k) => decodeWords((headers[k] || [""])[0]);
  const fromRaw = first("from");
  const addr = (/<([^>]+)>/.exec(fromRaw)?.[1] || fromRaw).trim().toLowerCase();
  return {
    headers,
    from: addr,
    subject: first("subject"),
    date: first("date"),
    messageId: ((headers["message-id"] || [""])[0] || "").replace(/[<>\s]/g, ""),
    text,
  };
}

/* ---------- Kiem tra nguoi gui ---------- */

/** allowed: "no-reply@bank.com.vn" (dung dia chi) hoac "bank.com.vn" (ca ten mien va ten mien con) */
function addressMatches(addr, allowed) {
  addr = String(addr || "").toLowerCase();
  allowed = String(allowed || "").trim().toLowerCase();
  if (!addr || !allowed) return false;
  if (allowed.includes("@")) return addr === allowed;
  return addr.endsWith("@" + allowed) || addr.endsWith("." + allowed);
}

/** May chu thu (vd Gmail) ghi "dkim=pass header.d=bank.com.vn" / "spf=pass smtp.mailfrom=...@bank.com.vn" */
function authPassed(headers, allowed) {
  const domain = String(allowed || "").toLowerCase().split("@").pop();
  if (!domain) return false;
  for (const line of headers["authentication-results"] || []) {
    for (const part of String(line).toLowerCase().split(";")) {
      if (/\b(dkim|spf)=pass\b/.test(part) && part.includes(domain)) return true;
    }
  }
  return false;
}

/* ---------- Doc so tien ---------- */

const plainText = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** "1,250,000" | "1.250.000" | "1,250,000.00" | "50000" -> so nguyen (VND) */
function parseVnd(str) {
  let s = String(str).trim();
  if (/^\d{1,3}([.,]\d{3})+[.,]\d{1,2}$/.test(s)) s = s.replace(/[.,]\d{1,2}$/, "");
  s = s.replace(/[.,]/g, "");
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : NaN;
}

const NUM = "(\\d[\\d.,]*\\d|\\d)";
const UNIT = "(?:vnd|d)\\b";
const AMOUNT_RES = [
  new RegExp(`\\+\\s*${NUM}\\s*${UNIT}`),
  new RegExp(`(?:so tien(?: giao dich| ghi co)?|amount|tang|ghi co|credit(?:ed)?(?: amount)?|\\+)\\s*[:=]?\\s*\\+?\\s*${NUM}\\s*${UNIT}`),
  // Khong co don vi tien: chi nhan so co dau phan cach hang nghin (tranh nham voi so tai khoan, so tham chieu)
  new RegExp(`(?:so tien(?: giao dich| ghi co)?|amount|tang|ghi co|credit(?:ed)?(?: amount)?)\\s*[:=]?\\s*\\+?\\s*(\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?)(?![\\d.,]*\\d)`),
];
const CREDIT_RE = /(\+\s*\d)|\b(tang|ghi co|credit(?:ed)?|cong tien|nhan tien|nhan duoc|chuyen den|tien vao|incoming|received)\b/;
const DEBIT_RE = /\b(ghi no|debit(?:ed)?|rut tien|chuyen di)\b|\bgiam\s*:?\s*-?\s*\d|-\s*\d[\d.,]*\s*(?:vnd|d)\b/;

/** Dong "Noi dung" de hien thi (neu tim thay), khong thi dau van ban */
function pickContent(text) {
  for (const line of String(text).split(/\n/)) {
    if (/^\s*(noi dung|noi dung giao dich|mo ta|loi nhan|description|content|details?)\s*[:：-]/.test(plainText(line))) {
      const v = line.slice(line.search(/[:：]|\s-\s|-/) + 1).trim();
      if (v) return v;
    }
  }
  return String(text).replace(/\s+/g, " ").slice(0, 200);
}

/**
 * msg: ket qua parseMime. Tra ve:
 *   { kind: "credit", amount, content }                 tien vao doc duoc
 *   { kind: "other" }                                   khong phai tien vao (tien ra, quang cao...)
 *   { kind: "unreadable", why }                         giong tien vao nhung khong doc duoc so tien
 */
function parseBankMail(msg) {
  const full = `${msg.subject}\n${msg.text}`;
  const norm = plainText(full);
  const isCredit = CREDIT_RE.test(norm);
  const isDebit = DEBIT_RE.test(norm);
  if (!isCredit) return { kind: "other" };
  if (isDebit && !/\+\s*\d/.test(norm)) return { kind: "other" }; // chi tin la tien vao khi co dau +, neu co tu khoa tien ra
  let amount = NaN;
  for (const re of AMOUNT_RES) {
    const m = re.exec(norm);
    if (m) { amount = parseVnd(m[1]); if (amount > 0) break; }
  }
  if (!(amount > 0)) return { kind: "unreadable", why: "Không tìm thấy số tiền trong email" };
  if (amount > 1e10) return { kind: "unreadable", why: "Số tiền bất thường" };
  return { kind: "credit", amount, content: pickContent(msg.text) };
}

module.exports = { parseMime, parseBankMail, addressMatches, authPassed, parseVnd, htmlToText, decodeWords, plainText };
