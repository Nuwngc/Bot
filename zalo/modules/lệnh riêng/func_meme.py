from io import BytesIO
import os
import random
import threading
import requests
from modules.fnc_dhbc import get_user_name_by_id
from modules.func_bot_info import create_menu1_image, is_admin, read_settings, write_settings
from config import *
from zlapi.models import *
from PIL import Image, ImageDraw, ImageFont

def upload_to_uguu(file_path):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
    }

    try:
        with open(file_path, 'rb') as file:
            files = {'files[]': file}
            print(f"➜   Uploading file to Uguu: {file_path}")
            response = requests.post("https://uguu.se/upload", files=files, headers=headers)
        
        if response.status_code == 200:
            result = response.json()
            if result.get("success"):
                print(f"➜   Upload thành công!: {file_path}")
                uploaded_url = result["files"][0]["url"]
                return uploaded_url
            else:
                return None
        else:
            return None
    except Exception as e:
        print(f"➜   Lỗi khi upload file lên Uguu: {e}")
        return None

def download_image(url):
    response = requests.get(url)
    if response.status_code == 200:
        file_name = os.path.basename(url)
        file_path = os.path.join(os.getcwd(), file_name)  
        with open(file_path, "wb") as f:
            f.write(response.content)
        return file_path
    return None

def convert_to_webp(image_path):
    webp_path = os.path.splitext(image_path)[0] + ".webp"
    image = Image.open(image_path)
    image.save(webp_path, "WEBP")
    return webp_path

def handle_meme_on(bot, thread_id):
    settings = read_settings()
    if "meme" not in settings:
        settings["meme"] = {}
    settings["meme"][thread_id] = True
    write_settings(settings)
    return f"🚦Lệnh {prefix}meme đã được Bật 🚀 trong nhóm này ✅"

def handle_meme_off(bot, thread_id):
    settings = read_settings()
    if "meme" in settings and thread_id in settings["meme"]:
        settings["meme"][thread_id] = False
        write_settings(settings)
        return f"🚦Lệnh {prefix}meme đã Tắt ⭕️ trong nhóm này ✅"
    return "🚦Nhóm chưa có thông tin cấu hình meme để ⭕️ Tắt 🤗"

def meme(bot, message_object, author_id, thread_id, thread_type, command):
    def meme_command():
        user_name = get_user_name_by_id(bot, author_id)
        try:
            settings = read_settings()
    
            user_message = command.replace(f"{prefix}meme ", "").strip().lower()
            if user_message == "on":
                if not is_admin(author_id):  
                    response = "❌Bạn không phải admin bot!"
                else:
                    response = handle_meme_on(bot, thread_id)
                bot.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
                return
            elif user_message == "off":
                if not is_admin(author_id):  
                    response = "❌Bạn không phải admin bot!"
                else:
                    response = handle_meme_off(bot, thread_id)
                bot.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
                return
            
            if not (settings.get("meme", {}).get(thread_id, False)):
                return
            bot_prefix = f"{prefix}meme"
            parts = command.split()
            response = None  

            if len(parts) == 1:
                response = (
                    "🎉 Chào mừng đến với menu Meme! ⚙️\n"
                    "   ➜ Dùng lệnh 'meme img [nội dung]' để tìm kiếm và gửi ảnh meme.\n"
                    "   ➜ Dùng lệnh 'meme stk [nội dung]' để tạo sticker từ ảnh meme.\n"
                )
            else:
                action = parts[1].lower()

                if action == 'img' or action == 'stk':
                    if len(parts) < 3:
                        response = "➜ Vui lòng cung cấp nội dung tìm kiếm cho meme."
                    else:
                        search_query = " ".join(parts[2:])
                        url = f"https://subhatde.id.vn/pinterest?search={search_query}"
                        res = requests.get(url)
                        if res.status_code == 200:
                            data = res.json()
                            if data["count"] > 0:
                                image_url = random.choice(data["data"])
                                image_path = download_image(image_url)
                                if image_path:
                                    if action == 'img':
                                        bot.sendLocalImage(
                                            image_path, thread_id=thread_id, thread_type=thread_type,
                                            message=Message(text=f"{user_name} đây là ảnh meme của bạn '{search_query}':"), height=1000, width=1000, ttl=1200000
                                        )
                                    elif action == 'stk':
                                        webp_path = convert_to_webp(image_path)
                                        uploaded_url = upload_to_uguu(webp_path)
                                        if uploaded_url:
                                            bot.sendCustomSticker(
                                                staticImgUrl=uploaded_url,
                                                animationImgUrl=uploaded_url,
                                                thread_id=thread_id,
                                                thread_type=thread_type,
                                                reply=message_object,
                                                width=1000,
                                                height=1000,
                                                ttl=100000
                                            )
                                        if os.path.exists(webp_path):
                                            os.remove(webp_path)
                                    if os.path.exists(image_path):
                                        os.remove(image_path)
                                else:
                                    response = "➜ Không thể tải ảnh meme."
                            else:
                                response = "➜ Không tìm thấy ảnh meme nào với nội dung này."
                        else:
                            response = "➜ Đã xảy ra lỗi khi tìm kiếm ảnh meme."
                else:
                    response = f"➜ Lệnh [{bot_prefix} {action}] không được hỗ trợ 🤧"

            if response is not None:
                if len(parts) == 1:
                    temp_image_path = create_menu1_image({"response": response}, 1, bot, author_id)
                    bot.sendLocalImage(
                        temp_image_path, thread_id=thread_id, thread_type=thread_type,
                        message=Message(text=response), height=500, width=1280, ttl=1200000
                    )
                    if os.path.exists(temp_image_path):
                        os.remove(temp_image_path)
                else:
                    bot.replyMessage(Message(text=response), message_object, thread_id=thread_id, thread_type=thread_type, ttl=100000)
        except Exception as e:
            print(f"Error: {e}")
            bot.replyMessage(Message(text="➜ 🐞 Đã xảy ra lỗi gì đó 🤧"), message_object, thread_id=thread_id, thread_type=thread_type)

    thread = threading.Thread(target=meme_command)
    thread.start()