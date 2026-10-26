import subprocess
from core.bot_sys import is_admin
from zlapi.models import *
import requests
from bs4 import BeautifulSoup
import os
import re
import time
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter
from io import BytesIO
import emoji
import random
import glob
from datetime import datetime, timezone, timedelta
import colorsys
import requests
import io
import tempfile
import os
from colorsys import hsv_to_rgb, rgb_to_hsv

user_states = {}
client_id_cache = None
SEARCH_TIMEOUT = 120

BACKGROUND_PATH = "background/"
CACHE_PATH = "modules/cache/"
OUTPUT_IMAGE_PATH = os.path.join(CACHE_PATH, "scl.png")

os.makedirs(CACHE_PATH, exist_ok=True)

def get_dominant_color(image_path):
    try:
        if not os.path.exists(image_path):
            print(f"File ảnh không tồn tại: {image_path}")
            return (0, 0, 0)

        img = Image.open(image_path).convert("RGB")
        img = img.resize((150, 150), Image.Resampling.LANCZOS)
        pixels = img.getdata()

        if not pixels:
            print(f"Không thể lấy dữ liệu pixel từ ảnh: {image_path}")
            return (0, 0, 0)

        r, g, b = 0, 0, 0
        for pixel in pixels:
            r += pixel[0]
            g += pixel[1]
            b += pixel[2]
        total = len(pixels)
        if total == 0:
            return (0, 0, 0)
        r, g, b = r // total, g // total, b // total
        return (r, g, b)

    except Exception as e:
        print(f"Lỗi khi phân tích màu nổi bật: {e}")
        return (0, 0, 0)

def get_contrasting_color(base_color, alpha=255):
    r, g, b = base_color[:3]
    luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return (255, 255, 255, alpha) if luminance < 0.5 else (0, 0, 0, alpha)

def random_contrast_color(base_color):
    r, g, b, _ = base_color
    box_luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    
    if box_luminance > 0.5:
        r = random.randint(0, 50)
        g = random.randint(0, 50)
        b = random.randint(0, 50)
    else:
        r = random.randint(200, 255)
        g = random.randint(200, 255)
        b = random.randint(200, 255)
    
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    s = min(1.0, s + 0.9)
    v = min(1.0, v + 0.7)
    
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    
    text_luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    if abs(text_luminance - box_luminance) < 0.3:
        if box_luminance > 0.5:
            r, g, b = colorsys.hsv_to_rgb(h, s, min(1.0, v * 0.4))
        else:
            r, g, b = colorsys.hsv_to_rgb(h, s, min(1.0, v * 1.7))
    
    return (int(r * 255), int(g * 255), int(b * 255), 255)

def download_avatar(avatar_url, save_path=os.path.join(CACHE_PATH, "user_avatar.png")):
    try:
        resp = requests.get(avatar_url, stream=True, timeout=5) 
        if resp.status_code == 200:
            with open(save_path, "wb") as f:
                for chunk in resp.iter_content(1024):
                    f.write(chunk)
            return save_path
    except Exception as e:
        print(f"❌ Lỗi tải avatar: {e}")
    return None

def generate_menu_image(self, author_id, thread_id, thread_type):
    images = glob.glob(BACKGROUND_PATH + "*.jpg") + glob.glob(BACKGROUND_PATH + "*.png") + glob.glob(BACKGROUND_PATH + "*.jpeg")
    if not images:
        print("❌ Không tìm thấy ảnh trong thư mục background/")
        return None  

    image_path = random.choice(images)

    try:
        size = (1920, 600)
        final_size = (1280, 380)
        bg_image = Image.open(image_path).convert("RGBA").resize(size, Image.Resampling.LANCZOS)
        bg_image = bg_image.filter(ImageFilter.GaussianBlur(radius=7))  
        overlay = Image.new("RGBA", size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        dominant_color = get_dominant_color(image_path)
        r, g, b = dominant_color
        luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

        box_colors = [
            (255, 20, 147, 90),
            (128, 0, 128, 90),
            (0, 100, 0, 90),
            (0, 0, 139, 90),
            (184, 134, 11, 90),
            (138, 3, 3, 90),
            (0, 0, 0, 90)
        ]

        box_color = random.choice(box_colors)

        box_x1, box_y1 = 90, 60
        box_x2, box_y2 = size[0] - 90, size[1] - 60
        draw.rounded_rectangle([(box_x1, box_y1), (box_x2, box_y2)], radius=75, fill=box_color)

        font_arial_path = "arial unicode ms.otf"
        font_arial_path_16 = "arial unicode ms.otf"  
        font_emoji_path = "emoji.ttf"
        
        try:
            font_text_large = ImageFont.truetype(font_arial_path_16, 76)  
            font_text_big = ImageFont.truetype(font_arial_path_16, 68)  
            font_text_small = ImageFont.truetype(font_arial_path, 64)  
            font_text_bot = ImageFont.truetype(font_arial_path, 58)  
            font_time = ImageFont.truetype(font_arial_path_16, 56)
            font_icon = ImageFont.truetype(font_emoji_path, 60)
            font_icon_large = ImageFont.truetype(font_emoji_path, 175)
            font_name = ImageFont.truetype(font_emoji_path, 60)
        except Exception as e:
            print(f"❌ Lỗi tải font: {e}")
            font_text_large = ImageFont.load_default()
            font_text_big = ImageFont.load_default()
            font_text = ImageFont.load_default()
            font_text_small = ImageFont.load_default()
            font_text_bot = ImageFont.load_default()
            font_time = ImageFont.load_default()
            font_icon = ImageFont.load_default()
            font_icon_large = ImageFont.load_default()
            font_name = ImageFont.load_default()

        def draw_text_with_shadow(draw, position, text, font, fill, shadow_color=(0, 0, 0, 250), shadow_offset=(2, 2)):
            x, y = position
            draw.text((x + shadow_offset[0], y + shadow_offset[1]), text, font=font, fill=shadow_color)
            draw.text((x, y), text, font=font, fill=fill)

        vietnam_now = datetime.now(timezone(timedelta(hours=7)))
        hour = vietnam_now.hour
        formatted_time = vietnam_now.strftime("%H:%M")
        time_suffix = "AM" if 1 <= hour <= 17 else "PM"
        time_icon = "🌤️" if 6 <= hour < 18 else "🌙"
        time_text = f" {formatted_time}"
        time_x = box_x2 - 250
        time_y = box_y1 + 10
        
        box_rgb = box_color[:3]
        box_luminance = (0.299 * box_rgb[0] + 0.587 * box_rgb[1] + 0.114 * box_rgb[2]) / 255
        last_lines_color = (255, 255, 255, 220) if box_luminance < 0.5 else (0, 0, 0, 220)

        time_color = last_lines_color

        if time_x >= 0 and time_y >= 0 and time_x < size[0] and time_y < size[1]:
            try:
                icon_x = time_x - 75
                icon_color = random_contrast_color(box_color)
                draw_text_with_shadow(draw, (icon_x, time_y - 8), time_icon, font_icon, icon_color, shadow_offset=(2, 2))
                draw.text((time_x, time_y), time_text, font=font_time, fill=time_color)
            except Exception as e:
                print(f"❌ Lỗi vẽ thời gian lên ảnh: {e}")
                draw_text_with_shadow(draw, (time_x - 75, time_y - 8), "⏰", font_icon, (255, 255, 255, 255), shadow_offset=(2, 2))
                draw.text((time_x, time_y), " ??;??", font=font_time, fill=time_color)

        user_info = self.fetchUserInfo(author_id) if author_id else None
        if user_info and hasattr(user_info, 'changed_profiles') and author_id in user_info.changed_profiles:
            user = user_info.changed_profiles[author_id]
            user_name = getattr(user, 'name', None) or getattr(user, 'displayName', None) or f"ID_{author_id}"
        else:
            user_name = f"ID_{author_id}"

        greeting_name = "Chủ Nhân" if str(author_id) == is_admin else user_name

        emoji_colors = {
            "🎵": random_contrast_color(box_color),
            "😁": random_contrast_color(box_color),
            "🖤": random_contrast_color(box_color),
            "💞": random_contrast_color(box_color),
            "🤖": random_contrast_color(box_color),
            "💻": random_contrast_color(box_color),
            "📅": random_contrast_color(box_color),
            "🎧": random_contrast_color(box_color),
            "🌙": random_contrast_color(box_color),
            "🌤️": (200, 150, 50, 255)
        }

        text_lines = [
            f"Hi, {greeting_name}",
            f"💞 Chào Bạn, tôi có thể giúp gì cho bạn ạ?",
            f"{self.prefix}scl on/off: 🚀 Bật/Tắt tính năng",
            "😁 Bot Sẵn Sàng Phục 🖤",
            f"🤖Bot: {self.me_name} 💻Version: {self.version} 📅Update {self.date_update}"
        ]

        color1 = random_contrast_color(box_color)
        color2 = random_contrast_color(box_color)
        while color1 == color2:
            color2 = random_contrast_color(box_color)
        text_colors = [
            color1,
            color2,
            last_lines_color,
            last_lines_color,
            last_lines_color
        ]

        text_fonts = [
            font_text_large,
            font_text_big,
            font_text_bot,
            font_text_bot,
            font_text_small
        ]

        line_spacing = 85
        start_y = box_y1 + 10

        avatar_url = user_info.changed_profiles[author_id].avatar if user_info and author_id in user_info.changed_profiles else None
        avatar_path = download_avatar(avatar_url)
        if avatar_path and os.path.exists(avatar_path):
            avatar_size = 200
            avatar_img = Image.open(avatar_path).convert("RGBA").resize((avatar_size, avatar_size), Image.Resampling.LANCZOS)
            mask = Image.new("L", (avatar_size, avatar_size), 0)
            ImageDraw.Draw(mask).ellipse((0, 0, avatar_size, avatar_size), fill=255)
            border_size = avatar_size + 10
            rainbow_border = Image.new("RGBA", (border_size, border_size), (0, 0, 0, 0))
            draw_border = ImageDraw.Draw(rainbow_border)
            steps = 360
            for i in range(steps):
                h = i / steps
                r, g, b = colorsys.hsv_to_rgb(h, 1.0, 1.0)
                draw_border.arc([(0, 0), (border_size-1, border_size-1)], i, i + (360 / steps), fill=(int(r * 255), int(g * 255), int(b * 255), 255), width=5)
            avatar_y = (box_y1 + box_y2 - avatar_size) // 2
            overlay.paste(rainbow_border, (box_x1 + 40, avatar_y), rainbow_border)
            overlay.paste(avatar_img, (box_x1 + 45, avatar_y + 5), mask)
        else:
            draw.text((box_x1 + 60, (box_y1 + box_y2) // 2 - 140), "🐳", font=font_icon, fill=(0, 139, 139, 255))

        current_line_idx = 0
        for i, line in enumerate(text_lines):
            if not line:
                current_line_idx += 1
                continue

            parts = []
            current_part = ""
            for char in line:
                if ord(char) > 0xFFFF:
                    if current_part:
                        parts.append(current_part)
                        current_part = ""
                    parts.append(char)
                else:
                    current_part += char
            if current_part:
                parts.append(current_part)

            total_width = 0
            part_widths = []
            current_font = font_text_bot if i == 4 else text_fonts[i]
            for part in parts:
                width = draw.textbbox((0, 0), part, font=font_icon if any(ord(c) > 0xFFFF for c in part) else current_font)[2]
                part_widths.append(width)
                total_width += width

            max_width = box_x2 - box_x1 - 300
            if total_width > max_width:
                font_size = int(current_font.size * max_width / total_width * 0.9)
                if font_size < 60:
                    font_size = 60
                current_font = ImageFont.truetype(font_arial_path_16 if i < 2 else font_arial_path, font_size) if os.path.exists(font_arial_path) else ImageFont.load_default()
                total_width = 0
                part_widths = []
                for part in parts:
                    width = draw.textbbox((0, 0), part, font=font_icon if any(ord(c) > 0xFFFF for c in part) else current_font)[2]
                    part_widths.append(width)
                    total_width += width

            text_x = (box_x1 + box_x2 - total_width) // 2
            text_y = start_y + current_line_idx * line_spacing + (current_font.size // 2)  

            current_x = text_x
            for part, width in zip(parts, part_widths):
                if any(ord(c) > 0xFFFF for c in part):
                    emoji_color = emoji_colors.get(part, random_contrast_color(box_color))
                    draw_text_with_shadow(draw, (current_x, text_y), part, font_icon, emoji_color, shadow_offset=(2, 2))
                    if part == "🤖" and i == 4:
                        draw_text_with_shadow(draw, (current_x, text_y - 5), part, font_icon, emoji_color, shadow_offset=(2, 2))
                else:
                    if i < 2:
                        draw_text_with_shadow(draw, (current_x, text_y), part, current_font, text_colors[i], shadow_offset=(2, 2))
                    else:
                        draw.text((current_x, text_y), part, font=current_font, fill=text_colors[i])
                current_x += width
            current_line_idx += 1

        right_icons = ["🎧"]
        right_icon = random.choice(right_icons)
        icon_right_x = box_x2 - 225
        icon_right_y = (box_y1 + box_y2 - 180) // 2
        draw_text_with_shadow(draw, (icon_right_x, icon_right_y), right_icon, font_icon_large, emoji_colors.get(right_icon, (80, 80, 80, 255)), shadow_offset=(2, 2))

        if time_x >= 0 and time_y >= 0 and time_x < size[0] and time_y < size[1]:
            try:
                icon_x = time_x - 75
                icon_color = random_contrast_color(box_color)
                draw_text_with_shadow(draw, (icon_x, time_y - 8), time_icon, font_icon, icon_color, shadow_offset=(2, 2))
                draw.text((time_x, time_y), time_text, font=font_time, fill=time_color)
            except Exception as e:
                print(f"❌ Lỗi vẽ thời gian lên ảnh: {e}")
                draw_text_with_shadow(draw, (time_x - 75, time_y - 8), "⏰", font_icon, (255, 255, 255, 255), shadow_offset=(2, 2))
                draw.text((time_x, time_y), " ??;??", font=font_time, fill=time_color)

        final_image = Image.alpha_composite(bg_image, overlay)
        final_image = final_image.resize(final_size, Image.Resampling.LANCZOS)
        final_image.save(OUTPUT_IMAGE_PATH, "PNG", quality=95)
        print(f"✅ Ảnh menu đã được lưu: {OUTPUT_IMAGE_PATH}")
        return OUTPUT_IMAGE_PATH

    except Exception as e:
        print(f"❌ Lỗi xử lý ảnh menu: {e}")
        return None

def get_headers():
    return {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": 'https://soundcloud.com/',
        "Upgrade-Insecure-Requests": "1"
    }

def get_client_id():
    global client_id_cache
    if client_id_cache:
        return client_id_cache

    try:
        js_url = "https://a-v2.sndcdn.com/assets/0-99999999.js"
        res = requests.get("https://soundcloud.com", headers=get_headers())
        js_files = re.findall(r'https://a-v2\.sndcdn\.com/assets/[^"]+\.js', res.text)

        for js in js_files[::-1]:
            r = requests.get(js, headers=get_headers(), timeout=10)
            match = re.search(r'client_id\s*:\s*"([a-zA-Z0-9]+)"', r.text)
            if match:
                client_id_cache = match.group(1)
                return client_id_cache
    except Exception as e:
        print("❌ Lỗi lấy client_id:", e)

    return None

def get_song_metadata(link):
    try:
        client_id = wait_for_client_id()
        api_url = f'https://api-v2.soundcloud.com/resolve?url={link}&client_id={client_id}'
        response = requests.get(api_url, headers=get_headers())
        data = response.json()
        return {
            'play_count': data.get('playback_count', 0),
            'like_count': data.get('likes_count', 0),
            'comment_count': data.get('comment_count', 0)
        }
    except:
        return {'play_count': 0, 'like_count': 0, 'comment_count': 0}

def wait_for_client_id():
    client_id = get_client_id()
    while not client_id:
        time.sleep(2)
        client_id = get_client_id()
    return client_id

def get_username(link):
    try:
        client_id = wait_for_client_id()
        api_url = f'https://api-v2.soundcloud.com/resolve?url={link}&client_id={client_id}'
        response = requests.get(api_url, headers=get_headers())
        data = response.json()
        return data.get('user', {}).get('username', 'Unknown')
    except:
        return 'Unknown'

def search_songs(query):
    try:
        base_url = 'https://soundcloud.com'
        search_url = f'https://m.soundcloud.com/search?q={requests.utils.quote(query)}'
        response = requests.get(search_url, headers=get_headers())
        soup = BeautifulSoup(response.text, 'html.parser')
        songs = []
        url_pattern = re.compile(r'^/[^/]+/[^/]+$')
        for element in soup.select('li > div'):
            a_tag = element.select_one('a')
            if a_tag and a_tag.has_attr('href'):
                relative_url = a_tag['href']
                if url_pattern.match(relative_url):
                    title = a_tag.get('aria-label', '').strip()
                    link = base_url + relative_url
                    img_tag = element.select_one('img')
                    cover_url = img_tag['src'] if (img_tag and img_tag.has_attr('src')) else ""
                    metadata = get_song_metadata(link)
                    username = get_username(link)  
                    songs.append((
                        link,
                        title,
                        cover_url,
                        metadata['play_count'],
                        metadata['like_count'],
                        metadata['comment_count'],
                        username  
                    ))
            if len(songs) >= 10:
                break
        return songs
    except:
        return []

def get_music_stream_url(link):
    try:
        client_id = wait_for_client_id()
        api_url = f'https://api-v2.soundcloud.com/resolve?url={link}&client_id={client_id}'
        response = requests.get(api_url, headers=get_headers())
        data = response.json()
        for transcode in data.get('media', {}).get('transcodings', []):
            if transcode['format']['protocol'] == 'progressive':
                stream_url = transcode['url']
                stream_response = requests.get(f"{stream_url}?client_id={client_id}", headers=get_headers())
                return stream_response.json().get('url')
        return None
    except:
        return None

def get_track_cover(link):
    try:
        client_id = wait_for_client_id()
        api_url = f'https://api-v2.soundcloud.com/resolve?url={link}&client_id={client_id}'
        response = requests.get(api_url, headers=get_headers())
        data = response.json()
        cover_url = data.get("artwork_url")
        if cover_url:
            return cover_url.replace('-large', '-t500x500')
        else:
            avatar = data.get("user", {}).get("avatar_url", "")
            return avatar.replace('-large', '-t500x500') if avatar else None
    except:
        return None

def save_file_to_cache(url, filename):
    try:
        if not filename:
            print("Error in save_file_to_cache: Empty filename provided")
            return None

        print(f"Input filename: {filename}")

        safe_filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
        safe_filename = safe_filename.replace(' ', '_').strip('_')
        
        if not safe_filename:
            print("Error in save_file_to_cache: Safe filename is empty after processing")
            return None

        if 'cover' in safe_filename.lower():
            if not safe_filename.lower().endswith('.jpg'):
                safe_filename = safe_filename.rsplit('.', 1)[0] if '.' in safe_filename else safe_filename
                safe_filename += '.jpg'
        else:
            if not safe_filename.lower().endswith('.mp3'):
                safe_filename = safe_filename.rsplit('.', 1)[0] if '.' in safe_filename else safe_filename
                safe_filename += '.mp3'

        print(f"Safe filename: {safe_filename}")

        response = requests.get(url, headers=get_headers(), timeout=10)
        response.raise_for_status()

        cache_dir = os.path.join(os.path.dirname(__file__), 'cache')
        os.makedirs(cache_dir, exist_ok=True)

        file_path = os.path.join(cache_dir, safe_filename)
        with open(file_path, 'wb') as file:
            file.write(response.content)

        return file_path

    except requests.exceptions.HTTPError as http_err:
        print(f"HTTP error in save_file_to_cache: {http_err}")
        return None
    except requests.exceptions.RequestException as req_err:
        print(f"Network error in save_file_to_cache: {req_err}")
        return None
    except OSError as os_err:
        print(f"File system error in save_file_to_cache: {os_err}")
        return None
    except Exception as e:
        print(f"Unexpected error in save_file_to_cache: {e}")
        return None
        
def upload_to_uguu(file_path):
    try:
        with open(file_path, 'rb') as file:
            response = requests.post("https://uguu.se/upload", files={'files[]': file})
            return response.json().get('files')[0].get('url')
    except:
        return None

def delete_file(file_path):
    try:
        os.remove(file_path)
    except:
        pass

def draw_text_with_emojis(draw, position, text, font_text, font_emoji, fill=(255, 255, 255)):
    x, y = position
    for char in text:
        font = font_emoji if emoji.is_emoji(char) else font_text
        bbox = draw.textbbox((0, 0), char, font=font)
        w = bbox[2] - bbox[0]
        draw.text((x, y), char, font=font, fill=fill)
        x += w
    
def create_song_list_image(songs):
    try:
        scale = 2
        font_path = "arial unicode ms.otf"
        emoji_font_path = "emoji.ttf"
        font = ImageFont.truetype(font_path, 28 * scale)  
        artist_font = ImageFont.truetype(font_path, 20 * scale) 
        artist_emoji_font = ImageFont.truetype(emoji_font_path, 21 * scale)  
        emoji_font = ImageFont.truetype(emoji_font_path, 28 * scale) 
        number_font = ImageFont.truetype(font_path, 40 * scale)  
        info_font = ImageFont.truetype(font_path, 14 * scale) 
        info_emoji_font = ImageFont.truetype(emoji_font_path, 14 * scale)  

        card_height = 105 * scale  
        card_width = 583 * scale   
        thumb_size = 90 * scale    
        padding = 20 * scale      
        spacing_y = 10 * scale     
        card_padding = 8 * scale   

        img_width = card_width + 2 * padding
        img_height = padding * 2 + len(songs) * card_height + (len(songs) - 1) * spacing_y

        background_images = glob.glob(BACKGROUND_PATH + "*.jpg") + glob.glob(BACKGROUND_PATH + "*.png") + glob.glob(BACKGROUND_PATH + "*.jpeg")
        if not background_images:
            print("❌ đíu có ảnh trong mục background/")
            background = Image.new("RGBA", (img_width, img_height), (20, 20, 20, 255))
        else:
            background_path = random.choice(background_images)
            background = Image.open(background_path).convert("RGBA").resize((img_width, img_height), Image.Resampling.LANCZOS)
            background = background.filter(ImageFilter.GaussianBlur(radius=7)) 

        image = Image.new("RGBA", (img_width, img_height), (0, 0, 0, 0))
        image.paste(background, (0, 0))
        draw = ImageDraw.Draw(image)

        def random_contrast_color(base_color):
            r, g, b, _ = base_color
            box_luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
            
            if box_luminance > 0.5:
                r = random.randint(0, 50)
                g = random.randint(0, 50)
                b = random.randint(0, 50)
            else:
                r = random.randint(200, 255)
                g = random.randint(200, 255)
                b = random.randint(200, 255)
            
            h, s, v = rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
            s = min(1.0, s + 0.9)
            v = min(1.0, v + 0.9)
            
            r, g, b = hsv_to_rgb(h, s, v)
            return (int(r * 255), int(g * 255), int(b * 255), 255)

        def format_number(number):
            return f"{number:,}".replace(",", ".")  

        box_colors = [
            (255, 20, 147, 110),   
            (128, 0, 128, 110),    
            (0, 100, 0, 110),      
            (0, 0, 139, 110),      
            (184, 134, 11, 110),   
            (138, 3, 3, 110),      
            (0, 0, 0, 80)        
        ]
        box_color = random.choice(box_colors) 

        title_color = random_contrast_color(box_color)

        icon_colors = {
            "🎧": (0, 255, 0, 255),
            "🖤": (255, 0, 0, 255),
            "💬": (255, 215, 0, 255)
        }

        info_color = (255, 255, 255, 255)
        number_color = random_contrast_color(box_color)
        artist_color = (255, 255, 255, 255)  

        def get_text_width(text, font_used):
            bbox = draw.textbbox((0, 0), text, font=font_used)
            return bbox[2] - bbox[0]

        def truncate_text(text, max_width, font_text, font_emoji):
            result = ''
            total_width = 0
            for char in text:
                font_used = font_emoji if emoji.is_emoji(char) else font_text
                char_width = get_text_width(char, font_used)
                if total_width + char_width > max_width:
                    result += '...'
                    break
                result += char
                total_width += char_width
            return result

        def draw_text_with_shadow(draw, position, text, font, fill, shadow_color=(0, 0, 0, 150), shadow_offset=(2, 2)):
            x, y = position
            draw.text((x + shadow_offset[0], y + shadow_offset[1]), text, font=font, fill=shadow_color)
            draw.text((x, y), text, font=font, fill=fill)

        for i, song in enumerate(songs[:10]):
            link, title, cover_url, plays, likes, comments, username = song  

            left = padding
            top = padding + i * (card_height + spacing_y)

            card_img = Image.new("RGBA", (card_width, card_height), (0, 0, 0, 0))
            card_draw = ImageDraw.Draw(card_img)
            radius = 20 * scale
            card_draw.rounded_rectangle([0, 0, card_width, card_height], radius=radius, fill=box_color)
            image.paste(card_img, (left, top), card_img.split()[3])

            if cover_url:
                try:
                    response = requests.get(cover_url)
                    cover = Image.open(BytesIO(response.content)).convert("RGB")
                    cover = ImageOps.fit(cover, (thumb_size, thumb_size), centering=(0.5, 0.5))
                    mask = Image.new("L", (thumb_size, thumb_size), 0)
                    draw_mask = ImageDraw.Draw(mask)
                    draw_mask.ellipse((0, 0, thumb_size, thumb_size), fill=255)
                    cover.putalpha(mask)

                    border_size = thumb_size + 10
                    rainbow_border = Image.new("RGBA", (border_size, border_size), (0, 0, 0, 0))
                    draw_border = ImageDraw.Draw(rainbow_border)
                    steps = 360
                    for j in range(steps):
                        h = j / steps
                        r, g, b = hsv_to_rgb(h, 1.0, 1.0)
                        draw_border.arc([(0, 0), (border_size-1, border_size-1)], j, j + (360 / steps), fill=(int(r * 255), int(g * 255), int(b * 255), 255), width=5)
                    cover_y = top + (card_height - thumb_size) // 2
                    image.paste(rainbow_border, (left + card_padding - 5, cover_y - 5), rainbow_border)
                    image.paste(cover, (left + card_padding, cover_y), cover)
                except:
                    cover = Image.new("RGBA", (thumb_size, thumb_size), (60, 60, 60, 255))
                    image.paste(cover, (left + card_padding, top + card_padding), cover)
            else:
                cover = Image.new("RGBA", (thumb_size, thumb_size), (60, 60, 60, 255))
                image.paste(cover, (left + card_padding, top + card_padding), cover)

            x_text = left + card_padding + thumb_size + 20 * scale
            y_text = top + card_padding
            max_text_width = card_width - thumb_size - 3 * card_padding - 20 * scale
            truncated_title = truncate_text(title, max_text_width, font, emoji_font)

            for char in truncated_title:
                font_used = emoji_font if emoji.is_emoji(char) else font
                draw_text_with_shadow(draw, (x_text, y_text), char, font_used, title_color)
                x_text += get_text_width(char, font_used)

            x_artist = left + card_padding + thumb_size + 20 * scale
            y_artist = y_text + int(35 * scale)
            truncated_artist = truncate_text(username, max_text_width, artist_font, artist_emoji_font)
            for char in truncated_artist:
                font_used = artist_emoji_font if emoji.is_emoji(char) else artist_font
                draw_text_with_shadow(draw, (x_artist, y_artist), char, font_used, artist_color, shadow_offset=(1, 1))
                x_artist += get_text_width(char, font_used)

            info_text = f"🎧 {format_number(plays)}  🖤 {format_number(likes)}  💬 {format_number(comments)}"
            x_info = left + card_padding + thumb_size + 20 * scale
            info_height = info_font.size
            y_info = top + card_height - card_padding - info_height
            for char in info_text:
                font_used = info_emoji_font if emoji.is_emoji(char) else info_font
                fill_color = icon_colors.get(char, info_color) 
                draw_text_with_shadow(draw, (x_info, y_info), char, font_used, fill_color, shadow_offset=(1, 1))
                x_info += get_text_width(char, font_used)

            number_text = str(i + 1)
            number_width = get_text_width(number_text, number_font)
            number_x = left + card_width - number_width - card_padding
            number_y = top + (card_height - number_font.size) // 2
            draw_text_with_shadow(draw, (number_x, number_y), number_text, number_font, number_color)

        cache_dir = os.path.join(os.path.dirname(__file__), 'cache')
        os.makedirs(cache_dir, exist_ok=True)
        file_path = os.path.join(cache_dir, "song_list.png")
        image.convert("RGB").save(file_path, format="JPEG", quality=95, optimize=True)
        return file_path

    except Exception as e:
        print("Error in create_song_list_image:", e)
        return None

def create_single_song_image(song):
    try:
        scale = 2
        font_path = "arial unicode ms.otf"
        emoji_font_path = "emoji.ttf"
        font = ImageFont.truetype(font_path, 32 * scale)
        emoji_font = ImageFont.truetype(emoji_font_path, 32 * scale)
        title_font = ImageFont.truetype(font_path, 48 * scale)
        emoji_title_font = ImageFont.truetype(emoji_font_path, 48 * scale)

        padding = 80 * scale
        thumb_size = 300 * scale
        scl_icon_size = int(thumb_size * 0.3)
        scl_border_size = 4 * scale

        img_width = 1200 * scale
        img_height = 420 * scale

        image = Image.new("RGB", (img_width, img_height), (25, 25, 25))
        draw = ImageDraw.Draw(image)

        link, title, cover_url = song[:3]
        plays = song[3] if len(song) > 3 else 0
        likes = song[4] if len(song) > 4 else 0
        comments = song[5] if len(song) > 5 else 0

        thumb = Image.new("RGB", (thumb_size, thumb_size), (50, 50, 50))
        if cover_url:
            try:
                response = requests.get(cover_url)
                thumb = Image.open(BytesIO(response.content)).convert("RGB")
                thumb = ImageOps.fit(thumb, (thumb_size, thumb_size), centering=(0.5, 0.5))

                mask = Image.new("L", (thumb_size, thumb_size), 0)
                draw_mask = ImageDraw.Draw(mask)
                draw_mask.ellipse((0, 0, thumb_size, thumb_size), fill=255)
                thumb.putalpha(mask)

                border_size = 8 * scale
                border = Image.new("RGBA", (thumb_size + border_size*2, thumb_size + border_size*2), (0, 0, 0, 0))
                border_draw = ImageDraw.Draw(border)
                border_draw.ellipse((0, 0, border.width, border.height), fill=(0, 255, 180, 255))
                border.paste(thumb, (border_size, border_size), thumb)

                thumb = border
            except:
                pass

        background = Image.new("RGB", (img_width, img_height), (25, 25, 25))
        if cover_url:
            try:
                response = requests.get(cover_url)
                background = Image.open(BytesIO(response.content)).convert("RGB")
                background = ImageOps.fit(background, (img_width, img_height), centering=(0.5, 0.5))
            except:
                pass

        overlay = Image.new("RGBA", (img_width, img_height), (0, 0, 0, 128))
        image.paste(background, (0, 0))
        image.paste(overlay, (0, 0), overlay)

        image.paste(thumb, (padding, (img_height - thumb.height) // 2), thumb)

        scl_path = os.path.join(os.path.dirname(__file__), "sclden.jpg")
        if os.path.exists(scl_path):
            try:
                scl_img = Image.open(scl_path).convert("RGB")
                scl_img = ImageOps.fit(scl_img, (scl_icon_size, scl_icon_size), centering=(0.5, 0.5))

                mask = Image.new("L", (scl_icon_size, scl_icon_size), 0)
                draw_mask = ImageDraw.Draw(mask)
                draw_mask.ellipse((0, 0, scl_icon_size, scl_icon_size), fill=255)
                scl_img.putalpha(mask)

                scl_border = Image.new("RGBA", (scl_icon_size + scl_border_size*2, scl_icon_size + scl_border_size*2), (0, 0, 0, 0))
                border_draw = ImageDraw.Draw(scl_border)
                border_draw.ellipse((0, 0, scl_border.width, scl_border.height), fill=(255, 255, 255, 255))
                scl_border.paste(scl_img, (scl_border_size, scl_border_size), scl_img)

                scl_x = padding + thumb.width - scl_icon_size // 3 - 140
                scl_y = (img_height + thumb.height) // 2 - scl_icon_size // 3 - 100
                image.paste(scl_border, (scl_x, scl_y), scl_border)
            except Exception as e:
                print(f"Error loading or processing sclden.jpg: {e}")
        else:
            print(f"sclden.jpg not found at {scl_path}")

        base_colors = [(102, 204, 255), (255, 255, 180), (102, 255, 204)]
        colors = random.sample(base_colors, 3)

        def get_gradient_color(x, total_width):
            ratio = x / total_width
            if ratio < 0.5:
                c1, c2 = colors[0], colors[1]
                ratio *= 2
            else:
                c1, c2 = colors[1], colors[2]
                ratio = (ratio - 0.5) * 2
            r = int(c1[0] + (c2[0] - c1[0]) * ratio)
            g = int(c1[1] + (c2[1] - c1[1]) * ratio)
            b = int(c1[2] + (c2[2] - c1[2]) * ratio)
            return (r, g, b)

        text_x = padding + thumb.width + 50 * scale
        max_text_width = img_width - text_x - padding

        def shorten_text(text, font, emoji_font):
            current_width = 0
            result = ""
            for char in text:
                f = emoji_font if emoji.emoji_count(char) else font
                char_width = f.getlength(char)
                if current_width + char_width > max_text_width:
                    result += "..."
                    break
                result += char
                current_width += char_width
            return result

        def draw_gradient_text_line(draw, text, x, y, font, emoji_font):
            shortened = shorten_text(text, font, emoji_font)
            total_width = sum((emoji_font if emoji.emoji_count(c) else font).getlength(c) for c in shortened)

            current_x = x
            for char in shortened:
                f = emoji_font if emoji.emoji_count(char) else font
                char_width = f.getlength(char)
                color = get_gradient_color(current_x - x, total_width)

                shadow_offset = 2
                draw.text((current_x + shadow_offset, y + shadow_offset), char, font=f, fill=(0, 0, 0, 120))
                draw.text((current_x, y), char, font=f, fill=color)
                current_x += char_width

            return y + int(font.size * 1.6)

        text_y = padding
        text_y = draw_gradient_text_line(draw, f"🎧 {title}", text_x, text_y, title_font, emoji_title_font)
        text_y = draw_gradient_text_line(draw, "🎯 Nền tảng: SoundCloud ☁️", text_x, text_y, font, emoji_font)
        text_y = draw_gradient_text_line(draw, "🔊 Chill cùng nhạc thôi nào 🎧💘", text_x, text_y, font, emoji_font)
        draw_gradient_text_line(draw, f"🎶 {plays:,}   ❤️ {likes:,}   💬 {comments:,}", text_x, text_y, font, emoji_font)

        cache_dir = os.path.join(os.path.dirname(__file__), "cache")
        os.makedirs(cache_dir, exist_ok=True)
        file_path = os.path.join(cache_dir, "selected_song.png")
        image.save(file_path, format="JPEG", quality=95)
        return file_path

    except Exception as e:
        print("Error in create_single_song_image:", e)
        return None

def create_rotating_webp(image_url, num_frames=200, rotation_speed=2):
    try:
        response = requests.get(image_url, timeout=10)
        response.raise_for_status()
        image = Image.open(io.BytesIO(response.content)).convert('RGBA')
        
        frames = []
        for i in range(num_frames):
            angle = (i * 360) / num_frames
            rotated_image = image.rotate(angle)
            frame = create_rounded_corners(rotated_image, radius=200)
            frames.append(frame)

        with tempfile.NamedTemporaryFile(suffix='.webp', delete=False) as temp_file:
            frames[0].save(temp_file.name, format="WEBP", save_all=True, 
                         append_images=frames[1:], duration=20, loop=0)
            webp_url = upload_to_uguu(temp_file.name)
            delete_file(temp_file.name)
            return webp_url
    except Exception as e:
        print(f"Lỗi khi tạo WebP: {e}")
        return None

def create_rounded_corners(image, radius):
    width, height = image.size
    mask = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, width, height), radius=radius, fill=255)
    rounded_image = image.copy()
    rounded_image.putalpha(mask)
    return rounded_image

def is_valid_image_url(url):
    if not url:
        return False
    valid_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    return any(url.lower().endswith(ext) for ext in valid_extensions)

import random

def handle_nhac_command(message, message_object, thread_id, thread_type, author_id, client):
    global user_states
    global SEARCH_TIMEOUT

    reactions = ["😍", "❤️", "/-ok", "👋", "🫠", "/-strong", "😂", "😉", "🥳", "🤩", "Dạ", "Yew", "Yes", "Ok", "Oki", "Uwu", "😃", "🥰", "/-ok", "/-heart"]

    if not message or not isinstance(message, str):
        print("Invalid message received")
        return

    try:
        user_info = client.fetchUserInfo(author_id)
        if user_info and hasattr(user_info, 'changed_profiles') and author_id in user_info.changed_profiles:
            user = user_info.changed_profiles[author_id]
            username = getattr(user, 'name', None)
            if not username or username.strip() == "":
                username = getattr(user, 'displayName', None)
                if not username or username.strip() == "":
                    username = f"ID_{author_id}"
        else:
            username = f"ID_{author_id}"
    except Exception as e:
        print(f"[ERROR] Lỗi lấy thông tin user: {e}")
        username = f"ID_{author_id}"

    content = message.strip().split()

    if len(content) == 2 and content[0].lower() == f"{client.prefix}scl" and content[1].isdigit():
        print(f"[DEBUG] Người dùng chọn bài với số: {content[1]}")

        if author_id not in user_states:
            print(f"[DEBUG] Không có user_states cho author_id: {author_id}")
            return

        state = user_states[author_id]
        if time.time() - state['time_of_search'] > SEARCH_TIMEOUT:
            print(f"[DEBUG] Hết hạn SEARCH_TIMEOUT cho author_id: {author_id}")
            del user_states[author_id]
            text = f"🚦{username} Thời Gian Phản Hồi Hết Ròi Vui Lòng Chọn Scl <Tên bài hát> Khác Để Nghe Nhạc Nhé..!"
            mention = Mention(author_id, offset=2, length=len(username)) if thread_type != ThreadType.USER else None
            msg = Message(text=text, mention=mention)
            client.send(msg, thread_id, thread_type, ttl=60000)
            return

        songs = state['songs']
        selector_index = int(content[1]) - 1 

        if selector_index < 0 or selector_index >= len(songs):
            print(f"[DEBUG] Số thứ tự không hợp lệ: {content[1]}")
            text = f"🚦{username}, số thứ tự không hợp lệ: {content[1]}"
            mention = Mention(author_id, offset=2, length=len(username)) if thread_type != ThreadType.USER else None
            client.replyMessage(Message(text=text, mention=mention), message_object, thread_id, thread_type, ttl=60000)
            return

        song = songs[selector_index]
        link, title, cover_url = song[:3]
        plays = song[3] if len(song) > 3 else 0
        likes = song[4] if len(song) > 4 else 0
        comments = song[5] if len(song) > 5 else 0
        song_full = (link, title, cover_url, plays, likes, comments)

        print(f"Tải bài: {title} ({link})")

        temp_cover_path = None
        if is_valid_image_url(cover_url):
            try:
                response = requests.get(cover_url, timeout=10)
                response.raise_for_status()
                cover_img = Image.open(io.BytesIO(response.content)).convert("RGBA")
                
                temp_cover_path = os.path.join(CACHE_PATH, f"temp_cover_{author_id}.png")
                cover_img.save(temp_cover_path, "PNG")
            except Exception as e:
                print(f"[ERROR] Lỗi xử lý ảnh thumbnail: {e}")

        selected_number = content[1]
        text = f"""
🚦{username} chọn : {selected_number}
📩 Tên Bài Hát  : {title}
☁️ Nguồn: SoundCloud
🔗 Link : {link}
⏳Chờ Lấy Nhạc Nhé...🎧"""
        mention = Mention(author_id, offset=2, length=len(username)) if thread_type != ThreadType.USER else None
        msg = Message(text=text, mention=mention)

        if temp_cover_path and os.path.exists(temp_cover_path):
            try:
                with Image.open(temp_cover_path) as img:
                    width, height = img.size
                client.sendLocalImage(temp_cover_path, message=msg, thread_id=thread_id, thread_type=thread_type, width=width, height=height, ttl=600000)
                os.remove(temp_cover_path)
                print(f"[DEBUG] Đã gửi và xóa ảnh thumbnail tạm: {temp_cover_path}")
            except Exception as e:
                print(f"[ERROR] Lỗi khi gửi ảnh thumbnail: {e}")
                client.replyMessage(Message(text=text.replace("[ảnh]", ""), mention=mention), message_object, thread_id, thread_type, ttl=60000)
        else:
            client.replyMessage(msg.replace("[ảnh]", ""), message_object, thread_id, thread_type, ttl=60000)

        song_image_path = create_single_song_image(song_full)
        if not song_image_path:
            print(f"[DEBUG] bug rồi sếp ơi: {title}")
            text = f"🚦{username}, không thể tạo ảnh cho bài: {title}"
            mention = Mention(author_id, offset=2, length=len(username)) if thread_type != ThreadType.USER else None
            client.replyMessage(Message(text=text, mention=mention), message_object, thread_id, thread_type, ttl=60000)
            return

        if is_valid_image_url(cover_url):
            rotating_disc_url = create_rotating_webp(cover_url)
            if not rotating_disc_url:
                print(f"[DEBUG] bug rồi sếp ơi: {title}")
                rotating_disc_url = None
        else:
            rotating_disc_url = None
            print(f"[DEBUG] URL thumbnail không hợp lệ cho bài: {title}")

        cover_main = get_track_cover(link)
        cover_path = save_file_to_cache(cover_main, f"{title}_cover.jpg") if cover_main else None

        audio_url = get_music_stream_url(link)
        if not audio_url:
            print(f"[DEBUG] Không tải được âm thanh cho bài: {title}")
            text = f"🚦{username}, không thể tải: {title}"
            mention = Mention(author_id, offset=2, length=len(username)) if thread_type != ThreadType.USER else None
            client.replyMessage(Message(text=text, mention=mention), message_object, thread_id, thread_type, ttl=60000)
            return

        safe_title = re.sub(r'[<>:"/\\|?*]', '_', title).replace(' ', '_')
        file_path = save_file_to_cache(audio_url, f"{safe_title}.mp3")
        if not file_path:
            print(f"[DEBUG] Lỗi lưu tệp âm thanh cho bài: {title}")
            text = f"🚦{username}, lỗi lưu tệp âm thanh cho bài: {title}. Vui lòng thử lại."
            mention = Mention(author_id, offset=2, length=len(username)) if thread_type != ThreadType.USER else None
            client.replyMessage(Message(text=text, mention=mention), message_object, thread_id, thread_type, ttl=60000)
            return

        upload_response = upload_to_uguu(file_path)
        delete_file(file_path)

        if not upload_response:
            print(f"[DEBUG] Lỗi tải lên tệp âm thanh cho bài: {title}")
            text = f"🚦{username}, lỗi tải lên tệp âm thanh cho bài: {title}"
            mention = Mention(author_id, offset=2, length=len(username)) if thread_type != ThreadType.USER else None
            client.replyMessage(Message(text=text, mention=mention), message_object, thread_id, thread_type, ttl=60000)
            return

        try:
            with Image.open(song_image_path) as img:
                width, height = img.size
            text = f"🚦{username}, cùng chill theo nhạc nào"
            mention = Mention(author_id, offset=2, length=len(username)) if thread_type != ThreadType.USER else None
            msg = Message(text=text, mention=mention)
            client.send(msg, thread_id, thread_type, ttl=60000)
            time.sleep(0)
            client.sendLocalImage(song_image_path, thread_id, thread_type, width=width, height=height, ttl=600000)
            time.sleep(0)

            if rotating_disc_url and cover_url:
                client.sendCustomSticker(staticImgUrl=cover_url, animationImgUrl=rotating_disc_url, 
                                        thread_id=thread_id, thread_type=thread_type, ttl=600000)
                time.sleep(0)

            client.sendRemoteVoice(voiceUrl=upload_response, thread_id=thread_id, thread_type=thread_type, ttl=600000)
        except Exception as e:
            print(f"[ERROR] Lỗi khi gửi bài hát: {e}")
            text = f"🚦{username}, lỗi khi gửi bài hát: {str(e)}"
            mention = Mention(author_id, offset=2, length=len(username)) if thread_type != ThreadType.USER else None
            client.replyMessage(Message(text=text, mention=mention), message_object, thread_id, thread_type, ttl=60000)
            return

        del user_states[author_id]
        print(f"[DEBUG] Đã xóa user_states cho author_id: {author_id}")
        return

    if len(content) < 2:
        print("[DEBUG] Không có nội dung tìm kiếm, hiển thị menu gợi ý.")
        if not author_id:
            author_id = "Đéo Biết"

        action = random.choice(reactions)
        client.sendReaction(message_object, action, thread_id, thread_type, reactionType=75)

        try:
            image_path = generate_menu_image(client, author_id, thread_id, thread_type)
        except Exception as e:
            print(f"[ERROR] Lỗi khi tạo ảnh menu: {e}")
            image_path = None

        greeting_name = "Chủ Nhân" if str(author_id) == str(client.uid) else username

        caption = f"""🚦{username}
   ➜🚦 Vui lòng nhập tên bài hát để tìm kiếm sau lệnh {client.prefix}scl 🎵
   ➜ Ví dụ: 💞 {client.prefix}scl dừng thương
"""

        msg = Message(
            text=caption,
            mention=Mention(author_id, offset=2, length=len(username)) if thread_type != ThreadType.USER else None
        )

        if image_path and os.path.exists(image_path):
            try:
                with Image.open(image_path) as img:
                    width, height = img.size
                client.sendLocalImage(
                    imagePath=image_path,
                    message=msg,
                    thread_id=thread_id,
                    thread_type=thread_type,
                    width=width,
                    height=height,
                    ttl=240000
                )
                os.remove(image_path)
                print(f"[DEBUG] Đã gửi và xóa ảnh: {image_path}")
            except Exception as e:
                print(f"[ERROR] Lỗi khi gửi ảnh menu: {e}")
                client.replyMessage(Message(text=f"{caption}\n❌ Lỗi khi gửi ảnh: {str(e)}"), message_object, thread_id, thread_type)
        else:
            error_msg = f"{caption}\n❌ Không tạo được ảnh menu. Kiểm tra thư mục background/ và font/."
            client.replyMessage(Message(text=error_msg), message_object, thread_id, thread_type)
            print("✅ Đã gửi menu dạng văn bản do lỗi ảnh!")
        return

    query = ' '.join(content[1:])
    action = random.choice(reactions)
    client.sendReaction(message_object, action, thread_id, thread_type, reactionType=75)
    
    print(f"tìm từ bài hát: {query}")
    songs = search_songs(query)

    if not songs:
        text = f"🚦{username}, không tìm thấy bài hát."
        mention = Mention(author_id, offset=2, length=len(username)) if thread_type != ThreadType.USER else None
        client.replyMessage(Message(text=text, mention=mention), message_object, thread_id, thread_type, ttl=60000)
        return

    user_states[author_id] = {'songs': songs, 'time_of_search': time.time()}

    image_path = create_song_list_image(songs)
    if image_path:
        try:
            with Image.open(image_path) as img:
                width, height = img.size
                text = f"🚦{username}, Nhập {client.prefix}Scl <số> để chọn bài 🎯\n 💞Ví Dụ: {client.prefix}scl 3 ✅"
                mention = Mention(author_id, offset=2, length=len(username)) if thread_type != ThreadType.USER else None
                msg = Message(text=text, mention=mention)
            client.sendLocalImage(image_path, message=msg, thread_id=thread_id, thread_type=thread_type, width=width, height=height, ttl=600000)
        except Exception as e:
            print(f"[ERROR] Lỗi gửi ảnh danh sách: {e}")
            text = f"🚦{username}, không thể gửi ảnh danh sách: {str(e)}"
            mention = Mention(author_id, offset=2, length=len(username)) if thread_type != ThreadType.USER else None
            client.replyMessage(Message(text=text, mention=mention), message_object, thread_id, thread_type, ttl=60000)
    else:
        text = f"🚦{username}, không thể tạo ảnh danh sách bài hát."
        mention = Mention(author_id, offset=2, length=len(username)) if thread_type != ThreadType.USER else None
        client.replyMessage(Message(text=text, mention=mention), message_object, thread_id, thread_type, ttl=60000)