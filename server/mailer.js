/**
 * GUI EMAIL (ma xac thuc, quen mat khau).
 *
 * Co 2 cach gui, admin chon trong tab Quan tri -> "Email gui ma":
 *  - brevo : goi API qua HTTPS (khong dung cong SMTP) -> chay duoc ca tren Render goi free.
 *            Mien phi 300 email/ngay; chi can xac minh 1 email nguoi gui (khong can ten mien).
 *  - smtp  : gui qua may chu SMTP (Gmail + mat khau ung dung, Outlook, ...).
 *            Luu y: Render goi free chan cong SMTP, nen chi dung duoc tren VPS / Termux / goi tra phi.
 * Co the dat bang bien moi truong thay cho trang quan tri: MAIL_PROVIDER, MAIL_FROM, MAIL_FROM_NAME,
 * BREVO_API_KEY, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE=1.
 * MAIL_PROVIDER=console chi de thu tren may: in noi dung email ra log, khong gui that.
 */
const nodemailer = require("nodemailer");
const { getSetting, setSetting } = require("./db");
const { encrypt, decrypt } = require("./crypto");

const env = process.env;
const SITE = "Bảng điều khiển bot";

/** Cau hinh dang dung: gia tri admin luu trong DB, thieu thi lay tu bien moi truong */
function config() {
  const s = (k) => getSetting(k) || "";
  let provider = s("mail_provider") || env.MAIL_PROVIDER || "";
  if (!provider) provider = env.BREVO_API_KEY ? "brevo" : env.SMTP_HOST ? "smtp" : "";
  const smtpPort = Number(s("smtp_port") || env.SMTP_PORT) || 587;
  return {
    provider,
    fromAddress: s("mail_from") || env.MAIL_FROM || "",
    fromName: s("mail_from_name") || env.MAIL_FROM_NAME || SITE,
    brevoKey: decrypt(s("mail_brevo_key_enc")) || env.BREVO_API_KEY || "",
    smtp: {
      host: s("smtp_host") || env.SMTP_HOST || "",
      port: smtpPort,
      user: s("smtp_user") || env.SMTP_USER || "",
      pass: decrypt(s("smtp_pass_enc")) || env.SMTP_PASS || "",
      secure: smtpPort === 465 || env.SMTP_SECURE === "1",
    },
  };
}

/** Da cau hinh du de gui chua? */
function isEnabled() {
  const c = config();
  if (c.provider === "console") return true;
  if (!c.fromAddress) return false;
  if (c.provider === "brevo") return !!c.brevoKey;
  if (c.provider === "smtp") return !!c.smtp.host;
  return false;
}

/** Luu cau hinh tu trang quan tri. Khoa / mat khau chi doi khi gui gia tri moi. */
function saveConfig(b) {
  const provider = ["brevo", "smtp", ""].includes(b.provider) ? b.provider : "";
  setSetting("mail_provider", provider);
  const from = String(b.fromAddress || "").trim();
  if (from && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) throw new Error("Email người gửi không hợp lệ");
  setSetting("mail_from", from);
  setSetting("mail_from_name", String(b.fromName || "").trim().slice(0, 60));
  if (b.brevoKey) setSetting("mail_brevo_key_enc", encrypt(String(b.brevoKey).trim()));
  if (b.clearBrevoKey) setSetting("mail_brevo_key_enc", "");
  const sm = b.smtp || {};
  setSetting("smtp_host", String(sm.host || "").trim());
  const port = Math.round(Number(sm.port) || 587);
  if (!(port >= 1 && port <= 65535)) throw new Error("Cổng SMTP không hợp lệ");
  setSetting("smtp_port", String(port));
  setSetting("smtp_user", String(sm.user || "").trim());
  if (sm.pass) setSetting("smtp_pass_enc", encrypt(String(sm.pass)));
  if (sm.clearPass) setSetting("smtp_pass_enc", "");
}

/** Trang quan tri hien thong tin cau hinh, KHONG tra khoa that ve trinh duyet */
function publicConfig() {
  const c = config();
  const fromEnv = !getSetting("mail_provider") && !!c.provider;
  return {
    enabled: isEnabled(),
    provider: c.provider,
    fromEnv,
    fromAddress: c.fromAddress,
    fromName: getSetting("mail_from_name") || "",
    hasBrevoKey: !!c.brevoKey,
    smtp: { host: c.smtp.host, port: c.smtp.port, user: c.smtp.user, hasPass: !!c.smtp.pass },
  };
}

/* ---------- Gui that ---------- */

async function viaBrevo(c, { to, subject, text, html }) {
  const base = env.BREVO_API_URL || "https://api.brevo.com";
  let r;
  try {
    r = await fetch(`${base}/v3/smtp/email`, {
      method: "POST",
      headers: { "api-key": c.brevoKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: c.fromName, email: c.fromAddress },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    throw new Error("Không kết nối được Brevo. Kiểm tra mạng của server rồi thử lại.");
  }
  if (r.ok) return;
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("API key Brevo không đúng hoặc đã bị thu hồi.");
  if (/sender/i.test(d.message || "")) {
    throw new Error("Email người gửi chưa được xác minh trong Brevo (vào Brevo → Senders → thêm và xác minh email này).");
  }
  throw new Error(`Brevo từ chối gửi (${r.status})${d.message ? ": " + d.message : ""}`);
}

async function viaSmtp(c, { to, subject, text, html }) {
  const t = nodemailer.createTransport({
    host: c.smtp.host,
    port: c.smtp.port,
    secure: c.smtp.secure,
    auth: c.smtp.user ? { user: c.smtp.user, pass: c.smtp.pass } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  try {
    await t.sendMail({ from: { name: c.fromName, address: c.fromAddress }, to, subject, text, html });
  } catch (e) {
    if (e.code === "EAUTH") throw new Error("Sai tài khoản hoặc mật khẩu SMTP (Gmail cần dùng mật khẩu ứng dụng).");
    if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNREFUSED", "EDNS"].includes(e.code)) {
      throw new Error("Không kết nối được máy chủ SMTP. Render gói free chặn cổng SMTP, hãy dùng Brevo hoặc VPS.");
    }
    throw new Error("Gửi qua SMTP thất bại: " + (e.response || e.message || "lỗi không rõ"));
  } finally {
    t.close();
  }
}

/** Gui mot email. Loi -> throw Error voi ly do de doc (khong lo khoa). */
async function send(msg) {
  const c = config();
  if (!isEnabled()) throw new Error("Quản trị viên chưa bật gửi email.");
  if (c.provider === "console") {
    console.log(`[mail:console] to=${msg.to} subject=${msg.subject}\n${msg.text}`);
    return;
  }
  return c.provider === "brevo" ? viaBrevo(c, msg) : viaSmtp(c, msg);
}

/* ---------- Mau email ---------- */

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

/** Email ma xac thuc (purpose: verify | reset) */
function codeMail({ code, purpose, minutes, username }) {
  const reset = purpose === "reset";
  const title = reset ? "Đặt lại mật khẩu" : "Xác thực email";
  const lead = reset
    ? `Có người yêu cầu đặt lại mật khẩu cho tài khoản <b>${esc(username)}</b>. Nhập mã dưới đây để tiếp tục.`
    : `Nhập mã dưới đây để liên kết email này với tài khoản <b>${esc(username)}</b>.`;
  const subject = `${code} là mã ${reset ? "đặt lại mật khẩu" : "xác thực email"} của bạn`;
  const text =
    `${title} - ${SITE}\n\nTài khoản: ${username}\nMã của bạn: ${code}\n\n` +
    `Mã có hiệu lực ${minutes} phút. Không chia sẻ mã này cho bất kỳ ai.\n` +
    `Nếu không phải bạn yêu cầu, hãy bỏ qua email này, tài khoản của bạn vẫn an toàn.`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4fb;font-family:Segoe UI,Arial,sans-serif;color:#1c2040">
  <div style="max-width:420px;margin:0 auto;background:#fff;border-radius:18px;padding:28px 26px;border:1px solid #e3e5f5">
    <div style="font-size:13px;color:#6b709a;letter-spacing:.04em;text-transform:uppercase">${esc(SITE)}</div>
    <h1 style="margin:6px 0 14px;font-size:22px">${title}</h1>
    <p style="margin:0 0 18px;line-height:1.55;font-size:15px">${lead}</p>
    <div style="text-align:center;margin:0 0 18px"><span style="display:inline-block;padding:14px 22px;border-radius:14px;background:#eef0ff;font-size:32px;font-weight:700;letter-spacing:.35em;color:#3946d4">${esc(code)}</span></div>
    <p style="margin:0 0 6px;font-size:13px;color:#6b709a">Mã có hiệu lực <b>${minutes} phút</b>. Không chia sẻ mã này cho bất kỳ ai.</p>
    <p style="margin:0;font-size:13px;color:#6b709a">Nếu không phải bạn yêu cầu, hãy bỏ qua email này. Tài khoản của bạn vẫn an toàn.</p>
  </div></body></html>`;
  return { subject, text, html };
}

module.exports = { isEnabled, config, saveConfig, publicConfig, send, codeMail };
