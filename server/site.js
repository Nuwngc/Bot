/**
 * THONG BAO TONG + THONG TIN LIEN HE / CHAN TRANG cho toan web.
 *
 *  GET  /api/site/public      (khong can dang nhap) thong bao dang bat + thong tin lien he de ve chan trang, nut noi
 *  GET  /api/site/img/:id     (khong can dang nhap) hinh trong thong bao
 *  GET  /api/site/admin       (admin) cau hinh day du de sua
 *  POST /api/site/admin       (admin) { notice?, info? } luu
 *  POST /api/site/image       (admin) body = file anh (jpeg/png/gif/webp, toi da 3MB), tra { id, url }
 *
 *  Cau hinh nam trong bang settings (site_notice, site_info), hinh nam trong bang site_images (BLOB) nen
 *  di cung CSDL: backup / dia Render giu CSDL thi hinh cung con.
 */
const crypto = require("crypto");
const { db, getSetting, setSetting } = require("./db");
const auth = require("./auth");

let VERSION = "";
try { VERSION = String(require("../package.json").version || ""); } catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS site_images (
    id TEXT PRIMARY KEY,
    mime TEXT NOT NULL,
    data BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );
`);
const qImgGet = db.prepare("SELECT mime, data FROM site_images WHERE id = ?");
const qImgIns = db.prepare("INSERT INTO site_images (id, mime, data, created_at) VALUES (?, ?, ?, ?)");
const qImgDel = db.prepare("DELETE FROM site_images WHERE id = ?");
const qImgAll = db.prepare("SELECT id, created_at FROM site_images");

const MAX_IMAGES = 4;            // so hinh toi da trong 1 thong bao
const MAX_IMG_BYTES = 3 * 1024 * 1024;
const MAX_IMG_ROWS = 40;         // tong so hinh luu trong CSDL (chong rac)
const KINDS = ["messenger", "youtube", "facebook", "discord", "community", "zalo", "telegram", "tiktok", "link"];
const SEED_CONTACTS = [
  { kind: "messenger", label: "Liên Hệ QTV", url: "" },
  { kind: "youtube", label: "YouTube", url: "" },
  { kind: "facebook", label: "Facebook", url: "" },
  { kind: "discord", label: "Discord", url: "" },
  { kind: "community", label: "Community", url: "" },
];
const DEFAULT_NAME = "Bảng điều khiển bot";

/* ---------- kiem tra du lieu ---------- */

const str = (v, max, name) => {
  const s = String(v ?? "").replace(/\r\n?/g, "\n").trim();
  if (s.length > max) throw new Error(`${name} dài tối đa ${max} ký tự`);
  return s;
};

/** Chi nhan http/https. Go "m.me/abc" thi tu them https://. */
function cleanUrl(u, name = "Link") {
  u = String(u ?? "").trim();
  if (!u) return "";
  if (u.length > 500) throw new Error(`${name} quá dài`);
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = "https://" + u;
  if (!/^https?:\/\/[^\s<>"'`\\]+$/i.test(u)) throw new Error(`${name} phải là địa chỉ web bắt đầu bằng http:// hoặc https://`);
  let p;
  try { p = new URL(u); } catch (_) { throw new Error(`${name} không hợp lệ`); }
  if (!p.hostname.includes(".")) throw new Error(`${name} không hợp lệ`);
  return u;
}

/** Nhan dang file anh bang chu ky dau file (khong tin Content-Type). Chi 4 dinh dang an toan, khong nhan SVG. */
function sniffImage(buf) {
  if (!buf || !buf.length) return "";
  const b = Buffer.from(buf);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString("latin1"))) return "image/gif";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return "";
}

const imgExists = (id) => !!qImgGet.get(id);
const imgUrl = (id) => `/api/site/img/${id}`;

function readJson(key, fallback) {
  try {
    const v = JSON.parse(getSetting(key) || "null");
    return v && typeof v === "object" ? v : fallback;
  } catch (_) { return fallback; }
}

const readNotice = () => {
  const n = readJson("site_notice", {});
  return {
    enabled: !!n.enabled,
    title: String(n.title || ""),
    text: String(n.text || ""),
    images: Array.isArray(n.images) ? n.images.filter((id) => /^[a-f0-9]{16}$/.test(id) && imgExists(id)).slice(0, MAX_IMAGES) : [],
    btnLabel: String(n.btnLabel || ""),
    btnUrl: String(n.btnUrl || ""),
    v: String(n.v || ""),
  };
};

const readInfo = () => {
  const i = readJson("site_info", {});
  return {
    name: String(i.name || DEFAULT_NAME),
    showContacts: i.showContacts !== false,
    floatBtns: i.floatBtns !== false,
    contacts: Array.isArray(i.contacts) ? i.contacts.filter((c) => c && KINDS.includes(c.kind)).map((c) => ({ kind: c.kind, label: String(c.label || ""), url: String(c.url || "") })) : SEED_CONTACTS,
    links: Array.isArray(i.links) ? i.links.map((l) => ({ label: String(l?.label || ""), url: String(l?.url || "") })).filter((l) => l.label && l.url) : [],
  };
};

function cleanNotice(inp) {
  const o = inp && typeof inp === "object" ? inp : {};
  const title = str(o.title, 120, "Tiêu đề");
  const text = str(o.text, 4000, "Nội dung");
  const ids = Array.isArray(o.images) ? [...new Set(o.images.map(String))] : [];
  if (ids.length > MAX_IMAGES) throw new Error(`Tối đa ${MAX_IMAGES} hình`);
  for (const id of ids) if (!/^[a-f0-9]{16}$/.test(id) || !imgExists(id)) throw new Error("Có hình không còn trên máy chủ, hãy thêm lại");
  const btnUrl = cleanUrl(o.btnUrl, "Link nút");
  const btnLabel = btnUrl ? str(o.btnLabel, 40, "Chữ trên nút") || "Xem chi tiết" : "";
  const enabled = !!o.enabled;
  if (enabled && !title && !text && !ids.length) throw new Error("Thông báo đang bật nhưng chưa có tiêu đề, nội dung hay hình");
  return { enabled, title, text, images: ids, btnLabel, btnUrl, v: String(Date.now()) };
}

function cleanInfo(inp) {
  const o = inp && typeof inp === "object" ? inp : {};
  const name = str(o.name, 60, "Tên web") || DEFAULT_NAME;
  const contacts = [];
  for (const c of Array.isArray(o.contacts) ? o.contacts : []) {
    const url = cleanUrl(c?.url, "Link liên hệ");
    const kind = KINDS.includes(c?.kind) ? c.kind : "link";
    const label = str(c?.label, 40, "Tên liên hệ");
    if (!url && !label) continue;
    contacts.push({ kind, label: label || "Liên hệ", url });
  }
  if (contacts.length > 10) throw new Error("Tối đa 10 mục liên hệ");
  const links = [];
  for (const l of Array.isArray(o.links) ? o.links : []) {
    const url = cleanUrl(l?.url, "Link chân trang");
    const label = str(l?.label, 40, "Tên link chân trang");
    if (!url && !label) continue;
    if (!url || !label) throw new Error("Mỗi link chân trang cần đủ tên và địa chỉ");
    links.push({ label, url });
  }
  if (links.length > 12) throw new Error("Tối đa 12 link chân trang");
  return { name, showContacts: o.showContacts !== false, floatBtns: o.floatBtns !== false, contacts, links };
}

/** Xoa hinh khong con dung (chi xoa hinh da tai len qua 24 gio, de kip bam Luu) */
function purgeOrphans() {
  const keep = new Set(readNotice().images);
  const old = Date.now() - 24 * 3600 * 1000;
  for (const r of qImgAll.all()) if (!keep.has(r.id) && r.created_at < old) qImgDel.run(r.id);
}

function publicView() {
  const n = readNotice(), i = readInfo();
  const show = n.enabled && (n.title || n.text || n.images.length);
  return {
    notice: show ? { v: n.v, title: n.title, text: n.text, images: n.images.map(imgUrl), btnLabel: n.btnLabel, btnUrl: n.btnUrl } : null,
    site: {
      name: i.name, version: VERSION, showContacts: i.showContacts, floatBtns: i.floatBtns,
      contacts: i.contacts.filter((c) => c.url), links: i.links,
    },
  };
}

function adminView() {
  const n = readNotice(), i = readInfo();
  return { notice: { ...n, images: n.images.map((id) => ({ id, url: imgUrl(id) })) }, info: i, kinds: KINDS, maxImages: MAX_IMAGES };
}

/* ---------- xu ly yeu cau (tach rieng de de kiem tra) ---------- */

const fail = (res, e) => res.status(400).json({ error: e.message || "Có lỗi xảy ra" });

const handlers = {
  public(req, res) {
    res.setHeader("Cache-Control", "no-cache");
    res.json(publicView());
  },

  img(req, res) {
    const id = String(req.params.id || "");
    const row = /^[a-f0-9]{16}$/.test(id) ? qImgGet.get(id) : null;
    if (!row) return res.status(404).send("Khong tim thay hinh");
    res.setHeader("Content-Type", row.mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); // id moi lan tai len la duy nhat
    res.setHeader("Content-Disposition", "inline");
    res.end(Buffer.from(row.data));
  },

  adminGet(req, res) { res.json(adminView()); },

  adminSave(req, res) {
    try {
      const b = req.body || {};
      if (!("notice" in b) && !("info" in b)) throw new Error("Thiếu dữ liệu");
      // kiem tra het truoc khi luu, de loi o phan nao cung khong luu do dang phan kia
      const notice = "notice" in b ? cleanNotice(b.notice) : null;
      const info = "info" in b ? cleanInfo(b.info) : null;
      if (notice) setSetting("site_notice", JSON.stringify(notice));
      if (info) setSetting("site_info", JSON.stringify(info));
      purgeOrphans();
      res.json(adminView());
    } catch (e) { fail(res, e); }
  },

  upload(req, res) {
    try {
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || !buf.length) throw new Error("Chỉ nhận file ảnh JPG, PNG, GIF hoặc WebP");
      if (buf.length > MAX_IMG_BYTES) throw new Error("Ảnh quá lớn (tối đa 3MB)");
      const mime = sniffImage(buf);
      if (!mime) throw new Error("File không phải ảnh JPG, PNG, GIF hoặc WebP");
      if (qImgAll.all().length >= MAX_IMG_ROWS) { purgeOrphans(); if (qImgAll.all().length >= MAX_IMG_ROWS) throw new Error("Đã lưu quá nhiều hình, hãy xoá bớt thông báo cũ"); }
      const id = crypto.randomBytes(8).toString("hex");
      qImgIns.run(id, mime, buf, Date.now());
      res.json({ id, url: imgUrl(id) });
    } catch (e) { fail(res, e); }
  },
};

function createRouter(express) {
  const router = express.Router();
  const admin = [auth.requireLogin, auth.requireAdmin];
  router.get("/public", handlers.public);
  router.get("/img/:id", handlers.img);
  router.get("/admin", ...admin, handlers.adminGet);
  router.post("/admin", ...admin, handlers.adminSave);
  router.post("/image", ...admin, express.raw({ type: ["image/jpeg", "image/png", "image/gif", "image/webp"], limit: MAX_IMG_BYTES }), handlers.upload);
  router.use((err, req, res, next) => {
    if (err && err.status === 413) return res.status(413).json({ error: "Ảnh quá lớn (tối đa 3MB)" });
    console.error("[site] loi:", err);
    res.status(500).json({ error: "Loi server" });
  });
  return router;
}

module.exports = { createRouter, handlers, cleanNotice, cleanInfo, cleanUrl, sniffImage, publicView, readNotice, readInfo, KINDS };
