/**
 * VI COIN: nap tien -> thanh toan bang vi -> bang xep hang nap theo thang.
 *
 *  - 1 coin = 1d. So du = tong cac giao dich trong bang wallet_tx (khong luu cot rieng).
 *  - Nap tien: nguoi dung nhap so tien tuy y, chuyen khoan kem ma NAPxxxx, admin xac nhan
 *    thi coin vao vi (day khong phai cong thanh toan tu dong).
 *  - Gia han bot: tru coin trong vi, cong han cho dung bot do.
 *  - Xep hang: tong coin NAP trong thang (gio Viet Nam). Thuong/dieu chinh khong tinh.
 *  - Dau thang moi, he thong TU DONG cong thuong cho top 1-2-3 cua thang truoc (chay lai
 *    moi 30 phut, moi thang chi trao dung 1 lan nhờ bang reward_months).
 */

const crypto = require("crypto");
const { db, q, getSetting, setSetting } = require("./db");
const billing = require("./billing");

db.exec(`
  CREATE TABLE IF NOT EXISTS wallet_tx (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,              -- deposit | spend | reward | adjust
    amount     INTEGER NOT NULL,           -- coin, am = tru
    balance    INTEGER NOT NULL,           -- so du sau giao dich
    ref        TEXT,
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS wallet_tx_user ON wallet_tx(user_id);
  CREATE INDEX IF NOT EXISTS wallet_tx_kind ON wallet_tx(kind, created_at);

  CREATE TABLE IF NOT EXISTS deposits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code       TEXT UNIQUE NOT NULL,
    amount     INTEGER NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',   -- pending | paid | cancelled
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at    TEXT,
    note       TEXT
  );

  CREATE TABLE IF NOT EXISTS reward_months (
    month   TEXT PRIMARY KEY,
    done_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const MIN_DEPOSIT = 10000;
const MAX_DEPOSIT = 50000000;
const RANKS = 10;                                                  // so hang co bang xep hang / co the co thuong
const DEFAULT_REWARDS = [50000, 30000, 10000, 0, 0, 0, 0, 0, 0, 0]; // admin chinh trong tab Quan tri (0 = khong thuong)

const MONTH_SQL = "strftime('%Y-%m', datetime(t.created_at, '+7 hours'))";
const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");

const wq = {
  sum: db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM wallet_tx WHERE user_id = ?"),
  add: db.prepare("INSERT INTO wallet_tx (user_id, kind, amount, balance, ref, note) VALUES (?, ?, ?, ?, ?, ?)"),
  history: db.prepare("SELECT id, kind, amount, balance, note, created_at FROM wallet_tx WHERE user_id = ? ORDER BY id DESC LIMIT 30"),
  deposited: db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM wallet_tx WHERE user_id = ? AND kind = 'deposit'"),
  depositedMonth: db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS n FROM wallet_tx t WHERE user_id = ? AND kind = 'deposit' AND ${MONTH_SQL} = ?`
  ),
  depInsert: db.prepare("INSERT INTO deposits (user_id, code, amount) VALUES (?, ?, ?)"),
  depById: db.prepare("SELECT * FROM deposits WHERE id = ?"),
  depByCode: db.prepare("SELECT id FROM deposits WHERE code = ?"),
  depPending: db.prepare("SELECT * FROM deposits WHERE user_id = ? AND status = 'pending' ORDER BY id DESC"),
  depPaid: db.prepare("UPDATE deposits SET status = 'paid', paid_at = datetime('now'), note = ? WHERE id = ?"),
  depCancel: db.prepare("UPDATE deposits SET status = 'cancelled' WHERE id = ?"),
  depAll: db.prepare(
    `SELECT d.*, u.username FROM deposits d JOIN users u ON u.id = d.user_id
     ORDER BY (d.status = 'pending') DESC, d.id DESC LIMIT 100`
  ),
  orderInsert: db.prepare(
    `INSERT INTO orders (user_id, code, plan, days, amount, status, paid_at, note, product, bots, bot_id, bot_name, coupon, base_amount, discount)
     VALUES (?, ?, ?, ?, ?, 'paid', datetime('now'), 'Thanh toán bằng ví', ?, 1, ?, ?, ?, ?, ?)`
  ),
  top: db.prepare(
    `SELECT t.user_id, u.username, SUM(t.amount) AS total, MIN(t.created_at) AS first_at
       FROM wallet_tx t JOIN users u ON u.id = t.user_id
      WHERE t.kind = 'deposit' AND u.role != 'admin' AND ${MONTH_SQL} = ?
      GROUP BY t.user_id HAVING total > 0
      ORDER BY total DESC, first_at ASC LIMIT ?`
  ),
  depositMonths: db.prepare(`SELECT DISTINCT ${MONTH_SQL} AS m FROM wallet_tx t WHERE kind = 'deposit'`),
  rewardDone: db.prepare("SELECT 1 AS x FROM reward_months WHERE month = ?"),
  rewardMark: db.prepare("INSERT INTO reward_months (month) VALUES (?)"),
  rewardLog: db.prepare(
    `SELECT t.ref, t.amount, u.username FROM wallet_tx t JOIN users u ON u.id = t.user_id
      WHERE t.kind = 'reward' AND t.ref LIKE ? ORDER BY CAST(substr(t.ref, instr(t.ref, '#') + 1) AS INTEGER)`
  ),
};

/** node:sqlite khong co .transaction(): tu mo / dong giao dich */
function tx(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch (_) {}
    throw e;
  }
}

const balance = (userId) => wq.sum.get(userId).n;

/** Ghi mot giao dich (am = tru). Khong cho so du xuong am. Goi TRONG tx(). */
function credit(userId, kind, amount, ref, note) {
  const bal = balance(userId) + amount;
  if (bal < 0) throw new Error("Số dư ví không đủ");
  wq.add.run(userId, kind, amount, bal, ref || null, note || null);
  return bal;
}

/* ================= Nap tien ================= */

function randomCode(prefix, taken) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = prefix + Array.from(crypto.randomBytes(7)).map((b) => alphabet[b % alphabet.length]).join("");
  } while (taken(code));
  return code;
}

const depView = (d) => ({ ...d, qr: d.status === "pending" ? billing.qrUrl({ amount: d.amount, code: d.code }) : null });

function createDeposit(user, raw) {
  const amount = Math.round(Number(String(raw).replace(/[^0-9]/g, "")));
  if (!(amount >= MIN_DEPOSIT)) throw new Error(`Nạp tối thiểu ${fmt(MIN_DEPOSIT)} coin`);
  if (amount > MAX_DEPOSIT) throw new Error(`Mỗi lần nạp tối đa ${fmt(MAX_DEPOSIT)} coin`);
  if (wq.depPending.all(user.id).length >= 3) throw new Error("Bạn đang có 3 lệnh nạp chưa xử lý. Huỷ bớt trước khi tạo thêm.");
  const code = randomCode("NAP", (c) => wq.depByCode.get(c));
  const id = Number(wq.depInsert.run(user.id, code, amount).lastInsertRowid);
  return depView(wq.depById.get(id));
}

function approveDeposit(id, note) {
  return tx(() => {
    const d = wq.depById.get(id);
    if (!d) throw new Error("Không tìm thấy lệnh nạp");
    if (d.status === "paid") throw new Error("Lệnh nạp này đã được xác nhận rồi");
    if (d.status === "cancelled") throw new Error("Lệnh nạp này đã bị huỷ");
    wq.depPaid.run(note || null, id);
    const bal = credit(d.user_id, "deposit", d.amount, d.code, `Nạp tiền ${d.code}`);
    return { deposit: d, balance: bal };
  });
}

/* ================= Thanh toan bang vi ================= */

function payOrder(user, product, botId, planId, coupon) {
  const qt = billing.quote(user, product, botId, planId, coupon);
  return tx(() => {
    const bal = balance(user.id);
    if (qt.total > bal) {
      throw new Error(`Số dư không đủ: cần ${fmt(qt.total)} coin, ví đang có ${fmt(bal)}. Hãy nạp thêm ở tab Nạp tiền.`);
    }
    const expires = billing.extendBot(product, qt.botId, qt.days); // throw neu bot da bi xoa
    const code = randomCode("V", (c) => q.orderByCode.get(c));
    wq.orderInsert.run(user.id, code, qt.plan, qt.days, qt.total, product, qt.botId, qt.botName, qt.coupon?.code || null, qt.base, qt.discount);
    if (qt.total > 0) credit(user.id, "spend", -qt.total, code, `Gia hạn ${qt.botName} · ${qt.planName}`);
    return { order: q.orderByCode.get(code), expires, balance: balance(user.id) };
  });
}

/* ================= Bang xep hang + thuong thang ================= */

const vnNow = () => new Date(Date.now() + 7 * 3600e3);
const monthOf = (d = vnNow()) => d.toISOString().slice(0, 7);
const prevMonthOf = () => { const d = vnNow(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7); };
const nextMonthStart = () => { const d = vnNow(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 7 * 3600e3).toISOString(); };
const label = (m) => `${m.slice(5)}/${m.slice(0, 4)}`;

function maskName(n) {
  n = String(n);
  return n.length <= 2 ? n[0] + "***" : n.slice(0, 2) + "***" + n.slice(-1);
}

function rewards() {
  return Array.from({ length: RANKS }, (_, i) => {
    const v = getSetting("reward_top" + (i + 1));
    return v === null || v === "" ? DEFAULT_REWARDS[i] : Math.max(0, Math.floor(Number(v)) || 0);
  });
}

function saveRewards(list) {
  if (!Array.isArray(list) || list.length !== RANKS) throw new Error(`Cần đủ ${RANKS} mức thưởng`);
  list.forEach((v, i) => {
    const n = Math.round(Number(String(v).replace(/[^0-9]/g, "")));
    if (!(n >= 0 && n <= 100000000)) throw new Error("Mức thưởng từ 0 đến 100.000.000 coin");
    setSetting("reward_top" + (i + 1), n);
  });
  return rewards();
}

function leaderboard(user) {
  const month = monthOf();
  const all = wq.top.all(month, 100);
  const idx = all.findIndex((r) => r.user_id === user.id);
  const prev = prevMonthOf();
  return {
    month, label: label(month), endsAt: nextMonthStart(), rewards: rewards(),
    top: all.slice(0, RANKS).map((r, i) => ({ rank: i + 1, name: maskName(r.username), total: r.total, me: r.user_id === user.id })),
    me: idx < 0 ? null : { rank: idx + 1, total: all[idx].total, toNext: idx > 0 ? all[idx - 1].total - all[idx].total + 1 : 0 },
    last: {
      label: label(prev),
      winners: wq.rewardLog.all(prev + "#%").map((r) => ({ rank: Number(r.ref.split("#")[1]), name: maskName(r.username), reward: r.amount })),
    },
  };
}

/** Trao thuong cho mot thang da qua. Chay lai bao nhieu lan cung chi trao 1 lan. */
function awardMonth(month) {
  tx(() => {
    if (wq.rewardDone.get(month)) return;
    const rw = rewards();
    wq.top.all(month, RANKS).forEach((r, i) => {
      if (rw[i] > 0) credit(r.user_id, "reward", rw[i], `${month}#${i + 1}`, `Thưởng top ${i + 1} tháng ${label(month)}`);
    });
    wq.rewardMark.run(month);
  });
}

function runRewards() {
  try {
    const cur = monthOf();
    wq.depositMonths.all().map((r) => r.m).filter((m) => m && m < cur && !wq.rewardDone.get(m)).sort().forEach(awardMonth);
  } catch (e) {
    console.error("[wallet] lỗi trao thưởng:", e.message);
  }
}
runRewards();
setInterval(runRewards, 30 * 60 * 1000).unref();

/* ================= Route ================= */

function register(router, auth) {
  const fail = (res, e) => res.status(400).json({ error: e.message });

  router.get("/wallet", (req, res) => {
    const id = req.user.id;
    res.json({
      balance: balance(id),
      totalDeposited: wq.deposited.get(id).n,
      monthDeposited: wq.depositedMonth.get(id, monthOf()).n,
      min: MIN_DEPOSIT, max: MAX_DEPOSIT,
      bank: { id: getSetting("bank_id"), account: getSetting("bank_account"), owner: getSetting("bank_owner"), note: getSetting("pay_note") },
      pending: wq.depPending.all(id).map(depView),
      history: wq.history.all(id),
    });
  });

  router.get("/wallet/balance", (req, res) => res.json({ balance: balance(req.user.id) }));

  router.post("/wallet/deposit", (req, res) => {
    try { res.json({ ok: true, deposit: createDeposit(req.user, req.body?.amount) }); } catch (e) { fail(res, e); }
  });

  router.post("/wallet/deposit/:id/cancel", (req, res) => {
    const d = wq.depById.get(Number(req.params.id));
    if (!d || d.user_id !== req.user.id) return res.status(404).json({ error: "Không tìm thấy lệnh nạp" });
    if (d.status !== "pending") return res.status(400).json({ error: "Lệnh nạp này không còn chờ xử lý" });
    wq.depCancel.run(d.id);
    res.json({ ok: true });
  });

  router.get("/leaderboard", (req, res) => res.json(leaderboard(req.user)));

  router.get("/admin/deposits", auth.requireAdmin, (req, res) => res.json({ deposits: wq.depAll.all() }));

  router.post("/admin/deposits/:id/approve", auth.requireAdmin, (req, res) => {
    try {
      const r = approveDeposit(Number(req.params.id), String(req.body?.note || ""));
      res.json({ ok: true, amount: r.deposit.amount });
    } catch (e) { fail(res, e); }
  });

  router.post("/admin/deposits/:id/cancel", auth.requireAdmin, (req, res) => {
    const d = wq.depById.get(Number(req.params.id));
    if (d && d.status === "pending") wq.depCancel.run(d.id);
    res.json({ ok: true });
  });

  router.post("/admin/wallet/adjust", auth.requireAdmin, (req, res) => {
    try {
      const u = q.userByName.get(String(req.body?.username || "").trim().toLowerCase());
      if (!u) throw new Error("Không tìm thấy tài khoản này");
      const amount = Math.round(Number(req.body?.amount));
      if (!amount || Math.abs(amount) > 1e9) throw new Error("Số coin phải khác 0");
      const note = String(req.body?.note || "").trim().slice(0, 80) || (amount > 0 ? "Quản trị cộng coin" : "Quản trị trừ coin");
      const bal = tx(() => credit(u.id, "adjust", amount, null, note));
      res.json({ ok: true, balance: bal });
    } catch (e) { fail(res, e); }
  });

  router.get("/admin/rewards", auth.requireAdmin, (req, res) => res.json({ rewards: rewards() }));
  router.post("/admin/rewards", auth.requireAdmin, (req, res) => {
    try { res.json({ ok: true, rewards: saveRewards(req.body?.rewards) }); } catch (e) { fail(res, e); }
  });
}

module.exports = { saveRewards, register, balance, payOrder, createDeposit, approveDeposit, leaderboard, runRewards, awardMonth, rewards };
