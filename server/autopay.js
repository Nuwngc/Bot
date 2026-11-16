/**
 * TU DONG CONG COIN KHI NAP (webhook bao bien dong so du ngan hang)
 *
 *  Dich vu trung gian (SePay hoac Casso) theo doi tai khoan ngan hang cua admin. Co tien vao, ho goi
 *  POST /api/webhooks/bank. Server doc ma NAPxxxxxxx trong noi dung chuyen khoan, tim lenh nap tuong ung
 *  va cong coin NGAY (so coin = so tien thuc nhan).
 *
 *  Bao mat:
 *   - Ma bi mat sinh ngau nhien, admin dan vao SePay (kieu chung thuc API Key) hoac Casso (Security Key).
 *     Server chap nhan "Authorization: Apikey <ma>" / "Bearer <ma>", header "secure-token", hoac ?key=<ma>.
 *   - So sanh hang so thoi gian, sai nhieu lan tu mot IP thi tam khoa (dung chung bo dem cua dang nhap).
 *   - Moi giao dich chi cong 1 lan: bang bank_events co UNIQUE(provider, ext_id), ghi su kien va cong coin
 *     trong CUNG mot giao dich co so du lieu, nen dich vu gui lai webhook bao nhieu lan cung khong cong trung.
 *   - Chi nhan tien VAO. Giao dich khong khop ma nap duoc giu o trang thai "chua khop" de admin gan tay hoac bo qua.
 */

const crypto = require("crypto");
const { db, q, getSetting, setSetting } = require("./db");
const { encrypt, decrypt } = require("./crypto");
const wallet = require("./wallet");
const auth = require("./auth");

db.exec(`
  CREATE TABLE IF NOT EXISTS bank_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    provider   TEXT NOT NULL,                 -- sepay | casso
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

/* ---------- Ma bi mat + bat/tat ---------- */

const enabled = () => getSetting("autopay_enabled") === "1";

function getSecret() {
  const enc = getSetting("pay_webhook_secret_enc");
  const cur = enc ? decrypt(enc) : "";
  if (cur) return cur;
  const fresh = crypto.randomBytes(24).toString("hex");
  setSetting("pay_webhook_secret_enc", encrypt(fresh));
  return fresh;
}

const digest = (s) => crypto.createHash("sha256").update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

function givenSecret(req) {
  const h = String(req.get("authorization") || "");
  const m = h.match(/^(?:Apikey|Bearer)\s+(.+)$/i);
  return (m && m[1].trim()) || String(req.get("secure-token") || "").trim() || String(req.query?.key || "").trim();
}

/* ---------- Doc noi dung webhook ---------- */

/** Ma nap = NAP + 7 ky tu trong bang chu cai cua wallet.js (khong co I, O, 0, 1). Bo dau cach / ky tu la ngan hang chen vao. */
function findCode(text) {
  const s = String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = s.match(/NAP[A-HJ-NP-Z2-9]{7}/);
  return m ? m[0] : null;
}

/** Chuan hoa ve [{ provider, extId, amount, content, account, ref }] (chi giao dich tien vao) */
function parseTransactions(body) {
  const b = body && typeof body === "object" ? body : {};
  const out = [];

  // Casso: { error: 0, data: [ { id, tid, description, amount, ... } ] }
  const rows = Array.isArray(b.data) ? b.data : b.data && typeof b.data === "object" ? [b.data] : null;
  if (rows) {
    for (const r of rows) {
      const amount = Number(r?.amount);
      if (!r || !Number.isFinite(amount)) continue;
      const extId = String(r.id ?? r.tid ?? "");
      if (!extId) continue;
      out.push({ provider: "casso", extId, amount, content: String(r.description || ""), account: String(r.bank_sub_acc_id || r.subAccId || r.bankSubAccId || ""), ref: String(r.tid || "") });
    }
    return out;
  }

  // SePay: { id, gateway, accountNumber, code, content, transferType, transferAmount, referenceCode, ... }
  if (b.transferAmount !== undefined) {
    let amount = Number(b.transferAmount);
    if (String(b.transferType || "").toLowerCase() !== "in") amount = -Math.abs(amount); // tien ra
    const extId = String(b.id ?? `${b.referenceCode || ""}:${b.transferAmount}:${b.transactionDate || ""}`);
    out.push({ provider: "sepay", extId, amount, content: `${b.content || ""} ${b.code || ""}`.trim(), account: String(b.accountNumber || ""), ref: String(b.referenceCode || "") });
  }
  return out;
}

/** Xu ly 1 giao dich trong 1 giao dich CSDL. Tra ve { dup } hoac { status, note, userId, amount } */
function processOne(t) {
  if (!(t.amount > 0)) return { skipped: true }; // tien ra: khong ghi nhan
  const amount = Math.round(t.amount);
  return wallet.tx(() => {
    const ins = bq.insert.run(t.provider, t.extId, amount, String(t.content).slice(0, 300), t.account.slice(0, 40), t.ref.slice(0, 60));
    if (!ins.changes) return { dup: true };
    const id = Number(ins.lastInsertRowid);
    const set = (status, userId, note) => { bq.setStatus.run(status, userId || null, note || null, id); return { id, status, note, userId, amount }; };

    if (!enabled()) return set("unmatched", null, "Tự động cộng đang tắt, hãy gán thủ công");
    const code = findCode(t.content);
    if (!code) return set("unmatched", null, "Không thấy mã nạp (NAPxxxxxxx) trong nội dung");
    const r = wallet.confirmByCode(code, amount, `Tự động · ${t.provider} #${t.extId}`);
    if (r.error) return set("unmatched", r.deposit?.user_id, r.error);
    const extra = r.wasCancelled ? " (lệnh đã huỷ trước đó nhưng tiền đã về)" : r.expected !== amount ? ` (lệnh ${r.expected})` : "";
    return set("credited", r.deposit.user_id, `Mã ${code}${extra}`);
  });
}

/** Gan cho handler Express. Gan truoc router /api trong app.js (khong can dang nhap). */
function webhook(req, res) {
  const key = "hook:" + (req.ip || "?");
  if (auth.throttled(key)) return res.status(429).json({ success: false, message: "Too many attempts" });

  const given = givenSecret(req);
  if (!given || !safeEqual(given, getSecret())) {
    auth.noteFail(key);
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  auth.noteOk(key);

  const txs = parseTransactions(req.body);
  if (!txs.length) return res.status(400).json({ success: false, message: "Invalid data" });

  const results = [];
  for (const t of txs) {
    try { results.push(processOne(t)); }
    catch (e) {
      console.error("[autopay] loi xu ly giao dich:", e.message);
      return res.status(500).json({ success: false, message: "Server error" }); // de dich vu gui lai
    }
  }
  const credited = results.filter((r) => r.status === "credited");
  if (credited.length) console.log(`[autopay] da cong ${credited.map((r) => r.amount).join(", ")} coin`);
  res.json({ success: true, error: 0, credited: credited.length });
}

/* ---------- Admin ---------- */

function register(router, auth2) {
  const fail = (res, e) => res.status(400).json({ error: e.message });
  const state = (req) => {
    const t = bq.today.get();
    return {
      enabled: enabled(),
      url: `${req.protocol}://${req.get("host")}/api/webhooks/bank`,
      secret: getSecret(),
      bankReady: !!(getSetting("bank_id") && getSetting("bank_account")),
      today: { n: t.n, sum: t.s },
      unmatched: bq.unmatched.get().n,
      events: bq.list.all(),
    };
  };

  router.get("/admin/autopay", auth2.requireAdmin, (req, res) => res.json(state(req)));

  router.post("/admin/autopay", auth2.requireAdmin, (req, res) => {
    setSetting("autopay_enabled", req.body?.enabled ? "1" : "0");
    res.json(state(req));
  });

  router.post("/admin/autopay/secret", auth2.requireAdmin, (req, res) => {
    setSetting("pay_webhook_secret_enc", encrypt(crypto.randomBytes(24).toString("hex")));
    res.json(state(req));
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

module.exports = { webhook, register, findCode, parseTransactions, processOne };
