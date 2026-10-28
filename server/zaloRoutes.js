const express = require("express");
const auth = require("./auth");
const zalo = require("./zalo");
const { MAX_PER_USER, canCreate } = require("./fbBots");

const billing = require("./billing");
const { getSetting } = require("./db");

/** Chan bat bot khi CHINH bot do chua thanh toan / het han */
function botGuard(req, res, next) {
  const row = zalo.zq.byId.get(Number(req.params.id));
  if (row && row.user_id === req.user.id && !billing.isBotActive(req.user, row)) {
    return res.status(402).json({
      error: "Bot nay chua thanh toan hoac da het han. Thanh toan ngay trong phan chi tiet cua bot.",
      expired: true,
    });
  }
  next();
}

const router = express.Router();
router.use(auth.requireLogin);

/** Admin an ca muc nay -> nguoi dung thuong khong goi duoc API nua (admin van dung binh thuong) */
router.use((req, res, next) => {
  if (req.user.role !== "admin" && getSetting("hide_zalo") === "1") {
    return res.status(404).json({ error: "Muc nay hien khong kha dung" });
  }
  next();
});

/** Khoa do admin dat: xem fbRoutes.js. Admin khong bi gioi han. */
function ownBot(req, res, write = false) {
  const z = zalo.zq.byId.get(Number(req.params.id));
  const isAdmin = req.user.role === "admin";
  if (!z || z.user_id !== req.user.id) {
    res.status(404).json({ error: "Khong tim thay bot Zalo" });
    return null;
  }
  if (write && z.locked && !isAdmin) {
    res.status(403).json({ error: "Bot nay da bi quan tri vien khoa, ban khong the thay doi." });
    return null;
  }
  return z;
}

function view(z, user) {
  let count = 0;
  try {
    count = Object.keys(JSON.parse(zalo.decrypt(z.cookies_enc) || "{}")).length;
  } catch (_) {}
  return {
    id: z.id,
    name: z.name,
    prefix: z.prefix,
    authorId: z.author_id || "",
    isMainBot: !!z.is_main_bot,
    autostart: !!z.autostart,
    locked: !!z.locked && user.role !== "admin",
    hasLogin: count > 0 && !!z.imei_enc,
    cookieCount: count,
    plan: billing.botStatus(user, z),
    pendingOrder: billing.pendingForBot("zalo", z.id)[0]?.code || null,
    ...zalo.status(z.id),
  };
}

router.get("/bots", (req, res) => {
  res.json({
    bots: zalo.zq.byUser.all(req.user.id).map((z) => view(z, req.user)),
    limit: req.user.role === "admin" ? null : MAX_PER_USER,
    unlimited: req.user.role === "admin",
    slots: { running: zalo.runningCount(), max: zalo.MAX_RUNNING },
  });
});

router.post("/bots", (req, res) => {
  const n = zalo.zq.countByUser.get(req.user.id).n;
  if (!canCreate(req.user, n)) {
    return res.status(400).json({ error: `Moi tai khoan toi da ${MAX_PER_USER} bot Zalo` });
  }
  const name = String(req.body?.name || "").trim().slice(0, 40) || `Bot Zalo ${n + 1}`;
  const info = zalo.zq.insert.run(req.user.id, name);
  const id = Number(info.lastInsertRowid);
  const trial = billing.trialForNewBot(req.user, "zalo", id);
  res.json({ ok: true, id, trial });
});

router.delete("/bots/:id", (req, res) => {
  const z = ownBot(req, res, true);
  if (!z) return;
  if (billing.pendingForBot("zalo", z.id).length) {
    return res.status(400).json({ error: "Bot nay dang co don cho thanh toan. Huy don truoc khi xoa bot." });
  }
  zalo.forget(z.id);
  zalo.zq.del.run(z.id);
  res.json({ ok: true });
});

router.post("/bots/:id/login", (req, res) => {
  const z = ownBot(req, res, true);
  if (!z) return;
  const imei = String(req.body?.imei || "").trim();
  if (imei.length < 8) return res.status(400).json({ error: "IMEI khong hop le" });
  let cookies;
  try {
    cookies = zalo.parseCookies(req.body?.cookies);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  zalo.zq.setLogin.run(zalo.encrypt(JSON.stringify(cookies)), zalo.encrypt(imei), z.id);
  const warn = cookies.zpw_sek ? null : "Khong thay cookie zpw_sek - kiem tra lai co dung cookie chat.zalo.me khong.";
  res.json({ ok: true, count: Object.keys(cookies).length, warn });
});

router.delete("/bots/:id/login", (req, res) => {
  const z = ownBot(req, res, true);
  if (!z) return;
  zalo.stop(z.id);
  zalo.zq.clearLogin.run(z.id);
  res.json({ ok: true });
});

router.post("/bots/:id/settings", (req, res) => {
  const z = ownBot(req, res, true);
  if (!z) return;
  const b = req.body || {};
  // ID chu bot khong con bat buoc (bot tu lay ID tai khoan cua no); giu gia tri cu neu khong gui
  const authorId = b.authorId === undefined ? z.author_id || "" : String(b.authorId || "").trim();
  if (authorId && !/^\d{5,25}$/.test(authorId)) {
    return res.status(400).json({ error: "ID Zalo chi gom chu so" });
  }
  const name = String(b.name || "").trim().slice(0, 40) || z.name;
  const prefix = String(b.prefix ?? "/").trim().slice(0, 3) || "/";
  zalo.zq.setSettings.run(name, prefix, authorId || null, b.isMainBot ? 1 : 0, b.autostart ? 1 : 0, z.id);
  res.json({ ok: true });
});

router.post("/bots/:id/start", botGuard, (req, res) => {
  const z = ownBot(req, res, true);
  if (!z) return;
  try {
    zalo.start(z.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/bots/:id/stop", (req, res) => {
  const z = ownBot(req, res, true);
  if (!z) return;
  zalo.stop(z.id);
  res.json({ ok: true });
});

router.get("/bots/:id/logs", (req, res) => {
  const z = ownBot(req, res);
  if (!z) return;
  res.json({ logs: zalo.logs(z.id) });
});

module.exports = router;
