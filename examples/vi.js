/**
 * Tien ao co ban: diem danh, lam viec, so du, chuyen tien.
 * Dung ctx.store de luu so du theo tung nguoi.
 *
 * Cac module game (taixiu, slot...) dung chung kho "vi" nay bang cach
 * cung goi ctx.store("vi").
 */

const DAILY = 5000;
const WORK_MIN = 500;
const WORK_MAX = 2000;
const WORK_COOLDOWN = 60 * 1000; // 60 giay
const DAY_MS = 24 * 3600 * 1000;

function vi(ctx) {
  return ctx.store("vi");
}

module.exports = {
  name: "Tiền ảo",
  command: "vi",
  kind: "command",
  description: "Xem số dư. Kèm: daily, work, pay",

  async run(args, msg, adapter, ctx) {
    const bank = vi(ctx);
    const sub = (args[0] || "").toLowerCase();

    if (sub === "daily") return daily(bank, msg, adapter);
    if (sub === "work") return work(bank, msg, adapter);
    if (sub === "pay") return pay(bank, args, msg, adapter);
    if (sub === "top") return top(bank, msg, adapter);

    const bal = Number(bank.get("bal:" + msg.senderId, 0));
    return adapter.send(
      msg.threadId,
      `${msg.senderName}, số dư của bạn: ${format(bal)} xu.\n` +
        `${ctx.prefix}vi daily - điểm danh nhận ${format(DAILY)}\n` +
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
  return adapter.send(msg.threadId, `${msg.senderName} điểm danh +${format(DAILY)} xu. Số dư: ${format(bal)}.`);
}

async function work(bank, msg, adapter) {
  const last = Number(bank.get("work:" + msg.senderId, 0));
  const now = Date.now();
  if (now - last < WORK_COOLDOWN) {
    const s = Math.ceil((WORK_COOLDOWN - (now - last)) / 1000);
    return adapter.send(msg.threadId, `Nghỉ mệt đã, ${s}s nữa hãy làm tiếp.`);
  }
  bank.set("work:" + msg.senderId, now);
  const earn = WORK_MIN + Math.floor(Math.random() * (WORK_MAX - WORK_MIN + 1));
  const bal = bank.add("bal:" + msg.senderId, earn);
  const jobs = ["giao hàng", "rửa bát", "code dạo", "chạy Grab", "bán trà đá"];
  const job = jobs[Math.floor(Math.random() * jobs.length)];
  return adapter.send(msg.threadId, `${msg.senderName} đi ${job} kiếm được +${format(earn)} xu. Số dư: ${format(bal)}.`);
}

async function pay(bank, args, msg, adapter) {
  const targetId = msg.mentionedIds && msg.mentionedIds[0];
  const amount = Math.floor(Number(args.find((a) => /^\d+$/.test(a))));
  if (!targetId) return adapter.send(msg.threadId, "Tag người nhận: !vi pay @tên <số>");
  if (targetId === msg.senderId) return adapter.send(msg.threadId, "Không tự chuyển cho mình được.");
  if (!amount || amount <= 0) return adapter.send(msg.threadId, "Số xu không hợp lệ.");

  const bal = Number(bank.get("bal:" + msg.senderId, 0));
  if (bal < amount) return adapter.send(msg.threadId, `Bạn chỉ có ${format(bal)} xu.`);

  bank.add("bal:" + msg.senderId, -amount);
  bank.add("bal:" + targetId, amount);
  const toName = await adapter.getName(targetId);
  return adapter.send(msg.threadId, `${msg.senderName} đã chuyển ${format(amount)} xu cho ${toName}.`);
}

async function top(bank, msg, adapter) {
  const all = bank.all();
  const rows = Object.entries(all)
    .filter(([k]) => k.startsWith("bal:"))
    .map(([k, v]) => [k.slice(4), Number(v)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (rows.length === 0) return adapter.send(msg.threadId, "Chưa ai có xu.");
  const names = await Promise.all(rows.map(([id]) => adapter.getName(id)));
  const text = rows.map(([, v], i) => `${i + 1}. ${names[i]}: ${format(v)} xu`).join("\n");
  return adapter.send(msg.threadId, "BẢNG XẾP HẠNG GIÀU\n" + text);
}

function format(n) {
  return Number(n).toLocaleString("vi-VN");
}
