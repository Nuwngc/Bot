import os
from deep_translator import GoogleTranslator
import requests
from zlapi.models import *
from config import *
from modules.func_bot_info import read_settings, write_settings

def handle_dich_on(bot, thread_id):
    settings = read_settings()
    if "dich" not in settings:
        settings["dich"] = {}
    settings["dich"][thread_id] = True
    write_settings(settings)
    return f"🚦Lệnh {prefix}dich đã được Bật 🚀 trong nhóm này ✅"

def handle_dich_off(bot, thread_id):
    settings = read_settings()
    if "dich" in settings and thread_id in settings["dich"]:
        settings["dich"][thread_id] = False
        write_settings(settings)
        return f"🚦Lệnh {prefix}dich đã Tắt ⭕️ trong nhóm này ✅"
    return "🚦Nhóm chưa có thông tin cấu hình dich để ⭕️ Tắt 🤗"

def handle_translate_command(message, message_object, thread_id, thread_type, author_id, client):
    message_text = message_object.get('content', '').strip()
    settings = read_settings()
    user_message = message.replace(f"{prefix}dich ", "").strip().lower()
    if user_message == "on":
        response = handle_dich_on(client, thread_id)
        client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
        return
    elif user_message == "off":
        response = handle_dich_off(client, thread_id)
        client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
        return
    
    if not (settings.get("dich", {}).get(thread_id, False)):
        return
    if not message_text or len(message_text.split(maxsplit=1)) < 2:
        response = Message(text="Vui lòng nhập văn bản cần dịch sau lệnh.")
        client.replyMessage(response, message_object, thread_id, thread_type)
        return

    _, text_to_translate = message_text.split(maxsplit=1)

    try:
        translator = GoogleTranslator(source='auto', target='vi')
        translated = translator.translate(text_to_translate)
        
        response_text = f"Tiếng Việt:\n{translated}"
        response = Message(text=response_text)
        client.replyMessage(response, message_object, thread_id, thread_type)
        
    except Exception as e:
        # Xử lý lỗi và gửi thông báo
        error_message = f"Lỗi khi dịch: {str(e)}"
        response = Message(text=error_message)
        client.replyMessage(response, message_object, thread_id, thread_type)

def upload_to_catbox(file_path):
    if not os.path.exists(file_path):
        print(f"Lỗi: File không tồn tại tại {file_path}")
        return None

    try:
        with open(file_path, 'rb') as file:
            response = requests.post(
                'https://catbox.moe/user/api.php',
                data={'reqtype': 'fileupload', 'userhash': ''},
                files={'fileToUpload': (os.path.basename(file_path), file)},
                timeout=30
            )
            response.raise_for_status()
            
            catbox_url = response.text.strip()
            if catbox_url.startswith('http'):
                return catbox_url
            else:
                print(f"Lỗi: URL trả về không hợp lệ - {catbox_url}")
                return None
                
    except requests.exceptions.RequestException as e:
        print(f"Lỗi upload Catbox: {str(e)}")
        return None
    except Exception as e:
        print(f"Lỗi không xác định khi upload: {str(e)}")
        return None