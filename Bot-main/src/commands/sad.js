/**
 * Thơ buồn ngẫu nhiên (mẫu lấy từ bot Zalo).
 */

const DATA = require("../data/sad.json");
const { rand } = require("./util");

function sample(arr, n) {
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(rand(pool.length), 1)[0]);
  return out;
}

module.exports = {
  name: "Thơ buồn",
  command: "sad",
  aliases: ["thobuon"],
  group: "giai-tri",
  kind: "command",
  description: "Một bài thơ buồn ngẫu nhiên",

  async run(args, msg, adapter) {
    const tpl = DATA.templates[rand(DATA.templates.length)];
    const em = sample(DATA.emojis, 4);
    const poem = tpl.replace(/\{(\d)\}/g, (_, i) => em[Number(i)] || "");
    const date = new Date().toLocaleDateString("vi-VN");
    return adapter.send(msg.threadId, `Thơ buồn - ${date}\n\n${poem}`);
  },
};
