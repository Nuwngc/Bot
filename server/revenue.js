/**
 * THONG KE DOANH THU (admin) + LICH SU GIAO DICH DAY DU.
 *
 *  - "Tien da nhan" = coin NAP (admin da xac nhan nhan chuyen khoan) + don thue bot kieu cu tra
 *    chuyen khoan truc tiep (truoc khi co vi). Coin tieu de thue bot khong tinh la tien moi.
 *  - Khong tinh tai khoan quan tri (hay nap thu / cong coin thu nghiem).
 *  - Ngay / thang tinh theo gio Viet Nam (UTC+7).
 *  - Lich su day du gom: nap, thanh toan, thuong, dieu chinh cua admin va cac don chuyen khoan cu.
 */
const { db } = require("./db");

const VN_MS = 7 * 3600e3;
const toDb = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
const vnDay = (ms) => new Date(ms + VN_MS).toISOString().slice(0, 10);
const vnMonth = (ms) => new Date(ms + VN_MS).toISOString().slice(0, 7);
/** 00:00 gio VN cua ngay chua `ms`, tinh bang ms UTC */
const startOfDay = (ms) => Math.floor((ms + VN_MS) / 86400000) * 86400000 - VN_MS;
const startOfMonth = (ms) => {
  const d = new Date(ms + VN_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - VN_MS;
};

const DAY = "strftime('%Y-%m-%d', datetime(t.created_at, '+7 hours'))";
const MON = "strftime('%Y-%m', datetime(t.created_at, '+7 hours'))";

// Don thue bot tra chuyen khoan truc tiep (kieu cu), khong phai thanh toan bang vi
const LEGACY = "o.status = 'paid' AND o.amount > 0 AND COALESCE(o.note, '') != 'Thanh toán bằng ví'";

const sq = {
  byKind: db.prepare(
    `SELECT t.kind AS kind, COUNT(*) AS n, COALESCE(SUM(t.amount), 0) AS s, COUNT(DISTINCT t.user_id) AS users
       FROM wallet_tx t JOIN users u ON u.id = t.user_id
      WHERE u.role != 'admin' AND t.created_at >= ? GROUP BY t.kind`
  ),
  legacy: db.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(o.amount), 0) AS s FROM orders o JOIN users u ON u.id = o.user_id
      WHERE ${LEGACY} AND u.role != 'admin' AND o.paid_at >= ?`
  ),
  byProduct: db.prepare(
    `SELECT COALESCE(o.product, 'fb') AS product, COUNT(*) AS n, COALESCE(-SUM(t.amount), 0) AS s
       FROM wallet_tx t JOIN users u ON u.id = t.user_id LEFT JOIN orders o ON o.code = t.ref
      WHERE t.kind = 'spend' AND u.role != 'admin' AND t.created_at >= ? GROUP BY COALESCE(o.product, 'fb')`
  ),
  liability: db.prepare(
    `SELECT COALESCE(SUM(t.amount), 0) AS s, COUNT(DISTINCT t.user_id) AS users
       FROM wallet_tx t JOIN users u ON u.id = t.user_id WHERE u.role != 'admin'`
  ),
  pending: db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS s FROM deposits WHERE status = 'pending'"),
  daily: db.prepare(
    `SELECT ${DAY} AS k, COALESCE(SUM(CASE WHEN t.kind = 'deposit' THEN t.amount END), 0) AS deposit,
            COALESCE(-SUM(CASE WHEN t.kind = 'spend' THEN t.amount END), 0) AS spend
       FROM wallet_tx t JOIN users u ON u.id = t.user_id
      WHERE u.role != 'admin' AND t.created_at >= ? GROUP BY k`
  ),
  monthly: db.prepare(
    `SELECT ${MON} AS k, COALESCE(SUM(CASE WHEN t.kind = 'deposit' THEN t.amount END), 0) AS deposit,
            COALESCE(-SUM(CASE WHEN t.kind = 'spend' THEN t.amount END), 0) AS spend
       FROM wallet_tx t JOIN users u ON u.id = t.user_id
      WHERE u.role != 'admin' AND t.created_at >= ? GROUP BY k`
  ),
  legacyDaily: db.prepare(
    `SELECT strftime('%Y-%m-%d', datetime(o.paid_at, '+7 hours')) AS k, SUM(o.amount) AS s
       FROM orders o JOIN users u ON u.id = o.user_id WHERE ${LEGACY} AND u.role != 'admin' AND o.paid_at >= ? GROUP BY k`
  ),
  legacyMonthly: db.prepare(
    `SELECT strftime('%Y-%m', datetime(o.paid_at, '+7 hours')) AS k, SUM(o.amount) AS s
       FROM orders o JOIN users u ON u.id = o.user_id WHERE ${LEGACY} AND u.role != 'admin' AND o.paid_at >= ? GROUP BY k`
  ),
};

function period(sinceMs) {
  const since = toDb(sinceMs);
  const k = Object.fromEntries(sq.byKind.all(since).map((r) => [r.kind, r]));
  const lg = sq.legacy.get(since);
  const dep = k.deposit?.s || 0;
  return {
    cash: dep + lg.s,                       // tien that da nhan
    deposit: dep,
    depositCount: k.deposit?.n || 0,
    depositors: k.deposit?.users || 0,
    legacy: lg.s,
    legacyCount: lg.n,
    spend: -(k.spend?.s || 0),              // coin da dung de thue bot
    spendCount: k.spend?.n || 0,
    reward: k.reward?.s || 0,               // coin thuong da trao
    adjust: k.adjust?.s || 0,               // coin admin cong (+) / tru (-)
  };
}

function stats() {
  const now = Date.now();
  const today = startOfDay(now);
  const month = startOfMonth(now);
  const products = (since) => {
    const out = { fb: { n: 0, s: 0 }, zalo: { n: 0, s: 0 } };
    for (const r of sq.byProduct.all(toDb(since))) if (out[r.product]) out[r.product] = { n: r.n, s: r.s };
    return out;
  };

  // 30 ngay gan nhat (co ca ngay khong co giao dich) + 12 thang gan nhat
  const dFrom = today - 29 * 86400000;
  const dMap = Object.fromEntries(sq.daily.all(toDb(dFrom)).map((r) => [r.k, r]));
  const dLegacy = Object.fromEntries(sq.legacyDaily.all(toDb(dFrom)).map((r) => [r.k, r.s]));
  const daily = Array.from({ length: 30 }, (_, i) => {
    const k = vnDay(dFrom + i * 86400000 + 3600e3);
    return { k, cash: (dMap[k]?.deposit || 0) + (dLegacy[k] || 0), spend: dMap[k]?.spend || 0 };
  });

  const cur = new Date(now + VN_MS);
  const mFrom = Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() - 11, 1) - VN_MS;
  const mMap = Object.fromEntries(sq.monthly.all(toDb(mFrom)).map((r) => [r.k, r]));
  const mLegacy = Object.fromEntries(sq.legacyMonthly.all(toDb(mFrom)).map((r) => [r.k, r.s]));
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const k = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() - 11 + i, 1)).toISOString().slice(0, 7);
    return { k, cash: (mMap[k]?.deposit || 0) + (mLegacy[k] || 0), spend: mMap[k]?.spend || 0 };
  });

  const liab = sq.liability.get();
  return {
    today: period(today),
    week: period(today - 6 * 86400000),
    month: period(month),
    all: period(0),
    products: { month: products(month), all: products(0) },
    wallets: { balance: liab.s, holders: liab.users },
    pending: sq.pending.get(),
    daily,
    monthly,
    month_key: vnMonth(now),
  };
}

/* ---------- Lich su giao dich ---------- */

const LEDGER = `
  WITH ledger AS (
    SELECT t.id AS id, t.created_at AS at, t.user_id AS user_id, t.kind AS kind, t.amount AS amount,
           t.balance AS balance, t.ref AS ref, t.note AS note
      FROM wallet_tx t
    UNION ALL
    SELECT -o.id, o.paid_at, o.user_id, 'legacy', o.amount, NULL, o.code,
           'Đơn thuê bot ' || COALESCE(o.bot_name, '') || ' (chuyển khoản trực tiếp)'
      FROM orders o WHERE ${LEGACY}
  )`;

const KINDS = ["deposit", "spend", "reward", "adjust", "legacy"];

/** Doc bo loc tu query string -> { where, args } (ngay tinh theo gio VN) */
function filters(qs) {
  const w = [], a = [];
  if (KINDS.includes(qs.kind)) { w.push("l.kind = ?"); a.push(qs.kind); }
  const text = String(qs.q || "").trim().toLowerCase().slice(0, 40);
  if (text) {
    w.push("(lower(u.username) LIKE ? OR lower(COALESCE(l.note, '')) LIKE ? OR lower(COALESCE(l.ref, '')) LIKE ?)");
    const like = `%${text.replace(/[%_]/g, "")}%`;
    a.push(like, like, like);
  }
  const day = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? Date.parse(s + "T00:00:00Z") - VN_MS : null);
  const from = day(qs.from), to = day(qs.to);
  if (from !== null) { w.push("l.at >= ?"); a.push(toDb(from)); }
  if (to !== null) { w.push("l.at < ?"); a.push(toDb(to + 86400000)); }
  return { where: w.length ? "WHERE " + w.join(" AND ") : "", args: a };
}

function ledger(qs, page, limit) {
  const f = filters(qs);
  const base = `${LEDGER} FROM ledger l JOIN users u ON u.id = l.user_id ${f.where}`;
  const tot = db
    .prepare(`${LEDGER} SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN l.amount > 0 THEN l.amount END), 0) AS inn,
              COALESCE(-SUM(CASE WHEN l.amount < 0 THEN l.amount END), 0) AS out
              FROM ledger l JOIN users u ON u.id = l.user_id ${f.where}`)
    .get(...f.args);
  const rows = db
    .prepare(`${LEDGER} SELECT l.id, l.at, l.kind, l.amount, l.balance, l.ref, l.note, u.username
              FROM ledger l JOIN users u ON u.id = l.user_id ${f.where}
              ORDER BY l.at DESC, l.id DESC LIMIT ? OFFSET ?`)
    .all(...f.args, limit, (page - 1) * limit);
  return { rows, total: tot.n, inn: tot.inn, out: tot.out, pages: Math.max(1, Math.ceil(tot.n / limit)) };
}

const KIND_VI = { deposit: "Nạp tiền", spend: "Thanh toán", reward: "Thưởng", adjust: "Điều chỉnh", legacy: "Đơn chuyển khoản cũ" };
const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // chong chen cong thuc khi mo bang Excel
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const vnTime = (utc) => (utc ? new Date(Date.parse(utc.replace(" ", "T") + "Z") + VN_MS).toISOString().slice(0, 19).replace("T", " ") : "");

function register(router, auth) {
  router.get("/admin/stats", auth.requireAdmin, (req, res) => res.json(stats()));

  router.get("/admin/transactions", auth.requireAdmin, (req, res) => {
    const page = Math.max(1, Math.floor(Number(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(10, Math.floor(Number(req.query.limit)) || 40));
    res.json({ page, limit, ...ledger(req.query, page, limit) });
  });

  /** Xuat toan bo (theo bo loc) ra CSV, mo duoc bang Excel / Google Sheets */
  router.get("/admin/transactions.csv", auth.requireAdmin, (req, res) => {
    const { rows } = ledger(req.query, 1, 20000);
    const head = ["Thời gian (giờ VN)", "Tài khoản", "Loại", "Số coin", "Số dư sau", "Mã tham chiếu", "Ghi chú"];
    const lines = [head, ...rows.map((r) => [vnTime(r.at), r.username, KIND_VI[r.kind] || r.kind, r.amount, r.balance ?? "", r.ref || "", r.note || ""])];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="giao-dich-${vnDay(Date.now())}.csv"`);
    res.send("\ufeff" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n"));
  });

  /** Lich su vi cua chinh nguoi dung, tai them theo trang (cuon xuong) */
  router.get("/wallet/history", (req, res) => {
    const before = Math.floor(Number(req.query.before)) || Number.MAX_SAFE_INTEGER;
    const kind = ["deposit", "spend", "reward", "adjust"].includes(req.query.kind) ? req.query.kind : null;
    const rows = db
      .prepare(
        `SELECT id, kind, amount, balance, note, created_at FROM wallet_tx
          WHERE user_id = ? AND id < ? ${kind ? "AND kind = ?" : ""} ORDER BY id DESC LIMIT 31`
      )
      .all(...[req.user.id, before, ...(kind ? [kind] : [])]);
    res.json({ rows: rows.slice(0, 30), more: rows.length > 30 });
  });
}

module.exports = { register, stats, ledger };
