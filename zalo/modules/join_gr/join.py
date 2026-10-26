import json
import os
import random
import time
from zlapi.models import *
from core.bot_sys import is_admin
from datetime import datetime

def handle_join_command(message, message_object, thread_id, thread_type, author_id, client):
    # if not is_admin(client, author_id):
    #     client.replyMessage(Message(text="❌ Bạn không phải admin bot!"), message_object, thread_id, thread_type, ttl=120000)
    #     return

    try:
        parts = message.strip().split()
        if len(parts) != 3:
            client.replyMessage(Message(text="😵‍💫 Sai cú pháp! Dùng: spam <link> <số lần spam>"), message_object, thread_id, thread_type)
            return

        url = parts[1].strip()
        try:
            spam_count = int(parts[2].strip())
        except ValueError:
            client.replyMessage(Message(text="❗️ Số lần spam không hợp lệ! Vui lòng nhập một số nguyên."), message_object, thread_id, thread_type)
            return

        if spam_count <= 0:
            client.replyMessage(Message(text="❗️ Số lần spam phải lớn hơn 0!"), message_object, thread_id, thread_type)
            return

        if not url.startswith("https://zalo.me/"):
            client.replyMessage(Message(text="⛔ Link không hợp lệ! Hãy chắc chắn rằng link bắt đầu bằng 'https://zalo.me/'"), message_object, thread_id, thread_type)
            return
        
        if not os.path.exists('ot.txt'):
            client.replyMessage(Message(text="❗️ File ot.txt không tồn tại!"), message_object, thread_id, thread_type)
            return
        try:
            with open('ot.txt', 'r', encoding='utf-8') as file:
                contents = [line.strip() for line in file if line.strip()]
        except Exception as e:
            client.replyMessage(Message(text=f"❗️ Không thể đọc file ot.txt: {e}!"), message_object, thread_id, thread_type)
            return

        if not contents:
            client.replyMessage(Message(text="❗️ File ot.txt trống!"), message_object, thread_id, thread_type)
            return
        tagall_message = random.choice(contents)

        group_info = client.checkGroup(url)
        if 'groupId' not in group_info:
            join_result = client.joinGroup(url)
            if isinstance(join_result, dict) and join_result.get('error_code', -1) not in [0, 240, 1022]:
                client.replyMessage(Message(text="🚫 Không thể tham gia nhóm!"), message_object, thread_id, thread_type)
                return
            group_info = client.checkGroup(url)
        
        group_id = group_info.get('groupId')
        if not group_id:
            client.replyMessage(Message(text="❌ Không lấy được thông tin nhóm!"), message_object, thread_id, thread_type)
            return

        if not os.path.exists('sticker.json'):
            client.replyMessage(Message(text="❗️ File sticker.json không tồn tại!"), message_object, thread_id, thread_type)
            return
        try:
            with open('sticker.json', 'r', encoding='utf-8') as file:
                stickers = json.load(file)
        except Exception as e:
            client.replyMessage(Message(text=f"❗️ Không thể đọc file sticker.json: {e}!"), message_object, thread_id, thread_type)
            return

        if not stickers:
            client.replyMessage(Message(text="❗️ File sticker.json trống!"), message_object, thread_id, thread_type)
            return

        try:
            group_info = client.fetchGroupInfo(group_id).gridInfoMap.get(group_id)
            if not group_info:
                client.replyMessage(Message(text="❌ Không lấy được thông tin nhóm từ fetchGroupInfo!"), message_object, thread_id, thread_type)
                return
            members = group_info.get('memVerList', [])
        except Exception as e:
            client.replyMessage(Message(text=f"❗️ Lỗi khi lấy thông tin nhóm: {e}"), message_object, thread_id, thread_type)
            return

        if not members:
            client.replyMessage(Message(text="⚠️ Nhóm không có thành viên để tạo mentions!"), message_object, thread_id, thread_type)
            return

        text = f"{tagall_message}"
        mentions = []
        offset = len(text)

        for member in members:
            member_parts = member.split('_', 1)
            if len(member_parts) != 2:
                continue
            user_id, user_name = member_parts
            mention = Mention(uid=user_id, offset=offset, length=len(user_name) + 1, auto_format=False)
            mentions.append(mention)
            offset += len(user_name) + 2

        if not mentions:
            client.replyMessage(Message(text="⚠️ Không thể tạo mentions cho thành viên nhóm!"), message_object, thread_id, thread_type)
            return

        multi_mention = MultiMention(mentions)

        for i in range(spam_count):
            try:
                client.send(Message(text=text, mention=multi_mention), group_id, ThreadType.GROUP)
                sticker = random.choice(stickers)
                client.sendSticker(
                    stickerType=sticker['stickerType'],
                    stickerId=sticker['stickerId'],
                    cateId=sticker['cateId'],
                    thread_id=group_id,
                    thread_type=ThreadType.GROUP
                )
                time.sleep(0.2)
            except Exception as e:
                client.replyMessage(Message(text=f"❗️ Lỗi khi gửi tin nhắn/sticker: {e}"), message_object, thread_id, thread_type)
                return

    except Exception as e:
        client.replyMessage(Message(text=f"❗️ Đã xảy ra lỗi: {e}"), message_object, thread_id, thread_type)