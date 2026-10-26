/**
 * Quan ly module do admin tai len.
 *
 * ===================== CANH BAO BAO MAT =====================
 * Mot file .js tai len se duoc CHAY TREN SERVER. Ai up duoc module
 * thi coi nhu co quyen tuong duong chu server: doc bien moi truong,
 * doc database, lay cookie Facebook cua moi nguoi thue.
 *
 * Vi vay: CHI ADMIN duoc tai module len. Khong bao gio mo quyen nay
 * cho nguoi thue bot.
 *
 * Bo loc ben duoi chan cac cach truy cap he thong pho bien, nhung no
 * la LOP CHONG NHAM LAN, khong phai hang rao an toan that su. Nguoi
 * co chu dich van co cach lach. Luon doc qua code truoc khi up.
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const { q } = require("./db");

const MODULES_DIR = process.env.MODULES_DIR || path.join(__dirname, "..", "data", "modules");
fs.mkdirSync(MODULES_DIR, { recursive: true });

const MAX_SIZE = 200 * 1024; // 200KB

/** Cac mau bi chan, kem ly do de bao loi cho ro */
const BLOCKED = [
  [/\brequire\s*\(/, "require() - module khong duoc nap thu vien ngoai"],
  [/\bimport\s*\(/, "import() dong"],
  [/\bprocess\b/, "process - khong duoc doc bien moi truong"],
  [/\beval\s*\(/, "eval()"],
  [/\bnew\s+Function\s*\(/, "new Function()"],
  [/\bglobalThis\b/, "globalThis"],
  [/\bchild_process\b/, "child_process"],
  [/\.constructor\s*\.\s*constructor\b/, "truy cap constructor long nhau"],
  [/\b__dirname\b|\b__filename\b/, "duong dan he thong"],
];

/**
 * Bo chu thich va noi dung chuoi truoc khi quet, neu khong thi mot module
 * chi nhac den "process" trong phan huong dan cung bi chan oan.
 */
function stripNonCode(src) {
  let out = "";
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];
    const next = src[i + 1];

    // chu thich mot dong
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    // chu thich nhieu dong
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    // chuoi
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") i++;
        i++;
      }
      i++;
      out += " ";
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function screen(code) {
  const stripped = stripNonCode(code);
  const problems = [];
  for (const [re, why] of BLOCKED) {
    if (re.test(stripped)) problems.push(why);
  }
  return problems;
}

function safeName(name) {
  const base = path.basename(String(name || "").trim());
  if (!/^[a-z0-9_-]{1,40}\.js$/i.test(base)) return null;
  return base.toLowerCase();
}

/** Nap thu file de kiem tra hinh dang, roi go khoi cache */
function loadAndValidate(filePath) {
  delete require.cache[require.resolve(filePath)];
  let mod;
  try {
    mod = require(filePath);
  } catch (err) {
    throw new Error(`Code loi khi nap: ${err.message}`);
  } finally {
    delete require.cache[require.resolve(filePath)];
  }

  if (!mod || typeof mod !== "object") throw new Error("Phai module.exports mot object");

  const kind = mod.kind === "command" ? "command" : "game";
  const command = String(mod.command || "").trim().toLowerCase();

  const eventOnly = !command && typeof mod.onEvent === "function";
  if (!eventOnly && !/^[a-z0-9]{2,20}$/.test(command)) {
    throw new Error("Thieu 'command' hoac sai dinh dang (2-20 ky tu chu/so thuong)");
  }
  if (["help", "stop", "noitu", "masoi", "join", "start", "vote"].includes(command)) {
    throw new Error(`Lenh "${command}" da duoc he thong dung`);
  }
  if (kind === "game" && typeof mod.start !== "function") {
    throw new Error("Module kieu game phai co ham start(msg, adapter, ctx)");
  }
  if (kind === "command" && typeof mod.run !== "function" && typeof mod.onEvent !== "function") {
    throw new Error("Module kieu command phai co ham run(...) hoac onEvent(...)");
  }

  return {
    kind,
    command,
    name: String(mod.name || command).slice(0, 60),
    description: String(mod.description || "").slice(0, 200),
  };
}

/**
 * Luu module moi.
 * @returns thong tin da trich xuat
 */
function save({ fileName, code, userId }) {
  const name = safeName(fileName);
  if (!name) throw new Error("Ten file phai dang ten-module.js (chu thuong, so, _ hoac -)");
  if (typeof code !== "string" || !code.trim()) throw new Error("File rong");
  if (Buffer.byteLength(code, "utf8") > MAX_SIZE) throw new Error("File qua 200KB");

  const problems = screen(code);
  if (problems.length) {
    throw new Error("Module dung thu bi chan: " + problems.join("; "));
  }

  const target = path.join(MODULES_DIR, name);
  const backup = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;

  fs.writeFileSync(target, code, "utf8");
  try {
    const meta = loadAndValidate(target);

    // Khong cho hai module trung lenh
    const clash = q.allModules
      .all()
      .find((m) => m.command === meta.command && m.name !== name);
    if (clash) throw new Error(`Lenh "${meta.command}" da duoc module ${clash.name} dung`);

    q.upsertModule.run(name, meta.command, meta.kind, meta.description, userId);
    return { name, ...meta };
  } catch (err) {
    // Hoan lai neu file moi hong
    if (backup === null) fs.unlinkSync(target);
    else fs.writeFileSync(target, backup, "utf8");
    throw err;
  }
}

function remove(id) {
  const row = q.allModules.all().find((m) => m.id === id);
  if (!row) throw new Error("Khong tim thay module");
  const p = path.join(MODULES_DIR, row.name);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  q.deleteModule.run(id);
  return row.name;
}

function readCode(name) {
  const safe = safeName(name);
  const p = safe && path.join(MODULES_DIR, safe);
  if (!p || !fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

module.exports = { save, remove, readCode, loadAndValidate, MODULES_DIR };
