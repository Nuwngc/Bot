const express = require("express");
const auth = require("./auth");
const { encrypt, decrypt } = require("./crypto");
const { fq, MAX_PER_USER, canCreate, normalizeAppstate, uidOf, aiConfig } = require("./fbBots");
const { loginWithPassword } = require("./fbLogin");
const manager = require("../src/bot/manager");

const billing = require("./billing");

/** Chan bat bot khi CHINH bot do chua thanh toan / het han */
function botGuard(req, res, next) {
  const row = fq.byId.get(Number(req.params.id));
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

/**
 * Lay bot cua chinh nguoi dang dang nhap, khong thi 404.
 * Bot bi an -> nguoi dung thuong coi nhu khong ton tai.
 * write = true: bot bi khoa -> nguoi dung thuong khong duoc sua / bat / tat / xoa.
 * Admin khong bi gioi han boi an / khoa.
 */
function ownBot(req, res, write = false) {
  const bot = fq.byId.get(Number(req.params.id));
  const isAdmin = req.user.role === "admin";
  if (!bot || bot.user_id !== req.user.id || (bot.hidden && !isAdmin)) {
    res.status(404).json({ error: "Khong tim thay bot" });
    return null;
  }
  if (write && bot.locked && !isAdmin) {
    res.status(403).json({ error: "Bot nay da bi quan tri vien khoa, ban khong the thay doi." });
    return null;
  }
  return bot;
}

function view(b, user) {
  let count = 0;
  try {
    count = JSON.parse(decrypt(b.appstate_enc) || "[]").length;
  } catch (_) {}
  return {
    id: b.id,
    name: b.name,
    prefix: b.prefix,
    autostart: !!b.autostart,
    locked: !!b.locked && user.role !== "admin",
    hasLogin: count > 0,
    cookieCount: count,
    fbName: b.fb_name,
    fbUid: b.fb_uid,
    plan: billing.botStatus(user, b),
    pendingOrder: billing.pendingForBot("fb", b.id)[0]?.code || null,
    ...manager.status(b.id),
  };
}

router.get("/bots", (req, res) => {
  res.json({
    bots: fq
      .byUser.all(req.user.id)
      .filter((b) => !b.hidden || req.user.role === "admin")
      .map((b) => view(b, req.user)),
    limit: req.user.role === "admin" ? null : MAX_PER_USER,
    unlimited: req.user.role === "admin",
    slots: { running: manager.runningCount(), max: manager.MAX_CONCURRENT },
  });
});

router.post("/bots", (req, res) => {
  const n = fq.byUser.all(req.user.id).filter((b) => !b.hidden).length;
  if (!canCreate(req.user, n)) {
    return res.status(400).json({ error: `Moi tai khoan toi da ${MAX_PER_USER} bot Facebook` });
  }
  const name = String(req.body?.name || "").trim().slice(0, 40) || `Bot FB ${n + 1}`;
  const info = fq.insert.run(req.user.id, name);
  const id = Number(info.lastInsertRowid);
  const trial = billing.trialForNewBot(req.user, "fb", id);
  res.json({ ok: true, id, trial });
});

router.delete("/bots/:id", (req, res) => {
  const bot = ownBot(req, res, true);
  if (!bot) return;
  if (billing.pendingForBot("fb", bot.id).length) {
    return res.status(400).json({ error: "Bot nay dang co don cho thanh toan. Huy don truoc khi xoa bot." });
  }
  manager.forget(bot.id);
  fq.del.run(bot.id);
  res.json({ ok: true });
});

router.post("/bots/:id/settings", (req, res) => {
  const bot = ownBot(req, res, true);
  if (!bot) return;
  const b = req.body || {};
  const name = String(b.name || "").trim().slice(0, 40) || bot.name;
  const prefix = String(b.prefix || "!").trim().slice(0, 3) || "!";
  fq.setSettings.run(name, prefix, b.autostart ? 1 : 0, bot.id);
  res.json({ ok: true });
});

router.post("/bots/:id/appstate", (req, res) => {
  const bot = ownBot(req, res, true);
  if (!bot) return;
  try {
    const list = normalizeAppstate(req.body?.appstate);
    fq.setAppstate.run(encrypt(JSON.stringify(list)), bot.id);
    res.json({ ok: true, count: list.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/bots/:id/appstate/login", async (req, res) => {
  const bot = ownBot(req, res, true);
  if (!bot) return;
  const email = String(req.body?.email || "").trim();
  const password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ error: "Thieu email hoac mat khau" });
  try {
    const appState = await loginWithPassword(email, password);
    fq.setAppstate.run(encrypt(JSON.stringify(appState)), bot.id);
    res.json({ ok: true, count: appState.length });
  } catch (e) {
    res.status(400).json({
      error:
        e.message +
        " — Cach nay khong ho tro tai khoan bat 2FA va de bi Facebook chan hon dan cookie. Hay thu dan cookie.",
    });
  }
});

router.delete("/bots/:id/appstate", (req, res) => {
  const bot = ownBot(req, res, true);
  if (!bot) return;
  manager.stop(bot.id);
  fq.setAppstate.run(null, bot.id);
  res.json({ ok: true });
});

router.post("/bots/:id/start", botGuard, async (req, res) => {
  const bot = ownBot(req, res, true);
  if (!bot) return;
  let appState;
  try {
    appState = JSON.parse(decrypt(bot.appstate_enc) || "null");
  } catch (_) {}
  if (!Array.isArray(appState) || !appState.length) {
    return res.status(400).json({ error: "Bot nay chua co cookie Facebook" });
  }

  // Tra loi ngay, dang nhap chay nen - giao dien tu cap nhat trang thai
  const p = manager.start(bot.id, {
    appState,
    uid: uidOf(bot),
    ownerId: req.user.id,
    prefix: bot.prefix,
    ...aiConfig(req.user.id),
  });
  p.then((r) => {
    if (r && !r.cancelled) fq.setFbInfo.run(r.fbUid, r.fbName || null, bot.id);
  }).catch(() => {});

  // Loi kiem tra truoc (dang chay, het cho, trung tai khoan) bao ngay
  const early = await Promise.race([p.then(() => null, (e) => e), new Promise((r) => setTimeout(() => r(null), 300))]);
  if (early && manager.status(bot.id).status !== "starting") {
    return res.status(400).json({ error: early.message });
  }
  res.json({ ok: true });
});

router.post("/bots/:id/stop", (req, res) => {
  const bot = ownBot(req, res, true);
  if (!bot) return;
  manager.stop(bot.id);
  res.json({ ok: true });
});

router.get("/bots/:id/logs", (req, res) => {
  const bot = ownBot(req, res);
  if (!bot) return;
  res.json({ logs: manager.logs(bot.id) });
});

module.exports = router;
