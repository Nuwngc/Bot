/** Thao tac tren moi bot (FB + Zalo) cua mot tai khoan web */

const { fq } = require("./fbBots");
const zalo = require("./zalo");
const manager = require("../src/bot/manager");

function stopUserBots(userId) {
  for (const b of fq.byUser.all(userId)) manager.stop(b.id);
  for (const z of zalo.zq.byUser.all(userId)) zalo.stop(z.id);
}

function deleteUserBots(userId) {
  for (const b of fq.byUser.all(userId)) manager.forget(b.id);
  for (const z of zalo.zq.byUser.all(userId)) zalo.forget(z.id);
  fq.delByUser.run(userId);
  zalo.zq.delByUser.run(userId);
}

function summary(userId) {
  const billing = require("./billing");
  const user = require("./db").q.userById.get(userId);
  const fb = fq.byUser.all(userId);
  const zl = zalo.zq.byUser.all(userId);
  const on = (s) => s === "running" || s === "starting";
  return {
    fbTotal: fb.length,
    fbRunning: fb.filter((b) => on(manager.status(b.id).status)).length,
    fbPaid: fb.filter((b) => billing.isBotActive(user, b)).length,
    zaloTotal: zl.length,
    zaloRunning: zl.filter((z) => zalo.status(z.id).status === "running").length,
    zaloPaid: zl.filter((z) => billing.isBotActive(user, z)).length,
  };
}

const fbOn = (id) => ["running", "starting"].includes(manager.status(id).status);
const zaloOn = (id) => ["running", "stopping"].includes(zalo.status(id).status);

/** Id cac bot dang chay (hoac dang ket noi) cua mot loai, xep theo id tang dan */
function runningIds(userId, product) {
  if (product === "fb") return fq.byUser.all(userId).map((b) => b.id).filter(fbOn);
  return zalo.zq.byUser.all(userId).map((z) => z.id).filter(zaloOn);
}

function stopProduct(userId, product, ids) {
  for (const id of ids ?? runningIds(userId, product)) {
    if (product === "fb") manager.stop(id);
    else zalo.stop(id);
  }
}

module.exports = { stopUserBots, deleteUserBots, summary, runningIds, stopProduct };
