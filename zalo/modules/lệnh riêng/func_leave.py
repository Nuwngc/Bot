import time
from modules.func_bot_info import is_admin
from zlapi.models import *

def handle_leave_group_command(message, message_object, thread_id, thread_type, author_id, client):
    if not is_admin(author_id):
        client.replyMessage(Message(text="❌ Bạn không phải admin bot!"), 
                           message_object, thread_id=thread_id, 
                           thread_type=thread_type, ttl=100000)
        return
    try:
        farewell_msg = "🚦Tạm biệt mọi người! Hẹn gặp lại nhé! 👋😊"
        client.replyMessage(Message(text=farewell_msg), 
                           message_object, thread_id=thread_id, 
                           thread_type=thread_type, ttl=120000)
        time.sleep(1)
        client.leaveGroup(thread_id, silent=True)

    except ZaloAPIException as e:
        error_msg = f"❌ Lỗi khi rời nhóm: {str(e)}"
        client.replyMessage(Message(text=error_msg), 
                           message_object, thread_id=thread_id, 
                           thread_type=thread_type, ttl=86400000)
    except Exception as e:
        error_msg = f"❌ Lỗi không xác định: {str(e)}"
        client.replyMessage(Message(text=error_msg), 
                           message_object, thread_id=thread_id, 
                           thread_type=thread_type, ttl=86400000)