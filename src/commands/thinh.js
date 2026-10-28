/**
 * Thả thính ngẫu nhiên (câu lấy từ bot Zalo).
 */

const LINES = require("../data/thinh.json");
const { pick } = require("./util");

module.exports = {
  name: "Thả thính",
  command: "thinh",
  aliases: ["thathinh"],
  group: "giai-tri",
  kind: "command",
  description: "Một câu thả thính ngẫu nhiên",

  async run(args, msg, adapter) {
    return adapter.send(msg.threadId, pick(LINES));
  },
};
