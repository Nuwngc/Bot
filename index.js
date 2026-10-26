require("dotenv").config();

const { createApp } = require("./server/app");
const { q, ensureBotRow, DB_PATH } = require("./server/db");
const { decrypt } = require("./server/crypto");
const { bootstrapAdmin } = require("./server/auth");
const billing = require("./server/billing");
const manager = require("./src/bot/manager");
const zalo = require("./server/zalo");
const { fq, uidOf, aiConfig } = require("./server/fbBots");
const userBots = require("./server/userBots");

const PORT = Number(process.env.PORT) || 3000;

/**
 * Cho mang san sang truoc khi tu bat bot. Tren Termux, app vua mo len co the
 * chua co DNS/mang trong vai giay dau, khien lan dang nhap dau tien that bai
 * dan den bao loi oan uong. Thu toi da 30s, khong duoc thi cu bat nhu thuong
 * (tung bot van co co che tu thu lai rieng).
 */
function waitForNetwork(timeoutMs = 30000) {
  const dns = require("dns");
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const tryOnce = () => {
      dns.lookup("wpa.chat.zalo.me", (err) => {
        if (!err || Date.now() - startedAt > timeoutMs) return resolve();
        setTimeout(tryOnce, 1500);
      });
    };
    tryOnce();
  });
}

async function autostartBots() {
  await waitForNetwork();

  const fbRows = fq.allAutostart.all();
  const zlRows = zalo.zq.allAutostart.all();
  if (fbRows.length + zlRows.length === 0) return;
  console.log(`[boot] Tu bat ${fbRows.length} bot FB, ${zlRows.length} bot Zalo...`);

  // Chi bat bot con han (moi bot thanh toan rieng)
  const allowed = (row) => {
    const user = q.userById.get(row.user_id);
    return user && user.active && billing.isBotActive(user, row);
  };

  // Zalo chay tien trinh rieng nen bat ngay
  for (const row of zlRows) {
    if (!allowed(row)) continue;
    try {
      zalo.start(row.id);
      console.log(`[boot] zalo #${row.id}: OK`);
    } catch (err) {
      console.error(`[boot] zalo #${row.id}: ${err?.message || err}`);
    }
  }

  // FB dang nhap lan luot (manager tu xep hang)
  for (const row of fbRows) {
    if (!allowed(row)) continue;
    let appState;
    try {
      appState = JSON.parse(decrypt(row.appstate_enc) || "null");
    } catch (_) {}
    if (!Array.isArray(appState)) continue;
    try {
      const r = await manager.start(row.id, {
        appState,
        uid: uidOf(row),
        ownerId: row.user_id,
        prefix: row.prefix,
        ...aiConfig(row.user_id),
      });
      if (r && !r.cancelled) fq.setFbInfo.run(r.fbUid, r.fbName || null, row.id);
      console.log(`[boot] fb #${row.id}: OK`);
    } catch (err) {
      console.error(`[boot] fb #${row.id}: ${err?.message || err}`);
    }
  }
}

/** Moi 2 phut: tat nhung bot dang chay ma da het han (hoac tai khoan bi khoa) */
function startPlanSweeper() {
  setInterval(() => {
    for (const u of q.allUsers.all()) {
      const user = q.userById.get(u.id);
      for (const product of ["fb", "zalo"]) {
        const expired = userBots.runningIds(u.id, product).filter((id) => {
          const row = product === "fb" ? fq.byId.get(id) : zalo.zq.byId.get(id);
          return !user.active || !billing.isBotActive(user, row);
        });
        if (!expired.length) continue;
        for (const id of expired) {
          if (product === "fb") manager.log(id, "info", "Bot het han - tu dong tat. Gia han trong phan chi tiet bot.");
          else zalo.log(id, "info", "Bot het han - tu dong tat. Gia han trong phan chi tiet bot.");
        }
        userBots.stopProduct(u.id, product, expired);
        console.log(`[plan] ${u.username}: tat ${expired.length} bot ${product} het han`);
      }
    }
  }, 2 * 60 * 1000).unref?.();
}

function main() {
  console.log("[boot] Database:", DB_PATH);
  bootstrapAdmin();

  // Dam bao moi user deu co ban ghi bot
  for (const u of q.allUsers.all()) ensureBotRow(u.id);

  const app = createApp();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[web] Dang chay tai http://localhost:${PORT}`);
    autostartBots();
    startPlanSweeper();
  });
}

function shutdown(sig) {
  console.log(`\n[boot] Nhan ${sig}, dang dung cac bot...`);
  manager.stopAll();
  zalo.stopAll();
  setTimeout(() => process.exit(0), 1000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => console.error("[boot] unhandledRejection:", err));

main();
