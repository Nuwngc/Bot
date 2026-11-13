/**
 * THONG KE VUOT LINK (admin)
 *
 *  1) So luot vuot xong cua moi nha cung cap (link_tasks.status = 'done').
 *  2) Coin da phat ra (tong reward cua cac luot) so voi tien thu ve. Server khong thay duoc tien
 *     nha cung cap tra, nen admin nhap "tien thu ve moi luot" (d) cho tung nha cung cap
 *     -> tien thu ve uoc tinh = so luot x gia tri do. 1 coin = 1d.
 *     Ben duoi con co so sanh toan he thong: coin mien phi (vuot link + thuong xep hang + admin cong)
 *     voi tien that (nap + don chuyen khoan cu + tien uoc tinh tu nha cung cap).
 *  3) Nguoi vuot nhieu bat thuong: nhieu luot hon han so voi so dong nguoi dung, luon cham tran luot moi ngay,
 *     luon vuot sat muc toi thieu, dung chung IP voi nhieu tai khoan khac.
 *
 *  Khong tinh tai khoan quan tri. Ngay tinh theo gio Viet Nam (UTC+7).
 */

const { db } = require("./db");
require("./linkcoin"); // dam bao bang link_providers / link_tasks da ton tai

// Cot "tien thu ve moi luot" (d, co the le) — them vao DB cu neu chua co
try {
  const cols = db.prepare("PRAGMA table_info(link_providers)").all().map((c) => c.name);
  if (!cols.includes("pay_per_view")) db.exec("ALTER TABLE link_providers ADD COLUMN pay_per_view REAL NOT NULL DEFAULT 0");
} catch (e) {
  console.error("[linkstats] khong them duoc cot pay_per_view:", e.message);
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
  providers: db.prepare("SELECT id, name, reward, daily_limit, min_seconds, active, token_enc IS NOT NULL AS has_token, pay_per_view FROM link_providers ORDER BY id"),
  provider: db.prepare("SELECT id FROM link_providers WHERE id = ?"),
  setRate: db.prepare("UPDATE link_providers SET pay_per_view = ? WHERE id = ?"),
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

/* ---------- Theo nha cung cap ---------- */

function providerStats(since) {
  const stats = new Map(sq.perProvider.all(since).map((r) => [r.pid, r]));
  const out = [];
  const seen = new Set();
  const add = (id, p) => {
    const s = stats.get(id) || { n: 0, users: 0, coin: 0, avg_ms: null };
    const rate = p ? Number(p.pay_per_view) || 0 : 0;
    const cash = Math.round(s.n * rate);
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
      cash,
      diff: cash - s.coin,
      avg_s: s.avg_ms == null ? null : Math.round(s.avg_ms / 100) / 10,
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
    (a, p) => ({ n: a.n + p.n, coin: a.coin + p.coin, cash: a.cash + p.cash }),
    { n: 0, coin: 0, cash: 0 }
  );
  total.diff = total.cash - total.coin;
  const suspects = findSuspects(since);
  total.users = suspects.active_users; // so nguoi da vuot it nhat 1 luot
  return {
    range: key,
    since_day: since ? vnDayKey(since) : null,
    has_rate: providers.some((p) => p.rate > 0),
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
}

module.exports = { register, build };
