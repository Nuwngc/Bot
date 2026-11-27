/**
 * Bo dem log trong bo nho (500 dong gan nhat) de app admin xem log may chu ma khong can vao Render.
 * Boc console.log / info / warn / error, van in ra nhu cu. Che cac gia tri nhay cam (api=..., token=..., password=...).
 */
const MAX = 500;
const lines = [];
let seq = 0;

const SECRET = /\b(api|apikey|api_key|key|token|secret|password|pass|cookie|authorization)(["']?\s*[:=]\s*["']?)([^\s&"',;]{4,})/gi;
const redact = (s) => s.replace(SECRET, (_, k, sep) => `${k}${sep}***`);

function fmt(args) {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.stack || a.message;
      try { return JSON.stringify(a); } catch (_) { return String(a); }
    })
    .join(" ");
}

function push(lvl, args) {
  const msg = redact(fmt(args)).slice(0, 2000);
  lines.push({ seq: ++seq, t: Date.now(), lvl, msg });
  if (lines.length > MAX) lines.splice(0, lines.length - MAX);
}

if (!global.__logbufInstalled) {
  global.__logbufInstalled = true;
  for (const [fn, lvl] of [["log", "info"], ["info", "info"], ["warn", "warn"], ["error", "error"]]) {
    const orig = console[fn].bind(console);
    console[fn] = (...args) => {
      try { push(lvl, args); } catch (_) {}
      orig(...args);
    };
  }
}

/** Lay cac dong co seq > after (toi da limit dong cuoi), co the loc theo muc */
function since(after = 0, limit = 300, lvl = "") {
  let out = lines.filter((l) => l.seq > after);
  if (lvl) out = out.filter((l) => l.lvl === lvl);
  return { lines: out.slice(-limit), last: seq };
}

module.exports = { since, push, redact };
