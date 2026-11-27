/**
 * SHOP ACC: ban tai khoan game (Lien Quan, Free Fire, Blox Fruits, ...) bang coin trong vi.
 *
 *  - Tai khoan / mat khau / thong tin them cua moi acc duoc ma hoa AES-256-GCM (server/crypto.js, khoa
 *    APP_SECRET nam trong bien moi truong, KHONG nam trong database) TRUOC KHI ghi DB. Lo file database
 *    thi chi thay chuoi ma hoa. API khong bao gio tra tk/mk ve cho admin hay khach xem danh sach:
 *    chi nguoi VUA MUA (hoac xem lai don cua chinh minh) moi nhan duoc tk/mk.
 *  - Mua = 1 giao dich SQLite (BEGIN IMMEDIATE): kiem tra con hang -> tru coin -> danh dau da ban -> ghi don.
 *    Hai nguoi bam mua cung luc cung chi 1 nguoi duoc, khong ban trung 1 acc.
 *  - Acc random: admin dat 1 gia cho moi game; khach tra gia do va nhan 1 acc NGAU NHIEN trong kho random
 *    cua game (khach khong biet truoc la acc gi).
 *  - Coin tieu o day ghi vao wallet_tx.kind = 'shop' (khong tinh vao bang xep hang nap).
 *  - QTV xem lai tk/mk da ma hoa: phai nhap KHOA XEM (bien moi truong SHOP_VIEW_KEY; neu chua dat thi dung APP_SECRET)
 *    de mo khoa 10 phut cho phien dang nhap do. Nhap sai 5 lan bi khoa 15 phut. Moi lan xem deu ghi vao shop_view_log.
 *  - Anh acc / anh bia game: admin gui anh TRUC TIEP len server (POST /admin/shop/upload, da nen nho o trinh duyet).
 *    Anh luu trong bang shop_images (BLOB) voi ma ngau nhien 24 ky tu hex nen khong doan duoc dia chi anh cua acc
 *    random truoc khi mua. Van dung duoc link https:// nhu truoc. Acc nao (thuong hay random) cung doi / go anh duoc.
 */

const crypto = require("crypto");
const { db } = require("./db");
const { encrypt, decrypt } = require("./crypto");
const wallet = require("./wallet");

db.exec(`
  CREATE TABLE IF NOT EXISTS shop_games (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT UNIQUE NOT NULL,
    emoji        TEXT NOT NULL DEFAULT '🎮',
    random_price INTEGER NOT NULL DEFAULT 0,      -- 0 = chua mo mua random cho game nay
    active       INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS shop_accounts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id     INTEGER NOT NULL REFERENCES shop_games(id),
    kind        TEXT NOT NULL DEFAULT 'normal',   -- normal | random
    title       TEXT NOT NULL,
    description TEXT,
    image_url   TEXT,
    price       INTEGER NOT NULL DEFAULT 0,       -- chi dung cho acc normal
    user_enc    TEXT NOT NULL,                    -- DA MA HOA
    pass_enc    TEXT NOT NULL,                    -- DA MA HOA
    extra_enc   TEXT,                             -- DA MA HOA (mail khoi phuc, ghi chu dang nhap...)
    dup_hash    TEXT,                             -- HMAC(game + tai khoan): chong them trung, khong lo tai khoan that
    status      TEXT NOT NULL DEFAULT 'available',-- available | sold | hidden
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    sold_at     TEXT,
    buyer_id    INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS shop_acc_list ON shop_accounts(status, kind, game_id);
  CREATE UNIQUE INDEX IF NOT EXISTS shop_acc_dup ON shop_accounts(dup_hash) WHERE dup_hash IS NOT NULL;

  CREATE TABLE IF NOT EXISTS shop_orders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT UNIQUE NOT NULL,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES shop_accounts(id),
    game_name  TEXT NOT NULL,
    title      TEXT NOT NULL,
    kind       TEXT NOT NULL,
    price      INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS shop_orders_user ON shop_orders(user_id, id);

  CREATE TABLE IF NOT EXISTS shop_view_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id   INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shop_images (
    id         TEXT PRIMARY KEY,                 -- 24 ky tu hex ngau nhien (khong doan duoc)
    mime       TEXT NOT NULL,
    data       BLOB NOT NULL,
    size       INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Anh bia cho game (DB cu chua co cot nay)
if (!db.prepare("PRAGMA table_info(shop_games)").all().some((c) => c.name === "image_url")) {
  db.exec("ALTER TABLE shop_games ADD COLUMN image_url TEXT");
}

// Lan dau: tao san vai game pho bien, admin them / sua / xoa tuy y trong tab Shop acc
if (db.prepare("SELECT COUNT(*) AS n FROM shop_games").get().n === 0) {
  const ins = db.prepare("INSERT INTO shop_games (name, emoji) VALUES (?, ?)");
  [["Liên Quân Mobile", "⚔️"], ["Free Fire", "🔥"], ["Blox Fruits", "🍎"]].forEach(([n, e]) => ins.run(n, e));
}

const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");

/** Che tai khoan khi admin xem danh sach: "ab***" (khong lo phan con lai) */
const maskUser = (u) => (u.length <= 2 ? "*".repeat(u.length) : u.slice(0, 2) + "***");

// Khoa rieng (dan xuat tu APP_SECRET) de bam tai khoan chong trung
const DUP_KEY = crypto.createHash("sha256").update("shop-dup:" + process.env.APP_SECRET).digest();
const dupHash = (gameId, username) =>
  crypto.createHmac("sha256", DUP_KEY).update(`${gameId}:${String(username).trim().toLowerCase()}`).digest("hex");

const sq = {
  games: db.prepare("SELECT * FROM shop_games ORDER BY id"),
  game: db.prepare("SELECT * FROM shop_games WHERE id = ?"),
  gameByName: db.prepare("SELECT id FROM shop_games WHERE lower(name) = lower(?)"),
  insGame: db.prepare("INSERT INTO shop_games (name, emoji, random_price, active, image_url) VALUES (?, ?, ?, ?, ?)"),
  updGame: db.prepare("UPDATE shop_games SET name = ?, emoji = ?, random_price = ?, active = ?, image_url = ? WHERE id = ?"),
  delGame: db.prepare("DELETE FROM shop_games WHERE id = ?"),
  gameAccCount: db.prepare("SELECT COUNT(*) AS n FROM shop_accounts WHERE game_id = ?"),
  stock: db.prepare(
    `SELECT game_id, kind, COUNT(*) AS n FROM shop_accounts WHERE status = 'available' GROUP BY game_id, kind`
  ),
  // Anh dung lam banner cho the Random: anh cua acc random moi nhat con ban cua game do (co anh)
  randomBanner: db.prepare(
    `SELECT game_id, image_url, MAX(id) FROM shop_accounts
      WHERE kind = 'random' AND status = 'available' AND image_url IS NOT NULL AND image_url != '' GROUP BY game_id`
  ),
  soldByGame: db.prepare(`SELECT game_id, COUNT(*) AS n FROM shop_accounts WHERE status = 'sold' GROUP BY game_id`),
  insImage: db.prepare("INSERT INTO shop_images (id, mime, data, size) VALUES (?, ?, ?, ?)"),
  image: db.prepare("SELECT mime, data FROM shop_images WHERE id = ?"),
  imageExists: db.prepare("SELECT 1 AS ok FROM shop_images WHERE id = ?"),
  delImage: db.prepare("DELETE FROM shop_images WHERE id = ?"),
  imageInUse: db.prepare(
    `SELECT (SELECT COUNT(*) FROM shop_accounts WHERE image_url = ?) + (SELECT COUNT(*) FROM shop_games WHERE image_url = ?) AS n`
  ),
  sweepImages: db.prepare(
    `DELETE FROM shop_images
      WHERE created_at < datetime('now', '-1 hour')
        AND NOT EXISTS (SELECT 1 FROM shop_accounts WHERE image_url = '/api/shop/img/' || shop_images.id)
        AND NOT EXISTS (SELECT 1 FROM shop_games WHERE image_url = '/api/shop/img/' || shop_images.id)`
  ),
  listNormal: db.prepare(
    `SELECT a.id, a.game_id, a.title, a.description, a.image_url, a.price
       FROM shop_accounts a JOIN shop_games g ON g.id = a.game_id
      WHERE a.status = 'available' AND a.kind = 'normal' AND g.active = 1
      ORDER BY a.id DESC LIMIT 300`
  ),
  acc: db.prepare("SELECT * FROM shop_accounts WHERE id = ?"),
  insAcc: db.prepare(
    `INSERT INTO shop_accounts (game_id, kind, title, description, image_url, price, user_enc, pass_enc, extra_enc, dup_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  updAccMeta: db.prepare("UPDATE shop_accounts SET title = ?, description = ?, image_url = ?, price = ? WHERE id = ?"),
  updAccCred: db.prepare("UPDATE shop_accounts SET user_enc = ?, pass_enc = ?, extra_enc = ?, dup_hash = ? WHERE id = ?"),
  setStatus: db.prepare("UPDATE shop_accounts SET status = ? WHERE id = ?"),
  delAcc: db.prepare("DELETE FROM shop_accounts WHERE id = ? AND status != 'sold'"),
  markSold: db.prepare(
    "UPDATE shop_accounts SET status = 'sold', buyer_id = ?, sold_at = datetime('now') WHERE id = ? AND status = 'available'"
  ),
  randomCount: db.prepare("SELECT COUNT(*) AS n FROM shop_accounts WHERE game_id = ? AND kind = 'random' AND status = 'available'"),
  randomAt: db.prepare(
    "SELECT * FROM shop_accounts WHERE game_id = ? AND kind = 'random' AND status = 'available' ORDER BY id LIMIT 1 OFFSET ?"
  ),
  insOrder: db.prepare(
    "INSERT INTO shop_orders (code, user_id, account_id, game_name, title, kind, price) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ),
  orderById: db.prepare("SELECT * FROM shop_orders WHERE id = ?"),
  orderByCode: db.prepare("SELECT id FROM shop_orders WHERE code = ?"),
  ordersByUser: db.prepare("SELECT id, code, game_name, title, kind, price, created_at FROM shop_orders WHERE user_id = ? ORDER BY id DESC LIMIT 100"),
  adminAccs: db.prepare(
    `SELECT a.id, a.game_id, g.name AS game_name, a.kind, a.title, a.price, a.status, a.image_url, a.user_enc, a.created_at, a.sold_at, u.username AS buyer
       FROM shop_accounts a JOIN shop_games g ON g.id = a.game_id LEFT JOIN users u ON u.id = a.buyer_id
      WHERE (? = '' OR a.status = ?) AND (? = 0 OR a.game_id = ?)
      ORDER BY a.id DESC LIMIT 200`
  ),
  revealById: db.prepare(
    `SELECT a.*, g.name AS game_name, u.username AS buyer
       FROM shop_accounts a JOIN shop_games g ON g.id = a.game_id LEFT JOIN users u ON u.id = a.buyer_id
      WHERE a.id = ?`
  ),
  revealList: db.prepare(
    `SELECT a.*, g.name AS game_name, u.username AS buyer
       FROM shop_accounts a JOIN shop_games g ON g.id = a.game_id LEFT JOIN users u ON u.id = a.buyer_id
      WHERE (? = '' OR a.status = ?) AND (? = 0 OR a.game_id = ?)
      ORDER BY a.id DESC LIMIT 200`
  ),
  insViewLog: db.prepare("INSERT INTO shop_view_log (admin_id, account_id) VALUES (?, ?)"),
  adminOrders: db.prepare(
    `SELECT o.id, o.code, o.game_name, o.title, o.kind, o.price, o.created_at, u.username
       FROM shop_orders o JOIN users u ON u.id = o.user_id ORDER BY o.id DESC LIMIT 50`
  ),
  adminStats: db.prepare(
    `SELECT status, COUNT(*) AS n FROM shop_accounts GROUP BY status`
  ),
};

/* ---------- Tien ich ---------- */

const intIn = (v, min, max, dflt) => {
  const n = Math.round(Number(String(v ?? "").replace(/[^0-9-]/g, "")));
  return Number.isFinite(n) && n >= min && n <= max ? n : dflt;
};
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);

const IMG_PREFIX = "/api/shop/img/";
const IMG_PATH = /^\/api\/shop\/img\/([a-f0-9]{24})$/;
const MAX_IMG_BYTES = 3 * 1024 * 1024;

/** Link anh hop le: https://... (link ngoai) hoac anh vua tai len server (/api/shop/img/<ma>). "" -> khong co anh. */
function cleanImage(u) {
  u = clean(u, 400);
  if (!u) return null;
  const m = IMG_PATH.exec(u);
  if (m) {
    if (!sq.imageExists.get(m[1])) throw new Error("Ảnh vừa tải lên không còn trên server, hãy chọn lại ảnh.");
    return u;
  }
  if (!/^https:\/\/[^\s"'<>]+$/i.test(u)) throw new Error("Link ảnh phải bắt đầu bằng https:// và không chứa khoảng trắng");
  return u;
}

/** Nhan dang dinh dang that cua file anh bang chu ky dau file (khong tin Content-Type do client gui). */
function sniffImage(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  const g = b.toString("latin1", 0, 6);
  if (g === "GIF87a" || g === "GIF89a") return "image/gif";
  return null;
}

function saveImage(buf) {
  if (!buf || !buf.length) throw new Error("Chưa nhận được ảnh");
  if (buf.length > MAX_IMG_BYTES) throw new Error("Ảnh quá lớn (tối đa 3 MB sau khi nén)");
  const mime = sniffImage(buf);
  if (!mime) throw new Error("Chỉ nhận ảnh JPG, PNG, WebP hoặc GIF");
  const id = crypto.randomBytes(12).toString("hex");
  sq.insImage.run(id, mime, buf, buf.length);
  return IMG_PREFIX + id;
}

/** Anh khong con acc / game nao dung nua thi xoa khoi DB (goi sau khi doi / go / xoa anh). */
function dropIfOrphan(url) {
  const m = url && IMG_PATH.exec(url);
  if (m && sq.imageInUse.get(url, url).n === 0) sq.delImage.run(m[1]);
}

// Anh tai len nhung khong gan vao acc / game nao (bo giua chung, dong form...) bi don sau 1 gio
const sweep = () => { try { sq.sweepImages.run(); } catch (e) { console.error("[shop] don anh thua loi:", e.message); } };
sweep();
setInterval(sweep, 3600e3).unref();

/** Doc nguyen body anh (khong can express.raw), dung o khi vuot gioi han va tra loi bang tieng Viet. */
function readImageBody(req, res, next) {
  const declared = Number(req.headers["content-length"]);
  if (declared > MAX_IMG_BYTES) return res.status(413).json({ error: "Ảnh quá lớn (tối đa 3 MB sau khi nén)" });
  const chunks = [];
  let size = 0;
  let done = false;
  req.on("data", (c) => {
    if (done) return;
    size += c.length;
    if (size > MAX_IMG_BYTES) {
      done = true;
      res.status(413).json({ error: "Ảnh quá lớn (tối đa 3 MB sau khi nén)" });
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", () => { if (done) return; done = true; req.imageBuffer = Buffer.concat(chunks); next(); });
  req.on("error", () => { if (!done) { done = true; res.status(400).json({ error: "Tải ảnh bị gián đoạn, thử lại nhé." }); } });
}

function orderCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c;
  do {
    c = "ACC" + Array.from(crypto.randomBytes(6)).map((b) => alphabet[b % alphabet.length]).join("");
  } while (sq.orderByCode.get(c));
  return c;
}

/**
 * Tach cac dong "tai_khoan|mat_khau|thong_tin_them" hoac "tai_khoan:mat_khau".
 * Co dau | thi tach theo |, khong thi tach o dau : dau tien (mat khau co the chua dau :).
 */
function parseLines(text) {
  const out = [];
  const bad = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/^\uFEFF/, "").trim();
    if (!line) return;
    let parts;
    if (line.includes("|")) parts = line.split("|").map((s) => s.trim());
    else {
      const k = line.indexOf(":");
      parts = k < 0 ? [line] : [line.slice(0, k).trim(), line.slice(k + 1).trim()];
    }
    const [user, pass, ...rest] = parts;
    const extra = rest.join(" | ").trim();
    if (!user || !pass || user.length > 200 || pass.length > 200 || extra.length > 500) bad.push(i + 1);
    else out.push({ user, pass, extra });
  });
  return { items: out, bad };
}

/** Giai ma 1 acc de giao cho khach. Tra null neu khong giai ma duoc (doi APP_SECRET / du lieu hong). */
function reveal(a) {
  const username = decrypt(a.user_enc);
  const password = decrypt(a.pass_enc);
  if (username == null || password == null) return null;
  return { username, password, extra: decrypt(a.extra_enc) || "" };
}

const orderView = (o) => ({ id: o.id, code: o.code, game: o.game_name, title: o.title, kind: o.kind, price: o.price, created_at: o.created_at });

/* ---------- Mua hang ---------- */

const buys = new Map(); // userId -> [thoi diem] chong bam mua dong loat
function buyThrottle(userId) {
  const now = Date.now();
  const list = (buys.get(userId) || []).filter((t) => now - t < 60e3);
  if (list.length >= 8) throw new Error("Bạn thao tác quá nhanh, thử lại sau ít phút.");
  list.push(now);
  buys.set(userId, list);
}
setInterval(() => { const now = Date.now(); for (const [k, v] of buys) if (!v.some((t) => now - t < 60e3)) buys.delete(k); }, 5 * 60e3).unref();

/**
 * Hoan tat mua mot acc (goi TRONG wallet.tx). Tra ve { order, creds } hoac { bad: true } neu acc hong
 * (da duoc an de khong ban nua, khach chua bi tru coin).
 */
function settle(user, a, game, price, kind, badIds) {
  const creds = reveal(a);
  if (!creds) {
    sq.setStatus.run("hidden", a.id);
    badIds.push(a.id);
    return { bad: true };
  }
  if (sq.markSold.run(user.id, a.id).changes !== 1) throw new Error("Acc này vừa có người khác mua.");
  const bal = wallet.balance(user.id);
  if (price > bal) throw new Error(`Số dư không đủ: cần ${fmt(price)} coin, ví đang có ${fmt(bal)}. Hãy nạp thêm ở tab Nạp tiền.`);
  const code = orderCode();
  if (price > 0) wallet.credit(user.id, "shop", -price, code, `Mua acc ${game.name}${kind === "random" ? " (random)" : ""} · ${code}`);
  const id = Number(sq.insOrder.run(code, user.id, a.id, game.name, kind === "random" ? `Acc random ${game.name}` : a.title, kind, price).lastInsertRowid);
  return { order: sq.orderById.get(id), creds, image: a.image_url || null };
}

/** Acc hong du lieu bi an; ghi lai ca khi giao dich mua that bai (rollback) de khong lap lai o lan sau. */
const hideBad = (ids) => ids.forEach((id) => sq.setStatus.run("hidden", id));

function buyNormal(user, accId) {
  buyThrottle(user.id);
  const bad = [];
  let r;
  try {
    r = wallet.tx(() => {
      const a = sq.acc.get(accId);
      if (!a || a.kind !== "normal" || a.status !== "available") throw new Error("Acc này đã có người mua hoặc không còn bán.");
      const game = sq.game.get(a.game_id);
      if (!game || !game.active) throw new Error("Game này đang tạm đóng.");
      return settle(user, a, game, a.price, "normal", bad);
    });
  } finally { hideBad(bad); }
  if (r.bad) throw new Error("Acc này đang bị lỗi dữ liệu nên đã được ẩn. Bạn chưa bị trừ coin, hãy chọn acc khác.");
  return { order: { ...orderView(r.order), image: r.image }, credentials: r.creds, balance: wallet.balance(user.id) };
}

function buyRandom(user, gameId) {
  buyThrottle(user.id);
  const bad = [];
  let r;
  try {
  r = wallet.tx(() => {
    const game = sq.game.get(gameId);
    if (!game || !game.active) throw new Error("Game này đang tạm đóng.");
    if (!(game.random_price > 0)) throw new Error("Game này chưa mở mua acc random.");
    for (let tries = 0; tries < 5; tries++) {
      const n = sq.randomCount.get(game.id).n;
      if (!n) throw new Error("Kho acc random của game này đã hết, quay lại sau nhé.");
      const a = sq.randomAt.get(game.id, crypto.randomInt(n)); // ngau nhien that su (CSPRNG), khong doan truoc duoc
      const res = settle(user, a, game, game.random_price, "random", bad);
      if (!res.bad) return res;
    }
    throw new Error("Hệ thống đang kiểm tra kho acc, thử lại sau ít phút.");
  });
  } finally { hideBad(bad); }
  return { order: { ...orderView(r.order), image: r.image }, credentials: r.creds, balance: wallet.balance(user.id) };
}

/* ---------- QTV xem lai acc da ma hoa (can khoa xem) ---------- */

// Khoa xem: SHOP_VIEW_KEY (nen dat rieng, khac APP_SECRET). Chua dat thi dung APP_SECRET.
const VIEW_KEY_SRC = process.env.SHOP_VIEW_KEY || process.env.APP_SECRET;
const VIEW_KEY_HASH = crypto.createHash("sha256").update("shop-view:" + VIEW_KEY_SRC).digest();
const viewKeyOk = (input) =>
  crypto.timingSafeEqual(crypto.createHash("sha256").update("shop-view:" + String(input ?? "")).digest(), VIEW_KEY_HASH);
const VIEW_TTL = 10 * 60e3;       // mo khoa co hieu luc 10 phut
const VIEW_MAX_FAIL = 5, VIEW_LOCK = 15 * 60e3;
const viewFails = new Map();      // adminId -> { n, until }

const unlockLeft = (req) =>
  req.session?.shopViewUser === req.user.id ? Math.max(0, (req.session.shopViewUntil || 0) - Date.now()) : 0;

function revealRow(a, adminId) {
  const c = reveal(a);
  sq.insViewLog.run(adminId, a.id);
  return {
    id: a.id, game_name: a.game_name, kind: a.kind, title: a.title, status: a.status, buyer: a.buyer || null,
    username: c ? c.username : null, password: c ? c.password : null, extra: c ? c.extra : "",
    error: c ? null : "Không giải mã được (đã đổi APP_SECRET hoặc dữ liệu hỏng)",
  };
}

/* ---------- Route ---------- */

function register(router, auth) {
  const fail = (res, e) => res.status(400).json({ error: e.message });
  const noStore = (res) => res.setHeader("Cache-Control", "no-store");

  /* ===== Khach hang ===== */

  router.get("/shop", (req, res) => {
    const stock = {};
    for (const r of sq.stock.all()) (stock[r.game_id] ||= {})[r.kind] = r.n;
    const sold = Object.fromEntries(sq.soldByGame.all().map((r) => [r.game_id, r.n]));
    const banner = Object.fromEntries(sq.randomBanner.all().map((r) => [r.game_id, r.image_url]));
    res.json({
      balance: wallet.balance(req.user.id),
      games: sq.games.all().filter((g) => g.active).map((g) => ({
        id: g.id, name: g.name, emoji: g.emoji, image: g.image_url || null,
        randomPrice: g.random_price, randomStock: stock[g.id]?.random || 0, normalStock: stock[g.id]?.normal || 0,
        sold: sold[g.id] || 0, randomImage: banner[g.id] || null,
      })),
      accounts: sq.listNormal.all(),
    });
  });

  // Phuc vu anh da tai len. Chi nguoi da dang nhap xem duoc; ma anh 24 ky tu ngau nhien nen khong doan duoc.
  router.get("/shop/img/:id", (req, res) => {
    const id = String(req.params.id);
    const row = /^[a-f0-9]{24}$/.test(id) ? sq.image.get(id) : null;
    if (!row) return res.status(404).json({ error: "Không tìm thấy ảnh" });
    res.setHeader("Content-Type", row.mime);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Cache-Control", "private, max-age=604800, immutable"); // doi anh = ma moi nen cache lau duoc
    res.end(Buffer.from(row.data));
  });

  router.post("/shop/buy", (req, res) => {
    noStore(res);
    try { res.json({ ok: true, ...buyNormal(req.user, Number(req.body?.id)) }); } catch (e) { fail(res, e); }
  });

  router.post("/shop/random", (req, res) => {
    noStore(res);
    try { res.json({ ok: true, ...buyRandom(req.user, Number(req.body?.game_id)) }); } catch (e) { fail(res, e); }
  });

  router.get("/shop/orders", (req, res) => {
    noStore(res);
    res.json({ orders: sq.ordersByUser.all(req.user.id) });
  });

  // Xem lai tk/mk cua don CUA CHINH MINH
  router.get("/shop/orders/:id", (req, res) => {
    noStore(res);
    const o = sq.orderById.get(Number(req.params.id));
    if (!o || o.user_id !== req.user.id) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
    const a = sq.acc.get(o.account_id);
    const creds = a && reveal(a);
    if (!creds) return res.status(500).json({ error: "Không đọc được dữ liệu acc này, hãy liên hệ admin kèm mã đơn " + o.code });
    res.json({ order: { ...orderView(o), image: a.image_url || null }, credentials: creds });
  });

  /* ===== Quan tri ===== */

  router.get("/admin/shop", auth.requireAdmin, (req, res) => {
    const status = ["available", "sold", "hidden"].includes(req.query.status) ? req.query.status : "";
    const gameId = intIn(req.query.game, 0, 1e9, 0);
    const stock = {};
    for (const r of db.prepare("SELECT game_id, kind, status, COUNT(*) AS n FROM shop_accounts GROUP BY game_id, kind, status").all()) {
      const s = (stock[r.game_id] ||= { normal: 0, random: 0, sold: 0 });
      if (r.status === "available") s[r.kind] += r.n;
      else if (r.status === "sold") s.sold += r.n;
    }
    const totals = Object.fromEntries(sq.adminStats.all().map((r) => [r.status, r.n]));
    res.json({
      games: sq.games.all().map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, image_url: g.image_url || null, random_price: g.random_price, active: !!g.active, stock: stock[g.id] || { normal: 0, random: 0, sold: 0 } })),
      totals,
      // Danh sach chi hien tai khoan da che (ab***yz), KHONG tra mat khau
      accounts: sq.adminAccs.all(status, status, gameId, gameId).map((a) => {
        const u = decrypt(a.user_enc);
        return {
          id: a.id, game_id: a.game_id, game_name: a.game_name, kind: a.kind, title: a.title, price: a.price, status: a.status, image_url: a.image_url || null,
          masked: u == null ? "(lỗi giải mã)" : maskUser(u), created_at: a.created_at, sold_at: a.sold_at, buyer: a.buyer || null,
        };
      }),
      orders: sq.adminOrders.all(),
    });
  });

  router.post("/admin/shop/games", auth.requireAdmin, (req, res) => {
    try {
      const b = req.body || {};
      const name = clean(b.name, 40);
      if (!name) throw new Error("Thiếu tên game");
      const emoji = clean(b.emoji, 8) || "🎮";
      const price = intIn(b.random_price, 0, 1e8, 0);
      const active = b.active === false || b.active === 0 ? 0 : 1;
      const same = sq.gameByName.get(name);
      if (b.id) {
        const g = sq.game.get(Number(b.id));
        if (!g) throw new Error("Không tìm thấy game");
        if (same && same.id !== g.id) throw new Error("Đã có game trùng tên");
        const image = b.image_url === undefined ? g.image_url : cleanImage(b.image_url);
        sq.updGame.run(name, emoji, price, active, image, g.id);
        if (image !== g.image_url) dropIfOrphan(g.image_url);
      } else {
        if (same) throw new Error("Đã có game trùng tên");
        sq.insGame.run(name, emoji, price, active, cleanImage(b.image_url));
      }
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  router.post("/admin/shop/games/:id/delete", auth.requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (sq.gameAccCount.get(id).n > 0) return res.status(400).json({ error: "Game này còn acc (kể cả acc đã bán). Hãy tắt game thay vì xoá." });
    const g = sq.game.get(id);
    sq.delGame.run(id);
    if (g) dropIfOrphan(g.image_url);
    res.json({ ok: true });
  });

  /** Admin gui anh truc tiep (body = file anh). Trinh duyet da nen nho ve toi da ~1280px truoc khi gui. */
  router.post("/admin/shop/upload", auth.requireAdmin, readImageBody, (req, res) => {
    noStore(res);
    try { res.json({ ok: true, url: saveImage(req.imageBuffer) }); } catch (e) { fail(res, e); }
  });

  /** Them 1 hoac nhieu acc cung luc (moi dong 1 acc). Tk/mk duoc ma hoa ngay tai day roi moi ghi DB. */
  router.post("/admin/shop/accounts", auth.requireAdmin, (req, res) => {
    try {
      const b = req.body || {};
      const game = sq.game.get(Number(b.game_id));
      if (!game) throw new Error("Hãy chọn game");
      const kind = b.kind === "random" ? "random" : "normal";
      const title = clean(b.title, 80);
      if (kind === "normal" && !title) throw new Error("Acc thường cần có tiêu đề (vd: Rank Cao Thủ, 80 tướng, 150 skin)");
      const description = clean(b.description, 1000) || null;
      const image = cleanImage(b.image_url);
      const price = kind === "normal" ? intIn(b.price, 1, 1e8, 0) : 0;
      if (kind === "normal" && !price) throw new Error("Giá acc từ 1 đến 100.000.000 coin");
      const { items, bad } = parseLines(b.lines);
      if (bad.length) throw new Error(`Dòng ${bad.slice(0, 8).join(", ")} sai định dạng. Mỗi dòng: tài_khoản|mật_khẩu (hoặc tài_khoản:mật_khẩu)`);
      if (!items.length) throw new Error("Chưa có dòng tài khoản nào");
      if (items.length > 200) throw new Error("Mỗi lần thêm tối đa 200 acc");
      if (kind === "normal" && items.length > 1) throw new Error("Acc thường có tiêu đề / giá riêng nên thêm từng acc một. Muốn thêm nhiều acc cùng lúc, dùng loại Random.");

      let added = 0, dup = 0;
      wallet.tx(() => {
        for (const it of items) {
          const h = dupHash(game.id, it.user);
          try {
            sq.insAcc.run(game.id, kind, title || `Acc random ${game.name}`, description, image, price, encrypt(it.user), encrypt(it.pass), encrypt(it.extra), h);
            added++;
          } catch (e) {
            if (/UNIQUE/i.test(e.message)) dup++; else throw e;
          }
        }
      });
      res.json({ ok: true, added, duplicated: dup });
    } catch (e) { fail(res, e); }
  });

  router.post("/admin/shop/accounts/:id", auth.requireAdmin, (req, res) => {
    try {
      const a = sq.acc.get(Number(req.params.id));
      if (!a) throw new Error("Không tìm thấy acc");
      if (a.status === "sold") throw new Error("Acc đã bán không sửa được");
      const b = req.body || {};
      const title = clean(b.title ?? a.title, 80) || a.title;
      const description = b.description === undefined ? a.description : clean(b.description, 1000) || null;
      const image = b.image_url === undefined ? a.image_url : cleanImage(b.image_url);
      const price = a.kind === "normal" && b.price !== undefined ? intIn(b.price, 1, 1e8, 0) : a.price;
      if (a.kind === "normal" && !price) throw new Error("Giá acc từ 1 đến 100.000.000 coin");
      sq.updAccMeta.run(title, description, image, price, a.id);
      if (image !== a.image_url) dropIfOrphan(a.image_url);
      // Doi tk/mk (tuy chon): ma hoa lai
      if (b.username || b.password) {
        const user = clean(b.username, 200) || decrypt(a.user_enc);
        const pass = clean(b.password, 200) || decrypt(a.pass_enc);
        if (!user || !pass) throw new Error("Thiếu tài khoản hoặc mật khẩu");
        const extra = b.extra === undefined ? decrypt(a.extra_enc) || "" : clean(b.extra, 500);
        try { sq.updAccCred.run(encrypt(user), encrypt(pass), encrypt(extra), dupHash(a.game_id, user), a.id); }
        catch (e) { throw new Error(/UNIQUE/i.test(e.message) ? "Tài khoản này đã có trong kho" : e.message); }
      }
      if (b.status === "hidden" || b.status === "available") sq.setStatus.run(b.status, a.id);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  /* ---- Xem lai tk/mk da ma hoa (chi admin, can khoa xem) ---- */

  router.get("/admin/shop/view-status", auth.requireAdmin, (req, res) => {
    noStore(res);
    res.json({ unlocked_ms: unlockLeft(req), own_key: !!process.env.SHOP_VIEW_KEY });
  });

  router.post("/admin/shop/unlock", auth.requireAdmin, (req, res) => {
    noStore(res);
    const f = viewFails.get(req.user.id);
    if (f && Date.now() < f.until && f.n >= VIEW_MAX_FAIL) {
      return res.status(429).json({ error: `Nhập sai quá nhiều lần, thử lại sau ${Math.ceil((f.until - Date.now()) / 60e3)} phút.` });
    }
    if (!viewKeyOk(req.body?.key)) {
      const n = f && Date.now() < f.until ? f.n + 1 : 1;
      viewFails.set(req.user.id, { n, until: Date.now() + VIEW_LOCK });
      return res.status(403).json({ error: "Khoá xem không đúng." });
    }
    viewFails.delete(req.user.id);
    req.session.shopViewUser = req.user.id;
    req.session.shopViewUntil = Date.now() + VIEW_TTL;
    res.json({ ok: true, unlocked_ms: VIEW_TTL });
  });

  router.post("/admin/shop/lock", auth.requireAdmin, (req, res) => {
    noStore(res);
    if (req.session) { delete req.session.shopViewUser; delete req.session.shopViewUntil; }
    res.json({ ok: true });
  });

  /** Giai ma de xem: body { ids: [..] } (toi da 200) hoac { status, game } = danh sach dang loc o Kho acc. */
  router.post("/admin/shop/reveal", auth.requireAdmin, (req, res) => {
    noStore(res);
    if (!unlockLeft(req)) return res.status(403).json({ error: "Cần nhập khoá xem để xem tài khoản.", locked: true });
    try {
      const b = req.body || {};
      let rows;
      if (Array.isArray(b.ids)) {
        const ids = [...new Set(b.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 200);
        rows = ids.map((id) => sq.revealById.get(id)).filter(Boolean);
      } else {
        const status = ["available", "sold", "hidden"].includes(b.status) ? b.status : "";
        const gameId = intIn(b.game, 0, 1e9, 0);
        rows = sq.revealList.all(status, status, gameId, gameId);
      }
      res.json({ ok: true, items: rows.map((a) => revealRow(a, req.user.id)) });
    } catch (e) { fail(res, e); }
  });

  router.post("/admin/shop/accounts/:id/delete", auth.requireAdmin, (req, res) => {
    const old = sq.acc.get(Number(req.params.id));
    const r = sq.delAcc.run(Number(req.params.id));
    if (!r.changes) return res.status(400).json({ error: "Không xoá được (acc đã bán được giữ lại để đối chiếu đơn)" });
    if (old) dropIfOrphan(old.image_url);
    res.json({ ok: true });
  });
}

module.exports = { register };
