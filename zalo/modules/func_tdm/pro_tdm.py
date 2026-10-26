import speedtest
import random
import colorsys
from datetime import datetime, timedelta, timezone
import glob
from io import BytesIO
import os
import requests
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from core.bot_sys import is_admin
from modules.AI_GEMINI.pro_gemini import get_user_name_by_id
from zlapi.models import *

BACKGROUND_PATH = "background/"
CACHE_PATH = "modules/cache/"
OUTPUT_IMAGE_PATH = os.path.join(CACHE_PATH, "menu.png")

# Hàm lấy tên người dùng từ ID (Cần điều chỉnh theo cách lấy tên trong bot của bạn)
def get_user_name_by_id(bot, user_id):
    return "Người Dùng"  # Đổi phần này để lấy tên thật của người dùng từ bot API

# Hàm thực hiện đo tốc độ mạng
def run_speedtest_tag(bot, author_id, thread_id, thread_type, mention_id=None):
    try:
        st = speedtest.Speedtest()
        st.get_best_server()
        download = round(st.download() / 1_000_000, 2)  # Tốc độ download (Mbps)
        upload = round(st.upload() / 1_000_000, 2)  # Tốc độ upload (Mbps)
        ping = round(st.results.ping, 2)  # Ping (ms)

        # Tag người nếu có mention
        if mention_id:
            mention_name = get_user_name_by_id(bot, mention_id)
            msg = f"📡 Kết quả đo mạng cho @{mention_name}:\n⬇️ Download: {download} Mbps\n⬆️ Upload: {upload} Mbps\n📶 Ping: {ping} ms"
            mention_obj = Mention(mention_id, length=len(f"@{mention_name}"), offset=25)
        else:
            mention_name = get_user_name_by_id(bot, author_id)
            msg = f"📡 Kết quả đo mạng cho @{mention_name}:\n⬇️ Download: {download} Mbps\n⬆️ Upload: {upload} Mbps\n📶 Ping: {ping} ms"
            mention_obj = Mention(author_id, length=len(f"@{mention_name}"), offset=25)

        bot.sendMessage(msg, thread_id, thread_type, mentions=[mention_obj])
    except Exception as e:
        bot.sendMessage(f"❌ Lỗi khi đo tốc độ mạng: {e}", thread_id, thread_type)

# Hàm xử lý lệnh -> tdm và các chức năng liên quan
def handle_tdm_command(self, message, thread_id, thread_type):
    author_id = message.author
    text = message.text.lower().strip()
    mentions = message.mentions or []

    # Toggle đo mạng
    if text.startswith("-> tdm check"):
        status = toggle_speedtest(thread_id)
        msg = "✅ Đã BẬT đo tốc độ mạng!" if status else "❌ Đã TẮT đo tốc độ mạng!"
        bot.sendMessage(msg, thread_id, thread_type)
        return

    # Chỉ hiển thị kết quả đo mạng cho người gọi
    if text == "-> tdm":
        bot.sendMessage("⏳ Đang đo tốc độ mạng cho bạn...", thread_id, thread_type)
        run_speedtest_tag(bot, author_id, thread_id, thread_type)
        return

    # Nếu có tag người khác: đo mạng và tag họ
    if text.startswith("-> tdm") and mentions:
        target_id = mentions[0].id
        bot.sendMessage("⏳ Đang đo mạng cho người được tag...", thread_id, thread_type)
        run_speedtest_tag(bot, author_id, thread_id, thread_type, mention_id=target_id)
        return

    # Nếu nhập sai định dạng
    bot.sendMessage("❌ Sai cú pháp! Dùng:\n-> tdm\n-> tdm check\n-> tdm @user", thread_id, thread_type)

# Hàm bật/tắt chức năng đo tốc độ mạng (giả lập)
def toggle_speedtest(thread_id):
    # Giả lập bật/tắt. Thực tế bạn có thể lưu trạng thái vào database hoặc file.
    status = random.choice([True, False])
    return status

# Phần menu và các chức năng liên quan
def handle_menu_commands(message, message_object, thread_id, thread_type, author_id, bot):
    command_names = "".join([
        f"{get_user_name_by_id(bot, author_id)}\n"
        "➜ ☁️ Tdm ({bot.prefix}tdm)\n"
        "➜ 🐳 Tdm @user ({bot.prefix}tdm)\n"
    ])
    
    image_path = generate_menu_image(bot, author_id, thread_id, thread_type)
    
    reaction = [
        "❌", "🤧", "🐞", "😊", "🔥", "👍", "💖", "🚀", "😍", "😂", "😢", "😎", "🙌", "💪", "🌟", "🍀", "🎉", "🦁", "🌈", "🍎", 
        # Thêm các biểu tượng cảm xúc ở đây
    ]
    
    bot.sendReaction(message_object, random.choice(reaction), thread_id, thread_type)
    bot.sendLocalImage(
        imagePath=image_path,
        message=Message(text=command_names, mention=Mention(author_id, length=len(f"{get_user_name_by_id(bot, author_id)}"), offset=0)),
        thread_id=thread_id,
        thread_type=thread_type,
        width=1920, height=600,
        ttl=60000
    )
    
    try:
        os.remove(image_path)
    except Exception as e:
        print(f"❌ Lỗi khi xóa ảnh: {e}")

# Các hàm xử lý ảnh và màu sắc
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

def generate_menu_image(bot, author_id, thread_id, thread_type):
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
        
        # Vẽ lên overlay hoặc thực hiện các thao tác với ảnh
        
        final_image = Image.alpha_composite(bg_image, overlay)
        final_image_path = os.path.join(CACHE_PATH, "final_menu_image.png")
        final_image.save(final_image_path)
        return final_image_path
    
    except Exception as e:
        print(f"Lỗi khi tạo ảnh menu: {e}")
        return None

# Các hàm khác xử lý download ảnh avatar, màu sắc tương phản, v.v. có thể giữ lại tương tự.
