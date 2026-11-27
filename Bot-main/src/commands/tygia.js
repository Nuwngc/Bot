/**
 * Đổi tiền tệ. Dữ liệu open.er-api.com (miễn phí, không cần key).
 *   !tygia usd            1 USD -> VND
 *   !tygia 100 usd vnd    100 USD -> VND
 *   !tygia 5000000 vnd jpy
 */

const { getJson, fmt } = require("./util");

const CODE = /^[a-z]{3}$/i;

module.exports = {
  name: "Tỷ giá",
  command: "tygia",
  aliases: ["doitien"],
  group: "tien-ich",
  kind: "command",
  description: "Đổi tiền: tygia 100 usd vnd",

  async run(args, msg, adapter, ctx) {
    let amount = 1;
    const rest = [...args];
    if (rest.length && /^\d+([.,]\d+)?$/.test(rest[0])) amount = Number(rest.shift().replace(",", "."));

    const from = (rest[0] || "").toUpperCase();
    const to = (rest[1] || "VND").toUpperCase();
    if (!CODE.test(from) || !CODE.test(to)) {
      return adapter.send(msg.threadId, `Cú pháp: ${ctx.prefix}tygia [số] <từ> [sang]\nVí dụ: ${ctx.prefix}tygia 100 usd vnd`);
    }

    try {
      const data = await getJson(`https://open.er-api.com/v6/latest/${from}`);
      if (data.result !== "success") throw new Error("mã tiền không hợp lệ");
      const rate = data.rates[to];
      if (!rate) throw new Error(`không có mã ${to}`);

      const digits = rate * amount < 10 ? 4 : 2;
      const out = (rate * amount).toLocaleString("vi-VN", { maximumFractionDigits: digits });
      return adapter.send(
        msg.threadId,
        `${fmt(amount)} ${from} = ${out} ${to}\n` +
          `Tỷ giá: 1 ${from} = ${rate.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} ${to}\n` +
          `Cập nhật: ${String(data.time_last_update_utc || "").replace(/ \+0000$/, " UTC")}`
      );
    } catch (err) {
      return adapter.send(msg.threadId, `Không đổi được (${err.message}).`);
    }
  },
};
