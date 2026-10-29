/**
 * Quan ly bot Zalo (Python) tu web panel - nhieu bot Zalo cho moi tai khoan web.
 *
 * - Cookie + IMEI luu MA HOA trong DB (bang zalo_accounts).
 * - Moi bot Zalo la mot tien trinh `python main.py` rieng, doc file config
 *   tam data/zalo/<id>.json (quyen 600) qua bien ZALO_CONFIG.
 * - File config tam bi xoa khi bot tat hoac tien trinh thoat.
 * - Mot tai khoan Zalo (cookie zpw_sek) khong duoc chay o 2 bot cung luc.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { db, DB_PATH, getSetting, setSetting } = require("./db");
const { encrypt, decrypt } = require("./crypto");

// Mac dinh: thu muc zalo/ trong project (ban gop), neu khong co thi ~/BotZalo
const BUNDLED = path.join(__dirname, "..", "zalo");
const ZALO_DIR =
  process.env.ZALO_DIR ||
  (fs.existsSync(path.join(BUNDLED, "main.py")) ? BUNDLED : path.join(os.homedir(), "BotZalo"));

// Uu tien Python trong virtualenv cua bot Zalo (VPS), sau do toi python3 he thong
const VENV_PY = path.join(ZALO_DIR, ".venv", "bin", "python");
const PYTHON = process.env.ZALO_PYTHON || (fs.existsSync(VENV_PY) ? VENV_PY : "python3");

// Duong dan TUYET DOI: python chay trong thu muc zalo/, DB_PATH trong .env thuong la tuong doi
const CONF_DIR = path.resolve(path.dirname(DB_PATH), "zalo");
const MAX_LOG = 200;
const MAX_RUNNING = Number(process.env.MAX_ZALO || 3);

/* ---------- Database ---------- */

db.exec(`
  CREATE TABLE IF NOT EXISTS zalo_accounts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL DEFAULT 'Bot Zalo',
    cookies_enc  TEXT,
    imei_enc     TEXT,
    prefix       TEXT NOT NULL DEFAULT '/',
    author_id    TEXT,
    is_main_bot  INTEGER NOT NULL DEFAULT 1,
    autostart    INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT
  );
  CREATE INDEX IF NOT EXISTS zalo_accounts_user ON zalo_accounts(user_id);
`);

// Moi bot co han su dung rieng (thanh toan theo tung bot)
if (!db.prepare("PRAGMA table_info(zalo_accounts)").all().some((c) => c.name === "expires")) {
  db.exec("ALTER TABLE zalo_accounts ADD COLUMN expires TEXT");
}

// Admin khoa bot: nguoi dung khong sua, bat, tat, xoa duoc
for (const col of ["locked"]) {
  if (!db.prepare("PRAGMA table_info(zalo_accounts)").all().some((c) => c.name === col)) {
    db.exec(`ALTER TABLE zalo_accounts ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`);
  }
}

// Chuyen du lieu tu ban cu (1 bot Zalo / tai khoan, bang zalo_bots)
if (getSetting("migrated_zalo_accounts") !== "1") {
  const hasOld = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='zalo_bots'").get();
  if (hasOld) {
    const old = db.prepare("SELECT * FROM zalo_bots WHERE cookies_enc IS NOT NULL OR author_id IS NOT NULL").all();
    const ins = db.prepare(
      "INSERT INTO zalo_accounts (user_id, name, cookies_enc, imei_enc, prefix, author_id, is_main_bot, autostart, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
    );
    for (const z of old) {
      ins.run(z.user_id, z.label || "Bot Zalo 1", z.cookies_enc, z.imei_enc, z.prefix || "/", z.author_id, z.is_main_bot ? 1 : 0, z.autostart ? 1 : 0);
    }
    if (old.length) console.log(`[db] da chuyen ${old.length} bot Zalo sang bang zalo_accounts`);
  }
  setSetting("migrated_zalo_accounts", "1");
}

const zq = {
  byId: db.prepare("SELECT * FROM zalo_accounts WHERE id = ?"),
  byUser: db.prepare("SELECT * FROM zalo_accounts WHERE user_id = ? ORDER BY id"),
  countByUser: db.prepare("SELECT COUNT(*) AS n FROM zalo_accounts WHERE user_id = ?"),
  insert: db.prepare("INSERT INTO zalo_accounts (user_id, name, updated_at) VALUES (?, ?, datetime('now'))"),
  setLogin: db.prepare(
    "UPDATE zalo_accounts SET cookies_enc = ?, imei_enc = ?, updated_at = datetime('now') WHERE id = ?"
  ),
  clearLogin: db.prepare(
    "UPDATE zalo_accounts SET cookies_enc = NULL, imei_enc = NULL, autostart = 0, updated_at = datetime('now') WHERE id = ?"
  ),
  setSettings: db.prepare(
    "UPDATE zalo_accounts SET name = ?, prefix = ?, author_id = ?, is_main_bot = ?, autostart = ?, updated_at = datetime('now') WHERE id = ?"
  ),
  del: db.prepare("DELETE FROM zalo_accounts WHERE id = ?"),
  delByUser: db.prepare("DELETE FROM zalo_accounts WHERE user_id = ?"),
  setExpires: db.prepare("UPDATE zalo_accounts SET expires = ? WHERE id = ?"),
  setFlags: db.prepare("UPDATE zalo_accounts SET locked = ? WHERE id = ?"),
  allAutostart: db.prepare(
    "SELECT * FROM zalo_accounts WHERE autostart = 1 AND cookies_enc IS NOT NULL AND imei_enc IS NOT NULL"
  ),
};

/* ---------- Doc cookie Zalo ---------- */

/**
 * Nhan 3 dang, tra ve object {ten: gia_tri} (dang zlapi can):
 *  - JSON object {"zpw_sek": "...", ...}
 *  - JSON mang [{name|key, value}, ...] (xuat tu extension)
 *  - Chuoi "ten=gia_tri; ten=gia_tri"
 */
function parseCookies(raw) {
  const s = String(raw || "").trim();
  if (!s) throw new Error("Chua nhap cookie");

  const out = {};
  if (s.startsWith("{") || s.startsWith("[")) {
    let parsed;
    try {
      parsed = JSON.parse(s);
    } catch (_) {
      throw new Error("Cookie dang JSON nhung khong hop le");
    }
    if (Array.isArray(parsed)) {
      for (const c of parsed) {
        const k = c && (c.name || c.key);
        if (k && c.value != null) out[k] = String(c.value);
      }
    } else if (parsed && typeof parsed === "object") {
      for (const [k, v] of Object.entries(parsed)) {
        if (v != null && typeof v !== "object") out[k] = String(v);
      }
    }
  } else {
    for (const pair of s.split(";")) {
      const i = pair.indexOf("=");
      if (i > 0) out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
    }
  }

  if (Object.keys(out).length === 0) throw new Error("Khong doc duoc cookie nao");
  return out;
}

/* ---------- Tien trinh ---------- */

const procs = new Map(); // accountId -> { child, status, startedAt, error, logs[], sek, uid, attempts }

function state(id) {
  if (!procs.has(id)) {
    procs.set(id, { child: null, status: "stopped", startedAt: 0, error: null, logs: [], sek: null, uid: null, attempts: 0 });
  }
  return procs.get(id);
}

// Loi mang khi dang nhap (mat DNS/mang luc Termux vua mo, wifi chap chon...) -> tu thu lai
// thay vi bao loi ngay, giong cach xu ly cho bot Facebook.
const NET_ERR = /NameResolutionError|Failed to resolve|Max retries exceeded|ConnectionError|ConnectionResetError|Temporary failure in name resolution|Network is unreachable|ETIMEDOUT/i;
const RETRY_MS = 8000;
const MAX_ATTEMPTS = 4;
const STABLE_MS = 20000; // song qua tung nay thi coi la da vao duoc, reset dem thu lai

function log(id, level, text) {
  const st = state(id);
  st.logs.push({ t: new Date().toISOString(), level, text: String(text).slice(0, 500) });
  if (st.logs.length > MAX_LOG) st.logs.splice(0, st.logs.length - MAX_LOG);
  if (level === "error") console.error(`[zalo:${id}] ${text}`);
}

const busy = (s) => s === "running" || s === "stopping";

function runningCount() {
  let n = 0;
  for (const st of procs.values()) if (st.child) n++;
  return n;
}

/** So bot Zalo dang hoat dong thuc su (status = running) */
function activeCount() {
  let n = 0;
  for (const st of procs.values()) if (st.child && st.status === "running") n++;
  return n;
}

const confPath = (id) => path.join(CONF_DIR, `${id}.json`);

function removeConf(id) {
  try {
    fs.unlinkSync(confPath(id));
  } catch (_) {}
}

function pipeLines(stream, id, onLine) {
  let buf = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buf += chunk;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      // logging cua Python ghi ca INFO ra stderr -> tu xet muc do
      const lv = /ERROR|Traceback|Exception|Lỗi/i.test(line) ? "error" : "info";
      log(id, lv, line);
      // Bot in "🆔 <uid>" khi tu them chinh no lam admin -> ghi nhan ID tai khoan
      const m = line.match(/🆔\s*(\d{6,})/);
      if (m) state(id).uid = m[1];
      onLine?.(line);
    }
  });
}

function start(id) {
  const st = state(id);
  if (st.child) throw new Error("Bot Zalo nay dang chay roi");
  if (runningCount() >= MAX_RUNNING) {
    throw new Error(`Server chi cho phep ${MAX_RUNNING} bot Zalo chay cung luc.`);
  }
  if (!fs.existsSync(path.join(ZALO_DIR, "main.py"))) {
    throw new Error(`Khong tim thay ${ZALO_DIR}/main.py. Dat bien ZALO_DIR tro toi thu muc BotZalo.`);
  }

  const r = zq.byId.get(id);
  if (!r) throw new Error("Khong tim thay bot Zalo");
  const cookiesRaw = decrypt(r.cookies_enc);
  const imei = decrypt(r.imei_enc);
  if (!cookiesRaw || !imei) throw new Error("Chua luu cookie va IMEI Zalo");

  const cookies = JSON.parse(cookiesRaw);
  const sek = cookies.zpw_sek || null;
  if (sek) {
    for (const [otherId, other] of procs) {
      if (otherId !== id && other.child && other.sek === sek) {
        throw new Error("Tai khoan Zalo nay dang chay o mot bot khac. Tat bot do truoc.");
      }
    }
  }

  st.attempts = 0;
  spawnBot(id, r, cookies, imei);
}

/** Thuc su chay tien trinh python. Goi lai boi retry khi gap loi mang. */
function spawnBot(id, r, cookies, imei) {
  const st = state(id);
  const config = {
    data: [
      {
        imei,
        session_cookies: cookies,
        prefix: r.prefix || "/",
        is_main_bot: !!r.is_main_bot,
        username: r.name || `zalo${id}`,
        // main.py bo qua tai khoan thieu author_id, nhung admin that duoc bot tu
        // them (chinh ID tai khoan bot) o lan chay dau -> chi can gia tri khac rong
        author_id: r.author_id || "auto",
        status: true,
      },
    ],
  };

  fs.mkdirSync(CONF_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(confPath(id), JSON.stringify(config, null, 2), { mode: 0o600 });

  const child = spawn(PYTHON, ["main.py"], {
    cwd: ZALO_DIR,
    env: { ...process.env, ZALO_CONFIG: confPath(id), PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  st.child = child;
  st.sek = cookies.zpw_sek || null;
  st.status = "running";
  st.error = null;
  st.startedAt = Date.now();
  let sawNetErr = false;
  if (child.pid) log(id, "info", `Da chay bot Zalo (pid ${child.pid})`);

  const watch = (line) => {
    if (NET_ERR.test(line)) sawNetErr = true;
  };
  pipeLines(child.stdout, id, watch);
  pipeLines(child.stderr, id, watch);

  child.on("error", (err) => {
    st.error = err.code === "ENOENT" ? `Khong tim thay lenh '${PYTHON}'. Cai python hoac dat ZALO_PYTHON.` : err.message;
    log(id, "error", st.error);
    if (st.child === child && child.pid === undefined) {
      st.child = null;
      st.sek = null;
      st.status = "error";
      removeConf(id);
    }
  });

  child.on("exit", (code) => {
    if (st.child !== child) return;
    removeConf(id);
    const wasStopping = st.status === "stopping";
    const ranMs = Date.now() - st.startedAt;
    st.child = null;
    st.sek = null;

    if (wasStopping) {
      st.status = "stopped";
      log(id, "info", "Bot Zalo da tat");
      return;
    }

    // Thoat som + loi mang -> tu thu lai thay vi bao loi ngay
    if (sawNetErr && ranMs < STABLE_MS && st.attempts < MAX_ATTEMPTS - 1) {
      st.attempts++;
      st.status = "starting";
      log(id, "error", `Loi mang khi dang nhap Zalo, thu lai lan ${st.attempts + 1}/${MAX_ATTEMPTS} sau ${RETRY_MS / 1000}s...`);
      setTimeout(() => {
        if (st.status !== "starting") return; // bi bam Tat trong luc cho
        const r2 = zq.byId.get(id);
        if (!r2) return;
        spawnBot(id, r2, cookies, imei);
      }, RETRY_MS);
      return;
    }

    st.status = "error";
    st.error = st.error || `Bot Zalo thoat bat ngo (ma ${code}). Xem nhat ky.`;
    log(id, "error", st.error);
  });
}

function stop(id) {
  const st = state(id);
  st.attempts = MAX_ATTEMPTS; // ngan dang cho retry (setTimeout) chay lai
  if (!st.child) {
    st.status = "stopped";
    removeConf(id);
    return;
  }
  st.status = "stopping";
  const child = st.child;
  child.kill("SIGTERM");
  setTimeout(() => {
    if (st.child === child) child.kill("SIGKILL");
  }, 5000).unref?.();
}

function forget(id) {
  stop(id);
  const st = procs.get(id);
  if (st && !st.child) procs.delete(id);
}

function stopAll() {
  for (const id of procs.keys()) stop(id);
}

function status(id) {
  const st = state(id);
  return {
    status: st.status,
    error: st.error,
    uptimeSec: st.child ? Math.floor((Date.now() - st.startedAt) / 1000) : 0,
    zaloUid: st.uid,
  };
}

function logs(id) {
  return state(id).logs;
}

module.exports = {
  ZALO_DIR,
  MAX_RUNNING,
  zq,
  parseCookies,
  encrypt,
  decrypt,
  start,
  stop,
  forget,
  stopAll,
  status,
  logs,
  log,
  runningCount,
  activeCount,
  busy,
};
