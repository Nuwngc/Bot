/**
 * Dem so nguoi dang online.
 * Trang bang dieu khien goi /api/stats moi ~20 giay khi dang mo (tab bi an thi ngung),
 * moi lan goi la mot "nhip tim". Ai co nhip trong 60 giay gan nhat thi tinh la dang online.
 * Dem theo tai khoan (mot nguoi mo nhieu tab van la 1). Chi luu trong bo nho, khong ghi database.
 */
const WINDOW_MS = 60 * 1000;
const seen = new Map(); // userId -> thoi diem nhip gan nhat

function touch(userId) {
  seen.set(userId, Date.now());
}

function onlineCount() {
  const limit = Date.now() - WINDOW_MS;
  let n = 0;
  for (const [id, t] of seen) {
    if (t >= limit) n++;
    else seen.delete(id); // don nguoi da roi di
  }
  return n;
}

module.exports = { touch, onlineCount };
