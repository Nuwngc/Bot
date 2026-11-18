/**
 * IMAP CLIENT TOI GIAN (chi doc, khong phu thuoc thu vien ngoai)
 *
 *  Chi du de server doc email bao bien dong so du: LOGIN, SELECT, UID SEARCH, UID FETCH (BODY.PEEK nen khong danh dau da doc),
 *  LOGOUT. Luon ket noi TLS (cong 993) va kiem tra chung chi may chu.
 */

const tls = require("tls");

const MAX_BUF = 8 * 1024 * 1024;

const quote = (s) => {
  s = String(s);
  if (/[\r\n\0]/.test(s)) throw new Error("Giá trị không hợp lệ");
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
};

/**
 * Tim dong hoan tat cua lenh (bat dau bang tag) trong bo dem, co bo qua phan "literal" {n}.
 * Tra ve { end, status, message } hoac null neu chua nhan du.
 */
function scanTagged(buf, tag) {
  let pos = 0;
  while (pos < buf.length) {
    const eol = buf.indexOf("\r\n", pos);
    if (eol < 0) return null;
    const line = buf.toString("latin1", pos, eol);
    if (line.startsWith(tag + " ")) {
      const m = /^\S+\s+(OK|NO|BAD)\b\s*(.*)$/i.exec(line);
      return { end: eol + 2, status: m ? m[1].toUpperCase() : "BAD", message: m ? m[2] : line };
    }
    const lit = /\{(\d+)\}$/.exec(line);
    if (lit) {
      const next = eol + 2 + Number(lit[1]);
      if (next > buf.length) return null;
      pos = next;
      continue;
    }
    pos = eol + 2;
  }
  return null;
}

class Imap {
  constructor(host, port = 993, tlsOptions = {}) {
    this.host = host;
    this.port = port;
    this.tlsOptions = tlsOptions;
    this.buf = Buffer.alloc(0);
    this.n = 0;
    this.wait = null;
    this.sock = null;
    this.dead = null;
  }

  _pump() {
    if (!this.wait) return;
    const r = this.wait.check(this.buf);
    if (r) {
      const w = this.wait;
      this.wait = null;
      clearTimeout(w.timer);
      w.resolve(r);
    }
  }

  _fail(err) {
    this.dead = this.dead || err;
    if (this.wait) {
      const w = this.wait;
      this.wait = null;
      clearTimeout(w.timer);
      w.reject(this.dead);
    }
  }

  _expect(check, timeoutMs) {
    if (this.dead) return Promise.reject(this.dead);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.sock?.destroy();
        this._fail(new Error("Máy chủ email không trả lời kịp"));
      }, timeoutMs);
      this.wait = { check, resolve, reject, timer };
      this._pump();
    });
  }

  async open(timeoutMs = 20000) {
    await new Promise((resolve, reject) => {
      const sock = tls.connect({ host: this.host, port: this.port, servername: this.host, ...this.tlsOptions });
      this.sock = sock;
      const timer = setTimeout(() => { sock.destroy(); reject(new Error("Không kết nối được tới máy chủ email")); }, timeoutMs);
      sock.once("secureConnect", () => { clearTimeout(timer); resolve(); });
      sock.on("error", (e) => {
        clearTimeout(timer);
        const err = new Error(e.code === "ENOTFOUND" ? "Không tìm thấy máy chủ email (kiểm tra tên máy chủ)" : `Lỗi kết nối email: ${e.message}`);
        reject(err);
        this._fail(err);
      });
      sock.on("close", () => this._fail(new Error("Máy chủ email đã đóng kết nối")));
      sock.on("data", (d) => {
        this.buf = Buffer.concat([this.buf, d]);
        if (this.buf.length > MAX_BUF) { sock.destroy(); return this._fail(new Error("Phản hồi email quá lớn")); }
        this._pump();
      });
    });
    // Loi chao "* OK ..."
    const g = await this._expect((b) => {
      const eol = b.indexOf("\r\n");
      return eol < 0 ? null : { end: eol + 2, line: b.toString("latin1", 0, eol) };
    }, timeoutMs);
    this.buf = this.buf.subarray(g.end);
    if (!/^\* (OK|PREAUTH)/i.test(g.line)) throw new Error("Máy chủ email từ chối kết nối");
  }

  /** Gui 1 lenh, doi dong hoan tat. Tra ve { status, message, raw: Buffer } */
  async cmd(text, timeoutMs = 30000) {
    const tag = "A" + String(++this.n).padStart(3, "0");
    this.sock.write(`${tag} ${text}\r\n`);
    const r = await this._expect((b) => scanTagged(b, tag), timeoutMs);
    const raw = this.buf.subarray(0, r.end);
    this.buf = this.buf.subarray(r.end);
    return { status: r.status, message: r.message, raw };
  }

  async login(user, pass) {
    const r = await this.cmd(`LOGIN ${quote(user)} ${quote(pass)}`);
    if (r.status !== "OK") throw new Error("Đăng nhập email thất bại. Kiểm tra email và mật khẩu ứng dụng.");
  }

  async select(mailbox = "INBOX") {
    const r = await this.cmd(`EXAMINE ${quote(mailbox)}`); // EXAMINE = mo che do chi doc
    if (r.status !== "OK") throw new Error(`Không mở được hộp thư "${mailbox}"`);
    const t = r.raw.toString("latin1");
    const num = (re) => { const m = re.exec(t); return m ? Number(m[1]) : 0; };
    return { uidvalidity: num(/\[UIDVALIDITY (\d+)\]/i), uidnext: num(/\[UIDNEXT (\d+)\]/i), exists: num(/\* (\d+) EXISTS/i) };
  }

  /** UID cua cac thu co UID >= minUid, loc theo nguoi gui (tuy chon) */
  async searchUids(from, minUid) {
    const crit = [`UID ${Math.max(1, minUid)}:*`];
    if (from) crit.push(`FROM ${quote(from)}`);
    const r = await this.cmd(`UID SEARCH ${crit.join(" ")}`);
    if (r.status !== "OK") throw new Error("Không tìm được email trong hộp thư");
    const m = /\* SEARCH([\d ]*)/i.exec(r.raw.toString("latin1"));
    return m ? m[1].trim().split(/\s+/).filter(Boolean).map(Number).filter((n) => n >= minUid).sort((a, b) => a - b) : [];
  }

  /** Noi dung tho cua 1 thu (toi da maxBytes). BODY.PEEK nen khong doi trang thai da doc. */
  async fetchRaw(uid, maxBytes = 300000) {
    const r = await this.cmd(`UID FETCH ${Number(uid)} (BODY.PEEK[]<0.${maxBytes}>)`, 45000);
    if (r.status !== "OK") throw new Error("Không đọc được nội dung email");
    const head = r.raw.toString("latin1", 0, Math.min(r.raw.length, 400));
    const m = /\{(\d+)\}\r\n/.exec(head);
    if (!m) return null;
    const start = m.index + m[0].length;
    return r.raw.subarray(start, start + Number(m[1]));
  }

  close() {
    try {
      if (this.sock && !this.sock.destroyed) {
        this.sock.write(`A${String(++this.n).padStart(3, "0")} LOGOUT\r\n`);
        this.sock.end();
      }
    } catch (_) {}
    setTimeout(() => this.sock?.destroy(), 500).unref?.();
  }
}

module.exports = { Imap, scanTagged };
