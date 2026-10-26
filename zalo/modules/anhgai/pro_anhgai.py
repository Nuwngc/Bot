import os
import random
import time
import threading
from zlapi.models import *
import requests

def get_user_name_by_id(bot, author_id):
    try:
        user_info = bot.fetchUserInfo(author_id).changed_profiles[author_id]
        return user_info.zaloName or user_info.displayName
    except Exception as e:
        return "Unknown User"

def download_and_send_image(image_url, thread_id, thread_type, author_id, client):
    try:

        msg = f"[By: {get_user_name_by_id(client, author_id)}]"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
        }
        
        image_response = requests.get(image_url, headers=headers)
        image_response.raise_for_status()
        
        temp_image_path = 'modules/cache/temp_image1.jpeg'
        with open(temp_image_path, 'wb') as f:
            f.write(image_response.content)

        if os.path.exists(temp_image_path):
            client.sendLocalImage(
                temp_image_path,
                thread_id=thread_id,
                message=Message(text=msg),
                thread_type=thread_type,
                width=1200,
                height=1600
            )
            os.remove(temp_image_path)
        else:
            raise Exception("Không thể lưu ảnh")

    except requests.exceptions.RequestException as e:
        error_message = f"Đã xảy ra lỗi khi gọi API: {str(e)}"
        client.sendMessage(error_message, thread_id, thread_type)
    except Exception as e:
        error_message = f"Đã xảy ra lỗi: {str(e)}"
        client.sendMessage(error_message, thread_id, thread_type)

def handle_anhgai_command(message, message_object, thread_id, thread_type, author_id, client):
    try:
        image_list_url = "https://raw.githubusercontent.com/nguyenductai206/list/refs/heads/main/listimg.json"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
        }
        
        response = requests.get(image_list_url, headers=headers)
        response.raise_for_status()
        json_data = response.json()
        
        if isinstance(json_data, dict) and 'url' in json_data:
            image_url = json_data.get('url')
        elif isinstance(json_data, list):
            image_url = random.choice(json_data)
        else:
            raise Exception("Dữ liệu trả về không hợp lệ")
        thread = threading.Thread(target=download_and_send_image, args=(image_url, thread_id, thread_type, author_id, client))
        thread.start()

    except requests.exceptions.RequestException as e:
        error_message = f"Đã xảy ra lỗi khi gọi API: {str(e)}"
        client.sendMessage(error_message, thread_id, thread_type)
    except Exception as e:
        error_message = f"Đã xảy ra lỗi: {str(e)}"
        client.sendMessage(error_message, thread_id, thread_type)