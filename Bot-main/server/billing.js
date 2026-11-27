/**
 * Thue bot - THANH TOAN THEO TUNG BOT.
 *
 *  - Moi bot (Facebook hoac Zalo) co han su dung rieng (cot expires).
 *  - Nguoi thue tao don cho MOT bot; khi admin xac nhan, chi bot do duoc cong han.
 *  - Bang gia (cac moc thoi han + gia FB / Zalo) do admin chinh tren web.
 *  - Ma giam giá: theo % hoac so tien, gioi han luot dung, han dung, loai bot.
 *  - Dung thu: bot DAU TIEN moi loai cua moi tai khoan duoc tang so ngay dung thu.
 *
 * Day KHONG phai cong thanh toan: nguoi thue chuyen khoan voi ma don,
 * admin doi chieu roi bam xac nhan (don 0d nho ma giam 100% duoc duyet ngay).
 */

const crypto = require("crypto");
const { db, q, getSetting, setSetting } = require("./db");
const { fq } = require("./fbBots");
const zalo = require("./zalo");

const PRODUCTS = {
  fb: { name: "Facebook" },
  zalo: { name: "Zalo" },
};

const toIso = (d) => d.toISOString().slice(0, 19).replace("T", " ");
const roundK = (n) => Math.round(n / 1000) * 1000;

function checkProduct(product) {
  if (!PRODUCTS[product]) throw new Error("Loai bot khong hop le");
  return product;
}

/* ================= Bang gia (admin chinh) ================= */

const DEFAULT_PLANS = [
  { id: "w1", name: "1 tuần", days: 7 },
  { id: "m1", name: "1 tháng", days: 30 },
  { id: "m3", name: "3 tháng", days: 90 },
];

// Lan dau: dung gia da cau hinh o ban truoc (price_fb_w1...) lam gia khoi diem
if (!getSetting("plans_json")) {
  const init = DEFAULT_PLANS.map((p) => ({
    ...p,
    fb: Number(getSetting(`price_fb_${p.id}`)) || 0,
    zalo: Number(getSetting(`price_zalo_${p.id}`)) || 0,
  }));
  setSetting("plans_json", JSON.stringify(init));
}

function plans() {
  try {
    const list = JSON.parse(getSetting("plans_json") || "[]");
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

/** Gia 0d = khong ban goi do cho loai bot nay */
function plansFor(product) {
  return plans()
    .filter((p) => Number(p[product]) > 0)
    .map((p) => ({ id: p.id, name: p.name, days: p.days, amount: Number(p[product]) }));
}

function priceTable() {
  return { fb: plansFor("fb"), zalo: plansFor("zalo") };
}

/** Admin luu lai toan bo bang gia */
function savePlans(list) {
  if (!Array.isArray(list) || list.length === 0) throw new Error("Can it nhat 1 goi");
  if (list.length > 10) throw new Error("Toi da 10 goi");
  const seen = new Set();
  const clean = list.map((p) => {
    const name = String(p.name || "").trim().slice(0, 30);
    const days = Math.floor(Number(p.days));
    const fb = Math.round(Number(p.fb) || 0);
    const zl = Math.round(Number(p.zalo) || 0);
    if (!name) throw new Error("Goi nao cung can ten");
    if (!(days >= 1 && days <= 3650)) throw new Error(`Goi "${name}": so ngay tu 1 den 3650`);
    if (fb < 0 || zl < 0) throw new Error(`Goi "${name}": gia khong duoc am`);
    let id = String(p.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 12);
    if (!id || seen.has(id)) id = "p" + crypto.randomBytes(3).toString("hex");
    seen.add(id);
    return { id, name, days, fb, zalo: zl };
  });
  setSetting("plans_json", JSON.stringify(clean));
  return clean;
}

/* ================= Han su dung cua tung bot ================= */

function botRow(product, id) {
  checkProduct(product);
  return product === "fb" ? fq.byId.get(Number(id)) : zalo.zq.byId.get(Number(id));
}

function setBotExpires(product, id, iso) {
  (product === "fb" ? fq.setExpires : zalo.zq.setExpires).run(iso, Number(id));
}

function daysLeftOf(expires) {
  if (!expires) return 0;
  const ms = new Date(expires + "Z") - new Date();
  return ms <= 0 ? 0 : Math.ceil(ms / 86400000);
}

/** Bot con han khong? Bot cua admin luon chay duoc. */
function isBotActive(user, row) {
  if (!row) return false;
  if (user?.role === "admin") return true;
  return !!row.expires && new Date(row.expires + "Z") > new Date();
}

function botStatus(user, row) {
  return {
    active: isBotActive(user, row),
    unlimited: user?.role === "admin",
    expires: row?.expires || null,
    daysLeft: daysLeftOf(row?.expires),
  };
}

/** Cong (hoac tru) han cho MOT bot. Con han thi cong tiep, het han thi tinh tu hom nay. */
function extendBot(product, id, days) {
  const row = botRow(product, id);
  if (!row) throw new Error("Khong tim thay bot (co the da bi xoa)");
  const now = new Date();
  const current = row.expires ? new Date(row.expires + "Z") : null;
  const base = current && current > now ? current : now;
  const iso = toIso(new Date(base.getTime() + days * 86400000));
  setBotExpires(product, id, iso);
  return iso;
}

/** Dung thu: chi bot dau tien moi loai cua moi tai khoan */
const trialQ = {
  fb: db.prepare("UPDATE users SET trial_fb_used = 1 WHERE id = ?"),
  zalo: db.prepare("UPDATE users SET trial_zalo_used = 1 WHERE id = ?"),
};
function trialForNewBot(user, product, botId) {
  const days = Number(getSetting("trial_days") || 0);
  if (!(days > 0) || user.role === "admin") return null;
  const fresh = q.userById.get(user.id);
  if (fresh[`trial_${product}_used`]) return null;
  trialQ[product].run(user.id);
  const iso = toIso(new Date(Date.now() + days * 86400000));
  setBotExpires(product, botId, iso);
  return { days, expires: iso };
}

/* ================= Ma giam gia ================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS coupons (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT UNIQUE NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'percent',  -- percent | amount
    value       INTEGER NOT NULL,
    product     TEXT NOT NULL DEFAULT 'all',      -- all | fb | zalo
    max_uses    INTEGER NOT NULL DEFAULT 0,       -- 0 = khong gioi han
    once_per_user INTEGER NOT NULL DEFAULT 1,
    expires_at  TEXT,
    active      INTEGER NOT NULL DEFAULT 1,
    note        TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const cq = {
  all: db.prepare("SELECT * FROM coupons ORDER BY id DESC"),
  byCode: db.prepare("SELECT * FROM coupons WHERE code = ?"),
  byId: db.prepare("SELECT * FROM coupons WHERE id = ?"),
  insert: db.prepare(
    "INSERT INTO coupons (code, kind, value, product, max_uses, once_per_user, expires_at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ),
  setActive: db.prepare("UPDATE coupons SET active = ? WHERE id = ?"),
  del: db.prepare("DELETE FROM coupons WHERE id = ?"),
  // Don cho thanh toan cung giu cho, de ma khong bi dung qua so luot
  uses: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE coupon = ? AND status IN ('paid', 'pending')"),
  usesByUser: db.prepare(
    "SELECT COUNT(*) AS n FROM orders WHERE coupon = ? AND user_id = ? AND status IN ('paid', 'pending')"
  ),
};

const normCode = (c) => String(c || "").trim().toUpperCase();

function couponView(c) {
  return { ...c, used: cq.uses.get(c.code).n };
}

function listCoupons() {
  return cq.all.all().map(couponView);
}

function createCoupon(b) {
  const code = normCode(b.code);
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) throw new Error("Ma 3-20 ky tu, chi chu, so, _ va -");
  if (cq.byCode.get(code)) throw new Error("Ma nay da ton tai");
  const kind = b.kind === "amount" ? "amount" : "percent";
  const value = Math.round(Number(String(b.value).replace(/[^0-9]/g, "")));
  if (!(value > 0)) throw new Error("Gia tri giam phai lon hon 0");
  if (kind === "percent" && value > 100) throw new Error("Giam theo % toi da 100");
  const product = ["fb", "zalo"].includes(b.product) ? b.product : "all";
  const maxUses = Math.max(0, Math.floor(Number(b.maxUses) || 0));
  let expiresAt = null;
  if (b.expiresAt) {
    const d = new Date(String(b.expiresAt) + "T23:59:59+07:00"); // het ngay theo gio Viet Nam
    if (isNaN(d)) throw new Error("Ngay het han khong hop le");
    expiresAt = toIso(d);
  }
  const note = String(b.note || "").trim().slice(0, 80) || null;
  cq.insert.run(code, kind, value, product, maxUses, b.oncePerUser === false ? 0 : 1, expiresAt, note);
  return couponView(cq.byCode.get(code));
}

function setCouponActive(id, active) {
  cq.setActive.run(active ? 1 : 0, Number(id));
}

function deleteCoupon(id) {
  cq.del.run(Number(id));
}

/** Kiem tra ma cho mot nguoi dung + loai bot. Loi -> throw voi ly do ro rang. */
function checkCoupon(user, code, product) {
  const c = cq.byCode.get(normCode(code));
  if (!c || !c.active) throw new Error("Ma giam gia khong ton tai hoac da tat");
  if (c.expires_at && new Date(c.expires_at + "Z") < new Date()) throw new Error("Ma giam gia da het han");
  if (c.product !== "all" && c.product !== product) {
    throw new Error(`Ma nay chi dung cho bot ${PRODUCTS[c.product].name}`);
  }
  if (c.max_uses > 0 && cq.uses.get(c.code).n >= c.max_uses) throw new Error("Ma giam gia da het luot");
  if (c.once_per_user && cq.usesByUser.get(c.code, user.id).n > 0) {
    throw new Error("Ban da dung ma nay roi");
  }
  return c;
}

/* ================= Tinh tien + don hang ================= */

/**
 * Tinh tien gia han cho MOT bot.
 * @returns {{product, botId, botName, plan, planName, days, base, coupon, discount, total}}
 */
function quote(user, product, botId, planId, couponCode) {
  checkProduct(product);
  const row = botRow(product, botId);
  if (!row || row.user_id !== user.id) throw new Error("Khong tim thay bot");
  const plan = plansFor(product).find((p) => p.id === planId);
  if (!plan) throw new Error("Goi cuoc khong hop le");

  const base = plan.amount;
  let discount = 0;
  let coupon = null;
  if (normCode(couponCode)) {
    const c = checkCoupon(user, couponCode, product);
    discount = c.kind === "percent" ? roundK((base * c.value) / 100) : c.value;
    discount = Math.min(base, discount);
    coupon = { code: c.code, kind: c.kind, value: c.value };
  }

  return {
    product,
    botId: row.id,
    botName: row.name,
    plan: plan.id,
    planName: plan.name,
    days: plan.days,
    base,
    coupon,
    discount,
    total: base - discount,
  };
}

/** Ma chuyen khoan: chi chu hoa + so, de doc khi doi chieu sao ke */
function makeCode(product) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // bo I,O,0,1 de khoi nham
  let code;
  do {
    code =
      (product === "zalo" ? "ZL" : "FB") +
      Array.from(crypto.randomBytes(7))
        .map((b) => alphabet[b % alphabet.length])
        .join("");
  } while (q.orderByCode.get(code));
  return code;
}

/** Link anh QR VietQR (khong can API key). null neu admin chua khai bao ngan hang. */
function qrUrl({ amount, code }) {
  const bank = getSetting("bank_id");
  const account = getSetting("bank_account");
  const owner = getSetting("bank_owner");
  if (!bank || !account) return null;
  const p = new URLSearchParams({ amount: String(amount), addInfo: code, accountName: owner || "" });
  return `https://img.vietqr.io/image/${encodeURIComponent(bank)}-${encodeURIComponent(account)}-compact2.png?${p}`;
}

const oq = {
  insert: db.prepare(
    `INSERT INTO orders (user_id, code, plan, days, amount, product, bots, bot_id, bot_name, coupon, base_amount, discount)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
  ),
  pendingForBot: db.prepare(
    "SELECT * FROM orders WHERE product = ? AND bot_id = ? AND status = 'pending' ORDER BY id DESC"
  ),
};

function pendingForBot(product, botId) {
  return oq.pendingForBot.all(product, Number(botId));
}

function createOrder(user, product, botId, planId, couponCode) {
  const qt = quote(user, product, botId, planId, couponCode);

  if (pendingForBot(product, botId).length) {
    throw new Error("Bot nay dang co don cho thanh toan. Thanh toan hoac huy don do truoc.");
  }
  if (q.pendingByUser.all(user.id).length >= 5) {
    throw new Error("Ban dang co 5 don chua thanh toan. Huy bot di truoc.");
  }

  const code = makeCode(product);
  const info = oq.insert.run(
    user.id, code, qt.plan, qt.days, qt.total, product,
    qt.botId, qt.botName, qt.coupon?.code || null, qt.base, qt.discount
  );
  const id = Number(info.lastInsertRowid);

  // Don 0d (ma giam 100%): khong can chuyen khoan, duyet luon
  if (qt.total === 0) {
    const r = approve(id, "Tu dong: don 0d");
    return { ...q.orderById.get(id), autoApproved: true, expires: r.expires };
  }
  return q.orderById.get(id);
}

function approve(orderId, note) {
  const order = q.orderById.get(orderId);
  if (!order) throw new Error("Khong tim thay don");
  if (order.status === "paid") throw new Error("Don nay da duoc xac nhan roi");
  if (order.status === "cancelled") throw new Error("Don nay da bi huy");
  const product = order.product || "fb";
  if (!order.bot_id) throw new Error("Don cu (theo tai khoan) khong gan bot - hay cong ngay thu cong cho bot");
  const expires = extendBot(product, order.bot_id, order.days); // throw neu bot da bi xoa
  q.markPaid.run(note || null, orderId);
  return { order, product, expires };
}

/* ================= Chuyen du lieu tu ban "goi theo tai khoan" ================= */

if (getSetting("migrated_per_bot") !== "1") {
  let n = 0;
  for (const u of db.prepare("SELECT * FROM users").all()) {
    for (const product of ["fb", "zalo"]) {
      const exp = u[`${product}_expires`];
      if (!exp) continue;
      const slots = Math.max(1, Number(u[`${product}_slots`]) || 1);
      const rows = product === "fb" ? fq.byUser.all(u.id) : zalo.zq.byUser.all(u.id);
      for (const row of rows.slice(0, slots)) {
        if (!row.expires) {
          setBotExpires(product, row.id, exp);
          n++;
        }
      }
      trialQ[product].run(u.id); // da co han truoc day -> coi nhu da dung thu
    }
  }
  setSetting("migrated_per_bot", "1");
  if (n) console.log(`[db] da chuyen han su dung cua ${n} bot sang kieu tinh theo tung bot`);
}

module.exports = {
  PRODUCTS,
  plans,
  plansFor,
  priceTable,
  savePlans,
  botRow,
  botStatus,
  isBotActive,
  extendBot,
  daysLeftOf,
  trialForNewBot,
  listCoupons,
  createCoupon,
  setCouponActive,
  deleteCoupon,
  quote,
  createOrder,
  pendingForBot,
  qrUrl,
  approve,
};
