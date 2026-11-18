/**
 * TU DONG CONG COIN KHI NAP (server TU DOC bien dong so du, khong qua dich vu thu 3)
 *
 *  Ngan hang gui email "bien dong so du" vao mot hop thu rieng cua admin (vd Gmail phu). Server dang nhap IMAP vao hop thu
 *  do (CHI DOC), tim email moi cua ngan hang, lay SO TIEN VAO + ma NAPxxxxxxx trong noi dung chuyen khoan va cong coin.
 *  Server KHONG giu mat khau / the / token ngan hang, khong co quyen chuyen tien. Lo mat khau hop thu cung chi lo email.
 *
 *  Bao mat:
 *   - Chi tin email tu dung dia chi / ten mien ngan hang admin khai bao, va (che do chat, mac dinh bat) email phai co
 *     xac thuc DKIM/SPF dat theo ghi nhan cua may chu thu. Email gia mao khong the them coin.
 *   - Moi email chi xu ly 1 lan: bang bank_events co UNIQUE(provider, ext_id) (ext_id = Message-ID), ghi su kien va cong coin
 *     trong CUNG mot giao dich co so du lieu. Server nho UID email da doc, tat/bat lai hoac ngu day van khong cong trung.
 *   - Chi nhan tien VAO. Giao dich khong khop ma nap duoc giu o trang thai "chua khop" de admin gan tay hoac bo qua.
 *   - Tien nhan LON HON lenh nap khong tu cong (de admin xem), tranh cong nham khi doc sai so tien.
 *   - Mat khau ung dung cua hop thu ma hoa bang APP_SECRET, khong bao gio tra ve trinh duyet.
 */

const { db, q, getSetting, setSetting } = require("./db");
const { encrypt, decrypt } = require("./crypto");
const wallet = require("./wallet");
const { Imap } = require("./imap");
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

/* ---------- Bat/tat + cau hinh hop thu ---------- */

const enabled = () => getSetting("autopay_enabled") === "1";

function mailConfig() {
  const c = {
    host: getSetting("autopay_imap_host") || "imap.gmail.com",
    user: getSetting("autopay_imap_user") || "",
    pass: decrypt(getSetting("autopay_imap_pass_enc")) || "",
    box: getSetting("autopay_imap_box") || "INBOX",
    from: getSetting("autopay_mail_from") || "",
    strict: getSetting("autopay_mail_strict") !== "0",
  };
  c.ready = !!(c.user && c.pass && c.from);
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

function saveMailConfig(b) {
  b = b || {};
  const user = String(b.user || "").trim();
  const from = String(b.from || "").trim().toLowerCase();
  const host = String(b.host || "").trim().toLowerCase() || "imap.gmail.com";
  const box = String(b.box || "").trim() || "INBOX";
  if (!user || user.length > 120 || /[\s"\\]/.test(user)) throw new Error("Email (tên đăng nhập hộp thư) không hợp lệ");
  if (!/^[a-z0-9._@+-]{3,100}$/.test(from)) throw new Error("Email hoặc tên miền ngân hàng gửi không hợp lệ (ví dụ: mbbank.com.vn)");
  if (!/^[a-z0-9.-]{3,100}$/.test(host)) throw new Error("Tên máy chủ IMAP không hợp lệ");
  if (!/^[A-Za-z0-9 ._\/\[\]-]{1,60}$/.test(box)) throw new Error("Tên hộp thư không hợp lệ");

  const old = mailConfig();
  let pass = String(b.pass || "").trim();
  if (/^[a-z]{4}( [a-z]{4}){3}$/i.test(pass)) pass = pass.replace(/ /g, ""); // Gmail hien mat khau ung dung co dau cach
  if (!pass && !old.pass) throw new Error("Nhập mật khẩu ứng dụng của hộp thư");
  if (/[\r\n\0]/.test(pass)) throw new Error("Mật khẩu không hợp lệ");

  setSetting("autopay_imap_user", user);
  setSetting("autopay_imap_host", host);
  setSetting("autopay_imap_box", box);
  setSetting("autopay_mail_from", from);
  setSetting("autopay_mail_strict", b.strict === false ? "0" : "1");
  if (pass) setSetting("autopay_imap_pass_enc", encrypt(pass));
  // Doi hop thu / nguoi gui: dat lai moc doc (chi doc email tu luc nay)
  if (pass || old.user !== user || old.host !== host || old.box !== box) {
    setSetting("autopay_imap_uid", "");
    setSetting("autopay_imap_validity", "");
  }
  setStatus(true, "Đã lưu cấu hình", null);
}

function clearMailConfig() {
  for (const k of ["autopay_imap_user", "autopay_imap_pass_enc", "autopay_mail_from", "autopay_imap_uid", "autopay_imap_validity", "autopay_imap_status"]) setSetting(k, "");
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

/* ---------- Doc hop thu ---------- */

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
let makeImap = (cfg) => new Imap(cfg.host, 993); // thay duoc khi kiem thu

async function pollInner() {
  const cfg = mailConfig();
  if (!cfg.ready) return setStatus(false, "Chưa cấu hình email ngân hàng");
  const imap = makeImap(cfg);
  try {
    await imap.open();
    await imap.login(cfg.user, cfg.pass);
    const box = await imap.select(cfg.box);
    const validity = String(box.uidvalidity);
    const stored = getSetting("autopay_imap_uid");
    const haveMark = stored !== null && stored !== "" && getSetting("autopay_imap_validity") === validity;

    if (!haveMark) { // lan dau: dat moc = email moi nhat hien co, chi doc email den sau do
      let mark = box.uidnext ? box.uidnext - 1 : 0;
      if (!box.uidnext) { const all = await imap.searchUids("", 1); mark = all.length ? all[all.length - 1] : 0; }
      setSetting("autopay_imap_uid", mark);
      setSetting("autopay_imap_validity", validity);
      return setStatus(true, "Đã kết nối hộp thư. Từ giờ server tự đọc các email ngân hàng gửi đến.");
    }

    const last = Number(stored) || 0;
    const uids = (await imap.searchUids(cfg.from, last + 1)).slice(0, 25);
    const n = { credited: 0, unmatched: 0, skipped: 0, untrusted: 0, unreadable: 0, dup: 0 };
    for (const uid of uids) {
      const raw = await imap.fetchRaw(uid);
      const kind = raw ? handleMail(raw, cfg, `uid:${validity}:${uid}`) : "skipped";
      n[kind] = (n[kind] || 0) + 1;
      setSetting("autopay_imap_uid", uid); // nho tien do ngay sau moi email
    }
    if (n.credited) console.log(`[autopay] da cong coin cho ${n.credited} giao dich`);

    let warn;
    if (n.untrusted || n.unreadable) {
      const w = [];
      if (n.untrusted) w.push(`${n.untrusted} email bị bỏ qua vì không xác thực được người gửi (nếu đúng là email ngân hàng, tắt "chế độ chặt" hoặc kiểm tra lại địa chỉ người gửi)`);
      if (n.unreadable) w.push(`${n.unreadable} email trông như tiền vào nhưng server không đọc được số tiền (bấm "Thử đọc email gần nhất" để xem)`);
      warn = { at: new Date().toISOString(), text: w.join(". ") };
    }
    const msg = uids.length
      ? `Đọc ${uids.length} email mới: ${n.credited} đã cộng, ${n.unmatched} chưa khớp.`
      : "Không có email mới.";
    return setStatus(true, msg, warn);
  } catch (e) {
    return setStatus(false, e.message || "Lỗi không rõ");
  } finally {
    imap.close();
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
  if (!cfg.ready) throw new Error("Hãy lưu cấu hình email trước");
  const imap = makeImap(cfg);
  try {
    await imap.open();
    await imap.login(cfg.user, cfg.pass);
    await imap.select(cfg.box);
    const uids = await imap.searchUids(cfg.from, 1);
    const items = [];
    for (const uid of uids.slice(-3).reverse()) {
      const raw = await imap.fetchRaw(uid);
      if (!raw) continue;
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
    return { total: uids.length, strict: cfg.strict, items };
  } finally {
    imap.close();
  }
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

/* ---------- Admin ---------- */

function register(router, auth2) {
  const fail = (res, e) => res.status(400).json({ error: e.message });
  const state = () => {
    const t = bq.today.get();
    const c = mailConfig();
    return {
      enabled: enabled(),
      bankReady: !!(getSetting("bank_id") && getSetting("bank_account")),
      mail: { host: c.host, user: c.user, hasPass: !!c.pass, from: c.from, box: c.box, strict: c.strict, ready: c.ready, status: readStatus() },
      today: { n: t.n, sum: t.s },
      unmatched: bq.unmatched.get().n,
      events: bq.list.all(),
    };
  };

  router.get("/admin/autopay", auth2.requireAdmin, (req, res) => res.json(state()));

  router.post("/admin/autopay", auth2.requireAdmin, (req, res) => {
    if (req.body?.enabled && !mailConfig().ready) return res.status(400).json({ error: "Hãy cấu hình email nhận thông báo ngân hàng trước khi bật" });
    setSetting("autopay_enabled", req.body?.enabled ? "1" : "0");
    res.json(state());
  });

  // Luu hop thu roi ket noi thu luon (dat moc doc) de bao loi ngay neu sai mat khau
  router.post("/admin/autopay/mail", auth2.requireAdmin, async (req, res) => {
    try { saveMailConfig(req.body); } catch (e) { return fail(res, e); }
    await pollMail();
    res.json(state());
  });

  router.post("/admin/autopay/mail/poll", auth2.requireAdmin, async (req, res) => {
    await pollMail();
    res.json(state());
  });

  router.post("/admin/autopay/mail/test", auth2.requireAdmin, async (req, res) => {
    try { res.json(await testMail()); } catch (e) { fail(res, e); }
  });

  router.post("/admin/autopay/mail/clear", auth2.requireAdmin, (req, res) => {
    clearMailConfig();
    res.json(state());
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
  register, findCode, findCodes, processOne, handleMail, pollMail, testMail, mailConfig, saveMailConfig,
  _setImapFactory: (f) => { makeImap = f; }, // chi dung khi kiem thu
};
