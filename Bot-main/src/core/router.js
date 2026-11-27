const { startNoiTu, checkWord, addWord, delWord, leaderboardText } = require("../games/noitu");
const { loadBuiltins } = require("../commands");
const { startMaSoi } = require("../games/masoi");
const { createAI } = require("../ai/reply");
const { makeStore } = require("./store");

/**
 * Moi bot co router rieng -> state game khong lan sang bot khac.
 */
function createRouter({ prefix = "!", aiKey, aiModel, aiSystem, ownerId = 0, onLog = () => {} }) {
  const PREFIX = prefix;
  const activeGames = new Map();  // threadId -> game
  const dmRoutes = new Map();     // userId -> game (hanh dong dem ma soi)
  const aiReply = createAI({ apiKey: aiKey, model: aiModel, systemPrompt: aiSystem, onLog });
  const modules = new Map();
  for (const [key, mod] of loadBuiltins(onLog)) modules.set(key, mod);

  // Admin cua bot: FB user id trong BOT_ADMINS (cach nhau dau phay) hoac store "settings" key "admins"
  function isAdmin(userId) {
    const fromEnv = (process.env.BOT_ADMINS || "").split(",").map((x) => x.trim()).filter(Boolean);
    const fromStore = makeStore(ownerId, "settings").get("admins", []);
    return [...fromEnv, ...fromStore].map(String).includes(String(userId));
  }

  const HELP = `Danh sach lenh:
${PREFIX}noitu   - choi noi tu voi bot (kem: bxh, check <tu>)
${PREFIX}masoi   - mo phong cho ma soi
${PREFIX}join    - vao phong ma soi
${PREFIX}start   - bat dau van
${PREFIX}vote <so> - bo phieu treo co
${PREFIX}stop    - dung game dang chay
${PREFIX}help    - xem lenh

Tag bot trong tin nhan bat ky de hoi AI.`;

  const GROUPS = [
    ["game", "Game & xu"],
    ["tien-ich", "Tien ich"],
    ["giai-tri", "Giai tri"],
  ];

  function helpText() {
    if (modules.size === 0) return HELP;
    const seen = new Set();
    const byGroup = new Map();
    const others = [];
    for (const m of modules.values()) {
      if (!m.command || seen.has(m)) continue;
      seen.add(m);
      const line = `${PREFIX}${m.command}${m.description ? " - " + m.description : ""}`;
      if (m.group) {
        if (!byGroup.has(m.group)) byGroup.set(m.group, []);
        byGroup.get(m.group).push(line);
      } else {
        others.push(line);
      }
    }
    const parts = [HELP];
    for (const [key, title] of GROUPS) {
      if (byGroup.has(key)) parts.push(`${title}:\n${byGroup.get(key).join("\n")}`);
    }
    if (others.length) parts.push(`Module them:\n${others.join("\n")}`);
    return parts.join("\n\n");
  }

  async function handleMessage(msg, adapter) {
    // Su kien vao/ra nhom -> chuyen cho cac module co dang ky onEvent
    if (msg.isEvent) {
      for (const mod of modules.values()) {
        if (typeof mod.onEvent === "function") {
          try {
            await mod.onEvent(msg, adapter, moduleCtx());
          } catch (err) {
            onLog("error", `Lenh ${mod.file} onEvent: ${err?.message || err}`);
          }
        }
      }
      return;
    }

    if (!msg.isGroup && dmRoutes.has(msg.senderId)) {
      const game = dmRoutes.get(msg.senderId);
      if (await game.handleDM(msg, adapter)) return;
    }

    const isCommand = msg.text.startsWith(PREFIX);
    const game = activeGames.get(msg.threadId);
    if (game && !isCommand) {
      if (await game.handle(msg, adapter)) return;
    }

    if (isCommand) {
      const [cmd, ...args] = msg.text.slice(PREFIX.length).trim().split(/\s+/);
      return runCommand(cmd.toLowerCase(), args, msg, adapter);
    }

    if (msg.mentionsBot) {
      const answer = await aiReply(msg);
      return adapter.send(msg.threadId, answer, { replyTo: msg.messageId });
    }
  }

  async function runCommand(cmd, args, msg, adapter) {
    const running = activeGames.get(msg.threadId);

    switch (cmd) {
      case "help":
        return adapter.send(msg.threadId, helpText());

      case "stop":
        if (!running) return adapter.send(msg.threadId, "Khong co game nao dang chay.");
        return running.stop(adapter);

      case "nt":
      case "noitu": {
        const sub = (args[0] || "").toLowerCase();
        const ntStore = makeStore(ownerId, "noitu");

        if (sub === "bxh" || sub === "top") {
          return adapter.send(msg.threadId, await leaderboardText(ntStore));
        }
        if (sub === "check") {
          const w = args.slice(1).join(" ");
          if (!w) return adapter.send(msg.threadId, `Cu phap: ${PREFIX}noitu check <tu>`);
          try {
            return adapter.send(msg.threadId, checkWord(w) ? `"${w}" co trong tu dien.` : `"${w}" khong co trong tu dien.`);
          } catch (err) {
            return adapter.send(msg.threadId, err.message);
          }
        }
        if (sub === "add" || sub === "del") {
          if (!isAdmin(msg.senderId)) return adapter.send(msg.threadId, "Chi admin bot moi them/xoa tu duoc.");
          const w = args.slice(1).join(" ");
          if (!w) return adapter.send(msg.threadId, `Cu phap: ${PREFIX}noitu ${sub} <tu>`);
          try {
            const r = sub === "add" ? addWord(w) : delWord(w);
            return adapter.send(msg.threadId, r.ok ? `Da ${sub === "add" ? "them" : "xoa"} "${r.word}".` : r.reason);
          } catch (err) {
            return adapter.send(msg.threadId, err.message);
          }
        }

        if (running) return adapter.send(msg.threadId, `Dang co game khac chay. Go ${PREFIX}stop truoc.`);
        activeGames.set(msg.threadId, startNoiTu(msg, adapter, {
          prefix: PREFIX,
          store: ntStore,
          onEnd: () => activeGames.delete(msg.threadId),
        }));
        return;
      }

      case "masoi": {
        if (!msg.isGroup) return adapter.send(msg.threadId, "Ma soi chi choi duoc trong nhom.");
        if (running) return adapter.send(msg.threadId, `Dang co game khac chay. Go ${PREFIX}stop truoc.`);
        activeGames.set(msg.threadId, startMaSoi(msg, adapter, {
          prefix: PREFIX,
          dmRoutes,
          onEnd: () => activeGames.delete(msg.threadId),
        }));
        return;
      }

      default: {
        // Uu tien game dang chay (vd !vote cua ma soi)
        if (running && typeof running.command === "function") {
          if (await running.command(cmd, args, msg, adapter)) return;
        }

        const mod = modules.get(cmd);
        if (mod) return runModule(mod, args, msg, adapter, running);

        return adapter.send(msg.threadId, `Khong ro lenh "${cmd}". Go ${PREFIX}help.`);
      }
    }
  }

  /** Moi truong ma module nhan duoc - co chu dinh giu toi thieu */
  function moduleCtx() {
    return {
      prefix: PREFIX,
      isAdmin,
      ai: (text) => aiReply({ ...text }),
      registerDM: (userId, game) => dmRoutes.set(userId, game),
      unregisterDM: (userId) => dmRoutes.delete(userId),
      // Kho luu tru rieng cho tung module (tien ao, cai dat nhom...)
      store: (ns) => makeStore(ownerId, String(ns || "default")),
    };
  }

  async function runModule(mod, args, msg, adapter, running) {
    try {
      if (mod.kind === "command") {
        return await mod.run(args, msg, adapter, moduleCtx());
      }
      if (running) {
        return adapter.send(msg.threadId, `Dang co game khac chay. Go ${PREFIX}stop truoc.`);
      }
      const game = await mod.start(msg, adapter, {
        ...moduleCtx(),
        onEnd: () => activeGames.delete(msg.threadId),
      });
      if (game && typeof game.handle === "function") {
        activeGames.set(msg.threadId, game);
      }
    } catch (err) {
      onLog("error", `Lenh ${mod.file}: ${err?.message || err}`);
      return adapter.send(msg.threadId, `Module "${mod.command}" bi loi.`);
    }
  }

  return { handleMessage, activeGames, dmRoutes, modules };
}

module.exports = { createRouter };
