/**
 * TU DONG CONG COIN KHI NAP (server TU DOC lich su giao dich ngan hang qua API, theo bo code mau trong file rar)
 *
 *  Server goi API lich su giao dich (server/bankapi.js: MB Bank qua dichvudark, hoac Techcombank va ngan hang khac qua Casso), tim giao dich tien VAO co
 *  chua ma NAPxxxxxxx trong noi dung chuyen khoan va cong coin cho nguoi nap. Khong can Gmail, khong can mat khau ngan hang.
 *
 *  Bao mat:
 *   - Token va Code ma hoa bang APP_SECRET, khong bao gio tra ve trinh duyet / app.
 *   - Moi giao dich chi xu ly 1 lan: bang bank_events co UNIQUE(provider, ext_id), ghi su kien va cong coin trong CUNG mot giao
 *     dich co so du lieu. Lan doc dau tien sau khi luu cau hinh chi GHI NHO cac giao dich cu (bo qua), khong cong coin.
 *   - Chi nhan tien VAO. Giao dich khong khop ma nap duoc giu o trang thai "chua khop" de admin gan tay hoac bo qua.
 *   - Tien nhan >= lenh nap thi cong dung so tien thuc nhan (giong code mau: creditAmount >= so tien); nhan it hon van cong so da nhan.
 */

const { db, q, getSetting, setSetting } = require("./db");
const wallet = require("./wallet");
const bankapi = require("./bankapi");

db.exec(`
  CREATE TABLE IF NOT EXISTS bank_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    provider   TEXT NOT NULL,                 -- mbapi | casso
    ext_id     TEXT NOT NULL,                 -- ma giao dich phia dich vu, dung de chong cong trung
    amount     INTEGER NOT NULL,
    content    TEXT,
    account    TEXT,
    ref        TEXT,
    status     TEXT NOT NULL DEFAULT 'unmatched',   -- credited | unmatched | ignored
    user_id    INTEGER,
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (provider, ext_id)
  );
  CREATE INDEX IF NOT EXISTS bank_events_status ON bank_events(status, id);
`);

const bq = {
  insert: db.prepare(
    `INSERT INTO bank_events (provider, ext_id, amount, content, account, ref) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (provider, ext_id) DO NOTHING`
  ),
  byId: db.prepare("SELECT * FROM bank_events WHERE id = ?"),
  byExt: db.prepare("SELECT status FROM bank_events WHERE provider = ? AND ext_id = ?"),
  setStatus: db.prepare("UPDATE bank_events SET status = ?, user_id = ?, note = ? WHERE id = ?"),
  list: db.prepare(
    `SELECT e.id, e.provider, e.amount, e.content, e.status, e.note, e.created_at, u.username
       FROM bank_events e LEFT JOIN users u ON u.id = e.user_id
      ORDER BY (e.status = 'unmatched') DESC, e.id DESC LIMIT 40`
  ),
  today: db.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS s FROM bank_events
      WHERE status = 'credited' AND datetime(created_at, '+7 hours') >= date(datetime('now', '+7 hours'))`
  ),
  unmatched: db.prepare("SELECT COUNT(*) AS n FROM bank_events WHERE status = 'unmatched'"),
};

const pendingDeposits = db.prepare("SELECT COUNT(*) AS n FROM deposits WHERE status = 'pending'");

// Webhook SePay / Casso da bo: xoa ma bi mat cu con luu trong CSDL
if (getSetting("pay_webhook_secret_enc")) setSetting("pay_webhook_secret_enc", "");

// Dang nhap Google / doc Gmail da bo: xoa token cu con luu trong CSDL
for (const k of ["autopay_g_client_id", "autopay_g_secret_enc", "autopay_g_refresh_enc", "autopay_g_email", "autopay_g_state", "autopay_g_since", "autopay_mail_from", "autopay_mail_strict"]) {
  if (getSetting(k)) setSetting(k, "");
}

/* ---------- Bat/tat + cau hinh ---------- */

const enabled = () => getSetting("autopay_enabled") === "1";

function apiConfig() {
  const c = bankapi.creds();
  const o = { provider: c.provider, url: c.url, defaultUrl: c.defaultUrl, stk: c.stk, hasToken: !!c.token, hasCode: !!c.code };
  o.mail = { host: c.mail.host, port: c.mail.port, user: c.mail.user, from: c.mail.from, strict: c.mail.strict, hasPass: !!c.mail.pass };
  o.ready = bankapi.isReady(c);
  return o;
}

if (enabled() && !apiConfig().ready) setSetting("autopay_enabled", "0"); // dang bat theo cach cu (Gmail) ma chua nhap API

function readStatus() {
  try { return JSON.parse(getSetting("autopay_imap_status") || "null") || null; } catch (_) { return null; }
}

function setStatus(ok, msg, warn) {
  const prev = readStatus();
  const next = { at: new Date().toISOString(), ok, msg, warn: warn === undefined ? prev?.warn || null : warn };
  setSetting("autopay_imap_status", JSON.stringify(next));
  return next;
}

function saveApiConfig(b) {
  bankapi.save(b);
  lastPollAt = 0;
  setStatus(true, "Đã lưu cấu hình. Lần đọc đầu tiên chỉ ghi nhớ các giao dịch cũ, không cộng coin.", null);
}

function clearApiConfig() {
  bankapi.wipe();
  setSetting("autopay_imap_status", "");
  setSetting("autopay_enabled", "0");
}

/* ---------- Doc ma nap + xu ly giao dich ---------- */

/** Ma nap = NAP + 7 ky tu trong bang chu cai cua wallet.js (khong co I, O, 0, 1). Bo dau cach / ky tu la ngan hang chen vao. */
function findCodes(text) {
  const s = String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // (?=...) de bat ca cac ma chong len nhau, vi du nguoi dung go thua "NAP NAPK7M2XQ9"
  return [...new Set([...s.matchAll(/(?=(NAP[A-HJ-NP-Z2-9]{7}))/g)].map((m) => m[1]))];
}
const findCode = (text) => findCodes(text)[0] || null;

/**
 * Xu ly 1 khoan tien vao trong 1 giao dich CSDL. t = { provider, extId, amount, content, search?, account?, ref?, capToOrder? }
 *  content: dong hien thi cho admin; search: van ban dung de tim ma nap (mac dinh = content).
 * Tra ve { dup } | { skipped } | { id, status, note, userId, amount }
 */
function processOne(t) {
  if (!(t.amount > 0)) return { skipped: true }; // tien ra: khong ghi nhan
  const amount = Math.round(t.amount);
  return wallet.tx(() => {
    const ins = bq.insert.run(t.provider, t.extId, amount, String(t.content || "").slice(0, 300), String(t.account || "").slice(0, 40), String(t.ref || "").slice(0, 60));
    if (!ins.changes) return { dup: true };
    const id = Number(ins.lastInsertRowid);
    const set = (status, userId, note) => { bq.setStatus.run(status, userId || null, note || null, id); return { id, status, note, userId, amount }; };

    if (!enabled()) return set("unmatched", null, "Tự động cộng đang tắt, hãy gán thủ công");
    const codes = findCodes(t.search ?? t.content);
    if (!codes.length) return set("unmatched", null, "Không thấy mã nạp (NAPxxxxxxx) trong nội dung");
    const note = "Tự động · API ngân hàng";
    let r = null, code = codes[0];
    for (const c of codes) {           // thu lan luot, lay ma dau tien co lenh nap that
      const x = wallet.confirmByCode(c, amount, note, { maxOrder: !!t.capToOrder });
      if (!r) r = x;
      if (x.deposit || !x.error) { r = x; code = c; break; }
    }
    if (r.error) return set("unmatched", r.deposit?.user_id, r.error);
    const extra = r.wasCancelled ? " (lệnh đã huỷ trước đó nhưng tiền đã về)" : r.expected !== amount ? ` (lệnh ${r.expected})` : "";
    return set("credited", r.deposit.user_id, `Mã ${code}${extra}`);
  });
}

/* ---------- Doc lich su giao dich ---------- */

let polling = null;
let lastPollAt = 0;

/** Lan doc dau tien sau khi luu cau hinh: chi ghi nho giao dich cu (trang thai "bo qua"), khong cong coin */
function baseline(list) {
  let n = 0;
  wallet.tx(() => {
    for (const t of list) {
      if (!(t.amount > 0)) continue;
      const ins = bq.insert.run(bankapi.eventProvider(), t.extId, Math.round(t.amount), t.content.slice(0, 300), "", t.date.slice(0, 60));
      if (!ins.changes) continue;
      bq.setStatus.run("ignored", null, "Giao dịch cũ, có trước khi kết nối API", Number(ins.lastInsertRowid));
      n++;
    }
  });
  bankapi.markBaseline();
  return n;
}

async function pollInner() {
  const cfg = apiConfig();
  if (!cfg.ready) return setStatus(false, "Chưa nhập đủ thông tin kết nối API");
  try {
    const list = await bankapi.fetchHistory();
    if (!bankapi.hasBaseline()) {
      const n = baseline(list);
      return setStatus(true, `Đã kết nối API. Ghi nhớ ${n} giao dịch cũ, từ giờ server tự cộng coin cho tiền vào mới.`, null);
    }
    const n = { credited: 0, unmatched: 0, ignored: 0, dup: 0 };
    const mail = bankapi.eventProvider() === "email";
    for (const t of [...list].reverse()) { // cu truoc, moi sau
      if (!(t.amount > 0)) continue;
      // Nguon email: so tien doc tu chu trong thu, nen chi tu cong khi KHONG vuot lenh nap (vuot thi cho admin xem)
      const r = processOne({ provider: bankapi.eventProvider(), extId: t.extId, amount: t.amount, content: t.content, search: t.search, capToOrder: mail });
      if (r.dup) n.dup++; else if (r.status) n[r.status] = (n[r.status] || 0) + 1;
    }
    const rej = list.filter((t) => t.rejected);
    if (n.credited) console.log(`[autopay] da cong coin cho ${n.credited} giao dich`);
    const fresh = n.credited + n.unmatched + n.ignored;
    const warn = rej.length ? ` Có ${rej.length} thư bị loại: ${rej[0].rejected}` : "";
    return setStatus(true, (fresh > 0 ? `Có ${fresh} giao dịch mới: ${n.credited} đã cộng, ${n.unmatched} chưa khớp.` : "Không có giao dịch mới.") + warn, null);
  } catch (e) {
    return setStatus(false, e.message || "Lỗi không rõ");
  }
}

/** Doc lich su ngay. Chay trung nhau thi dung chung 1 lan. */
function pollApi() {
  if (polling) return polling;
  polling = pollInner().finally(() => { polling = null; lastPollAt = Date.now(); });
  return polling;
}

/** Chi de xem thu: lay giao dich gan nhat, KHONG cong coin, KHONG ghi gi vao CSDL */
async function testApi() {
  const cfg = apiConfig();
  if (!cfg.ready) throw new Error("Hãy nhập đủ thông tin kết nối API trước");
  const list = await bankapi.fetchHistory();
  const items = list.slice(0, 8).map((t) => ({
    date: t.date,
    amount: t.amount,
    debit: t.debit,
    content: t.content.slice(0, 200),
    codes: findCodes(t.search ?? t.content),
    note: t.rejected || t.skip || "",
    known: bq.byExt.get(bankapi.eventProvider(), t.extId)?.status || null,
  }));
  return { total: list.length, items };
}

/** Vong lap nen: co lenh nap dang cho thi doc moi 25 giay, khong co thi 5 phut mot lan */
function startLoop() {
  if (process.env.AUTOPAY_NO_POLL === "1") return;
  setInterval(() => {
    try {
      if (!apiConfig().ready || polling) return;
      const gap = pendingDeposits.get().n > 0 ? 25 * 1000 : 5 * 60 * 1000;
      if (Date.now() - lastPollAt < gap) return;
      pollApi().catch((e) => console.error("[autopay]", e.message));
    } catch (e) { console.error("[autopay]", e.message); }
  }, 10 * 1000).unref?.();
}
startLoop();

/* ---------- Admin ---------- */

function register(router, auth2) {
  const fail = (res, e) => res.status(400).json({ error: e.message });
  const state = () => {
    const t = bq.today.get();
    const c = apiConfig();
    return {
      enabled: enabled(),
      bankReady: !!(getSetting("bank_id") && getSetting("bank_account")),
      api: { provider: c.provider, url: c.url, defaultUrl: c.defaultUrl, stk: c.stk, hasToken: c.hasToken, hasCode: c.hasCode, mail: c.mail, ready: c.ready, status: readStatus() },
      today: { n: t.n, sum: t.s },
      unmatched: bq.unmatched.get().n,
      events: bq.list.all(),
    };
  };

  router.get("/admin/autopay", auth2.requireAdmin, (req, res) => res.json(state()));

  router.post("/admin/autopay", auth2.requireAdmin, (req, res) => {
    if (req.body?.enabled && !apiConfig().ready) return res.status(400).json({ error: "Hãy nhập đủ thông tin kết nối API trước khi bật" });
    setSetting("autopay_enabled", req.body?.enabled ? "1" : "0");
    res.json(state());
  });

  // Luu Token / Code / so tai khoan / dia chi API (Token, Code de trong = giu nguyen)
  router.post("/admin/autopay/api", auth2.requireAdmin, (req, res) => {
    try { saveApiConfig(req.body); } catch (e) { return fail(res, e); }
    res.json(state());
  });

  router.post("/admin/autopay/poll", auth2.requireAdmin, async (req, res) => {
    await pollApi();
    res.json(state());
  });

  router.post("/admin/autopay/test", auth2.requireAdmin, async (req, res) => {
    try { res.json(await testApi()); } catch (e) { fail(res, e); }
  });

  router.post("/admin/autopay/clear", auth2.requireAdmin, (req, res) => {
    clearApiConfig();
    res.json(state());
  });

  // Gan mot khoan tien chua khop (chuyen sai noi dung) cho tai khoan nguoi dung
  router.post("/admin/autopay/events/:id/assign", auth2.requireAdmin, (req, res) => {
    try {
      const u = q.userByName.get(String(req.body?.username || "").trim().toLowerCase());
      if (!u) throw new Error("Không tìm thấy tài khoản này");
      const r = wallet.tx(() => {
        const ev = bq.byId.get(Number(req.params.id));
        if (!ev) throw new Error("Không tìm thấy giao dịch");
        if (ev.status !== "unmatched") throw new Error("Giao dịch này đã được xử lý rồi");
        const out = wallet.assignManual(u.id, ev.amount, `Gán thủ công giao dịch ngân hàng #${ev.id}`);
        bq.setStatus.run("credited", u.id, `Gán thủ công cho ${u.username} (${out.code})`, ev.id);
        return { amount: ev.amount, balance: out.balance };
      });
      res.json({ ok: true, ...r });
    } catch (e) { fail(res, e); }
  });

  router.post("/admin/autopay/events/:id/ignore", auth2.requireAdmin, (req, res) => {
    const ev = bq.byId.get(Number(req.params.id));
    if (ev && ev.status === "unmatched") bq.setStatus.run("ignored", null, "Admin bỏ qua", ev.id);
    res.json({ ok: true });
  });
}

module.exports = { register, findCode, findCodes, processOne, pollApi, testApi, apiConfig, saveApiConfig };
