import json
import re
from zlapi.models import *


def handle_getvoice_command(message, message_object, thread_id, thread_type, author_id, self):
    if message_object.quote:
        attach = message_object.quote.attach
        if attach:
            try:
                attach_data = json.loads(attach)
            except json.JSONDecodeError as e:
                print(f"Lỗi khi phân tích JSON: {str(e)}")
                return

            video_url = attach_data.get('hdUrl') or attach_data.get('href')
            if video_url:
                send_voice_from_video(video_url, thread_id, thread_type, self, message_object)
            else:
                send_error_message(thread_id, thread_type, self, "Không tìm thấy URL video.", message_object)
        else:
            send_error_message(thread_id, thread_type, self, "Vui lòng reply tin nhắn chứa video.", message_object)
    else:
        video_url = extract_video_url(message)
        if video_url:
            send_voice_from_video(video_url, thread_id, thread_type, self, message_object)
        else:
            send_error_message(thread_id, thread_type, self, "Vui lòng gửi link video hợp lệ.", message_object)

def extract_video_url(message):
    video_url_pattern = r"https?://[^\s]+(?:youtube\.com|vimeo\.com|dailymotion\.com|facebook\.com|tiktok\.com|vkontakte\.ru|vimeo\.com|twitch\.tv|soundcloud\.com|...)"  # Có thể mở rộng danh sách các tên miền video ở đây.
    
    match = re.search(video_url_pattern, message)
    if match:
        return match.group(0)
    return None

def send_voice_from_video(video_url, thread_id, thread_type, self, message_object):
    try:
        fake_file_size = 5 * 1024 * 1024
        self.sendRemoteVoice(video_url, thread_id, thread_type, fileSize=fake_file_size)
    except Exception as e:
        print(f"Lỗi khi gửi voice từ video: {str(e)}")
        send_error_message(thread_id, thread_type, self, "Không thể gửi voice từ video này.", message_object)

def send_error_message(thread_id, thread_type, self, error_message="Lỗi không xác định.", message_object=None):
    if hasattr(self, 'send'):
        if message_object:
            self.send(Message(text=error_message), thread_id=thread_id, thread_type=thread_type, reply_to=message_object)
        else:
            self.send(Message(text=error_message), thread_id=thread_id, thread_type=thread_type)
    else:
        print("Client không hỗ trợ gửi tin nhắn.")