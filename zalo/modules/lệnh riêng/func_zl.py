import os
import re
import textwrap
from threading import Thread
from typing import List, Tuple
import emoji
from modules.func_bot_info import is_admin, read_settings, write_settings
from config import *
from zlapi.models import *
import requests
from PIL import Image, ImageDraw, ImageOps, ImageFont, ImageFilter
from io import BytesIO
import random
from datetime import datetime

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

def create_menu_zl_image(command_names, bot, author_id):
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
    text_welcome = f"🎊 Chào mừng đến với menu ⚡️ Zép Lào"
    text_nt_status = f"{prefix}zl on/off: bật/tắt tính năng"
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
    temp_image_path = "menu_zl.png"
    final_image.save(temp_image_path)
    
    return temp_image_path, menu_message

def is_emoji(character: str) -> bool:
    return character in emoji.EMOJI_DATA

def interpolate_colors(colors: List[Tuple[int, int, int]], text_length: int, change_every: int = 1) -> List[Tuple[int, int, int]]:
    result = []
    for i in range(text_length):
        color_idx = (i // change_every) % len(colors)
        result.append(colors[color_idx])
    return result

def create_text(draw: ImageDraw.Draw, text: str, font: ImageFont.FreeTypeFont, 
                emoji_font: ImageFont.FreeTypeFont, text_position: Tuple[int, int], 
                gradient_colors: List[Tuple[int, int, int]]):
    gradient = interpolate_colors(gradient_colors, text_length=len(text), change_every=4)
    current_x = text_position[0]

    for i, char in enumerate(text):
        color = tuple(gradient[i])
        try:
            is_emoji_char = is_emoji(char)
            selected_font = emoji_font if is_emoji_char else font
            draw.text((current_x, text_position[1]), char, fill=color, font=selected_font)
            text_bbox = draw.textbbox((current_x, text_position[1]), char, font=selected_font)
            text_width = text_bbox[2] - text_bbox[0]
            current_x += text_width
        except Exception as e:
            print(f"Lỗi khi vẽ ký tự '{char}': {e}. Bỏ qua ký tự này.")
            continue

def qr(message, message_object, thread_id, thread_type, author_id, client):
    try:
        mentions = message_object.mentions
        if mentions:
            target_id = mentions[0]['uid']
        else:
            target_id = author_id
        message_text = message.lower().strip()
        command_prefix = f"{prefix}zl qr"
        if message_text.startswith(command_prefix):
            content = message_text[len(command_prefix):].strip()
            if mentions:
                for mention in mentions:
                    mention_text = f"@{client.fetchUserInfo(mention['uid']).changed_profiles.get(mention['uid']).displayName}"
                    content = content.replace(mention_text.lower(), "").strip()
                content = re.sub(r'@[^\s]+', '', content).strip()
                content = ''.join(c for c in content if c.isalnum() or c.isspace() or is_emoji(c))
            if not content:
                content = "😍Hãy kết bạn với tôi 😊"
        else:
            content = "😍Hãy kết bạn với tôi 😊"

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
                Message(text="Không có ảnh nền nào trong thư mục 'background'."),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return
        background_path = random.choice(background_files)
        background = Image.open(background_path).convert("RGBA")
        background = background.resize((840, 1280), Image.LANCZOS)
        background = background.filter(ImageFilter.GaussianBlur(radius=5))

        qr_data = client.getQRLink(target_id)
        if not qr_data or target_id not in qr_data:
            client.send(
                Message(text="Không thể lấy mã QR của người dùng."),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return

        qr_link = qr_data[target_id]
        qr_response = requests.get(qr_link)
        if qr_response.status_code != 200:
            client.send(
                Message(text="Không thể tải mã QR."),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return

        qr_image = Image.open(BytesIO(qr_response.content)).convert("RGBA")
        qr_size = 400
        qr_image = qr_image.resize((qr_size, qr_size), Image.LANCZOS)

        avatar_url = client.fetchUserInfo(target_id).changed_profiles.get(target_id).avatar
        if avatar_url:
            avatar_response = requests.get(avatar_url)
            if avatar_response.status_code == 200:
                avatar_image = Image.open(BytesIO(avatar_response.content)).convert("RGBA")
                avatar_size = min(qr_size // 2, 400)
                avatar_image = ImageOps.fit(avatar_image, (avatar_size, avatar_size), Image.LANCZOS)
                mask = Image.new("L", avatar_image.size, 0)
                draw = ImageDraw.Draw(mask)
                draw.ellipse((0, 0, avatar_size, avatar_size), fill=255)
                avatar_image.putalpha(mask)

        overlay = Image.new("RGBA", background.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        random_color = (random.randint(0, 255), random.randint(0, 255), random.randint(0, 255), 200)

        rect_x0 = (840 - 640) // 2
        rect_y0 = (1280 - 1000) // 2
        rect_x1 = rect_x0 + 640
        rect_y1 = rect_y0 + 1000

        radius = 50
        draw.rounded_rectangle(
            [rect_x0, rect_y0, rect_x1, rect_y1],
            radius=radius,
            fill=random_color
        )

        avatar_x = (840 - avatar_size) // 2
        avatar_y = rect_y1 - 1100  

        if avatar_url and avatar_response.status_code == 200:
            overlay.paste(avatar_image, (avatar_x, avatar_y), avatar_image)

        qr_x = (840 - qr_size) // 2
        qr_y = (1280 - qr_size) // 2
        overlay.paste(qr_image, (qr_x, qr_y), qr_image)

        user_info = client.fetchUserInfo(target_id)
        user_name = user_info.changed_profiles.get(target_id).displayName

        font_path = "arialbd.ttf"
        font_size = 60
        font = ImageFont.truetype(font_path, font_size)
        random_name_color = (random.randint(0, 255), random.randint(0, 255), random.randint(0, 255), 255)

        textbox = ImageDraw.Draw(overlay)
        text_size = textbox.textbbox((0, 0), user_name, font=font)
        text_x = (840 - (text_size[2] - text_size[0])) // 2
        text_y = rect_y1 - 900
        textbox.text((text_x, text_y), user_name, fill=random_name_color, font=font)

        qr_font_path = "arial unicode ms.otf"
        qr_font_size = 30
        qr_font = ImageFont.truetype(qr_font_path, qr_font_size)
        qr_large_font_size = 50
        qr_large_font = ImageFont.truetype(qr_font_path, qr_large_font_size)

        emoji_font_path = "seguiemj.ttf"
        emoji_font_size = 50
        emoji_font = ImageFont.truetype(emoji_font_path, emoji_font_size)

        qr_bottom_font_size = 28
        qr_bottom_font = ImageFont.truetype(qr_font_path, qr_bottom_font_size)
        text_color = random.choice([(255, 255, 255, 255), (0, 0, 0, 255)])

        text_qr = "Liên hệ Zalo"
        qr_text_size = textbox.textbbox((0, 0), text_qr, font=qr_font)
        qr_text_x = (840 - (qr_text_size[2] - qr_text_size[0])) // 2
        qr_text_y = rect_y1 - 800

        textbox.text((qr_text_x, qr_text_y), text_qr, fill=text_color, font=qr_font)
        text_qr_large = content
        qr_text_large_size = textbox.textbbox((0, 0), text_qr_large, font=qr_large_font)
        qr_text_large_x = (840 - (qr_text_large_size[2] - qr_text_large_size[0])) // 2
        qr_text_large_y = rect_y1 - 250

        gradient_colors = [
            (random.randint(100, 255), random.randint(100, 255), random.randint(100, 255)),
            (random.randint(100, 255), random.randint(100, 255), random.randint(100, 255)),
            (random.randint(100, 255), random.randint(100, 255), random.randint(100, 255))
        ]
        create_text(textbox, text_qr_large, qr_large_font, emoji_font, (qr_text_large_x, qr_text_large_y), gradient_colors)

        text_qr_bottom = "Mở Zalo bấm nút quét QR để kết bạn"
        qr_text_bottom_size = textbox.textbbox((0, 0), text_qr_bottom, font=qr_bottom_font)
        qr_text_bottom_x = (840 - (qr_text_bottom_size[2] - qr_text_bottom_size[0])) // 2
        qr_text_bottom_y = rect_y1 - 80

        textbox.text((qr_text_bottom_x, qr_text_bottom_y), text_qr_bottom, fill=text_color, font=qr_bottom_font)

        combined = Image.alpha_composite(background, overlay)
        image_path = "temp_qr_image.png"
        combined.save(image_path)
        message_text = f"🚦 {get_user_name_by_id(client, author_id)} QR code {user_name} của bạn đây ✅"
        client.sendLocalImage(
            imagePath=image_path,
            thread_id=thread_id,
            thread_type=thread_type,
            height=1280,
            width=840,
            message=Message(text=message_text, mention=Mention(author_id, length=len(f"{get_user_name_by_id(client, author_id)}"), offset=3)),
            ttl=6000000
        )
    except Exception as e:
        client.send(
            Message(text=f"Đã xảy ra lỗi: {str(e)}"),
            thread_id=thread_id,
            thread_type=thread_type
        )

def create_gradient_colors(num_colors):
    colors = []
    for _ in range(num_colors):
        colors.append((random.randint(100, 175), random.randint(100, 180), random.randint(100, 170)))
    return colors

def interpolate_colors(colors, text_length, change_every):
    gradient = []
    num_segments = len(colors) - 1
    steps_per_segment = (text_length // change_every) + 1

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

def zl_card(bot, message_object, author_id, thread_id, thread_type, command):
    def send_card():
        try:
            # 1. Lấy nội dung tin nhắn AN TOÀN
            full_text = getattr(message_object, 'text', '') or ''
            
            # 2. Tách nội dung sau lệnh (cực kỳ chắc chắn)
            content = "Ẩn danh"  # Giá trị mặc định
            
            if isinstance(full_text, str):
                if full_text.startswith('/zl card '):
                    content = full_text[9:].strip() or "Ẩn danh"
                elif full_text.startswith('/zlcard '):
                    content = full_text[8:].strip() or "Ẩn danh"
            
            # 3. Xác định người nhận (có mention hay không)
            mentions = getattr(message_object, 'mentions', [])
            target_id = mentions[0]['uid'] if mentions else author_id
            
            # 4. Lấy thông tin người dùng
            user_info = bot.fetchUserInfo(target_id)
            user = user_info.changed_profiles.get(target_id)
            
            # 5. Gửi danh thiếp
            bot.sendBusinessCard(
                userId=target_id,
                qrCodeUrl=user.avatar,
                thread_id=thread_id,
                thread_type=thread_type,
                phone=content,
                ttl=0
            )
            
            # 6. Phản hồi
            bot.replyMessage(
                Message(text=f"Đã gửi danh thiếp cho {user.displayName}\nNội dung: {content}"),
                message_object,
                thread_id=thread_id,
                thread_type=thread_type
            )
            
        except Exception as e:
            print(f"Lỗi hệ thống: {str(e)}")
            bot.replyMessage(
                Message(text="⚠️ Đã xảy ra lỗi khi gửi danh thiếp"),
                message_object,
                thread_id=thread_id,
                thread_type=thread_type
            )

    thread = Thread(target=send_card)
    thread.start()

def create_gradient(width, height):
    gradient = Image.new('RGB', (width, height), color=0)
    draw = ImageDraw.Draw(gradient)
    for y in range(height):
        r = int((y / height) * 100)
        g = int((y / height) * 255)
        b = int((y / height) * 255)
        draw.line((0, y, width, y), fill=(r, g, b))
    return gradient

def add_round_corners(image, radius):
    mask = Image.new('L', image.size, 0)
    draw = ImageDraw.Draw(mask)
    width, height = image.size
    draw.rounded_rectangle([(0, 0), (width, height)], radius, fill=255)
    result = Image.new('RGBA', image.size)
    result.paste(image, (0, 0), mask)
    return result

def is_emoji(character: str) -> bool:
    return character in emoji.EMOJI_DATA

def interpolate_colors(colors: List[Tuple[int, int, int]], text_length: int, change_every: int = 1) -> List[Tuple[int, int, int]]:
    result = []
    for i in range(text_length):
        color_idx = (i // change_every) % len(colors)
        result.append(colors[color_idx])
    return result

def create_text(draw: ImageDraw.Draw, text: str, font: ImageFont.FreeTypeFont, 
                emoji_font: ImageFont.FreeTypeFont, text_position: Tuple[int, int], 
                gradient_colors: List[Tuple[int, int, int]]):
    gradient = interpolate_colors(gradient_colors, text_length=len(text), change_every=4)
    current_x = text_position[0]

    for i, char in enumerate(text):
        color = tuple(gradient[i])
        try:
            is_emoji_char = ord(char) >= 0x1F000
            selected_font = emoji_font if is_emoji_char and emoji_font else font
            draw.text((current_x, text_position[1]), char, fill=color, font=selected_font)
            text_bbox = draw.textbbox((current_x, text_position[1]), char, font=selected_font)
            text_width = text_bbox[2] - text_bbox[0]
            current_x += text_width
        except Exception as e:
            print(f"Lỗi khi vẽ ký tự '{char}': {e}. Bỏ qua ký tự này.")
            continue

def add_round_corners(image: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), image.size], radius=radius, fill=255)
    image.putalpha(mask)
    return image


def get_random_text_color():
    return random.choice([(255, 255, 255), (0, 0, 0)])

def info(message, message_object, thread_id, thread_type, author_id, client):
    try:
        mentions = message_object.mentions
        if mentions:
            target_id = mentions[0]['uid']
        else:
            target_id = author_id

        user_info = client.fetchUserInfo(target_id)
        user = user_info.changed_profiles.get(target_id)
        if not user:
            client.send(
                Message(text="Không thể lấy thông tin người dùng."),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return
        text_mode = random.choice(['black', 'white'])
        text_color = (0, 0, 0) if text_mode == 'black' else (255, 255, 255)
        
        glass_color_r = random.randint(50, 200)
        glass_color_g = random.randint(50, 200)
        glass_color_b = random.randint(50, 200)
        glass_color = (glass_color_r, glass_color_g, glass_color_b, 180)
        
        bg_color = (
            random.randint(0, 255),
            random.randint(0, 255),
            random.randint(0, 255)
        )
        background = Image.new("RGB", (1280, 768), bg_color)
        background_dir = "background"
        background_files = [os.path.join(background_dir, f) for f in os.listdir(background_dir) if f.endswith(('.png', '.jpg'))]
        glass_background_path = random.choice(background_files)
        glass_background = Image.open(glass_background_path).convert("RGBA")
        glass_background = glass_background.resize((1280, 768))
        blurred_glass_bg = glass_background.filter(ImageFilter.GaussianBlur(radius=15))
        overlay = Image.new("RGBA", background.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        margin = 50
        glass_width = background.size[0] - 2 * margin
        glass_height = background.size[1] - 2 * margin
        mask = Image.new("L", background.size, 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.rounded_rectangle([(margin, margin), (margin + glass_width, margin + glass_height)], 
                                  radius=30, fill=255)
        glass_layer = Image.new("RGBA", background.size, (0, 0, 0, 0))
        glass_layer.paste(blurred_glass_bg, (0, 0), mask)
        overlay = Image.alpha_composite(overlay, glass_layer)
        background = Image.alpha_composite(background.convert("RGBA"), overlay)
        
        small_glass_width = 420
        small_glass_height = glass_height - 1
        small_glass_x = margin + 1
        small_glass_y = margin + 1
        cover_photo = None
        if hasattr(user, 'cover') and user.cover:
            try:
                cover_response = requests.get(user.cover)
                if cover_response.status_code == 200:
                    cover_photo = Image.open(BytesIO(cover_response.content)).convert("RGBA")
                    cover_photo = cover_photo.resize((small_glass_width, small_glass_height), Image.LANCZOS)
                    cover_photo = cover_photo.filter(ImageFilter.GaussianBlur(radius=10))
                    cover_overlay = Image.new("RGBA", (small_glass_width, small_glass_height), (0, 0, 0, 100))
                    cover_photo = Image.alpha_composite(cover_photo, cover_overlay)
                    cover_mask = Image.new("L", (small_glass_width, small_glass_height), 0)
                    mask_draw = ImageDraw.Draw(cover_mask)
                    mask_draw.rounded_rectangle([(0, 0), (small_glass_width, small_glass_height)], 
                                              radius=25, fill=255)
                    cover_photo.putalpha(cover_mask)
            except Exception as e:
                print(f"Error loading cover photo: {e}")
        
        small_overlay = Image.new("RGBA", (small_glass_width, small_glass_height), (0, 0, 0, 0))
        small_draw = ImageDraw.Draw(small_overlay)
        if cover_photo:
            small_overlay.paste(cover_photo, (0, 0), cover_photo)
        else:
            small_draw.rounded_rectangle([(0, 0), (small_glass_width, small_glass_height)], 
                                       radius=25, fill=glass_color)
        
        shadow_overlay = Image.new("RGBA", (small_glass_width, small_glass_height), (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow_overlay)
        shadow_draw.rounded_rectangle([(0, 0), (small_glass_width, small_glass_height)], 
                                    radius=25, outline=(0, 0, 0, 120), width=3)
        small_overlay = Image.alpha_composite(small_overlay, shadow_overlay)
        background.paste(small_overlay, (small_glass_x, small_glass_y), small_overlay)
        
        avatar_overlay = Image.new("RGBA", (240, 240), glass_color)
        avatar_overlay = add_round_corners(avatar_overlay, 120)
        avatar_x = small_glass_x + (small_glass_width - 240) // 2
        avatar_y = small_glass_y + 30
        background.paste(avatar_overlay, (avatar_x, avatar_y), avatar_overlay)
        
        below_avatar_glass_width = 340
        below_avatar_glass_x = small_glass_x + (small_glass_width - below_avatar_glass_width) // 2
        below_avatar_glass_y = avatar_y + 240 + 20
        below_avatar_glass_height = 350
        below_avatar_overlay = Image.new("RGBA", (below_avatar_glass_width, below_avatar_glass_height), (0, 0, 0, 0))
        below_avatar_draw = ImageDraw.Draw(below_avatar_overlay)
        below_avatar_glass_color = (255, 255, 255, 40)
        below_avatar_draw.rounded_rectangle(
            [(0, 0), (below_avatar_glass_width, below_avatar_glass_height)],
            radius=20,
            fill=below_avatar_glass_color
        )
        bio_text = user.status if user.status else "Mặc định"
        bio_font = ImageFont.truetype("arial unicode ms.otf", 30)
        font_path_emoji = os.path.join("emoji.ttf")
        emoji_font = ImageFont.truetype(font_path_emoji, size=30) if os.path.exists(font_path_emoji) else None
        max_width = below_avatar_glass_width - 20
        wrapped_bio = textwrap.fill(bio_text, width=int(max_width / (bio_font.size * 0.6)))
        bio_lines = wrapped_bio.split('\n')
        line_height = bio_font.getbbox('A')[3]
        total_height = line_height * len(bio_lines)
        bio_y = (below_avatar_glass_height - total_height) // 2
        for i, line in enumerate(bio_lines):
            bio_bbox = below_avatar_draw.textbbox((0, 0), line, font=bio_font)
            bio_width = bio_bbox[2] - bio_bbox[0]
            bio_x = (below_avatar_glass_width - bio_width) // 2
            create_text(below_avatar_draw, line, bio_font, emoji_font, (bio_x, bio_y + i * line_height), [text_color])
        background.paste(below_avatar_overlay, (below_avatar_glass_x, below_avatar_glass_y), below_avatar_overlay)

        avatar_url = user.avatar
        if avatar_url:
            avatar_response = requests.get(avatar_url)
            if avatar_response.status_code == 200:
                avatar_image = Image.open(BytesIO(avatar_response.content)).convert("RGBA")
                avatar_size = 200
                avatar_image = avatar_image.resize((avatar_size, avatar_size), Image.LANCZOS)
                mask = Image.new("L", avatar_image.size, 0)
                draw_mask = ImageDraw.Draw(mask)
                draw_mask.ellipse((0, 0, avatar_size, avatar_size), fill=255)
                avatar_image.putalpha(mask)
                background.paste(avatar_image, (avatar_x + 20, avatar_y + 20), avatar_image)

        name = user.displayName
        box_width = 350
        box_height = 80
        inner_margin = 20
        right_column_x = margin + glass_width - box_width - inner_margin
        left_column_x = small_glass_x + small_glass_width + 20
        total_info_width = (right_column_x - left_column_x) + box_width
        center_info_x = left_column_x + (total_info_width / 2)
        max_name_width = right_column_x - left_column_x - 40
        font_size = 60
        name_font = ImageFont.truetype("arial unicode ms.otf", font_size)
        font_path_emoji = os.path.join("emoji.ttf")
        emoji_font = ImageFont.truetype(font_path_emoji, size=font_size) if os.path.exists(font_path_emoji) else None
        draw = ImageDraw.Draw(background)
        name_bbox = draw.textbbox((0, 0), name, font=name_font)
        name_length = name_bbox[2] - name_bbox[0]
        while name_length > max_name_width and font_size > 30:
            font_size -= 5
            name_font = ImageFont.truetype("arial unicode ms.otf", font_size)
            emoji_font = ImageFont.truetype(font_path_emoji, size=font_size) if os.path.exists(font_path_emoji) else None
            name_bbox = draw.textbbox((0, 0), name, font=name_font)
            name_length = name_bbox[2] - name_bbox[0]
        name_x = center_info_x - (name_length / 2)
        name_y = margin + 50
        create_text(draw, name, name_font, emoji_font, (name_x, name_y), [text_color])
        
        offset = 50
        start_y = name_y + 100 + offset
        vertical_spacing = 95
        box_base_color = (glass_color[0], glass_color[1], glass_color[2])
        box_color = (
            box_base_color[0],
            box_base_color[1],
            box_base_color[2],
            160
        )
        
        info_boxes = [
            {"title": "ID", "value": str(user.userId), "position": (left_column_x, start_y)},
            {"title": "Sinh nhật", "value": datetime.fromtimestamp(user.dob).strftime("%d/%m/%Y") if user.dob else "hidden", "position": (left_column_x, start_y + vertical_spacing)},
            {"title": "Hoạt động", "value": datetime.fromtimestamp(user.lastActionTime/1000).strftime("%H:%M %d/%m/%Y") if user.lastActionTime else "Không xác định", "position": (left_column_x, start_y + vertical_spacing*2)},
            {"title": "Business", "value": "Có" if hasattr(user, 'bizPkg') and user.bizPkg and user.bizPkg.label else "Không", "position": (left_column_x, start_y + vertical_spacing*3)},
            {"title": "Giới tính", "value": 'Nam' if user.gender == 0 else 'Nữ' if user.gender == 1 else 'Không xác định', "position": (right_column_x, start_y)},
            {"title": "Ngày tạo", "value": datetime.fromtimestamp(user.createdTs).strftime("%H:%M %d/%m/%Y") if user.createdTs else "Không xác định", "position": (right_column_x, start_y + vertical_spacing)},
            {"title": "Global ID", "value": str(user.globalId) if hasattr(user, 'globalId') else "Không có", "position": (right_column_x, start_y + vertical_spacing*2)},
            {"title": "Số điện thoại", "value": "hidden", "position": (right_column_x, start_y + vertical_spacing*3)},
        ]
        
        title_font = ImageFont.truetype("arial unicode ms.otf", 20)
        emoji_font_small = ImageFont.truetype(font_path_emoji, size=20) if os.path.exists(font_path_emoji) else None
        
        for box in info_boxes:
            box_overlay = Image.new("RGBA", (box_width, box_height), (0, 0, 0, 0))
            box_draw = ImageDraw.Draw(box_overlay)
            box_draw.rounded_rectangle([(0, 0), (box_width, box_height)], radius=15, fill=box_color)
            
            title = box["title"]
            box_draw.text((10, 5), title, fill=text_color, font=title_font)
            
            value = str(box["value"])
            value_font_size = 20
            if len(value) > 25:
                value_font_size = 16
            elif len(value) > 20:
                value_font_size = 18
            value_font = ImageFont.truetype("arial unicode ms.otf", value_font_size)
            emoji_font_value = ImageFont.truetype(font_path_emoji, size=value_font_size) if os.path.exists(font_path_emoji) else None
            max_chars = int(box_width / (value_font_size * 0.6))
            if len(value) > max_chars:
                value = value[:max_chars-3] + "..."
            create_text(box_draw, value, value_font, emoji_font_value, (10, 35), [text_color])
            background.paste(box_overlay, box["position"], box_overlay)

        status_font = ImageFont.truetype("arial unicode ms.otf", 50)
        emoji_font_status = ImageFont.truetype(font_path_emoji, size=50) if os.path.exists(font_path_emoji) else None
        status_text = "📱 💻 🌎"
        status_bbox = draw.textbbox((0, 0), status_text, font=status_font)
        status_length = status_bbox[2] - status_bbox[0]
        left_info_right_edge = left_column_x + box_width
        right_info_left_edge = right_column_x
        available_space = right_info_left_edge - left_info_right_edge
        status_x = left_info_right_edge + (available_space - status_length) // 2
        status_y = margin + glass_height - 130 + offset

        create_text(draw, status_text, status_font, emoji_font_status, (status_x, status_y), [text_color])
        
        qr_data = client.getQRLink(target_id)
        if not qr_data or target_id not in qr_data:
            client.send(
                Message(text="Không thể lấy mã QR của người dùng."),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return

        qr_link = qr_data[target_id]
        qr_response = requests.get(qr_link)
        if qr_response.status_code != 200:
            client.send(
                Message(text="Không thể tải mã QR."),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return

        qr_image = Image.open(BytesIO(qr_response.content)).convert("RGBA")
        qr_size = 120
        qr_image = qr_image.resize((qr_size, qr_size), Image.LANCZOS)
        qr_position = (margin + glass_width - qr_size - inner_margin, margin + inner_margin)
        background.paste(qr_image, qr_position, qr_image)

        image_path = "info.png"
        background.save(image_path)
        user_info = client.fetchUserInfo(target_id)
        user_name = user_info.changed_profiles.get(target_id).displayName
        message_info = f"🚦 {get_user_name_by_id(client, author_id)} profile {user_name} của bạn đây ✅"
        client.sendLocalImage(
            imagePath=image_path,
            thread_id=thread_id,
            thread_type=thread_type,
            message=Message(text=message_info, mention=Mention(author_id, length=len(f"{get_user_name_by_id(client, author_id)}"), offset=3)),
            height=768,
            width=1280,
            ttl=6000000
        )
    except Exception as e:
        client.send(
            Message(text=f"Đã xảy ra lỗi: {str(e)}"),
            thread_id=thread_id,
            thread_type=thread_type
        )

def create_gradient_colors(num_colors):
    colors = []
    for _ in range(num_colors):
        colors.append((random.randint(100, 175), random.randint(100, 180), random.randint(100, 170)))
    return colors

def interpolate_colors(colors, text_length, change_every):
    gradient = []
    num_segments = len(colors) - 1
    steps_per_segment = (text_length // change_every) + 1

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


def get_id(bot, message_object, thread_id, author_id):
    try:
        mentions = message_object.mentions
        if mentions:
            target_id = mentions[0]['uid']
        else:
            target_id = author_id

        user_info = bot.fetchUserInfo(target_id)
        user = user_info.changed_profiles.get(target_id)
        try:
            gr_id = int(thread_id)
            gr_info = bot.fetchGroupInfo(thread_id)
            gr_name = gr_info['gridInfoMap'][str(thread_id)].name if gr_info and 'gridInfoMap' in gr_info else "Không xác định"
        except:
            gr_name = "Không xác định"
            gr_id = thread_id
        msg = [
            f"🚦Người ⬅️ {getattr(user, 'displayName', 'Không xác định')} 🆔 {getattr(user, 'userId', 'N/A')}",
            f"🚦Nhóm ➡️ {gr_name} 🆔 {gr_id}"
        ]
        return "\n".join(msg)
    except Exception as e:
        print(f"[GET_ID ERROR] {e}")
        return "Đã xảy ra lỗi khi lấy thông tin 🤧"
    
def handle_zl_on(bot, thread_id):
    settings = read_settings()
    if "zl" not in settings:
        settings["zl"] = {}
    settings["zl"][thread_id] = True
    write_settings(settings)
    return f"🚦Lệnh {prefix}zl đã được Bật 🚀 trong nhóm này ✅"

def handle_zl_off(bot, thread_id):
    settings = read_settings()
    if "zl" in settings and thread_id in settings["zl"]:
        settings["zl"][thread_id] = False
        write_settings(settings)
        return f"🚦Lệnh {prefix}zl đã Tắt ⭕️ trong nhóm này ✅"
    return "🚦Nhóm chưa có thông tin cấu hình zl để ⭕️ Tắt 🤗"

def handle_menu_zl_command(message, message_object, thread_id, thread_type, author_id, client):
    try:
        settings = read_settings()
    
        user_message = message.replace(f"{prefix}zl ", "").strip().lower()
        if user_message == "on":
            if not is_admin(author_id):  
                response = "❌Bạn không phải admin bot!"
            else:
                response = handle_zl_on(client, thread_id)
            client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
            return
        elif user_message == "off":
            if not is_admin(author_id):  
                response = "❌Bạn không phải admin bot!"
            else:
                response = handle_zl_off(client, thread_id)
            client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
            return
        
        if not (settings.get("zl", {}).get(thread_id, False)):
            return
        content = message.strip().split()
        commands = "zl"
        if len(content) < 2:
            msg = {
                f"🏷️ Xem QR code": f"({prefix}zl qr [or] {prefix}zl qr @tag)",
                f"🆔 Xem UID Zalo": f"({prefix}zl id)",
                f"🧑‍💻 Xem Profile Zalo": f"({prefix}zl info/@tag)",
            }
            temp_image_path, menu_message = create_menu_zl_image(msg, client, author_id)
            client.sendReaction(message_object, "👌", thread_id, thread_type)
            client.sendLocalImage(
                temp_image_path, thread_id=thread_id, thread_type=thread_type,
                message=Message(text=menu_message, mention=Mention(author_id, length=len(f"{get_user_name_by_id(client, author_id)}"), offset=0)), height=500, width=1280
            )
            os.remove(temp_image_path)
            return
        if len(content) >= 2:
            command = content[1].lower()

            if command == 'qr':
                qr(message, message_object, thread_id, thread_type, author_id, client)
            elif command == 'id':
                info_user=get_id(client, message_object, thread_id, author_id)
                client.replyMessage(Message(text=f"{info_user}"), message_object,thread_id,thread_type)
            elif command == 'card':
                zl_card(client, message_object, author_id, thread_id, thread_type, command)
            elif command == 'info':
                info(message, message_object, thread_id, thread_type, author_id, client)
            else:
                client.replyMessage(Message(text=f"➜ Lệnh [{commands} {command}] không được hỗ trợ 🤧"), message_object, thread_id=thread_id, thread_type=thread_type)

    except Exception as e:
        client.replyMessage(Message(text=f"➜ 🐞 Đã xảy ra lỗi: {e}🤧"), message_object, thread_id=thread_id, thread_type=thread_type)