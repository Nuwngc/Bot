from modules.func_bot_info import is_admin
from zlapi.models import *

def handle_disbox(bot, thread_id, author_id, thread_type, message_object):
    try:
        if not is_admin(author_id):
            bot.replyMessage(Message(text="❌ Bạn không phải admin bot!"), 
                            message_object, thread_id=thread_id, 
                            thread_type=thread_type, ttl=100000)
            return
        bot.disperseGroup(thread_id)
        return ""
    except Exception as e:
        return f"❌ Đã xảy ra lỗi khi giải tán nhóm: {str(e)}"