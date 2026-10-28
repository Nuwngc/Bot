/**
 * Bầu cua: chọn 1 con, lắc 3 xúc xắc. Con của bạn ra k lần thì thắng k x tiền cược,
 * không ra thì mất tiền cược. Dùng chung ví với lệnh "vi".
 */

const { fmt, rand, plain, parseAmount } = require("./util");

const FACES = [
  ["bau", "🍐 Bầu"],
  ["cua", "🦀 Cua"],
  ["tom", "🦐 Tôm"],
  ["ca", "🐟 Cá"],
  ["ga", "🐓 Gà"],
  ["nai", "🦌 Nai"],
];
const MIN_BET = 100;

module.exports = {
  name: "Bầu cua",
  command: "baucua",
  aliases: ["bc"],
  group: "game",
  kind: "command",
  description: "Cược bầu cua: baucua ca 5k",

  async run(args, msg, adapter, ctx) {
    const bank = ctx.store("vi");
    const key = "bal:" + msg.senderId;
    const pickKey = plain(args[0]);
    const idx = FACES.findIndex(([k]) => k === pickKey);

    if (idx < 0) {
      return adapter.send(
        msg.threadId,
        `Cách chơi: ${ctx.prefix}baucua <con> <tiền>\n` +
          `Con: bầu, cua, tôm, cá, gà, nai. Tiền: 1000, 5k, 50%, all.`
      );
    }

    const bal = Number(bank.get(key, 0));
    const bet = parseAmount(args[1], bal);
    if (!bet || bet < MIN_BET) return adapter.send(msg.threadId, `Cược tối thiểu ${MIN_BET} xu.`);
    if (bal < bet) return adapter.send(msg.threadId, `Bạn chỉ có ${fmt(bal)} xu.`);

    const roll = [rand(6), rand(6), rand(6)];
    const hits = roll.filter((r) => r === idx).length;
    const delta = hits > 0 ? bet * hits : -bet;
    const newBal = bank.add(key, delta);

    return adapter.send(
      msg.threadId,
      `Kết quả: ${roll.map((r) => FACES[r][1]).join("  ")}\n` +
        `${msg.senderName} chọn ${FACES[idx][1]} ` +
        (hits > 0
          ? `ra ${hits} lần → THẮNG +${fmt(delta)} xu.`
          : `không ra → THUA -${fmt(bet)} xu.`) +
        ` Số dư: ${fmt(newBal)}.`
    );
  },
};
