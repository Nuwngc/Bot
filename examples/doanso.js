/**
 * MODULE MẪU — đoán số.
 *
 * Copy file này, sửa lại, rồi tải lên ở mục "Module" trong bảng điều khiển.
 * Tắt rồi bật lại bot là có hiệu lực.
 *
 * ── Quy ước ────────────────────────────────────────────────────
 * module.exports = {
 *   name:        tên hiển thị
 *   command:     lệnh kích hoạt, 2-20 ký tự chữ/số thường, không dấu !
 *   kind:        "game" hoặc "command"
 *   description: mô tả ngắn, hiện trong !help
 *
 *   // kind === "game": trả về một object điều khiển ván chơi
 *   start(msg, adapter, ctx) -> {
 *     handle(msg, adapter)            // tin nhắn thường, trả true nếu đã xử lý
 *     command(cmd, args, msg, adapter) // lệnh có tiền tố, tuỳ chọn
 *     handleDM(msg, adapter)          // tin nhắn riêng, tuỳ chọn
 *     stop(adapter)                   // khi có người gõ !stop
 *   }
 *
 *   // kind === "command": chạy một lần rồi thôi
 *   run(args, msg, adapter, ctx)
 * }
 *
 * ── ctx có gì ──────────────────────────────────────────────────
 *   ctx.prefix          ký tự lệnh hiện tại, ví dụ "!"
 *   ctx.onEnd()         gọi khi ván kết thúc, để bot dọn dẹp
 *   ctx.registerDM(id, game) / ctx.unregisterDM(id)
 *
 * ── adapter có gì ──────────────────────────────────────────────
 *   adapter.send(threadId, text, { replyTo })
 *   adapter.dm(userId, text)
 *   adapter.getName(userId) -> Promise<string>
 *
 * ── msg có gì ──────────────────────────────────────────────────
 *   msg.threadId, msg.senderId, msg.senderName, msg.text,
 *   msg.messageId, msg.isGroup
 *
 * ── Không dùng được ────────────────────────────────────────────
 * require, process, eval, new Function, globalThis, __dirname.
 * Module bị chặn khi tải lên nếu chứa những thứ này.
 */

module.exports = {
  name: "Đoán số",
  command: "doanso",
  kind: "game",
  description: "Đoán số bí mật từ 1 đến 100",

  start(msg, adapter, ctx) {
    const secret = 1 + Math.floor(Math.random() * 100);
    let tries = 0;
    let done = false;

    adapter.send(
      msg.threadId,
      "Mình đã nghĩ ra một số từ 1 đến 100. Nhắn số để đoán.\n" +
        `Gõ ${ctx.prefix}stop để dừng.`
    );

    return {
      async handle(m, ad) {
        if (done) return false;

        const n = Number(m.text.trim());
        if (!Number.isInteger(n) || n < 1 || n > 100) return false;

        tries++;

        if (n === secret) {
          done = true;
          await ad.send(
            m.threadId,
            `Chính xác! Số đó là ${secret}. ${m.senderName} đoán trúng sau ${tries} lượt.`
          );
          ctx.onEnd();
          return true;
        }

        const hint = n < secret ? "Lớn hơn" : "Nhỏ hơn";
        const warm = Math.abs(n - secret) <= 5 ? " (nóng lắm rồi)" : "";
        await ad.send(m.threadId, `${hint} ${n}${warm}`, { replyTo: m.messageId });
        return true;
      },

      async stop(ad) {
        done = true;
        await ad.send(msg.threadId, `Dừng lại. Số đó là ${secret}.`);
        ctx.onEnd();
      },
    };
  },
};
