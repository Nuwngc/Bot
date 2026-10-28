/**
 * Tin mới nhất qua RSS.   !news [tuoitre|vnexpress|dantri|cafef]
 */

const { getText, decodeEntities, plain } = require("./util");

const FEEDS = {
  tuoitre: ["Tuổi Trẻ", "https://tuoitre.vn/rss/tin-moi-nhat.rss"],
  vnexpress: ["VnExpress", "https://vnexpress.net/rss/tin-moi-nhat.rss"],
  dantri: ["Dân Trí", "https://dantri.com.vn/rss/home.rss"],
  cafef: ["CafeF", "https://cafef.vn/trang-chu.rss"],
};
const TAKE = 6;

module.exports = {
  name: "Tin tức",
  command: "news",
  aliases: ["tintuc"],
  group: "tien-ich",
  kind: "command",
  description: "Tin mới: news [tuoitre|vnexpress|dantri|cafef]",

  async run(args, msg, adapter, ctx) {
    const key = plain(args[0] || "tuoitre");
    const feed = FEEDS[key];
    if (!feed) {
      return adapter.send(msg.threadId, `Nguồn có sẵn: ${Object.keys(FEEDS).join(", ")}\nVí dụ: ${ctx.prefix}news vnexpress`);
    }

    try {
      const xml = await getText(feed[1]);
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, TAKE).map((m) => {
        const title = (m[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1];
        const link = (m[1].match(/<link>([\s\S]*?)<\/link>/) || [])[1];
        return title && link ? `• ${decodeEntities(title)}\n  ${decodeEntities(link)}` : null;
      }).filter(Boolean);

      if (!items.length) throw new Error("không đọc được bảng tin");
      return adapter.send(msg.threadId, `Tin mới - ${feed[0]}\n\n${items.join("\n\n")}`);
    } catch (err) {
      return adapter.send(msg.threadId, `Không lấy được tin (${err.message}).`);
    }
  },
};
