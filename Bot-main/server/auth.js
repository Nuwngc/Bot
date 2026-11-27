const bcrypt = require("bcryptjs");
const { q, getSetting } = require("./db");

/* ---------- Mat khau ---------- */

const hash = (plain) => bcrypt.hashSync(plain, 10);
const verify = (plain, digest) => bcrypt.compareSync(plain, digest);

/* ---------- Chong do mat khau ---------- */

const attempts = new Map(); // ip -> { n, until }
const MAX_TRY = 8;
const LOCK_MS = 10 * 60 * 1000;

function throttled(ip) {
  const a = attempts.get(ip);
  if (!a) return false;
  if (Date.now() > a.until) {
    attempts.delete(ip);
    return false;
  }
  return a.n >= MAX_TRY;
}

function noteFail(ip) {
  const a = attempts.get(ip) || { n: 0, until: Date.now() + LOCK_MS };
  a.n++;
  a.until = Date.now() + LOCK_MS;
  attempts.set(ip, a);
}

const noteOk = (ip) => attempts.delete(ip);

/* ---------- Phien dang nhap ---------- */

/** Bat dau phien dang nhap. loginAt de huy phien cu khi nguoi dung doi / dat lai mat khau. */
function startSession(req, userId) {
  req.session.userId = userId;
  req.session.loginAt = Date.now();
}

/* ---------- Middleware ---------- */

function requireLogin(req, res, next) {
  // req.path bi cat tien to khi dung trong router -> dung originalUrl
  const isApi = (req.originalUrl || "").startsWith("/api/");

  if (!req.session?.userId) {
    if (isApi) {
      return res.status(401).json({ error: "Chua dang nhap" });
    }
    return res.redirect("/login.html");
  }
  const user = q.userById.get(req.session.userId);
  if (!user || !user.active) {
    req.session.destroy(() => {});
    if (isApi) {
      return res.status(401).json({ error: "Tai khoan da bi khoa" });
    }
    return res.redirect("/login.html");
  }
  // Mat khau da doi sau khi phien nay duoc tao -> bat dang nhap lai
  if (user.pw_changed_at && (req.session.loginAt || 0) < user.pw_changed_at) {
    req.session.destroy(() => {});
    if (isApi) {
      return res.status(401).json({ error: "Mat khau da doi, hay dang nhap lai" });
    }
    return res.redirect("/login.html");
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Chi admin moi duoc lam viec nay" });
  }
  next();
}

/* ---------- Tu dang ky ---------- */

const signupIp = new Map(); // ip -> { n, day }

/** Moi IP toi da 3 tai khoan / ngay, tranh dang ky hang loat */
function signupQuota(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const rec = signupIp.get(ip);
  if (!rec || rec.day !== today) {
    signupIp.set(ip, { n: 1, day: today });
    return true;
  }
  if (rec.n >= 3) return false;
  rec.n++;
  return true;
}

function validUsername(u) {
  return /^[a-z0-9_.-]{3,24}$/.test(u);
}

/* ---------- Tao admin dau tien ---------- */

function bootstrapAdmin() {
  const n = q.countAdmins.get().n;
  if (n > 0) return null;

  const username = process.env.ADMIN_USER || "admin";
  const password = process.env.ADMIN_PASS;

  if (!password) {
    console.error(
      "\n[LOI] Chua co tai khoan admin nao va thieu bien ADMIN_PASS.\n" +
        "Dat ADMIN_USER / ADMIN_PASS trong bien moi truong roi chay lai.\n"
    );
    process.exit(1);
  }

  const existing = q.userByName.get(username);
  if (existing) {
    q.setPassword.run(hash(password), existing.id);
    console.log(`[auth] Da dat lai mat khau cho admin "${username}".`);
    return existing.id;
  }

  const info = q.insertUser.run(username, hash(password), "admin", null, 0);
  console.log(`[auth] Da tao tai khoan admin "${username}".`);
  return info.lastInsertRowid;
}

module.exports = {
  hash,
  verify,
  startSession,
  signupQuota,
  validUsername,
  throttled,
  noteFail,
  noteOk,
  requireLogin,
  requireAdmin,
  bootstrapAdmin,
};
