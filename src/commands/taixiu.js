/**
 * Tài xỉu: cược xu bằng 3 xúc xắc. Dùng chung ví với lệnh "vi".
 * Tài = tổng 11-17, Xỉu = tổng 4-10, thắng ăn 1 lần tiền cược.
 * Số tiền: 1000, 5k, 2m, 50%, all.
 */

const { fmt, rand, plain, parseAmount } = require("./util");

const MIN_BET = 100;

module.exports = {
  name: "Tài xỉu",
  command: "taixiu",
  aliases: ["tx"],
  group: "game",
  kind: "command",
  description: "Cược tài/xỉu: taixiu tai 5k | xiu 50% | tai all",

  async run(args, msg, adapter, ctx) {
    const bank = ctx.store("vi");
    const key = "bal:" + msg.senderId;
    const cua = plain(args[0]);

    if (cua !== "tai" && cua !== "xiu") {
      return adapter.send(
        msg.threadId,
        `Cách chơi: ${ctx.prefix}taixiu tai <tiền>  hoặc  ${ctx.prefix}taixiu xiu <tiền>\n` +
          `Tiền có thể ghi: 1000, 5k, 2m, 50%, all.`
      );
    }

    const bal = Number(bank.get(key, 0));
    const bet = parseAmount(args[1], bal);
    if (!bet || bet < MIN_BET) return adapter.send(msg.threadId, `Cược tối thiểu ${MIN_BET} xu.`);
    if (bal < bet) return adapter.send(msg.threadId, `Bạn chỉ có ${fmt(bal)} xu.`);

    const d = [1 + rand(6), 1 + rand(6), 1 + rand(6)];
    const sum = d[0] + d[1] + d[2];
    const ket = sum >= 11 ? "tai" : "xiu";
    const win = ket === cua;
    const newBal = bank.add(key, win ? bet : -bet);

    return adapter.send(
      msg.threadId,
      `🎲 ${d.join(" - ")} = ${sum} → ${ket === "tai" ? "TÀI" : "XỈU"}\n` +
        `${msg.senderName} ${win ? "THẮNG +" : "THUA -"}${fmt(bet)} xu. Số dư: ${fmt(newBal)}.`
    );
  },
};
