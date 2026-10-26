# -*- coding: utf-8 -*-
import os, random, json, requests
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
from zlapi.models import Message

BASE_DIR = "modules/gay"
BG_PATH   = BASE_DIR + "/bg.jpg"
FONT_PATH = BASE_DIR + "/font.ttf"
TEXT_PATH = BASE_DIR + "/text.json"

with open(TEXT_PATH, "r", encoding="utf-8") as f:
    TEXT = json.load(f)

# ================= COMMENT =================
def get_comment(percent):
    for limit, txt in TEXT["comments"]:
        if percent < limit:
            return txt
    return TEXT["comments"][-1][1]

# ================= AUTO WRAP TEXT =================
def draw_multiline(draw, text, x, y, font, max_width, line_height=32):
    words = text.split(" ")
    lines = []
    line = ""

    for w in words:
        test = (line + " " + w).strip()
        box = draw.textbbox((0, 0), test, font=font)
        if box[2] - box[0] <= max_width:
            line = test
        else:
            lines.append(line)
            line = w
    lines.append(line)

    for i, l in enumerate(lines):
        draw.text((x, y + i * line_height), l, font=font,
                  fill=(255,255,255), stroke_width=2, stroke_fill=(0,0,0))

# ================= CREATE IMAGE PRO =================
def create_gay_image(name, avatar_url, percent, out_path):
    # KHÔNG BAO GIỜ BỊ CROP TRÊN ZALO
    W, H = 1024, 1024

    img = Image.open(BG_PATH).convert("RGBA").resize((W, H))
    draw = ImageDraw.Draw(img)

    font_title = ImageFont.truetype(FONT_PATH, 56)
    font_big   = ImageFont.truetype(FONT_PATH, 42)
    font_small = ImageFont.truetype(FONT_PATH, 30)

    TEXT_COLOR   = (255, 255, 255)
    STROKE_COLOR = (0, 0, 0)

    # ===== TITLE =====
    title = TEXT["title"]
    box = draw.textbbox((0, 0), title, font=font_title)
    draw.text(((W - (box[2]-box[0])) // 2, 20),
              title, font=font_title,
              fill=TEXT_COLOR, stroke_width=3, stroke_fill=STROKE_COLOR)

    # ===== AVATAR =====
    avatar = Image.open(BytesIO(requests.get(avatar_url).content)).convert("RGBA")
    avatar = avatar.resize((220, 220))

    mask = Image.new("L", (220, 220), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, 220, 220), fill=255)

    ax, ay = 50, 180
    img.paste(avatar, (ax, ay), mask)
    draw.ellipse((ax-4, ay-4, ax+224, ay+224), outline=TEXT_COLOR, width=4)

    # ===== TEXT INFO =====
    tx = ax + 260
    draw.text((tx, ay+10), f"Tên: {name}",
              font=font_big, fill=TEXT_COLOR,
              stroke_width=2, stroke_fill=STROKE_COLOR)

    draw.text((tx, ay+70), f"Tỉ lệ gay: {percent}%",
              font=font_big, fill=(255, 0, 255),
              stroke_width=2, stroke_fill=(0,0,0))

    # COMMENT AUTO WRAP
    draw_multiline(draw, get_comment(percent), tx, ay+140, font_small, 500)

    # ===== PROGRESS BAR =====
    bw = 500
    bh = 22
    by = ay + 280

    draw.rectangle((tx, by, tx+bw, by+bh), outline=TEXT_COLOR, width=3)
    draw.rectangle((tx, by, tx + int(bw * percent / 100), by+bh),
                   fill=(255, 0, 255))

    # SAVE HIGH QUALITY
    img.save(out_path, "PNG", optimize=True)

# ================= COMMAND =================
def handle_gay_command(message, message_object, thread_id, thread_type, author_id, client):
    out_path = None
    try:
        if message_object.quote:
            uid = message_object.quote.authorId
        elif message_object.mentions:
            uid = message_object.mentions[0].uid
        else:
            uid = author_id  # không tag thì check chính mình

        info = client.fetchUserInfo(uid)
        profile = info.changed_profiles[uid]

        percent = random.randint(0, 100)
        out_path = BASE_DIR + f"/{uid}_gay.png"

        create_gay_image(profile.displayName, profile.avatar, percent, out_path)

        client.sendLocalImage(
            imagePath=out_path,
            message=Message(text=f"🌈 Kết quả scan: {percent}%"),
            thread_id=thread_id,
            thread_type=thread_type
        )

    except Exception as e:
        client.sendMessage(Message(text=f"Gay error: {e}"), thread_id, thread_type)

    finally:
        if out_path and os.path.exists(out_path):
            os.remove(out_path)

def get_mitaizl():
    return {"gay": handle_gay_command}