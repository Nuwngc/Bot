import colorsys
from datetime import datetime
import glob
import os
import random
import requests
import time
from io import BytesIO
from typing import List, Tuple
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from core.bot_sys import is_admin, read_settings, write_settings
from zlapi.models import *
import emoji
import pytz

BACKGROUND_PATH = "background/"
CACHE_PATH = "modules/cache/"
OUTPUT_IMAGE_PATH = os.path.join(CACHE_PATH, "st.png")

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
    
    text_luminance = (0.299 * r + 0.587 * g + 0.114 * b)
    if abs(text_luminance - box_luminance) < 0.3:
        if box_luminance > 0.5:
            r, g, b = colorsys.hsv_to_rgb(h, s, min(1.0, v * 0.4))
        else:
            r, g, b = colorsys.hsv_to_rgb(h, s, min(1.0, v * 1.7))
    
    return (int(r * 255), int(g * 255), int(b * 255), 255)

def download_avatar(avatar_url, save_path=os.path.join(CACHE_PATH, "user_avatar.png")):
    if not avatar_url:
        return None
    try:
        resp = requests.get(avatar_url, stream=True, timeout=5)
        if resp.status_code == 200:
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            with open(save_path, "wb") as f:
                for chunk in resp.iter_content(1024):
                    f.write(chunk)
            return save_path
    except Exception as e:
        print(f"❌ Lỗi tải avatar: {e}")
    return None

def generate_menu_image(bot, author_id, thread_id, thread_type):
    images = glob.glob(os.path.join(BACKGROUND_PATH, "*.jpg")) + \
             glob.glob(os.path.join(BACKGROUND_PATH, "*.png")) + \
             glob.glob(os.path.join(BACKGROUND_PATH, "*.jpeg"))
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
            font_text_large = ImageFont.truetype(font_arial_path, size=76)
            font_text_big = ImageFont.truetype(font_arial_path, size=68)
            font_text_small = ImageFont.truetype(font_arial_path, size=64)
            font_text_bot = ImageFont.truetype(font_arial_path, size=58)
            font_time = ImageFont.truetype(font_arial_path, size=56)
            font_icon = ImageFont.truetype(font_emoji_path, size=60)
            font_icon_large = ImageFont.truetype(font_emoji_path, size=175)
            font_name = ImageFont.truetype(font_emoji_path, size=60)
        except Exception as e:
            print(f"❌ Lỗi tải font: {e}")
            font_text_large = ImageFont.load_default(size=76)
            font_text_big = ImageFont.load_default(size=68)
            font_text_small = ImageFont.load_default(size=64)
            font_text_bot = ImageFont.load_default(size=58)
            font_time = ImageFont.load_default(size=56)
            font_icon = ImageFont.load_default(size=60)
            font_icon_large = ImageFont.load_default(size=175)
            font_name = ImageFont.load_default(size=60)

        def draw_text_with_shadow(draw, position, text, font, fill, shadow_color=(0, 0, 0, 250), shadow_offset=(2, 2)):
            x, y = position
            draw.text((x + shadow_offset[0], y + shadow_offset[1]), text, font=font, fill=shadow_color)
            draw.text((x, y), text, font=font, fill=fill)

        vietnam_tz = pytz.timezone('Asia/Ho_Chi_Minh')
        vietnam_now = datetime.now(vietnam_tz)
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
                draw_text_with_shadow(draw, (icon_x, time_y - 8), time_icon, font_icon, icon_color)
                draw.text((time_x, time_y), time_text, font=font_time, fill=time_color)
            except Exception as e:
                print(f"❌ Lỗi vẽ thời gian lên ảnh: {e}")
                draw_text_with_shadow(draw, (time_x - 75, time_y - 8), "⏰", font_icon, (255, 255, 255, 255))
                draw.text((time_x, time_y), " ??;??", font=font_time, fill=time_color)

        user_info = bot.fetchUserInfo(author_id) if author_id else None
        user_name = "Unknown"
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
            f"💞 Chào mừng đến menu 🌸 Tâm Trạng",
            f"{bot.prefix}st on/off: 🚀 Bật/Tắt tính năng",
            "😁 Bot Sẵn Sàng Phục 🖤",
            f"🤖Bot: {bot.me_name} 💻Version: {bot.version} 📅Update {bot.date_update}"
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

        avatar_url = user_info.changed_profiles[author_id].avatar if user_info and hasattr(user_info, 'changed_profiles') and author_id in user_info.changed_profiles else None
        avatar_path = download_avatar(avatar_url)
        if avatar_path and os.path.exists(avatar_path):
            avatar_size = 200
            try:
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
                    draw_border.arc([(0, 0), (border_size-1, border_size-1)], start=i, end=i + (360 / steps), fill=(int(r * 255), int(g * 255), int(b * 255), 255), width=5)
                avatar_y = (box_y1 + box_y2 - avatar_size) // 2
                overlay.paste(rainbow_border, (box_x1 + 40, avatar_y), rainbow_border)
                overlay.paste(avatar_img, (box_x1 + 45, avatar_y + 5), mask)
            except Exception as e:
                print(f"❌ Lỗi xử lý avatar: {e}")
                draw.text((box_x1 + 60, (box_y1 + box_y2) // 2 - 140), "🐳", font=font_icon, fill=(0, 139, 139, 255))
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
                font_to_use = font_icon if any(ord(c) > 0xFFFF for c in part) else current_font
                width = draw.textbbox((0, 0), part, font=font_to_use)[2]
                part_widths.append(width)
                total_width += width

            max_width = box_x2 - box_x1 - 300
            if total_width > max_width:
                font_size = int(current_font.getbbox("A")[3] * max_width / total_width * 0.9)
                if font_size < 60:
                    font_size = 60
                try:
                    current_font = ImageFont.truetype(font_arial_path, size=font_size) if os.path.exists(font_arial_path) else ImageFont.load_default(size=font_size)
                except Exception as e:
                    print(f"❌ Lỗi điều chỉnh font size: {e}")
                    current_font = ImageFont.load_default(size=font_size)
                total_width = 0
                part_widths = []
                for part in parts:
                    font_to_use = font_icon if any(ord(c) > 0xFFFF for c in part) else current_font
                    width = draw.textbbox((0, 0), part, font=font_to_use)[2]
                    part_widths.append(width)
                    total_width += width

            text_x = (box_x1 + box_x2 - total_width) // 2
            text_y = start_y + current_line_idx * line_spacing + (current_font.getbbox("A")[3] // 2)

            current_x = text_x
            for part, width in zip(parts, part_widths):
                if any(ord(c) > 0xFFFF for c in part):
                    emoji_color = emoji_colors.get(part, random_contrast_color(box_color))
                    draw_text_with_shadow(draw, (current_x, text_y), part, font_icon, emoji_color)
                    if part == "🤖" and i == 4:
                        draw_text_with_shadow(draw, (current_x, text_y - 5), part, font_icon, emoji_color)
                else:
                    if i < 2:
                        draw_text_with_shadow(draw, (current_x, text_y), part, current_font, text_colors[i])
                    else:
                        draw.text((current_x, text_y), part, font=current_font, fill=text_colors[i])
                current_x += width
            current_line_idx += 1

        right_icons = ["🌹"]
        right_icon = random.choice(right_icons)
        icon_right_x = box_x2 - 225
        icon_right_y = (box_y1 + box_y2 - 180) // 2
        draw_text_with_shadow(draw, (icon_right_x, icon_right_y), right_icon, font_icon_large, emoji_colors.get(right_icon, (80, 80, 80, 255)))

        final_image = Image.alpha_composite(bg_image, overlay)
        final_image = final_image.resize(final_size, Image.Resampling.LANCZOS)
        os.makedirs(os.path.dirname(OUTPUT_IMAGE_PATH), exist_ok=True)
        final_image.save(OUTPUT_IMAGE_PATH, "PNG", quality=95)
        print(f"✅ Ảnh menu đã được lưu: {OUTPUT_IMAGE_PATH}")
        return OUTPUT_IMAGE_PATH

    except Exception as e:
        print(f"❌ Lỗi xử lý ảnh menu: {e}")
        return None
    
def create_rgb_colors(width, height, num_colors):
    colors = []
    for i in range(num_colors):
        color = (
            random.randint(0, 255),
            random.randint(0, 255),
            random.randint(0, 255)
        )
        colors.append(color)
    return colors

def interpolate_colors(colors: List[Tuple[int, int, int]], text_length: int, change_every: int = 1):
    gradient = []
    num_segments = len(colors) - 1
    steps_per_segment = (text_length // num_segments) + 1

    for i in range(num_segments):
        for j in range(steps_per_segment):
            if len(gradient) < text_length:
                ratio = j / steps_per_segment
                interpolated_color = (
                    int(colors[i][0] * (1 - ratio) + colors[i + 1][0] * ratio),
                    int(colors[i][1] * (1 - ratio) + colors[i + 1][1] * ratio),
                    int(colors[i][2] * (1 - ratio) + colors[i + 1][2] * ratio)
                )
                gradient.append(interpolated_color)

    while len(gradient) < text_length:
        gradient.append(colors[-1])

    return gradient[:text_length]

def is_emoji(character: str) -> bool:
    return character in emoji.EMOJI_DATA

def create_text(draw: ImageDraw.Draw, text: str, font: ImageFont.FreeTypeFont, 
                emoji_font: ImageFont.FreeTypeFont, text_position: Tuple[int, int], 
                gradient_colors: List[Tuple[int, int, int]] = None):
    gradient = interpolate_colors(gradient_colors, text_length=len(text), change_every=4) if gradient_colors else None
    current_x = text_position[0]
    y = text_position[1]

    for i, char in enumerate(text):
        color = tuple(gradient[i]) if gradient and i < len(gradient) else (0, 0, 0)
        try:
            selected_font = emoji_font if is_emoji(char) and emoji_font else font
            offset = 1
            for dx in [-offset, 0, offset]:
                for dy in [-offset, 0, offset]:
                    if dx != 0 or dy != 0:
                        draw.text((current_x + dx, y + dy), char, fill=(0, 0, 0), font=selected_font)
            draw.text((current_x, y), char, fill=color, font=selected_font)
            text_bbox = draw.textbbox((current_x, y), char, font=selected_font)
            text_width = text_bbox[2] - text_bbox[0]
            current_x += text_width
        except Exception:
            dash_count = 2 if is_emoji(char) else 1
            dash_text = "-" * dash_count
            for j in range(dash_count):
                for dx in [-offset, 0, offset]:
                    for dy in [-offset, 0, offset]:
                        if dx != 0 or dy != 0:
                            draw.text((current_x + dx, y + dy), "-", fill=(0, 0, 0), font=font)
                draw.text((current_x, y), "-", fill=color, font=font)
                dash_bbox = draw.textbbox((current_x, y), "-", font=font)
                current_x += dash_bbox[2] - dash_bbox[0]

def wrap_text(draw: ImageDraw.Draw, text: str, font: ImageFont.FreeTypeFont, emoji_font: ImageFont.FreeTypeFont, 
              max_width: int, start_x: int, start_y: int, max_height: int) -> int:
    words = text.split()
    lines = []
    current_line = ""
    current_width = 0
    line_height = int((draw.textbbox((0, 0), "A", font=font)[3] - draw.textbbox((0, 0), "A", font=font)[1]) * 1.2)
    for word in words:
        word_width = sum(draw.textbbox((0, 0), char, font=emoji_font if is_emoji(char) else font)[2] - 
                         draw.textbbox((0, 0), char, font=emoji_font if is_emoji(char) else font)[0] for char in word + " ")
        if current_width + word_width <= max_width:
            current_line += word + " "
            current_width += word_width
        else:
            if current_line:
                lines.append(current_line.strip())
            current_line = word + " "
            current_width = word_width

    if current_line:
        lines.append(current_line.strip())
    total_height = len(lines) * line_height
    y = start_y + (max_height - total_height) // 2 if total_height < max_height else start_y
    for line in lines:
        if y + line_height <= start_y + max_height:
            line_width = sum(draw.textbbox((0, 0), char, font=emoji_font if is_emoji(char) else font)[2] - 
                            draw.textbbox((0, 0), char, font=emoji_font if is_emoji(char) else font)[0] for char in line)
            line_x = start_x + (max_width - line_width) // 2
            create_text(draw, line, font, emoji_font, (line_x, y))
            y += line_height
        else:
            break
    return y

def get_font_size(content: str, max_width: int, max_height: int, draw: ImageDraw.Draw) -> Tuple[ImageFont.FreeTypeFont, ImageFont.FreeTypeFont]:
    max_font_size = 53
    min_font_size = 33
    font_path = "arial unicode ms.otf"
    emoji_font_path = "emoji.ttf"
    
    words = content.split()
    text_length = len(content)
    
    if text_length > 30:
        for size in range(max_font_size, min_font_size - 1, -10):
            font = ImageFont.truetype(font_path, size)
            emoji_font = ImageFont.truetype(emoji_font_path, size)
            line_height = int((draw.textbbox((0, 0), "A", font=font)[3] - draw.textbbox((0, 0), "A", font=font)[1]) * 1.2)
            lines = []
            current_line = ""
            current_width = 0
            
            for word in words:
                word_width = sum(draw.textbbox((0, 0), char, font=emoji_font if is_emoji(char) else font)[2] - 
                                draw.textbbox((0, 0), char, font=emoji_font if is_emoji(char) else font)[0] for char in word + " ")
                if current_width + word_width <= max_width:
                    current_line += word + " "
                    current_width += word_width
                else:
                    if current_line:
                        lines.append(current_line.strip())
                    current_line = word + " "
                    current_width = word_width
            
            if current_line:
                lines.append(current_line.strip())
            
            total_height = len(lines) * line_height
            if total_height <= max_height:
                return font, emoji_font
    else:
        font = ImageFont.truetype(font_path, max_font_size)
        emoji_font = ImageFont.truetype(emoji_font_path, max_font_size)
        return font, emoji_font
    
    return ImageFont.truetype(font_path, min_font_size), ImageFont.truetype(emoji_font_path, min_font_size)

def create_glass_layer(background, image_width, image_height):
    glass_padding = 100
    corner_radius = 30
    
    glass_layer = Image.new("RGBA", (image_width, image_height), (0, 0, 0, 0))
    glass_draw = ImageDraw.Draw(glass_layer)
    
    glass_color = (
        random.randint(0, 255),
        random.randint(0, 255),
        random.randint(0, 255),
        100
    )
    glass_draw.rounded_rectangle(
        [glass_padding, glass_padding, image_width - glass_padding, image_height - glass_padding],
        radius=corner_radius,
        fill=glass_color
    )
    
    glass_layer = glass_layer.filter(ImageFilter.GaussianBlur(radius=10))
    return Image.alpha_composite(background, glass_layer), glass_padding

def get_user_name_by_id(bot, author_id):
    try:
        user_info = bot.fetchUserInfo(author_id).changed_profiles[author_id]
        return user_info.zaloName or user_info.displayName
    except Exception:
        return "Unknown User"

def make_circle_avatar(avatar, size):
    mask = Image.new("L", size, 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse((0, 0) + size, fill=255)
    
    avatar = avatar.resize(size, Image.LANCZOS)
    avatar.putalpha(mask)
    return avatar

def handle_st_on(bot, thread_id):
    settings = read_settings(bot.uid)
    if "st" not in settings:
        settings["st"] = {}
    settings["st"][thread_id] = True
    write_settings(bot.uid, settings)
    return f"🚦Lệnh {bot.prefix}st đã được Bật 🚀 trong nhóm này ✅"

def handle_st_off(bot, thread_id):
    settings = read_settings(bot.uid)
    if "st" in settings and thread_id in settings["st"]:
        settings["st"][thread_id] = False
        write_settings(bot.uid, settings)
        return f"🚦Lệnh {bot.prefix}st đã Tắt ⭕️ trong nhóm này ✅"
    return "🚦Nhóm chưa có thông tin cấu hình st để ⭕️ Tắt 🤗"

def handle_create_image_command(message, message_object, thread_id, thread_type, author_id, client):
    try:
        settings = read_settings(client.uid)
        user_message = message.replace(f"{client.prefix}st ", "").strip().lower()
        if user_message == "on":
            if not is_admin(client, author_id):  
                response = "❌Bạn không phải admin bot!"
            else:
                response = handle_st_on(client, thread_id)
            client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
            return
        elif user_message == "off":
            if not is_admin(client, author_id):  
                response = "❌Bạn không phải admin bot!"
            else:
                response = handle_st_off(client, thread_id)
            client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
            return

        if not (settings.get("st", {}).get(thread_id, False)):
            return
        mentions = message_object.mentions
        if mentions:
            target_id = mentions[0]['uid']
        else:
            target_id = author_id

        user = client.fetchUserInfo(target_id).changed_profiles.get(target_id)
        if not user:
            client.send(
                Message(text="Không thể lấy thông tin người dùng."),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return
        background_dir = "background"
        background_files = [os.path.join(background_dir, f) for f in os.listdir(background_dir) if f.endswith(('.png', '.jpg'))]
        if not background_files:
            client.send(
                Message(text="Không tìm thấy ảnh trong thư mục background."),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return
        background_path = random.choice(background_files)
        background = Image.open(background_path).convert("RGBA")
        image_width, image_height = 1920, 1080
        background = background.resize((image_width, image_height), Image.LANCZOS)
        background = background.filter(ImageFilter.GaussianBlur(radius=5))
        background, glass_padding = create_glass_layer(background, image_width, image_height)
        draw = ImageDraw.Draw(background)

        text = message.split(" ", 1)
        if len(text) < 2:
            response = "".join([
                f"{get_user_name_by_id(client, author_id)}\n",
                f"➜ {client.prefix}st [nội dung tâm trạng]: 🤭 Viết tâm trạng\n"
                f"💞 Ví dụ: {client.prefix}st Cường ơi em yêu anh Cường 😍 ✅"
            ])
            os.makedirs(CACHE_PATH, exist_ok=True)
    
            image_path = generate_menu_image(client, author_id, thread_id, thread_type)
            if not image_path:
                client.sendMessage("❌ Không thể tạo ảnh menu!", thread_id, thread_type)
                return

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
            
            client.sendReaction(message_object, random.choice(reaction), thread_id, thread_type)
            client.sendLocalImage(
                imagePath=image_path,
                message=Message(text=response, mention=Mention(author_id, length=len(f"{get_user_name_by_id(client, author_id)}"), offset=0)),
                thread_id=thread_id,
                thread_type=thread_type,
                width=1920,
                height=600,
                ttl=240000
            )
            
            try:
                if os.path.exists(image_path):
                    os.remove(image_path)
            except Exception as e:
                print(f"❌ Lỗi khi xóa ảnh: {e}")
            return  # Thêm return để tránh lỗi tiếp tục xử lý

        content = text[1]
        rgb_colors = create_rgb_colors(image_width, image_height, num_colors=5)
        glass_width = image_width - 2 * glass_padding
        glass_height = image_height - 2 * glass_padding
        name_font = ImageFont.truetype("arial unicode ms.otf", 40)
        time_font = ImageFont.truetype("arial unicode ms.otf", 32)
        admin_font = ImageFont.truetype("arial unicode ms.otf", 36)
        
        creator_name = get_user_name_by_id(client, author_id)
        current_time = time.strftime("%H:%M:%S %d-%m-%Y", time.localtime())
        admin_name = f"🤖Bot: {get_user_name_by_id(client, client.uid)}"
        
        name_height = draw.textbbox((0, 0), creator_name, font=name_font)[3] - draw.textbbox((0, 0), creator_name, font=name_font)[1]
        time_height = draw.textbbox((0, 0), current_time, font=time_font)[3] - draw.textbbox((0, 0), current_time, font=time_font)[1]
        admin_height = draw.textbbox((0, 0), admin_name, font=admin_font)[3] - draw.textbbox((0, 0), admin_name, font=admin_font)[1]
        safe_zone_top = glass_padding + name_height + time_height + 20
        safe_zone_bottom = image_height - glass_padding - admin_height - 20
        max_content_height = safe_zone_bottom - safe_zone_top
        font, emoji_font = get_font_size(content, glass_width, max_content_height, draw)
        
        start_x = glass_padding
        start_y = safe_zone_top
        wrap_text(draw, content, font, emoji_font, glass_width, start_x, start_y, max_content_height)
        
        avatar_url = user.avatar
        if avatar_url:
            avatar_response = requests.get(avatar_url)
            if avatar_response.status_code == 200:
                avatar = Image.open(BytesIO(avatar_response.content)).convert("RGBA")
                avatar_size = (80, 80)
                avatar = make_circle_avatar(avatar, avatar_size)
                background.paste(avatar, (glass_padding + 20, glass_padding + 20), avatar)
        emoji_font_name = ImageFont.truetype("emoji.ttf", 40)
        emoji_font_time = ImageFont.truetype("emoji.ttf", 32)
        avatar_width = avatar_size[0] if avatar_url and avatar_response.status_code == 200 else 0
        text_x = glass_padding + 20 + avatar_width + 30
        create_text(draw, creator_name, name_font, emoji_font_name, (text_x, glass_padding + 20), rgb_colors)
        create_text(draw, current_time, time_font, emoji_font_time, (text_x, glass_padding + 70))
        emoji_font_admin = ImageFont.truetype("emoji.ttf", 36)
        admin_bbox = draw.textbbox((0, 0), admin_name, font=admin_font)
        admin_width = admin_bbox[2] - admin_bbox[0]
        create_text(
            draw,
            admin_name,
            admin_font,
            emoji_font_admin,
            (image_width - glass_padding - admin_width - 40, image_height - glass_padding - admin_height - 40)
        )
        top_right_emoji = "🌟"
        emoji_font_top = ImageFont.truetype("emoji.ttf", 48)
        top_font = ImageFont.truetype("arial unicode ms.otf", 48)
        emoji_bbox = draw.textbbox((0, 0), top_right_emoji, font=emoji_font_top)
        emoji_width = emoji_bbox[2] - emoji_bbox[0]
        emoji_height = emoji_bbox[3] - emoji_bbox[1]
        create_text(
            draw,
            top_right_emoji,
            top_font,
            emoji_font_top,
            (image_width - glass_padding - emoji_width - 20, glass_padding + 20)
        )
        output_path = "st.png"
        background.save(output_path, "PNG")

        if os.path.exists(output_path):
            client.sendLocalImage(
                output_path,
                message=Message(text=f"🚦 {get_user_name_by_id(client, author_id)} status của bạn đây ✅", mention=Mention(author_id, length=len(f"{get_user_name_by_id(client, author_id)}"), offset=3)),
                thread_id=thread_id,
                thread_type=thread_type,
                ttl=86400000,
                width=image_width,
                height=image_height
            )
            os.remove(output_path)
        else:
            raise Exception("Không thể lưu ảnh.")

    except Exception as e:
        client.sendMessage(Message(text=f"Đã xảy ra lỗi: {str(e)}"), thread_id, thread_type)