from core.bot_sys import admin_cao
from zlapi.models import *

def handle_disbox(bot, thread_id, author_id, thread_type, message_object):
    try:
        if not admin_cao(bot, author_id):
            bot.replyMessage(Message(text="❌ Bạn không phải admin bot!"), 
                            message_object, thread_id=thread_id, 
                            thread_type=thread_type, ttl=100000)
            return
        bot.disperseGroup(thread_id)
        return ""
    except Exception as e:
        return f"❌ Đã xảy ra lỗi khi giải tán nhóm: {str(e)}"