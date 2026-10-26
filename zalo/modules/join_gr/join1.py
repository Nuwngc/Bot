import time
import random
from zlapi.models import *
from core.bot_sys import is_admin
from datetime import datetime

def get_user_name_by_id(bot, author_id):
    try:
        user_info = bot.fetchUserInfo(author_id).changed_profiles[author_id]
        return user_info.zaloName or user_info.displayName
    except Exception as e:
        return "Unknown User"

def handle_join1_command(message, message_object, thread_id, thread_type, author_id, client):
    if not is_admin(client, author_id):
        msg = "❌Bạn không phải admin bot!\n"
        styles = MultiMsgStyle([ 
            MessageStyle(offset=0, length=2, style="color", color="#f38ba8", auto_format=False),
            MessageStyle(offset=2, length=len(msg)-2, style="color", color="#cdd6f4", auto_format=False),
            MessageStyle(offset=0, length=len(msg), style="font", size="13", auto_format=False)
        ])
        client.replyMessage(Message(text=msg, style=styles), message_object, thread_id, thread_type, ttl=120000)
        return

    parts = message.strip().split(" ")
    if len(parts) < 3:
        client.replyMessage(Message(text="😵‍💫 Sai cú pháp! Dùng: join <số lần> <nội dung>"), message_object, thread_id, thread_type)
        return

    url = parts[1].strip()
    try:
        spam_count = int(parts[2].strip())
    except ValueError:
        client.replyMessage(Message(text="😵‍💫 Số lần phải là số nguyên!"), message_object, thread_id, thread_type)
        return

    if not url.startswith("https://zalo.me/"):
        client.replyMessage(Message(text="⛔ Link không hợp lệ! Hãy chắc chắn rằng link bắt đầu bằng 'https://zalo.me/'"), message_object, thread_id, thread_type)
        return

    custom_message = " ".join(parts[3:])

    join_result = client.joinGroup(url)
    if isinstance(join_result, dict) and 'error_code' in join_result:
        error_code = join_result['error_code']
        if error_code not in [0, 240, 1022]:
            client.replyMessage(Message(text="🚫 Status: Fail"), message_object, thread_id, thread_type)
            return

    group_info = client.checkGroup(url)
    if not all(key in group_info for key in ['groupId', 'name', 'creatorId', 'currentMems']):
        client.replyMessage(Message(text="❌ Không lấy được thông tin nhóm!"), message_object, thread_id, thread_type)
        return

    group_id = group_info['groupId']
    group_name = group_info['name']
    creator_id = group_info['creatorId']
    members = group_info['currentMems']
    num_members = len(members)

    try:
        user_info = client.fetchUserInfo(creator_id)
        creator_name = user_info.get('displayName', 'Không rõ')
    except:
        creator_name = "Không rõ"

    attack_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    attack_msg = (
        f"✔️ Status: Successful!\n"
        f"💬 Message: {custom_message if custom_message else 'Không có tin nhắn'}"
    )
    
    client.replyMessage(Message(text=attack_msg), message_object, thread_id, thread_type)

    def random_large_text(text):
        if random.choice([True, False]):
            return text.upper()
        else:
            return f"{text}"

    for _ in range(spam_count):
        final_message = random_large_text(custom_message)
        client.sendMessage(Message(text=final_message), group_id, ThreadType.GROUP)
        
        time.sleep(random.uniform(0.5, 1.5))