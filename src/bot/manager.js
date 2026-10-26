/**
 * Quan ly vong doi bot Facebook, theo TUNG BOT (mot tai khoan web co the co nhieu bot).
 *
 * Chong loi khi chay dong thoi:
 *  - Dang nhap duoc xep hang lan luot: thu vien fca dung chung file cau hinh va
 *    database backup, dang nhap song song de gay loi "database is locked".
 *  - Moi lan bat co ma the he (gen). Bam tat trong luc dang dang nhap thi phien
 *    dang nhap do bi huy ngay khi xong, khong con bot "ma" chay ngam.
 *  - Mot tai khoan Facebook (c_user) khong duoc chay o 2 bot cung luc.
 */

const { createAdapter } = require("../adapters/fca");
const { createRouter } = require("../core/router");

const MAX_LOG = 200;
const MAX_CONCURRENT = Number(process.env.MAX_BOTS || 3);
const NET_ERR = /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up/i;

/** botId -> { status, adapter, router, logs[], startedAt, fbUid, fbName, error, gen, uid, ownerId } */
const instances = new Map();

function get(botId) {
  if (!instances.has(botId)) {
    instances.set(botId, {
      status: "stopped",
      adapter: null,
      router: null,
      logs: [],
      startedAt: null,
      fbUid: null,
      fbName: null,
      error: null,
      gen: 0,
      uid: null,
      ownerId: null,
    });
  }
  return instances.get(botId);
}

function log(botId, level, text) {
  const inst = get(botId);
  inst.logs.push({ t: new Date().toISOString(), level, text: String(text).slice(0, 500) });
  while (inst.logs.length > MAX_LOG) inst.logs.shift();
  if (level === "error") console.error(`[fb:${botId}]`, text);
}

const busy = (s) => s === "running" || s === "starting";

function runningCount() {
  let n = 0;
  for (const i of instances.values()) if (busy(i.status)) n++;
  return n;
}

/* Hang doi dang nhap: moi lan chi 1 bot dang nhap */
let loginChain = Promise.resolve();
function queued(fn) {
  const run = loginChain.then(fn, fn);
  loginChain = run.catch(() => {});
  return run;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {number} botId
 * @param {object} cfg { appState, uid, ownerId, aiKey, aiModel, aiSystem, prefix }
 */
async function start(botId, cfg) {
  const inst = get(botId);

  if (busy(inst.status)) throw new Error("Bot nay dang chay roi.");
  if (runningCount() >= MAX_CONCURRENT) {
    throw new Error(`Server chi cho phep ${MAX_CONCURRENT} bot FB chay cung luc.`);
  }
  if (cfg.uid) {
    for (const [id, other] of instances) {
      if (id !== botId && busy(other.status) && other.uid === cfg.uid) {
        throw new Error("Tai khoan Facebook nay dang chay o mot bot khac. Tat bot do truoc.");
      }
    }
  }

  const gen = ++inst.gen;
  const cancelled = () => inst.gen !== gen;

  inst.status = "starting";
  inst.error = null;
  inst.uid = cfg.uid || null;
  inst.ownerId = cfg.ownerId;
  log(botId, "info", "Dang cho luot dang nhap Facebook...");

  try {
    const adapter = await queued(async () => {
      if (cancelled()) return null;
      log(botId, "info", "Dang dang nhap Facebook...");
      for (let lan = 1; ; lan++) {
        try {
          return await createAdapter({
            appState: cfg.appState,
            onLog: (lvl, text) => log(botId, lvl, text),
          });
        } catch (e) {
          if (cancelled() || lan >= 4 || !NET_ERR.test(e?.message || "")) throw e;
          log(botId, "error", `Loi mang (${e.message}), thu lai lan ${lan + 1} sau 10s...`);
          await sleep(10000);
          if (cancelled()) return null;
        }
      }
    });

    if (cancelled()) {
      if (adapter) {
        try {
          adapter.stop();
        } catch (_) {}
      }
      return { cancelled: true };
    }

    const router = createRouter({
      prefix: cfg.prefix || "!",
      aiKey: cfg.aiKey,
      aiModel: cfg.aiModel,
      aiSystem: cfg.aiSystem,
      // Du lieu tro choi (vi, diem...) dung chung cho moi bot cua cung tai khoan
      ownerId: cfg.ownerId,
      onLog: (lvl, text) => log(botId, lvl, text),
    });

    await adapter.onMessage(async (msg) => {
      try {
        log(botId, "msg", `[${msg.isGroup ? "nhom" : "rieng"}] ${msg.senderName}: ${msg.text}`);
        await router.handleMessage(msg, adapter);
      } catch (err) {
        log(botId, "error", `xu ly tin nhan: ${err?.message || err}`);
      }
    });

    inst.adapter = adapter;
    inst.router = router;
    inst.status = "running";
    inst.startedAt = Date.now();
    inst.fbUid = adapter.botId;
    inst.fbName = adapter.selfName || null;
    log(botId, "info", `Dang nhap thanh cong: ${inst.fbName} (${adapter.botId})`);
    return { fbUid: adapter.botId, fbName: inst.fbName };
  } catch (err) {
    if (cancelled()) return { cancelled: true };
    inst.status = "error";
    inst.error = err?.message || String(err);
    log(botId, "error", `Dang nhap that bai: ${inst.error}`);
    throw err;
  }
}

function stop(botId) {
  const inst = get(botId);
  const was = inst.status;
  inst.gen++; // huy moi phien dang nhap dang do
  if (inst.adapter) {
    try {
      inst.adapter.stop();
    } catch (_) {}
  }
  inst.adapter = null;
  inst.router = null;
  inst.status = "stopped";
  inst.startedAt = null;
  if (was !== "stopped") log(botId, "info", "Da dung bot.");
}

function status(botId) {
  const inst = get(botId);
  return {
    status: inst.status,
    error: inst.error,
    fbUid: inst.fbUid,
    fbName: inst.fbName,
    uptimeSec: inst.startedAt ? Math.floor((Date.now() - inst.startedAt) / 1000) : 0,
    activeGames: inst.router ? inst.router.activeGames.size : 0,
  };
}

function logs(botId) {
  return get(botId).logs;
}

/** Xoa han bot khoi bo nho (khi xoa bot) */
function forget(botId) {
  stop(botId);
  instances.delete(botId);
}

function stopAll() {
  for (const id of instances.keys()) {
    try {
      stop(id);
    } catch (_) {}
  }
}

module.exports = { start, stop, status, logs, log, forget, stopAll, runningCount, MAX_CONCURRENT };
