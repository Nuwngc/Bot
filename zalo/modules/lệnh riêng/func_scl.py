import io
import os
import random
import re
import subprocess
import tempfile
import time
from fake_useragent import UserAgent
import requests
from modules.func_bot_info import is_admin, read_settings, write_settings
from zlapi import ZaloAPI, Message
from zlapi.models import ThreadType
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw
from config import *

def handle_scl_on(bot, thread_id):
    settings = read_settings()
    if "scl" not in settings:
        settings["scl"] = {}
    settings["scl"][thread_id] = True
    write_settings(settings)
    return f"🚦Lệnh {prefix}scl đã được Bật 🚀 trong nhóm này ✅"

def handle_scl_off(bot, thread_id):
    settings = read_settings()
    if "scl" in settings and thread_id in settings["scl"]:
        settings["scl"][thread_id] = False
        write_settings(settings)
        return f"🚦Lệnh {prefix}scl đã Tắt ⭕️ trong nhóm này ✅"
    return "🚦Nhóm chưa có thông tin cấu hình scl để ⭕️ Tắt 🤗"

def get_client_id():
    client_id_file = 'client_id.txt'
    if os.path.exists(client_id_file):
        with open(client_id_file, 'r') as file:
            client_id = file.read().strip()
            if client_id:
                return client_id
    try:
        res = requests.get('https://soundcloud.com/', headers=get_headers())
        res.raise_for_status()
        soup = BeautifulSoup(res.text, 'html.parser')
        script_tags = soup.find_all('script', {'crossorigin': True})
        urls = [tag.get('src') for tag in script_tags if tag.get('src') and tag.get('src').startswith('https')]
        if not urls:
            raise Exception('Không tìm thấy URL script')
        
        res = requests.get(urls[-1], headers=get_headers())
        res.raise_for_status()
        client_id = res.text.split(',client_id:"')[1].split('"')[0]

        with open(client_id_file, 'w') as file:
            file.write(client_id)

        return client_id
    except Exception as e:
        print(f"Không thể lấy client ID: {e}")
        return None

def wait_for_client_id():
    max_attempts = 5
    attempt = 0
    while attempt < max_attempts:
        client_id = get_client_id()
        if client_id:
            return client_id
        print("Đang chờ client ID...")
        time.sleep(2)
        attempt += 1
    return None

def get_headers():
    user_agent = UserAgent()
    return {
        "User-Agent": user_agent.random,
        "Accept-Language": random.choice([
            "en-US,en;q=0.9",
            "fr-FR,fr;q=0.9",
            "es-ES,es;q=0.9",
            "de-DE,de;q=0.9",
            "zh-CN,zh;q=0.9"
        ]),
        "Referer": "https://soundcloud.com/",
        "Upgrade-Insecure-Requests": "1"
    }

def search_song(query):
    try:
        link_url = 'https://soundcloud.com'
        headers = get_headers()
        search_url = f'https://m.soundcloud.com/search?q={requests.utils.quote(query)}'
        response = requests.get(search_url, headers=headers, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        url_pattern = re.compile(r'^/[^/]+/[^/]+$')
        
        for element in soup.select('div > ul > li > div'):
            a_tag = element.select_one('a')
            if a_tag and a_tag.get('href'):
                relative_url = a_tag['href']
                if url_pattern.match(relative_url):
                    title = a_tag.get('aria-label', 'Unknown Title')
                    url = link_url + relative_url
                    img_tag = element.select_one('img')
                    cover_url = img_tag.get('src') if img_tag and img_tag.get('src') else None
                    return url, title, cover_url
        return None, None, None
    except Exception as e:
        print(f"Lỗi khi tìm kiếm bài hát: {e}")
        return None, None, None

def download(link):
    try:
        client_id = wait_for_client_id()
        if not client_id:
            return None
        headers = get_headers()
        api_url = f'https://api-v2.soundcloud.com/resolve?url={link}&client_id={client_id}'
        response = requests.get(api_url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        progressive_url = next((t['url'] for t in data.get('media', {}).get('transcodings', []) 
                              if t['format']['protocol'] == 'progressive'), None)
        if not progressive_url:
            raise Exception('Không tìm thấy URL âm thanh')
        response = requests.get(f'{progressive_url}?client_id={client_id}&track_authorization={data.get("track_authorization")}', 
                              headers=headers, timeout=10)
        response.raise_for_status()
        return response.json().get('url')
    except Exception as e:
        print(f"Lỗi khi tải âm thanh: {e}")
        return None

def save_file_to_cache(url, filename):
    try:
        response = requests.get(url, headers=get_headers(), timeout=10)
        response.raise_for_status()
        cache_dir = os.path.join(os.path.dirname(__file__), 'cache')
        os.makedirs(cache_dir, exist_ok=True)
        file_path = os.path.join(cache_dir, filename)
        with open(file_path, 'wb') as file:
            file.write(response.content)
        print(f"Tải file thành công! Đã lưu tại {file_path}")
        return file_path
    except Exception as e:
        print(f"Lỗi khi tải file: {e}")
        return None

def upload_to_uguu(file_path):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
    }
    try:
        with open(file_path, 'rb') as file:
            files = {'files[]': file}
            print(f"Đang upload file lên Uguu: {file_path}")
            response = requests.post("https://uguu.se/upload", files=files, headers=headers, timeout=20)
            response.raise_for_status()
            result = response.json()
            if result.get("success"):
                uploaded_url = result["files"][0]["url"]
                print(f"Upload thành công: {uploaded_url}")
                return uploaded_url
            return None
    except Exception as e:
        print(f"Lỗi khi upload lên Uguu: {e}")
        return None

def convert_mp3_to_aac(mp3_file):
    try:
        ffmpeg_path = r"C:\Users\Administrator\Downloads\ffmpeg-master-latest-win64-gpl-shared\bin\ffmpeg.exe"
        if not os.path.exists(ffmpeg_path):
            print("FFmpeg không được tìm thấy")
            return None
        if not os.path.exists(mp3_file):
            print(f"File không tìm thấy: {mp3_file}")
            return None
            
        aac_file = mp3_file.replace('.mp3', '.aac')
        command = [ffmpeg_path, '-i', mp3_file, '-c:a', 'aac', '-b:a', '128k', '-y', aac_file]
        subprocess.run(command, check=True, capture_output=True, text=True)
        
        if os.path.exists(aac_file):
            print(f"Đã chuyển đổi thành công: {aac_file}")
            return aac_file
        return None
    except Exception as e:
        print(f"Lỗi khi chuyển đổi MP3 sang AAC: {e}")
        return None

def delete_file(file_path):
    """Xóa tệp sau khi sử dụng."""
    try:
        if os.path.exists(file_path):
            with open(file_path, 'rb') as f:
                return
            os.remove(file_path)
            print(f"Đã xóa tệp: {file_path}")
    except PermissionError as e:
        print(f"Lỗi khi xóa tệp (tệp đang bị khóa): {e}")
    except Exception as e:
        print(f"Lỗi khi xóa tệp: {e}")

def send_voice_from_video(aac_file, download_path, thread_id, thread_type, client):
    """Gửi file âm thanh từ file AAC cục bộ."""
    try:
        if not os.path.exists(aac_file):
            send_error_message(thread_id, thread_type, client, "File âm thanh không tồn tại")
            return

        uploaded_url = upload_to_uguu(aac_file)
        if not uploaded_url:
            send_error_message(thread_id, thread_type, client, "Không thể upload file âm thanh lên Uguu")
            return

        if hasattr(client, 'sendRemoteVoice'):
            client.sendRemoteVoice(uploaded_url, thread_id, thread_type)
            print(f"Đã gửi voice: {uploaded_url}")
        else:
            print("Client không hỗ trợ gửi voice")

        delete_file(aac_file)

    except Exception as e:
        print(f"Lỗi khi gửi voice: {e}")
        send_error_message(thread_id, thread_type, client, "Không thể gửi voice")

def send_error_message(thread_id, thread_type, client, error_message="Lỗi không xác định"):
    """Gửi thông báo lỗi."""
    if hasattr(client, 'sendMessage'):
        client.sendMessage(Message(text=error_message), thread_id, thread_type)
    else:
        print(f"Không thể gửi lỗi: {error_message}")

def create_rotating_webp(image_url, num_frames=30, rotation_speed=10):
    """Tạo ảnh WebP xoay tròn."""
    try:
        response = requests.get(image_url, timeout=10)
        response.raise_for_status()
        image = Image.open(io.BytesIO(response.content)).convert('RGBA')
        
        frames = []
        for i in range(num_frames):
            rotated_image = image.rotate(rotation_speed * i)
            frame = create_rounded_corners(rotated_image, radius=200)
            frames.append(frame)

        with tempfile.NamedTemporaryFile(suffix='.webp', delete=False) as temp_file:
            frames[0].save(temp_file.name, format="WEBP", save_all=True, 
                         append_images=frames[1:], duration=100, loop=0)
            webp_url = upload_to_uguu(temp_file.name)
            delete_file(temp_file.name)
            return webp_url
    except Exception as e:
        print(f"Lỗi khi tạo WebP: {e}")
        return None

def create_rounded_corners(image, radius):
    """Tạo ảnh với góc tròn."""
    width, height = image.size
    mask = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, width, height), radius=radius, fill=255)
    rounded_image = image.copy()
    rounded_image.putalpha(mask)
    return rounded_image

def is_valid_image_url(url):
    """Kiểm tra URL ảnh hợp lệ."""
    if not url:
        return False
    valid_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    return any(url.lower().endswith(ext) for ext in valid_extensions)

def handle_nhac_command(message, message_object, thread_id, thread_type, author_id, client):
    settings = read_settings()
    user_message = message.replace(f"{prefix}scl ", "").strip().lower()
    if user_message == "on":
        if not is_admin(author_id):  
            response = "❌Bạn không phải admin bot!"
        else:
            response = handle_scl_on(client, thread_id)
        client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
        return
    elif user_message == "off":
        if not is_admin(author_id):  
            response = "❌Bạn không phải admin bot!"
        else:
            response = handle_scl_off(client, thread_id)
        client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
        return

    if not (settings.get("scl", {}).get(thread_id, False)):
        return
    content = message.strip().split()
    if len(content) < 2:
        error_msg = Message(text=f"{prefix}scl [tên bài hát]\n💞 Ví dụ: @scl Đừng hỏi em ổn không... ✅")
        client.replyMessage(error_msg, message_object, thread_id, thread_type)
        return

    tenbaihat = ' '.join(content[1:])
    link, title, cover = search_song(tenbaihat)

    if not link:
        error_msg = Message(text="Không tìm thấy bài hát!")
        client.replyMessage(error_msg, message_object, thread_id, thread_type)
        return

    messagesend = Message(text=f"Tên bài hát: {title}\n🔗 Link: {link}\n⏳ Đang xử lý âm thanh...")

    if cover and is_valid_image_url(cover):
        try:
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as temp_cover:
                response = requests.get(cover, timeout=10)
                response.raise_for_status()
                temp_cover.write(response.content)
                temp_cover.close()
                
                client.sendLocalImage(temp_cover.name, thread_id, thread_type, 
                                   message=messagesend, width=240, height=240)
                client.sendReaction(message_object, "👌", thread_id, thread_type)
                delete_file(temp_cover.name)
        except Exception as e:
            print(f"Lỗi khi gửi ảnh bìa: {e}")
            client.replyMessage(messagesend, message_object, thread_id, thread_type)
    else:
        client.replyMessage(messagesend, message_object, thread_id, thread_type)

    audio_url = download(link)
    if not audio_url:
        send_error_message(thread_id, thread_type, client, "Không thể tải file âm thanh")
        return

    audio_file = save_file_to_cache(audio_url, 'downloaded_file.mp3')
    if audio_file:
        aac_file = convert_mp3_to_aac(audio_file)
        if aac_file:
            if cover and is_valid_image_url(cover):
                webp_cover = create_rotating_webp(cover)
                if webp_cover:
                    client.sendCustomSticker(staticImgUrl=cover, animationImgUrl=webp_cover, 
                                          thread_id=thread_id, thread_type=thread_type)
            
            download_path = "downloaded_audio.mp4"
            send_voice_from_video(aac_file, download_path, thread_id, thread_type, client)
            
            delete_file(aac_file)
        delete_file(audio_file)
    else:
        send_error_message(thread_id, thread_type, client, "Không thể lưu file âm thanh")