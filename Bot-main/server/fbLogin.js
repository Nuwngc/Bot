/**
 * Dang nhap Facebook bang email/mat khau (THU NGHIEM).
 *
 * Dung duong dang nhap web truc tiep toi facebook.com cua thu vien.
 * Config da khoa autoLogin + apiServer (xem src/adapters/fca.js), nen mat khau
 * KHONG bi gui toi may chu ben thu ba nao.
 *
 * Van de bi checkpoint/CAPTCHA, va khong nhap duoc ma 2FA qua giao dien nay.
 */

const { lockConfig, neuterBackups } = require("../src/adapters/fca");
const fca = require("@dongdev/fca-unofficial");
const login = typeof fca === "function" ? fca : fca.login;

function loginWithPassword(email, password) {
  lockConfig();
  neuterBackups();
  return new Promise((resolve, reject) => {
    login({ email, password }, { listenEvents: false }, (err, api) => {
      if (err) return reject(new Error(err?.error || err?.message || String(err)));

      let state = [];
      try {
        state = api.getAppState?.() || [];
      } catch (_) {}

      const appState = state
        .map((c) => ({
          key: c.key || c.name,
          value: c.value,
          domain: c.domain || ".facebook.com",
          path: c.path || "/",
          hostOnly: !!c.hostOnly,
        }))
        .filter((c) => c.key && c.value);

      if (!appState.some((c) => c.key === "c_user")) {
        return reject(new Error("Dang nhap khong tra ve cookie hop le (co the bi checkpoint hoac can 2FA)."));
      }
      resolve(appState);
    });
  });
}

module.exports = { loginWithPassword };
