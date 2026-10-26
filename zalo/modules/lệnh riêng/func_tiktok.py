import logging
import random
import time
from typing import Any, Dict, List
import urllib
import requests
from zlapi.models import *


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEFAULT_THUMBNAIL = 'https://f54-zpg-r.zdn.vn/jpg/1593082208972721683/63c52b8ec1697b372278.jpg'
DEFAULT_DURATION = '36000'
DEFAULT_SIZE_MB = 0.0
SEARCH_TIMEOUT = 120

last_tiktok_search_results: Dict[str, List[Dict[str, Any]]] = {}
last_tiktok_search_timestamp: Dict[str, float] = {}

def fetch_json(url: str) -> Dict[str, Any]:
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

def get_search_results(keyword: str) -> List[Dict[str, Any]]:
    encoded_keyword = urllib.parse.quote(keyword)
    search_url = f'https://api.sumiproject.net/tiktok?search={encoded_keyword}'
    search_data = fetch_json(search_url)
    videos = search_data.get('data', {}).get('videos', [])
    if not isinstance(videos, list):
        logger.error("Dữ liệu video không hợp lệ.")
        return []
    return videos

def get_download_data(video_url: str) -> Dict[str, Any]:
    download_url = f'https://api.sumiproject.net/tiktok?video={video_url}'
    download_json = fetch_json(download_url)
    data = download_json.get('data', {})
    if not data:
        logger.error("Không có dữ liệu tải video.")
    return data

def send_search_list(videos: List[Dict[str, Any]], keyword: str, message_object: Any,
                     thread_id: str, thread_type: str, remaining: int, self: Any) -> None:
    lines = [f"Video TikTok cho từ khóa '{keyword}' (còn {remaining} giây):"]
    for idx, video in enumerate(videos, start=1):
        title = video.get('title', 'Không có tiêu đề')
        author_unique = video.get('author', {}).get('unique_id', 'N/A')
        lines.append(f"{idx}. {title} - @{author_unique}")
    lines.append("Gửi lệnh: tt <số> để chọn video.")
    self.replyMessage(Message(text="\n".join(lines)),
                        message_object, thread_id, thread_type, ttl=60000)

def handle_tiktok_command(message, message_object, thread_id, thread_type, author_id, self):
    content = message.strip().split()
    if len(content) < 2:
        self.replyMessage(Message(text="Vui lòng nhập từ khóa hoặc số lựa chọn."),
                          message_object, thread_id, thread_type, ttl=60000)
        return

    is_quick = False
    if content[-1] == 'speed':
        is_quick = True
        content = content[:-1]

    current_time = time.time()
    if content[1].isdigit():
        if thread_id not in last_tiktok_search_results or thread_id not in last_tiktok_search_timestamp:
            self.replyMessage(Message(text="Chưa có kết quả tìm kiếm. Hãy dùng lệnh: tt <từ khóa>."),
                              message_object, thread_id, thread_type, ttl=60000)
            return
        if current_time - last_tiktok_search_timestamp[thread_id] > SEARCH_TIMEOUT:
            self.replyMessage(Message(text="Kết quả tìm kiếm đã hết hạn. Hãy tìm kiếm lại."),
                              message_object, thread_id, thread_type, ttl=60000)
            last_tiktok_search_results.pop(thread_id, None)
            last_tiktok_search_timestamp.pop(thread_id, None)
            return
        index = int(content[1])
        videos = last_tiktok_search_results[thread_id]
        if index < 1 or index > len(videos):
            self.replyMessage(Message(text="Số video không hợp lệ."),
                              message_object, thread_id, thread_type, ttl=60000)
            return
        selected_video = videos[index - 1]
    else:
        if (thread_id in last_tiktok_search_results and
            thread_id in last_tiktok_search_timestamp and
            current_time - last_tiktok_search_timestamp[thread_id] <= SEARCH_TIMEOUT):
            remaining = int(SEARCH_TIMEOUT - (current_time - last_tiktok_search_timestamp[thread_id]))
            self.replyMessage(Message(text=f"Vui lòng chọn video từ kết quả hiện có (còn {remaining} giây)."),
                              message_object, thread_id, thread_type, ttl=60000)
            return
        keyword = " ".join(content[1:]).strip()
        logger.info(f"Keyword tìm kiếm: {keyword}")
        videos = get_search_results(keyword)
        if not videos:
            self.replyMessage(Message(text="Không tìm thấy video TikTok nào."),
                              message_object, thread_id, thread_type, ttl=60000)
            return
        
        last_tiktok_search_results[thread_id] = videos
        last_tiktok_search_timestamp[thread_id] = current_time
        
        if is_quick:
            selected_video = random.choice(videos)
        else:
            send_search_list(videos, keyword, message_object, thread_id, thread_type, SEARCH_TIMEOUT, self)
            return
    author_unique = selected_video.get('author', {}).get('unique_id')
    video_id = selected_video.get('video_id')
    if not author_unique or not video_id:
        self.replyMessage(Message(text="Dữ liệu video không đầy đủ."),
                          message_object, thread_id, thread_type, ttl=60000)
        return

    video_page_url = f"https://www.tiktok.com/@{author_unique}/video/{video_id}"
    logger.info(f"Video page URL: {video_page_url}")

    try:
        download_data = get_download_data(video_page_url)
    except Exception as e:
        self.replyMessage(Message(text=f"Lỗi khi lấy dữ liệu tải video: {str(e)}"),
                          message_object, thread_id, thread_type, ttl=60000)
        return

    video_download_url = download_data.get('play')
    if not video_download_url:
        self.replyMessage(Message(text="Không lấy được link tải video."),
                          message_object, thread_id, thread_type, ttl=60000)
        return

    title = download_data.get('title', 'Không có tiêu đề')
    region = download_data.get('region', 'N/A')
    size_kb = download_data.get('size', 0)
    try:
        size_mb = round(float(size_kb) / 1024, 2) if size_kb else DEFAULT_SIZE_MB
    except (ValueError, TypeError):
        size_mb = DEFAULT_SIZE_MB
    processed_time = download_data.get('processed_time', 'N/A')
    thumbnail_url = download_data.get('thumbnail', DEFAULT_THUMBNAIL)
    duration = download_data.get('duration', DEFAULT_DURATION)

    user_info = self.fetchUserInfo(author_id)
    user_name = user_info.changed_profiles.get(author_id, {}).get('zaloName', 'Người dùng')

    video_info = (
        f"[ {user_name} ]\n\n"
        f"Title: {title}\n"
        f"Author: @{author_unique}\n"
        f"Region: {region}\n"
        f"Size: {size_mb} MB\n"
        f"Processed Time: {processed_time}"
    )

    messagesend = Message(text=video_info)
    self.sendRemoteVideo(
        video_download_url,
        thumbnail_url,
        duration=duration,
        message=messagesend,
        thread_id=thread_id,
        thread_type=thread_type,
        ttl=86400000,
        width=1200,
        height=1600
    )
    logger.info("Video đã được gửi thành công.")

    last_tiktok_search_results.pop(thread_id, None)
    last_tiktok_search_timestamp.pop(thread_id, None)