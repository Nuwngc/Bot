/**
 * DICH TRUYEN TRUNG / NHAT / HAN -> TIENG VIET (tab Cong cu)
 *
 *  Muc tieu: dich nhu mot dich gia truyen, dac biet KHONG dich nghia ten rieng.
 *  Vi du 洛水寒 phai la "Lạc Thủy Hàn" (Han Viet), khong duoc thanh "Lạc nước lạnh".
 *
 *  Cach lam:
 *   1. /translate/extract : quet ten rieng + thuat ngu lap lai trong van ban, goi y cach viet (Han Viet / phien am).
 *   2. Nguoi dung xem lai, sua bang ten rieng (luu o trinh duyet, theo tung truyen).
 *   3. /translate/chunk   : dich tung doan, ep dung bang ten rieng, bao them ten moi tim thay (ghi vao bang ngay cho doan sau).
 *      May chu tu kiem tra ket qua: thieu ten trong bang, con sot chu Han / Nhat / Han, ban dich ngan bat thuong.
 *      Co loi thi tu dong dich lai mot lan voi danh sach loi; con loi thi tra ve co bao de nguoi dung xu ly.
 *   4. /translate/quick   : dich nhanh doan ngan kem phien am (pinyin / romaji / romaja).
 *
 *  Khoa AI: Gemini. Uu tien khoa nguoi dung gui kem (khong luu), neu khong co thi dung khoa dung chung cua admin (Cau hinh chung).
 *  Model: bien moi truong TRANSLATE_MODEL (nhanh) va TRANSLATE_MODEL_BEST (chuan), khong co thi dung model dung chung hoac gemini-flash-latest.
 *  Chan o may chu (an / tinh coin) nam trong server/toolcfg.js (cong cu dichtruyen va dichnhanh).
 */

const { getSetting } = require("./db");
const { decrypt } = require("./crypto");

const BASE = process.env.GEMINI_BASE || "https://generativelanguage.googleapis.com/v1beta/models/"; // GEMINI_BASE chi de thu nghiem
const FAST_DEFAULT = "gemini-flash-latest";
const BEST_DEFAULT = "gemini-pro-latest";

const MAX_CHUNK = 6000;      // ky tu nguon moi lan dich
const MAX_EXTRACT = 9000;    // ky tu nguon moi lan quet ten
const MAX_QUICK = 2500;
const MAX_GLOSS = 400;
const WINDOW_MS = 10 * 60 * 1000;
const WINDOW_MAX = 90;       // so luot goi / 10 phut / nguoi dung

class TrError extends Error {
  constructor(message, status = 400, code = "") { super(message); this.status = status; this.code = code; }
}

/* ---------- ngon ngu, chuan hoa ---------- */

const RE_KANA = /[\u3040-\u30ff\u31f0-\u31ff]/g;
const RE_HANGUL = /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/g;
const RE_HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const RE_CJK_LEFT = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uff66-\uff9f]/;

function detect(text) {
  const kana = (text.match(RE_KANA) || []).length;
  const hangul = (text.match(RE_HANGUL) || []).length;
  const han = (text.match(RE_HAN) || []).length;
  const total = kana + hangul + han;
  if (!total) return "other";
  if (hangul / total > 0.15) return "ko";
  if (kana / total > 0.05) return "ja";
  if (han / total > 0.5) return "zh";
  return "other";
}

const LANG_NAME = { zh: "Chinese", ja: "Japanese", ko: "Korean", other: "the source language (Chinese, Japanese or Korean)" };
const norm = (s) => String(s || "").normalize("NFC").toLowerCase();
const clean = (s, n) => String(s ?? "").replace(/\u0000/g, "").trim().slice(0, n);

const GENRES = {
  auto: "Detect the genre from the text and choose the matching register.",
  tienhiep: "Xianxia / xuanhuan / wuxia / historical-fantasy. Use rich Sino-Vietnamese (Hán Việt) vocabulary for cultivation and martial terms (linh khí, kim đan, tông môn, sư huynh, nội lực, đan dược, pháp bảo...). Ancient pronouns: ta, ngươi, hắn, nàng, huynh, đệ, tỷ, muội, tiền bối, vãn bối, bổn tọa, lão phu as the context fits.",
  ngontinh: "Romance (ngôn tình), ancient-court or modern. Soft, emotional, natural Vietnamese. For ancient settings use cổ trang style (ta, chàng, nàng, bệ hạ, nương nương, thần thiếp); for modern settings use modern address (anh, em, tôi, cậu, ông, bà).",
  hiendai: "Modern urban fiction. Natural contemporary Vietnamese: tôi, anh, em, cậu, cô, chú, bác, mày, tao as the relationship requires. Avoid Hán Việt except for names and established terms.",
  lightnovel: "Japanese light novel / anime style. Lively, natural Vietnamese. Keep honorifics (-san, -kun, -chan, -sama, senpai, sensei) as romanized when a Vietnamese equivalent would sound off.",
  hanquoc: "Korean web novel / webtoon / drama. Natural Vietnamese. Keep kinship and honorific terms as romanized when natural (oppa, unnie, hyung, noona, ssi, -nim, sunbae).",
};
const NAMESTYLE = {
  auto: "AUTO: Chinese names, places, sects, techniques and titles -> Sino-Vietnamese (Hán Việt). Japanese names -> Hepburn romaji keeping Japanese order (family name first) and without macrons, e.g. 田中太郎 -> Tanaka Taro; famous places use the common form (東京 -> Tokyo). Korean names -> Revised Romanization with a hyphenated given name (김민준 -> Kim Min-jun), places like 서울 -> Seoul.",
  hanviet: "HÁN VIỆT: render ALL names of people, places, organizations and titles in Sino-Vietnamese (Hán Việt) reading, including Japanese and Korean names written in Han characters (e.g. 田中 -> Điền Trung).",
  phienam: "ROMANIZATION: render names by sound in the Latin alphabet of the source language: Chinese -> pinyin without tone marks (洛水寒 -> Luo Shuihan), Japanese -> romaji, Korean -> Revised Romanization. Never translate names by meaning.",
  giunguyen: "KEEP ORIGINAL: leave names in their original script exactly as written in the source.",
};

/* ---------- Gemini ---------- */

const validKey = (k) => /^[A-Za-z0-9._-]{20,256}$/.test(String(k || ""));
const validModel = (m) => /^[a-z0-9][a-z0-9.-]{2,59}$/.test(String(m || ""));

function pickKey(body) {
  const own = String(body?.key || "").trim();
  if (own) {
    if (!validKey(own)) throw new TrError("Khoá Gemini riêng không đúng định dạng.");
    return own;
  }
  const k = decrypt(getSetting("global_ai_key_enc"));
  if (!k) throw new TrError("Máy chủ chưa có khoá AI. Admin hãy nhập khoá Gemini ở Cấu hình chung, hoặc bạn nhập khoá Gemini riêng trong công cụ.", 503, "nokey");
  return k;
}

function models(quality) {
  const fast = process.env.TRANSLATE_MODEL || getSetting("global_ai_model") || FAST_DEFAULT;
  const best = process.env.TRANSLATE_MODEL_BEST || BEST_DEFAULT;
  return quality === "best" ? [validModel(best) ? best : fast, fast] : [fast];
}

function explain(status, msg) {
  msg = String(msg || "");
  if (status === 400 && /API key|API_KEY/i.test(msg)) return "Khoá Gemini không đúng.";
  if (status === 401 || status === 403) return "Khoá không có quyền dùng Gemini API.";
  if (status === 404) return "Không tìm thấy model dịch.";
  if (status === 429) return "Gemini đang giới hạn lượt gọi hoặc hết hạn mức, đợi một lát rồi thử lại.";
  if (status >= 500) return "Máy chủ Gemini đang quá tải, thử lại sau.";
  return `Gemini báo lỗi (${status}).`;
}

const SAFETY = ["HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH", "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT"]
  .map((category) => ({ category, threshold: "BLOCK_ONLY_HIGH" })); // truyen co canh danh nhau, tinh cam: han che chan nham

async function callOnce({ key, model, system, user, json, temperature, maxTokens }) {
  let r;
  try {
    r = await fetch(BASE + encodeURIComponent(model) + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens, ...(json ? { responseMimeType: "application/json" } : {}) },
        safetySettings: SAFETY,
      }),
      signal: AbortSignal.timeout(120000),
    });
  } catch (e) {
    throw new TrError(e.name === "TimeoutError" ? "Gemini phản hồi quá chậm, thử lại hoặc chia đoạn nhỏ hơn." : "Không kết nối được tới Gemini.", 502);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new TrError(explain(r.status, j?.error?.message), r.status === 429 ? 429 : r.status === 404 ? 404 : 502, r.status === 404 ? "nomodel" : "");
  if (j?.promptFeedback?.blockReason) throw new TrError("Gemini chặn đoạn này vì nội dung (" + j.promptFeedback.blockReason + "). Thử chia nhỏ đoạn hoặc sửa phần nhạy cảm.", 422, "blocked");
  const cand = j?.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || "").join("").trim();
  if (cand?.finishReason === "MAX_TOKENS") throw new TrError("Đoạn quá dài so với giới hạn của model, hãy chia nhỏ hơn.", 422, "too_long");
  if (!text) throw new TrError(cand?.finishReason === "SAFETY" ? "Gemini chặn đoạn này vì nội dung. Thử chia nhỏ đoạn hoặc sửa phần nhạy cảm." : "Gemini không trả lời, thử lại.", 422, "blocked");
  return text;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Goi Gemini: thu lai mot lan khi 429 / 5xx, tu lui ve model nhanh neu model chuan khong ton tai */
async function gemini(opts) {
  const list = models(opts.quality);
  let lastErr;
  for (let i = 0; i < list.length; i++) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await callOnce({ ...opts, model: list[i] });
      } catch (e) {
        lastErr = e;
        if (e.code === "nomodel") break;                           // thu model tiep theo
        if ((e.status === 429 || e.status >= 500) && attempt === 0) { await sleep(3000); continue; }
        throw e;
      }
    }
  }
  throw lastErr;
}

function parseJson(text) {
  const s = String(text || "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(s); } catch (_) {}
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (_) {} }
  throw new TrError("Gemini trả về dữ liệu lỗi, bấm dịch lại đoạn này.", 502, "badjson");
}

/* ---------- prompt ---------- */

const EXAMPLES = `Examples of CORRECT handling of names (never translate a name by the meaning of its characters):
- 洛水寒 -> Lạc Thủy Hàn   (NOT "Lạc nước lạnh")
- 叶凡 -> Diệp Phàm        (NOT "Lá bình thường")
- 白云城 -> Bạch Vân Thành (NOT "thành mây trắng")
- 青云宗 -> Thanh Vân Tông (NOT "tông mây xanh")
- 林小雨 -> Lâm Tiểu Vũ
- 桜井美咲 -> Sakurai Misaki ; 東京 -> Tokyo
- 김민준 -> Kim Min-jun ; 서울 -> Seoul`;

function systemFor({ lang, genre, nameStyle }) {
  return `You are an experienced professional literary translator who translates ${LANG_NAME[lang] || LANG_NAME.other} web novels, light novels, comics and dramas into natural, fluent, publishable Vietnamese, exactly as a skilled human novel translator (dịch giả truyện) would.

NON-NEGOTIABLE RULES
1. PROPER NOUNS ARE TRANSCRIBED, NEVER TRANSLATED BY MEANING. This covers names of people (including nicknames and titles used as names), places, sects, organizations, techniques, skills, items, artifacts, ranks, realms and creatures. Even when the characters of a name have an ordinary meaning (水 water, 寒 cold, 云 cloud), a name must be written by reading, not by meaning.
${EXAMPLES}
2. NAME STYLE: ${NAMESTYLE[nameStyle] || NAMESTYLE.auto}
3. If a GLOSSARY is provided, it is mandatory: use the exact Vietnamese spelling and capitalization given for each source term, every time. Never invent a different rendering for a glossary term.
4. Keep every name consistent throughout. Use the same Vietnamese form for the same person or place everywhere, including short forms (if 洛水寒 is "Lạc Thủy Hàn" then 水寒 is "Thủy Hàn").
5. Be faithful and complete: translate every sentence, no omissions, no additions, no summaries, no explanations, no translator notes. Keep paragraph breaks, dialogue structure and quotation style.
6. Write like a real translator: natural idiomatic Vietnamese, correct pronouns and forms of address that fit the characters' relationships, not word-by-word. Render idioms, sayings and onomatopoeia naturally.
7. Do not leave any Chinese, Japanese or Korean characters in the translation (except where a glossary entry explicitly keeps them). Do not add pinyin, romaji or romanized readings unless a name rule requires it.
8. Style and register: ${GENRES[genre] || GENRES.auto}`;
}

const glossLines = (g) => g.map((e) => `${e.src} → ${e.vi}`).join("\n");

/* ---------- kiem tra va lam sach ---------- */

function cleanGloss(list, max = MAX_GLOSS) {
  const out = [], seen = new Set();
  for (const e of Array.isArray(list) ? list : []) {
    const src = clean(e?.src, 40), vi = clean(e?.vi, 80);
    if (!src || !vi || seen.has(src)) continue;
    seen.add(src);
    out.push({ src, vi });
    if (out.length >= max) break;
  }
  return out;
}

function cleanNames(list, lang, nameStyle) {
  const TYPES = ["person", "place", "org", "skill", "item", "title", "term", "other"];
  const out = [], seen = new Set();
  for (const e of Array.isArray(list) ? list : []) {
    const src = clean(e?.src, 40), vi = clean(e?.vi, 80);
    if (!src || !vi || seen.has(src)) continue;
    if (src === vi && nameStyle !== "giunguyen") continue;      // chua phien: khong co ich
    seen.add(src);
    out.push({ src, vi, type: TYPES.includes(e?.type) ? e.type : "other" });
    if (out.length >= 300) break;
  }
  return out;
}

/** Cac loi cua ban dich: thieu ten trong bang, con sot chu CJK, ngan bat thuong */
function inspect(src, vi, gloss) {
  const flags = { missing: [], cjk: "", short: false };
  const n = norm(vi);
  for (const e of gloss) {
    if (e.src.length < 2 && !/[\u3040-\u30ff\uac00-\ud7af]/.test(e.src)) continue;
    if (src.includes(e.src) && !n.includes(norm(e.vi))) flags.missing.push({ src: e.src, vi: e.vi });
  }
  const m = vi.match(new RegExp(RE_CJK_LEFT.source + "+", "g"));
  if (m) {
    const allowed = gloss.filter((e) => RE_CJK_LEFT.test(e.vi)).map((e) => e.vi);
    const rest = m.filter((x) => !allowed.some((a) => a.includes(x)));
    if (rest.length) flags.cjk = rest.slice(0, 5).join(" ");
  }
  const cjkLen = (src.match(RE_HAN) || []).length + (src.match(RE_KANA) || []).length + (src.match(RE_HANGUL) || []).length;
  if (cjkLen >= 60 && vi.length < cjkLen * 0.9) flags.short = true;
  return flags;
}
const hasIssue = (f) => f.missing.length > 0 || !!f.cjk || f.short;

/* ---------- xu ly ---------- */

function relevant(gloss, ...texts) {
  const all = texts.join("\n");
  return gloss.filter((e) => all.includes(e.src));
}

async function doExtract(body) {
  const text = clean(body.text, MAX_EXTRACT);
  if (text.length < 2) throw new TrError("Chưa có văn bản để quét tên riêng.");
  const lang = detect(text);
  const genre = GENRES[body.genre] ? body.genre : "auto";
  const nameStyle = NAMESTYLE[body.nameStyle] ? body.nameStyle : "auto";
  const known = cleanGloss(body.glossary, 200);
  const system = systemFor({ lang, genre, nameStyle }) + `

YOUR TASK NOW: scan the text and list every proper noun and every recurring world-building term that must be rendered consistently across a long translation. Do not translate the story.`;
  const user = `Return ONLY a JSON object: {"names":[{"src":"<exactly as written in the text>","vi":"<Vietnamese rendering following the rules>","type":"person|place|org|skill|item|title|term|other"}]}
Include: characters (full names AND the short forms or nicknames actually used), places, sects and organizations, techniques and skills, items and artifacts, ranks, realms and titles, creatures, and recurring technical terms (for example cultivation realms).
Exclude ordinary common nouns and verbs. List the same entity once per distinct written form. Keep forms consistent (the short form must reuse the readings of the full name).
${known.length ? `\nAlready decided, keep these exactly and do not list them again:\n${glossLines(known)}\n` : ""}
TEXT:
<<<
${text}
>>>`;
  const out = parseJson(await gemini({ key: pickKey(body), system, user, json: true, temperature: 0.1, maxTokens: 12000, quality: body.quality }));
  const names = cleanNames(out.names, lang, nameStyle).filter((n) => !known.some((k) => k.src === n.src));
  return { lang, names };
}

async function doChunk(body) {
  const text = clean(body.text, MAX_CHUNK);
  if (text.length < 1) throw new TrError("Đoạn trống.");
  const lang = detect(text);
  const genre = GENRES[body.genre] ? body.genre : "auto";
  const nameStyle = NAMESTYLE[body.nameStyle] ? body.nameStyle : "auto";
  const prevSrc = clean(body.prev?.src, 500), prevVi = clean(body.prev?.vi, 900);
  const gloss = relevant(cleanGloss(body.glossary), text, prevSrc);
  const note = clean(body.note, 600);
  const key = pickKey(body);
  const system = systemFor({ lang, genre, nameStyle });

  const build = (extra) => `${note ? `Notes from the user about this story (follow them):\n${note}\n\n` : ""}${gloss.length ? `GLOSSARY (mandatory, use exactly):\n${glossLines(gloss)}\n\n` : ""}${prevSrc ? `Previous passage, for continuity only (do NOT translate it again):\nSource: ${prevSrc}\nTranslation: ${prevVi}\n\n` : ""}Translate the following passage into Vietnamese.
Return ONLY a JSON object: {"vi":"<the complete Vietnamese translation, paragraphs separated by \\n>","names":[{"src":"...","vi":"...","type":"person|place|org|skill|item|title|term|other"}]}
"names" lists proper nouns and recurring terms that appear in THIS passage and are NOT in the glossary, with the Vietnamese form you used (empty array if none).
${extra || ""}
PASSAGE:
<<<
${text}
>>>`;

  let r = parseJson(await gemini({ key, system, user: build(), json: true, temperature: 0.3, maxTokens: 16000, quality: body.quality }));
  let vi = clean(r.vi, 60000);
  if (!vi) throw new TrError("Gemini trả về bản dịch trống, bấm dịch lại đoạn này.", 502, "badjson");
  let names = cleanNames(r.names, lang, nameStyle).filter((n) => !gloss.some((g) => g.src === n.src));
  let flags = inspect(text, vi, gloss);
  let retried = false;

  if (hasIssue(flags)) {
    retried = true;
    const issues = [];
    if (flags.missing.length) issues.push(`These glossary terms occur in the source but your translation does not contain the required Vietnamese form. Use exactly:\n${flags.missing.map((m) => `${m.src} → ${m.vi}`).join("\n")}`);
    if (flags.cjk) issues.push(`Your translation still contains untranslated Chinese/Japanese/Korean characters: ${flags.cjk}. Translate or transcribe them.`);
    if (flags.short) issues.push("Your translation looks incomplete or too short. Translate the whole passage, every sentence.");
    try {
      const r2 = parseJson(await gemini({ key, system, user: build(`\nYOUR PREVIOUS ATTEMPT HAD PROBLEMS. Fix them and return the full corrected JSON.\nProblems:\n${issues.join("\n")}\nPrevious translation:\n${vi}\n`), json: true, temperature: 0.2, maxTokens: 16000, quality: body.quality }));
      const vi2 = clean(r2.vi, 60000);
      const f2 = inspect(text, vi2, gloss);
      const score = (f) => f.missing.length * 3 + (f.cjk ? 3 : 0) + (f.short ? 4 : 0);
      if (vi2 && score(f2) <= score(flags)) {
        vi = vi2; flags = f2;
        names = cleanNames(r2.names, lang, nameStyle).filter((n) => !gloss.some((g) => g.src === n.src));
      }
    } catch (_) { /* giu ban dau, gui kem co bao */ }
  }
  return { lang, vi, names, flags: hasIssue(flags) ? flags : null, retried };
}

async function doQuick(body) {
  const text = clean(body.text, MAX_QUICK);
  if (text.length < 1) throw new TrError("Chưa có văn bản để dịch.");
  const lang = detect(text);
  const genre = GENRES[body.genre] ? body.genre : "auto";
  const nameStyle = NAMESTYLE[body.nameStyle] ? body.nameStyle : "auto";
  const gloss = relevant(cleanGloss(body.glossary), text);
  const system = systemFor({ lang, genre, nameStyle });
  const user = `${gloss.length ? `GLOSSARY (mandatory):\n${glossLines(gloss)}\n\n` : ""}Translate the text into natural Vietnamese. Also give the reading of the source text: pinyin with tone marks for Chinese, romaji for Japanese, Revised Romanization for Korean (keep the same line breaks).
Return ONLY a JSON object: {"lang":"zh|ja|ko|other","vi":"<Vietnamese translation>","reading":"<reading of the source>","notes":"<at most 2 short Vietnamese sentences about ambiguous idioms, slang or cultural references, or empty string>"}
TEXT:
<<<
${text}
>>>`;
  const r = parseJson(await gemini({ key: pickKey(body), system, user, json: true, temperature: 0.3, maxTokens: 8000, quality: body.quality }));
  const vi = clean(r.vi, 20000);
  return { lang: ["zh", "ja", "ko"].includes(r.lang) ? r.lang : lang, vi, reading: clean(r.reading, 20000), notes: clean(r.notes, 400), flags: inspect(text, vi, gloss) };
}

/* ---------- route ---------- */

const hits = new Map(); // userId -> [thoi diem]

function limiter(req, res, next) {
  const now = Date.now();
  const arr = (hits.get(req.user.id) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= WINDOW_MAX) return res.status(429).json({ error: `Bạn dịch quá nhanh, đợi vài phút rồi tiếp tục (tối đa ${WINDOW_MAX} lượt mỗi 10 phút).` });
  arr.push(now);
  hits.set(req.user.id, arr);
  next();
}

function register(router) {
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k); }, 10 * 60 * 1000).unref();
  const wrap = (fn) => async (req, res) => {
    try { res.json(await fn(req.body || {})); }
    catch (e) {
      if (!(e instanceof TrError)) console.error("[translate]", e.message);
      res.status(e instanceof TrError ? e.status : 500).json({ error: e instanceof TrError ? e.message : "Lỗi dịch, thử lại.", code: e.code || "" });
    }
  };
  router.post("/translate/extract", limiter, wrap(doExtract));
  router.post("/translate/chunk", limiter, wrap(doChunk));
  router.post("/translate/quick", limiter, wrap(doQuick));
  router.get("/translate/info", (req, res) => res.json({ maxChunk: MAX_CHUNK, maxExtract: MAX_EXTRACT, maxQuick: MAX_QUICK, hasGlobalKey: !!decrypt(getSetting("global_ai_key_enc")) }));
}

module.exports = { register, _t: { detect, inspect, cleanGloss, cleanNames, parseJson, systemFor } };
