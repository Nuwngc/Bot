/**
 * AN / TINH COIN CHO TUNG CONG CU (tab Cong cu)
 *
 *  Admin chinh cho moi cong cu: an (nguoi dung khong thay), gia (coin cho mot phien mo khoa) va do dai phien (phut).
 *  Gia = 0 la mien phi. Co gia thi nguoi dung bam "Mo khoa", bi tru coin trong vi, dung thoai mai trong thoi gian cua phien.
 *  Admin luon dung mien phi va thay ca cong cu dang an (co nhan).
 *
 *  Muc do chan:
 *   - Cong cu co dung may chu (Doc van ban, Lay van ban tu link, Mail 5 phut, Mail 12h/24h): may chu chan that, goi thang API cung bi tu choi.
 *   - Cong cu chay hoan toan tren trinh duyet (con lai): chi chan o giao dien. Ma cong cu nam tren may nguoi dung nen
 *     nguoi biet ky thuat van co the vuot qua, muon chan chac chan phai dua cong cu do len may chu.
 *
 *  Luu cau hinh trong bang settings (khoa tools_config), trang thai mo khoa tung nguoi trong bang tool_unlocks.
 */

const { db, getSetting, setSetting } = require("./db");
const wallet = require("./wallet");

/** Danh sach cong cu (id khop voi id the <details id="tl-ID"> ben giao dien). server = true neu may chu chan that. */
const CATALOG = [
  { id: "mail", title: "Mail 5 phút", server: true },
  { id: "maillong", title: "Mail 12h / 24h", server: true },
  { id: "cookie", title: "Chuyển đổi cookie" },
  { id: "qr", title: "Tạo mã QR" },
  { id: "text", title: "Xử lý văn bản" },
  { id: "pass", title: "Tạo mật khẩu mạnh" },
  { id: "pick", title: "Chọn ngẫu nhiên / chia đội" },
  { id: "time", title: "Đổi thời gian" },
  { id: "img2pdf", title: "Ảnh sang PDF" },
  { id: "imgtool", title: "Nén và đổi cỡ ảnh" },
  { id: "pagetext", title: "Lấy văn bản từ link", server: true },
  { id: "tts", title: "Đọc văn bản", server: true },
  { id: "num2vi", title: "Số thành chữ" },
  { id: "vat", title: "Tính VAT và phần trăm" },
  { id: "wcount", title: "Đếm chữ" },
];
const IDS = new Set(CATALOG.map((t) => t.id));
const DEFAULT_MINUTES = 30;
const MAX_PRICE = 1000000;
const SAMPLE_TTS = "Xin chào, đây là giọng đọc thử."; // nghe thử giọng luôn miễn phí

db.exec(`
  CREATE TABLE IF NOT EXISTS tool_unlocks (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool    TEXT NOT NULL,
    until   INTEGER NOT NULL,                 -- thoi diem het phien (ms)
    PRIMARY KEY (user_id, tool)
  );
`);

const uq = {
  get: db.prepare("SELECT until FROM tool_unlocks WHERE user_id = ? AND tool = ?"),
  set: db.prepare(
    "INSERT INTO tool_unlocks (user_id, tool, until) VALUES (?, ?, ?) ON CONFLICT(user_id, tool) DO UPDATE SET until = excluded.until"
  ),
  purge: db.prepare("DELETE FROM tool_unlocks WHERE until < ?"),
};

/* ---------- cau hinh ---------- */

function readAll() {
  let raw = {};
  try { raw = JSON.parse(getSetting("tools_config") || "{}") || {}; } catch (_) {}
  const out = {};
  for (const t of CATALOG) {
    const c = raw[t.id] || {};
    out[t.id] = {
      hidden: !!c.hidden,
      price: Math.max(0, Math.min(MAX_PRICE, Math.round(Number(c.price) || 0))),
      minutes: Math.max(1, Math.min(1440, Math.round(Number(c.minutes) || DEFAULT_MINUTES))),
    };
  }
  return out;
}

const cfgOf = (id) => readAll()[id];
const isAdmin = (u) => u?.role === "admin";
const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");

/** So giay con lai cua phien mo khoa (0 = chua mo hoac het han) */
function leftSec(userId, id) {
  const r = uq.get.get(userId, id);
  return r ? Math.max(0, Math.ceil((r.until - Date.now()) / 1000)) : 0;
}

/** Trang thai cua moi cong cu danh cho mot nguoi dung */
function stateFor(user) {
  const all = readAll();
  const tools = {};
  for (const t of CATALOG) {
    const c = all[t.id];
    tools[t.id] = { hidden: c.hidden, price: c.price, minutes: c.minutes, left: c.price > 0 ? leftSec(user.id, t.id) : 0 };
  }
  return { tools, balance: wallet.balance(user.id), admin: isAdmin(user) };
}

/** Mo khoa (tru coin) mot cong cu. Dang trong phien thi khong tru them. */
function unlock(user, id) {
  if (!IDS.has(id)) throw new Error("Công cụ không tồn tại");
  const c = cfgOf(id);
  if (c.hidden && !isAdmin(user)) throw new Error("Công cụ này đang tắt");
  if (c.price <= 0 || isAdmin(user)) return stateFor(user);
  wallet.tx(() => {
    if (leftSec(user.id, id) > 0) return; // da mo roi (bam hai lan, hai tab...), khong tru lan nua
    const title = CATALOG.find((t) => t.id === id).title;
    const bal = wallet.balance(user.id);
    if (bal < c.price) throw new Error(`Số dư không đủ: cần ${fmt(c.price)} coin, ví đang có ${fmt(bal)}. Hãy nạp thêm ở tab Nạp tiền.`);
    wallet.credit(user.id, "spend", -c.price, "tool:" + id, `Công cụ: ${title} · ${c.minutes} phút`);
    uq.set.run(user.id, id, Date.now() + c.minutes * 60000);
  });
  return stateFor(user);
}

/* ---------- chan o may chu ---------- */

const deny = (res, status, error, extra) => res.status(status).json({ error, ...extra });

/** Chi chan khi cong cu bi an (dung cho cac thao tac doc / xoa, khong tao moi) */
const hiddenOnly = (id) => (req, res, next) => {
  if (!isAdmin(req.user) && cfgOf(id).hidden) return deny(res, 403, "Công cụ này đang tắt.");
  next();
};

/** Chan khi bi an hoac co gia ma chua mo khoa (hoac phien da het) */
const guard = (id) => (req, res, next) => {
  if (isAdmin(req.user)) return next();
  const c = cfgOf(id);
  if (c.hidden) return deny(res, 403, "Công cụ này đang tắt.");
  if (c.price > 0 && leftSec(req.user.id, id) <= 0) {
    return deny(res, 402, "Công cụ này tính coin. Hãy bấm Mở khoá trong công cụ trước.", { locked: true, tool: id, price: c.price });
  }
  next();
};

/* ---------- route ---------- */

function register(router, auth) {
  const fail = (res, e) => res.status(400).json({ error: e.message });
  setInterval(() => { try { uq.purge.run(Date.now() - 24 * 3600e3); } catch (_) {} }, 3600e3).unref();

  // Phai dat truoc cac route cua tempmail / tts / pagetext
  router.use("/tts", (req, res, next) => {
    if (req.method === "GET") return hiddenOnly("tts")(req, res, next); // danh sach giong
    if (String(req.body?.text || "").trim() === SAMPLE_TTS) return hiddenOnly("tts")(req, res, next); // nghe thu giong
    return guard("tts")(req, res, next);
  });
  router.use("/pagetext", guard("pagetext"));
  router.use("/tempmail", (req, res, next) => {
    const id = /^\/(long|domains)/.test(req.path) ? "maillong" : "mail";
    const creating = req.method === "POST" && (req.path === "/new" || req.path === "/long");
    return (creating ? guard(id) : hiddenOnly(id))(req, res, next);
  });

  router.get("/tools/config", (req, res) => res.json(stateFor(req.user)));

  router.post("/tools/unlock", (req, res) => {
    try { res.json(unlock(req.user, String(req.body?.tool || ""))); } catch (e) { fail(res, e); }
  });

  // Admin: xem va luu cau hinh. Gui { tools: { id: { hidden, price, minutes } } }, id nao khong gui thi giu nguyen.
  router.get("/admin/tools", auth.requireAdmin, (req, res) => {
    const all = readAll();
    res.json({ tools: CATALOG.map((t) => ({ id: t.id, title: t.title, server: !!t.server, ...all[t.id] })), defaultMinutes: DEFAULT_MINUTES, maxPrice: MAX_PRICE });
  });

  router.post("/admin/tools", auth.requireAdmin, (req, res) => {
    try {
      const inp = req.body?.tools;
      if (!inp || typeof inp !== "object") throw new Error("Thiếu dữ liệu");
      const cur = readAll();
      for (const [id, v] of Object.entries(inp)) {
        if (!IDS.has(id)) throw new Error("Công cụ không tồn tại: " + id);
        const price = Number(v?.price ?? cur[id].price);
        const minutes = Number(v?.minutes ?? cur[id].minutes);
        if (!Number.isInteger(price) || price < 0 || price > MAX_PRICE) throw new Error(`Giá "${id}" phải là số nguyên từ 0 đến ${fmt(MAX_PRICE)} coin`);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error(`Thời gian phiên "${id}" phải từ 1 đến 1440 phút`);
        cur[id] = { hidden: v?.hidden === undefined ? cur[id].hidden : !!v.hidden, price, minutes };
      }
      setSetting("tools_config", JSON.stringify(cur));
      const all = readAll();
      res.json({ tools: CATALOG.map((t) => ({ id: t.id, title: t.title, server: !!t.server, ...all[t.id] })) });
    } catch (e) { fail(res, e); }
  });
}

module.exports = { register, CATALOG, guard, hiddenOnly, stateFor, unlock, _test: { readAll, leftSec } };
