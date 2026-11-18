/**
 * DANG NHAP BANG GOOGLE (OAuth) + DOC GMAIL CHI-DOC
 *
 *  Thay cho "mat khau ung dung" (Google khong khuyen dung). Server chi xin quyen gmail.readonly: xem email, KHONG gui, xoa
 *  hay sua duoc gi. Moi lien lac di qua HTTPS toi googleapis.com (khong can mo cong IMAP).
 *
 *  Luong: admin nhap Client ID / Client Secret (tao 1 lan trong Google Cloud Console cua chinh admin) -> bam "Dang nhap bang
 *  Google" -> Google hoi quyen -> chuyen ve /api/admin/autopay/google/callback -> server doi code lay refresh token, ma hoa
 *  bang APP_SECRET va luu. Moi lan doc, server doi refresh token lay access token ngan han (1 gio).
 *
 *  Chong gia mao: tham so "state" ngau nhien, dung 1 lan, het han sau 10 phut, luu phia server.
 */

const crypto = require("crypto");
const { getSetting, setSetting } = require("./db");
const { encrypt, decrypt } = require("./crypto");

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const EP = {
  auth: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  revoke: "https://oauth2.googleapis.com/revoke",
  api: "https://gmail.googleapis.com/gmail/v1/users/me",
};
const TIMEOUT = 15000;

const K = {
  clientId: "autopay_g_client_id",
  secret: "autopay_g_secret_enc",
  refresh: "autopay_g_refresh_enc",
  email: "autopay_g_email",
  state: "autopay_g_state",
  since: "autopay_g_since",
};

const creds = () => ({
  clientId: getSetting(K.clientId) || "",
  secret: decrypt(getSetting(K.secret)) || "",
  refresh: decrypt(getSetting(K.refresh)) || "",
  email: getSetting(K.email) || "",
});

let cache = { token: "", exp: 0 };

class GoogleError extends Error {}

async function call(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, { ...opts, signal: AbortSignal.timeout(TIMEOUT) });
  } catch (e) {
    throw new GoogleError("Không kết nối được tới Google, thử lại sau");
  }
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  return { status: res.status, data, text };
}

const form = (o) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(o).toString(),
});

function tokenError(r, whileExchanging) {
  const e = r.data?.error;
  if (e === "invalid_client") return "Client ID hoặc Client Secret không đúng";
  if (e === "invalid_grant") {
    return whileExchanging
      ? "Mã đăng nhập đã hết hạn hoặc đã dùng rồi, hãy bấm Đăng nhập bằng Google lại"
      : "Google đã thu hồi quyền đọc Gmail (thường do app trong Google Cloud còn ở chế độ Testing nên quyền hết hạn sau 7 ngày). Hãy chuyển app sang In production rồi đăng nhập lại";
  }
  return `Google từ chối (${e || "HTTP " + r.status})`;
}

/* ---------- Dang nhap ---------- */

/** Tao link dang nhap Google. redirectUri phai trung KHOP tung ky tu voi o "Authorized redirect URIs" trong Google Cloud. */
function startAuth(redirectUri) {
  const c = creds();
  if (!c.clientId || !c.secret) throw new Error("Nhập Client ID và Client Secret trước");
  const state = crypto.randomBytes(24).toString("hex");
  setSetting(K.state, JSON.stringify({ s: state, exp: Date.now() + 10 * 60 * 1000, ru: redirectUri }));
  const q = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${EP.auth}?${q}`;
}

/** Google chuyen ve kem code + state. Tra ve { email } hoac nem loi (thong bao tieng Viet). */
async function finishAuth({ code, state, error }) {
  let saved = null;
  try { saved = JSON.parse(getSetting(K.state) || "null"); } catch (_) {}
  const same = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
  if (!saved || !state || !same(saved.s, state) || Date.now() > saved.exp) {
    throw new GoogleError("Phiên đăng nhập không hợp lệ hoặc đã hết hạn (10 phút). Hãy bấm Đăng nhập bằng Google lại từ trang quản trị");
  }
  setSetting(K.state, ""); // dung 1 lan (chi xoa khi khop, de ai do gui bua cung khong huy duoc phien dang nhap that)
  if (error) throw new GoogleError(error === "access_denied" ? "Bạn đã từ chối cấp quyền" : `Google báo lỗi: ${error}`);
  if (!code) throw new GoogleError("Thiếu mã đăng nhập từ Google");

  const c = creds();
  const r = await call(EP.token, form({
    code, client_id: c.clientId, client_secret: c.secret, redirect_uri: saved.ru, grant_type: "authorization_code",
  }));
  if (r.status !== 200 || !r.data?.access_token) throw new GoogleError(tokenError(r, true));
  if (!r.data.refresh_token) throw new GoogleError("Google không trả quyền truy cập lâu dài. Vào myaccount.google.com/permissions gỡ quyền của app này rồi đăng nhập lại");
  if (!String(r.data.scope || "").includes("gmail.readonly")) throw new GoogleError("Bạn chưa tích cho phép xem email. Hãy đăng nhập lại và tích đủ quyền");

  cache = { token: r.data.access_token, exp: Date.now() + (Number(r.data.expires_in) || 3600) * 1000 - 60000 };
  const p = await call(`${EP.api}/profile`, { headers: { Authorization: `Bearer ${cache.token}` } });
  if (p.status !== 200) throw new GoogleError("Đăng nhập được nhưng không đọc được hồ sơ Gmail. Kiểm tra đã bật Gmail API trong Google Cloud chưa");
  setSetting(K.refresh, encrypt(r.data.refresh_token));
  setSetting(K.email, String(p.data?.emailAddress || ""));
  setSetting(K.since, String(Date.now())); // chi doc email den tu luc nay
  return { email: p.data?.emailAddress || "" };
}

async function accessToken() {
  if (cache.token && Date.now() < cache.exp) return cache.token;
  const c = creds();
  if (!c.refresh) throw new GoogleError("Chưa đăng nhập Google");
  const r = await call(EP.token, form({ client_id: c.clientId, client_secret: c.secret, refresh_token: c.refresh, grant_type: "refresh_token" }));
  if (r.status !== 200 || !r.data?.access_token) throw new GoogleError(tokenError(r, false));
  cache = { token: r.data.access_token, exp: Date.now() + (Number(r.data.expires_in) || 3600) * 1000 - 60000 };
  return cache.token;
}

async function api(path, params) {
  const url = `${EP.api}${path}${params ? "?" + new URLSearchParams(params) : ""}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await call(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
    if (r.status === 401 && attempt === 0) { cache = { token: "", exp: 0 }; continue; }
    if (r.status === 403 || r.status === 404) {
      const why = r.data?.error?.message || "";
      if (/has not been used|disabled|accessNotConfigured/i.test(why)) throw new GoogleError("Chưa bật Gmail API trong Google Cloud (APIs & Services > Library > Gmail API > Enable)");
      throw new GoogleError(`Gmail từ chối truy cập${why ? ": " + why : ""}`);
    }
    if (r.status === 429) throw new GoogleError("Gmail giới hạn tốc độ, sẽ thử lại sau");
    if (r.status !== 200) throw new GoogleError(`Gmail trả lỗi HTTP ${r.status}`);
    return r.data;
  }
  throw new GoogleError("Gmail từ chối phiên đăng nhập");
}

/* ---------- Doc email ---------- */

/** Tim email. Tra ve { ids: [...], estimate } (moi nhat truoc) */
async function list(q, max = 25) {
  const d = await api("/messages", { q, maxResults: String(max) });
  return { ids: (d.messages || []).map((m) => m.id), estimate: d.resultSizeEstimate || 0 };
}

/** Email tho (RFC 822) + thoi diem Gmail nhan (ms) */
async function getRaw(id) {
  const d = await api(`/messages/${encodeURIComponent(id)}`, { format: "raw" });
  return { id, raw: Buffer.from(d.raw || "", "base64url"), internalDate: Number(d.internalDate) || 0 };
}

/* ---------- Ngat ket noi ---------- */

/** Thu hoi quyen tai Google (neu duoc) va xoa token. Giu lai Client ID / Secret. */
async function disconnect() {
  const c = creds();
  if (c.refresh) {
    try { await call(EP.revoke, form({ token: c.refresh })); } catch (_) {}
  }
  for (const k of [K.refresh, K.email, K.state, K.since]) setSetting(k, "");
  cache = { token: "", exp: 0 };
}

function saveClient(clientId, secret) {
  const old = creds();
  if (old.clientId && old.clientId !== clientId) { // token gan voi client cu, khong dung duoc nua
    for (const k of [K.refresh, K.email, K.state, K.since]) setSetting(k, "");
    cache = { token: "", exp: 0 };
  }
  setSetting(K.clientId, clientId);
  if (secret) setSetting(K.secret, encrypt(secret));
}

function wipeAll() {
  for (const k of Object.values(K)) setSetting(k, "");
  cache = { token: "", exp: 0 };
}

module.exports = {
  K, SCOPE, creds, startAuth, finishAuth, list, getRaw, disconnect, saveClient, wipeAll, GoogleError,
  _setEndpoints: (o) => Object.assign(EP, o), // chi dung khi kiem thu
  _dropCache: () => { cache = { token: "", exp: 0 }; },
};
