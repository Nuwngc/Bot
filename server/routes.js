const express = require("express");
const { db, q, ensureBotRow, getSetting, setSetting, allSettings } = require("./db");
const billing = require("./billing");
const wallet = require("./wallet");
const { encrypt, decrypt, mask } = require("./crypto");
const auth = require("./auth");
const userBots = require("./userBots");
const { fq } = require("./fbBots");
const zaloMod = require("./zalo");
const botManager = require("../src/bot/manager");
const presence = require("./presence");

const router = express.Router();

/* ================= Cong khai ================= */

router.post("/login", (req, res) => {
  const ip = req.ip || "?";
  if (auth.throttled(ip)) {
    return res.status(429).json({ error: "Sai qua nhieu lan. Thu lai sau 10 phut." });
  }

  const { username, password } = req.body || {};
  const user = username && q.userByName.get(String(username).trim());

  if (!user || !user.active || !auth.verify(String(password || ""), user.password_hash)) {
    auth.noteFail(ip);
    return res.status(401).json({ error: "Sai tai khoan hoac mat khau" });
  }

  auth.noteOk(ip);
  q.touchLogin.run(user.id);
  req.session.userId = user.id;
  res.json({ ok: true, role: user.role });
});

/** Trang dang ky co mo khong + bang gia (hien thi truoc khi dang nhap) */
router.get("/public", (req, res) => {
  res.json({
    signupOpen: getSetting("signup_open") === "1",
    trialDays: Number(getSetting("trial_days") || 0),
    prices: billing.priceTable(),
    wallet: wallet.balance(req.user.id),
  });
});

router.post("/register", (req, res) => {
  if (getSetting("signup_open") !== "1") {
    return res.status(403).json({ error: "Dang ky dang tam dong" });
  }
  const ip = req.ip || "?";
  if (!auth.signupQuota(ip)) {
    return res.status(429).json({ error: "Dang ky qua nhieu tu mot mang. Thu lai ngay mai." });
  }

  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!auth.validUsername(username)) {
    return res.status(400).json({ error: "Ten dang nhap 3-24 ky tu, chi chu thuong/so/._-" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Mat khau toi thieu 8 ky tu" });
  }
  if (q.userByName.get(username)) {
    return res.status(400).json({ error: "Ten dang nhap da co nguoi dung" });
  }

  const trial = Number(getSetting("trial_days") || 0);
  const info = q.insertUser.run(username, auth.hash(password), "user", null, 1);
  const id = Number(info.lastInsertRowid);
  ensureBotRow(id);
  req.session.userId = id;
  res.json({ ok: true, trialDays: trial });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

/* ================= Can dang nhap ================= */

router.use(auth.requireLogin);

/** Muc Facebook / Zalo nao nguoi dung nay duoc thay */
function sectionsFor(user) {
  const isAdmin = user.role === "admin";
  return {
    fb: isAdmin || getSetting("hide_fb") !== "1",
    zalo: isAdmin || getSetting("hide_zalo") !== "1",
  };
}

/**
 * So nguoi dang online + so bot dang hoat dong. Trang goi moi ~20 giay, moi lan goi la mot nhip online.
 * Nguoi dung thuong chi thay so cua muc ma admin khong an.
 */
router.get("/stats", (req, res) => {
  presence.touch(req.user.id);
  const sec = sectionsFor(req.user);
  const fb = sec.fb ? botManager.activeCount() : null;
  const zalo = sec.zalo ? zaloMod.activeCount() : null;
  res.json({
    online: presence.onlineCount(),
    botsRunning: (fb || 0) + (zalo || 0),
    fb,
    zalo,
  });
});

router.get("/me", (req, res) => {
  const bot = ensureBotRow(req.user.id);
  const aiKey = decrypt(bot.ai_key_enc);

  res.json({
    username: req.user.username,
    role: req.user.role,
    settings: {
      aiModel: bot.ai_model || "",
      aiSystem: bot.ai_system || "",
    },
    // Khong bao gio tra API key that ve trinh duyet
    showAiKeyField: req.user.role === "admin",
    hasAiKey: !!aiKey,
    aiKeyMasked: aiKey ? mask(aiKey) : "",
    aiManagedByAdmin: req.user.role !== "admin",
    // Muc nao bi admin an thi nguoi dung thuong khong thay (admin luon thay)
    sections: sectionsFor(req.user),
  });
});

/* ---------- Thue bot ---------- */

/** Tong quan thanh toan: bang gia, moi bot kem han, don hang */
router.get("/billing", (req, res) => {
  const orders = q.ordersByUser.all(req.user.id).map((o) => ({
    ...o,
    qr: o.status === "pending" ? billing.qrUrl({ amount: o.amount, code: o.code }) : null,
  }));
  const sec = sectionsFor(req.user);
  const bots = [
    ...(sec.fb ? fq.byUser.all(req.user.id) : []).map((b) => ({ product: "fb", id: b.id, name: b.name, ...billing.botStatus(req.user, b) })),
    ...(sec.zalo ? zaloMod.zq.byUser.all(req.user.id) : []).map((z) => ({ product: "zalo", id: z.id, name: z.name, ...billing.botStatus(req.user, z) })),
  ];
  res.json({
    prices: billing.priceTable(),
    unlimited: req.user.role === "admin",
    trialDays: Number(getSetting("trial_days") || 0),
    bank: {
      id: getSetting("bank_id"),
      account: getSetting("bank_account"),
      owner: getSetting("bank_owner"),
      note: getSetting("pay_note"),
    },
    bots,
    orders,
  });
});

/** Tinh truoc so tien gia han cho mot bot (co the kem ma giam gia) */
router.post("/billing/quote", (req, res) => {
  try {
    const b = req.body || {};
    res.json(billing.quote(req.user, String(b.product || ""), b.botId, String(b.plan || ""), b.coupon));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/billing/order", (req, res) => {
  try {
    const b = req.body || {};
    // Thanh toan bang vi coin: tru coin va cong han cho bot ngay, khong can admin duyet
    const r = wallet.payOrder(req.user, String(b.product || ""), b.botId, String(b.plan || ""), b.coupon);
    res.json({ ok: true, order: { ...r.order, autoApproved: true, expires: r.expires }, balance: r.balance });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/billing/cancel/:id", (req, res) => {
  const order = q.orderById.get(Number(req.params.id));
  if (!order || order.user_id !== req.user.id) return res.status(404).json({ error: "Khong tim thay don" });
  if (order.status !== "pending") return res.status(400).json({ error: "Don nay khong con cho thanh toan" });
  q.cancelOrder.run(order.id);
  res.json({ ok: true });
});

/** Luu API key AI */
router.post("/aikey", (req, res) => {
  const key = String(req.body?.key || "").trim();
  ensureBotRow(req.user.id);
  q.setAiKey.run(key ? encrypt(key) : null, req.user.id);
  res.json({ ok: true });
});

/** Cau hinh AI dung chung cho moi bot FB cua tai khoan */
const setAiSettings = db.prepare(
  "UPDATE bots SET ai_model = ?, ai_system = ?, updated_at = datetime('now') WHERE user_id = ?"
);
router.post("/settings", (req, res) => {
  const b = req.body || {};
  const aiModel = String(b.aiModel || "").slice(0, 80);
  const aiSystem = String(b.aiSystem || "").slice(0, 2000);
  ensureBotRow(req.user.id);
  setAiSettings.run(aiModel || null, aiSystem || null, req.user.id);
  res.json({ ok: true });
});

/* ================= Admin ================= */

router.get("/admin/users", auth.requireAdmin, (req, res) => {
  const users = q.allUsers.all().map((u) => ({
    ...u,
    bots: userBots.summary(u.id),
  }));
  res.json({ users });
});

router.post("/admin/users", auth.requireAdmin, (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const role = req.body?.role === "admin" ? "admin" : "user";

  if (!/^[a-z0-9_.-]{3,24}$/.test(username)) {
    return res.status(400).json({ error: "Ten dang nhap 3-24 ky tu, chi chu thuong/so/._-" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Mat khau toi thieu 8 ky tu" });
  }
  if (q.userByName.get(username)) {
    return res.status(400).json({ error: "Ten dang nhap da ton tai" });
  }

  // Admin tao ho: cap luon so ngay dung thu mac dinh
  const trial = Number(getSetting("trial_days") || 0);
  const info = q.insertUser.run(username, auth.hash(password), role, null, 0);
  ensureBotRow(Number(info.lastInsertRowid));
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

router.post("/admin/users/:id/password", auth.requireAdmin, (req, res) => {
  const password = String(req.body?.password || "");
  if (password.length < 8) return res.status(400).json({ error: "Mat khau toi thieu 8 ky tu" });
  q.setPassword.run(auth.hash(password), Number(req.params.id));
  res.json({ ok: true });
});

router.post("/admin/users/:id/active", auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const active = req.body?.active ? 1 : 0;
  if (!active) userBots.stopUserBots(id);
  q.setActive.run(active, id);
  res.json({ ok: true });
});

router.delete("/admin/users/:id", auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "Khong the tu xoa chinh minh" });
  userBots.deleteUserBots(id);
  q.deleteUser.run(id);
  res.json({ ok: true });
});

/* ---------- Admin: don thue bot ---------- */

router.get("/admin/orders", auth.requireAdmin, (req, res) => {
  res.json({ orders: q.allOrders.all() });
});

router.post("/admin/orders/:id/approve", auth.requireAdmin, (req, res) => {
  try {
    const r = billing.approve(Number(req.params.id), String(req.body?.note || ""));
    res.json({ ok: true, product: r.product, expires: r.expires, botName: r.order.bot_name });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/admin/orders/:id/cancel", auth.requireAdmin, (req, res) => {
  q.cancelOrder.run(Number(req.params.id));
  res.json({ ok: true });
});

/** Admin xem cac bot (va han) cua mot tai khoan */
router.get("/admin/users/:id/bots", auth.requireAdmin, (req, res) => {
  const user = q.userById.get(Number(req.params.id));
  if (!user) return res.status(404).json({ error: "Khong tim thay tai khoan" });
  const bots = [
    ...fq.byUser.all(user.id).map((b) => ({
      product: "fb",
      id: b.id,
      name: b.name,
      locked: !!b.locked,
      running: ["running", "starting"].includes(botManager.status(b.id).status),
      ...billing.botStatus(user, b),
    })),
    ...zaloMod.zq.byUser.all(user.id).map((z) => ({
      product: "zalo",
      id: z.id,
      name: z.name,
      locked: !!z.locked,
      running: ["running", "starting"].includes(zaloMod.status(z.id).status),
      ...billing.botStatus(user, z),
    })),
  ];
  res.json({ bots });
});

/** Tim bot theo loai (fb | zalo) + id */
function adminBotRow(product, id) {
  if (product === "fb") return fq.byId.get(Number(id));
  if (product === "zalo") return zaloMod.zq.byId.get(Number(id));
  return null;
}

/** Admin khoa / mo khoa mot bot: nguoi dung khong sua / bat / tat / xoa duoc bot bi khoa */
router.post("/admin/bots/:product/:id/flags", auth.requireAdmin, (req, res) => {
  const row = adminBotRow(req.params.product, req.params.id);
  if (!row) return res.status(404).json({ error: "Khong tim thay bot" });
  const locked = req.body?.locked ? 1 : 0;
  (req.params.product === "fb" ? fq : zaloMod.zq).setFlags.run(locked, row.id);
  res.json({ ok: true, locked: !!locked });
});

/** Admin tat mot bot (can khi bot bi an, nguoi dung khong tu tat duoc) */
router.post("/admin/bots/:product/:id/stop", auth.requireAdmin, (req, res) => {
  const row = adminBotRow(req.params.product, req.params.id);
  if (!row) return res.status(404).json({ error: "Khong tim thay bot" });
  if (req.params.product === "fb") botManager.stop(row.id);
  else zaloMod.stop(row.id);
  res.json({ ok: true });
});

/** Admin cong/tru ngay cho MOT bot, khong qua don */
router.post("/admin/bots/:product/:id/extend", auth.requireAdmin, (req, res) => {
  const days = Number(req.body?.days);
  if (!Number.isFinite(days) || days === 0) return res.status(400).json({ error: "So ngay khong hop le" });
  try {
    const expires = billing.extendBot(req.params.product, Number(req.params.id), days);
    res.json({ ok: true, expires });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ---------- Admin: bang gia + ma giam gia ---------- */

router.get("/admin/pricing", auth.requireAdmin, (req, res) => {
  res.json({ plans: billing.plans(), coupons: billing.listCoupons() });
});

router.post("/admin/plans", auth.requireAdmin, (req, res) => {
  try {
    res.json({ ok: true, plans: billing.savePlans(req.body?.plans) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/admin/coupons", auth.requireAdmin, (req, res) => {
  try {
    res.json({ ok: true, coupon: billing.createCoupon(req.body || {}) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/admin/coupons/:id/active", auth.requireAdmin, (req, res) => {
  billing.setCouponActive(Number(req.params.id), !!req.body?.active);
  res.json({ ok: true });
});

router.delete("/admin/coupons/:id", auth.requireAdmin, (req, res) => {
  billing.deleteCoupon(Number(req.params.id));
  res.json({ ok: true });
});

/* ---------- Admin: cau hinh chung ---------- */

router.get("/admin/settings", auth.requireAdmin, (req, res) => {
  const s = allSettings();
  const globalKey = decrypt(s.global_ai_key_enc);
  res.json({
    settings: { ...s, global_ai_key_enc: undefined },
    hasGlobalAiKey: !!globalKey,
    globalAiKeyMasked: globalKey ? mask(globalKey) : "",
  });
});

router.post("/admin/settings", auth.requireAdmin, (req, res) => {
  const allowed = ["signup_open", "trial_days", "bank_id", "bank_account", "bank_owner", "pay_note", "global_ai_model", "global_ai_system", "hide_fb", "hide_zalo"];
  for (const k of allowed) {
    if (k in (req.body || {})) setSetting(k, req.body[k]);
  }
  if ("globalAiKey" in (req.body || {})) {
    const key = String(req.body.globalAiKey || "").trim();
    setSetting("global_ai_key_enc", key ? encrypt(key) : "");
  }
  const s = allSettings();
  const globalKey = decrypt(s.global_ai_key_enc);
  res.json({
    ok: true,
    settings: { ...s, global_ai_key_enc: undefined },
    hasGlobalAiKey: !!globalKey,
    globalAiKeyMasked: globalKey ? mask(globalKey) : "",
  });
});

/* ---------- tien ich ---------- */

function safeCount(json) {
  try {
    return JSON.parse(json).length;
  } catch (_) {
    return 0;
  }
}

wallet.register(router, auth);

module.exports = router;
