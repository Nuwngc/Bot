/**
 * GIỌNG ĐỌC TIẾNG VIỆT TỪ MÁY CHỦ
 *
 * Dùng cho thiết bị không có giọng đọc tiếng Việt (máy không có dịch vụ Google, máy Huawei, trình duyệt lạ...).
 * Trình duyệt gửi từng câu ngắn lên /api/tts, máy chủ lấy âm thanh MP3 rồi trả về để phát.
 *
 * Nguồn giọng:
 *  - "google": không cần khoá, dùng dịch vụ đọc của Google Dịch từ máy chủ (không chính thức, có thể bị giới hạn).
 *  - "fpt:*" : nhiều giọng Bắc/Trung/Nam, ổn định hơn. Chỉ bật khi đặt biến môi trường FPT_TTS_KEY
 *              (lấy khoá tại https://fpt.ai, mục Text to Speech).
 */

const MAX_CHARS = 200;                 // mỗi lượt gọi tối đa 200 ký tự
const LIMIT_PER_MIN = 60;              // mỗi tài khoản tối đa 60 lượt / phút
const CACHE_MAX = 150;                 // nhớ tạm 150 câu gần nhất để đỡ gọi lại
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const FPT_VOICES = [
  ["banmai", "Ban Mai (nữ, miền Bắc)"], ["thuminh", "Thu Minh (nữ, miền Bắc)"], ["leminh", "Lê Minh (nam, miền Bắc)"],
  ["myan", "Mỹ An (nữ, miền Trung)"], ["giahuy", "Gia Huy (nam, miền Trung)"], ["ngoclam", "Ngọc Lam (nữ, miền Trung)"],
  ["linhsan", "Linh San (nữ, miền Nam)"], ["lannhi", "Lan Nhi (nữ, miền Nam)"],
];

const fptKey = () => (process.env.FPT_TTS_KEY || "").trim();

function voiceList() {
  const list = [{ id: "google", name: "Giọng Google (nữ)" }];
  if (fptKey()) FPT_VOICES.forEach(([id, name]) => list.push({ id: "fpt:" + id, name }));
  return list;
}

const cache = new Map(); // key -> Buffer
const hits = new Map();  // userId -> { n, reset }

function allow(userId) {
  const now = Date.now();
  let h = hits.get(userId);
  if (!h || now > h.reset) { h = { n: 0, reset: now + 60000 }; hits.set(userId, h); }
  h.n++;
  if (hits.size > 5000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
  return h.n <= LIMIT_PER_MIN;
}

const clean = (t) => String(t || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();

async function fromGoogle(text) {
  const url = "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=vi&q=" + encodeURIComponent(text);
  const r = await fetch(url, { headers: { "User-Agent": UA, Referer: "https://translate.google.com/" }, signal: AbortSignal.timeout(12000) });
  if (r.status === 429 || r.status === 403) throw new Error("Dịch vụ giọng đọc Google đang giới hạn máy chủ. Thử lại sau ít phút hoặc dùng giọng FPT.");
  if (!r.ok) throw new Error("Dịch vụ giọng đọc Google lỗi (" + r.status + ").");
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 100) throw new Error("Dịch vụ giọng đọc Google không trả về âm thanh.");
  return buf;
}

async function fromFpt(text, voice) {
  const r = await fetch("https://api.fpt.ai/hmi/tts/v5", {
    method: "POST",
    headers: { "api-key": fptKey(), voice, speed: "0", "Content-Type": "text/plain; charset=utf-8" },
    body: text,
    signal: AbortSignal.timeout(12000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error !== 0 || !j.async) throw new Error("FPT báo lỗi: " + (j.message || r.status));
  // File MP3 được tạo bất đồng bộ, đợi tối đa khoảng 9 giây
  for (let i = 0; i < 12; i++) {
    await new Promise((ok) => setTimeout(ok, i === 0 ? 400 : 700));
    const a = await fetch(j.async, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (a && a.ok) {
      const buf = Buffer.from(await a.arrayBuffer());
      if (buf.length > 100) return buf;
    }
  }
  throw new Error("FPT chưa tạo xong âm thanh, thử lại.");
}

async function synth(text, voice) {
  const key = voice + "|" + text;
  if (cache.has(key)) { const b = cache.get(key); cache.delete(key); cache.set(key, b); return b; }
  const buf = voice === "google" ? await fromGoogle(text) : await fromFpt(text, voice.slice(4));
  cache.set(key, buf);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return buf;
}

function register(router) {
  router.get("/tts/voices", (req, res) => res.json({ voices: voiceList() }));

  router.post("/tts", async (req, res) => {
    try {
      const text = clean(req.body?.text);
      const voice = String(req.body?.voice || "google");
      if (!text) return res.status(400).json({ error: "Chưa có văn bản để đọc." });
      if (text.length > MAX_CHARS) return res.status(400).json({ error: `Mỗi lượt chỉ đọc tối đa ${MAX_CHARS} ký tự.` });
      if (!voiceList().some((v) => v.id === voice)) return res.status(400).json({ error: "Giọng đọc không hợp lệ." });
      if (!allow(req.user.id)) return res.status(429).json({ error: "Bạn đọc quá nhanh, đợi một chút rồi thử lại." });
      const buf = await synth(text, voice);
      res.set("Cache-Control", "private, max-age=3600");
      res.type("audio/mpeg").send(buf);
    } catch (e) {
      res.status(502).json({ error: e.name === "TimeoutError" ? "Dịch vụ giọng đọc phản hồi quá chậm." : e.message });
    }
  });
}

module.exports = { register, _test: { clean, synth, voiceList, allow } };
