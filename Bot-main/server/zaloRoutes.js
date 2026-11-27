const express = require("express");
const auth = require("./auth");
const zalo = require("./zalo");
const { MAX_PER_USER, canCreate } = require("./fbBots");

const billing = require("./billing");
const gemini = require("./gemini");
const qr = require("./zaloQr");
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

/** Luu dang nhap Zalo (IMEI + cookie) cho bot. Dung chung cho nhap tay va dang nhap QR. */
function saveLogin(id, imei, cookies) {
  zalo.zq.setLogin.run(zalo.encrypt(JSON.stringify(cookies)), zalo.encrypt(imei), id);
  const warn = cookies.zpw_sek ? null : "Khong thay cookie zpw_sek - kiem tra lai co dung cookie chat.zalo.me khong.";
  return { count: Object.keys(cookies).length, warn };
}

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
  res.json({ ok: true, ...saveLogin(z.id, imei, cookies) });
});

/* ---------- Dang nhap bang ma QR ---------- */

router.get("/qr/support", async (req, res) => res.json({ available: await qr.isAvailable() }));

router.post("/bots/:id/qr/start", async (req, res) => {
  const z = ownBot(req, res, true);
  if (!z) return;
  try {
    const v = await qr.start({
      botId: z.id,
      userId: req.user.id,
      onCreds: async ({ imei, cookies }) => {
        const cur = zalo.zq.byId.get(z.id);
        if (!cur || cur.user_id !== req.user.id) throw new Error("Bot không còn tồn tại.");
        if (cur.locked && req.user.role !== "admin") throw new Error("Bot này đã bị quản trị viên khoá.");
        return saveLogin(z.id, imei, cookies);
      },
    });
    res.json({ ok: true, ...v });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/bots/:id/qr", (req, res) => {
  const z = ownBot(req, res, false);
  if (!z) return;
  res.json(qr.get(z.id, req.user.id));
});

router.post("/bots/:id/qr/cancel", (req, res) => {
  const z = ownBot(req, res, false);
  if (!z) return;
  qr.cancel(z.id);
  res.json({ ok: true });
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

/* ---------- Tro ly AI Gemini (khoa API tu cau hinh tren web) ---------- */

const geminiHits = new Map();
function geminiAllow(userId) {
  const now = Date.now();
  let h = geminiHits.get(userId);
  if (!h || now > h.reset) { h = { n: 0, reset: now + 60000 }; geminiHits.set(userId, h); }
  return ++h.n <= 6;
}

router.get("/bots/:id/gemini", (req, res) => {
  const z = ownBot(req, res, false);
  if (!z) return;
  const key = zalo.decrypt(z.gemini_key_enc) || "";
  res.json({
    hasKey: !!key,
    keyHint: key ? "…" + key.slice(-4) : "",
    sharedKey: !!process.env.GEMINI_API_KEY, // may chu co san khoa dung chung (bien GEMINI_API_KEY)
    model: z.gemini_model || "",
    prompt: z.gemini_prompt || "",
    defaultModel: gemini.DEFAULT_MODEL,
  });
});

router.post("/bots/:id/gemini", (req, res) => {
  const z = ownBot(req, res, true);
  if (!z) return;
  const b = req.body || {};
  let keyEnc = z.gemini_key_enc || null;
  if (b.clearKey) keyEnc = null;
  else if (String(b.key || "").trim()) {
    const k = String(b.key).trim();
    if (!gemini.validKey(k)) return res.status(400).json({ error: "Khoá API không hợp lệ (chỉ gồm chữ, số, dấu chấm, gạch ngang và gạch dưới, dài ít nhất 20 ký tự)." });
    keyEnc = zalo.encrypt(k);
  }
  const model = String(b.model || "").trim();
  if (model && !gemini.validModel(model)) return res.status(400).json({ error: "Tên model không hợp lệ, ví dụ: gemini-flash-latest" });
  const prompt = String(b.prompt || "").trim().slice(0, 2000);
  zalo.zq.setGemini.run(keyEnc, model || null, prompt || null, z.id);
  res.json({ ok: true, hasKey: !!keyEnc, keyHint: keyEnc ? "…" + zalo.decrypt(keyEnc).slice(-4) : "" });
});

router.post("/bots/:id/gemini/test", async (req, res) => {
  const z = ownBot(req, res, false);
  if (!z) return;
  if (!geminiAllow(req.user.id)) return res.status(429).json({ error: "Thử quá nhiều lần, đợi một phút rồi thử lại." });
  const typed = String(req.body?.key || "").trim();
  const key = typed || zalo.decrypt(z.gemini_key_enc) || process.env.GEMINI_API_KEY || "";
  if (!key) return res.status(400).json({ error: "Chưa có khoá để thử. Hãy dán khoá vào ô rồi bấm lại." });
  if (!gemini.validKey(key)) return res.status(400).json({ error: "Khoá API không hợp lệ." });
  const model = String(req.body?.model || z.gemini_model || "").trim() || gemini.DEFAULT_MODEL;
  if (!gemini.validModel(model)) return res.status(400).json({ error: "Tên model không hợp lệ." });
  try {
    const out = await gemini.ask({ key, model, text: "Chỉ trả lời đúng một từ: OK" });
    res.json({ ok: true, model, reply: out.slice(0, 40) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
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
