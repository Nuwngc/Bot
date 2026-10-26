from io import BytesIO
import os
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import requests
from modules.func_bot_info import is_admin
from zlapi.models import *
from config import *

def handle_hiden_commands(message, thread_id, thread_type, author_id, bot, message_object):
    if not is_admin(author_id):
            bot.replyMessage(Message(text="❌ Bạn không phải admin bot!"), 
                            message_object, thread_id=thread_id, 
                            thread_type=thread_type, ttl=100000)
            return
    command_names = {
        f"➜ 💪 Kích toàn bộ member": f"({prefix}kickall)",
        f"➜ 🍭 join link nhóm": f"({prefix}join)",
        f"➜ 🆘 Giải tán nhóm:": f"({prefix}disbox)",
        f"➜ 🧨 spam link nhóm": f"({prefix}spam)",
        f"➜ 👋 Rời nhóm": f"({prefix}leave)",
    }

    temp_image_path, menu_message = create_hiden_image(command_names, bot, author_id)

    bot.sendLocalImage(
        temp_image_path, thread_id=thread_id, thread_type=thread_type,
        message=Message(text=menu_message, mention=Mention(author_id, length=len(f"{get_user_name_by_id(bot, author_id)}"), offset=0)), height=500, width=1280
    )

    os.remove(temp_image_path)

def create_gradient_colors(num_colors):
    return [(random.randint(100, 175), random.randint(100, 180), random.randint(100, 170)) for _ in range(num_colors)]

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

def get_user_name_by_id(bot, author_id):
    try:
        user_info = bot.fetchUserInfo(author_id).changed_profiles[author_id]
        return user_info.zaloName or user_info.displayName
    except Exception as e:
        return "Unknown User"

def create_hiden_image(command_names, bot, author_id):
    avatar_url = None

    if author_id:
        user_info = bot.fetchUserInfo(author_id)
        avatar_url = user_info.changed_profiles.get(author_id).avatar

    current_page_commands = list(command_names.items())

    numbered_commands = [f"{name} - {desc}" for i, (name, desc) in enumerate(current_page_commands)]

    menu_message = (
        f"{get_user_name_by_id(bot, author_id)}\n"
        + "\n".join(numbered_commands)
    )
    background_dir = "background"
    background_files = [os.path.join(background_dir, f) for f in os.listdir(background_dir) if f.endswith(('.png', '.jpg'))]
    background_path = random.choice(background_files)
    image = Image.open(background_path).convert("RGBA")
    image = image.resize((1280, 500))

    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    rect_x0 = (1280 - 1100) // 2
    rect_y0 = (500 - 300) // 2
    rect_x1 = rect_x0 + 1100
    rect_y1 = rect_y0 + 300

    radius = 50
    draw.rounded_rectangle([rect_x0, rect_y0, rect_x1, rect_y1], radius=radius, fill=(255, 255, 255, 200))
    overlay = Image.alpha_composite(image, overlay)
    if avatar_url:
        try:
            avatar_response = requests.get(avatar_url)
            avatar_image = Image.open(BytesIO(avatar_response.content)).convert("RGBA").resize((100, 100))

            gradient_size = 110
            gradient_colors = create_gradient_colors(7)
            gradient_overlay = Image.new("RGBA", (gradient_size, gradient_size), (0, 0, 0, 0))
            gradient_draw = ImageDraw.Draw(gradient_overlay)

            for i, color in enumerate(gradient_colors):
                radius = gradient_size // 2 - i
                gradient_draw.ellipse(
                    (i, i, gradient_size - i, gradient_size - i),
                    outline=color,
                    width=1
                )

            mask = Image.new("L", avatar_image.size, 0)
            ImageDraw.Draw(mask).ellipse((0, 0, 100, 100), fill=255)
            gradient_overlay.paste(avatar_image, (5, 5), mask)

            overlay.paste(gradient_overlay, (rect_x0 + 20, rect_y0 + 100), gradient_overlay)
        except Exception:
            pass

    text_hi = f"Hi {user_info.changed_profiles[author_id].displayName}!" if author_id in user_info.changed_profiles else "Hi Người dùng!"
    text_welcome = f"🎊 Chào {user_info.changed_profiles[author_id].displayName}, Tôi có thể giúp gì cho bạn?"
    text_bot_info = f"🤖 Bot: {get_user_name_by_id(bot, bot.uid)} 💻 version 1.0.0 🗓️ update 08-01-24"
    text_bot_ready = f"♥️ bot sẵn sàng phục vụ"
    font_paci = "arial unicode ms.otf"
    font_emoji = "emoji.ttf"
    draw = ImageDraw.Draw(overlay)

    font_hi = ImageFont.truetype(font_paci, size=50) if os.path.exists(font_paci) else ImageFont.load_default()
    font_welcome = ImageFont.truetype(font_paci, size=35) if os.path.exists(font_paci) else ImageFont.load_default()
    font_bot_info = ImageFont.truetype(font_emoji, size=25) if os.path.exists(font_emoji) else ImageFont.load_default()

    x_hi = (1300 - draw.textbbox((0, 0), text_hi, font=font_hi)[2]) // 2
    y_hi = rect_y0 + 10

    gradient_colors_hi = interpolate_colors(create_gradient_colors(5), len(text_hi), 1)
    for i, char in enumerate(text_hi):
        draw.text((x_hi, y_hi), char, font=font_hi, fill=gradient_colors_hi[i])
        x_hi += draw.textbbox((0, 0), char, font=font_hi)[2]

    x_welcome = (1300 - draw.textbbox((0, 0), text_welcome, font=font_welcome)[2]) // 2
    y_welcome = y_hi + 60

    gradient_colors_welcome = interpolate_colors(create_gradient_colors(5), len(text_welcome), 1)
    for i, char in enumerate(text_welcome):
        draw.text((x_welcome, y_welcome), char, font=font_welcome, fill=gradient_colors_welcome[i])
        x_welcome += draw.textbbox((0, 0), char, font=font_welcome)[2]

    x_bot_info = rect_x0 + 130
    y_bot_info = rect_y1 - 60

    gradient_colors_bot_info = interpolate_colors(create_gradient_colors(7), len(text_bot_info), 1)
    current_x = x_bot_info

    for i, char in enumerate(text_bot_info):
        if char in "🤖💻🗓️":
            current_font = font_bot_info
        else:
            current_font = font_welcome

        draw.text((current_x, y_bot_info), char, font=current_font, fill=gradient_colors_bot_info[i])
        char_width = draw.textbbox((0, 0), char, font=current_font)[2]
        current_x += char_width

    y_bot_ready = y_bot_info - 80
    gradient_colors_bot_ready = interpolate_colors(create_gradient_colors(5), len(text_bot_ready), 1)
    current_x_bot_ready = (1300 - draw.textbbox((0, 0), text_bot_ready, font=font_welcome)[2]) // 2

    for i, char in enumerate(text_bot_ready):
        if char in "♥️:3🤗🎉":
            current_font = font_bot_info
        else:
            current_font = font_welcome
        draw.text((current_x_bot_ready, y_bot_ready), char, font=current_font, fill=gradient_colors_bot_ready[i])
        current_x_bot_ready += draw.textbbox((0, 0), char, font=current_font)[2]

    overlay = Image.alpha_composite(image, overlay)
    temp_image_path = "hiden.png"
    overlay.save(temp_image_path)

    return temp_image_path, menu_message