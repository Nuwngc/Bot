from io import BytesIO
import os
import random
from typing import List, Tuple
from PIL import Image, ImageDraw, ImageFont
import emoji
import requests
from zlapi.models import *
from config import *

def handle_menu_or_commands(message, thread_id, thread_type, author_id, bot):
    command_names = {
        f"➜ 🔗 Get Link": f"({prefix}getlink)",
        f"➜ 🎙️ Get Voice": f"({prefix}getvoice)",
        f" ➜ 🤪 My custom Sticker": f"({prefix}mst)",
        f"➜ 🌈 Viết Status": f"({prefix}st)",
        f"➜ 🅿️ Tìm ảnh Pinterest": f"({prefix}pin)",
        f"➜ 🟡 Tìm kiếm meme": f"({prefix}meme)",
    }

    temp_image_path, menu_message = create_menu_or_image(command_names, bot, author_id)

    bot.sendLocalImage(
        temp_image_path, thread_id=thread_id, thread_type=thread_type,
        message=Message(text=menu_message, mention=Mention(author_id, length=len(f"{get_user_name_by_id(bot, author_id)}"), offset=0)), height=500, width=1280
    )

    os.remove(temp_image_path)

def create_gradient_colors(num_colors: int) -> List[Tuple[int, int, int]]:
    return [(random.randint(80, 220), random.randint(80, 220), random.randint(80, 220)) 
            for _ in range(num_colors)]

def interpolate_colors(colors: List[Tuple[int, int, int]], text_length: int, change_every: int) -> List[Tuple[int, int, int]]:
    gradient = []
    num_segments = len(colors) - 1
    steps_per_segment = max((text_length // change_every) + 1, 1)

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

def draw_text_with_emoji(draw: ImageDraw.Draw, text: str, position: Tuple[int, int],
                        font: ImageFont.FreeTypeFont, emoji_font: ImageFont.FreeTypeFont,
                        gradient_colors: List[Tuple[int, int, int]]) -> int:
    current_x = position[0]
    y = position[1]
    gradient = interpolate_colors(gradient_colors, len(text), 1)
    
    for i, char in enumerate(text):
        try:
            selected_font = emoji_font if is_emoji(char) else font
            font_size = selected_font.size
            offset_y = y - (font_size // 4) if is_emoji(char) else y
            
            draw.text((current_x, offset_y), char, 
                     fill=tuple(gradient[i]), 
                     font=selected_font)
            
            text_bbox = draw.textbbox((current_x, offset_y), char, font=selected_font)
            text_width = text_bbox[2] - text_bbox[0]
            current_x += text_width + (2 if is_emoji(char) else 0)
            
        except Exception as e:
            print(f"Lỗi khi vẽ ký tự '{char}': {e}")
            continue
    
    return current_x

def get_user_name_by_id(bot, author_id):
    try:
        user_info = bot.fetchUserInfo(author_id).changed_profiles[author_id]
        return user_info.zaloName or user_info.displayName
    except Exception as e:
        return "Unknown User"

def create_menu_or_image(command_names, bot, author_id):
    avatar_url = bot.fetchUserInfo(author_id).changed_profiles.get(author_id).avatar
    current_page_commands = list(command_names.items())
    numbered_commands = [f"{name}: {desc}" for name, desc in current_page_commands]
    menu_message = f"{get_user_name_by_id(bot, author_id)}\n" + "\n".join(numbered_commands)

    background_dir = "background"
    background_path = random.choice([os.path.join(background_dir, f) 
                                   for f in os.listdir(background_dir) 
                                   if f.endswith(('.png', '.jpg'))])
    image = Image.open(background_path).convert("RGBA").resize((1280, 500))
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    rect_x0, rect_y0, rect_x1, rect_y1 = (1280 - 1100) // 2, (500 - 300) // 2, \
                                        (1280 - 1100) // 2 + 1100, (500 - 300) // 2 + 300
    draw.rounded_rectangle([rect_x0, rect_y0, rect_x1, rect_y1], radius=50, 
                         fill=(255, 255, 255, 200))

    if avatar_url:
        try:
            avatar_image = Image.open(BytesIO(requests.get(avatar_url).content)).convert("RGBA").resize((100, 100))
            gradient_size = 110
            gradient_colors = create_gradient_colors(7)
            gradient_overlay = Image.new("RGBA", (gradient_size, gradient_size), (0, 0, 0, 0))
            gradient_draw = ImageDraw.Draw(gradient_overlay)
            
            for i, color in enumerate(gradient_colors):
                gradient_draw.ellipse((i, i, gradient_size - i, gradient_size - i), 
                                    outline=color, width=1)
            
            mask = Image.new("L", avatar_image.size, 0)
            ImageDraw.Draw(mask).ellipse((0, 0, 100, 100), fill=255)
            gradient_overlay.paste(avatar_image, (5, 5), mask)
            overlay.paste(gradient_overlay, (rect_x0 + 20, rect_y0 + 100), gradient_overlay)
        except Exception as e:
            print(f"Lỗi khi xử lý avatar: {e}")

    text_hi = f"Hi, {get_user_name_by_id(bot, author_id)}"
    text_welcome = f"🎊 Chào mừng đến với menu 🍼 Tính năng khác"
    text_nt_status = f"💬 trạng thái: Hoạt động"
    text_bot_ready = f"♥️ bot sẵn sàng phục vụ"
    text_bot_info = f"🤖 Bot: {get_user_name_by_id(bot, bot.uid)} 💻 version 2.0 🗓️ update 08-01-24"

    font_path = "arial unicode ms.otf"
    emoji_font_path = "NotoEmoji-Bold.ttf"
    
    font_hi = ImageFont.truetype(font_path, size=50) if os.path.exists(font_path) else ImageFont.load_default()
    font_welcome = ImageFont.truetype(font_path, size=35) if os.path.exists(font_path) else ImageFont.load_default()
    font_nt = ImageFont.truetype(font_path, size=40) if os.path.exists(font_path) else ImageFont.load_default()
    emoji_font = ImageFont.truetype(emoji_font_path, size=35) if os.path.exists(emoji_font_path) else ImageFont.load_default()

    total_height = 300
    line_spacing = total_height // 5
    center_x = 1280 // 2

    y_pos = rect_y0 + 10
    draw_text_with_emoji(draw, text_hi, (center_x - 200, y_pos), 
                        font_hi, emoji_font, create_gradient_colors(5))
    
    y_pos += line_spacing
    draw_text_with_emoji(draw, text_welcome, (center_x - 370, y_pos), 
                        font_welcome, emoji_font, create_gradient_colors(5))
    
    y_pos += line_spacing
    draw_text_with_emoji(draw, text_nt_status, (center_x - 250, y_pos), 
                        font_nt, emoji_font, create_gradient_colors(5))
    
    y_pos += line_spacing
    draw_text_with_emoji(draw, text_bot_ready, (center_x - 250, y_pos), 
                        font_welcome, emoji_font, create_gradient_colors(5))
    
    y_pos += line_spacing - 10
    draw_text_with_emoji(draw, text_bot_info, (center_x - 460, y_pos), 
                        font_welcome, emoji_font, create_gradient_colors(7))

    final_image = Image.alpha_composite(image, overlay)
    temp_image_path = "or_menu.png"
    final_image.save(temp_image_path)
    
    return temp_image_path, menu_message
