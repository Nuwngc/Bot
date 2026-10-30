# -*- coding: utf-8 -*-
"""
MA SÓI cho bot Zalo (zlapi). Cấu trúc giống các module game khác (baucua, dhbc, taixiu):
    handle_masoi_command(client, message_object, author_id, thread_id, thread_type, message)

Vòng đời ván: SẢNH CHỜ -> ĐÊM -> NGÀY -> BỎ PHIẾU -> ĐÊM -> ... -> KẾT THÚC
  - Sảnh chờ có ảnh nền (lấy ngẫu nhiên từ thư mục background/), hiện avatar người chơi.
  - Hành động ban đêm gửi qua TIN NHẮN RIÊNG với bot.
  - Tài khoản bot (nằm trong admin_bot) gõ lệnh được như admin. Bot không tự chơi (không nhắn riêng cho chính mình được)
    nên nếu bot là chủ phòng thì bot chỉ làm quản trò. Tin nhiều dòng do bot tự gửi (thông báo game) thì bỏ qua.

Lệnh trong nhóm (admin bot bật bằng  {prefix}masoi on):
  {prefix}masoi tao | join | out | start | vote <số> | ds | stop
Lệnh nhắn riêng với bot:
  {prefix}masoi kill|soi|bv|cuu|doc|ban|gheptinh <số>   (hoặc chỉ gõ  {prefix}masoi <số>)
"""
import glob
import os
import random
import threading
import time
from datetime import datetime

import requests
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps
from zlapi.models import Message, ThreadType
from core.bot_sys import is_admin, read_settings, write_settings

BACKGROUND_PATH = "background/"
CACHE_PATH = "modules/cache/"

NIGHT_SEC = int(os.environ.get("MASOI_NIGHT", 70))
DAY_SEC = int(os.environ.get("MASOI_DAY", 90))
VOTE_SEC = int(os.environ.get("MASOI_VOTE", 60))
HUNTER_SEC = int(os.environ.get("MASOI_HUNTER", 45))
MIN_PLAYERS = int(os.environ.get("MASOI_MIN", 4))
MAX_PLAYERS = int(os.environ.get("MASOI_MAX", 16))

SOI, DAN, TIEN_TRI, BAO_VE, THO_SAN, PHU_THUY, CUPID = (
    "Sói", "Dân làng", "Tiên tri", "Bảo vệ", "Thợ săn", "Phù thủy", "Cupid")
ROLE_DESC = {
    SOI: "Mỗi đêm cùng bầy chọn một người để cắn.",
    DAN: "Không có năng lực. Thắng khi diệt hết sói.",
    TIEN_TRI: "Mỗi đêm soi một người để biết họ có phải sói không.",
    BAO_VE: "Mỗi đêm bảo vệ một người. Không bảo vệ cùng một người hai đêm liền.",
    THO_SAN: "Khi bạn chết, bạn được bắn chết theo một người.",
    PHU_THUY: "Bạn có 1 bình cứu và 1 bình độc, mỗi loại dùng một lần cả ván.",
    CUPID: "Đêm đầu bạn ghép đôi hai người yêu nhau; một người chết thì người kia chết theo.",
}

GAMES = {}        # thread_id (nhóm) -> Game
PLAYER_GAME = {}  # user_id -> thread_id của ván đang tham gia (để định tuyến tin nhắn riêng)
_PROFILE = {}     # user_id -> (tên, url avatar)
_AVATAR = {}      # user_id -> ảnh avatar đã tải (hoặc None)
_FONTS = {}


# ===================================================================== tiện ích
def _font(size):
    if size in _FONTS:
        return _FONTS[size]
    here = os.path.dirname(os.path.abspath(__file__))
    roots = ["", os.path.abspath(os.path.join(here, "..", ".."))]
    for name in ("arial unicode ms.otf", "avobold.ttf", "UTMAvoBold.ttf", "arial.ttf", "Kai.ttf"):
        for root in roots:
            path = os.path.join(root, name)
            if os.path.exists(path):
                try:
                    _FONTS[size] = ImageFont.truetype(path, size)
                    return _FONTS[size]
                except Exception:
                    pass
    try:
        _FONTS[size] = ImageFont.load_default(size=size)
    except TypeError:
        _FONTS[size] = ImageFont.load_default()
    return _FONTS[size]


def _profile(client, uid):
    if uid in _PROFILE:
        return _PROFILE[uid]
    name, url = "Người chơi", None
    try:
        p = client.fetchUserInfo(uid).changed_profiles.get(uid)
        if p:
            name = getattr(p, "zaloName", None) or getattr(p, "displayName", None) or name
            url = getattr(p, "avatar", None)
    except Exception as e:
        print(f"[masoi] không lấy được thông tin {uid}: {e}")
    _PROFILE[uid] = (name, url)
    return _PROFILE[uid]


def _avatar(client, uid):
    if uid in _AVATAR:
        return _AVATAR[uid]
    img = None
    url = _profile(client, uid)[1]
    if url:
        try:
            from io import BytesIO
            r = requests.get(url, timeout=5)
            if r.status_code == 200:
                img = Image.open(BytesIO(r.content)).convert("RGBA")
        except Exception as e:
            print(f"[masoi] lỗi tải avatar {uid}: {e}")
    _AVATAR[uid] = img
    return img


def _circle(im, d):
    im = ImageOps.fit(im.convert("RGBA"), (d, d), Image.LANCZOS)
    mask = Image.new("L", (d * 4, d * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, d * 4 - 1, d * 4 - 1), fill=255)
    out = Image.new("RGBA", (d, d), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask.resize((d, d), Image.LANCZOS))
    return out


def _fit_text(draw, text, font, max_w):
    if draw.textlength(text, font=font) <= max_w:
        return text
    while len(text) > 1 and draw.textlength(text + "...", font=font) > max_w:
        text = text[:-1]
    return text + "..."


def _pick_background():
    files = []
    for ext in ("*.jpg", "*.jpeg", "*.png"):
        files += glob.glob(os.path.join(BACKGROUND_PATH, ext))
    return random.choice(files) if files else None


# ===================================================================== ảnh SẢNH CHỜ
def lobby_image(game, title_note=""):
    """Vẽ ảnh sảnh chờ: nền (blur + tối) + trăng + khung kính + avatar người chơi. Trả về (đường dẫn, rộng, cao)."""
    W, cols, cell_h = 1280, 4, 200
    slots = min(MAX_PLAYERS, max(MIN_PLAYERS, len(game.players) + 1))
    rows = (slots + cols - 1) // cols
    H = 330 + rows * cell_h + 120

    if game.bg and os.path.exists(game.bg):
        base = ImageOps.fit(Image.open(game.bg).convert("RGBA"), (W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(6))
    else:
        base = Image.new("RGBA", (W, H), (22, 24, 56, 255))
    base = Image.alpha_composite(base, Image.new("RGBA", (W, H), (8, 10, 30, 160)))

    # trăng lưỡi liềm có quầng sáng
    moon = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(moon)
    cx, cy, r = W - 170, 100, 52
    md.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    md.ellipse((cx - r + 28, cy - r - 12, cx + r + 28, cy + r - 12), fill=0)
    glow = moon.filter(ImageFilter.GaussianBlur(20)).point(lambda v: v // 2)
    base.paste((255, 220, 140, 255), (0, 0), glow)
    base.paste((255, 238, 180, 255), (0, 0), moon)

    d = ImageDraw.Draw(base, "RGBA")
    d.text((70, 52), "MA SÓI", font=_font(96), fill=(255, 255, 255, 255))
    d.text((74, 168), "SẢNH CHỜ" + (f"  -  {title_note}" if title_note else ""), font=_font(40), fill=(255, 196, 120, 255))

    d.rounded_rectangle((50, 235, W - 50, H - 50), radius=44, fill=(14, 16, 42, 175), outline=(255, 255, 255, 50), width=2)
    host = game.host_name
    info = f"Chủ phòng: {host}     {len(game.players)}/{MAX_PLAYERS} người     cần ít nhất {MIN_PLAYERS}"
    d.text((90, 262), _fit_text(d, info, _font(34), W - 180), font=_font(34), fill=(235, 238, 255, 255))

    cell_w = (W - 140) / cols
    for i in range(slots):
        col, row = i % cols, i // cols
        x = int(70 + cell_w * (col + 0.5))
        y = 360 + row * cell_h
        ad = 108
        if i < len(game.players):
            p = game.players[i]
            av = _avatar(game.c, p["id"])
            if av is None:
                av = Image.new("RGBA", (ad, ad), (90 + hash(p["id"]) % 120, 80 + hash(p["id"][::-1]) % 120, 160, 255))
                ImageDraw.Draw(av).text((ad // 2, ad // 2), p["name"][:1].upper(), font=_font(56), fill=(255, 255, 255, 255), anchor="mm")
            ring = (255, 205, 80, 255) if p["id"] == game.host_id else (255, 255, 255, 230)
            d.ellipse((x - ad // 2 - 5, y - 5, x + ad // 2 + 5, y + ad + 5), fill=ring)
            base.paste(_circle(av, ad), (x - ad // 2, y), _circle(av, ad))
            d.ellipse((x - ad // 2 - 8, y - 10, x - ad // 2 + 30, y + 28), fill=(236, 64, 122, 255))
            d.text((x - ad // 2 + 11, y + 9), str(i + 1), font=_font(26), fill=(255, 255, 255, 255), anchor="mm")
            name = _fit_text(d, p["name"], _font(30), cell_w - 24)
            d.text((x, y + ad + 34), name, font=_font(30), fill=(255, 255, 255, 255), anchor="mm")
        else:
            d.ellipse((x - ad // 2, y, x + ad // 2, y + ad), outline=(255, 255, 255, 90), width=3)
            d.text((x, y + ad // 2), "+", font=_font(54), fill=(255, 255, 255, 110), anchor="mm")
            d.text((x, y + ad + 34), "Còn trống", font=_font(28), fill=(255, 255, 255, 110), anchor="mm")

    pre = game.c.prefix
    foot = f"{pre}masoi join     {pre}masoi start     {pre}masoi out"
    d.text((W // 2, H - 100), foot, font=_font(32), fill=(255, 214, 150, 255), anchor="mm")
    d.text((W - 70, H - 26), datetime.now().strftime("%H:%M  %d/%m/%Y"), font=_font(24), fill=(210, 214, 235, 220), anchor="rm")

    os.makedirs(CACHE_PATH, exist_ok=True)
    path = os.path.join(CACHE_PATH, f"masoi_lobby_{game.tid}.png")
    base.convert("RGB").save(path)
    return path, W, H


# ===================================================================== ván chơi
class Game:
    def __init__(self, client, thread_id, thread_type, host_id, host_name, host_plays=True):
        self.c, self.tid, self.ttype = client, thread_id, thread_type
        self.host_id, self.host_name, self.host_plays = host_id, host_name, host_plays
        self.phase = "LOBBY"
        self.players = [{"id": host_id, "name": host_name, "role": None, "alive": True}] if host_plays else []
        self.bg = _pick_background()
        self.timer, self.tok = None, 0
        self.lock = threading.RLock()
        self.night = 0
        self.last_protected = None
        self.night_actions = {}
        self.votes = {}
        self.lovers = None
        self.cupid_done = False
        self.witch = {"heal": True, "poison": True}
        self.pending_hunter = None
        self.night_resolved = False   # đêm đã chốt kết quả thì không nhận thêm hành động
        if host_plays:
            PLAYER_GAME[host_id] = thread_id

    # ---- gửi tin
    def say(self, text):
        try:
            self.c.sendMessage(Message(text=text), thread_id=self.tid, thread_type=self.ttype)
        except Exception as e:
            print(f"[masoi] lỗi gửi nhóm: {e}")

    def dm(self, uid, text):
        try:
            self.c.sendMessage(Message(text=text), thread_id=uid, thread_type=ThreadType.USER)
            return True
        except Exception as e:
            print(f"[masoi] lỗi nhắn riêng {uid}: {e}")
            return False

    def send_lobby(self, caption, note=""):
        path = None
        try:
            path, w, h = lobby_image(self, note)
            self.c.sendLocalImage(path, message=Message(text=caption), thread_id=self.tid,
                                  thread_type=self.ttype, width=w, height=h)
        except Exception as e:
            print(f"[masoi] lỗi ảnh sảnh chờ: {e}")
            self.say(f"{caption}\n{self.roster(self.players)}")
        finally:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass

    # ---- tiện ích trạng thái
    def alive(self):
        return [p for p in self.players if p["alive"]]

    def wolves(self):
        return [p for p in self.alive() if p["role"] == SOI]

    def by_id(self, uid):
        return next((p for p in self.players if p["id"] == uid), None)

    def has(self, role):
        return any(p["role"] == role for p in self.alive())

    @staticmethod
    def roster(lst):
        return "\n".join(f"{i + 1}. {p['name']}" for i, p in enumerate(lst))

    @staticmethod
    def target_from(args, lst):
        try:
            n = int(args[0])
        except (IndexError, ValueError):
            return None
        return lst[n - 1] if 1 <= n <= len(lst) else None

    # ---- hẹn giờ (mỗi lần đặt hẹn giờ mới thì hẹn giờ cũ vô hiệu)
    def set_timer(self, fn, sec):
        self.cancel_timer()
        self.tok += 1
        t = threading.Timer(sec, self._run, args=(fn, self.tok))
        t.daemon = True
        self.timer = t
        t.start()

    def cancel_timer(self):
        self.tok += 1
        if self.timer:
            self.timer.cancel()
            self.timer = None

    def _run(self, fn, tok):
        with self.lock:
            if tok != self.tok:
                return
            try:
                fn()
            except Exception as e:
                print(f"[masoi] lỗi trong ván: {e}")

    # ---- sảnh chờ
    def join(self, uid, name):
        if self.phase != "LOBBY":
            return "Ván đã bắt đầu, không vào được nữa."
        if str(uid) == str(getattr(self.c, "uid", "")):
            return "Tài khoản bot không chơi được (không tự nhắn riêng cho mình được). Hãy dùng tài khoản khác để chơi."
        if self.by_id(uid):
            return f"{name} đã ở trong phòng rồi."
        if uid in PLAYER_GAME and PLAYER_GAME[uid] != self.tid:
            return "Bạn đang tham gia một ván khác."
        if len(self.players) >= MAX_PLAYERS:
            return f"Phòng đã đủ {MAX_PLAYERS} người."
        self.players.append({"id": uid, "name": name, "role": None, "alive": True})
        PLAYER_GAME[uid] = self.tid
        self.send_lobby(f"{name} đã vào phòng. ({len(self.players)} người)")
        return None

    def leave(self, uid):
        if self.phase != "LOBBY":
            return "Ván đang chơi, không rời phòng được."
        p = self.by_id(uid)
        if not p:
            return "Bạn không ở trong phòng."
        self.players.remove(p)
        PLAYER_GAME.pop(uid, None)
        if not self.players and self.host_plays:
            self.finish_cleanup()
            self.say("Phòng trống, đã đóng sảnh chờ.")
            return None
        if uid == self.host_id and self.host_plays and self.players:
            self.host_id, self.host_name = self.players[0]["id"], self.players[0]["name"]
        self.send_lobby(f"{p['name']} đã rời phòng. ({len(self.players)} người)")
        return None

    def start(self, uid):
        if self.phase != "LOBBY":
            return "Ván đã bắt đầu rồi."
        if uid != self.host_id and not self.by_id(uid):
            return "Chỉ người trong phòng mới bắt đầu được."
        if len(self.players) < MIN_PLAYERS:
            return f"Cần ít nhất {MIN_PLAYERS} người. Đang có {len(self.players)}."
        self.assign_roles()
        self.send_lobby(f"Ván bắt đầu với {len(self.players)} người! Số sói: {len(self.wolves())}.\nKiểm tra tin nhắn riêng để biết vai trò.", "ĐÃ BẮT ĐẦU")
        self.send_roles()
        self.to_night()
        return None

    def assign_roles(self):
        n = len(self.players)
        roles = [SOI] * max(1, n // 4)
        if n >= 5: roles.append(TIEN_TRI)
        if n >= 6: roles.append(BAO_VE)
        if n >= 7: roles.append(THO_SAN)
        if n >= 8: roles.append(PHU_THUY)
        if n >= 9: roles.append(CUPID)
        while len(roles) < n:
            roles.append(DAN)
        random.shuffle(roles)
        for p, r in zip(self.players, roles):
            p["role"] = r
            PLAYER_GAME[p["id"]] = self.tid

    def send_roles(self):
        names = ", ".join(w["name"] for w in self.wolves())
        failed = []
        for p in self.players:
            text = f"Vai trò của bạn: {p['role'].upper()}\n{ROLE_DESC[p['role']]}"
            if p["role"] == SOI and len(self.wolves()) > 1:
                text += f"\n\nĐồng đội: {names}"
            if not self.dm(p["id"], text):
                failed.append(p["name"])
        if failed:
            self.say(f"Không nhắn riêng được cho: {', '.join(failed)}. Hãy nhắn cho bot một câu để mở hội thoại.")

    # ---- ĐÊM
    def to_night(self):
        self.phase = "NIGHT"
        self.night += 1
        self.night_resolved = False
        self.night_actions = {"kill": {}, "protect": None, "seer": None, "witch_done": False,
                              "heal": False, "heal_target": None, "poison": None}
        lst = self.alive()
        pre = self.c.prefix
        self.say(f"--- ĐÊM {self.night} ---\nCả làng đi ngủ. Người có chức năng kiểm tra tin nhắn riêng.\nCòn sống ({len(lst)}):\n{self.roster(lst)}")

        def menu(verb, cmd):
            return f"ĐÊM {self.night}. {verb}\n{self.roster(lst)}\n\nGõ: {pre}masoi {cmd} <số>"

        for p in lst:
            r = p["role"]
            if r == SOI:
                self.dm(p["id"], menu("Chọn người để cắn:", "kill"))
            elif r == TIEN_TRI:
                self.dm(p["id"], menu("Chọn người để soi:", "soi"))
            elif r == BAO_VE:
                self.dm(p["id"], menu("Chọn người để bảo vệ:", "bv"))
            elif r == CUPID and self.night == 1 and not self.cupid_done:
                self.dm(p["id"], f"ĐÊM 1. Ghép đôi yêu nhau:\n{self.roster(lst)}\n\n{pre}masoi gheptinh <số1> <số2>")
            elif r == PHU_THUY:
                t = f"ĐÊM {self.night}. Phù thủy.\n"
                t += f"{pre}masoi cuu - cứu người bị cắn đêm nay\n" if self.witch["heal"] else "(đã dùng bình cứu)\n"
                t += f"{pre}masoi doc <số> - đầu độc một người\n{self.roster(lst)}" if self.witch["poison"] else "(đã dùng bình độc)"
                if self.witch["heal"] or self.witch["poison"]:
                    t += f"\n\n{pre}masoi bo - không dùng bình đêm nay"
                self.dm(p["id"], t)
        self.set_timer(self.resolve_night, NIGHT_SEC)

    def wolf_victim(self):
        tally = {}
        for t in self.night_actions["kill"].values():
            tally[t] = tally.get(t, 0) + 1
        victim, best = None, 0
        for uid, c in tally.items():
            if c > best:
                victim, best = uid, c
        return victim

    def resolve_night(self):
        if self.phase != "NIGHT" or self.night_resolved:
            return
        self.night_resolved = True
        self.cancel_timer()
        na = self.night_actions
        deaths = []
        victim = self.wolf_victim()
        if victim:
            saved = victim == na["protect"] or (na["heal"] and na["heal_target"] == victim)
            if not saved:
                deaths.append(victim)
        if na["poison"] and na["poison"] not in deaths:
            deaths.append(na["poison"])
        self.last_protected = na["protect"]
        self.say(f"--- SÁNG NGÀY {self.night} ---")
        self.apply_deaths(deaths, "đêm qua")
        self.after_deaths(to="day")

    def after_deaths(self, to):
        if self.phase == "ENDED":
            return
        if self.check_win() or self.pending_hunter:
            return
        self.to_day() if to == "day" else self.to_night()

    def apply_deaths(self, ids, when):
        queue, dead = list(ids), []
        while queue:
            uid = queue.pop(0)
            p = self.by_id(uid)
            if not p or not p["alive"]:
                continue
            p["alive"] = False
            dead.append(p)
            if self.lovers and uid in self.lovers:
                other = self.by_id(self.lovers[1] if self.lovers[0] == uid else self.lovers[0])
                if other and other["alive"]:
                    queue.append(other["id"])
                    self.say(f"💔 {other['name']} là người yêu của {p['name']}, sẽ chết theo.")
            if p["role"] == THO_SAN:
                self.pending_hunter = p["id"]
        if not dead:
            self.say(f"Không ai chết {when}.".replace("  ", " "))
        else:
            self.say("\n".join(f"☠️ {p['name']} đã chết. Vai trò: {p['role']}." for p in dead))
        if self.pending_hunter:
            h = self.by_id(self.pending_hunter)
            self.say(f"{h['name']} là THỢ SĂN! Chờ thợ săn chọn bắn một người (nhắn riêng cho bot).")
            lst = self.alive()
            self.dm(h["id"], f"Bạn chết nhưng được bắn theo một người:\n{self.roster(lst)}\n\n{self.c.prefix}masoi ban <số>  (hoặc ban 0 để bỏ qua)")
            self.set_timer(lambda: self.finish_hunter(None), HUNTER_SEC)

    def finish_hunter(self, target_id):
        if not self.pending_hunter:
            return
        h = self.by_id(self.pending_hunter)
        self.pending_hunter = None
        if target_id:
            t = self.by_id(target_id)
            if t and t["alive"]:
                self.say(f"🏹 {h['name']} bắn chết {t['name']}.")
                self.apply_deaths([target_id], "")
        else:
            self.say(f"{h['name']} không bắn ai.")
        if self.phase == "ENDED" or self.check_win() or self.pending_hunter:
            return
        if self.phase == "NIGHT":
            self.to_day()
        elif self.phase == "VOTE":
            self.to_night()

    # ---- NGÀY / BỎ PHIẾU
    def to_day(self):
        self.phase = "DAY"
        lst = self.alive()
        self.say(f"Thảo luận {DAY_SEC}s. Còn sống ({len(lst)}):\n{self.roster(lst)}")
        self.set_timer(self.to_vote, DAY_SEC)

    def to_vote(self):
        self.phase = "VOTE"
        self.votes = {}
        lst = self.alive()
        self.say(f"--- BỎ PHIẾU ---\n{self.roster(lst)}\n\nGõ {self.c.prefix}masoi vote <số> để treo cổ. {VOTE_SEC}s.")
        self.set_timer(self.resolve_vote, VOTE_SEC)

    def vote(self, uid, args):
        if self.phase != "VOTE":
            return "Chưa đến giờ bỏ phiếu."
        voter = self.by_id(uid)
        if not voter or not voter["alive"]:
            return "Bạn không có quyền bỏ phiếu."
        lst = self.alive()
        target = self.target_from(args, lst)
        if not target:
            return f"Số không hợp lệ. {self.c.prefix}masoi vote 1..{len(lst)}"
        self.votes[uid] = target["id"]
        self.say(f"{voter['name']} bỏ phiếu cho {target['name']}. ({len(self.votes)}/{len(lst)})")
        if len(self.votes) >= len(lst):
            self.resolve_vote()
        return None

    def resolve_vote(self):
        if self.phase != "VOTE":
            return
        self.cancel_timer()
        tally = {}
        for t in self.votes.values():
            tally[t] = tally.get(t, 0) + 1
        top, best = [], 0
        for uid, c in tally.items():
            if c > best:
                top, best = [uid], c
            elif c == best:
                top.append(uid)
        if len(top) != 1 or best == 0:
            self.say("Phiếu hoà hoặc không ai bỏ phiếu. Không ai bị treo cổ.")
        else:
            self.say("Làng quyết định treo cổ...")
            self.apply_deaths([top[0]], "")
        self.after_deaths(to="night")

    # ---- kết thúc
    def check_win(self):
        if self.lovers:
            a, b = self.by_id(self.lovers[0]), self.by_id(self.lovers[1])
            if a and b and a["alive"] and b["alive"] and len(self.alive()) == 2:
                return self.end(f"💞 CẶP ĐÔI YÊU NHAU THẮNG! {a['name']} và {b['name']} là hai người cuối cùng.")
        w = len(self.wolves())
        v = len(self.alive()) - w
        if w == 0:
            return self.end("DÂN LÀNG THẮNG! Toàn bộ sói đã bị tiêu diệt.")
        if w >= v:
            return self.end("PHE SÓI THẮNG! Số sói đã bằng hoặc vượt số dân.")
        return False

    def end(self, text):
        self.phase = "ENDED"
        self.cancel_timer()
        reveal = "\n".join(f"{p['name']}: {p['role']}{'' if p['alive'] else ' (chết)'}" for p in self.players)
        self.say(f"{text}\n\n--- VAI TRÒ ---\n{reveal}")
        self.finish_cleanup()
        return True

    def finish_cleanup(self):
        self.cancel_timer()
        for p in self.players:
            if PLAYER_GAME.get(p["id"]) == self.tid:
                PLAYER_GAME.pop(p["id"], None)
        if GAMES.get(self.tid) is self:
            GAMES.pop(self.tid, None)

    def stop(self):
        if self.phase == "LOBBY":
            self.say("Đã huỷ phòng chờ.")
            self.phase = "ENDED"
            self.finish_cleanup()
        else:
            self.end("Ván đấu đã bị huỷ.")

    # ---- hành động qua tin nhắn riêng
    def _err(self, uid, lst):
        self.dm(uid, f"Số không hợp lệ. Chọn 1..{len(lst)}")

    def maybe_early_night(self):
        if self.phase != "NIGHT" or self.night_resolved:
            return
        na = self.night_actions
        witch_waiting = (self.has(PHU_THUY) and (self.witch["heal"] or self.witch["poison"]) and not na["witch_done"])
        done = (len(na["kill"]) >= len(self.wolves()) and not witch_waiting
                and (not self.has(TIEN_TRI) or na["seer"])
                and (not self.has(BAO_VE) or na["protect"])
                and (self.night != 1 or not self.has(CUPID) or self.cupid_done))
        if done:
            self.resolve_night()

    def handle_dm(self, uid, cmd, args):
        me = self.by_id(uid)
        if not me:
            return
        if self.phase == "LOBBY":
            return self.dm(uid, "Ván chưa bắt đầu.")
        alias = {"can": "kill", "cắn": "kill", "baove": "bv", "cứu": "cuu", "độc": "doc", "bắn": "ban", "ghep": "gheptinh"}
        cmd = alias.get(cmd, cmd)
        if cmd.isdigit():  # chỉ gõ số: dùng năng lực chính của vai trò
            args = [cmd] + list(args)
            cmd = ("ban" if self.pending_hunter == uid else
                   "gheptinh" if me["role"] == CUPID else
                   {SOI: "kill", TIEN_TRI: "soi", BAO_VE: "bv", PHU_THUY: "doc"}.get(me["role"], ""))
        lst = self.alive()
        target = self.target_from(args, lst)

        if cmd == "ban" and self.pending_hunter == uid:
            if args and args[0] == "0":
                return self.finish_hunter(None)
            if not target:
                return self._err(uid, lst)
            return self.finish_hunter(target["id"])

        if cmd == "gheptinh" and me["role"] == CUPID and self.night == 1 and not self.cupid_done:
            a = self.target_from(args[:1], lst)
            b = self.target_from(args[1:2], lst)
            if not a or not b or a["id"] == b["id"]:
                return self.dm(uid, "Chọn hai số khác nhau.")
            self.lovers, self.cupid_done = [a["id"], b["id"]], True
            self.dm(uid, f"Đã ghép {a['name']} ❤ {b['name']}.")
            self.dm(a["id"], f"💘 Bạn yêu {b['name']}. Một trong hai chết, người kia chết theo.")
            self.dm(b["id"], f"💘 Bạn yêu {a['name']}. Một trong hai chết, người kia chết theo.")
            return self.maybe_early_night()

        if not me["alive"]:
            return self.dm(uid, "Bạn đã chết, không thể hành động.")
        if self.phase != "NIGHT" or self.night_resolved:
            return self.dm(uid, "Hiện không phải lúc hành động ban đêm.")
        na = self.night_actions
        if cmd == "kill" and me["role"] == SOI:
            if not target:
                return self._err(uid, lst)
            if target["id"] == uid:
                return self.dm(uid, "Không thể tự cắn mình.")
            na["kill"][uid] = target["id"]
            self.dm(uid, f"Đã chọn cắn {target['name']}.")
            return self.maybe_early_night()
        if cmd == "soi" and me["role"] == TIEN_TRI:
            if not target:
                return self._err(uid, lst)
            na["seer"] = target["id"]
            self.dm(uid, f"{target['name']} {'LÀ SÓI.' if target['role'] == SOI else 'KHÔNG phải sói.'}")
            return self.maybe_early_night()
        if cmd == "bv" and me["role"] == BAO_VE:
            if not target:
                return self._err(uid, lst)
            if target["id"] == self.last_protected:
                return self.dm(uid, "Không được bảo vệ cùng một người hai đêm liền.")
            na["protect"] = target["id"]
            self.dm(uid, f"Đã bảo vệ {target['name']}.")
            return self.maybe_early_night()
        if cmd == "cuu" and me["role"] == PHU_THUY:
            if not self.witch["heal"]:
                return self.dm(uid, "Bạn đã dùng bình cứu rồi.")
            v = self.wolf_victim()
            if not v:
                return self.dm(uid, "Đêm nay chưa ai bị cắn để cứu.")
            na["heal"], na["heal_target"], self.witch["heal"], na["witch_done"] = True, v, False, True
            self.dm(uid, f"Đã cứu {self.by_id(v)['name']}.")
            return self.maybe_early_night()
        if cmd in ("bo", "boqua", "skip") and me["role"] == PHU_THUY:
            na["witch_done"] = True
            self.dm(uid, "Đêm nay bạn không dùng bình.")
            return self.maybe_early_night()
        if cmd == "doc" and me["role"] == PHU_THUY:
            if not self.witch["poison"]:
                return self.dm(uid, "Bạn đã dùng bình độc rồi.")
            if not target:
                return self._err(uid, lst)
            na["poison"], self.witch["poison"], na["witch_done"] = target["id"], False, True
            self.dm(uid, f"Đã đầu độc {target['name']}.")
            return self.maybe_early_night()


# ===================================================================== lệnh
def _help(prefix):
    return (
        f"🐺 MA SÓI (từ {MIN_PLAYERS} người)\n"
        f"{prefix}masoi tao - mở sảnh chờ\n"
        f"{prefix}masoi join - vào phòng\n"
        f"{prefix}masoi out - rời phòng\n"
        f"{prefix}masoi start - bắt đầu ván\n"
        f"{prefix}masoi vote <số> - bỏ phiếu treo cổ\n"
        f"{prefix}masoi ds - xem sảnh chờ\n"
        f"{prefix}masoi stop - huỷ ván\n\n"
        f"Hành động ban đêm: nhắn RIÊNG cho bot  {prefix}masoi <số>  "
        f"(hoặc kill / soi / bv / cuu / doc / bo / ban / gheptinh)."
    )


def _set_enabled(client, thread_id, value):
    settings = read_settings(client.uid)
    settings.setdefault("masoi", {})[thread_id] = value
    write_settings(client.uid, settings)


def _is_boss(client, uid):
    """Admin bot, hoặc chính tài khoản bot (bot tự nằm trong admin_bot khi khởi động)."""
    return str(uid) == str(getattr(client, "uid", "")) or is_admin(client, uid)


def _enabled(client, thread_id):
    return bool(read_settings(client.uid).get("masoi", {}).get(thread_id, False))


def handle_masoi_command(client, message_object, author_id, thread_id, thread_type, message):
    try:
        text = message.text if isinstance(message, Message) else str(message)
        # Tài khoản bot gõ lệnh là hợp lệ (bot cũng là admin). Chỉ bỏ qua tin NHIỀU DÒNG do chính bot tự gửi
        # (thông báo game), để không bao giờ tự kích hoạt lệnh.
        if str(author_id) == str(getattr(client, "uid", "")) and "\n" in text.strip():
            return
        parts = text.strip().split()
        sub = parts[1].lower() if len(parts) > 1 else ""
        args = parts[2:]

        def reply(msg):
            client.replyMessage(Message(text=msg), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)

        # ---------- tin nhắn riêng: hành động ban đêm
        if thread_type == ThreadType.USER:
            tid = PLAYER_GAME.get(author_id)
            game = GAMES.get(tid)
            if not game:
                return reply("Bạn chưa ở trong ván ma sói nào. Vào nhóm và gõ " + f"{client.prefix}masoi join.")
            if not sub:
                return reply(_help(client.prefix))
            with game.lock:
                game.handle_dm(author_id, sub, args)
            return

        # ---------- nhóm
        if sub == "on" or sub == "off":
            if not _is_boss(client, author_id):
                return reply("❌ Bạn không phải admin bot!")
            _set_enabled(client, thread_id, sub == "on")
            return reply(f"🐺 Ma sói đã {'BẬT' if sub == 'on' else 'TẮT'} trong nhóm này.")
        if not _enabled(client, thread_id):
            return reply(f"Ma sói chưa bật ở nhóm này. Admin bot gõ {client.prefix}masoi on.")

        name = _profile(client, author_id)[0]
        game = GAMES.get(thread_id)

        if sub in ("", "help", "menu"):
            return reply(_help(client.prefix))
        if sub in ("tao", "create", "new", "mo"):
            if game:
                return reply("Nhóm đang có phòng ma sói rồi. Gõ ds để xem sảnh chờ.")
            if author_id in PLAYER_GAME and str(author_id) != str(client.uid):
                return reply("Bạn đang tham gia một ván khác.")
            game = Game(client, thread_id, thread_type, author_id, name, host_plays=str(author_id) != str(client.uid))
            GAMES[thread_id] = game
            with game.lock:
                game.send_lobby(f"Sảnh chờ ma sói đã mở! {client.prefix}masoi join để vào, {client.prefix}masoi start để bắt đầu.\n"
                                "LƯU Ý: hãy nhắn cho bot một câu trước khi chơi để nhận vai trò.")
            return
        if not game:
            return reply(f"Chưa có phòng. Gõ {client.prefix}masoi tao để mở sảnh chờ.")

        with game.lock:
            err = None
            if sub in ("join", "vao"):
                err = game.join(author_id, name)
            elif sub in ("out", "roi", "leave"):
                err = game.leave(author_id)
            elif sub in ("start", "batdau"):
                err = game.start(author_id)
            elif sub in ("vote", "bau"):
                err = game.vote(author_id, args)
            elif sub in ("ds", "list", "sanh"):
                game.send_lobby("Sảnh chờ ma sói" if game.phase == "LOBBY" else f"Ván đang ở đêm/ngày {game.night}",
                                "" if game.phase == "LOBBY" else "ĐANG CHƠI")
            elif sub in ("stop", "huy"):
                if author_id != game.host_id and not _is_boss(client, author_id):
                    err = "Chỉ chủ phòng hoặc admin bot mới huỷ được."
                else:
                    game.stop()
            else:
                err = _help(client.prefix)
            if err:
                reply(err)
    except Exception as e:
        print(f"[masoi] lỗi lệnh: {e}")
        try:
            client.sendMessage(Message(text=f"🐞 Lỗi ma sói: {e}"), thread_id=thread_id, thread_type=thread_type)
        except Exception:
            pass
