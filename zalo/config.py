# config.py - KHONG chua cookie trong code.
# Doc thong tin dang nhap tu file ma web panel truyen vao qua bien ZALO_CONFIG
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
