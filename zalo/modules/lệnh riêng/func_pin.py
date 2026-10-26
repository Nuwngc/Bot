import logging
import os
import random
import time
from typing import Any, Dict, List
import requests
import urllib
from zlapi.models import *
from config import *
from modules.func_bot_info import get_user_name_by_id, is_admin, read_settings, write_settings


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SEARCH_TIMEOUT = 20
IMAGE_SAVE_PATH = './temp_image_{}.jpg'

last_tiktok_search_results: Dict[str, List[Dict[str, Any]]] = {}
last_tiktok_search_timestamp: Dict[str, float] = {}

def fetch_json(url) -> Dict[str, Any]:
    try:
        response = requests.get(url)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"Lỗi khi gọi API ({url}): {str(e)}")
        raise Exception(f"Lỗi khi gọi API ({url}): {str(e)}")
    except ValueError as e:
        logger.error("Không thể giải mã JSON từ API.")
        raise Exception("Không thể giải mã JSON từ API.")

def get_pinterest_images(keyword, count: int = 10) -> List[str]:
    """Lấy danh sách URL của ảnh từ API Pinterest."""
    encoded_keyword = urllib.parse.quote(keyword)
    pinterest_url = f'https://api.sumiproject.net/pinterest?search={encoded_keyword}'
    try:
        response = requests.get(pinterest_url)
        response.raise_for_status()
        data = response.json()
        images = data.get('data', [])
        if not images:
            logger.error("Không tìm thấy ảnh nào từ Pinterest.")
            return []
        if len(images) <= count:
            selected_images = images
        else:
            selected_images = random.sample(images, count)
        
        image_urls = []
        for chosen in selected_images:
            if isinstance(chosen, dict):
                url = chosen.get('url', '')
            elif isinstance(chosen, str):
                url = chosen
            else:
                url = ''
            if url:
                image_urls.append(url)
        return image_urls
    except requests.exceptions.RequestException as e:
        logger.error(f"Lỗi khi gọi API Pinterest: {str(e)}")
        return []
    except ValueError:
        logger.error("Không thể giải mã JSON từ API Pinterest.")
        return []

def download_image(url, save_path) -> bool:
    """Tải ảnh từ URL và lưu vào tệp cục bộ."""
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()
        with open(save_path, 'wb') as file:
            for chunk in response.iter_content(1024):
                file.write(chunk)
        logger.info(f"Ảnh đã được tải xuống: {save_path}")
        return True
    except requests.exceptions.RequestException as e:
        logger.error(f"Lỗi khi tải ảnh từ URL: {str(e)}")
        return False

def send_search_list(keyword, message_object, thread_id,
                     thread_type, client, author_id):
    logger.info(f"Đang lấy 10 ảnh từ Pinterest cho từ khóa: {keyword}")
    
    
    image_urls = get_pinterest_images(keyword, count=10)
    if not image_urls:
        client.replyMessage(
            Message(text="Không tìm thấy ảnh nào trên Pinterest."),
            message_object,
            thread_id,
            thread_type,
            ttl=60000
        )
        return
    image_paths = []
    for i, url in enumerate(image_urls):
        save_path = IMAGE_SAVE_PATH.format(i)
        if download_image(url, save_path):
            image_paths.append(save_path)
    
    if not image_paths:
        client.replyMessage(
            Message(text="Lỗi khi tải ảnh từ Pinterest."),
            message_object,
            thread_id,
            thread_type,
            ttl=60000
        )
        return
    
    try:
        client.sendMultiLocalImage(
            imagePathList=image_paths,
            thread_id=thread_id,
            thread_type=thread_type,
            width=2560,
            height=2560,
            message=Message(text=f"➜{get_user_name_by_id(client, author_id)}"),
        )
        logger.info("Đã gửi tất cả ảnh thành công.")
    except Exception as e:
        logger.error(f"Lỗi khi gửi ảnh: {str(e)}")
        client.replyMessage(
            Message(text="Lỗi khi gửi ảnh."),
            message_object,
            thread_id,
            thread_type,
            ttl=60000
        )
    for image_path in image_paths:
        if os.path.exists(image_path):
            os.remove(image_path)
            logger.info(f"Đã xóa ảnh tạm: {image_path}")

def handle_pin_on(bot, thread_id):
    settings = read_settings()
    if "pin" not in settings:
        settings["pin"] = {}
    settings["pin"][thread_id] = True
    write_settings(settings)
    return f"🚦Lệnh {prefix}pin đã được Bật 🚀 trong nhóm này ✅"

def handle_pin_off(bot, thread_id):
    settings = read_settings()
    if "pin" in settings and thread_id in settings["pin"]:
        settings["pin"][thread_id] = False
        write_settings(settings)
        return f"🚦Lệnh {prefix}pin đã Tắt ⭕️ trong nhóm này ✅"
    return "🚦Nhóm chưa có thông tin cấu hình pin để ⭕️ Tắt 🤗"

def handle_pro_pin(message, message_object, thread_id,
            thread_type, author_id, client):
    settings = read_settings()
    
    user_message = message.replace(f"{prefix}pin ", "").strip().lower()
    if user_message == "on":
        if not is_admin(author_id):  
            response = "❌Bạn không phải admin bot!"
        else:
            response = handle_pin_on(client, thread_id)
        client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
        return
    elif user_message == "off":
        if not is_admin(author_id):  
            response = "❌Bạn không phải admin bot!"
        else:
            response = handle_pin_off(client, thread_id)
        client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
        return

    if not (settings.get("pin", {}).get(thread_id, False)):
        return
    content = message.strip().split()
    if len(content) < 2:
        client.replyMessage(
            Message(text="Vui lòng nhập từ khóa để tìm kiếm."),
            message_object,
            thread_id,
            thread_type,
            ttl=60000
        )
        return

    current_time = time.time()
    
    if (thread_id in last_tiktok_search_results and
        thread_id in last_tiktok_search_timestamp and
        current_time - last_tiktok_search_timestamp[thread_id] <= SEARCH_TIMEOUT):
        remaining = int(SEARCH_TIMEOUT - (current_time - last_tiktok_search_timestamp[thread_id]))
        client.replyMessage(
            Message(text=f"Vui lòng chờ {remaining} giây trước khi tìm kiếm mới."),
            message_object,
            thread_id,
            thread_type,
            ttl=60000
        )
        return
    
    keyword = " ".join(content[1:]).strip()
    logger.info(f"Từ khóa tìm kiếm: {keyword}")

    send_search_list(keyword, message_object, thread_id, thread_type, client, author_id)

    last_tiktok_search_results[thread_id] = [{"keyword": keyword}]
    last_tiktok_search_timestamp[thread_id] = current_time