/**
 * LIEN KET EMAIL + QUEN MAT KHAU.
 *
 *  - Nguoi dung vao tab "Ca nhan", nhap email -> he thong gui ma 6 so -> nhap ma de xac thuc.
 *  - Quen mat khau: nhap ten dang nhap hoac email -> ma gui toi email DA XAC THUC -> nhap ma + mat khau moi.
 *  - Ma: 6 so, het han sau 10 phut, toi da 5 lan nhap sai, dung 1 lan, chi luu dang bam (HMAC) trong DB.
 *  - Chong lam dung: 60 giay moi lan gui lai, toi da 5 ma / gio / tai khoan, gioi han theo IP.
 *  - Trang quen mat khau KHONG cho biet tai khoan co ton tai hay khong.
 *  - Doi mat khau xong, moi phien dang nhap cu bi huy (users.pw_changed_at).
 */
const crypto = require("crypto");
const { db, q } = require("./db");
const auth = require("./auth");
const mailer = require("./mailer");

db.exec(`
  CREATE TABLE IF NOT EXISTS email_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    purpose    TEXT NOT NULL,                 -- verify | reset
    email      TEXT NOT NULL,
    code_hash  TEXT NOT NULL,
    attempts   INTEGER NOT NULL DEFAULT 0,
    used       INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS email_codes_user ON email_codes(user_id, purpose, id);
`);

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const COOLDOWN_S = 60;
const MAX_PER_HOUR = 5;

const eq = {
  insert: db.prepare("INSERT INTO email_codes (user_id, purpose, email, code_hash, expires_at) VALUES (?, ?, ?, ?, datetime('now', ?))"),
  // Ma moi nhat cua nguoi dung + muc dich con han, chua dung
  latest: db.prepare(
    `SELECT *, CAST(strftime('%s', expires_at) AS INTEGER) - CAST(strftime('%s', 'now') AS INTEGER) AS ttl
       FROM email_codes WHERE user_id = ? AND purpose = ? AND used = 0 AND expires_at > datetime('now')
      ORDER BY id DESC LIMIT 1`
  ),
  lastCreated: db.prepare(
    `SELECT CAST(strftime('%s', 'now') AS INTEGER) - CAST(strftime('%s', created_at) AS INTEGER) AS ago
       FROM email_codes WHERE user_id = ? AND purpose = ? ORDER BY id DESC LIMIT 1`
  ),
  hourCount: db.prepare(
    "SELECT COUNT(*) AS n FROM email_codes WHERE user_id = ? AND purpose = ? AND created_at > datetime('now', '-1 hour')"
  ),
  bump: db.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?"),
  use: db.prepare("UPDATE email_codes SET used = 1 WHERE id = ?"),
  burnAll: db.prepare("UPDATE email_codes SET used = 1 WHERE user_id = ? AND purpose = ? AND used = 0"),
};

/* ---------- Tien ich ---------- */

const normEmail = (s) => String(s || "").trim().toLowerCase();
const validEmail = (e) => e.length <= 254 && /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e);

function maskEmail(e) {
  const [u, d] = String(e).split("@");
  return (u.length <= 2 ? u[0] : u.slice(0, 2)) + "*****@" + d;
}

const hashCode = (purpose, userId, email, code) =>
  crypto.createHmac("sha256", process.env.APP_SECRET).update(`${purpose}:${userId}:${email}:${code}`).digest("hex");

const sameHash = (a, b) => {
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Gioi han theo IP: toi da `max` lan trong `windowMs` */
function ipLimiter(max, windowMs) {
  const hits = new Map();
  return (ip) => {
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) { hits.set(ip, arr); return false; }
    arr.push(now);
    hits.set(ip, arr);
    return true;
  };
}
const forgotLimit = ipLimiter(10, 3600e3);   // yeu cau gui ma quen mat khau
const resetLimit = ipLimiter(30, 3600e3);    // lan thu doi mat khau bang ma

class Fail extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

/** Tao + gui ma. Co kiem tra thoi gian cho / han muc. Throw Fail neu khong gui duoc. */
async function issueCode(user, purpose, email) {
  if (!mailer.isEnabled()) throw new Fail("Hệ thống chưa bật gửi email. Hãy liên hệ quản trị viên.", 503);
  const last = eq.lastCreated.get(user.id, purpose);
  if (last && last.ago < COOLDOWN_S) throw new Fail(`Vui lòng đợi ${COOLDOWN_S - last.ago} giây rồi gửi lại mã.`, 429);
  if (eq.hourCount.get(user.id, purpose).n >= MAX_PER_HOUR) {
    throw new Fail("Bạn đã yêu cầu quá nhiều mã trong 1 giờ. Hãy thử lại sau.", 429);
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  eq.burnAll.run(user.id, purpose);
  eq.insert.run(user.id, purpose, email, hashCode(purpose, user.id, email, code), `+${CODE_MINUTES} minutes`);
  try {
    await mailer.send({ to: email, ...mailer.codeMail({ code, purpose, minutes: CODE_MINUTES, username: user.username }) });
  } catch (e) {
    eq.burnAll.run(user.id, purpose); // gui loi thi huy ma, khong tinh la da gui
    throw new Fail(e.message, 502);
  }
}

/** Kiem tra ma nguoi dung nhap. Dung -> danh dau da dung, tra ve dong ma. Sai -> throw Fail. */
function checkCode(user, purpose, rawCode) {
  const code = String(rawCode || "").replace(/\D/g, "");
  const row = eq.latest.get(user.id, purpose);
  if (!row) throw new Fail("Mã đã hết hạn hoặc chưa được gửi. Hãy gửi lại mã mới.");
  if (row.attempts >= MAX_ATTEMPTS) {
    eq.use.run(row.id);
    throw new Fail("Bạn đã nhập sai quá 5 lần. Hãy gửi lại mã mới.");
  }
  if (code.length !== 6 || !sameHash(row.code_hash, hashCode(purpose, user.id, row.email, code))) {
    eq.bump.run(row.id);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    throw new Fail(left > 0 ? `Mã chưa đúng, còn ${left} lần thử.` : "Mã chưa đúng. Hãy gửi lại mã mới.");
  }
  eq.use.run(row.id);
  return row;
}

function checkNewPassword(p) {
  if (String(p || "").length < 8) throw new Fail("Mật khẩu mới tối thiểu 8 ký tự");
  if (String(p).length > 200) throw new Fail("Mật khẩu quá dài");
}

/** Dat mat khau moi + huy cac phien dang nhap cu. Tra ve moc thoi gian de phien hien tai giu lai. */
function setPassword(userId, plain) {
  const at = Date.now();
  q.setPasswordAt.run(auth.hash(plain), at, userId);
  return at;
}

const send = (res, e) => {
  if (e instanceof Fail) return res.status(e.status).json({ error: e.message });
  console.error("[email]", e);
  res.status(500).json({ error: "Có lỗi xảy ra, thử lại sau." });
};

/* ================= Route cong khai (chua dang nhap) ================= */

function registerPublic(router) {
  /** Buoc 1: gui ma. Luon tra loi giong nhau de khong lo tai khoan nao ton tai. */
  router.post("/forgot", async (req, res) => {
    const ip = req.ip || "?";
    try {
      if (!forgotLimit(ip)) throw new Fail("Bạn thử quá nhiều lần. Hãy quay lại sau 1 giờ.", 429);
      if (!mailer.isEnabled()) throw new Fail("Hệ thống chưa bật gửi email. Hãy liên hệ quản trị viên để được cấp lại mật khẩu.", 503);
      const id = String(req.body?.identifier || "").trim().toLowerCase();
      if (!id) throw new Fail("Nhập tên đăng nhập hoặc email.");
      const user = id.includes("@") ? q.userByEmail.get(id) : q.userByName.get(id);
      if (user && user.active && user.email_verified && user.email) {
        try {
          await issueCode(user, "reset", normEmail(user.email));
        } catch (e) {
          // Cho nguoi that biet neu dang bi gioi han; loi khac thi giu chung de khong lo thong tin
          if (e.status === 429) throw e;
          console.error("[email] gui ma quen mat khau loi:", e.message);
        }
      }
      res.json({ ok: true, message: "Nếu tài khoản có email đã xác thực, mã đã được gửi. Mã có hiệu lực 10 phút." });
    } catch (e) { send(res, e); }
  });

  /** Buoc 2: nhap ma + mat khau moi */
  router.post("/forgot/reset", (req, res) => {
    const ip = req.ip || "?";
    try {
      if (!resetLimit(ip)) throw new Fail("Bạn thử quá nhiều lần. Hãy quay lại sau 1 giờ.", 429);
      const id = String(req.body?.identifier || "").trim().toLowerCase();
      const user = id.includes("@") ? q.userByEmail.get(id) : q.userByName.get(id);
      const bad = () => new Fail("Mã chưa đúng hoặc đã hết hạn. Hãy gửi lại mã mới.");
      if (!user || !user.active || !user.email_verified) throw bad();
      checkNewPassword(req.body?.password);
      checkCode(user, "reset", req.body?.code);
      setPassword(user.id, String(req.body.password));
      auth.noteOk(ip);
      res.json({ ok: true });
    } catch (e) { send(res, e); }
  });
}

/* ================= Route can dang nhap ================= */

function registerPrivate(router) {
  router.get("/profile", (req, res) => {
    const u = req.user;
    const pending = eq.latest.get(u.id, "verify");
    res.json({
      username: u.username,
      role: u.role,
      createdAt: u.created_at,
      email: u.email_verified ? u.email : null,
      mailEnabled: mailer.isEnabled(),
      pending: pending ? { email: pending.email, expiresIn: pending.ttl, attempts: pending.attempts } : null,
      cooldown: Math.max(0, COOLDOWN_S - (eq.lastCreated.get(u.id, "verify")?.ago ?? COOLDOWN_S)),
    });
  });

  /** Gui ma xac thuc toi email moi (hoac email dang doi) */
  router.post("/profile/email", async (req, res) => {
    try {
      const email = normEmail(req.body?.email);
      if (!validEmail(email)) throw new Fail("Email chưa đúng định dạng.");
      if (req.user.email_verified && normEmail(req.user.email) === email) throw new Fail("Email này đã được liên kết với tài khoản của bạn rồi.");
      const taken = q.userByEmail.get(email);
      if (taken && taken.id !== req.user.id) throw new Fail("Email này đã liên kết với một tài khoản khác.");
      await issueCode(req.user, "verify", email);
      res.json({ ok: true, sentTo: maskEmail(email), minutes: CODE_MINUTES, cooldown: COOLDOWN_S });
    } catch (e) { send(res, e); }
  });

  router.post("/profile/email/verify", (req, res) => {
    try {
      const row = checkCode(req.user, "verify", req.body?.code);
      const taken = q.userByEmail.get(row.email);
      if (taken && taken.id !== req.user.id) throw new Fail("Email này vừa được tài khoản khác liên kết.");
      q.setEmail.run(row.email, 1, req.user.id);
      res.json({ ok: true, email: row.email });
    } catch (e) {
      if (/UNIQUE/.test(e.message || "")) return send(res, new Fail("Email này vừa được tài khoản khác liên kết."));
      send(res, e);
    }
  });

  /** Go lien ket: bat buoc nhap mat khau de nguoi khac cam nham may khong go duoc */
  router.delete("/profile/email", (req, res) => {
    try {
      if (!auth.verify(String(req.body?.password || ""), req.user.password_hash)) throw new Fail("Mật khẩu chưa đúng.");
      q.setEmail.run(null, 0, req.user.id);
      eq.burnAll.run(req.user.id, "verify");
      eq.burnAll.run(req.user.id, "reset");
      res.json({ ok: true });
    } catch (e) { send(res, e); }
  });

  router.post("/profile/password", (req, res) => {
    try {
      const ip = req.ip || "?";
      if (auth.throttled(ip)) throw new Fail("Sai quá nhiều lần. Thử lại sau 10 phút.", 429);
      if (!auth.verify(String(req.body?.current || ""), req.user.password_hash)) {
        auth.noteFail(ip);
        throw new Fail("Mật khẩu hiện tại chưa đúng.");
      }
      checkNewPassword(req.body?.password);
      req.session.loginAt = setPassword(req.user.id, String(req.body.password)); // giu phien nay, huy phien khac
      res.json({ ok: true });
    } catch (e) { send(res, e); }
  });
}

/* ================= Cau hinh gui email (admin) ================= */

function registerAdmin(router, requireAdmin) {
  router.get("/admin/mail", requireAdmin, (req, res) => res.json(mailer.publicConfig()));

  router.post("/admin/mail", requireAdmin, (req, res) => {
    try {
      mailer.saveConfig(req.body || {});
      res.json({ ok: true, ...mailer.publicConfig() });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  /** Gui thu mot email de kiem tra cau hinh */
  router.post("/admin/mail/test", requireAdmin, async (req, res) => {
    const to = normEmail(req.body?.to);
    if (!validEmail(to)) return res.status(400).json({ error: "Nhập email nhận thử cho đúng." });
    try {
      await mailer.send({ to, ...mailer.codeMail({ code: "123456", purpose: "verify", minutes: CODE_MINUTES, username: req.user.username }) });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
}

module.exports = { registerPublic, registerPrivate, registerAdmin, maskEmail, setPassword, Fail };
