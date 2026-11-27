/**
 * Dịch văn bản (Google Translate, như bot Zalo). Mặc định dịch sang tiếng Việt.
 *   !dich on | off        bật/tắt lệnh trong nhóm này (mặc định tắt, giống Zalo)
 *   !dich <văn bản>       dịch sang tiếng Việt
 *   !dich en <văn bản>    dịch sang ngôn ngữ khác (vi en ja ko zh-CN fr de es ru th)
 */

const { getJson } = require("./util");

const LANGS = new Set(["vi", "en", "ja", "ko", "zh-cn", "zh-tw", "fr", "de", "es", "ru", "th", "it", "id"]);

module.exports = {
  name: "Dịch",
  command: "dich",
  aliases: ["translate"],
  group: "tien-ich",
  kind: "command",
  description: "Dịch: dich on/off, dich <chữ>, dich en <chữ>",

  async run(args, msg, adapter, ctx) {
    const store = ctx.store("dich");
    const key = "on:" + msg.threadId;
    const first = (args[0] || "").toLowerCase();

    if (first === "on") {
      store.set(key, true);
      return adapter.send(msg.threadId, `Lệnh ${ctx.prefix}dich đã BẬT trong cuộc trò chuyện này.`);
    }
    if (first === "off") {
      store.set(key, false);
      return adapter.send(msg.threadId, `Lệnh ${ctx.prefix}dich đã TẮT trong cuộc trò chuyện này.`);
    }
    if (!store.get(key, false)) {
      return adapter.send(msg.threadId, `Lệnh dịch đang tắt ở đây. Gõ ${ctx.prefix}dich on để bật.`);
    }

    let target = "vi";
    let words = args;
    if (args.length > 1 && LANGS.has(first)) {
      target = first === "zh-cn" ? "zh-CN" : first === "zh-tw" ? "zh-TW" : first;
      words = args.slice(1);
    }
    const text = words.join(" ").trim();
    if (!text) return adapter.send(msg.threadId, `Nhập văn bản cần dịch: ${ctx.prefix}dich <văn bản>`);

    try {
      const data = await getJson(
        "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=auto&tl=" +
          encodeURIComponent(target) + "&q=" + encodeURIComponent(text)
      );
      const out = (data[0] || []).map((p) => p[0]).join("");
      if (!out) throw new Error("không có kết quả");
      return adapter.send(msg.threadId, `[${target}] ${out}`, { replyTo: msg.messageId });
    } catch (err) {
      return adapter.send(msg.threadId, `Lỗi khi dịch (${err.message}).`);
    }
  },
};
