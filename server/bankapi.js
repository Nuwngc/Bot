/**
 * DOC LICH SU GIAO DICH NGAN HANG QUA API (theo bo code mau api_check.php trong file rar)
 *
 *  Server goi API lich su giao dich (mac dinh dich vu MB Bank https://api.dichvudark.vn/api/ApiMbBank, Loai_api = lsgdv2)
 *  kem 3 gia tri: Token, Code (khoa API) va Stk (so tai khoan nhan tien). Moi giao dich tien VAO co noi dung chua ma NAPxxxxxxx
 *  se duoc khop voi lenh nap dang cho (xem autopay.js).
 *
 *  Token va Code ma hoa bang APP_SECRET khi luu CSDL, KHONG BAO GIO tra ve trinh duyet / app.
 *  Luu y so voi code mau: khong tat kiem tra chung chi SSL, va xet TUNG giao dich (code mau chi xet giao dich dau tien).
 */

const crypto = require("crypto");
const { getSetting, setSetting } = require("./db");
const { encrypt, decrypt } = require("./crypto");

const DEFAULT_URL = "https://api.dichvudark.vn/api/ApiMbBank";
const TIMEOUT = 30000;

const K = {
  url: "autopay_api_url",
  token: "autopay_api_token_enc",
  code: "autopay_api_code_enc",
  stk: "autopay_api_stk",
  baseline: "autopay_api_baseline",
};

class BankApiError extends Error {}

const creds = () => ({
  url: getSetting(K.url) || DEFAULT_URL,
  token: decrypt(getSetting(K.token)) || "",
  code: decrypt(getSetting(K.code)) || "",
  stk: getSetting(K.stk) || "",
});

/** Luu cau hinh. Token / Code de trong = giu nguyen gia tri cu. Doi so tai khoan hoac dich vu thi phai lay moc lai. */
function save(b) {
  b = b || {};
  const cur = creds();
  const url = String(b.url || "").trim() || DEFAULT_URL;
  const token = String(b.token || "").trim();
  const code = String(b.code || "").trim();
  const stk = String(b.stk || "").trim();
  if (!/^https:\/\/[^\s/]+(\/\S*)?$/.test(url) || url.length > 300) throw new Error("Địa chỉ API phải bắt đầu bằng https://");
  if (token && !/^[\x21-\x7e]{8,300}$/.test(token)) throw new Error("Token không hợp lệ");
  if (code && !/^[\x21-\x7e]{8,3000}$/.test(code)) throw new Error("Code không hợp lệ");
  if (!/^[0-9A-Za-z]{4,30}$/.test(stk)) throw new Error("Số tài khoản không hợp lệ");
  if (!token && !cur.token) throw new Error("Nhập Token");
  if (!code && !cur.code) throw new Error("Nhập Code");
  const changed = url !== cur.url || stk !== cur.stk || !!token || !!code;
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

/** Goi API, tra ve mang giao dich da chuan hoa (moi nhat truoc, theo thu tu API tra ve) */
async function fetchHistory() {
  const c = creds();
  if (!c.token || !c.code || !c.stk) throw new BankApiError("Chưa nhập đủ Token, Code và số tài khoản");
  const fd = new FormData(); // code mau dung curl voi mang => multipart/form-data
  fd.append("Loai_api", "lsgdv2");
  let res;
  try {
    res = await fetch(c.url, {
      method: "POST",
      headers: { Code: c.code, Token: c.token, Stk: c.stk },
      body: fd,
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch (e) {
    throw new BankApiError("Không kết nối được tới API ngân hàng, thử lại sau");
  }
  const text = await res.text();
  let kq = null;
  try { kq = JSON.parse(text); } catch (_) {}
  if (!kq || typeof kq !== "object") throw new BankApiError(`API trả về dữ liệu lạ (HTTP ${res.status})`);
  const list = Array.isArray(kq.transactionHistoryList) ? kq.transactionHistoryList
    : Array.isArray(kq.data?.transactionHistoryList) ? kq.data.transactionHistoryList : null;
  if (!list) {
    const why = String(kq.message || kq.msg || kq.error || kq.status || "").slice(0, 160);
    throw new BankApiError(`API không trả về lịch sử giao dịch${why ? `: ${why}` : ` (HTTP ${res.status})`}. Kiểm tra Token, Code và số tài khoản`);
  }
  return list.map(normalize);
}

module.exports = { creds, save, wipe, fetchHistory, hasBaseline, markBaseline, BankApiError, DEFAULT_URL };
