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
const bad = (m) => Object.assign(new MailError(m), { bad: true }); // loi do nguoi dung nhap/lam sai -> ma 400

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
async function listMessages(token) {
  const list = members(await http("GET", "/messages?page=1", { token }));
  return list.slice(0, 30).map((x) => ({
    id: String(x.id),
    from: (x.from && x.from.address) || "",
    name: (x.from && x.from.name) || "",
    subject: x.subject || "(không có tiêu đề)",
    intro: x.intro || "",
    createdAt: x.createdAt || null,
  }));
}

async function inbox(uid) {
  const b = getBox(uid);
  if (!b) throw new MailError("Chưa có hộp thư tạm hoặc đã hết hạn.");
  if (!b.cache || Date.now() - b.cacheAt > CACHE_MS) {
    b.cache = await listMessages(b.token);
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

async function readMessage(token, id) {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(id))) throw new MailError("Mã thư không hợp lệ.");
  const m = await http("GET", `/messages/${encodeURIComponent(id)}`, { token });
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

async function message(uid, id) {
  const b = getBox(uid);
  if (!b) throw new MailError("Chưa có hộp thư tạm hoặc đã hết hạn.");
  return readMessage(b.token, id);
}

/* ================= HOP THU DAI: 12 / 24 gio, co ten dang nhap + mat khau =================
 * Luu trong co so du lieu (mat khau ma hoa bang crypto.js) de khoi dong lai may chu van tu xoa dung han.
 * Token khong luu: moi lan can thi dang nhap lai bang dia chi + mat khau. */
const HOUR_MS = Number(process.env.TEMPMAIL_HOUR_MS) || 3600000;
const LONG_MAX_ACTIVE = Number(process.env.TEMPMAIL_LONG_MAX) || 3;
const LONG_DAILY = Number(process.env.TEMPMAIL_LONG_DAILY) || 5;

let dbh = null;
const DB = () => dbh || (dbh = require("./db").db);
const enc = () => require("./crypto");
const longTimers = new Map(); // id -> timeout
const longTokens = new Map(); // id -> { token, at }
const dailyLong = new Map();
let longReady = false;

function initLong() {
  if (longReady) return;
  DB().exec(`
    CREATE TABLE IF NOT EXISTS tempmail_boxes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      remote_id   TEXT NOT NULL,
      address     TEXT NOT NULL UNIQUE,
      password_enc TEXT NOT NULL,
      hours       INTEGER NOT NULL,
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL,
      deleted     INTEGER NOT NULL DEFAULT 0
    );
  `);
  longReady = true;
  const rows = DB().prepare("SELECT * FROM tempmail_boxes WHERE deleted = 0").all();
  rows.forEach(scheduleLong);
  const t = setInterval(sweepLong, 10 * 60 * 1000);
  if (t.unref) t.unref();
}

function scheduleLong(row) {
  clearTimeout(longTimers.get(row.id));
  const t = setTimeout(() => purgeLong(row.id), Math.max(0, row.expires_at - Date.now()) + 1000);
  if (t.unref) t.unref();
  longTimers.set(row.id, t);
}

async function tokenFor(row) {
  const c = longTokens.get(row.id);
  if (c && Date.now() - c.at < 8 * 60 * 1000) return c.token;
  const tok = await http("POST", "/token", { body: { address: row.address, password: enc().decrypt(row.password_enc) } });
  if (!tok || !tok.token) throw new MailError("Dịch vụ email tạm trả dữ liệu không hợp lệ.");
  longTokens.set(row.id, { token: tok.token, at: Date.now() });
  return tok.token;
}

/** Xoa hop thu o dich vu ngoai roi danh dau da xoa. Loi mang thi giu lai, lan quet sau thu lai. */
async function purgeLong(id) {
  const row = DB().prepare("SELECT * FROM tempmail_boxes WHERE id = ? AND deleted = 0").get(id);
  if (!row) return true;
  try {
    const token = await tokenFor(row);
    await http("DELETE", `/accounts/${encodeURIComponent(row.remote_id)}`, { token });
  } catch (e) {
    // loi mang/dich vu ban: thu lai sau; qua han hon 48 gio van khong xoa duoc (vd doi APP_SECRET) thi bo cuoc
    if (e.status !== 401 && e.status !== 404 && Date.now() - row.expires_at < 48 * 3600 * 1000) return false;
  }
  DB().prepare("UPDATE tempmail_boxes SET deleted = 1 WHERE id = ?").run(id);
  clearTimeout(longTimers.get(id));
  longTimers.delete(id);
  longTokens.delete(id);
  return true;
}

async function sweepLong() {
  const rows = DB().prepare("SELECT id FROM tempmail_boxes WHERE deleted = 0 AND expires_at <= ?").all(Date.now());
  for (const r of rows) await purgeLong(r.id);
}

const longView = (r) => ({
  id: r.id,
  address: r.address,
  hours: r.hours,
  expiresAt: r.expires_at,
  secondsLeft: Math.max(0, Math.round((r.expires_at - Date.now()) / 1000)),
});

function activeLong(uid) {
  initLong();
  return DB().prepare("SELECT * FROM tempmail_boxes WHERE user_id = ? AND deleted = 0 AND expires_at > ? ORDER BY id DESC").all(uid, Date.now());
}

function getLongRow(uid, id) {
  initLong();
  const row = DB().prepare("SELECT * FROM tempmail_boxes WHERE id = ? AND user_id = ? AND deleted = 0 AND expires_at > ?").get(Number(id) || 0, uid, Date.now());
  if (!row) throw bad("Không tìm thấy hộp thư (đã hết hạn hoặc đã xoá).");
  return row;
}

async function domains() {
  await pickDomain();
  return domCache.list.slice();
}

async function createLong(uid, o = {}) {
  initLong();
  const hours = Number(o.hours);
  if (![12, 24].includes(hours)) throw bad("Chọn thời hạn 12 hoặc 24 giờ.");
  let name = String(o.name || "").trim().toLowerCase();
  if (name) {
    if (!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(name)) throw bad("Tên email gồm 3 đến 24 ký tự: chữ thường, số, dấu chấm, gạch ngang hoặc gạch dưới.");
  } else name = "u" + crypto.randomBytes(5).toString("hex");
  let password = String(o.password || "");
  if (password) {
    if (password.length < 8 || password.length > 64) throw bad("Mật khẩu từ 8 đến 64 ký tự.");
  } else password = crypto.randomBytes(9).toString("base64url");

  if (activeLong(uid).length >= LONG_MAX_ACTIVE) throw bad(`Bạn đang có ${LONG_MAX_ACTIVE} hộp thư dài còn hạn. Xoá bớt một hộp rồi tạo tiếp.`);
  const d = dailyLong.get(uid);
  if (d && d.day === today() && d.n >= LONG_DAILY) throw bad(`Mỗi ngày tạo tối đa ${LONG_DAILY} hộp thư 12h/24h.`);

  const list = await domains();
  const domain = o.domain && list.includes(o.domain) ? o.domain : list[crypto.randomInt(list.length)];
  const address = `${name}@${domain}`;
  let acc;
  try {
    acc = await http("POST", "/accounts", { body: { address, password } });
  } catch (e) {
    if (e.status === 422 || e.status === 409) throw bad("Tên email này đã có người dùng. Hãy chọn tên khác.");
    throw e;
  }
  const tok = await http("POST", "/token", { body: { address, password } });
  if (!acc || !acc.id || !tok || !tok.token) throw new MailError("Dịch vụ email tạm trả dữ liệu không hợp lệ.");

  const now = Date.now();
  const info = DB().prepare("INSERT INTO tempmail_boxes (user_id, remote_id, address, password_enc, hours, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(uid, String(acc.id), address, enc().encrypt(password), hours, now, now + hours * HOUR_MS);
  const row = DB().prepare("SELECT * FROM tempmail_boxes WHERE id = ?").get(Number(info.lastInsertRowid));
  longTokens.set(row.id, { token: tok.token, at: now });
  scheduleLong(row);
  dailyLong.set(uid, d && d.day === today() ? { day: d.day, n: d.n + 1 } : { day: today(), n: 1 });
  return { box: longView(row), password };
}

async function inboxLong(uid, id) {
  const row = getLongRow(uid, id);
  return { box: longView(row), messages: await listMessages(await tokenFor(row)) };
}
async function messageLong(uid, id, mid) {
  const row = getLongRow(uid, id);
  return readMessage(await tokenFor(row), mid);
}
function passwordLong(uid, id) {
  return enc().decrypt(getLongRow(uid, id).password_enc);
}
async function removeLong(uid, id) {
  const row = getLongRow(uid, id);
  if (!(await purgeLong(row.id))) throw new MailError("Dịch vụ email tạm đang bận, chưa xoá được. Thử lại sau.");
}

/* ---------- route ---------- */
function register(router, auth) {
  const run = (fn) => async (req, res) => {
    try { res.json({ ok: true, ...(await fn(req)) }); }
    catch (e) { res.status(e instanceof MailError ? (e.bad ? 400 : /quá nhiều|quá tải|tối đa/.test(e.message) ? 429 : 503) : 500).json({ error: e instanceof MailError ? e.message : "Lỗi không xác định." }); }
  };
  router.get("/tempmail", (req, res) => { const b = getBox(req.user.id); res.json({ box: b ? view(b) : null, ttlMinutes: Math.round(TTL / 60000) }); });
  router.post("/tempmail/new", run(async (req) => ({ box: await create(req.user.id) })));
  router.get("/tempmail/inbox", run((req) => inbox(req.user.id)));
  router.get("/tempmail/messages/:id", run(async (req) => ({ message: await message(req.user.id, req.params.id) })));
  router.post("/tempmail/extend", run(async (req) => ({ box: extend(req.user.id) })));
  router.delete("/tempmail", run(async (req) => { await destroy(req.user.id); return {}; }));

  // hop thu 12h / 24h co tai khoan + mat khau
  try { initLong(); sweepLong().catch(() => {}); } catch (e) { console.error("[tempmail] khong khoi tao duoc hop thu dai:", e.message); }
  router.get("/tempmail/domains", run(async () => ({ domains: await domains() })));
  router.get("/tempmail/long", run(async (req) => ({ boxes: activeLong(req.user.id).map(longView), max: LONG_MAX_ACTIVE })));
  router.post("/tempmail/long", run((req) => createLong(req.user.id, req.body || {})));
  router.get("/tempmail/long/:id/inbox", run((req) => inboxLong(req.user.id, req.params.id)));
  router.get("/tempmail/long/:id/messages/:mid", run(async (req) => ({ message: await messageLong(req.user.id, req.params.id, req.params.mid) })));
  router.get("/tempmail/long/:id/password", run(async (req) => ({ password: passwordLong(req.user.id, req.params.id) })));
  router.delete("/tempmail/long/:id", run(async (req) => { await removeLong(req.user.id, req.params.id); return {}; }));
}

module.exports = { register, create, inbox, message, extend, destroy, getBox, view, htmlToText, extractCodes, MailError, createLong, activeLong, inboxLong, messageLong, passwordLong, removeLong, sweepLong, initLong, domains };
