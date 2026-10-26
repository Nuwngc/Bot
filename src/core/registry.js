/**
 * Nap cac module da bat vao mot bot.
 *
 * Moi lan bot khoi dong se doc lai tu dia, nen sau khi up module moi
 * chi can tat roi bat lai bot la co hieu luc.
 */

const path = require("path");
const fs = require("fs");
const { q } = require("../../server/db");

const MODULES_DIR =
  process.env.MODULES_DIR || path.join(__dirname, "..", "..", "data", "modules");

function loadModules(onLog = () => {}) {
  const out = new Map(); // command -> { kind, command, name, description, start|run }

  for (const row of q.enabledModules.all()) {
    const file = path.join(MODULES_DIR, row.name);
    if (!fs.existsSync(file)) {
      onLog("error", `Module ${row.name}: khong tim thay file`);
      continue;
    }
    try {
      delete require.cache[require.resolve(file)];
      const mod = require(file);
      const command = String(mod.command || "").toLowerCase();
      const key = command || "__event_" + row.name;

      out.set(key, {
        command,
        kind: mod.kind === "command" ? "command" : "game",
        name: mod.name || command || row.name,
        description: mod.description || "",
        start: mod.start,
        run: mod.run,
        onEvent: mod.onEvent,
        file: row.name,
      });
      onLog("info", `Nap module ${row.name}${command ? " (lenh " + command + ")" : " (su kien)"}`);
    } catch (err) {
      onLog("error", `Module ${row.name} loi: ${err.message}`);
      try {
        q.setModuleError.run(err.message, row.name);
      } catch (_) {}
    }
  }

  return out;
}

module.exports = { loadModules, MODULES_DIR };
