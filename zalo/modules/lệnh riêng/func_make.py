from io import BytesIO
import logging
import os
import re
import threading
import time
from config import *
import requests
from zlapi.models import *
from modules.func_bot_info import get_user_name_by_id, is_admin, read_settings, write_settings
from PIL import Image

cache_dir = 'modules/cache'
os.makedirs(cache_dir, exist_ok=True)

def handle_make_on(bot, thread_id):
    settings = read_settings()
    if "make" not in settings:
        settings["make"] = {}
    settings["make"][thread_id] = True
    write_settings(settings)
    return f"🚦Lệnh {prefix}make đã được Bật 🚀 trong nhóm này ✅"

def handle_make_off(bot, thread_id):
    settings = read_settings()
    if "make" in settings and thread_id in settings["make"]:
        settings["make"][thread_id] = False
        write_settings(settings)
        return f"🚦Lệnh {prefix}make đã Tắt ⭕️ trong nhóm này ✅"
    return "🚦Nhóm chưa có thông tin cấu hình make để ⭕️ Tắt 🤗"

def delete_image(image_path):
    time.sleep(120)
    if os.path.exists(image_path):
        os.remove(image_path)
        logging.info(f"Đã xóa ảnh: {image_path}")

def get_image_dimensions(image_data):
    image = Image.open(BytesIO(image_data))
    return image.size

def send_image_response(self, thread_id, thread_type, image_path, prompt, author_id):
    with open(image_path, 'rb') as img_file:
        image_data = img_file.read()
    
    width, height = get_image_dimensions(image_data)
    
    message_to_send = Message(
        text=f"🚦 {get_user_name_by_id(self, author_id)} Đã tạo ảnh theo yêu cầu: '{prompt}' của bạn đây ✅",
        mention=Mention(author_id, length=len(author_id), offset=3)
    )

    self.sendLocalImage(
        image_path,
        message=message_to_send,
        thread_id=thread_id,
        thread_type=thread_type,
        width=width,
        height=height
    )
    logging.info(f"Đã gửi ảnh: {image_path}")

    threading.Thread(target=delete_image, args=(image_path,)).start()

def handle_make_command(message, message_object, thread_id, thread_type, author_id, self):
    try:
        settings = read_settings()
    
        user_message = message.replace(f"{prefix}make ", "").strip().lower()
        if user_message == "on":
            if not is_admin(author_id):  
                response = "❌Bạn không phải admin bot!"
            else:
                response = handle_make_on(self, thread_id)
            self.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
            return
        elif user_message == "off":
            if not is_admin(author_id):  
                response = "❌Bạn không phải admin bot!"
            else:
                response = handle_make_off(self, thread_id)
            self.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
            return

        if not (settings.get("make", {}).get(thread_id, False)):
            return
        
        content = message.strip().split()
        args = content[1:]

        if not args:
            welcome_message = (
                f"{get_user_name_by_id(self, author_id)} muốn {get_user_name_by_id(self, self.uid)} vẽ gì nào?"
            )
            self.sendMessage(Message(text=welcome_message), thread_id=thread_id, thread_type=thread_type)
            return
        creating_message = Message(
            text=f"🚦 Đang vẽ đợi xíu nha ⛱", 
            mention=Mention(author_id, length=len(author_id), offset=3)
        )
        self.sendMessage(creating_message, thread_id, thread_type, ttl=20000)

        prompt = " ".join(args)
        image_data = fetch_image_from_api(prompt)
        image_path = save_image(image_data, prompt)

        send_image_response(self, thread_id, thread_type, image_path, prompt, author_id)

    except requests.RequestException as req_err:
        logging.error(f"Lỗi yêu cầu API: {str(req_err)}")
        error_message = Message(text="Đã xảy ra lỗi khi kết nối đến API. Vui lòng thử lại!")
        self.sendMessage(error_message, thread_id, thread_type, ttl=120000)
    except Exception as e:
        logging.error(f"Lỗi: {str(e)}")
        error_message = Message(text="Đã xảy ra lỗi: Vui lòng thử lại!")
        self.sendMessage(error_message, thread_id, thread_type, ttl=120000)

def fetch_image_from_api(prompt):
    """Lấy hình ảnh từ API dựa trên prompt."""
    api_url = f"https://image.pollinations.ai/prompt/{prompt}"
    try:
        response = requests.get(api_url)
        response.raise_for_status()
        return response.content
    except requests.RequestException as e:
        logging.error(f"API Error: {e}")
        raise

def save_image(image_data, prompt):
    """Lưu hình ảnh vào thư mục cache."""
    image_name = f"{sanitize_prompt(prompt)}.jpeg"
    image_path = os.path.join(cache_dir, image_name)
    
    with open(image_path, 'wb') as f:
        f.write(image_data)
    
    return image_path

def sanitize_prompt(prompt):
    """Làm sạch prompt để sử dụng làm tên file."""
    return re.sub(r'[<>:"/\\|?*]', '_', prompt)