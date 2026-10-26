import json
import random
import time
from zlapi.models import *
from modules.func_bot_info import is_admin

def add_noise_to_request():
    noise = random.choice([
        "random-string-12345", "fake-param", "%$#^&*!", "random=garbage", 
        str(random.randint(1, 1000000)), "another-fake-value"
    ])
    return noise

def handle_spamgr_command(message, message_object, thread_id, thread_type, author_id, client):
    if not is_admin(author_id):
        msg = "❌Bạn không phải admin bot!\n"
        client.replyMessage(Message(text=msg), message_object, thread_id, thread_type, ttl=120000)
        return

    try:
        parts = message.strip().split(" ")
        if len(parts) < 3:
            client.replyMessage(Message(text="😵‍💫 Sai cú pháp! Dùng: spam <link> <số lần spam>"), message_object, thread_id, thread_type)
            return

        url = parts[1].strip()
        try:
            spam_count = int(parts[-1].strip())
        except ValueError:
            client.replyMessage(Message(text="❗️ Số lần spam không hợp lệ! Vui lòng nhập một số nguyên."), message_object, thread_id, thread_type)
            return

        if spam_count <= 0:
            client.replyMessage(Message(text="❗️ Số lần spam phải lớn hơn 0!"), message_object, thread_id, thread_type)
            return

        try:
            with open('noidung.txt', 'r', encoding='utf-8') as file:
                contents = file.readlines()
        except:
            client.replyMessage(Message(text="❗️ Không thể đọc file noidung.txt!"), message_object, thread_id, thread_type)
            return

        if not contents:
            client.replyMessage(Message(text="❗️ File noidung.txt trống!"), message_object, thread_id, thread_type)
            return
        
        content = random.choice(contents).strip()

        if not url.startswith("https://zalo.me/"):
            client.replyMessage(Message(text="⛔ Link không hợp lệ! Hãy chắc chắn rằng link bắt đầu bằng 'https://zalo.me/'"), message_object, thread_id, thread_type)
            return

        while True:
            noise = add_noise_to_request()
            join_result = client.joinGroup(url + "?param=" + noise)

            if isinstance(join_result, dict) and 'error_code' in join_result:
                error_code = join_result['error_code']
                if error_code == 178:
                    group_info = client.checkGroup(url)
                    if 'groupId' in group_info:
                        group_id = group_info['groupId']
                        client.leaveGroup(group_id, silent=True)
                        time.sleep(0)
                    return
                if error_code not in [0, 240, 1022]:
                    client.replyMessage(Message(text="🚫 Không thể tham gia nhóm!"), message_object, thread_id, thread_type)
                    return

            group_info = client.checkGroup(url)
            if 'groupId' not in group_info:
                client.replyMessage(Message(text="❌ Không lấy được thông tin nhóm!"), message_object, thread_id, thread_type)
                return

            group_id = group_info['groupId']
            group_name = group_info['name']
            creator_id = group_info['creatorId']
            admin_ids = group_info.get('adminIds', [])
            members = group_info['currentMems']
            num_members = len(members)

            if admin_ids:
                mention_admins = Mention(admin_ids, length=0, offset=0)
                client.send(Message(text="📢 Xin chào các quản trị viên!", mention=mention_admins), group_id, ThreadType.GROUP)

            try:
                user_info = client.fetchUserInfo(creator_id)
                creator_name = user_info.changed_profiles[creator_id].displayName
            except:
                creator_name = "Không rõ"

            admin_names = []
            for admin_id in admin_ids:
                try:
                    admin_info = client.fetchUserInfo(admin_id)
                    admin_name = admin_info.changed_profiles[admin_id].displayName
                    admin_names.append(admin_name)
                except:
                    admin_names.append(f"ID: {admin_id}")

            admin_mentions = ", ".join(admin_names) if admin_names else "Không có"
            attack_msg = f"✔️ Status: Successful!"

            client.replyMessage(Message(text=attack_msg), message_object, thread_id, thread_type)

            try:
                with open('noidung.txt', 'r', encoding='utf-8') as file:
                    contents = file.readlines()
            except:
                client.replyMessage(Message(text="❗️ Không thể đọc file noidung.txt!"), message_object, thread_id, thread_type)
                return

            if not contents:
                client.replyMessage(Message(text="❗️ File noidung.txt trống!"), message_object, thread_id, thread_type)
                return

            try:
                with open('sticker.json', 'r', encoding='utf-8') as file:
                    stickers = json.load(file)
            except:
                client.replyMessage(Message(text="❗️ Không thể đọc file sticker.json!"), message_object, thread_id, thread_type)
                return

            for i in range(spam_count):
                spam_content = content if content else random.choice(contents).strip() + add_noise_to_request()
                for member in members:
                    mention = Mention(member['id'], length=0, offset=0)
                    client.send(Message(text=f"{spam_content}", mention=mention), group_id, ThreadType.GROUP)

                    trash_param = add_noise_to_request()
                    client.send(Message(text=f"{trash_param}"), group_id, ThreadType.GROUP)
                    
                    sticker = random.choice(stickers)
                    client.sendSticker(stickerType=sticker['stickerType'], stickerId=sticker['stickerId'], cateId=sticker['cateId'], thread_id=group_id, thread_type=ThreadType.GROUP)

                    time.sleep(0.6)

            break

    except ZaloAPIException as e:
        client.replyMessage(Message(text=f"❗️ Lỗi API: {e}"), message_object, thread_id, thread_type)
    except Exception as e:
        client.replyMessage(Message(text=f"❗️ Đã xảy ra lỗi: {e}"), message_object, thread_id, thread_type)