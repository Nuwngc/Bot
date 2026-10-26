from core.bot_sys import admin_cao
from zlapi.models import *

def send_styled_message(bot, msg, message_object, thread_id, thread_type):
    styles = MultiMsgStyle([
        MessageStyle(offset=0, length=len(msg), style="color", color="#15A85F", auto_format=False),
        MessageStyle(offset=0, length=len(msg), style="font", size="12", auto_format=False),
        MessageStyle(offset=0, length=len(msg), style="italic", auto_format=False)
    ])
    bot.replyMessage(Message(text=msg, style=styles), message_object, thread_id, thread_type, ttl=20000)

def kick_member_group(message, message_object, thread_id, thread_type, author_id, bot):
    if not admin_cao(bot, author_id):
        bot.replyMessage(Message(text="❌ Bạn không phải admin bot!"), 
                        message_object, thread_id=thread_id, 
                        thread_type=thread_type, ttl=100000)
        return
    
    parts = message_object.content.split()
    
    group = bot.fetchGroupInfo(thread_id).gridInfoMap[thread_id]

    admin_ids = set(group.adminIds)
    admin_ids.add(group.creatorId)

    list_mem_group = set([member.split('_')[0] for member in group["memVerList"]])
    list_mem_group_to_kick = list_mem_group - admin_ids
    for uid in list_mem_group_to_kick:
        bot.blockUsersInGroup(uid, thread_id)
        bot.kickUsersInGroup(uid, thread_id)