/**
 * DANG NHAP ZALO BANG MA QR (nhu dang nhap Zalo tren may tinh).
 *
 *   Web tao ma QR -> nguoi dung quet bang Zalo tren dien thoai -> bam "Dong y" tren dien thoai
 *   -> web tu lay COOKIE + IMEI cua phien dang nhap do va luu cho bot (giong luc nhap tay).
 *
 * Dung thu vien cong dong `zca-js` (nap luc can bang import() de khong lam hong server neu chua cai).
 * Moi bot co toi da 1 phien; phien tu huy sau SESSION_TTL_MS. Cookie/IMEI KHONG bao gio gui ve trinh duyet.
 */

const SESSION_TTL_MS = 4 * 60 * 1000;
const KEEP_RESULT_MS = 60 * 1000;
const MAX_SESSIONS = 6;
const MAX_PER_USER = 2;
const MAX_QR_RETRIES = 2;

const sessions = new Map(); // botId -> session

let libPromise = null;
function loadLib() {
  if (!libPromise) {
    libPromise = import("zca-js")
      .then((m) => {
        if (typeof m.Zalo !== "function") throw new Error("bad lib");
        return m;
      })
      .catch(() => {
        libPromise = null;
        throw new Error("Máy chủ chưa cài thư viện đăng nhập QR (zca-js). Chạy npm install rồi khởi động lại.");
      });
  }
  return libPromise;
}

async function isAvailable() {
  try {
    await loadLib();
    return true;
  } catch (_) {
    return false;
  }
}

/** Chuan hoa moi dang cookie ve { ten: gia_tri } (chi giu cookie cua zalo.me neu co khai bao domain) */
function normalizeCookies(input) {
  const out = {};
  const add = (name, value, domain) => {
    if (!name || value == null) return;
    if (domain && !/zalo|zdn/i.test(String(domain))) return;
    out[String(name)] = String(value);
  };
  const walk = (x) => {
    if (!x) return;
    if (typeof x === "string") {
      for (const pair of x.split(";")) {
        const i = pair.indexOf("=");
        if (i > 0) add(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
    } else if (Array.isArray(x)) {
      x.forEach((c) => (c && typeof c === "object" ? add(c.key || c.name, c.value, c.domain) : walk(c)));
    } else if (typeof x.serializeSync === "function") {
      walk(x.serializeSync().cookies);
    } else if (Array.isArray(x.cookies)) {
      walk(x.cookies);
    }
  };
  walk(input);
  return out;
}

const toDataUrl = (img) => (!img ? null : String(img).startsWith("data:") ? String(img) : `data:image/png;base64,${img}`);

function mapError(e) {
  const m = String((e && e.message) || e || "");
  if (/ENOTFOUND|ECONN|ETIMEDOUT|fetch failed|network/i.test(m)) return "Máy chủ không kết nối được tới Zalo. Thử lại sau.";
  return "Đăng nhập QR không thành công. Hãy thử lại.";
}

function view(s) {
  if (!s) return { state: "none" };
  return {
    state: s.state,
    image: s.state === "qr" ? s.image : null,
    name: s.name || null,
    avatar: s.avatar || null,
    error: s.error || null,
    result: s.result || null,
    retries: s.retries,
  };
}

function finish(s, state, extra = {}) {
  if (s.closed) return;
  s.closed = true;
  s.state = state;
  Object.assign(s, extra);
  s.image = null;
  clearTimeout(s.timer);
  if (state !== "done") {
    try { s.abort && s.abort(); } catch (_) {}
  }
  const t = setTimeout(() => {
    if (sessions.get(s.botId) === s) sessions.delete(s.botId);
  }, KEEP_RESULT_MS);
  t.unref && t.unref();
}

async function save(s, data, onCreds) {
  if (s.closed || s.saving) return;
  s.saving = true;
  s.state = "saving";
  try {
    const cookies = normalizeCookies(data && (data.cookie ?? data.cookies));
    const imei = String((data && data.imei) || "");
    if (imei.length < 8 || !Object.keys(cookies).length) throw new Error("Không lấy được cookie hoặc IMEI từ Zalo.");
    const result = await onCreds({ imei, cookies });
    finish(s, "done", { result });
  } catch (e) {
    finish(s, "error", { error: e.message || "Không lưu được đăng nhập." });
  }
}

async function run(s, lib, onCreds) {
  const T = lib.LoginQRCallbackEventType || {};
  const is = (e, name, n) => e && e.type === (T[name] !== undefined ? T[name] : n);
  const zalo = new lib.Zalo({ selfListen: false, checkUpdate: false, logging: false });
  let got = false;

  const handle = async (e) => {
    if (s.closed) return;
    try {
      if (is(e, "QRCodeGenerated", 0)) {
        s.state = "qr";
        s.image = toDataUrl(e.data && e.data.image);
        s.abort = e.actions && e.actions.abort;
      } else if (is(e, "QRCodeScanned", 2)) {
        s.state = "scanned";
        s.name = e.data && e.data.display_name;
        s.avatar = e.data && e.data.avatar;
      } else if (is(e, "QRCodeExpired", 1)) {
        if (s.retries < MAX_QR_RETRIES && e.actions && e.actions.retry) {
          s.retries += 1;
          s.state = "starting";
          s.image = null;
          e.actions.retry();
        } else {
          finish(s, "expired", { error: "Mã QR đã hết hạn. Bấm tạo mã mới." });
          e.actions && e.actions.abort && e.actions.abort();
        }
      } else if (is(e, "QRCodeDeclined", 3)) {
        finish(s, "declined", { error: "Bạn đã từ chối đăng nhập trên điện thoại." });
      } else if (is(e, "GotLoginInfo", 4)) {
        got = true;
        await save(s, e.data, onCreds);
      }
    } catch (err) {
      finish(s, "error", { error: mapError(err) });
    }
  };

  let api;
  try {
    api = await zalo.loginQR({}, handle);
  } catch (err) {
    if (!s.closed) finish(s, "error", { error: mapError(err) });
    return;
  }
  // Ban thu vien khong phat su kien GotLoginInfo: lay tu ngu canh dang nhap
  if (!got && !s.closed) {
    const ctx = api && typeof api.getContext === "function" ? api.getContext() : null;
    await save(s, { cookie: ctx && ctx.cookie, imei: ctx && ctx.imei }, onCreds);
  }
}

/** Bat dau (hoac lam lai) phien QR cho mot bot. onCreds({ imei, cookies }) luu dang nhap, tra ve ket qua hien cho nguoi dung. */
async function start({ botId, userId, onCreds }) {
  const old = sessions.get(botId);
  if (old) cancel(botId);
  const live = [...sessions.values()].filter((x) => !x.closed);
  if (live.length >= MAX_SESSIONS) throw new Error("Đang có nhiều người đăng nhập QR cùng lúc, thử lại sau ít phút.");
  if (live.filter((x) => x.userId === userId).length >= MAX_PER_USER) throw new Error("Bạn đang mở quá nhiều phiên đăng nhập QR. Huỷ bớt rồi thử lại.");

  const lib = await loadLib();
  const s = { botId, userId, state: "starting", image: null, retries: 0, closed: false, saving: false, abort: null };
  s.timer = setTimeout(() => finish(s, "expired", { error: "Hết thời gian chờ quét mã. Bấm tạo mã mới." }), SESSION_TTL_MS);
  s.timer.unref && s.timer.unref();
  sessions.set(botId, s);
  run(s, lib, onCreds).catch((e) => finish(s, "error", { error: mapError(e) }));
  return view(s);
}

function get(botId, userId) {
  const s = sessions.get(botId);
  return s && s.userId === userId ? view(s) : { state: "none" };
}

function cancel(botId) {
  const s = sessions.get(botId);
  if (!s) return;
  if (!s.closed) finish(s, "cancelled");
  sessions.delete(botId);
}

module.exports = { start, get, cancel, isAvailable, normalizeCookies };
