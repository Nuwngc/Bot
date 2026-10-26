from modules.func_bot_info import is_admin
from zlapi.models import Message
import os
import json
import requests

def handle_change_avatar_command(message, message_object, thread_id, thread_type, author_id, client):
    if not is_admin(author_id):
        msg = "• Bạn không có quyền sử dụng lệnh này."
        client.replyMessage(Message(text=msg), message_object, thread_id, thread_type, ttl=60000)
        return
    try:
        if not getattr(message_object, 'quote', None):
            send_error_message("• Vui lòng reply ảnh cần đổi avatar.", thread_id, thread_type, client)
            return

        attach = getattr(message_object.quote, 'attach', None)
        if not attach:
            send_error_message("• Cái này không phải ảnh.", thread_id, thread_type, client)
            return
            
        try:
            attach_data = json.loads(attach)
        except json.JSONDecodeError:
            send_error_message("• Lỗi khi phân tích dữ liệu đính kèm.", thread_id, thread_type, client)
            return

        media_url = attach_data.get('hdUrl') or attach_data.get('href')
        if not media_url:
            send_error_message("• Không tìm thấy liên kết ảnh trong file đính kèm.", thread_id, thread_type, client)
            return
        image_path = "modules/cache/group_avatar.jpeg"
        download_image(media_url, image_path)
        if os.path.exists(image_path):
            client.changeAccountAvatar(image_path)
            send_success_message("• Thành công.", thread_id, thread_type, client)
            os.remove(image_path)
        else:
            send_error_message("Lỗi khi tải ảnh về.", thread_id, thread_type, client)
    except Exception as e:
        print(f"Lỗi khi xử lý lệnh đổi avatar nhóm: {str(e)}")
        send_error_message("Đã xảy ra lỗi khi đổi avatar nhóm.", thread_id, thread_type, client)

def download_image(url, save_path):
    try:
        response = requests.get(url, stream=True)
        if response.status_code == 200:
            with open(save_path, 'wb') as file:
                for chunk in response.iter_content(1024):
                    file.write(chunk)
        else:
            print(f"Lỗi khi tải ảnh: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Lỗi khi tải ảnh: {str(e)}")

def send_success_message(message, thread_id, thread_type, client):
    success_message = Message(text=message)
    try:
        client.send(success_message, thread_id, thread_type)
    except Exception as e:
        print(f"Lỗi khi gửi tin nhắn thành công: {str(e)}")

def send_error_message(message, thread_id, thread_type, client):
    error_message = Message(text=message)
    try:
        client.send(error_message, thread_id, thread_type)
    except Exception as e:
        print(f"Lỗi khi gửi tin nhắn lỗi: {str(e)}")