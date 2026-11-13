# config.py - KHONG chua cookie hay khoa API trong code.
# Doc thong tin tu file ma web panel truyen vao qua bien ZALO_CONFIG
# (neu chay tay thi doc config.json canh file nay).
import json
import os

_path = os.environ.get(
    "ZALO_CONFIG",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json"),
)
try:
    with open(_path, encoding="utf-8") as _f:
        _bot = (json.load(_f).get("data") or [{}])[0]
except Exception:
    _bot = {}

imei = _bot.get("imei", "")
session_cookies = _bot.get("session_cookies", {})
prefix = _bot.get("prefix", "/")

# Tro ly AI (Gemini): web panel truyen vao tung bot. Neu bot khong co khoa rieng
# thi dung bien moi truong GEMINI_API_KEY (dat chung cho ca may chu).
gemini_key = (_bot.get("gemini_key") or os.environ.get("GEMINI_API_KEY") or "").strip()
gemini_model = (_bot.get("gemini_model") or os.environ.get("GEMINI_MODEL") or "").strip()
gemini_prompt = (_bot.get("gemini_prompt") or "").strip()
