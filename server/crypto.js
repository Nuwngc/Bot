/**
 * Ma hoa du lieu nhay cam truoc khi luu DB.
 *
 * Cookie Facebook = quyen truy cap toan bo tai khoan. Neu database bi lo
 * ma cookie luu dang thuong thi mat tai khoan ngay. Vi vay moi ban ghi
 * duoc ma hoa AES-256-GCM bang APP_SECRET (chi nam trong bien moi truong,
 * KHONG nam trong database).
 */

const crypto = require("crypto");

const SECRET = process.env.APP_SECRET;

if (!SECRET || SECRET.length < 16) {
  console.error(
    "\n[LOI] Thieu APP_SECRET (hoac qua ngan).\n" +
      "Tao mot chuoi ngau nhien va dat vao bien moi truong APP_SECRET:\n" +
      "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n"
  );
  process.exit(1);
}

// Khoa 32 byte dan xuat tu APP_SECRET
const KEY = crypto.createHash("sha256").update(SECRET).digest();

function encrypt(plain) {
  if (plain == null || plain === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

function decrypt(blob) {
  if (!blob) return null;
  try {
    const [ivB, tagB, dataB] = blob.split(".");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      KEY,
      Buffer.from(ivB, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (_) {
    // Sai khoa (doi APP_SECRET) hoac du lieu hong
    return null;
  }
}

/** Che bot chuoi de hien thi tren web: "sk-ant-...4f2a" */
function mask(s, keep = 4) {
  if (!s) return "";
  const str = String(s);
  if (str.length <= keep * 2) return "*".repeat(str.length);
  return str.slice(0, 6) + "…" + str.slice(-keep);
}

module.exports = { encrypt, decrypt, mask };
