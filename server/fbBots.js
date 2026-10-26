/**
 * Nhieu bot Facebook cho moi tai khoan web.
 *
 * Bang fb_bots giu cookie (ma hoa), prefix, tu bat cua TUNG bot.
 * Bang bots cu van giu cau hinh AI theo tai khoan (khoa, model, tinh cach).
 * Lan dau chay, bot cu (1 bot / tai khoan) duoc chuyen sang bang moi.
 */

const { db, q, getSetting, setSetting } = require("./db");
const { decrypt } = require("./crypto");

db.exec(`
  CREATE TABLE IF NOT EXISTS fb_bots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL DEFAULT 'Bot FB',
    appstate_enc TEXT,
    prefix       TEXT NOT NULL DEFAULT '!',
    autostart    INTEGER NOT NULL DEFAULT 0,
    fb_name      TEXT,
    fb_uid       TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT
  );
  CREATE INDEX IF NOT EXISTS fb_bots_user ON fb_bots(user_id);
`);

// Moi bot co han su dung rieng (thanh toan theo tung bot)
if (!db.prepare("PRAGMA table_info(fb_bots)").all().some((c) => c.name === "expires")) {
  db.exec("ALTER TABLE fb_bots ADD COLUMN expires TEXT");
}

/* ---------- Chuyen du lieu tu ban 1 bot / tai khoan ---------- */

if (getSetting("migrated_fb_bots") !== "1") {
  const old = db
    .prepare("SELECT * FROM bots WHERE appstate_enc IS NOT NULL OR fb_uid IS NOT NULL")
    .all();
  const ins = db.prepare(
    "INSERT INTO fb_bots (user_id, name, appstate_enc, prefix, autostart, fb_name, fb_uid, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))"
  );
  for (const b of old) {
    ins.run(b.user_id, b.fb_name || "Bot FB 1", b.appstate_enc, b.prefix || "!", b.autostart ? 1 : 0, b.fb_name, b.fb_uid);
  }
  setSetting("migrated_fb_bots", "1");
  if (old.length) console.log(`[db] da chuyen ${old.length} bot FB sang bang fb_bots`);
}

const fq = {
  byId: db.prepare("SELECT * FROM fb_bots WHERE id = ?"),
  byUser: db.prepare("SELECT * FROM fb_bots WHERE user_id = ? ORDER BY id"),
  countByUser: db.prepare("SELECT COUNT(*) AS n FROM fb_bots WHERE user_id = ?"),
  insert: db.prepare("INSERT INTO fb_bots (user_id, name, updated_at) VALUES (?, ?, datetime('now'))"),
  setAppstate: db.prepare("UPDATE fb_bots SET appstate_enc = ?, updated_at = datetime('now') WHERE id = ?"),
  setSettings: db.prepare(
    "UPDATE fb_bots SET name = ?, prefix = ?, autostart = ?, updated_at = datetime('now') WHERE id = ?"
  ),
  setFbInfo: db.prepare("UPDATE fb_bots SET fb_uid = ?, fb_name = ? WHERE id = ?"),
  del: db.prepare("DELETE FROM fb_bots WHERE id = ?"),
  delByUser: db.prepare("DELETE FROM fb_bots WHERE user_id = ?"),
  allAutostart: db.prepare("SELECT * FROM fb_bots WHERE autostart = 1 AND appstate_enc IS NOT NULL"),
  setExpires: db.prepare("UPDATE fb_bots SET expires = ? WHERE id = ?"),
};

/** So bot moi loai mot tai khoan duoc tao (admin khong gioi han) */
const MAX_PER_USER = Number(process.env.MAX_PER_USER || 3);

function canCreate(user, count) {
  return user.role === "admin" || count < MAX_PER_USER;
}

/**
 * Chuan hoa cookie Messenger. Nhan:
 *  - Mang JSON [{key|name, value, ...}] (xuat tu extension)
 *  - Chuoi "ten=gia_tri; ten=gia_tri"
 */
function normalizeAppstate(raw) {
  const s = String(raw || "").trim();
  if (!s) throw new Error("Chua nhap cookie");

  let list;
  if (s.startsWith("[")) {
    let parsed;
    try {
      parsed = JSON.parse(s);
    } catch (_) {
      throw new Error("Khong phai JSON hop le");
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Can mot mang cookie, vi du [{"key":"c_user",...}]');
    }
    list = parsed.map((c) => ({
      key: c.key || c.name,
      value: c.value,
      domain: c.domain || ".facebook.com",
      path: c.path || "/",
      hostOnly: !!c.hostOnly,
    }));
  } else {
    list = s
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=");
        if (i === -1) return null;
        return {
          key: p.slice(0, i).trim(),
          value: p.slice(i + 1).trim(),
          domain: ".facebook.com",
          path: "/",
          hostOnly: false,
        };
      })
      .filter(Boolean);
    if (list.length === 0) throw new Error("Khong doc duoc cookie nao tu chuoi da nhap");
  }

  if (!list.some((c) => c.key === "c_user")) {
    throw new Error("Thieu cookie c_user - co ve khong phai cookie Facebook");
  }
  return list;
}

/** UID Facebook trong cookie da luu (de chan 1 tai khoan chay 2 bot) */
function uidOf(row) {
  try {
    const list = JSON.parse(decrypt(row.appstate_enc) || "[]");
    return list.find((c) => c.key === "c_user")?.value || null;
  } catch (_) {
    return null;
  }
}

/** Cau hinh AI theo tai khoan, du phong bang khoa chung cua admin */
function aiConfig(userId) {
  const b = q.botByUser.get(userId) || {};
  return {
    aiKey: decrypt(b.ai_key_enc) || decrypt(getSetting("global_ai_key_enc")),
    aiModel: b.ai_model || getSetting("global_ai_model") || undefined,
    aiSystem: b.ai_system || getSetting("global_ai_system") || undefined,
  };
}

module.exports = { fq, MAX_PER_USER, canCreate, normalizeAppstate, uidOf, aiConfig };
