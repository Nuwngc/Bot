/**
 * Nap cac lenh co san trong thu muc nay (moi file .js = mot lenh).
 * Cung giao dien voi module tai len bang panel (xem MODULE.md), them 2 truong:
 *   aliases: ["tx"]   -> ten goi tat
 *   group:   "game" | "tien-ich" | "giai-tri"  -> de nhom trong !help
 */

const fs = require("fs");
const path = require("path");

const SKIP = new Set(["index.js", "util.js"]);

function loadBuiltins(onLog = () => {}) {
  const out = new Map(); // command/alias -> module

  for (const file of fs.readdirSync(__dirname).sort()) {
    if (!file.endsWith(".js") || SKIP.has(file)) continue;
    try {
      const mod = require(path.join(__dirname, file));
      const command = String(mod.command || "").toLowerCase();
      if (!command) continue;
      const entry = {
        command,
        aliases: (mod.aliases || []).map((a) => String(a).toLowerCase()),
        group: mod.group || "tien-ich",
        kind: mod.kind === "game" ? "game" : "command",
        name: mod.name || command,
        description: mod.description || "",
        start: mod.start,
        run: mod.run,
        onEvent: mod.onEvent,
        file: "builtin/" + file,
      };
      for (const key of [command, ...entry.aliases]) out.set(key, entry);
    } catch (err) {
      onLog("error", `Lenh co san ${file} loi: ${err.message}`);
    }
  }
  return out;
}

module.exports = { loadBuiltins };
