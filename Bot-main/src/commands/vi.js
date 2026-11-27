/**
 * Tien ao: diem danh, lam viec, chuyen tien, xep hang.
 * Moi game cuoc (taixiu, baucua, dhbc) dung chung vi nay: ctx.store("vi"), khoa bal:<uid>.
 */

const { fmt, rand, pick } = require("./util");

const DAILY = 5000;
const WORK_MIN = 500;
const WORK_MAX = 2000;
const WORK_COOLDOWN = 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;

module.exports = {
  name: "Ví tiền",
  command: "vi",
  aliases: ["xu", "vitien"],
  group: "game",
  kind: "command",
  description: "Xem số dư. Kèm: daily, work, pay, top",

  async run(args, msg, adapter, ctx) {
    const bank = ctx.store("vi");
    const sub = (args[0] || "").toLowerCase();

    if (sub === "daily" || sub === "diemdanh") return daily(bank, msg, adapter);
    if (sub === "work" || sub === "lam") return work(bank, msg, adapter);
    if (sub === "pay" || sub === "chuyen") return pay(bank, args, msg, adapter, ctx);
    if (sub === "top" || sub === "bxh") return top(bank, msg, adapter);

    const bal = Number(bank.get("bal:" + msg.senderId, 0));
    return adapter.send(
      msg.threadId,
      `${msg.senderName}, số dư của bạn: ${fmt(bal)} xu.\n` +
        `${ctx.prefix}vi daily - điểm danh nhận ${fmt(DAILY)}\n` +
        `${ctx.prefix}vi work - làm việc kiếm xu\n` +
        `${ctx.prefix}vi pay @tag <số> - chuyển xu\n` +
        `${ctx.prefix}vi top - bảng xếp hạng`
    );
  },
};

async function daily(bank, msg, adapter) {
  const last = Number(bank.get("daily:" + msg.senderId, 0));
  const now = Date.now();
  if (now - last < DAY_MS) {
    const h = Math.ceil((DAY_MS - (now - last)) / 3600000);
    return adapter.send(msg.threadId, `Bạn đã điểm danh rồi. Quay lại sau ~${h} giờ.`);
  }
  bank.set("daily:" + msg.senderId, now);
  const bal = bank.add("bal:" + msg.senderId, DAILY);
  return adapter.send(msg.threadId, `${msg.senderName} điểm danh +${fmt(DAILY)} xu. Số dư: ${fmt(bal)}.`);
}

async function work(bank, msg, adapter) {
  const last = Number(bank.get("work:" + msg.senderId, 0));
  const now = Date.now();
  if (now - last < WORK_COOLDOWN) {
    const s = Math.ceil((WORK_COOLDOWN - (now - last)) / 1000);
    return adapter.send(msg.threadId, `Nghỉ mệt đã, ${s}s nữa hãy làm tiếp.`);
  }
  bank.set("work:" + msg.senderId, now);
  const earn = WORK_MIN + rand(WORK_MAX - WORK_MIN + 1);
  const bal = bank.add("bal:" + msg.senderId, earn);
  const job = pick(["giao hàng", "rửa bát", "code dạo", "chạy Grab", "bán trà đá"]);
  return adapter.send(msg.threadId, `${msg.senderName} đi ${job} kiếm được +${fmt(earn)} xu. Số dư: ${fmt(bal)}.`);
}

async function pay(bank, args, msg, adapter, ctx) {
  const targetId = msg.mentionedIds && msg.mentionedIds[0];
  const amount = Math.floor(Number(args.find((a) => /^\d+$/.test(a))));
  if (!targetId) return adapter.send(msg.threadId, `Tag người nhận: ${ctx.prefix}vi pay @tên <số>`);
  if (targetId === msg.senderId) return adapter.send(msg.threadId, "Không tự chuyển cho mình được.");
  if (!amount || amount <= 0) return adapter.send(msg.threadId, "Số xu không hợp lệ.");

  const bal = Number(bank.get("bal:" + msg.senderId, 0));
  if (bal < amount) return adapter.send(msg.threadId, `Bạn chỉ có ${fmt(bal)} xu.`);

  bank.add("bal:" + msg.senderId, -amount);
  bank.add("bal:" + targetId, amount);
  const toName = await adapter.getName(targetId);
  return adapter.send(msg.threadId, `${msg.senderName} đã chuyển ${fmt(amount)} xu cho ${toName}.`);
}

async function top(bank, msg, adapter) {
  const rows = Object.entries(bank.all())
    .filter(([k]) => k.startsWith("bal:"))
    .map(([k, v]) => [k.slice(4), Number(v)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (rows.length === 0) return adapter.send(msg.threadId, "Chưa ai có xu.");
  const names = await Promise.all(rows.map(([id]) => adapter.getName(id)));
  const text = rows.map(([, v], i) => `${i + 1}. ${names[i]}: ${fmt(v)} xu`).join("\n");
  return adapter.send(msg.threadId, "BẢNG XẾP HẠNG GIÀU\n" + text);
}
