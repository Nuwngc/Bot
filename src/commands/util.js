/**
 * Ham dung chung cho cac lenh co san (src/commands/*.js).
 * Chi dung API co san cua Node >= 22 (fetch, AbortSignal.timeout).
 */

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

async function request(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || "GET",
    body: opts.body,
    headers: { "user-agent": UA, accept: "*/*", ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeout || 15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

const getJson = async (url, opts) => (await request(url, opts)).json();
const getText = async (url, opts) => (await request(url, opts)).text();

const fmt = (n) => Number(n).toLocaleString("vi-VN");

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];

/** bo dau, ha chu thuong, gon khoang trang - de so sanh dap an/tu khoa */
function plain(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Doc so tien cuoc: 1000, 1.000, 5k, 2m, 1.5tr, 50%, all.
 * Tra ve so nguyen >= 0, hoac null neu khong hieu.
 */
function parseAmount(token, balance = 0) {
  const t = plain(token).replace(/\s/g, "");
  if (!t) return null;
  if (t === "all" || t === "allin" || t === "het") return Math.floor(balance);

  let m = t.match(/^(\d+(?:[.,]\d+)?)%$/);
  if (m) {
    const pct = Number(m[1].replace(",", "."));
    if (pct <= 0 || pct > 100) return null;
    return Math.floor((balance * pct) / 100);
  }

  m = t.match(/^(\d+(?:[.,]\d+)?)(k|m|tr|b|ty)$/);
  if (m) {
    const mul = { k: 1e3, m: 1e6, tr: 1e6, b: 1e9, ty: 1e9 }[m[2]];
    return Math.floor(Number(m[1].replace(",", ".")) * mul);
  }

  // 1.000.000 hoac 1,000,000
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return Number(t.replace(/[.,]/g, ""));
  if (/^\d+$/.test(t)) return Number(t);
  return null;
}

function decodeEntities(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();
}

module.exports = { getJson, getText, request, fmt, rand, pick, plain, parseAmount, decodeEntities };
