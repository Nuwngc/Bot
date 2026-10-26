const { startNoiTu } = require("../games/noitu");
const { startMaSoi } = require("../games/masoi");
const { createAI } = require("../ai/reply");
const { loadModules } = require("./registry");
const { makeStore } = require("./store");

/**
 * Moi bot co router rieng -> state game khong lan sang bot khac.
 */
function createRouter({ prefix = "!", aiKey, aiModel, aiSystem, ownerId = 0, onLog = () => {} }) {
  const PREFIX = prefix;
  const activeGames = new Map();  // threadId -> game
  const dmRoutes = new Map();     // userId -> game (hanh dong dem ma soi)
  const aiReply = createAI({ apiKey: aiKey, model: aiModel, systemPrompt: aiSystem, onLog });
  const modules = loadModules(onLog);

  const HELP = `Danh sach lenh:
${PREFIX}noitu   - choi noi tu voi bot
${PREFIX}masoi   - mo phong cho ma soi
${PREFIX}join    - vao phong ma soi
${PREFIX}start   - bat dau van
${PREFIX}vote <so> - bo phieu treo co
${PREFIX}stop    - dung game dang chay
${PREFIX}help    - xem lenh

Tag bot trong tin nhan bat ky de hoi AI.`;

  function helpText() {
    if (modules.size === 0) return HELP;
    const extra = [...modules.values()]
      .filter((m) => m.command)
      .map((m) => `${PREFIX}${m.command}${m.description ? " - " + m.description : ""}`)
      .join("\n");
    return extra ? `${HELP}\n\nModule them:\n${extra}` : HELP;
  }

  async function handleMessage(msg, adapter) {
    // Su kien vao/ra nhom -> chuyen cho cac module co dang ky onEvent
    if (msg.isEvent) {
      for (const mod of modules.values()) {
        if (typeof mod.onEvent === "function") {
          try {
            await mod.onEvent(msg, adapter, moduleCtx());
          } catch (err) {
            onLog("error", `Module ${mod.file} onEvent: ${err?.message || err}`);
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

      case "noitu": {
        if (running) return adapter.send(msg.threadId, `Dang co game khac chay. Go ${PREFIX}stop truoc.`);
        activeGames.set(msg.threadId, startNoiTu(msg, adapter, {
          prefix: PREFIX,
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
      onLog("error", `Module ${mod.file}: ${err?.message || err}`);
      return adapter.send(msg.threadId, `Module "${mod.command}" bi loi.`);
    }
  }

  return { handleMessage, activeGames, dmRoutes, modules };
}

module.exports = { createRouter };
