import colorsys
from datetime import datetime, timedelta, timezone
import glob
from io import BytesIO
import os
import random
from typing import List, Tuple
from PIL import Image, ImageDraw, ImageFont
import emoji
import requests
from core.bot_sys import is_admin
from modules.AI_GEMINI.pro_gemini import get_user_name_by_id
from zlapi.models import *
from PIL import ImageFilter

BACKGROUND_PATH = "background/"
CACHE_PATH = "modules/cache/"
OUTPUT_IMAGE_PATH = os.path.join(CACHE_PATH, "menu.png")

def handle_menu_commands(message, message_object, thread_id, thread_type, author_id, bot):
    command_names = "".join([
        f"{get_user_name_by_id(bot, author_id)}\n"
        f"➜ ♨️ Bot ({bot.prefix}bot)\n"
        f"➜ 📢 Translate ({bot.prefix}dich)\n"
        f"➜ ⛅ Thời tiết ({bot.prefix}weather)\n"
        f"➜ 🤭 Thả thính ({bot.prefix}love)\n"
        f"➜ 🗯 Chat AI ({bot.prefix}chat)\n"
        f"➜ 🩴 Zét Lờ Ô A ({bot.prefix}zl)\n"
        f"➜ 🎮 Game ({bot.prefix}bc {bot.prefix}tx)\n"
        f"➜ 🍼 Tính năng khác ({bot.prefix}or)\n"
        f"➜ 💌 Share code ({bot.prefix}share)\n"
        f"➜ 👩‍💼 ảnh gái ({bot.prefix}girl)\n"
        f"➜ 🗞️ Tin tức ({bot.prefix}news)\n"
        f"➜ 🧨 Spam ({bot.prefix}war)\n"
        f"➜ 💬 Nội dung ({bot.prefix}text)\n"
        f"➜ 📀 Video gái ({bot.prefix}vdgirl)\n"
        f"➜ ☁️ Soundcloud ({bot.prefix}scl)\n"
        f"➜ 🐳 Tính năng ẩn ({bot.prefix}hiden)\n"
    ])

    image_path = generate_menu_image(bot, author_id, thread_id, thread_type)
    reaction = [
        "❌", "🤧", "🐞", "😊", "🔥", "👍", "💖", "🚀",
        "😍", "😂", "😢", "😎", "🙌", "💪", "🌟", "🍀",
        "🎉", "🦁", "🌈", "🍎", "⚡", "🔔", "🎸", "🍕",
        "🏆", "📚", "🦋", "🌍", "⛄", "🎁", "💡", "🐾",
        "😺", "🐶", "🐳", "🦄", "🌸", "🍉", "🍔", "🎄",
        "🎃", "👻", "☃️", "🌴", "🏀", "⚽", "🎾", "🏈",
        "🚗", "✈️", "🚢", "🌙", "☀️", "⭐", "⛅", "☔",
        "⌛", "⏰", "💎", "💸", "📷", "🎥", "🎤", "🎧",
        "🍫", "🍰", "🍩", "☕", "🍵", "🍷", "🍹", "🥐",
        "🐘", "🦒", "🐍", "🦜", "🐢", "🦀", "🐙", "🦈",
        "🍓", "🍋", "🍑", "🥥", "🥐", "🥪", "🍝", "🍣",
        "🎲", "🎯", "🎱", "🎮", "🎰", "🧩", "🧸", "🎡",
        "🏰", "🗽", "🗼", "🏔️", "🏝️", "🏜️", "🌋", "⛲",
        "📱", "💻", "🖥️", "🖨️", "⌨️", "🖱️", "📡", "🔋",
        "🔍", "🔎", "🔑", "🔒", "🔓", "📩", "📬", "📮",
        "💢", "💥", "💫", "💦", "💤", "🚬", "💣", "🔫",
        "🩺", "💉", "🩹", "🧬", "🔬", "🔭", "🧪", "🧫",
        "🧳", "🎒", "👓", "🕶️", "👔", "👗", "👠", "🧢",
        "🦷", "🦴", "👀", "👅", "👄", "👶", "👩", "👨",
        "🚶", "🏃", "💃", "🕺", "🧘", "🏄", "🏊", "🚴",
        "🍄", "🌾", "🌻", "🌵", "🌿", "🍂", "🍁", "🌊",
        "🛠️", "🔧", "🔨", "⚙️", "🪚", "🪓", "🧰", "⚖️",
        "🧲", "🪞", "🪑", "🛋️", "🛏️", "🪟", "🚪", "🧹"
    ]
    bot.sendReaction(message_object, random.choice(reaction), thread_id, thread_type)
    bot.sendLocalImage(
        imagePath=image_path,
        message=Message(text=command_names, mention=Mention(author_id, length=len(f"{get_user_name_by_id(bot, author_id)}"), offset=0)),
        thread_id=thread_id,
        thread_type=thread_type,
        width=1920,
        height=600,
        ttl=60000
    )
    try:
        os.remove(image_path)
    except Exception as e:
        print(f"❌ Lỗi khi xóa ảnh: {e}")

def get_dominant_color(image_path):
    try:
        if not os.path.exists(image_path):
            print(f"File ảnh không tồn tại: {image_path}")
            return (0, 0, 0)

        img = Image.open(image_path).convert("RGB")
        img = img.resize((150, 150), Image.Resampling.LANCZOS)
        pixels = img.getdata()

        if not pixels:
            print(f"Không thể lấy dữ liệu pixel từ ảnh: {image_path}")
            return (0, 0, 0)

        r, g, b = 0, 0, 0
        for pixel in pixels:
            r += pixel[0]
            g += pixel[1]
            b += pixel[2]
        total = len(pixels)
        if total == 0:
            return (0, 0, 0)
        r, g, b = r // total, g // total, b // total
        return (r, g, b)

    except Exception as e:
        print(f"Lỗi khi phân tích màu nổi bật: {e}")
        return (0, 0, 0)

def get_contrasting_color(base_color, alpha=255):
    r, g, b = base_color[:3]
    luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return (255, 255, 255, alpha) if luminance < 0.5 else (0, 0, 0, alpha)

def random_contrast_color(base_color):
    r, g, b, _ = base_color
    box_luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    
    if box_luminance > 0.5:
        r = random.randint(0, 50)
        g = random.randint(0, 50)
        b = random.randint(0, 50)
    else:
        r = random.randint(200, 255)
        g = random.randint(200, 255)
        b = random.randint(200, 255)
    
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    s = min(1.0, s + 0.9)
    v = min(1.0, v + 0.7)
    
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    
    text_luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    if abs(text_luminance - box_luminance) < 0.3:
        if box_luminance > 0.5:
            r, g, b = colorsys.hsv_to_rgb(h, s, min(1.0, v * 0.4))
        else:
            r, g, b = colorsys.hsv_to_rgb(h, s, min(1.0, v * 1.7))
    
    return (int(r * 255), int(g * 255), int(b * 255), 255)

def download_avatar(avatar_url, save_path=os.path.join(CACHE_PATH, "user_avatar.png")):
    try:
        resp = requests.get(avatar_url, stream=True, timeout=5) 
        if resp.status_code == 200:
            with open(save_path, "wb") as f:
                for chunk in resp.iter_content(1024):
                    f.write(chunk)
            return save_path
    except Exception as e:
        print(f"❌ Lỗi tải avatar: {e}")
    return None

def generate_menu_image(self, author_id, thread_id, thread_type):
    images = glob.glob(BACKGROUND_PATH + "*.jpg") + glob.glob(BACKGROUND_PATH + "*.png") + glob.glob(BACKGROUND_PATH + "*.jpeg")
    if not images:
        print("❌ Không tìm thấy ảnh trong thư mục background/")
        return None  

    image_path = random.choice(images)

    try:
        size = (1920, 600)
        final_size = (1280, 380)
        bg_image = Image.open(image_path).convert("RGBA").resize(size, Image.Resampling.LANCZOS)
        bg_image = bg_image.filter(ImageFilter.GaussianBlur(radius=7))  
        overlay = Image.new("RGBA", size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        dominant_color = get_dominant_color(image_path)
        r, g, b = dominant_color
        luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

        box_colors = [
            (255, 20, 147, 90),
            (128, 0, 128, 90),
            (0, 100, 0, 90),
            (0, 0, 139, 90),
            (184, 134, 11, 90),
            (138, 3, 3, 90),
            (0, 0, 0, 90)
        ]

        box_color = random.choice(box_colors)

        box_x1, box_y1 = 90, 60
        box_x2, box_y2 = size[0] - 90, size[1] - 60
        draw.rounded_rectangle([(box_x1, box_y1), (box_x2, box_y2)], radius=75, fill=box_color)

        font_arial_path = "arial unicode ms.otf"
        font_emoji_path = "emoji.ttf"
        
        try:
            font_text_large = ImageFont.truetype(font_arial_path, 76)  
            font_text_big = ImageFont.truetype(font_arial_path, 68)  
            font_text_small = ImageFont.truetype(font_arial_path, 64)  
            font_text_bot = ImageFont.truetype(font_arial_path, 58)  
            font_time = ImageFont.truetype(font_arial_path, 56)
            font_icon = ImageFont.truetype(font_emoji_path, 60)
            font_icon_large = ImageFont.truetype(font_emoji_path, 175)
            font_name = ImageFont.truetype(font_emoji_path, 60)
        except Exception as e:
            print(f"❌ Lỗi tải font: {e}")
            font_text_large = ImageFont.load_default()
            font_text_big = ImageFont.load_default()
            font_text_small = ImageFont.load_default()
            font_text_bot = ImageFont.load_default()
            font_time = ImageFont.load_default()
            font_icon = ImageFont.load_default()
            font_icon_large = ImageFont.load_default()
            font_name = ImageFont.load_default()

        def draw_text_with_shadow(draw, position, text, font, fill, shadow_color=(0, 0, 0, 250), shadow_offset=(2, 2)):
            x, y = position
            draw.text((x + shadow_offset[0], y + shadow_offset[1]), text, font=font, fill=shadow_color)
            draw.text((x, y), text, font=font, fill=fill)

        vietnam_now = datetime.now(timezone(timedelta(hours=7)))
        hour = vietnam_now.hour
        formatted_time = vietnam_now.strftime("%H:%M")
        time_icon = "🌤️" if 6 <= hour < 18 else "🌙"
        time_text = f" {formatted_time}"
        time_x = box_x2 - 250
        time_y = box_y1 + 10
        
        box_rgb = box_color[:3]
        box_luminance = (0.299 * box_rgb[0] + 0.587 * box_rgb[1] + 0.114 * box_rgb[2]) / 255
        last_lines_color = (255, 255, 255, 220) if box_luminance < 0.5 else (0, 0, 0, 220)

        time_color = last_lines_color

        if time_x >= 0 and time_y >= 0 and time_x < size[0] and time_y < size[1]:
            try:
                icon_x = time_x - 75
                icon_color = random_contrast_color(box_color)
                draw_text_with_shadow(draw, (icon_x, time_y - 8), time_icon, font_icon, icon_color, shadow_offset=(2, 2))
                draw.text((time_x, time_y), time_text, font=font_time, fill=time_color)
            except Exception as e:
                print(f"❌ Lỗi vẽ thời gian lên ảnh: {e}")
                draw_text_with_shadow(draw, (time_x - 75, time_y - 8), "⏰", font_icon, (255, 255, 255, 255), shadow_offset=(2, 2))
                draw.text((time_x, time_y), " ??;??", font=font_time, fill=time_color)

        user_info = self.fetchUserInfo(author_id) if author_id else None
        if user_info and hasattr(user_info, 'changed_profiles') and author_id in user_info.changed_profiles:
            user = user_info.changed_profiles[author_id]
            user_name = getattr(user, 'name', None) or getattr(user, 'displayName', None) or f"ID_{author_id}"

        greeting_name = "Chủ Nhân" if str(author_id) == is_admin else user_name

        emoji_colors = {
            "🎵": random_contrast_color(box_color),
            "😁": random_contrast_color(box_color),
            "🖤": random_contrast_color(box_color),
            "💞": random_contrast_color(box_color),
            "🤖": random_contrast_color(box_color),
            "💻": random_contrast_color(box_color),
            "📅": random_contrast_color(box_color),
            "🎧": random_contrast_color(box_color),
            "🌙": random_contrast_color(box_color),
            "🌤️": (200, 150, 50, 255)
        }

        text_lines = [
            f"Hi, {greeting_name}",
            f"💞 Chào Bạn, tôi có thể giúp gì cho bạn ạ?",
            f" ",
            "😁 Bot Sẵn Sàng Phục 🖤",
            f"🤖Bot: {self.me_name} 💻Version: {self.version} 📅Update {self.date_update}"
        ]

        color1 = random_contrast_color(box_color)
        color2 = random_contrast_color(box_color)
        while color1 == color2:
            color2 = random_contrast_color(box_color)
        text_colors = [
            color1,
            color2,
            last_lines_color,
            last_lines_color,
            last_lines_color
        ]

        text_fonts = [
            font_text_large,
            font_text_big,
            font_text_bot,
            font_text_bot,
            font_text_small
        ]

        line_spacing = 85
        start_y = box_y1 + 10

        avatar_url = user_info.changed_profiles[author_id].avatar if user_info and author_id in user_info.changed_profiles else None
        avatar_path = download_avatar(avatar_url)
        if avatar_path and os.path.exists(avatar_path):
            avatar_size = 200
            avatar_img = Image.open(avatar_path).convert("RGBA").resize((avatar_size, avatar_size), Image.Resampling.LANCZOS)
            mask = Image.new("L", (avatar_size, avatar_size), 0)
            ImageDraw.Draw(mask).ellipse((0, 0, avatar_size, avatar_size), fill=255)
            border_size = avatar_size + 10
            rainbow_border = Image.new("RGBA", (border_size, border_size), (0, 0, 0, 0))
            draw_border = ImageDraw.Draw(rainbow_border)
            steps = 360
            for i in range(steps):
                h = i / steps
                r, g, b = colorsys.hsv_to_rgb(h, 1.0, 1.0)
                draw_border.arc([(0, 0), (border_size-1, border_size-1)], i, i + (360 / steps), fill=(int(r * 255), int(g * 255), int(b * 255), 255), width=5)
            avatar_y = (box_y1 + box_y2 - avatar_size) // 2
            overlay.paste(rainbow_border, (box_x1 + 40, avatar_y), rainbow_border)
            overlay.paste(avatar_img, (box_x1 + 45, avatar_y + 5), mask)
        else:
            draw.text((box_x1 + 60, (box_y1 + box_y2) // 2 - 140), "🐳", font=font_icon, fill=(0, 139, 139, 255))

        current_line_idx = 0
        for i, line in enumerate(text_lines):
            if not line:
                current_line_idx += 1
                continue

            parts = []
            current_part = ""
            for char in line:
                if ord(char) > 0xFFFF:
                    if current_part:
                        parts.append(current_part)
                        current_part = ""
                    parts.append(char)
                else:
                    current_part += char
            if current_part:
                parts.append(current_part)

            total_width = 0
            part_widths = []
            current_font = font_text_bot if i == 4 else text_fonts[i]
            for part in parts:
                width = draw.textbbox((0, 0), part, font=font_icon if any(ord(c) > 0xFFFF for c in part) else current_font)[2]
                part_widths.append(width)
                total_width += width

            max_width = box_x2 - box_x1 - 300
            if total_width > max_width:
                font_size = int(current_font.size * max_width / total_width * 0.9)
                if font_size < 60:
                    font_size = 60
                current_font = ImageFont.truetype(font_arial_path, font_size) if os.path.exists(font_arial_path) else ImageFont.load_default()
                total_width = 0
                part_widths = []
                for part in parts:
                    width = draw.textbbox((0, 0), part, font=font_icon if any(ord(c) > 0xFFFF for c in part) else current_font)[2]
                    part_widths.append(width)
                    total_width += width

            text_x = (box_x1 + box_x2 - total_width) // 2
            text_y = start_y + current_line_idx * line_spacing + (current_font.size // 2)  

            current_x = text_x
            for part, width in zip(parts, part_widths):
                if any(ord(c) > 0xFFFF for c in part):
                    emoji_color = emoji_colors.get(part, random_contrast_color(box_color))
                    draw_text_with_shadow(draw, (current_x, text_y), part, font_icon, emoji_color, shadow_offset=(2, 2))
                    if part == "🤖" and i == 4:
                        draw_text_with_shadow(draw, (current_x, text_y - 5), part, font_icon, emoji_color, shadow_offset=(2, 2))
                else:
                    if i < 2:
                        draw_text_with_shadow(draw, (current_x, text_y), part, current_font, text_colors[i], shadow_offset=(2, 2))
                    else:
                        draw.text((current_x, text_y), part, font=current_font, fill=text_colors[i])
                current_x += width
            current_line_idx += 1

        right_icons = ["🎧", "🎵", "📅", "🌙", "🌤️"]
        right_icon = random.choice(right_icons)
        icon_right_x = box_x2 - 225
        icon_right_y = (box_y1 + box_y2 - 180) // 2
        draw_text_with_shadow(draw, (icon_right_x, icon_right_y), right_icon, font_icon_large, emoji_colors.get(right_icon, (80, 80, 80, 255)), shadow_offset=(2, 2))

        final_image = Image.alpha_composite(bg_image, overlay)
        final_image = final_image.resize(final_size, Image.Resampling.LANCZOS)
        final_image.save(OUTPUT_IMAGE_PATH, "PNG", quality=95)
        print(f"✅ Ảnh menu đã được lưu: {OUTPUT_IMAGE_PATH}")
        return OUTPUT_IMAGE_PATH

    except Exception as e:
        print(f"❌ Lỗi xử lý ảnh menu: {e}")
        return None