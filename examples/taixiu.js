/**
 * Tài xỉu - cược xu bằng 3 xúc xắc.
 * Dùng chung ví với module "vi" (ctx.store("vi"), khoá bal:<uid>).
 *
 * Cú pháp: !taixiu tai 1000  hoặc  !taixiu xiu 1000
 * Tài = tổng 11-17, Xỉu = tổng 4-10. Thắng ăn gấp đôi tiền cược.
 */

const MIN_BET = 100;

module.exports = {
  name: "Tài xỉu",
  command: "taixiu",
  kind: "command",
  description: "Cược tài/xỉu bằng xu",

  async run(args, msg, adapter, ctx) {
    const bank = ctx.store("vi");
    const key = "bal:" + msg.senderId;

    const cua = (args[0] || "").toLowerCase();
    const bet = Math.floor(Number(args[1]));

    if (cua !== "tai" && cua !== "xiu") {
      return adapter.send(msg.threadId, "Cách chơi: !taixiu tai <số xu>  hoặc  !taixiu xiu <số xu>");
    }
    if (!bet || bet < MIN_BET) {
      return adapter.send(msg.threadId, `Cược tối thiểu ${MIN_BET} xu.`);
    }
    const bal = Number(bank.get(key, 0));
    if (bal < bet) return adapter.send(msg.threadId, `Bạn chỉ có ${bal.toLocaleString("vi-VN")} xu.`);

    const d = [dice(), dice(), dice()];
    const sum = d[0] + d[1] + d[2];
    const ket = sum >= 11 ? "tai" : "xiu";
    const win = ket === cua;

    const delta = win ? bet : -bet;
    const newBal = bank.add(key, delta);

    const face = d.join(" - ");
    const line = `🎲 ${face} = ${sum} → ${ket.toUpperCase()}`;
    return adapter.send(
      msg.threadId,
      win
        ? `${line}\n${msg.senderName} THẮNG +${bet.toLocaleString("vi-VN")} xu. Số dư: ${newBal.toLocaleString("vi-VN")}.`
        : `${line}\n${msg.senderName} THUA -${bet.toLocaleString("vi-VN")} xu. Số dư: ${newBal.toLocaleString("vi-VN")}.`
    );
  },
};

function dice() {
  return 1 + Math.floor(Math.random() * 6);
}
