/**
 * THONG KE VUOT LINK (admin)
 *
 *  1) So luot vuot xong cua moi nha cung cap (link_tasks.status = 'done').
 *  2) Coin da phat ra (tong reward cua cac luot) so voi tien thu ve. 1 coin = 1d.
 *     Tien thu ve lay theo thu tu uu tien:
 *       a) TU DONG tu API xem thu nhap cua nha cung cap (neu co): admin dan link API vao the nha cung cap,
 *          server tu goi moi 30 phut, luu lai so lieu, tien thu ve trong ky = phan tang them giua cac lan do.
 *       b) UOC TINH = so luot x "tien thu ve moi luot" do admin nhap tay.
 *     Ben duoi con co so sanh toan he thong: coin mien phi (vuot link + thuong xep hang + admin cong)
 *     voi tien that (nap + don chuyen khoan cu + tien tu nha cung cap).
 *  3) Nguoi vuot nhieu bat thuong: nhieu luot hon han so voi so dong nguoi dung, luon cham tran luot moi ngay,
 *     luon vuot sat muc toi thieu, dung chung IP voi nhieu tai khoan khac.
 *
 *  Khong tinh tai khoan quan tri. Ngay tinh theo gio Viet Nam (UTC+7).
 */

const { db } = require("./db");
const { decrypt } = require("./crypto");
require("./linkcoin"); // dam bao bang link_providers / link_tasks da ton tai

// Cot moi them vao link_providers (DB cu chua co thi them)
const NEW_COLS = {
  pay_per_view: "REAL NOT NULL DEFAULT 0",       // tien thu ve moi luot (d), admin nhap tay
  stats_url: "TEXT",                              // API xem thu nhap, co the chua {token}
  stats_path: "TEXT",                             // duong dan toi so tien trong JSON (de trong = tu do)
  stats_kind: "TEXT NOT NULL DEFAULT 'total'",    // total = tong da kiem (tang dan) | balance = so du (giam khi rut tien)
  stats_mult: "REAL NOT NULL DEFAULT 1",          // nhan voi so API tra ve de ra dong (USD thi nhap ty gia)
  stats_last_ms: "INTEGER",
  stats_last_value: "REAL",
  stats_last_path: "TEXT",
  stats_err: "TEXT",
};
try {
  const cols = db.prepare("PRAGMA table_info(link_providers)").all().map((c) => c.name);
  for (const [name, def] of Object.entries(NEW_COLS)) if (!cols.includes(name)) db.exec(`ALTER TABLE link_providers ADD COLUMN ${name} ${def}`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS link_earnings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      taken_ms    INTEGER NOT NULL,
      vnd         REAL NOT NULL        -- gia tri API da nhan he so, tinh bang dong
    );
    CREATE INDEX IF NOT EXISTS link_earnings_p ON link_earnings(provider_id, taken_ms);
  `);
} catch (e) {
  console.error("[linkstats] khong tao duoc cot / bang moi:", e.message);
}

const VN_MS = 7 * 3600e3;
const DAY_MS = 86400000;
const toDb = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
const vnDayKey = (ms) => new Date(ms + VN_MS).toISOString().slice(0, 10);
const startOfDay = (ms) => Math.floor((ms + VN_MS) / DAY_MS) * DAY_MS - VN_MS;

const RANGE_DAYS = { today: 1, week: 7, month: 30, all: null };
const rangeStart = (range) => (RANGE_DAYS[range] == null ? 0 : startOfDay(Date.now()) - (RANGE_DAYS[range] - 1) * DAY_MS);

const LEGACY = "o.status = 'paid' AND o.amount > 0 AND COALESCE(o.note, '') != 'Thanh toán bằng ví'";

const sq = {
  providers: db.prepare(
    `SELECT id, name, reward, daily_limit, min_seconds, active, token_enc IS NOT NULL AS has_token, pay_per_view,
            stats_url, stats_path, stats_kind, stats_mult, stats_last_ms, stats_last_value, stats_last_path, stats_err
       FROM link_providers ORDER BY id`
  ),
  provider: db.prepare("SELECT * FROM link_providers WHERE id = ?"),
  setRate: db.prepare("UPDATE link_providers SET pay_per_view = ? WHERE id = ?"),
  setSource: db.prepare("UPDATE link_providers SET stats_url = ?, stats_path = ?, stats_kind = ?, stats_mult = ?, stats_last_ms = NULL, stats_last_value = NULL, stats_last_path = NULL, stats_err = NULL WHERE id = ?"),
  setLastOk: db.prepare("UPDATE link_providers SET stats_last_ms = ?, stats_last_value = ?, stats_last_path = ?, stats_err = NULL WHERE id = ?"),
  setErr: db.prepare("UPDATE link_providers SET stats_err = ? WHERE id = ?"),
  snaps: db.prepare("SELECT taken_ms, vnd FROM link_earnings WHERE provider_id = ? ORDER BY taken_ms, id"),
  insSnap: db.prepare("INSERT INTO link_earnings (provider_id, taken_ms, vnd) VALUES (?, ?, ?)"),
  delSnaps: db.prepare("DELETE FROM link_earnings WHERE provider_id = ?"),
  pruneSnaps: db.prepare("DELETE FROM link_earnings WHERE taken_ms < ?"),
  coinWindow: db.prepare(
    `SELECT COALESCE(SUM(t.reward), 0) AS coin, COUNT(*) AS n
       FROM link_tasks t JOIN users u ON u.id = t.user_id
      WHERE t.provider_id = ? AND t.status = 'done' AND t.done_ms >= ? AND t.done_ms <= ? AND u.role != 'admin'`
  ),
  perProvider: db.prepare(
    `SELECT t.provider_id AS pid, COUNT(*) AS n, COUNT(DISTINCT t.user_id) AS users,
            COALESCE(SUM(t.reward), 0) AS coin, AVG(t.done_ms - t.created_ms) AS avg_ms
       FROM link_tasks t JOIN users u ON u.id = t.user_id
      WHERE t.status = 'done' AND t.done_ms >= ? AND u.role != 'admin'
      GROUP BY t.provider_id`
  ),
  doneRows: db.prepare(
    `SELECT t.user_id, u.username, u.active, t.provider_id, t.created_ms, t.done_ms, t.ip, t.reward, p.min_seconds
       FROM link_tasks t JOIN users u ON u.id = t.user_id LEFT JOIN link_providers p ON p.id = t.provider_id
      WHERE t.status = 'done' AND t.done_ms >= ? AND u.role != 'admin'
      ORDER BY t.done_ms DESC LIMIT 200000`
  ),
  deposits: db.prepare("SELECT user_id, COALESCE(SUM(amount), 0) AS s FROM wallet_tx WHERE kind = 'deposit' GROUP BY user_id"),
  coinByKind: db.prepare(
    `SELECT t.kind AS kind, COALESCE(SUM(t.amount), 0) AS s, COUNT(*) AS n
       FROM wallet_tx t JOIN users u ON u.id = t.user_id
      WHERE u.role != 'admin' AND t.amount > 0 AND t.kind IN ('task', 'reward', 'adjust', 'deposit') AND t.created_at >= ?
      GROUP BY t.kind`
  ),
  legacy: db.prepare(
    `SELECT COALESCE(SUM(o.amount), 0) AS s FROM orders o JOIN users u ON u.id = o.user_id
      WHERE ${LEGACY} AND u.role != 'admin' AND o.paid_at >= ?`
  ),
};

const round2 = (n) => Math.round(n * 100) / 100;
const vi = (n) => String(round2(n)).replace(".", ","); // so thap phan kieu Viet: 8,33

/* ---------- Tu dong lay tien thu ve tu API nha cung cap ---------- */

const SNAP_EVERY_MS = 30 * 60e3;

/** Chan goi vao mang noi bo (admin dan link la chinh, nhung van khong cho tro vao localhost / IP rieng) */
function assertPublicUrl(url) {
  if (process.env.LINKSTATS_ALLOW_LOCAL === "1") return; // chi dung khi kiem thu
  const h = new URL(url).hostname.toLowerCase();
  if (h === "localhost" || h.startsWith("[") || h.endsWith(".local") || h.endsWith(".internal")) throw new Error("Không dùng được địa chỉ nội bộ");
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      throw new Error("Không dùng được địa chỉ nội bộ");
    }
  }
}

/** Dan nguyen link API (co api=KEY) -> tu doi key thanh {token}, khong luu key trong link */
function normalizeStatsUrl(raw) {
  let u = String(raw || "").trim();
  if (!u) return "";
  if (!/^https:\/\//i.test(u)) throw new Error("API xem thu nhập phải bắt đầu bằng https://");
  if (!u.includes("{token}")) u = u.replace(/([?&](?:api|apikey|api_key|key|token)=)([^&{]+)/i, "$1{token}");
  try { new URL(u.replaceAll("{token}", "x")); } catch (_) { throw new Error("API xem thu nhập không hợp lệ"); }
  return u;
}

function toNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let t = v.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(t)) return null;
  if (t.includes(",") && t.includes(".")) t = t.replace(/,/g, "");           // 1,234.56
  else if (/,\d{1,2}$/.test(t)) t = t.replace(",", ".");                       // 12,5
  else t = t.replace(/,/g, "");                                                // 1,234
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function getPath(obj, path) {
  let cur = obj;
  for (const k of String(path).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[k];
  }
  return cur;
}

/** Gom cac truong la so trong JSON (de admin chon dung truong tien) */
function numericFields(obj, prefix = "", depth = 0, out = []) {
  if (depth > 5 || out.length >= 60 || obj == null || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") numericFields(v, path, depth + 1, out);
    else if ((typeof v === "number" || (typeof v === "string" && v.length < 24)) && toNum(v) !== null && out.length < 60) out.push({ path, value: toNum(v) });
  }
  return out;
}

const AUTO_KEYS = ["total_earnings", "totalearnings", "total_earned", "earnings", "earning", "earned", "total_revenue", "revenue", "income", "total_income", "balance", "money", "amount", "total"];

function extractNumber(text, wantPath) {
  let j;
  try { j = JSON.parse(text); } catch (_) {
    const n = toNum((text.match(/-?\d[\d.,]*/) || [""])[0]);
    if (n === null) throw new Error("Phản hồi không phải JSON và không có số nào");
    return { value: n, path: "(văn bản)", fields: [] };
  }
  const fields = numericFields(j);
  if (wantPath) {
    const n = toNum(getPath(j, wantPath));
    if (n === null) {
      const err = new Error(`Không thấy số ở "${wantPath}" trong phản hồi`);
      err.fields = fields;
      throw err;
    }
    return { value: n, path: wantPath, fields };
  }
  const rank = (f) => { const i = AUTO_KEYS.indexOf(f.path.split(".").pop().toLowerCase()); return i < 0 ? 999 : i; };
  const best = [...fields].sort((a, b) => rank(a) - rank(b))[0];
  if (!best || rank(best) === 999) {
    const err = new Error(fields.length ? "Không tự dò được trường tiền, hãy chọn một trường bên dưới" : "Phản hồi không có trường số nào");
    err.fields = fields;
    throw err;
  }
  return { value: best.value, path: best.path, fields };
}

async function fetchEarning(p) {
  const token = decrypt(p.token_enc) || "";
  const url = p.stats_url.replaceAll("{token}", encodeURIComponent(token));
  assertPublicUrl(url);
  const r = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    redirect: "manual",
    headers: { Accept: "application/json", "X-API-Key": token, Authorization: `Bearer ${token}` },
  });
  if (r.status >= 300 && r.status < 400) throw new Error("Nhà cung cấp chuyển hướng sang địa chỉ khác, hãy dán link cuối cùng");
  if (!r.ok) throw new Error(`Nhà cung cấp trả lỗi HTTP ${r.status}`);
  return extractNumber((await r.text()).trim().slice(0, 200000), p.stats_path);
}

/** Lay 1 lan va luu lai (moi lan thanh cong = 1 moc do) */
async function runFetch(p) {
  try {
    const r = await fetchEarning(p);
    const vnd = r.value * (Number(p.stats_mult) || 1);
    const now = Date.now();
    sq.insSnap.run(p.id, now, vnd);
    sq.setLastOk.run(now, r.value, r.path, p.id);
    return { ok: true, value: r.value, vnd: Math.round(vnd), path: r.path, fields: r.fields.slice(0, 12) };
  } catch (e) {
    const msg =
      e?.name === "TimeoutError" ? "Nhà cung cấp phản hồi quá chậm"
      : e?.message === "fetch failed" ? `Không kết nối được tới nhà cung cấp${e.cause?.code ? ` (${e.cause.code})` : ""}`
      : e?.message || "Lỗi không rõ";
    sq.setErr.run(String(msg).slice(0, 200), p.id);
    return { ok: false, error: msg, fields: (e?.fields || []).slice(0, 12) };
  }
}

async function runAll() {
  for (const p of sq.providers.all()) {
    if (!p.stats_url || !p.has_token) continue;
    await runFetch(sq.provider.get(p.id));
  }
  sq.pruneSnaps.run(Date.now() - 400 * DAY_MS);
}

/**
 * Tien thuc nhan trong ky = phan tang them giua cac moc do.
 *  - total: so tang dan, neu giam bat thuong thi bo qua doan do.
 *  - balance: so du, neu giam nghia la da rut tien -> coi nhu so du chay lai tu 0 (tinh tu thap).
 * Tra ve null neu chua du 2 moc do. `from` la moc do dau tien dung de tinh (co the muon hon dau ky).
 */
function measured(pid, kind, since) {
  const rows = sq.snaps.all(pid);
  if (rows.length < 2) return null;
  let i0 = 0;
  for (let i = 0; i < rows.length; i++) { if (rows[i].taken_ms <= since) i0 = i; else break; }
  let cash = 0;
  for (let i = i0 + 1; i < rows.length; i++) {
    const d = rows[i].vnd - rows[i - 1].vnd;
    cash += d >= 0 ? d : kind === "balance" ? rows[i].vnd : 0;
  }
  return { cash: Math.round(cash), from: rows[i0].taken_ms, to: rows[rows.length - 1].taken_ms };
}

/* ---------- Theo nha cung cap ---------- */

function providerStats(since) {
  const stats = new Map(sq.perProvider.all(since).map((r) => [r.pid, r]));
  const out = [];
  const seen = new Set();
  const add = (id, p) => {
    const s = stats.get(id) || { n: 0, users: 0, coin: 0, avg_ms: null };
    const rate = p ? Number(p.pay_per_view) || 0 : 0;
    let src = null, cash = 0, cmpCoin = s.coin, cmpFrom = null, cmpTo = null;
    const m = p && p.stats_url ? measured(id, p.stats_kind, since) : null;
    if (m) {
      src = "api";
      cash = m.cash;
      cmpFrom = Math.max(m.from, since);   // chi so sanh coin trong khoang da do duoc tien
      cmpTo = m.to;
      cmpCoin = sq.coinWindow.get(id, cmpFrom, cmpTo).coin;
    } else if (rate > 0) {
      src = "rate";
      cash = Math.round(s.n * rate);
    }
    out.push({
      id,
      name: p ? p.name : `Nhà cung cấp đã xoá (#${id})`,
      deleted: !p,
      active: p ? !!p.active && !!p.has_token : false,
      reward: p ? p.reward : null,
      rate,
      n: s.n,
      users: s.users,
      coin: s.coin,
      src,
      cash,
      cmp_coin: cmpCoin,
      cmp_from: cmpFrom,
      cmp_to: cmpTo,
      diff: src ? cash - cmpCoin : 0,
      avg_s: s.avg_ms == null ? null : Math.round(s.avg_ms / 100) / 10,
      stats: p
        ? {
            url: p.stats_url || "", path: p.stats_path || "", kind: p.stats_kind || "total", mult: Number(p.stats_mult) || 1,
            last_ms: p.stats_last_ms || null, last_value: p.stats_last_value, last_path: p.stats_last_path || "", err: p.stats_err || "",
          }
        : null,
    });
    seen.add(id);
  };
  for (const p of sq.providers.all()) add(p.id, p);
  for (const id of stats.keys()) if (!seen.has(id)) add(id, null); // da xoa nhung con lich su
  return out;
}

/* ---------- Nguoi vuot nhieu bat thuong ---------- */

function median(sorted) {
  const k = sorted.length;
  if (!k) return 0;
  return k % 2 ? sorted[(k - 1) / 2] : (sorted[k / 2 - 1] + sorted[k / 2]) / 2;
}

function findSuspects(since) {
  const rows = sq.doneRows.all(since);
  const live = sq.providers.all().filter((p) => p.active && p.has_token);
  const dailyCap = live.reduce((s, p) => s + p.daily_limit, 0); // so luot toi da 1 nguoi vuot duoc trong ngay

  const users = new Map();
  const ipUsers = new Map();
  for (const r of rows) {
    let u = users.get(r.user_id);
    if (!u) {
      u = { id: r.user_id, username: r.username, active: !!r.active, n: 0, coin: 0, days: new Map(), fast: 0, secSum: 0, ips: new Set() };
      users.set(r.user_id, u);
    }
    const sec = Math.max(0, (r.done_ms - r.created_ms) / 1000);
    u.n++;
    u.coin += r.reward;
    u.secSum += sec;
    if (sec <= (r.min_seconds || 20) + 5) u.fast++;
    const day = vnDayKey(r.done_ms);
    u.days.set(day, (u.days.get(day) || 0) + 1);
    if (r.ip) {
      u.ips.add(r.ip);
      if (!ipUsers.has(r.ip)) ipUsers.set(r.ip, new Set());
      ipUsers.get(r.ip).add(r.user_id);
    }
  }

  const counts = [...users.values()].map((u) => u.n).sort((a, b) => a - b);
  const med = median(counts);
  const mean = counts.length ? counts.reduce((s, x) => s + x, 0) / counts.length : 0;
  const sd = counts.length ? Math.sqrt(counts.reduce((s, x) => s + (x - mean) ** 2, 0) / counts.length) : 0;
  const dep = new Map(sq.deposits.all().map((r) => [r.user_id, r.s]));

  const out = [];
  for (const u of users.values()) {
    const reasons = [];
    const avg = u.secSum / u.n;

    // 1) Nhieu luot hon han so voi so dong (can it nhat 5 nguoi de so sanh co nghia)
    if (users.size >= 5 && u.n >= 10 && u.n >= mean + 2 * sd && u.n >= 2 * Math.max(med, 1)) {
      reasons.push(`Vượt ${u.n} lượt, gấp ${vi(u.n / Math.max(med, 1))} lần mức trung vị (${vi(med)} lượt/người)`);
    }
    // 2) Ngay nao cung vuot toi da
    if (dailyCap > 0) {
      const capDays = [...u.days.values()].filter((c) => c >= dailyCap).length;
      if (capDays >= 3 && capDays >= 0.7 * u.days.size) reasons.push(`Chạm trần ${dailyCap} lượt/ngày: ${capDays}/${u.days.size} ngày có vượt`);
    }
    // 3) Luon vuot sat muc toi thieu (nghi tool)
    if (u.n >= 5 && u.fast / u.n >= 0.8) reasons.push(`${u.fast}/${u.n} lượt vượt sát mức thời gian tối thiểu (trung bình ${vi(avg)} giây)`);
    // 4) Chung IP voi nhieu tai khoan khac (mang 4G / wifi chung cung co the trung IP, chi de tham khao)
    const others = new Set();
    for (const ip of u.ips) for (const id of ipUsers.get(ip)) if (id !== u.id) others.add(id);
    if (others.size >= 2) reasons.push(`Dùng chung IP với ${others.size} tài khoản khác`);

    if (reasons.length) {
      out.push({
        id: u.id,
        username: u.username,
        active: u.active,
        n: u.n,
        coin: u.coin,
        days: u.days.size,
        avg_s: round2(avg),
        deposited: dep.get(u.id) || 0,
        sharedIp: others.size,
        reasons,
      });
    }
  }
  out.sort((a, b) => b.reasons.length - a.reasons.length || b.n - a.n);
  return { list: out.slice(0, 50), total: out.length, active_users: users.size, median: round2(med), mean: round2(mean), daily_cap: dailyCap };
}

/* ---------- Toan he thong ---------- */

function systemStats(since, providerCash) {
  const k = Object.fromEntries(sq.coinByKind.all(toDb(since)).map((r) => [r.kind, r]));
  const free = { task: k.task?.s || 0, reward: k.reward?.s || 0, adjust: k.adjust?.s || 0 };
  const freeTotal = free.task + free.reward + free.adjust;
  const deposit = k.deposit?.s || 0;
  const legacy = sq.legacy.get(toDb(since)).s;
  const cashTotal = deposit + legacy + providerCash;
  return { free, free_total: freeTotal, deposit, legacy, provider_cash: providerCash, cash_total: cashTotal, diff: cashTotal - freeTotal };
}

function build(range) {
  const key = RANGE_DAYS[range] === undefined ? "week" : range;
  const since = rangeStart(key);
  const providers = providerStats(since);
  const total = providers.reduce(
    (a, p) => ({ n: a.n + p.n, coin: a.coin + p.coin, cash: a.cash + p.cash, diff: a.diff + p.diff }),
    { n: 0, coin: 0, cash: 0, diff: 0 }
  );
  const suspects = findSuspects(since);
  total.users = suspects.active_users; // so nguoi da vuot it nhat 1 luot
  return {
    range: key,
    since_ms: since,
    since_day: since ? vnDayKey(since) : null,
    has_cash: providers.some((p) => p.src),
    partial: providers.some((p) => p.src === "api" && p.cmp_from > since),
    providers,
    total,
    system: systemStats(since, total.cash),
    suspects,
  };
}

function register(router, auth) {
  router.get("/admin/linkstats", auth.requireAdmin, (req, res) => {
    res.json(build(String(req.query.range || "week")));
  });

  // Nhap tay tien thu ve moi luot (dung khi nha cung cap khong co API xem thu nhap)
  router.post("/admin/linkstats/rate", auth.requireAdmin, (req, res) => {
    const id = Number(req.body?.id);
    const raw = String(req.body?.pay_per_view ?? "").trim().replace(",", ".");
    const rate = Number(raw);
    if (!sq.provider.get(id)) return res.status(400).json({ error: "Không tìm thấy nhà cung cấp" });
    if (raw === "" || !Number.isFinite(rate) || rate < 0 || rate > 100000) {
      return res.status(400).json({ error: "Số tiền thu về mỗi lượt phải từ 0 đến 100.000 đ" });
    }
    sq.setRate.run(round2(rate), id);
    res.json({ ok: true });
  });

  // Luu cau hinh API xem thu nhap roi lay thu ngay 1 lan
  router.post("/admin/linkstats/source", auth.requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const p = sq.provider.get(Number(b.id));
      if (!p) throw new Error("Không tìm thấy nhà cung cấp");
      const url = normalizeStatsUrl(b.stats_url);
      const path = String(b.stats_path || "").trim().slice(0, 120);
      const kind = b.stats_kind === "balance" ? "balance" : "total";
      const multRaw = String(b.stats_mult ?? "1").trim().replace(",", ".");
      const mult = multRaw === "" ? 1 : Number(multRaw);
      if (!Number.isFinite(mult) || mult <= 0 || mult > 1e6) throw new Error("Số nhân đổi ra đồng phải từ 0 đến 1.000.000");
      if (url.includes("{token}") && !p.token_enc) throw new Error("Nhà cung cấp chưa có token, hãy nhập token ở tab Vượt link");
      // Doi cau hinh -> bo cac moc do cu (khac y nghia, khong cong lan duoc)
      const changed = url !== (p.stats_url || "") || path !== (p.stats_path || "") || kind !== p.stats_kind || mult !== Number(p.stats_mult);
      if (changed) { sq.setSource.run(url || null, path || null, kind, mult, p.id); sq.delSnaps.run(p.id); }
      if (!url) return res.json({ ok: true, fetch: null });
      res.json({ ok: true, fetch: await runFetch(sq.provider.get(p.id)) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post("/admin/linkstats/fetch", auth.requireAdmin, async (req, res) => {
    const p = sq.provider.get(Number(req.body?.id));
    if (!p || !p.stats_url) return res.status(400).json({ error: "Nhà cung cấp chưa cấu hình API xem thu nhập" });
    res.json({ ok: true, fetch: await runFetch(p) });
  });

  // Tu dong do tien thu ve moi 30 phut
  setTimeout(() => runAll().catch(() => {}), 30e3).unref();
  setInterval(() => runAll().catch(() => {}), SNAP_EVERY_MS).unref();
}

module.exports = { register, build, runAll, extractNumber, measured, normalizeStatsUrl };
