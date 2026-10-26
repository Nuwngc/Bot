from io import BytesIO
import os
import random
import time
from typing import List, Tuple
from modules.func_bot_info import is_admin, read_settings, write_settings
from zlapi.models import *
import emoji
import requests
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from config import *

def handle_status_on(bot, thread_id):
    settings = read_settings()
    if "status" not in settings:
        settings["status"] = {}
    settings["status"][thread_id] = True
    write_settings(settings)
    return f"🚦Lệnh {prefix}status đã được Bật 🚀 trong nhóm này ✅"

def handle_status_off(bot, thread_id):
    settings = read_settings()
    if "status" in settings and thread_id in settings["status"]:
        settings["status"][thread_id] = False
        write_settings(settings)
        return f"🚦Lệnh {prefix}status đã Tắt ⭕️ trong nhóm này ✅"
    return "🚦Nhóm chưa có thông tin cấu hình status để ⭕️ Tắt 🤗"

def handle_create_image_command(message, message_object, thread_id, thread_type, author_id, client):
    try:
        settings = read_settings()
        user_message = message.replace(f"{prefix}status ", "").strip().lower()
        if user_message == "on":
            if not is_admin(author_id):  
                response = "❌Bạn không phải admin bot!"
            else:
                response = handle_status_on(client, thread_id)
            client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
            return
        elif user_message == "off":
            if not is_admin(author_id):  
                response = "❌Bạn không phải admin bot!"
            else:
                response = handle_status_off(client, thread_id)
            client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
            return

        if not (settings.get("status", {}).get(thread_id, False)):
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
            client.replyMessage(Message(text="@Member, vui lòng cung cấp nội dung cần tạo ảnh !", mention=Mention(author_id, length=len("@Member"), offset=0)), message_object, thread_id, thread_type, ttl=10000)
            return

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
        output_path = "status.png"
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

def is_emoji(character: str) -> bool:
    return character in emoji.EMOJI_DATA

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