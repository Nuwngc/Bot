/**
 * VUOT LINK LAY COIN
 *
 *  Luong: khach bam "Vuot link" -> server tao token dung 1 lan -> goi API rut gon link cua
 *  nha cung cap (link4m, traffic24h...) voi link dich = /linkcoin/done?t=TOKEN -> khach vuot
 *  xong duoc chuyen ve -> server kiem tra token -> cong coin vao vi (wallet_tx.kind = 'task').
 *
 *  Coin kiem tu vuot link KHONG tinh vao bang xep hang nap (chi tinh kind = 'deposit').
 *  Nha cung cap + muc thuong + gioi han luot/ngay do admin khai bao trong tab "Vuot link".
 */

const crypto = require("crypto");
const { db } = require("./db");
const { encrypt, decrypt } = require("./crypto");
const wallet = require("./wallet");

db.exec(`
  CREATE TABLE IF NOT EXISTS link_providers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    api_url     TEXT NOT NULL,            -- mau co {token} va {url}
    token_enc   TEXT,
    reward      INTEGER NOT NULL DEFAULT 100,   -- coin moi luot
    daily_limit INTEGER NOT NULL DEFAULT 3,     -- luot / ngay / nguoi
    min_seconds INTEGER NOT NULL DEFAULT 20,    -- toi thieu tu luc tao link den luc quay ve
    active      INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS link_tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    token       TEXT UNIQUE NOT NULL,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id INTEGER NOT NULL,
    short_url   TEXT,
    reward      INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending | done
    created_ms  INTEGER NOT NULL,
    done_ms     INTEGER,
    ip          TEXT,
    ua_hash     TEXT
  );
  CREATE INDEX IF NOT EXISTS link_tasks_user ON link_tasks(user_id, provider_id, status);
`);

const TOKEN_TTL_MS = 30 * 60 * 1000; // link het han sau 30 phut
const MAX_PENDING = 5;               // so link dang cho cua 1 nguoi

const lq = {
  providers: db.prepare("SELECT * FROM link_providers ORDER BY id"),
  provider: db.prepare("SELECT * FROM link_providers WHERE id = ?"),
  insProvider: db.prepare(
    "INSERT INTO link_providers (name, api_url, token_enc, reward, daily_limit, min_seconds, active) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ),
  updProvider: db.prepare(
    "UPDATE link_providers SET name = ?, api_url = ?, token_enc = ?, reward = ?, daily_limit = ?, min_seconds = ?, active = ? WHERE id = ?"
  ),
  delProvider: db.prepare("DELETE FROM link_providers WHERE id = ?"),
  usedToday: db.prepare(
    "SELECT COUNT(*) AS n FROM link_tasks WHERE user_id = ? AND provider_id = ? AND status = 'done' AND done_ms >= ?"
  ),
  pending: db.prepare("SELECT * FROM link_tasks WHERE user_id = ? AND status = 'pending' AND created_ms >= ?"),
  pendingFor: db.prepare(
    "SELECT * FROM link_tasks WHERE user_id = ? AND provider_id = ? AND status = 'pending' AND created_ms >= ? ORDER BY id DESC LIMIT 1"
  ),
  insTask: db.prepare(
    "INSERT INTO link_tasks (token, user_id, provider_id, reward, created_ms, ip, ua_hash) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ),
  setShort: db.prepare("UPDATE link_tasks SET short_url = ? WHERE id = ?"),
  delTask: db.prepare("DELETE FROM link_tasks WHERE id = ?"),
  byToken: db.prepare("SELECT * FROM link_tasks WHERE token = ?"),
  finish: db.prepare("UPDATE link_tasks SET status = 'done', done_ms = ? WHERE id = ? AND status = 'pending'"),
  purge: db.prepare("DELETE FROM link_tasks WHERE status = 'pending' AND created_ms < ?"),
};

/* ---------- Tien ich ---------- */

/** 00:00 hom nay theo gio Viet Nam (UTC+7), tinh bang ms UTC */
function vnDayStart() {
  const vn = Date.now() + 7 * 3600e3;
  return vn - (vn % 86400000) - 7 * 3600e3;
}

const uaHash = (req) =>
  crypto.createHash("sha256").update(String(req.get("user-agent") || "")).digest("hex").slice(0, 16);

const intIn = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

function baseUrl(req) {
  const env = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");
  return env || `${req.protocol}://${req.get("host")}`;
}

/** Goi API rut gon link. Ho tro kieu pho bien: tra JSON { shortenedUrl } hoac chuoi URL tran. */
async function shorten(provider, destUrl) {
  const token = decrypt(provider.token_enc) || "";
  const endpoint = provider.api_url
    .replaceAll("{token}", encodeURIComponent(token))
    .replaceAll("{url}", encodeURIComponent(destUrl));

  const r = await fetch(endpoint, { signal: AbortSignal.timeout(10000), redirect: "follow" });
  const text = (await r.text()).trim();
  let out = "";
  try {
    const j = JSON.parse(text);
    out = j.shortenedUrl || j.shortened_url || j.short_url || j.shortUrl || j.url || j.data?.url || "";
    if (!out && (j.status === "error" || j.error)) throw new Error(String(j.message || j.error || "Nhà cung cấp báo lỗi"));
  } catch (e) {
    if (e instanceof SyntaxError) out = text; // khong phai JSON -> co the la URL tran
    else throw e;
  }
  if (!/^https?:\/\/\S+$/i.test(out)) throw new Error("Nhà cung cấp không trả về link hợp lệ");
  return out;
}

/**
 * Cho phep admin dan nguyen link mau cua nha cung cap
 * (vd https://link4m.co/api-shorten/v2?api=ABC&url=yourdestinationlink.com):
 * tu dong doi gia tri url= thanh {url} va tach api= thanh {token}.
 */
function normalizeApi(apiUrl, token) {
  let u = String(apiUrl || "").trim();
  let t = String(token || "").trim();
  if (!u.includes("{url}")) u = u.replace(/([?&]url=)[^&]*/i, "$1{url}");
  if (!u.includes("{token}")) {
    const m = u.match(/([?&](?:api|apikey|api_key|key|token)=)([^&{]+)/i);
    if (m) {
      if (!t) t = decodeURIComponent(m[2]);
      u = u.replace(m[0], m[1] + "{token}");
    }
  }
  return { apiUrl: u, token: t };
}

/* ---------- Bat dau mot luot ---------- */

async function start(req) {
  const user = req.user;
  const provider = lq.provider.get(Number(req.body?.providerId));
  if (!provider || !provider.active) throw new Error("Nhà cung cấp này đang tắt");
  if (!provider.token_enc) throw new Error("Nhà cung cấp chưa được cấu hình");

  const used = lq.usedToday.get(user.id, provider.id, vnDayStart()).n;
  if (used >= provider.daily_limit) throw new Error("Hôm nay bạn đã hết lượt ở nhà cung cấp này. Lượt mới có từ 00:00.");

  const since = Date.now() - TOKEN_TTL_MS;
  // Con link chua vuot, chua het han -> dung lai, khong tao them
  const old = lq.pendingFor.get(user.id, provider.id, since);
  if (old?.short_url) return { url: old.short_url, reward: old.reward };

  if (lq.pending.all(user.id, since).length >= MAX_PENDING) {
    throw new Error("Bạn đang có quá nhiều link chưa vượt. Hãy vượt hoặc đợi 30 phút.");
  }

  const token = crypto.randomBytes(24).toString("hex");
  const id = Number(lq.insTask.run(token, user.id, provider.id, provider.reward, Date.now(), req.ip, uaHash(req)).lastInsertRowid);
  try {
    const url = await shorten(provider, `${baseUrl(req)}/linkcoin/done?t=${token}`);
    lq.setShort.run(url, id);
    return { url, reward: provider.reward };
  } catch (e) {
    lq.delTask.run(id);
    throw new Error(e?.name === "TimeoutError" ? "Nhà cung cấp phản hồi quá chậm, thử lại sau" : e.message);
  }
}

/* ---------- Khach vuot xong, quay ve ---------- */

/** Mount o cap app: GET /linkcoin/done?t=TOKEN (can dang nhap, requireLogin tu chuyen ve trang dang nhap) */
function doneHandler(req, res) {
  const back = (ok, msg) =>
    res.redirect(`/dashboard.html?lc=${ok ? "ok" : "err"}&m=${encodeURIComponent(msg)}#linkcoin`);
  try {
    const t = lq.byToken.get(String(req.query.t || ""));
    if (!t || t.user_id !== req.user.id) return back(false, "Link không hợp lệ hoặc không thuộc tài khoản này");

    const provider = lq.provider.get(t.provider_id);
    if (!provider) return back(false, "Nhà cung cấp không còn tồn tại");
    if (t.status === "done") return back(false, "Link này đã được nhận coin rồi");

    const now = Date.now();
    if (now - t.created_ms > TOKEN_TTL_MS) return back(false, "Link đã hết hạn, hãy tạo link mới");
    if (now - t.created_ms < provider.min_seconds * 1000) return back(false, "Bạn vượt link quá nhanh nên không được tính");
    if (t.ua_hash !== uaHash(req)) return back(false, "Hãy vượt link bằng đúng trình duyệt đã bấm nút");

    const bal = wallet.tx(() => {
      if (lq.usedToday.get(t.user_id, t.provider_id, vnDayStart()).n >= provider.daily_limit) {
        throw new Error("Hôm nay bạn đã hết lượt ở nhà cung cấp này");
      }
      // changes = 0 nghia la mot request khac da nhan truoc -> khong cong lan 2
      if (lq.finish.run(now, t.id).changes !== 1) throw new Error("Link này đã được nhận coin rồi");
      return wallet.credit(t.user_id, "task", t.reward, `LINK${t.id}`, `Vượt link ${provider.name}`);
    });
    return back(true, `+${t.reward.toLocaleString("vi-VN")} coin (số dư ${bal.toLocaleString("vi-VN")})`);
  } catch (e) {
    return back(false, e.message || "Có lỗi xảy ra");
  }
}

/* ---------- Route (sau requireLogin) ---------- */

function register(router, auth) {
  const fail = (res, e) => res.status(400).json({ error: e.message });
  setInterval(() => { try { lq.purge.run(Date.now() - 24 * 3600e3); } catch (_) {} }, 3600e3).unref();

  router.get("/linkcoin", (req, res) => {
    const day = vnDayStart();
    res.json({
      balance: wallet.balance(req.user.id),
      providers: lq.providers.all().filter((p) => p.active && p.token_enc).map((p) => ({
        id: p.id, name: p.name, reward: p.reward, limit: p.daily_limit,
        used: lq.usedToday.get(req.user.id, p.id, day).n,
      })),
    });
  });

  router.post("/linkcoin/start", async (req, res) => {
    try { res.json({ ok: true, ...(await start(req)) }); } catch (e) { fail(res, e); }
  });

  // Quan tri
  router.get("/admin/linkcoin", auth.requireAdmin, (req, res) => {
    res.json({
      providers: lq.providers.all().map((p) => ({
        id: p.id, name: p.name, api_url: p.api_url, hasToken: !!p.token_enc,
        reward: p.reward, daily_limit: p.daily_limit, min_seconds: p.min_seconds, active: !!p.active,
      })),
    });
  });

  router.post("/admin/linkcoin", auth.requireAdmin, (req, res) => {
    try {
      const b = req.body || {};
      const name = String(b.name || "").trim().slice(0, 40);
      const norm = normalizeApi(b.api_url, b.token);
      const apiUrl = norm.apiUrl;
      if (!name) throw new Error("Thiếu tên nhà cung cấp");
      if (!/^https:\/\//i.test(apiUrl) || !apiUrl.includes("{url}")) {
        throw new Error("API URL phải bắt đầu bằng https:// và chứa {url} (và {token} nếu cần)");
      }
      const reward = intIn(b.reward, 1, 1e6, 100);
      const limit = intIn(b.daily_limit, 1, 100, 3);
      const minSec = intIn(b.min_seconds, 5, 600, 20);
      const active = b.active === false || b.active === 0 ? 0 : 1;
      const old = b.id ? lq.provider.get(Number(b.id)) : null;
      const newToken = norm.token;
      const tokenEnc = newToken ? encrypt(newToken) : old?.token_enc || null;
      if (old) lq.updProvider.run(name, apiUrl, tokenEnc, reward, limit, minSec, active, old.id);
      else lq.insProvider.run(name, apiUrl, tokenEnc, reward, limit, minSec, active);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  router.post("/admin/linkcoin/:id/delete", auth.requireAdmin, (req, res) => {
    lq.delProvider.run(Number(req.params.id));
    res.json({ ok: true });
  });
}

module.exports = { register, doneHandler, normalizeApi };
