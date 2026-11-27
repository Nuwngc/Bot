const fs = require("fs");
const path = require("path");

const DICT_PATH =
  process.env.DICT_PATH || path.join(__dirname, "..", "data", "tudien.txt");

const TURN_TIMEOUT_MS = Number(process.env.NOITU_TIMEOUT || 60) * 1000;

/* ---------- Tu dien ---------- */

let WORDS = null;   // Set cac tu hop le
let INDEX = null;   // am tiet dau -> [tu]

function norm(s) {
  return s
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadDict() {
  if (WORDS) return;
  WORDS = new Set();
  INDEX = new Map();

  if (!fs.existsSync(DICT_PATH)) {
    throw new Error(
      `Khong tim thay tu dien tai ${DICT_PATH}. Xem README muc "Tu dien noi tu".`
    );
  }

  const lines = fs.readFileSync(DICT_PATH, "utf8").split("\n");
  for (const line of lines) {
    const w = norm(line);
    const parts = w.split(" ");
    if (parts.length !== 2) continue; // chi nhan tu 2 am tiet
    WORDS.add(w);
    if (!INDEX.has(parts[0])) INDEX.set(parts[0], []);
    INDEX.get(parts[0]).push(w);
  }

  console.log(`[noitu] Da nap ${WORDS.size} tu.`);
}

/* ---------- Tien ich cho lenh noitu bxh / check / add / del ---------- */

function checkWord(raw) {
  loadDict();
  return WORDS.has(norm(raw));
}

function addWord(raw) {
  loadDict();
  const w = norm(raw);
  const parts = w.split(" ");
  if (parts.length !== 2) return { ok: false, reason: "Chi nhan tu co dung 2 am tiet." };
  if (WORDS.has(w)) return { ok: false, reason: `"${w}" da co trong tu dien.` };
  fs.appendFileSync(DICT_PATH, "\n" + w);
  WORDS.add(w);
  if (!INDEX.has(parts[0])) INDEX.set(parts[0], []);
  INDEX.get(parts[0]).push(w);
  return { ok: true, word: w };
}

function delWord(raw) {
  loadDict();
  const w = norm(raw);
  if (!WORDS.has(w)) return { ok: false, reason: `"${w}" khong co trong tu dien.` };
  const kept = fs.readFileSync(DICT_PATH, "utf8").split("\n").filter((line) => norm(line) !== w);
  fs.writeFileSync(DICT_PATH, kept.join("\n"));
  WORDS.delete(w);
  const list = INDEX.get(w.split(" ")[0]) || [];
  INDEX.set(w.split(" ")[0], list.filter((x) => x !== w));
  return { ok: true, word: w };
}

/** Ghi nhan thanh tich: field = "words" (tu dung dung) | "wins" (thang bot) */
function record(store, userId, name, field) {
  if (!store) return;
  store.add(`${field}:${userId}`, 1);
  store.set(`name:${userId}`, name);
}

async function leaderboardText(store) {
  const all = store ? store.all() : {};
  const ids = new Set(
    Object.keys(all).filter((k) => k.startsWith("wins:") || k.startsWith("words:")).map((k) => k.split(":")[1])
  );
  const rows = [...ids]
    .map((id) => ({ id, wins: Number(all["wins:" + id] || 0), words: Number(all["words:" + id] || 0), name: all["name:" + id] || id }))
    .sort((a, b) => b.wins - a.wins || b.words - a.words)
    .slice(0, 10);
  if (!rows.length) return "Chua co ai tren bang xep hang noi tu.";
  return "BANG XEP HANG NOI TU\n" + rows.map((r, i) => `${i + 1}. ${r.name}: ${r.wins} thang, ${r.words} tu`).join("\n");
}

function firstSyl(w) { return w.split(" ")[0]; }
function lastSyl(w)  { return w.split(" ")[1]; }

function pickWord(startSyl, used) {
  const pool = (INDEX.get(startSyl) || []).filter((w) => !used.has(w));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function randomStart(used) {
  const keys = [...INDEX.keys()];
  for (let i = 0; i < 50; i++) {
    const k = keys[Math.floor(Math.random() * keys.length)];
    const w = pickWord(k, used);
    if (w) return w;
  }
  return null;
}

/* ---------- Game ---------- */

function startNoiTu(msg, adapter, { onEnd, prefix = "!", store = null }) {
  loadDict();

  const used = new Set();
  let current = randomStart(used);
  used.add(current);

  let timer = null;
  let finished = false;
  let turns = 0;

  const game = {
    name: "noitu",

    async handle(m, ad) {
      if (finished) return false;
      const w = norm(m.text);

      // Chi bat tin nhan trong khung "2 am tiet" - con lai bo qua de nhom van chat binh thuong
      if (w.split(" ").length !== 2) return false;

      if (firstSyl(w) !== lastSyl(current)) {
        await ad.send(
          m.threadId,
          `"${w}" khong bat dau bang "${lastSyl(current)}". Thu lai.`,
          { replyTo: m.messageId }
        );
        return true;
      }
      if (used.has(w)) {
        await ad.send(m.threadId, `"${w}" da dung roi. Thu tu khac.`, {
          replyTo: m.messageId,
        });
        return true;
      }
      if (!WORDS.has(w)) {
        await ad.send(m.threadId, `Khong tim thay "${w}" trong tu dien.`, {
          replyTo: m.messageId,
        });
        return true;
      }

      // Tu nguoi choi hop le
      record(store, m.senderId, m.senderName, "words");
      used.add(w);
      current = w;
      turns++;
      clearTimeout(timer);

      const botWord = pickWord(lastSyl(w), used);
      if (!botWord) {
        await ad.send(
          m.threadId,
          `Bot chiu, khong nghi ra tu nao bat dau bang "${lastSyl(w)}".\n` +
            `${m.senderName} thang sau ${turns} luot!`
        );
        record(store, m.senderId, m.senderName, "wins");
        return finish(ad);
      }

      used.add(botWord);
      current = botWord;
      await ad.send(m.threadId, `${botWord}  ->  "${lastSyl(botWord)}..."`);
      armTimer(ad, m.threadId);
      return true;
    },

    async command(cmd, args, m, ad) {
      if (cmd === "bo" || cmd === "surrender") {
        await ad.send(m.threadId, `Ket thuc. Tong cong ${turns} luot.`);
        return finish(ad).then(() => true);
      }
      return false;
    },

    async stop(ad) {
      await ad.send(msg.threadId, "Da dung noi tu.");
      return finish(ad);
    },
  };

  function armTimer(ad, threadId) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (finished) return;
      await ad.send(threadId, `Het gio! Bot thang sau ${turns} luot.`);
      finish(ad);
    }, TURN_TIMEOUT_MS);
  }

  function finish() {
    if (finished) return Promise.resolve();
    finished = true;
    clearTimeout(timer);
    onEnd();
    return Promise.resolve();
  }

  adapter
    .send(
      msg.threadId,
      `NOI TU bat dau!\n` +
        `Luat: tu 2 am tiet, am tiet dau phai trung am tiet cuoi cua tu truoc.\n` +
        `Moi luot ${TURN_TIMEOUT_MS / 1000}s.\n\n` +
        `${current}  ->  "${lastSyl(current)}..."`
    )
    .then(() => armTimer(adapter, msg.threadId));

  return game;
}

module.exports = { startNoiTu, checkWord, addWord, delWord, leaderboardText };
