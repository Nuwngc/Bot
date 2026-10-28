/**
 * Database - dung node:sqlite co san trong Node >= 22.
 * Khong can bien dich native nen cai duoc tren Termux/Android va Render.
 */

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "app.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_login    TEXT
  );

  CREATE TABLE IF NOT EXISTS bots (
    user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    appstate_enc  TEXT,
    ai_key_enc    TEXT,
    prefix        TEXT NOT NULL DEFAULT '!',
    ai_model      TEXT,
    ai_system     TEXT,
    autostart     INTEGER NOT NULL DEFAULT 0,
    fb_name       TEXT,
    fb_uid        TEXT,
    updated_at    TEXT
  );

  -- Don thue bot
  CREATE TABLE IF NOT EXISTS orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code        TEXT UNIQUE NOT NULL,   -- noi dung chuyen khoan
    plan        TEXT NOT NULL,          -- ma goi
    days        INTEGER NOT NULL,
    amount      INTEGER NOT NULL,       -- VND
    status      TEXT NOT NULL DEFAULT 'pending', -- pending | paid | cancelled
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at     TEXT,
    note        TEXT
  );

  -- Cau hinh chung dang key-value
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

/* ---------- Migration cho DB tao tu ban cu ---------- */

function columns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

function addColumn(table, name, ddl) {
  if (!columns(table).includes(name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
    console.log(`[db] them cot ${table}.${name}`);
  }
}

addColumn("users", "plan_expires", "TEXT");       // han su dung, NULL = chua kich hoat
addColumn("users", "self_signup", "INTEGER NOT NULL DEFAULT 0");
// Goi Facebook / Zalo tinh rieng (xem billing.js). Phai them cot TRUOC khi
// chuan bi cau lenh ben duoi, neu khong "SELECT *" se tra ve lech cot.
addColumn("users", "fb_expires", "TEXT");
addColumn("users", "zalo_expires", "TEXT");
addColumn("users", "fb_slots", "INTEGER NOT NULL DEFAULT 1");
addColumn("users", "zalo_slots", "INTEGER NOT NULL DEFAULT 1");
addColumn("orders", "product", "TEXT NOT NULL DEFAULT 'fb'");
addColumn("orders", "bots", "INTEGER NOT NULL DEFAULT 1");
// Thanh toan theo TUNG BOT + ma giam gia
addColumn("orders", "bot_id", "INTEGER");
addColumn("orders", "bot_name", "TEXT");
addColumn("orders", "coupon", "TEXT");
addColumn("orders", "base_amount", "INTEGER");
addColumn("orders", "discount", "INTEGER NOT NULL DEFAULT 0");
addColumn("users", "trial_fb_used", "INTEGER NOT NULL DEFAULT 0");
addColumn("users", "trial_zalo_used", "INTEGER NOT NULL DEFAULT 0");

/* ---------- Cau hinh chung ---------- */

const qsGet = db.prepare("SELECT value FROM settings WHERE key = ?");
const qsSet = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
);

const DEFAULT_SETTINGS = {
  signup_open: "1",              // cho phep tu dang ky
  trial_days: "3",               // so ngay dung thu khi dang ky
  bank_id: "",                   // ma ngan hang VietQR, vd "970422" (MB) hoac "MB"
  bank_account: "",
  bank_owner: "",
  pay_note: "",
  global_ai_key_enc: "",   // khoa AI dung chung, da ma hoa
  global_ai_model: "",
  global_ai_system: "",
  // Bang gia (VND). Moi goi da gom 1 bot chay cung luc.
  price_fb_w1: "20000",
  price_fb_m1: "60000",
  price_fb_m3: "150000",
  price_zalo_w1: "20000",
  price_zalo_m1: "60000",
  price_zalo_m3: "150000",
  // Phu thu cho MOI bot them, tinh theo % gia goi
  extra_bot_percent: "50",
  // Admin an ca muc Facebook / Zalo voi nguoi dung thuong ("1" = dang an)
  hide_fb: "0",
  hide_zalo: "0",
};

function getSetting(key) {
  const row = qsGet.get(key);
  return row ? row.value : DEFAULT_SETTINGS[key] ?? null;
}

function setSetting(key, value) {
  qsSet.run(key, value == null ? "" : String(value));
}

function allSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) out[k] = getSetting(k);
  return out;
}

/* ---------- Cau lenh ---------- */

const q = {
  userByName: db.prepare("SELECT * FROM users WHERE username = ?"),
  userById: db.prepare("SELECT * FROM users WHERE id = ?"),
  allUsers: db.prepare(
    "SELECT id, username, role, active, created_at, last_login, plan_expires, self_signup FROM users ORDER BY id"
  ),
  insertUser: db.prepare(
    "INSERT INTO users (username, password_hash, role, plan_expires, self_signup) VALUES (?, ?, ?, ?, ?)"
  ),
  setPassword: db.prepare("UPDATE users SET password_hash = ? WHERE id = ?"),
  setActive: db.prepare("UPDATE users SET active = ? WHERE id = ?"),
  setExpiry: db.prepare("UPDATE users SET plan_expires = ? WHERE id = ?"),
  touchLogin: db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?"),
  deleteUser: db.prepare("DELETE FROM users WHERE id = ?"),
  countAdmins: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1"),
  countUsers: db.prepare("SELECT COUNT(*) AS n FROM users"),

  botByUser: db.prepare("SELECT * FROM bots WHERE user_id = ?"),
  allAutostart: db.prepare("SELECT * FROM bots WHERE autostart = 1 AND appstate_enc IS NOT NULL"),
  upsertBot: db.prepare(
    "INSERT INTO bots (user_id, updated_at) VALUES (?, datetime('now')) ON CONFLICT(user_id) DO UPDATE SET updated_at = datetime('now')"
  ),
  setAppstate: db.prepare(
    "UPDATE bots SET appstate_enc = ?, updated_at = datetime('now') WHERE user_id = ?"
  ),
  setAiKey: db.prepare(
    "UPDATE bots SET ai_key_enc = ?, updated_at = datetime('now') WHERE user_id = ?"
  ),
  setSettings: db.prepare(
    "UPDATE bots SET prefix = ?, ai_model = ?, ai_system = ?, autostart = ?, updated_at = datetime('now') WHERE user_id = ?"
  ),
  setFbInfo: db.prepare("UPDATE bots SET fb_uid = ?, fb_name = ? WHERE user_id = ?"),

  insertOrder: db.prepare(
    "INSERT INTO orders (user_id, code, plan, days, amount) VALUES (?, ?, ?, ?, ?)"
  ),
  orderByCode: db.prepare("SELECT * FROM orders WHERE code = ?"),
  orderById: db.prepare("SELECT * FROM orders WHERE id = ?"),
  ordersByUser: db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 20"),
  pendingByUser: db.prepare(
    "SELECT * FROM orders WHERE user_id = ? AND status = 'pending' ORDER BY id DESC"
  ),
  allOrders: db.prepare(`
    SELECT o.*, u.username FROM orders o
    JOIN users u ON u.id = o.user_id
    ORDER BY (o.status = 'pending') DESC, o.id DESC LIMIT 100
  `),
  markPaid: db.prepare(
    "UPDATE orders SET status = 'paid', paid_at = datetime('now'), note = ? WHERE id = ?"
  ),
  cancelOrder: db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?"),
};

function ensureBotRow(userId) {
  q.upsertBot.run(userId);
  return q.botByUser.get(userId);
}

module.exports = {
  db, q, ensureBotRow, DB_PATH,
  getSetting, setSetting, allSettings,
};
