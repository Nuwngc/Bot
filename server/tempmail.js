/**
 * MAIL 5 PHUT: email tam thoi tu xoa sau 5 phut (nhan ma xac nhan khi tao tai khoan phu).
 *
 * Render chi nhan HTTP, khong nhan duoc thu gui toi (khong mo duoc cong SMTP), nen dung dich vu cong khai
 * mail.tm (doi bang bien moi truong TEMPMAIL_API). Mat khau + token cua hop thu chi nam trong bo nho server,
 * KHONG gui ve trinh duyet. Noi dung thu tra ve dang van ban; giao dien phai hien bang textContent (khong innerHTML).
 */
const crypto = require("crypto");

const API = (process.env.TEMPMAIL_API || "https://api.mail.tm").replace(/\/$/, "");
const TTL = Number(process.env.TEMPMAIL_TTL_MS) || 5 * 60 * 1000;   // moi lan: 5 phut
const MAX_TOTAL = TTL * 4;                                           // gia han toi da: 20 phut
const DAILY_LIMIT = Number(process.env.TEMPMAIL_DAILY) || 10;         // so hop thu moi / nguoi / ngay
const MAX_BOXES = 300;
const CACHE_MS = Number(process.env.TEMPMAIL_CACHE_MS ?? 3000);

const boxes = new Map(); // userId -> hop thu dang dung
const daily = new Map(); // userId -> { day, n }

class MailError extends Error {}

async function http(method, path, { token, body } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: { accept: "application/json", "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
  } catch (_) {
    throw new MailError("Dịch vụ email tạm đang không kết nối được. Thử lại sau ít phút.");
  }
  const txt = await res.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch (_) {}
  if (!res.ok) {
    if (res.status === 429) throw new MailError("Dịch vụ email tạm đang quá tải. Thử lại sau ít giây.");
    const e = new MailError(res.status >= 500 ? "Dịch vụ email tạm đang bận. Thử lại sau." : "Dịch vụ email tạm từ chối yêu cầu.");
    e.status = res.status;
    throw e;
  }
  return data;
}
const members = (d) => (Array.isArray(d) ? d : (d && (d["hydra:member"] || d.member)) || []);

/* ---------- ten mien ---------- */
let domCache = { at: 0, list: [] };
async function pickDomain() {
  if (!domCache.list.length || Date.now() - domCache.at > 10 * 60 * 1000) {
    const list = members(await http("GET", "/domains")).filter((x) => x.isActive !== false && !x.isPrivate).map((x) => x.domain).filter(Boolean);
    if (!list.length) throw new MailError("Dịch vụ email tạm chưa có tên miền khả dụng.");
    domCache = { at: Date.now(), list };
  }
  return domCache.list[crypto.randomInt(domCache.list.length)];
}

/* ---------- vong doi hop thu ---------- */
const today = () => new Date().toISOString().slice(0, 10);
function checkDaily(uid) {
  const d = daily.get(uid);
  if (d && d.day === today() && d.n >= DAILY_LIMIT) throw new MailError(`Mỗi ngày tạo tối đa ${DAILY_LIMIT} hộp thư tạm. Hãy dùng lại hộp thư cũ hoặc thử vào ngày mai.`);
}
function countDaily(uid) {
  const d = daily.get(uid);
  daily.set(uid, d && d.day === today() ? { day: d.day, n: d.n + 1 } : { day: today(), n: 1 });
}

async function destroy(uid) {
  const b = boxes.get(uid);
  if (!b) return;
  boxes.delete(uid);
  clearTimeout(b.timer);
  try { await http("DELETE", `/accounts/${encodeURIComponent(b.id)}`, { token: b.token }); } catch (_) {}
}
function schedule(uid, b) {
  clearTimeout(b.timer);
  b.timer = setTimeout(() => destroy(uid), Math.max(0, b.expiresAt - Date.now()) + 500);
  if (b.timer.unref) b.timer.unref();
}
function getBox(uid) {
  const b = boxes.get(uid);
  if (!b) return null;
  if (b.expiresAt <= Date.now()) { destroy(uid); return null; }
  return b;
}
const view = (b) => ({
  address: b.address,
  secondsLeft: Math.max(0, Math.round((b.expiresAt - Date.now()) / 1000)),
  canExtend: b.expiresAt + TTL - b.createdAt <= MAX_TOTAL,
  ttlMinutes: Math.round(TTL / 60000),
});

async function create(uid) {
  checkDaily(uid);
  if (boxes.size >= MAX_BOXES && !boxes.has(uid)) throw new MailError("Đang có quá nhiều hộp thư tạm, thử lại sau ít phút.");
  await destroy(uid);
  const domain = await pickDomain();
  const address = `u${crypto.randomBytes(5).toString("hex")}@${domain}`;
  const password = crypto.randomBytes(12).toString("base64url");
  const acc = await http("POST", "/accounts", { body: { address, password } });
  const tok = await http("POST", "/token", { body: { address, password } });
  if (!acc || !acc.id || !tok || !tok.token) throw new MailError("Dịch vụ email tạm trả dữ liệu không hợp lệ.");
  const now = Date.now();
  const b = { id: acc.id, address, token: tok.token, createdAt: now, expiresAt: now + TTL, cache: null, cacheAt: 0 };
  boxes.set(uid, b);
  schedule(uid, b);
  countDaily(uid);
  return view(b);
}

function extend(uid) {
  const b = getBox(uid);
  if (!b) throw new MailError("Hộp thư tạm đã hết hạn.");
  if (!view(b).canExtend) throw new MailError(`Đã gia hạn tối đa ${Math.round(MAX_TOTAL / 60000)} phút cho hộp thư này.`);
  b.expiresAt += TTL;
  schedule(uid, b);
  return view(b);
}

/* ---------- thu ---------- */
async function inbox(uid) {
  const b = getBox(uid);
  if (!b) throw new MailError("Chưa có hộp thư tạm hoặc đã hết hạn.");
  if (!b.cache || Date.now() - b.cacheAt > CACHE_MS) {
    const list = members(await http("GET", "/messages?page=1", { token: b.token }));
    b.cache = list.slice(0, 30).map((x) => ({
      id: String(x.id),
      from: (x.from && x.from.address) || "",
      name: (x.from && x.from.name) || "",
      subject: x.subject || "(không có tiêu đề)",
      intro: x.intro || "",
      createdAt: x.createdAt || null,
    }));
    b.cacheAt = Date.now();
  }
  return { box: view(b), messages: b.cache };
}

const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
function htmlToText(h) {
  return String(h || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|h\d|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m])
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function extractCodes(s) {
  const out = [];
  // "... mã xác nhận của bạn là 483920"  (không vượt qua dấu câu hay xuống dòng)
  const after = /(?<![\p{L}])(?:mã|code|otp|xác (?:nhận|minh)|verification|verify|confirm)[^\d.!?\n]{0,25}?(\d{4,8})(?!\d)/giu;
  // "FB-483920 là mã xác nhận của bạn"
  const before = /(?<!\d)(\d{4,8})(?!\d)[^\d.!?\n]{0,16}(?:là mã|is your|là mật khẩu|mã xác|code)/giu;
  for (const re of [before, after]) for (let m; (m = re.exec(s)); ) out.push(m[1]);
  let codes = out.filter((c) => !(c.length === 4 && +c >= 1900 && +c <= 2099)); // bỏ số giống năm
  if (!codes.length) codes = [...s.matchAll(/(?<!\d)\d{6}(?!\d)/g)].map((m) => m[0]);
  return [...new Set(codes)].slice(0, 5);
}
function extractLinks(text, html) {
  const found = [...String(text).matchAll(/https?:\/\/[^\s<>"')\]]+/g)].map((m) => m[0]);
  for (const m of String(html || "").matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)) found.push(m[1].replace(/&amp;/g, "&"));
  return [...new Set(found)].slice(0, 8);
}

async function message(uid, id) {
  const b = getBox(uid);
  if (!b) throw new MailError("Chưa có hộp thư tạm hoặc đã hết hạn.");
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(id))) throw new MailError("Mã thư không hợp lệ.");
  const m = await http("GET", `/messages/${encodeURIComponent(id)}`, { token: b.token });
  const html = Array.isArray(m.html) ? m.html.join("\n") : m.html || "";
  const text = String(m.text || htmlToText(html)).slice(0, 20000);
  return {
    id: String(m.id),
    from: (m.from && m.from.address) || "",
    name: (m.from && m.from.name) || "",
    subject: m.subject || "(không có tiêu đề)",
    createdAt: m.createdAt || null,
    text,
    codes: extractCodes(`${m.subject || ""}\n${text}`),
    links: extractLinks(text, html),
  };
}

/* ---------- route ---------- */
function register(router, auth) {
  const run = (fn) => async (req, res) => {
    try { res.json({ ok: true, ...(await fn(req)) }); }
    catch (e) { res.status(e instanceof MailError ? (/quá nhiều|quá tải|tối đa/.test(e.message) ? 429 : 503) : 500).json({ error: e instanceof MailError ? e.message : "Lỗi không xác định." }); }
  };
  router.get("/tempmail", (req, res) => { const b = getBox(req.user.id); res.json({ box: b ? view(b) : null, ttlMinutes: Math.round(TTL / 60000) }); });
  router.post("/tempmail/new", run(async (req) => ({ box: await create(req.user.id) })));
  router.get("/tempmail/inbox", run((req) => inbox(req.user.id)));
  router.get("/tempmail/messages/:id", run(async (req) => ({ message: await message(req.user.id, req.params.id) })));
  router.post("/tempmail/extend", run(async (req) => ({ box: extend(req.user.id) })));
  router.delete("/tempmail", run(async (req) => { await destroy(req.user.id); return {}; }));
}

module.exports = { register, create, inbox, message, extend, destroy, getBox, view, htmlToText, extractCodes, MailError };
