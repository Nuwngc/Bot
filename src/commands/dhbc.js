/**
 * Đuổi hình bắt chữ. Bot gửi ảnh + số chữ, ai gõ đúng đáp án trước thì được thưởng xu
 * (cộng vào ví chung "vi") và 1 điểm xếp hạng.
 *
 *   !dhbc          bắt đầu chơi
 *   !dhbc top      bảng xếp hạng
 *   !dhbc goiy     xem gợi ý      !dhbc boqua  bỏ qua câu này     !stop  kết thúc
 */

const QUESTIONS = require("../data/dhbc.json");
const { fmt, pick, plain } = require("./util");

const REWARD = 1000;
const QUESTION_MS = 60 * 1000;
const MAX_IDLE = 3; // so cau lien tiep khong ai tra loi thi tu dung

module.exports = {
  name: "Đuổi hình bắt chữ",
  command: "dhbc",
  group: "game",
  kind: "game",
  description: "Đoán chữ qua hình, thắng nhận xu. Kèm: top, goiy, boqua",

  start(msg, adapter, ctx) {
    const sub = (msg.text.trim().split(/\s+/)[1] || "").toLowerCase();
    const scores = ctx.store("dhbc");
    const bank = ctx.store("vi");

    if (sub === "top" || sub === "bxh") {
      showTop(scores, msg, adapter);
      ctx.onEnd(); // khong giu van nao
      return null;
    }

    const used = new Set();
    let current = null;
    let n = 0;
    let idle = 0;
    let timer = null;
    let finished = false;

    async function ask(ad) {
      if (finished) return;
      const pool = QUESTIONS.filter((q) => !used.has(q.answer));
      if (pool.length === 0) used.clear();
      current = pick(pool.length ? pool : QUESTIONS);
      used.add(current.answer);
      n++;

      await ad.send(
        msg.threadId,
        `ĐUỔI HÌNH BẮT CHỮ - Câu ${n}\n` +
          `${current.mask || ""}\n` +
          `Gõ đáp án để trả lời (${REWARD} xu cho người đúng đầu tiên).\n` +
          `${ctx.prefix}dhbc goiy | ${ctx.prefix}dhbc boqua | ${ctx.prefix}stop`
      );
      for (const url of current.images) {
        try {
          if (typeof ad.sendImage !== "function") throw new Error("khong ho tro gui anh");
          await ad.sendImage(msg.threadId, url);
        } catch (_) {
          await ad.send(msg.threadId, url); // anh loi/het han -> gui link
        }
      }
      arm(ad);
    }

    function arm(ad) {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (finished) return;
        idle++;
        await ad.send(msg.threadId, `Hết giờ! Đáp án: ${current.answer.toUpperCase()}`);
        if (idle >= MAX_IDLE) {
          await ad.send(msg.threadId, "Không ai trả lời nên mình dừng game nhé.");
          return finish();
        }
        ask(ad);
      }, QUESTION_MS);
    }

    function finish() {
      if (finished) return Promise.resolve();
      finished = true;
      clearTimeout(timer);
      ctx.onEnd();
      return Promise.resolve();
    }

    const game = {
      name: "dhbc",

      async handle(m, ad) {
        if (finished || !current) return false;
        if (plain(m.text) !== plain(current.answer)) return false;

        idle = 0;
        clearTimeout(timer);
        const bal = bank.add("bal:" + m.senderId, REWARD);
        const pts = scores.add("score:" + m.senderId, 1);
        scores.set("name:" + m.senderId, m.senderName);
        await ad.send(
          m.threadId,
          `✅ ${m.senderName} đúng rồi! Đáp án: ${current.answer.toUpperCase()}\n` +
            `+${fmt(REWARD)} xu (số dư ${fmt(bal)}), tổng ${pts} câu đúng.`,
          { replyTo: m.messageId }
        );
        await ask(ad);
        return true;
      },

      async command(cmd, args, m, ad) {
        const act = cmd === "dhbc" ? (args[0] || "").toLowerCase() : cmd;
        if (act === "goiy") {
          await ad.send(m.threadId, `Gợi ý: ${current.hint || current.mask}`);
          return true;
        }
        if (act === "boqua") {
          clearTimeout(timer);
          await ad.send(m.threadId, `Bỏ qua. Đáp án: ${current.answer.toUpperCase()}`);
          await ask(ad);
          return true;
        }
        if (cmd === "dhbc" && (act === "top" || act === "bxh")) {
          await showTop(scores, m, ad);
          return true;
        }
        if (cmd === "dhbc") {
          await ad.send(m.threadId, "Đang có một ván rồi. Gõ đáp án, hoặc " + ctx.prefix + "stop để dừng.");
          return true;
        }
        return false;
      },

      async stop(ad) {
        await ad.send(msg.threadId, `Đã dừng. Câu đang dở: ${current ? current.answer.toUpperCase() : "-"}`);
        return finish();
      },
    };

    ask(adapter);
    return game;
  },
};

async function showTop(scores, msg, adapter) {
  const rows = Object.entries(scores.all())
    .filter(([k]) => k.startsWith("score:"))
    .map(([k, v]) => [k.slice(6), Number(v)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (rows.length === 0) return adapter.send(msg.threadId, "Chưa có ai trả lời đúng câu nào.");
  const all = scores.all();
  const text = rows
    .map(([id, v], i) => `${i + 1}. ${all["name:" + id] || id}: ${v} câu`)
    .join("\n");
  return adapter.send(msg.threadId, "BẢNG XẾP HẠNG ĐUỔI HÌNH BẮT CHỮ\n" + text);
}
