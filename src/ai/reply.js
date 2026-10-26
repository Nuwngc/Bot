/**
 * Tra loi khi bot bi tag.
 *
 * Moi bot (moi nguoi dung web panel) co instance rieng: API key rieng,
 * lich su rieng, quota rieng.
 */

const DEFAULT_SYSTEM = `Ban la mot bot chat trong nhom Messenger tieng Viet.
Tra loi ngan gon, tu nhien, than thien, toi da 3-4 cau.
Dung tieng Viet. Khong dung markdown vi Messenger khong hien thi duoc.
Neu khong biet thi noi thang la khong biet.`;

const MAX_HISTORY = 8;
const MAX_TOKENS = 400;
const COOLDOWN_MS = 4000;

function createAI({ apiKey, model, systemPrompt, dailyLimit = 300, onLog = () => {} }) {
  const histories = new Map();
  const lastCall = new Map();
  let dailyCount = 0;
  let dailyReset = Date.now() + 24 * 3600 * 1000;

  const sys = systemPrompt || DEFAULT_SYSTEM;
  const mdl = model || "claude-haiku-4-5-20251001";

  function push(threadId, role, content) {
    if (!histories.has(threadId)) histories.set(threadId, []);
    const h = histories.get(threadId);
    h.push({ role, content });
    while (h.length > MAX_HISTORY) h.shift();
    return h;
  }

  return async function aiReply(msg) {
    if (!apiKey) return "Chu bot chua cai API key nen minh chua tra loi duoc.";

    if (Date.now() > dailyReset) {
      dailyCount = 0;
      dailyReset = Date.now() + 24 * 3600 * 1000;
    }
    if (dailyCount >= dailyLimit) return "Bot het luot tra loi hom nay roi, mai quay lai nhe.";

    const last = lastCall.get(msg.senderId) || 0;
    if (Date.now() - last < COOLDOWN_MS) return "Tu tu, doi bot vai giay da.";
    lastCall.set(msg.senderId, Date.now());

    const question = msg.text.replace(/^@\S+\s*/, "").trim();
    if (!question) return "Ban goi bot co viec gi khong?";

    const messages = push(msg.threadId, "user", `${msg.senderName}: ${question}`);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model: mdl, max_tokens: MAX_TOKENS, system: sys, messages }),
      });

      if (!res.ok) {
        onLog("error", `AI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return "Bot dang loi ket noi, thu lai sau nhe.";
      }

      const data = await res.json();
      const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

      dailyCount++;
      push(msg.threadId, "assistant", text);
      return text || "...";
    } catch (err) {
      onLog("error", `AI loi: ${err?.message || err}`);
      return "Bot dang loi, thu lai sau nhe.";
    }
  };
}

module.exports = { createAI };
