from modules.func_bot_info import is_admin
from zlapi.models import Message, Mention, ZaloAPIException, ThreadType
import time
import json

def handle_attack_command(message, message_object, thread_id, thread_type, author_id, self):
    if not is_admin(author_id):
        self.replyMessage(
            Message(text="🚫 Bạn không có quyền sử dụng lệnh này!"), 
            message_object, thread_id, thread_type,
            ttl=20000
        )
        return
    try:
        if "https://zalo.me/g/" in message:
            group_link = message.split("https://zalo.me/g/")[1].strip()
            group_url = f"https://zalo.me/g/{group_link}"
            join_result = self.joinGroup(group_url)

            if not join_result:
                raise ZaloAPIException("Không thể tham gia nhóm")
            
            group_info = self.getiGroup(group_url)
            if not isinstance(group_info, dict) or 'groupId' not in group_info:
                raise ZaloAPIException("Không lấy được thông tin nhóm")
            
            group_id = group_info['groupId']
            self.replyMessage(
                Message(text=f"✅ Đã tham gia nhóm thành công! {group_url} {group_id}"),
                message_object, thread_id, thread_type,
                ttl=20000
            )
            return
        else:
            self.replyMessage(
                Message(text="🚦 Tin nhắn không chứa link nhóm Zalo hợp lệ!"),
                message_object, thread_id, thread_type,
                ttl=20000
            )
            return

    except ZaloAPIException as e:
        self.replyMessage(
            Message(text=f"❌ Lỗi API: {str(e)}"),
            message_object, thread_id, thread_type
        )
    except Exception as e:
        self.replyMessage(
            Message(text=f"❌ Lỗi: {str(e)}"),
            message_object, thread_id, thread_type
        )