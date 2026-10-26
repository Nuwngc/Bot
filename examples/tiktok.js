/**
 * Tải video TikTok không logo.
 *
 * Bản gốc dùng thư viện lib/tiktok.js gọi API riêng. Ở đây gọi thẳng một
 * API công khai bằng fetch (Node 18+ có sẵn fetch). Nếu API đó chết, đổi
 * URL trong hàm fetchTikTok.
 *
 * Cú pháp: !tiktok <link>
 */

module.exports = {
  name: "Tải TikTok",
  command: "tiktok",
  kind: "command",
  description: "Tải video TikTok không logo",

  async run(args, msg, adapter, ctx) {
    const url = (args[0] || "").trim();
    if (!/tiktok\.com|douyin\./i.test(url)) {
      return adapter.send(msg.threadId, "Gửi kèm link: !tiktok <link tiktok>");
    }

    await adapter.send(msg.threadId, "Đang tải, chờ chút...");

    try {
      const info = await fetchTikTok(url);
      if (!info || !info.play) {
        return adapter.send(msg.threadId, "Không lấy được video. Link có thể sai hoặc API đang lỗi.");
      }
      const caption =
        `🎵 ${info.title || "TikTok"}\n` +
        (info.author ? `👤 ${info.author}\n` : "") +
        `Link tải: ${info.play}`;
      return adapter.send(msg.threadId, caption);
    } catch (e) {
      return adapter.send(msg.threadId, "Lỗi khi tải: " + (e.message || e));
    }
  },
};

async function fetchTikTok(url) {
  // API công khai tikwm.com - trả JSON, không cần key
  const api = "https://www.tikwm.com/api/?url=" + encodeURIComponent(url);
  const res = await fetch(api, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const json = await res.json();
  const d = json && json.data;
  if (!d) return null;
  return {
    title: d.title,
    author: d.author && d.author.nickname,
    // play = link không logo
    play: d.play ? "https://www.tikwm.com" + (d.play.startsWith("http") ? "" : "") + d.play : null,
  };
}
