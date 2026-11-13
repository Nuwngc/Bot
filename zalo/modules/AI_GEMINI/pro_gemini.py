# -*- coding: utf-8 -*-
"""Tro ly AI Gemini cho bot Zalo.

Lenh:
  <prefix>chat <cau hoi>   hoi Gemini (nho vai cau gan nhat cua nguoi hoi)
  <prefix>chat on | off    admin bot bat/tat tro ly trong nhom nay (tin nhan rieng luon dung duoc)
  <prefix>chat reset       xoa tri nho hoi thoai cua ban

Khoa API, model va loi dan (tinh cach) do chu bot nhap tren web panel (Zalo > Tro ly AI), khong nam trong code.
"""
import re
import threading
import time

import requests
from zlapi.models import Message, ThreadType

import config
from core.bot_sys import is_admin, read_settings, write_settings

des = {
    "version": "2.0.0",
    "credits": "Web panel",
    "description": "tro chuyen voi Gemini (khoa API cau hinh tren web)",
}

DEFAULT_MODEL = "gemini-flash-latest"
DEFAULT_PROMPT = (
    "Bạn là trợ lý AI trong một cuộc trò chuyện Zalo. Trả lời bằng tiếng Việt, ngắn gọn, thân thiện, dễ hiểu. "
    "Không dùng định dạng markdown (không dùng dấu *, #). Nếu không chắc chắn thì nói thẳng là không chắc."
)
API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

COOLDOWN_S = 5          # moi nguoi cach nhau toi thieu 5 giay
MAX_Q_CHARS = 1500      # do dai cau hoi toi da
HISTORY_TURNS = 6       # nho 6 luot hoi-dap gan nhat
HISTORY_TTL_S = 1800    # quen sau 30 phut khong noi chuyen
CHUNK = 1800            # moi tin nhan Zalo toi da ~1800 ky tu, toi da 3 tin

_last_ask = {}
_history = {}           # (thread_id, author_id) -> {"t": time, "turns": [(role, text), ...]}
_lock = threading.Lock()


def _prefix(client):
    return getattr(client, "prefix", None) or getattr(config, "prefix", "/") or "/"


def _reply(client, text, message_object, thread_id, thread_type):
    parts = [text[i:i + CHUNK] for i in range(0, len(text), CHUNK)][:3] or [text]
    client.replyMessage(Message(text=parts[0]), message_object, thread_id, thread_type)
    for p in parts[1:]:
        client.sendMessage(Message(text=p), thread_id, thread_type)


def _plain(text):
    """Zalo khong hien markdown: doi gach dau dong thanh cham tron, bo dau * va `."""
    text = re.sub(r"^\s*[\*\-]\s+", "• ", text, flags=re.M)
    return re.sub(r"\*\*|__|`{1,3}", "", text).strip()


def _explain(status, data):
    """Doi loi cua Gemini thanh cau de hieu. Khong bao gio chua khoa API."""
    msg = str(((data or {}).get("error") or {}).get("message") or "")
    if status == 400 and re.search(r"API key|API_KEY", msg, re.I):
        return "Khoá API Gemini chưa đúng. Chủ bot hãy nhập lại trên web."
    if status in (401, 403):
        return "Khoá API không có quyền dùng Gemini (kiểm tra đã bật Gemini API cho khoá này)."
    if status == 404:
        return "Không tìm thấy model Gemini đã cấu hình. Chủ bot hãy kiểm tra lại tên model."
    if status == 429:
        return "Khoá Gemini đã hết hạn mức hoặc đang bị gọi quá nhanh, thử lại sau ít phút."
    if status >= 500:
        return "Máy chủ Gemini đang lỗi, thử lại sau."
    return "Gemini báo lỗi (%s). Thử lại sau." % status


def _ask_gemini(key, model, system_prompt, turns, question):
    contents = [{"role": r, "parts": [{"text": t}]} for r, t in turns]
    contents.append({"role": "user", "parts": [{"text": question}]})
    body = {
        "contents": contents,
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.9},
    }
    # khoa gui qua header, khong dua len URL de khong bi ghi vao log
    r = requests.post(
        API_URL.format(model=model),
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
        json=body,
        timeout=25,
    )
    try:
        data = r.json()
    except ValueError:
        data = {}
    if r.status_code != 200:
        raise RuntimeError(_explain(r.status_code, data))

    cands = data.get("candidates") or []
    parts = ((cands[0].get("content") or {}).get("parts") or []) if cands else []
    text = "".join(p.get("text", "") for p in parts).strip()
    if not text:
        if (data.get("promptFeedback") or {}).get("blockReason") or (cands and cands[0].get("finishReason") == "SAFETY"):
            raise RuntimeError("Gemini từ chối trả lời câu này.")
        raise RuntimeError("Gemini không trả lời được, hãy thử hỏi lại.")
    return _plain(text)


def _get_turns(k):
    with _lock:
        h = _history.get(k)
        if h and time.time() - h["t"] > HISTORY_TTL_S:
            _history.pop(k, None)
            h = None
        return list(h["turns"]) if h else []


def _add_turns(k, question, answer):
    with _lock:
        h = _history.setdefault(k, {"t": time.time(), "turns": []})
        h["t"] = time.time()
        h["turns"] += [("user", question), ("model", answer)]
        h["turns"] = h["turns"][-HISTORY_TURNS * 2:]
        if len(_history) > 300:  # don dep: bo cac cuoc tro chuyen cu nhat
            for old in sorted(_history, key=lambda x: _history[x]["t"])[:100]:
                _history.pop(old, None)


def _worker(question, message_object, thread_id, thread_type, author_id, client):
    try:
        key = config.gemini_key
        model = config.gemini_model or DEFAULT_MODEL
        prompt = config.gemini_prompt or DEFAULT_PROMPT
        k = (thread_id, author_id)
        answer = _ask_gemini(key, model, prompt, _get_turns(k), question)
        _add_turns(k, question, answer)
        _reply(client, answer, message_object, thread_id, thread_type)
    except RuntimeError as e:
        _reply(client, str(e), message_object, thread_id, thread_type)
    except requests.Timeout:
        _reply(client, "Gemini phản hồi quá chậm, thử lại sau nhé.", message_object, thread_id, thread_type)
    except Exception:
        _reply(client, "Có lỗi khi gọi Gemini, thử lại sau nhé.", message_object, thread_id, thread_type)


def handle_chat_command(message, message_object, thread_id, thread_type, author_id, client):
    prefix = _prefix(client)
    body = str(message).strip()[len(prefix) + 4:].strip()  # bo "<prefix>chat"
    low = body.lower()
    reply = lambda t: _reply(client, t, message_object, thread_id, thread_type)

    if low in ("on", "off"):
        if not is_admin(client, author_id):
            return reply("❌ Bạn không phải admin bot.")
        settings = read_settings(client.uid)
        settings.setdefault("chat", {})[thread_id] = (low == "on")
        write_settings(client.uid, settings)
        return reply("Đã bật trợ lý AI cho nhóm này." if low == "on" else "Đã tắt trợ lý AI cho nhóm này.")

    if low in ("reset", "clear", "xoa"):
        with _lock:
            _history.pop((thread_id, author_id), None)
        return reply("Đã xoá trí nhớ cuộc trò chuyện của bạn.")

    if not low or low in ("help", "huongdan"):
        return reply(
            "Trợ lý AI Gemini:\n"
            "%schat <câu hỏi>: hỏi bất cứ điều gì\n"
            "%schat reset: xoá trí nhớ hội thoại\n"
            "%schat on / off: admin bật/tắt trong nhóm" % (prefix, prefix, prefix)
        )

    if not config.gemini_key:
        return reply("Chưa cấu hình khoá Gemini. Chủ bot hãy vào web, mục Zalo, phần Trợ lý AI để nhập khoá.")

    # Nhom phai duoc admin bat; tin nhan rieng luon dung duoc
    if thread_type == ThreadType.GROUP and not read_settings(client.uid).get("chat", {}).get(thread_id, False):
        return reply("Nhóm này chưa bật trợ lý AI. Admin bot gõ %schat on để bật." % prefix)

    now = time.time()
    if now - _last_ask.get(author_id, 0) < COOLDOWN_S:
        return reply("Từ từ thôi, đợi %d giây rồi hỏi tiếp nhé." % COOLDOWN_S)
    _last_ask[author_id] = now

    if len(body) > MAX_Q_CHARS:
        return reply("Câu hỏi dài quá (tối đa %d ký tự)." % MAX_Q_CHARS)

    threading.Thread(
        target=_worker, args=(body, message_object, thread_id, thread_type, author_id, client), daemon=True
    ).start()


def get_mitaizl():
    return {"chat": handle_chat_command}
