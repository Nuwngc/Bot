/**
 * DOC LICH SU GIAO DICH NGAN HANG QUA API (theo bo code mau api_check.php trong file rar)
 *
 *  Hai dich vu:
 *   - dichvudark (MB Bank, code mau trong file rar): POST https://api.dichvudark.vn/api/ApiMbBank, Loai_api = lsgdv2, kem Token, Code, Stk.
 *   - casso (Techcombank va nhieu ngan hang khac): GET https://oauth.casso.vn/v2/transactions, header Authorization: Apikey <key>.
 *     Techcombank khong co API cong khai cho tai khoan ca nhan, phai lien ket tai khoan vao Casso roi doc qua API cua Casso.
 *  Moi giao dich tien VAO co noi dung chua ma NAPxxxxxxx se duoc khop voi lenh nap dang cho (xem autopay.js).
 *
 *  Token va Code ma hoa bang APP_SECRET khi luu CSDL, KHONG BAO GIO tra ve trinh duyet / app.
 *  Luu y so voi code mau: khong tat kiem tra chung chi SSL, va xet TUNG giao dich (code mau chi xet giao dich dau tien).
 */

const crypto = require("crypto");
const { getSetting, setSetting } = require("./db");
const { encrypt, decrypt } = require("./crypto");

const URLS = {
  dichvudark: "https://api.dichvudark.vn/api/ApiMbBank", // MB Bank (code mau trong file rar)
  casso: "https://oauth.casso.vn/v2/transactions",        // Casso: Techcombank va nhieu ngan hang khac
};
const PROVIDERS = Object.keys(URLS);
const TIMEOUT = 30000;

const K = {
  provider: "autopay_api_provider",
  url: "autopay_api_url",
  token: "autopay_api_token_enc",
  code: "autopay_api_code_enc",
  stk: "autopay_api_stk",
  baseline: "autopay_api_baseline",
};

class BankApiError extends Error {}

const providerOf = () => (PROVIDERS.includes(getSetting(K.provider)) ? getSetting(K.provider) : "dichvudark");

const creds = () => {
  const provider = providerOf();
  return {
    provider,
    url: getSetting(K.url) || URLS[provider],
    defaultUrl: URLS[provider],
    token: decrypt(getSetting(K.token)) || "", // dichvudark: Token. casso: API Key
    code: decrypt(getSetting(K.code)) || "",   // chi dichvudark
    stk: getSetting(K.stk) || "",
  };
};

/** Ten dung trong bang bank_events de tach giao dich cua tung dich vu */
const eventProvider = () => (providerOf() === "casso" ? "casso" : "mbapi");

/** Du thong tin de goi API chua */
function isReady(c) {
  c = c || creds();
  return c.provider === "casso" ? !!c.token : !!(c.token && c.code && c.stk);
}

/** Luu cau hinh. Token / Code de trong = giu nguyen gia tri cu. Doi dich vu, so tai khoan hay khoa thi phai lay moc lai. */
function save(b) {
  b = b || {};
  const cur = creds();
  const provider = PROVIDERS.includes(b.provider) ? b.provider : cur.provider;
  const typedUrl = String(b.url || "").trim();
  const url = typedUrl === URLS[provider] ? "" : typedUrl; // de trong = dung dia chi mac dinh cua dich vu
  const token = String(b.token || "").trim();
  const code = String(b.code || "").trim();
  const stk = String(b.stk || "").trim();
  if (url && (!/^https:\/\/[^\s/]+(\/\S*)?$/.test(url) || url.length > 300)) throw new Error("Địa chỉ API phải bắt đầu bằng https://");
  if (token && !/^[\x21-\x7e]{8,3000}$/.test(token)) throw new Error(provider === "casso" ? "API Key không hợp lệ" : "Token không hợp lệ");
  if (code && !/^[\x21-\x7e]{8,3000}$/.test(code)) throw new Error("Code không hợp lệ");
  if (provider === "dichvudark" && !/^[0-9A-Za-z]{4,30}$/.test(stk)) throw new Error("Số tài khoản không hợp lệ");
  if (provider === "casso" && stk && !/^[0-9A-Za-z]{4,30}$/.test(stk)) throw new Error("Số tài khoản không hợp lệ");
  const switched = provider !== cur.provider;
  const hasTok = !!token || (!switched && !!cur.token);
  const hasCode = !!code || (!switched && !!cur.code);
  if (!hasTok) throw new Error(provider === "casso" ? "Nhập API Key của Casso" : "Nhập Token");
  if (provider === "dichvudark" && !hasCode) throw new Error("Nhập Code");
  const changed = switched || (url || URLS[provider]) !== cur.url || stk !== cur.stk || !!token || !!code;
  if (switched) { setSetting(K.token, ""); setSetting(K.code, ""); } // khoa cua dich vu cu khong dung cho dich vu moi
  setSetting(K.provider, provider);
  setSetting(K.url, url);
  setSetting(K.stk, stk);
  if (token) setSetting(K.token, encrypt(token));
  if (code) setSetting(K.code, encrypt(code));
  if (changed) setSetting(K.baseline, ""); // lan doc tiep theo chi ghi nho giao dich cu, khong cong coin
}

function wipe() {
  for (const k of Object.values(K)) setSetting(k, "");
}

const hasBaseline = () => getSetting(K.baseline) === "1";
const markBaseline = () => setSetting(K.baseline, "1");

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Doi 1 dong lich su thanh { extId, amount (tien VAO), content, date } */
function normalize(t) {
  const credit = num(t.creditAmount ?? t.credit ?? t.amount_in);
  const content = String(t.description ?? t.content ?? t.addDescription ?? "").trim();
  const date = String(t.postingDate ?? t.transactionDate ?? t.transactionTime ?? t.date ?? "");
  const ref = String(t.refNo ?? t.transactionRef ?? t.transactionId ?? t.id ?? "").trim();
  // Khong co ma giao dich rieng thi lay dau van tay tu cac truong cua dong do
  const extId = ref || "h:" + crypto.createHash("sha1")
    .update([date, t.transactionDate, credit, num(t.debitAmount), content, t.accountNo || ""].join("|")).digest("hex").slice(0, 24);
  return { extId: `${ref ? "ref:" : ""}${extId}`.slice(0, 80), amount: credit, content, date, debit: num(t.debitAmount) };
}

const vnDay = (backDays) => new Date(Date.now() + 7 * 3600e3 - backDays * 86400e3).toISOString().slice(0, 10);

async function httpJson(url, opts) {
  let res;
  try {
    res = await fetch(url, { ...opts, signal: AbortSignal.timeout(TIMEOUT) });
  } catch (e) {
    throw new BankApiError("Không kết nối được tới API ngân hàng, thử lại sau");
  }
  const text = await res.text();
  let kq = null;
  try { kq = JSON.parse(text); } catch (_) {}
  if (!kq || typeof kq !== "object") throw new BankApiError(`API trả về dữ liệu lạ (HTTP ${res.status})`);
  return { status: res.status, kq };
}

/** Dich vu dichvudark (MB Bank): POST form-data Loai_api=lsgdv2, header Code / Token / Stk */
async function fetchDichvudark(c) {
  const fd = new FormData(); // code mau dung curl voi mang => multipart/form-data
  fd.append("Loai_api", "lsgdv2");
  const { status, kq } = await httpJson(c.url, { method: "POST", headers: { Code: c.code, Token: c.token, Stk: c.stk }, body: fd });
  const list = Array.isArray(kq.transactionHistoryList) ? kq.transactionHistoryList
    : Array.isArray(kq.data?.transactionHistoryList) ? kq.data.transactionHistoryList : null;
  if (!list) {
    const why = String(kq.message || kq.msg || kq.error || kq.status || "").slice(0, 160);
    throw new BankApiError(`API không trả về lịch sử giao dịch${why ? `: ${why}` : ` (HTTP ${status})`}. Kiểm tra Token, Code và số tài khoản`);
  }
  return list.map(normalize);
}

/** Casso (ho tro Techcombank): GET /v2/transactions, header Authorization: Apikey <key>. amount > 0 la tien vao, < 0 la tien ra. */
async function fetchCasso(c) {
  const u = new URL(c.url);
  u.searchParams.set("fromDate", vnDay(3));
  u.searchParams.set("page", "1");
  u.searchParams.set("pageSize", "50");
  u.searchParams.set("sort", "DESC"); // moi nhat truoc
  const { status, kq } = await httpJson(u.toString(), { method: "GET", headers: { Authorization: `Apikey ${c.token}` } });
  const records = Array.isArray(kq.data?.records) ? kq.data.records : null;
  if (!records || (kq.error && kq.error !== 0)) {
    const why = String(kq.message || kq.error || "").slice(0, 160);
    throw new BankApiError(`Casso không trả về giao dịch${why ? `: ${why}` : ` (HTTP ${status})`}. Kiểm tra API Key và tài khoản đã liên kết trên Casso`);
  }
  return records
    .filter((r) => !c.stk || !(r.bank_sub_acc_id || r.bankSubAccId) || String(r.bank_sub_acc_id || r.bankSubAccId) === c.stk)
    .map((r) => {
      const amt = num(r.amount);
      const ref = String(r.tid || "").trim();
      return {
        extId: (ref ? `tid:${ref}` : `id:${r.id}`).slice(0, 80),
        amount: amt > 0 ? amt : 0,
        debit: amt < 0 ? -amt : 0,
        content: String(r.description || "").trim(),
        date: String(r.when || ""),
      };
    });
}

/** Goi API, tra ve mang giao dich da chuan hoa (moi nhat truoc, theo thu tu API tra ve) */
async function fetchHistory() {
  const c = creds();
  if (!isReady(c)) throw new BankApiError(c.provider === "casso" ? "Chưa nhập API Key Casso" : "Chưa nhập đủ Token, Code và số tài khoản");
  return c.provider === "casso" ? fetchCasso(c) : fetchDichvudark(c);
}

module.exports = { creds, save, wipe, fetchHistory, hasBaseline, markBaseline, isReady, eventProvider, BankApiError, URLS };
