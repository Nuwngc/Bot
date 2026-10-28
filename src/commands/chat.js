/**
 * Hỏi AI bằng lệnh (ngoài cách tag bot). Dùng chung API key đã cài cho bot.
 */

module.exports = {
  name: "Chat AI",
  command: "chat",
  aliases: ["ai", "hoi"],
  group: "tien-ich",
  kind: "command",
  description: "Hỏi AI: chat <câu hỏi>",

  async run(args, msg, adapter, ctx) {
    const question = args.join(" ").trim();
    if (!question) return adapter.send(msg.threadId, `Cú pháp: ${ctx.prefix}chat <câu hỏi>`);

    const answer = await ctx.ai({
      threadId: msg.threadId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      messageId: msg.messageId,
      text: question,
    });
    return adapter.send(msg.threadId, answer, { replyTo: msg.messageId });
  },
};
