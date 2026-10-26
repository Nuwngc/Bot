from datetime import datetime
import os
from config import *
from modules.func_bot_info import get_user_name_by_id, is_admin, read_settings, write_settings
from modules.func_menu import create_menu_image
from zlapi.models import *

def handle_share_on(bot, thread_id):
    settings = read_settings()
    if "share" not in settings:
        settings["share"] = {}
    settings["share"][thread_id] = True
    write_settings(settings)
    return f"🚦Lệnh {prefix}share đã được Bật 🚀 trong nhóm này ✅"

def handle_share_off(bot, thread_id):
    settings = read_settings()
    if "share" in settings and thread_id in settings["share"]:
        settings["share"][thread_id] = False
        write_settings(settings)
        return f"🚦Lệnh {prefix}share đã Tắt ⭕️ trong nhóm này ✅"
    return "🚦Nhóm chưa có thông tin cấu hình share để ⭕️ Tắt 🤗"

def handle_share_command(self, message, message_object, thread_id, author_id, thread_type):

    settings = read_settings()
    
    user_message = message.replace(f"{prefix}share ", "").strip().lower()
    if user_message == "on":
        if not is_admin(author_id):  
            response = "❌Bạn không phải admin bot!"
        else:
            response = handle_share_on(self, thread_id)
        self.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
        return
    elif user_message == "off":
        if not is_admin(author_id):  
            response = "❌Bạn không phải admin bot!"
        else:
            response = handle_share_off(self, thread_id)
        self.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
        return
    
    if not (settings.get("share", {}).get(thread_id, False)):
        return

    bot_name = get_user_name_by_id(self, self.uid)
    time_update = "08-01-24"

    contents = {
        'art': {
            'url': "https://link4m.com/zynR1ry0",
            'author': bot_name,
            'update_date': time_update,
            'features': "Vễ text art 3 chữ cái không dấu",
            'notes': [
                "1️⃣ [Bước 1] Thay imei và cookie",
                "2️⃣ [Bước 2] Dùng lệnh !art [xxx] [emoji] Ví dụ: !art tot 🍉"
            ]
        },
        'bot_info': {
            'url': "https://link4m.com/E6bYAj",
            'author': bot_name,
            'update_date': time_update,
            'features': "Quản lý nhóm\n📎 Đính kèm: Sử dụng kèm với file setting.json\n🔗 File setting.json: https://link4m.com/jinRErv",
            'notes': [
                "1️⃣ [Bước 1] Thay imei và cookie",
                "2️⃣ [Bước 2] Dùng lệnh !bot on vào nhóm muốn Bật bot",
                "3️⃣ [Bước 3] Dùng lệnh !bot setup on để cấu hình nội quy nhóm",
                "4️⃣ [Bước 4] Dùng lệnh !bot noiquy để áp nội quy cho nhóm"
            ]
        },
        'chui_khanh_tai': {
            'url': "https://link4m.com/vIrILZA",
            'author': bot_name,
            'update_date': time_update,
            'features': "Tạo 2 luồng gửi tin nhắn chửi Khánh và Tài Nó cắm 2 Bot tele để lấy cắp thông tin anh em. Dùng api tele nó chửi ngược lại nó",
            'notes': [
                "1️⃣ [Bước 1] Mở file và run chỉ thế thôi"
            ]
        },
        'kickall': {
            'url': "https://link4m.com/IvWCPjQf",
            'author': bot_name,
            'update_date': time_update,
            'features': "Kick all member, suy nghĩ sáng suốt trước khi sử dụng nhé",
            'notes': [
                "1️⃣ [Bước 1] Thay imei và cookie",
                "2️⃣ [Bước 2] Dùng lệnh !kickall Phá kick toàn bộ member. Điều kiện là phải cầm key vàng hoặc bạc"
            ]
        },
        'reaction': {
            'url': "https://link4m.com/9ZqSAyMf",
            'author': bot_name,
            'update_date': time_update,
            'features': "Thả cảm xúc all tin nhắn",
            'notes': [
                "1️⃣ [Bước 1] Thay imei và cookie",
                "2️⃣ [Bước 2] Run"
            ]
        },
        'var': {
            'url': "https://link4m.com/6UslPHh",
            'author': bot_name,
            'update_date': time_update,
            'features': "Tính năng đi var",
            'notes': [
                "1️⃣ [Bước 1] Thay imei và cookie",
                "2️⃣ [Bước 2] Có 3 lệnh var, stop và kickall"
            ]
        },
        'color': {
            'url': "https://link4m.com/NOuwq",
            'author': bot_name,
            'update_date': time_update,
            'features': "Tạo Color chữ màu Gradient (chỉ 77 ký tự giới hạn của Zalo, vượt quá 77 ký tự gởi thường không đổi màu)",
            'notes': [
                "1️⃣ [Bước 1] Thay imei và cookie. Tìm dòng imei và session_cookies lần lượt thay bằng imei và cookie của mình",
                "2️⃣ [Bước 2] Dùng lệnh /color Nội dung đổi màu"
            ]
        },
        'fake_hack': {
            'url': "https://link4m.com/SNoB7",
            'author': bot_name,
            'update_date': time_update,
            'features': "Fake hack by A Sìn. Đổi tên, avtar, chặn toàn bộ danh sách bạn! ⚠️ Cảnh báo: Tuyệt đối không sử dụng đối với người thiếu hiểu biết",
            'notes': [
                "1️⃣ [Bước 1] Thay imei và cookie",
                "2️⃣ [Bước 2] Run file là lụm"
            ]
        },
        'group': {
            'url': "https://link4m.com/ong2UsCV",
            'author': bot_name,
            'update_date': time_update,
            'features': "Xem thông tin nhóm",
            'notes': [
                "1️⃣ [Bước 1] Thay imei và cookie. Tìm dòng imei và session_cookies lần lượt thay bằng imei và cookie của mình",
                "2️⃣ [Bước 2] Dùng lệnh /gr"
            ]
        },
        'info': {
            'url': "https://link4m.com/9ZqSAyMf",
            'author': bot_name,
            'update_date': time_update,
            'features': "Thả cảm xúc all tin nhắn",
            'notes': [
                "1️⃣ [Bước 1] Thay imei và cookie",
                "2️⃣ [Bước 2] Run"
            ]
        },
        'infoadv3': {
            'url': "https://link4m.com/XULfcD",
            'author': bot_name,
            'update_date': time_update,
            'features': "Thông tin tác giả\n🔗 Link folder:https://link4m.com/reAlLD",
            'notes': [
                "1️⃣ [Bước 1] Thay imei và cookie",
                "2️⃣ [Bước 2] Thưc mục anime để ngang hàng với file infoad.py. Sau đó copy các ảnh yêu thích vào thư mục anime"
                "3️⃣ [Bước 2] Chạy lệnh !infoad"
            ]
        },
        'nhai_theo': {
            'url': "https://link4m.com/9W7ql",
            'author': bot_name,
            'update_date': time_update,
            'features': "Nhái theo tin nhắn text của người khác",
            'notes': [
                "1️⃣ [Bước 1] Thay imei và cookie",
                "2️⃣ [Bước 2] Dùng lệnh !nhai on để bật, !nhai off để tắt"
            ]
        },
        'voice': {
            'url': "https://link4m.com/qC4roZ7a",
            'author': bot_name,
            'update_date': time_update,
            'features': "Chuyển Text sang Voice",
            'notes': [
                "1️⃣ [Bước 1] Thay imei và cookie",
                "2️⃣ [Bước 2] Cài thư viện pip install gtts"
                "3️⃣ [Bước 3] Run và dùng lệnh !vi"
            ]
        },
        'welcome': {
            'url': "https://link4m.com/aQAQ6qsi",
            'author': bot_name,
            'update_date': time_update,
            'features': "Chào mừng thành viên ra vào nhóm",
            'notes': [
                "1️⃣ [Bước 1] Thay imei và cookie",
                "2️⃣ [Bước 2] Chọn nhóm cần bật welcome. Gõ lệnh !wl on để bật chế độ welcome. Tắt bằng lệnh !wl off"
            ]
        },
        'welcome2': {
            'url': "https://link4m.com/f6to3r",
            'author': bot_name,
            'update_date': time_update,
            'features': "Chào mừng thành viên ra vào nhóm V2\n🔗 Link Font và toàn bộ file: https://link4m.com/KAKasDdS",
            'notes': [
                "1️⃣ [Bước 1] Thay imei và cookie",
                "2️⃣ [Bước 2] Cài thư viện pip install pillow, pip install emoji Run file chính welcome2.py Thư mục Font, file và welcome2.py đặt ngang hàng nhau"
                "3️⃣ [Bước 3] Chọn nhóm cần bật welcome. Gõ lệnh !wl on để bật chế độ welcome. Tắt bằng lệnh !wl off"
            ]
        }
        
    }

    content_parts = message.strip().split(" ", 1)
    if len(content_parts) < 2:
        error_message = {
            f"🚦Tổng hợp code được share\n":
            f"➜ art\n"
            f"➜ bot_info\n"
            f"➜ chui_khanh_tai\n"
            f"➜ color\n"
            f"➜ fake_hack\n"
            f"➜ group\n"
            f"➜ info\n"
            f"➜ infoadv3\n"
            f"➜ kickall\n"
            f"➜ nhai_theo\n"
            f"➜ reaction\n"
            f"➜ var\n"
            f"➜ voice\n"
            f"➜ welcome\n"
            f"➜ welcome2\n"
            f"🚦 Ví dụ {prefix}share info ✅"
                        }
        temp_image_path, menu_message = create_menu_image(error_message, self, author_id)

        self.sendLocalImage(
            temp_image_path, thread_id=thread_id, thread_type=thread_type,
            message=Message(text=menu_message, mention=Mention(author_id, length=len(f"{get_user_name_by_id(self, author_id)}"), offset=0)), height=500, width=1280
        )

        os.remove(temp_image_path)
        return

    name = content_parts[1].strip()

    share_info = contents.get(name)
    commands = f"{prefix}share"

    if not share_info:
        error_message = Message(text=f"Lệnh [{commands} {name}] không được hỗ trợ 🤧.")
        self.replyMessage(error_message, message_object, thread_id, thread_type)
        return

    notes_formatted = "\n".join([f"   {i+1}️⃣ {note}" for i, note in enumerate(share_info['notes'])])

    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    share_message = Message(
        text=(
            f"🚦Chi tiết Code {name}\n"
            f"👨‍💻 Tác giả: {share_info['author']}\n"
            f"🔄 Cập nhật: {share_info['update_date']}\n"
            f"🚀 Tính năng: {share_info['features']}\n"
            f"📌 Lưu ý:\n"
            f"{notes_formatted}\n"
            f"🚦 Link code share: {share_info['url']}\n"
        )
    )

    self.replyMessage(share_message, message_object, thread_id, thread_type)