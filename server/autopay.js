/**
 * TU DONG CONG COIN KHI NAP (server TU DOC email bien dong so du, khong qua dich vu thu 3)
 *
 *  Ngan hang gui email "bien dong so du" vao mot Gmail rieng cua admin. Server dang nhap Gmail bang "Dang nhap bang Google"
 *  (OAuth, CHI quyen doc email, xem server/gmail.js), tim email moi cua ngan hang, lay SO TIEN VAO + ma NAPxxxxxxx trong noi
 *  dung chuyen khoan va cong coin. Server KHONG giu mat khau / the / token ngan hang va khong co quyen chuyen tien.
 *
 *  Bao mat:
 *   - Chi tin email tu dung dia chi / ten mien ngan hang admin khai bao, va (che do chat, mac dinh bat) email phai co
 *     xac thuc DKIM/SPF dat theo ghi nhan cua Gmail. Email gia mao khong the them coin.
 *   - Moi email chi xu ly 1 lan: bang bank_events co UNIQUE(provider, ext_id) (ext_id = Message-ID), ghi su kien va cong coin
 *     trong CUNG mot giao dich co so du lieu. Server nho moc thoi gian email da doc, tat/bat lai hoac ngu day van khong cong trung.
 *   - Chi nhan tien VAO. Giao dich khong khop ma nap duoc giu o trang thai "chua khop" de admin gan tay hoac bo qua.
 *   - Tien nhan LON HON lenh nap khong tu cong (de admin xem), tranh cong nham khi doc sai so tien.
 *   - Token Google ma hoa bang APP_SECRET, khong bao gio tra ve trinh duyet / app.
 */

const { db, q, getSetting, setSetting } = require("./db");
const wallet = require("./wallet");
const gmail = require("./gmail");
const bankmail = require("./bankmail");

db.exec(`
  CREATE TABLE IF NOT EXISTS bank_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    provider   TEXT NOT NULL,                 -- sepay | casso
    ext_id     TEXT NOT NULL,                 -- ma giao dich phia dich vu, dung de chong cong trung
    amount     INTEGER NOT NULL,
    content    TEXT,
    account    TEXT,
    ref        TEXT,
    status     TEXT NOT NULL DEFAULT 'unmatched',   -- credited | unmatched | ignored
    user_id    INTEGER,
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (provider, ext_id)
  );
  CREATE INDEX IF NOT EXISTS bank_events_status ON bank_events(status, id);
`);

const bq = {
  insert: db.prepare(
    `INSERT INTO bank_events (provider, ext_id, amount, content, account, ref) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (provider, ext_id) DO NOTHING`
  ),
  byId: db.prepare("SELECT * FROM bank_events WHERE id = ?"),
  setStatus: db.prepare("UPDATE bank_events SET status = ?, user_id = ?, note = ? WHERE id = ?"),
  list: db.prepare(
    `SELECT e.id, e.provider, e.amount, e.content, e.status, e.note, e.created_at, u.username
       FROM bank_events e LEFT JOIN users u ON u.id = e.user_id
      ORDER BY (e.status = 'unmatched') DESC, e.id DESC LIMIT 40`
  ),
  today: db.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS s FROM bank_events
      WHERE status = 'credited' AND datetime(created_at, '+7 hours') >= date(datetime('now', '+7 hours'))`
  ),
  unmatched: db.prepare("SELECT COUNT(*) AS n FROM bank_events WHERE status = 'unmatched'"),
};

const pendingDeposits = db.prepare("SELECT COUNT(*) AS n FROM deposits WHERE status = 'pending'");

// Webhook SePay / Casso da bo: xoa ma bi mat cu con luu trong CSDL
if (getSetting("pay_webhook_secret_enc")) setSetting("pay_webhook_secret_enc", "");

/* ---------- Bat/tat + cau hinh ---------- */

const enabled = () => getSetting("autopay_enabled") === "1";

function mailConfig() {
  const g = gmail.creds();
  const c = {
    clientId: g.clientId,
    hasSecret: !!g.secret,
    connected: !!g.refresh,
    email: g.email,
    from: getSetting("autopay_mail_from") || "",
    strict: getSetting("autopay_mail_strict") !== "0",
  };
  c.ready = c.connected && !!c.from;
  return c;
}

function readStatus() {
  try { return JSON.parse(getSetting("autopay_imap_status") || "null") || null; } catch (_) { return null; }
}

function setStatus(ok, msg, warn) {
  const prev = readStatus();
  const next = { at: new Date().toISOString(), ok, msg, warn: warn === undefined ? prev?.warn || null : warn };
  setSetting("autopay_imap_status", JSON.stringify(next));
  return next;
}

/** Luu Client ID / Secret / nguoi gui. Doi Client ID thi phai dang nhap Google lai. */
function saveMailConfig(b) {
  b = b || {};
  const clientId = String(b.clientId || "").trim();
  const secret = String(b.clientSecret || "").trim();
  const from = String(b.from || "").trim().toLowerCase();
  if (!/^[A-Za-z0-9._-]{10,120}\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error("Client ID không hợp lệ (dạng xxxx.apps.googleusercontent.com)");
  if (secret && !/^[A-Za-z0-9_-]{10,200}$/.test(secret)) throw new Error("Client Secret không hợp lệ");
  if (!secret && !gmail.creds().secret) throw new Error("Nhập Client Secret");
  if (!/^[a-z0-9._@+-]{3,100}$/.test(from)) throw new Error("Email hoặc tên miền ngân hàng gửi không hợp lệ (ví dụ: mbbank.com.vn)");
  gmail.saveClient(clientId, secret);
  setSetting("autopay_mail_from", from);
  setSetting("autopay_mail_strict", b.strict === false ? "0" : "1");
  setStatus(true, "Đã lưu cấu hình", null);
}

async function disconnectGoogle() {
  await gmail.disconnect();
  setSetting("autopay_enabled", "0");
  setSetting("autopay_imap_status", "");
}

async function clearMailConfig() {
  try { await gmail.disconnect(); } catch (_) {}
  gmail.wipeAll();
  for (const k of ["autopay_mail_from", "autopay_imap_status"]) setSetting(k, "");
  setSetting("autopay_enabled", "0");
}

/* ---------- Doc ma nap + xu ly giao dich ---------- */

/** Ma nap = NAP + 7 ky tu trong bang chu cai cua wallet.js (khong co I, O, 0, 1). Bo dau cach / ky tu la ngan hang chen vao. */
function findCodes(text) {
  const s = String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // (?=...) de bat ca cac ma chong len nhau, vi du nguoi dung go thua "NAP NAPK7M2XQ9"
  return [...new Set([...s.matchAll(/(?=(NAP[A-HJ-NP-Z2-9]{7}))/g)].map((m) => m[1]))];
}
const findCode = (text) => findCodes(text)[0] || null;

/**
 * Xu ly 1 khoan tien vao trong 1 giao dich CSDL. t = { provider, extId, amount, content, search?, account?, ref?, capToOrder? }
 *  content: dong hien thi cho admin; search: van ban dung de tim ma nap (mac dinh = content).
 * Tra ve { dup } | { skipped } | { id, status, note, userId, amount }
 */
function processOne(t) {
  if (!(t.amount > 0)) return { skipped: true }; // tien ra: khong ghi nhan
  const amount = Math.round(t.amount);
  return wallet.tx(() => {
    const ins = bq.insert.run(t.provider, t.extId, amount, String(t.content || "").slice(0, 300), String(t.account || "").slice(0, 40), String(t.ref || "").slice(0, 60));
    if (!ins.changes) return { dup: true };
    const id = Number(ins.lastInsertRowid);
    const set = (status, userId, note) => { bq.setStatus.run(status, userId || null, note || null, id); return { id, status, note, userId, amount }; };

    if (!enabled()) return set("unmatched", null, "Tự động cộng đang tắt, hãy gán thủ công");
    const codes = findCodes(t.search ?? t.content);
    if (!codes.length) return set("unmatched", null, "Không thấy mã nạp (NAPxxxxxxx) trong nội dung");
    const note = t.provider === "mail" ? "Tự động · email ngân hàng" : `Tự động · ${t.provider} #${t.extId}`;
    let r = null, code = codes[0];
    for (const c of codes) {           // thu lan luot, lay ma dau tien co lenh nap that
      const x = wallet.confirmByCode(c, amount, note, { maxOrder: !!t.capToOrder });
      if (!r) r = x;
      if (x.deposit || !x.error) { r = x; code = c; break; }
    }
    if (r.error) return set("unmatched", r.deposit?.user_id, r.error);
    const extra = r.wasCancelled ? " (lệnh đã huỷ trước đó nhưng tiền đã về)" : r.expected !== amount ? ` (lệnh ${r.expected})` : "";
    return set("credited", r.deposit.user_id, `Mã ${code}${extra}`);
  });
}

/* ---------- Doc Gmail ---------- */

/** Xu ly 1 email tho. Tra ve ket qua phan loai de dem: credited | unmatched | skipped | untrusted | unreadable | dup */
function handleMail(raw, cfg, fallbackId) {
  const msg = bankmail.parseMime(raw);
  if (!bankmail.addressMatches(msg.from, cfg.from)) return "skipped";
  if (cfg.strict && !bankmail.authPassed(msg.headers, cfg.from)) return "untrusted";
  const p = bankmail.parseBankMail(msg);
  if (p.kind === "other") return "skipped";
  if (p.kind === "unreadable") return "unreadable";
  const r = processOne({
    provider: "mail",
    extId: msg.messageId || fallbackId,
    amount: p.amount,
    content: p.content,
    search: `${msg.subject}\n${msg.text}`,
    capToOrder: true,
  });
  return r.dup ? "dup" : r.status || "skipped";
}

let polling = null;
let lastPollAt = 0;
const seen = new Set(); // id thu Gmail da xu ly trong lan chay nay, de khong tai lai moi 25 giay
const OVERLAP = 3 * 60 * 1000; // doc lui 3 phut phong Gmail danh chi muc tre, trung thi bank_events chan

async function pollInner() {
  const cfg = mailConfig();
  if (!cfg.connected) return setStatus(false, "Chưa đăng nhập Google");
  if (!cfg.from) return setStatus(false, "Chưa khai báo email ngân hàng gửi");
  try {
    let since = Number(getSetting("autopay_g_since")) || 0;
    if (!since) { // chua co moc (vd moi cap nhat): chi doc email den tu bay gio
      setSetting("autopay_g_since", String(Date.now()));
      return setStatus(true, "Đã kết nối Gmail. Từ giờ server tự đọc các email ngân hàng gửi đến.");
    }
    const after = Math.max(0, Math.floor((since - OVERLAP) / 1000));
    const { ids } = await gmail.list(`from:${cfg.from} in:anywhere after:${after}`, 50);
    const fresh = ids.filter((id) => !seen.has(id));
    const msgs = [];
    for (const id of fresh) msgs.push(await gmail.getRaw(id));
    msgs.sort((a, b) => a.internalDate - b.internalDate);

    const n = { credited: 0, unmatched: 0, skipped: 0, untrusted: 0, unreadable: 0, dup: 0 };
    for (const m of msgs) {
      const kind = m.raw.length ? handleMail(m.raw, cfg, `gmail:${m.id}`) : "skipped";
      n[kind] = (n[kind] || 0) + 1;
      seen.add(m.id);
      if (seen.size > 2000) seen.clear();
      if (m.internalDate > since) { since = m.internalDate; setSetting("autopay_g_since", String(since)); } // nho tien do ngay sau moi email
    }
    if (n.credited) console.log(`[autopay] da cong coin cho ${n.credited} giao dich`);

    let warn;
    if (n.untrusted || n.unreadable) {
      const w = [];
      if (n.untrusted) w.push(`${n.untrusted} email bị bỏ qua vì không xác thực được người gửi (nếu đúng là email ngân hàng, tắt "chế độ chặt" hoặc kiểm tra lại địa chỉ người gửi)`);
      if (n.unreadable) w.push(`${n.unreadable} email trông như tiền vào nhưng server không đọc được số tiền (bấm "Thử đọc email" để xem)`);
      warn = { at: new Date().toISOString(), text: w.join(". ") };
    }
    const fresh2 = msgs.length - n.dup;
    return setStatus(true, fresh2 > 0 ? `Đọc ${fresh2} email mới: ${n.credited} đã cộng, ${n.unmatched} chưa khớp.` : "Không có email mới.", warn);
  } catch (e) {
    return setStatus(false, e.message || "Lỗi không rõ");
  }
}

/** Doc hop thu ngay. Chay trung nhau thi dung chung 1 lan. */
function pollMail() {
  if (polling) return polling;
  polling = pollInner().finally(() => { polling = null; lastPollAt = Date.now(); });
  return polling;
}

/** Chi de xem thu: doc 3 email gan nhat cua ngan hang, KHONG cong coin, KHONG doi moc doc */
async function testMail() {
  const cfg = mailConfig();
  if (!cfg.ready) throw new Error("Hãy đăng nhập Google và khai báo email ngân hàng gửi trước");
  const { ids, estimate } = await gmail.list(`from:${cfg.from} in:anywhere`, 3);
  const items = [];
  for (const id of ids) {
    const { raw } = await gmail.getRaw(id);
    if (!raw.length) continue;
    const msg = bankmail.parseMime(raw);
    const p = bankmail.parseBankMail(msg);
    items.push({
      subject: msg.subject.slice(0, 120),
      from: msg.from,
      date: msg.date,
      fromOk: bankmail.addressMatches(msg.from, cfg.from),
      authOk: bankmail.authPassed(msg.headers, cfg.from),
      kind: p.kind,
      amount: p.amount || 0,
      why: p.why || "",
      content: p.content || "",
      codes: findCodes(`${msg.subject}\n${msg.text}`),
      snippet: msg.text.replace(/\s+/g, " ").slice(0, 400),
    });
  }
  return { total: estimate, strict: cfg.strict, items };
}

/** Vong lap nen: co lenh nap dang cho thi doc moi 25 giay, khong co thi 5 phut mot lan */
function startMailLoop() {
  if (process.env.AUTOPAY_NO_POLL === "1") return;
  setInterval(() => {
    try {
      if (!mailConfig().ready || polling) return;
      const gap = pendingDeposits.get().n > 0 ? 25 * 1000 : 5 * 60 * 1000;
      if (Date.now() - lastPollAt < gap) return;
      pollMail().catch((e) => console.error("[autopay]", e.message));
    } catch (e) { console.error("[autopay]", e.message); }
  }, 10 * 1000).unref?.();
}
startMailLoop();

/* ---------- Dang nhap Google: trang ket qua (khong can phien dang nhap, bao ve bang "state") ---------- */

const htmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function resultPage(ok, text) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ok ? "Đã kết nối Gmail" : "Không kết nối được"}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#10131a;color:#e6e9ef;display:grid;place-items:center;min-height:100vh;margin:0;padding:1rem}
.c{max-width:26rem;background:#171b24;border:1px solid #2a3040;border-radius:14px;padding:1.4rem}
h1{font-size:1.15rem;margin:0 0 .6rem;color:${ok ? "#7fd99a" : "#ff8a8a"}}p{margin:.4rem 0;color:#b8bfcc}a{color:#8ab4ff}</style></head>
<body><div class="c"><h1>${ok ? "✔ Đã kết nối Gmail" : "✕ Không kết nối được"}</h1><p>${htmlEsc(text)}</p>
<p>${ok ? "Bạn có thể đóng trang này và quay lại ứng dụng." : "Quay lại trang quản trị và thử lại."}</p><p><a href="/">Về trang quản trị</a></p></div></body></html>`;
}

/** GET /api/admin/autopay/google/callback (gan trong app.js, truoc bo dinh tuyen can dang nhap) */
async function googleCallback(req, res) {
  res.set("Cache-Control", "no-store");
  try {
    const r = await gmail.finishAuth({ code: String(req.query.code || ""), state: String(req.query.state || ""), error: String(req.query.error || "") });
    setStatus(true, `Đã đăng nhập Google (${r.email}). Từ giờ server tự đọc các email ngân hàng gửi đến.`, null);
    lastPollAt = 0;
    res.send(resultPage(true, `Đã kết nối ${r.email}. Server chỉ có quyền xem email, không gửi hay xoá được gì.`));
  } catch (e) {
    const msg = e instanceof gmail.GoogleError ? e.message : "Lỗi không rõ khi kết nối Google";
    if (!(e instanceof gmail.GoogleError)) console.error("[autopay] google callback:", e);
    setStatus(false, msg);
    res.status(400).send(resultPage(false, msg));
  }
}

/* ---------- Admin ---------- */

function publicBase(req) {
  const env = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");
  return env || `${req.protocol}://${req.get("host")}`;
}
const redirectUriOf = (req) => `${publicBase(req)}/api/admin/autopay/google/callback`;

function register(router, auth2) {
  const fail = (res, e) => res.status(400).json({ error: e.message });
  const state = (req) => {
    const t = bq.today.get();
    const c = mailConfig();
    return {
      enabled: enabled(),
      bankReady: !!(getSetting("bank_id") && getSetting("bank_account")),
      mail: { clientId: c.clientId, hasSecret: c.hasSecret, connected: c.connected, email: c.email, from: c.from, strict: c.strict, ready: c.ready, status: readStatus(), redirectUri: redirectUriOf(req) },
      today: { n: t.n, sum: t.s },
      unmatched: bq.unmatched.get().n,
      events: bq.list.all(),
    };
  };

  router.get("/admin/autopay", auth2.requireAdmin, (req, res) => res.json(state(req)));

  router.post("/admin/autopay", auth2.requireAdmin, (req, res) => {
    if (req.body?.enabled && !mailConfig().ready) return res.status(400).json({ error: "Hãy đăng nhập Google và khai báo email ngân hàng gửi trước khi bật" });
    setSetting("autopay_enabled", req.body?.enabled ? "1" : "0");
    res.json(state(req));
  });

  // Luu Client ID / Secret / nguoi gui (khong dang nhap lai)
  router.post("/admin/autopay/google", auth2.requireAdmin, (req, res) => {
    try { saveMailConfig(req.body); } catch (e) { return fail(res, e); }
    res.json(state(req));
  });

  // Luu cau hinh roi tra link "Dang nhap bang Google". Web mo trong tab, app mo bang trinh duyet cua may.
  router.post("/admin/autopay/google/start", auth2.requireAdmin, (req, res) => {
    try {
      if (req.body?.clientId) saveMailConfig(req.body);
      const redirectUri = redirectUriOf(req);
      res.json({ url: gmail.startAuth(redirectUri), redirectUri });
    } catch (e) { fail(res, e); }
  });

  router.post("/admin/autopay/poll", auth2.requireAdmin, async (req, res) => {
    await pollMail();
    res.json(state(req));
  });

  router.post("/admin/autopay/test", auth2.requireAdmin, async (req, res) => {
    try { res.json(await testMail()); } catch (e) { fail(res, e); }
  });

  router.post("/admin/autopay/disconnect", auth2.requireAdmin, async (req, res) => {
    await disconnectGoogle();
    res.json(state(req));
  });

  router.post("/admin/autopay/clear", auth2.requireAdmin, async (req, res) => {
    await clearMailConfig();
    res.json(state(req));
  });

  // Gan mot khoan tien chua khop (chuyen sai noi dung) cho tai khoan nguoi dung
  router.post("/admin/autopay/events/:id/assign", auth2.requireAdmin, (req, res) => {
    try {
      const u = q.userByName.get(String(req.body?.username || "").trim().toLowerCase());
      if (!u) throw new Error("Không tìm thấy tài khoản này");
      const r = wallet.tx(() => {
        const ev = bq.byId.get(Number(req.params.id));
        if (!ev) throw new Error("Không tìm thấy giao dịch");
        if (ev.status !== "unmatched") throw new Error("Giao dịch này đã được xử lý rồi");
        const out = wallet.assignManual(u.id, ev.amount, `Gán thủ công giao dịch ngân hàng #${ev.id}`);
        bq.setStatus.run("credited", u.id, `Gán thủ công cho ${u.username} (${out.code})`, ev.id);
        return { amount: ev.amount, balance: out.balance };
      });
      res.json({ ok: true, ...r });
    } catch (e) { fail(res, e); }
  });

  router.post("/admin/autopay/events/:id/ignore", auth2.requireAdmin, (req, res) => {
    const ev = bq.byId.get(Number(req.params.id));
    if (ev && ev.status === "unmatched") bq.setStatus.run("ignored", null, "Admin bỏ qua", ev.id);
    res.json({ ok: true });
  });
}

module.exports = {
  register, googleCallback, findCode, findCodes, processOne, handleMail, pollMail, testMail, mailConfig, saveMailConfig,
};
