/**
 * Goi thu Gemini tu may chu (dung cho nut "Thu khoa" tren web panel).
 * Khoa API gui qua header x-goog-api-key, khong dua len URL, khong ghi vao log, khong tra lai cho trinh duyet.
 */
const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const DEFAULT_MODEL = "gemini-flash-latest";

const validKey = (k) => /^[A-Za-z0-9._-]{20,256}$/.test(String(k || ""));
const validModel = (m) => /^[a-z0-9][a-z0-9.-]{2,59}$/.test(String(m || ""));

class GeminiError extends Error {
  constructor(status, apiMessage) {
    super(explain(status, apiMessage));
    this.status = status;
  }
}

function explain(status, msg) {
  msg = String(msg || "");
  if (status === 400 && /API key|API_KEY/i.test(msg)) return "Khoá API không đúng.";
  if (status === 401 || status === 403) return "Khoá không có quyền dùng Gemini API (kiểm tra đã bật Gemini API cho khoá này).";
  if (status === 404) return "Không tìm thấy model này, hãy kiểm tra lại tên model.";
  if (status === 429) return "Khoá đã hết hạn mức hoặc bị gọi quá nhanh, thử lại sau ít phút.";
  if (status >= 500) return "Máy chủ Gemini đang lỗi, thử lại sau.";
  return "Gemini báo lỗi (" + status + ").";
}

async function ask({ key, model, text, prompt, maxTokens = 64 }) {
  const body = { contents: [{ role: "user", parts: [{ text }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0 } };
  if (prompt) body.systemInstruction = { parts: [{ text: prompt }] };
  let r;
  try {
    r = await fetch(BASE + encodeURIComponent(model || DEFAULT_MODEL) + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw new Error(e.name === "TimeoutError" ? "Gemini phản hồi quá chậm." : "Không kết nối được tới Gemini.");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new GeminiError(r.status, j?.error?.message);
  const parts = j?.candidates?.[0]?.content?.parts || [];
  const out = parts.map((p) => p.text || "").join("").trim();
  if (!out) throw new Error("Gemini không trả lời (có thể bị chặn nội dung).");
  return out;
}

module.exports = { ask, validKey, validModel, DEFAULT_MODEL };
