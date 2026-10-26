/**
 * Chào thành viên mới & tạm biệt người rời nhóm.
 *
 * Module kiểu sự kiện: có onEvent, và một lệnh !chaomung để cấu hình.
 * Lời chào lưu theo từng nhóm trong ctx.store("chaomung").
 *
 * Trong lời chào có thể dùng:
 *   {ten}   -> tên người vừa vào/ra
 *   {nhom}  -> để trống (giữ đơn giản, không gọi thêm API)
 */

const DEFAULT_WELCOME = "Chào mừng {ten} đã tham gia nhóm! 🎉";
const DEFAULT_BYE = "Tạm biệt {ten} 👋";

module.exports = {
  name: "Chào mừng",
  command: "chaomung",
  kind: "command",
  description: "Cấu hình lời chào vào/ra nhóm",

  // Lệnh cấu hình
  async run(args, msg, adapter, ctx) {
    const store = ctx.store("chaomung");
    const sub = (args[0] || "").toLowerCase();
    const rest = args.slice(1).join(" ").trim();
    const wKey = "welcome:" + msg.threadId;
    const bKey = "bye:" + msg.threadId;

    if (sub === "chao" && rest) {
      store.set(wKey, rest);
      return adapter.send(msg.threadId, "Đã đặt lời chào mới.");
    }
    if (sub === "biet" && rest) {
      store.set(bKey, rest);
      return adapter.send(msg.threadId, "Đã đặt lời tạm biệt mới.");
    }
    if (sub === "tat") {
      store.set("off:" + msg.threadId, true);
      return adapter.send(msg.threadId, "Đã tắt chào/tạm biệt ở nhóm này.");
    }
    if (sub === "bat") {
      store.del("off:" + msg.threadId);
      return adapter.send(msg.threadId, "Đã bật lại chào/tạm biệt.");
    }

    return adapter.send(
      msg.threadId,
      "Cấu hình chào mừng:\n" +
        `${ctx.prefix}chaomung chao <lời chào>\n` +
        `${ctx.prefix}chaomung biet <lời tạm biệt>\n` +
        `${ctx.prefix}chaomung tat / bat\n` +
        "Dùng {ten} để chèn tên người.\n\n" +
        `Hiện tại:\nChào: ${store.get(wKey, DEFAULT_WELCOME)}\nBiệt: ${store.get(bKey, DEFAULT_BYE)}`
    );
  },

  // Bắt sự kiện vào/ra nhóm
  async onEvent(ev, adapter, ctx) {
    const store = ctx.store("chaomung");
    if (store.get("off:" + ev.threadId, false)) return;

    if (ev.kind === "join") {
      const tmpl = store.get("welcome:" + ev.threadId, DEFAULT_WELCOME);
      for (const id of ev.addedIds) {
        const name = await adapter.getName(id);
        await adapter.send(ev.threadId, tmpl.replace(/{ten}/g, name).replace(/{nhom}/g, ""));
      }
    } else if (ev.kind === "leave" && ev.leftId) {
      // Bỏ qua khi chính bot bị xoá
      const name = await adapter.getName(ev.leftId);
      const tmpl = store.get("bye:" + ev.threadId, DEFAULT_BYE);
      await adapter.send(ev.threadId, tmpl.replace(/{ten}/g, name).replace(/{nhom}/g, ""));
    }
  },
};
