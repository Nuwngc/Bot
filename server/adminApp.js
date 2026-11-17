/**
 * API cho app Android danh rieng cho admin (thu muc admin-app/).
 * Tat ca deu can quyen admin. App dang nhap bang chinh /api/login (cookie phien) nhu trinh duyet.
 *
 *  GET /api/admin/app/overview   tong quan: may chu, nguoi dung, bot, tien, doanh thu, giao dich ngan hang gan day
 *  GET /api/admin/app/users      danh sach nguoi dung kem so du va bot
 *  GET /api/admin/app/alerts     (?after=<id>) viec moi de app bao thong bao: tien tu dong cong, giao dich chua khop, lenh cho duyet
 *  GET /api/admin/app/logs       (?after=<seq>&level=error) log may chu trong bo nho
 */
const { db } = require("./db");
const wallet = require("./wallet");
require("./autopay"); // dam bao bang bank_events ton tai
const presence = require("./presence");
const revenue = require("./revenue");
const logbuf = require("./logbuf");
const pkg = require("../package.json");

const VN_MS = 7 * 3600e3;
const startOfDay = (ms) => Math.floor((ms + VN_MS) / 86400000) * 86400000 - VN_MS;
const toDb = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

const sq = {
  users: db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(active), 0) AS active, COALESCE(SUM(role = 'admin'), 0) AS admins FROM users"),
  pending: db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS s FROM deposits WHERE status = 'pending'"),
  unmatched: db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS s FROM bank_events WHERE status = 'unmatched'"),
  freeToday: db.prepare(
    `SELECT COALESCE(SUM(t.amount), 0) AS s FROM wallet_tx t JOIN users u ON u.id = t.user_id
      WHERE u.role != 'admin' AND t.amount > 0 AND t.kind IN ('task', 'reward', 'adjust') AND t.created_at >= ?`
  ),
  events: db.prepare(
    `SELECT e.id, e.provider, e.amount, e.content, e.status, e.note, e.created_at, u.username
       FROM bank_events e LEFT JOIN users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT ?`
  ),
  eventsAfter: db.prepare(
    `SELECT e.id, e.amount, e.status, e.content, u.username FROM bank_events e LEFT JOIN users u ON u.id = e.user_id
      WHERE e.id > ? ORDER BY e.id LIMIT 20`
  ),
  maxEvent: db.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM bank_events"),
  allUsers: db.prepare("SELECT id, username, role, active, created_at, last_login, plan_expires FROM users ORDER BY id"),
};

function botCounts() {
  try {
    const fb = require("../src/bot/manager").activeCount();
    const zalo = require("./zalo").activeCount();
    return { fb, zalo, running: (fb || 0) + (zalo || 0) };
  } catch (_) {
    return { fb: null, zalo: null, running: null };
  }
}

function overview() {
  const mem = process.memoryUsage();
  const rev = revenue.stats();
  const u = sq.users.get();
  const pend = sq.pending.get();
  const unm = sq.unmatched.get();
  return {
    server: {
      version: pkg.version,
      node: process.version,
      uptime: Math.floor(process.uptime()),
      rssMb: Math.round(mem.rss / 1048576),
      heapMb: Math.round(mem.heapUsed / 1048576),
      env: process.env.NODE_ENV || "development",
      now: Date.now(),
    },
    users: { total: u.total, active: u.active, admins: u.admins, online: presence.onlineCount() },
    bots: botCounts(),
    money: {
      pendingDeposits: pend.n,
      pendingSum: pend.s,
      unmatched: unm.n,
      unmatchedSum: unm.s,
      autopay: require("./db").getSetting("autopay_enabled") === "1",
      freeCoinToday: sq.freeToday.get(toDb(startOfDay(Date.now()))).s,
      walletBalance: rev.wallets.balance,
      walletHolders: rev.wallets.holders,
    },
    revenue: {
      today: { cash: rev.today.cash, spend: rev.today.spend },
      week: { cash: rev.week.cash, spend: rev.week.spend },
      month: { cash: rev.month.cash, spend: rev.month.spend },
      daily: rev.daily.slice(-14),
    },
    events: sq.events.all(8),
  };
}

function register(router, auth) {
  router.get("/admin/app/overview", auth.requireAdmin, (req, res) => res.json(overview()));

  router.get("/admin/app/users", auth.requireAdmin, (req, res) => {
    const users = sq.allUsers.all().map((u) => {
      let bots = null;
      try { bots = require("./userBots").summary(u.id); } catch (_) {}
      return { ...u, balance: wallet.balance(u.id), bots };
    });
    res.json({ users });
  });

  router.get("/admin/app/alerts", auth.requireAdmin, (req, res) => {
    const after = Math.max(0, Number(req.query.after) || 0);
    res.json({
      maxId: sq.maxEvent.get().m,
      events: sq.eventsAfter.all(after),
      pendingDeposits: sq.pending.get().n,
      unmatched: sq.unmatched.get().n,
    });
  });

  router.get("/admin/app/logs", auth.requireAdmin, (req, res) => {
    const lvl = ["info", "warn", "error"].includes(req.query.level) ? req.query.level : "";
    res.json(logbuf.since(Math.max(0, Number(req.query.after) || 0), Math.min(500, Number(req.query.limit) || 300), lvl));
  });
}

module.exports = { register, overview };
