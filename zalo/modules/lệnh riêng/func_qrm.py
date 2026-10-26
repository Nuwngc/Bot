import colorsys
import os
import random
from typing import Counter
import requests
import urllib
from zlapi.models import *
from config import *
from modules.func_bot_info import is_admin, read_settings, write_settings
from PIL import Image, ImageDraw, ImageFont, ImageFilter


icon_list = ["🥴", "😘", "🎯", "💘", "♨️", "🎟️", "🧧", "💳", "💖", "👋", "😃", "🎭", "🥰", "💡"]

def add_rainbow_border(avatar_img, border_size=8):
    try:
        avatar_size = avatar_img.size
        rainbow_border = Image.new("RGBA", (avatar_size[0] + border_size * 2, avatar_size[1] + border_size * 2), (0, 0, 0, 0))
        draw_border = ImageDraw.Draw(rainbow_border)
        steps = 360
        for i in range(steps):
            h = i / steps
            r, g, b = colorsys.hsv_to_rgb(h, 1.0, 1.0)
            color = (int(r * 255), int(g * 255), int(b * 255), 255)
            angle = i * (360 / steps)
            draw_border.arc(
                [(border_size / 2, border_size / 2), 
                 (avatar_size[0] + border_size * 1.5, avatar_size[1] + border_size * 1.5)],
                start=angle, 
                end=angle + (360 / steps), 
                fill=color, 
                width=border_size
            )

        avatar_with_border = Image.new("RGBA", rainbow_border.size, (0, 0, 0, 0))
        avatar_with_border.paste(rainbow_border, (0, 0), rainbow_border)
        avatar_with_border.paste(avatar_img, (border_size, border_size), avatar_img)

        return avatar_with_border
    except Exception as e:
        print(f"Lỗi khi thêm viền cầu vồng: {e}")
        return avatar_img
        
def get_random_background():
    background_dir = "background/"
    if not os.path.exists(background_dir):
        os.makedirs(background_dir, exist_ok=True)
        return None
    files = [f for f in os.listdir(background_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    return os.path.join(background_dir, random.choice(files)) if files else None

def get_dominant_color(image_path):
    try:
        if not os.path.exists(image_path):
            return (0, 0, 0, 200)
        img = Image.open(image_path).convert("RGB")
        img = img.resize((150, 150), Image.Resampling.LANCZOS)
        pixels = img.getdata()
        color_counts = Counter(pixels)
        common_colors = color_counts.most_common(5)
        for color, _ in common_colors:
            r, g, b = [x / 255.0 for x in color]
            luminance = 0.299 * r + 0.587 * g + 0.114 * b
            if luminance < 0.8:
                h, s, v = colorsys.rgb_to_hsv(r, g, b)
                s = min(1.0, s * 1.1)
                v = min(1.0, v * 1.1)
                r, g, b = colorsys.hsv_to_rgb(h, s, v)
                return (int(r * 255), int(g * 255), int(b * 255), 200)
        return (0, 0, 0, 200)
    except Exception as e:
        print(f"Lỗi get_dominant_color: {e}")
        return (0, 0, 0, 200)

def get_contrasting_text_color(box_color):
    r, g, b, _ = box_color
    luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return (0, 0, 0, 255) if luminance > 0.5 else (255, 255, 255, 255)

def random_contrast_color(base_color):
    r, g, b, _ = base_color
    luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    if luminance > 0.5:
        r = random.randint(50, 180)
        g = random.randint(50, 180)
        b = random.randint(50, 180)
    else:
        r = random.randint(150, 255)
        g = random.randint(150, 255)
        b = random.randint(150, 255)
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    s = min(1.0, s * 1.2)
    v = min(1.0, v * 1.1)
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return (int(r * 255), int(g * 255), int(b * 255), 255)

def download_avatar(avatar_url, save_path="modules/cache/user_avatar.png"):
    try:
        if not os.path.exists("modules/cache"):
            os.makedirs("modules/cache", exist_ok=True)
        resp = requests.get(avatar_url, stream=True, timeout=10)
        if resp.status_code == 200:
            with open(save_path, "wb") as f:
                for chunk in resp.iter_content(1024):
                    f.write(chunk)
            return save_path
    except Exception as e:
        print(f"Lỗi download_avatar: {e}")
        return None

def add_avatar_to_qr(qr_path, avatar_url, output_path):
    try:
        qr_img = Image.open(qr_path).convert("RGBA")
        qr_size = qr_img.size

        border_size = 40
        bg_size = (qr_size[0] + border_size * 2, qr_size[1] + border_size * 2)
        bg_img = Image.new("RGBA", bg_size, (255, 255, 255, 0))

        corner_radius = 40
        draw = ImageDraw.Draw(bg_img)
        draw.rounded_rectangle(
            (0, 0) + bg_size,
            radius=corner_radius,
            outline=(200, 200, 200),
            width=8
        )
        qr_x = (bg_size[0] - qr_size[0]) // 2
        qr_y = (bg_size[1] - qr_size[1]) // 2
        bg_img.paste(qr_img, (qr_x, qr_y), qr_img)

        avatar_size = 120
        avatar_path = download_avatar(avatar_url)
        if avatar_path and os.path.exists(avatar_path):
            avatar_img = Image.open(avatar_path).convert("RGBA").resize((avatar_size, avatar_size))

            mask = Image.new("L", (avatar_size, avatar_size), 0)
            ImageDraw.Draw(mask).ellipse((0, 0, avatar_size, avatar_size), fill=255)

            border_thickness = 8
            avatar_border_size = avatar_size + border_thickness * 2
            avatar_border = Image.new("RGBA", (avatar_border_size, avatar_border_size), (255, 255, 255, 0))

            border_draw = ImageDraw.Draw(avatar_border)
            border_draw.rounded_rectangle(
                (0, 0, avatar_border_size, avatar_border_size),
                radius=avatar_border_size // 2,
                outline=(255, 255, 255),
                width=8
            )

            avatar_border.paste(avatar_img, (border_thickness, border_thickness), mask)

            avatar_x = (bg_size[0] - avatar_border_size) // 2
            avatar_y = (bg_size[1] - avatar_border_size) // 2

            bg_img.paste(avatar_border, (avatar_x, avatar_y), avatar_border)

            os.remove(avatar_path)

        bg_img.save(output_path, format="PNG", optimize=True)
        return output_path if os.path.exists(output_path) else None

    except Exception as e:
        print(f"Lỗi add_avatar_to_qr: {e}")
        return None

def handle_qrm_on(bot, thread_id):
    settings = read_settings()
    if "qrm" not in settings:
        settings["qrm"] = {}
    settings["qrm"][thread_id] = True
    write_settings(settings)
    return f"🚦Lệnh {prefix}qrm đã được Bật 🚀 trong nhóm này ✅"

def handle_qrm_off(bot, thread_id):
    settings = read_settings()
    if "qrm" in settings and thread_id in settings["qrm"]:
        settings["qrm"][thread_id] = False
        write_settings(settings)
        return f"🚦Lệnh {prefix}qrm đã Tắt ⭕️ trong nhóm này ✅"
    return "🚦Nhóm chưa có thông tin cấu hình qrm để ⭕️ Tắt 🤗"
    
def handle_qrcode_command(message, message_object, thread_id, thread_type, author_id, self):

    settings = read_settings()
    
    user_message = message.replace(f"{prefix}qrm ", "").strip().lower()
    if user_message == "on":
        if not is_admin(author_id):  
            response = "❌Bạn không phải admin bot!"
        else:
            response = handle_qrm_on(self, thread_id)
        self.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
        return
    elif user_message == "off":
        if not is_admin(author_id):  
            response = "❌Bạn không phải admin bot!"
        else:
            response = handle_qrm_off(self, thread_id)
        self.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
        return
    
    if not (settings.get("qrm", {}).get(thread_id, False)):
        return

    if hasattr(message, 'text'):
        text = message.text.strip().split()
    elif isinstance(message, str):
        text = message.strip().split()
    else:
        raise ValueError("Tham số 'message' phải là chuỗi hoặc đối tượng Message có thuộc tính 'text'")

    your_id = f"{thread_id}"
    emoji = random.choice(icon_list)
    try:
        self.sendReaction(message_object, emoji, thread_id, thread_type, reactionType=75)
    except Exception as e:
        print(f"Lỗi khi gửi reaction {emoji}: {e}")

    if len(text) < 2 or not text[1].strip():
        bg_path = get_random_background()
        if not bg_path:
            self.sendMessage(Message(text="⚠️ Không tìm thấy ảnh nền trong thư mục background/!"), thread_id, thread_type, ttl=18000)
            return

        if not os.path.exists("modules/cache"):
            os.makedirs("modules/cache", exist_ok=True)

        try:
            user_info = self.fetchUserInfo(author_id)
            if user_info and hasattr(user_info, 'changed_profiles') and author_id in user_info.changed_profiles:
                user = user_info.changed_profiles[author_id]
                avatar_url = user.avatar if hasattr(user, 'avatar') and user.avatar else None
                user_name = getattr(user, 'name', None) or getattr(user, 'displayName', None) or f"ID_{author_id}"
            else:
                avatar_url = None
                user_name = f"ID_{author_id}"
        except Exception as e:
            print(f"Lỗi fetchUserInfo: {e}")
            avatar_url = None
            user_name = f"ID_{author_id}"


        menu_text = """🚦 {display_name}   
🚦 Sai cú pháp:
➜ getqr 'nội dung': ♨️ Tạo mã QR theo nội dung
"""

        try:
            if thread_type == ThreadType.USER:
                display_name = "Người Dùng" if str(author_id) == your_id else user_name
                self.sendMessage(
                    message=Message(text=menu_text.format(display_name=display_name)),
                    thread_id=thread_id,
                    thread_type=thread_type,
                    ttl=18000
                )
            else:
                display_name = f"@{user_name}"
                self.sendMessage(
                    message=Message(text=menu_text.format(display_name=display_name), mention=Mention(author_id, offset=len("🚦 "), length=len(f"@{user_name}"))),
                    thread_id=thread_id,
                    thread_type=thread_type,
                    ttl=18000
                )
        except Exception as e:
            print(f"Lỗi gửi ảnh menu: {e}")
            self.sendMessage(Message(text="⚠️ Lỗi khi gửi ảnh menu! Vui lòng thử lại."), thread_id, thread_type, ttl=18000)
        return

    # Ghép nội dung thành một chuỗi đầy đủ
    content = " ".join(text[1:])
    encoded_text = urllib.parse.quote(content, safe='')

    # Gửi thông báo trước khi tạo QR Code
    waiting_message = Message(text=f"🚦 Đang tạo QR: {content}")
    try:
        self.replyMessage(waiting_message, message_object, thread_id, thread_type, ttl=18000)
    except Exception as e:
        print(f"Lỗi khi replyMessage: {e}")
        self.sendMessage(Message(text="🚦 Chờ xíu !! Bot đang tạo QR Code cho bạn ♨️"), thread_id, thread_type, ttl=18000)

    try:
        # Tạo QR Code từ API
        api_qrcode = f'https://api.qrserver.com/v1/create-qr-code/?size=820x820&data={encoded_text}'
        image_response = requests.get(api_qrcode)
        if image_response.status_code != 200:
            raise Exception("Lỗi khi tải ảnh từ API!")

        temp_qr_path = 'modules/cache/temp_qrcode.jpeg'
        with open(temp_qr_path, 'wb') as f:
            f.write(image_response.content)

        # Lấy thông tin người dùng để thêm avatar vào QR
        try:
            user_info = self.fetchUserInfo(author_id)
            if user_info and hasattr(user_info, 'changed_profiles') and author_id in user_info.changed_profiles:
                user = user_info.changed_profiles[author_id]
                avatar_url = user.avatar if hasattr(user, 'avatar') and user.avatar else None
            else:
                avatar_url = None
        except Exception as e:
            print(f"Lỗi fetchUserInfo cho QR: {e}")
            avatar_url = None

        # Thêm avatar vào QR code
        qr_with_avatar_path = 'modules/cache/qr_with_avatar.png'
        processed_qr_path = add_avatar_to_qr(temp_qr_path, avatar_url, qr_with_avatar_path) if os.path.exists(temp_qr_path) else temp_qr_path

        # Lấy ảnh nền từ thư mục background
        bg_path = get_random_background()
        if not bg_path:
            self.sendMessage(Message(text="⚠️ Không tìm thấy ảnh nền trong thư mục background/!"), thread_id, thread_type, ttl=18000)
            return

        # Resize ảnh nền thành 720x1198 và làm mờ để giảm chói
        size = (720, 1198)
        bg_image = Image.open(bg_path).convert("RGBA").resize(size, Image.Resampling.LANCZOS)
        bg_image = bg_image.filter(ImageFilter.GaussianBlur(radius=5))  # Làm mờ ảnh nền

        # Tạo lớp phủ trong suốt và áp dụng lên ảnh nền trước
        overlay = Image.new("RGBA", size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        # Tạo hộp trong suốt kích thước 4.3/5
        box_width = int(size[0] * 4.3 / 5)  # 720 * 4.3/5 = 619px
        box_height = int(size[1] * 4.3 / 5)  # 1198 * 4.3/5 = 1029px
        box_x1 = (size[0] - box_width) // 2  # (720 - 619) // 2 = 50px
        box_y1 = (size[1] - box_height) // 2  # (1198 - 1029) // 2 = 84px
        box_x2 = box_x1 + box_width  # 50 + 619 = 669px
        box_y2 = box_y1 + box_height  # 84 + 1029 = 1113px
        box_color = get_dominant_color(bg_path)  # Lấy màu từ ảnh nền
        adjusted_box_color = (box_color[0], box_color[1], box_color[2], 150)  # Độ trong suốt 150
        draw.rounded_rectangle([(box_x1, box_y1), (box_x2, box_y2)], radius=35, fill=adjusted_box_color)

        # Kết hợp ảnh nền và overlay trước khi thêm các thành phần khác
        bg_with_overlay = Image.alpha_composite(bg_image, overlay)

        # Thêm avatar người gọi lệnh ở trên hộp trong suốt
        avatar_size = 150
        avatar_path = download_avatar(avatar_url)
        if avatar_path and os.path.exists(avatar_path):
            avatar_img = Image.open(avatar_path).convert("RGBA").resize((avatar_size, avatar_size))
            mask = Image.new("L", (avatar_size, avatar_size), 0)
            ImageDraw.Draw(mask).ellipse((0, 0, avatar_size, avatar_size), fill=255)
            avatar_x = box_x1 + (box_width - avatar_size) // 2  # Căn giữa avatar
            avatar_y = box_y1 - 50  # Cách mép trên hộp 20px
            bg_with_overlay.paste(avatar_img, (avatar_x, avatar_y), mask)
            os.remove(avatar_path)

        # Resize và đặt QR code với chiều ngang bằng hộp trong suốt
        qr_img = Image.open(processed_qr_path).convert("RGBA")
        qr_width = box_width - 40  # Chừa lề 20px mỗi bên
        qr_height = qr_width  # Giữ tỉ lệ vuông
        qr_img = qr_img.resize((qr_width, qr_height), Image.Resampling.LANCZOS)
        qr_x = box_x1 + 20  # Cách mép trái hộp 20px
        qr_y = avatar_y + avatar_size + 55  # Dưới avatar, cách 20px
        bg_with_overlay.paste(qr_img, (qr_x, qr_y), qr_img)

        # Ghi "Admin: Dexry x Bot" ở dưới QR code
        font_arial_path = "font/arial unicode ms bold.otf"
        font_text = ImageFont.truetype(font_arial_path, 40) if os.path.exists(font_arial_path) else ImageFont.load_default()
        text_color = get_contrasting_text_color(box_color)
        admin_text = f"{user_info.changed_profiles[author_id].displayName}" # noti
        bbox_admin = draw.textbbox((0, 0), admin_text, font=font_text)
        admin_width = bbox_admin[2] - bbox_admin[0]
        admin_x = box_x1 + (box_width - admin_width) // 2  # Căn giữa
        admin_y = qr_y + qr_height - 640  # Dưới QR code, cách 20px
        draw = ImageDraw.Draw(bg_with_overlay)  # Vẽ trực tiếp lên bg_with_overlay
        draw.text((admin_x, admin_y), admin_text, font=font_text, fill=text_color)

        # Lưu ảnh cuối cùng
        final_path = 'modules/cache/final_qrcode_with_bg.png'
        bg_with_overlay.save(final_path, format="PNG", optimize=True)

        # Gửi ảnh cuối cùng
        if os.path.exists(final_path):
            self.sendLocalImage(final_path, message=Message(text=f"{user_info.changed_profiles[author_id].displayName}"), thread_id=thread_id, thread_type=thread_type, width=720, height=1198, ttl=180000)
            os.remove(final_path)
            if os.path.exists(temp_qr_path):
                os.remove(temp_qr_path)
            if os.path.exists(qr_with_avatar_path):
                os.remove(qr_with_avatar_path)

    except requests.exceptions.RequestException as e:
        self.sendMessage(Message(text=f"⚠️ Đã xảy ra lỗi khi gọi API: {str(e)}"), thread_id, thread_type)
    except Exception as e:
        print(f"Lỗi tạo QR: {e}")
        self.sendMessage(Message(text=f"⚠️ Đã xảy ra lỗi không xác định: {str(e)}"), thread_id, thread_type, ttl=18000)