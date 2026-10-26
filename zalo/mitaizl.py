from zlapi.models import Message
import os
import importlib
import json
from config import PREFIX, ADMIN
import modules.bot_info
from modules.tagall import handle_tagall_command
import sys
from modules.menu import ping  
from modules.tagall import ft_vxkiue
sys.path.append('.')  # hoặc đường dẫn tuyệt đối đến thư mục chứa tagall.py
from modules.tagall import handle_tagall_command
from modules.menu import get_mitaizl  # Đúng tên file chứa menuzl
commands = get_mitaizl()

RESET = '\033[0m'
BOLD = '\033[1m'
GREEN = '\033[92m'
RED = '\033[91m'

class CommandHandler:
    def __init__(self, client):
        self.client = client
        self.mitaizl = self.load_mitaizl()
        self.auto_mitaizl = self.load_auto_mitaizl()
        self.adminon = self.load_admin_mode()  # Load trạng thái Admin Mode

    def load_admin_mode(self):
        """Đọc trạng thái Admin Mode từ file."""
        try:
            with open('modules/cache/admindata.json', 'r') as f:
                data = json.load(f)
                return data.get('adminon', False)
        except (FileNotFoundError, json.JSONDecodeError):
            return False

    def save_admin_mode(self):
        """Lưu trạng thái Admin Mode vào file."""
        try:
            os.makedirs('modules/cache', exist_ok=True)
            with open('modules/cache/admindata.json', 'w') as f:
                json.dump({'adminon': self.adminon}, f)
        except Exception as e:
            print(f"Lỗi khi lưu admin mode: {e}")

    def load_mitaizl(self):
        mitaizl = {}
        from modules.tagall import ft_vxkiue
        mitaizl.update(ft_vxkiue())  # ← thêm dòng này

        from modules.sms import get_mitaizl
        mitaizl.update(get_mitaizl())
        
        modules_path = 'modules'
        for filename in os.listdir(modules_path):
            if filename.endswith('.py') and filename != '__init__.py':
                module_name = filename[:-3]
                try:
                    module = importlib.import_module(f'{modules_path}.{module_name}')
                    if hasattr(module, 'get_mitaizl'):
                        mitaizl.update(module.get_mitaizl())
                except Exception as e:
                    print(f"{BOLD}{RED}Không thể load module: {module_name}. Lỗi: {e}{RESET}")
        return mitaizl

    def load_auto_mitaizl(self):
        """Load các lệnh không cần prefix từ folder 'modules/auto'."""
        auto_mitaizl = {}
        auto_modules_path = 'modules.auto'
        for filename in os.listdir('modules/auto'):
            if filename.endswith('.py') and filename != '__init__.py':
                module_name = filename[:-3]
                try:
                    module = importlib.import_module(f'{auto_modules_path}.{module_name}')
                    if hasattr(module, 'get_mitaizl'):
                        auto_mitaizl.update(module.get_mitaizl())
                except Exception as e:
                    print(f"{BOLD}{RED}Không thể load module: {module_name}. Lỗi: {e}{RESET}")
        return auto_mitaizl

    def handle_command(self, message, author_id, message_object, thread_id, thread_type):
        # Nếu lệnh là adminmode on/off thì bật/tắt Admin Mode
        if message.startswith(PREFIX + 'admin'):
            self.toggle_admin_mode(message, message_object, thread_id, thread_type, author_id)
            return
        
        # Nếu là lệnh auto (không cần prefix)
        auto_command_handler = self.auto_mitaizl.get(message.lower())
        if auto_command_handler:
            auto_command_handler(message, message_object, thread_id, thread_type, author_id, self.client)
            return
        
        # Kiểm tra nếu Admin Mode đang bật và người gửi không phải admin thì bỏ qua
        if self.adminon and author_id not in ADMIN:
            return

        # Nếu không có prefix thì bỏ qua
        if not message.startswith(PREFIX):
            return

        # Xử lý lệnh chính
        command_name = message[len(PREFIX):].split(' ')[0].lower()
        command_handler = self.mitaizl.get(command_name)

        if command_handler:
            command_handler(message, message_object, thread_id, thread_type, author_id, self.client)
        else:
            self.client.sendMessage(
                f"Không tìm thấy lệnh '{command_name}'. Hãy dùng {PREFIX}menu để biết các lệnh có trên hệ thống.", 
                thread_id, 
                thread_type
            )

    def toggle_admin_mode(self, message, message_object, thread_id, thread_type, author_id):
        """Bật/tắt Admin Mode với reply"""
        if author_id in ADMIN:
            if 'on' in message.lower():
                self.adminon = True
                self.save_admin_mode()
                self.client.replyMessage(
                    Message(text="🔓 Admin Đã Được Bật!"),
                    message_object, thread_id, thread_type
                )
            elif 'off' in message.lower():
                self.adminon = False
                self.save_admin_mode()
                self.client.replyMessage(
                    Message(text="🔓 Admin Đã Được Tắt!"),
                    message_object, thread_id, thread_type
                )
            else:
                self.client.replyMessage(
                    Message(text="🚦 Vui lòng chỉ định lệnh 'on' hoặc 'off'."),
                    message_object, thread_id, thread_type
                )
        else:
            self.client.replyMessage(
                Message(text="🚫 Tuổi Cặc Đòi Xài!"),
                message_object, thread_id, thread_type
            )
            
def is_wlgr(gr_id):
    wl_list = load_data(BOTSET_FILE)
    if "5" not in wl_list:
        wl_list["5"] = {}
    if "whitelist" not in wl_list["5"]:
        wl_list["5"]["whitelist"] = []
    ad_id = wl_list["5"]["whitelist"]
    gr_id = int(gr_id)
    return gr_id in ad_id

def add_wlgr(self,message_object,thread_id,thread_type,author_id):
    author_id = int(author_id)
    if not is_admin(str(author_id)):
        messages = "❌Bạn không phải là owner =))"
        self.replyMessage(
                Message(text=str(messages)),
                message_object,
                thread_id=thread_id,
                thread_type=thread_type,
            )
        return
    if thread_type != ThreadType.GROUP:
        messages = "❌Vui lòng dùng trong nhóm"
        self.replyMessage(
                Message(text=str(messages)),
                message_object,
                thread_id=thread_id,
                thread_type=thread_type,
            )
        return
    botset1 = load_data(BOTSET_FILE)
    thread_id=int(thread_id)
    if "5" not in botset1:
        botset1["5"] = {}
    if "whitelist" not in botset1["5"]:
        botset1["5"]["whitelist"] = []
    if thread_id in botset1["5"]["whitelist"]:  # Tránh thêm trùng lặp
        messages = "❌GR Đã được whitelist"
        self.replyMessage(
                Message(text=str(messages)),
                message_object,
                thread_id=thread_id,
                thread_type=thread_type,
            )
        return
    if thread_id not in botset1["5"]["whitelist"]:  # Tránh thêm trùng lặp
        botset1["5"]["whitelist"].append(int(thread_id))
    save_data(BOTSET_FILE,botset1)
    gr = self.fetchGroupInfo(thread_id)
    gr_name = gr['gridInfoMap'][str(thread_id)].name
    length = len(str(gr_name))
    bold = MessageStyle(style="bold", length=length, offset=10,auto_format=False)
    style = MultiMsgStyle([bold])
    messages = f"✔ Đã thêm {gr_name} vào danh sách group whitelist"
    self.replyMessage(
            Message(text=str(messages),style=style),
            message_object,
            thread_id=thread_id,
            thread_type=thread_type,
        )
    return

def rm_wlgr(self,message_object,thread_id,thread_type,author_id):
    author_id = int(author_id)
    if not is_admin(str(author_id)):
        messages = "❌Bạn không phải là owner =))"
        self.replyMessage(
                Message(text=str(messages)),
                message_object,
                thread_id=thread_id,
                thread_type=thread_type,
            )
        return
    if thread_type != ThreadType.GROUP:
        messages = "❌Vui lòng dùng trong nhóm"
        self.replyMessage(
                Message(text=str(messages)),
                message_object,
                thread_id=thread_id,
                thread_type=thread_type,
            )
        return
    botset1 = load_data(BOTSET_FILE)
    if "5" not in botset1:
        botset1["5"] = {}
    if "whitelist" not in botset1["5"]:
        botset1["5"]["whitelist"] = []
    if int(thread_id) in botset1["5"]["whitelist"]:  # Tránh thêm trùng lặp
        botset1["5"]["whitelist"].remove(int(thread_id))
    save_data(BOTSET_FILE,botset1)
    gr = self.fetchGroupInfo(thread_id)
    gr_name = gr['gridInfoMap'][str(thread_id)].name
    length = len(str(gr_name))
    bold = MessageStyle(style="bold", length=length, offset=10,auto_format=False)
    messages = f"✔ Đã xoá {gr_name} vào danh sách group whitelist"
    style = MultiMsgStyle([bold])
    self.replyMessage(
            Message(text=str(messages),style=style),
            message_object,
            thread_id=thread_id,
            thread_type=thread_type,
        )
    return

def is_admin(author_id):
    settings = read_settings()
    admin_bot = settings.get("admin_bot", [])
    if author_id in admin_bot:
        return True
    else:
        return False

def handle_bot_admin(bot):
    settings = read_settings()
    admin_bot = settings.get("admin_bot", [])
    if bot.uid not in admin_bot:
        admin_bot.append(bot.uid)
        settings['admin_bot'] = admin_bot
        write_settings(settings)
        print(f"Đã thêm 👑{get_user_name_by_id(bot, bot.uid)} 🆔 {bot.uid} cho lần đầu tiên khởi động vào danh sách Admin 🤖BOT ✅")


def get_allowed_thread_ids():
    """Lấy danh sách các thread ID được phép từ setting.json."""
    settings = read_settings()
    return settings.get('allowed_thread_ids', [])

def bot_on_group(bot, thread_id):
    """Thêm thread_id vào danh sách được phép."""
    try:
        settings = read_settings()
        allowed_thread_ids = settings.get('allowed_thread_ids', [])
        group = bot.fetchGroupInfo(thread_id).gridInfoMap[thread_id]

        if thread_id not in allowed_thread_ids:
            allowed_thread_ids.append(thread_id)
            settings['allowed_thread_ids'] = allowed_thread_ids
            write_settings(settings)

            return f"🤖BOT đã được bật trong Group: {group.name}\n"
    except Exception as e:
        print(f"Error: {e}")
        return "Đã xảy ra lỗi gì đó🤧"

def bot_off_group(bot, thread_id):
    """Loại bỏ thread_id khỏi danh sách được phép."""
    try:
        settings = read_settings()
        allowed_thread_ids = settings.get('allowed_thread_ids', [])
        group = bot.fetchGroupInfo(thread_id).gridInfoMap[thread_id]

        if thread_id in allowed_thread_ids:
            allowed_thread_ids.remove(thread_id)
            settings['allowed_thread_ids'] = allowed_thread_ids
            write_settings(settings)

            return f"🤖BOT đã được tắt trong Group: {group.name}\n"
    except Exception as e:
        print(f"Error: {e}")
        