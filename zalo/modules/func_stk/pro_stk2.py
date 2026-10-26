import os
import requests
import json
import urllib.parse
from zlapi.models import Message

des = {
    'version': "1.0.0",
    'credits': "Quốc Khánh",
    'description': "Tạo sticker khi reply vào một ảnh hoặc video GIF",
    'power': "Thành viên"
}

def handle_stk_command(message, message_object, thread_id, thread_type, author_id, client):
    if message_object.quote:
        attach = message_object.quote.attach
        if attach:
            try:
                attach_data = json.loads(attach)
            except json.JSONDecodeError:
                client.sendMessage(
                    Message(text="Dữ liệu không hợp lệ."),
                    thread_id=thread_id,
                    thread_type=thread_type
                )
                return

            media_url = attach_data.get('hdUrl') or attach_data.get('href')
            if not media_url:
                client.sendMessage(
                    Message(text="Không tìm thấy URL."),
                    thread_id=thread_id,
                    thread_type=thread_type
                )
                return

            media_url = media_url.replace("\\/", "/")
            media_url = urllib.parse.unquote(media_url)

            if not is_valid_media_url(media_url):
                client.sendMessage(
                    Message(text="URL không phải là ảnh, GIF hoặc video hợp lệ."),
                    thread_id=thread_id,
                    thread_type=thread_type
                )
                return

            width, height = get_image_dimensions(media_url)
            static_webp_url = replace_extension_to_webp(media_url)
            animation_webp_url = replace_extension_to_webp(media_url)

            send_sticker(client, static_webp_url, animation_webp_url, width, height, thread_id, thread_type)

        else:
            client.sendMessage(
                Message(text="Không có tệp nào được reply."),
                thread_id=thread_id,
                thread_type=thread_type
            )
    else:
        client.sendMessage(
            Message(text="Hãy reply vào ảnh hoặc video cần tạo sticker."),
            thread_id=thread_id,
            thread_type=thread_type
        )

def is_valid_media_url(url):
    try:
        response = requests.head(url)
        response.raise_for_status()
        content_type = response.headers.get('Content-Type', '')
        if 'video/' in content_type or 'image/' in content_type:
            return True
        response = requests.get(url, stream=True, timeout=5)
        response.raise_for_status()
        if len(response.content) > 0:
            return True
    except requests.RequestException:
        pass
    return False

def replace_extension_to_webp(url):
    parts = url.split('.')
    if len(parts) > 1:
        parts[-1] = 'webp'
        return '.'.join(parts)
    return url + '.webp'

def get_image_dimensions(url):
    try:
        response = requests.get(url, stream=True, timeout=5)
        response.raise_for_status()
        from PIL import Image
        from io import BytesIO
        image = Image.open(BytesIO(response.content))
        return image.width, image.height
    except Exception:
        return 512, 512

def send_sticker(client, staticImgUrl, animationImgUrl, width, height, thread_id, thread_type):
    try:
        client.sendCustomSticker(
            staticImgUrl=staticImgUrl,
            animationImgUrl=animationImgUrl,
            width=width,
            height=height,
            thread_id=thread_id,
            thread_type=thread_type
        )
    except Exception as e:
        client.sendMessage(
            Message(text=f"Không thể gửi sticker: {str(e)}"),
            thread_id=thread_id,
            thread_type=thread_type
        )

def ft_vxkiue():
    return {
        'sticker': handle_sticker_command
    }
