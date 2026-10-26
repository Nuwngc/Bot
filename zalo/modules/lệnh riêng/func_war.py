import json
import os
import random
import threading
import time
from zlapi.models import *
from config import *
from threading import Thread
from modules.func_bot_info import create_menu1_image, is_admin


WAR_TXT_DIR = "modules/func_war/war_txt/"
os.makedirs(WAR_TXT_DIR, exist_ok=True)

war_config = {
    'reo': {
        'file': os.path.join(WAR_TXT_DIR, "choc.txt"),
        'delay': 0.6
    },
    'spam': {
        'file': os.path.join(WAR_TXT_DIR, "noidung.txt"),
        'delay': 0.6
    },
    'poll': {
        'file': os.path.join(WAR_TXT_DIR, "noidung.txt"),
        'delay': 0.6
    },
    'todo': {
        'file': os.path.join(WAR_TXT_DIR, "noidung.txt"),
        'delay': 0.6
    },
    'lv': {
        'file': os.path.join(WAR_TXT_DIR, "lv.txt"),
        'delay': 1
    }
}

sticker_file = os.path.join(WAR_TXT_DIR, "sticker.json")
is_reo_running = False
reo_lock = threading.Lock()
is_spam_running = False
spam_lock = threading.Lock()
is_polling = False
is_todo_active = False
is_lv = False

def get_user_name_by_id(bot, author_id):
    try:
        user_info = bot.fetchUserInfo(author_id).changed_profiles[author_id]
        return user_info.zaloName or user_info.displayName
    except Exception as e:
        return "Unknown User"

def set_war_delay(war_type, delay_value):
    try:
        delay = float(delay_value)
        if delay >= 0:
            war_config[war_type]['delay'] = delay
            return True
    except (ValueError, KeyError):
        return False
    return False

def set_war_file(war_type, filename):
    if not filename.endswith('.txt'):
        filename += '.txt'
    
    filepath = os.path.join(WAR_TXT_DIR, filename)
    if os.path.exists(filepath):
        war_config[war_type]['file'] = filepath
        return True
    return False

def list_text_files():
    try:
        txt_files = [f for f in os.listdir(WAR_TXT_DIR) if f.endswith('.txt')]
        return txt_files
    except FileNotFoundError:
        return []

def stop_all_wars(client, message_object, thread_id, thread_type):
    global is_reo_running, is_spam_running, is_polling, is_todo_active, is_lv
    
    with reo_lock:
        is_reo_running = False
    with spam_lock:
        is_spam_running = False
    is_polling = False
    is_todo_active = False
    is_lv = False
    client.replyMessage(
        Message(text="⚠️ Đã dừng tất cả chế độ war."),
        message_object, thread_id, thread_type
    )

def handle_reo_war(message_object, thread_id, thread_type, author_id, client, count=-1):
    global is_reo_running
    
    tagged_users = message_object.mentions[0]['uid']

    try:
        with open(war_config['reo']['file'], 'r', encoding='utf-8') as file:
            content = file.readlines()
    except FileNotFoundError:
        client.replyMessage(Message(text=f"❌Không tìm thấy file {war_config['reo']['file']}."), message_object, thread_id, thread_type)
        return

    if not content:
        client.replyMessage(Message(text=f"❌File {war_config['reo']['file']} trống."), message_object, thread_id, thread_type)
        return

    with reo_lock:
        is_reo_running = True

    def reo_loop():
        global is_reo_running
        executed = 0
        while is_reo_running and (count == -1 or executed < count):
            for line in content:
                if not is_reo_running or (count != -1 and executed >= count):
                    break
                mention = Mention(tagged_users, length=0, offset=4)
                client.send(Message(text=f" {line.strip()}", mention=mention), thread_id, thread_type)
                executed += 1
                time.sleep(war_config['reo']['delay'])

        with reo_lock:
            is_reo_running = False

    Thread(target=reo_loop, daemon=True).start()

def handle_spam_war(message_object, thread_id, thread_type, author_id, client, count=-1):
    global is_spam_running
    
    tagged_users = message_object.mentions[0]['uid']

    try:
        with open(war_config['spam']['file'], 'r', encoding='utf-8') as file:
            content = file.readlines()
    except FileNotFoundError:
        client.replyMessage(Message(text=f"❌Không tìm thấy file {war_config['spam']['file']}."), message_object, thread_id, thread_type)
        return

    if not content:
        client.replyMessage(Message(text=f"❌File {war_config['spam']['file']} trống."), message_object, thread_id, thread_type)
        return

    try:
        with open(sticker_file, 'r', encoding='utf-8') as file:
            stickers = json.load(file)
    except:
        client.replyMessage(Message(text="❗️ Không thể đọc file sticker.json!"), message_object, thread_id, thread_type)
        return

    with spam_lock:
        is_spam_running = True

    def spam_loop():
        global is_spam_running
        executed = 0
        while is_spam_running and (count == -1 or executed < count):
            for line in content:
                if not is_spam_running or (count != -1 and executed >= count):
                    break
                mention = Mention(tagged_users, length=0, offset=4)
                client.send(Message(text=f"{line.strip()}", mention=mention), thread_id, thread_type)
                sticker = random.choice(stickers)
                client.sendSticker(
                    stickerType=sticker['stickerType'],
                    stickerId=sticker['stickerId'],
                    cateId=sticker['cateId'],
                    thread_id=thread_id,
                    thread_type=thread_type
                )
                executed += 1
                time.sleep(war_config['spam']['delay'])
        with spam_lock:
            is_spam_running = False

    threading.Thread(target=spam_loop, daemon=True).start()

def handle_poll_war(message_object, thread_id, thread_type, author_id, client, count=-1):
    global is_polling
    
    user_id = message_object.mentions[0]['uid']

    try:
        author_info = client.fetchUserInfo(user_id)
        username = author_info['changed_profiles'][user_id].get('zaloName', 'không xác định')
    except Exception:
        username = "Người dùng không xác định"

    try:
        with open(war_config['poll']['file'], "r", encoding="utf-8") as file:
            captions = [caption.strip() for caption in file.readlines() if caption.strip()]
    except FileNotFoundError:
        client.replyMessage(Message(text=f"Không tìm thấy file {war_config['poll']['file']}"), message_object, thread_id, thread_type)
        return

    if not captions:
        client.replyMessage(Message(text=f"File {war_config['poll']['file']} trống."), message_object, thread_id, thread_type)
        return

    is_polling = True

    def poll_loop():
        global is_polling
        executed = 0
        while is_polling and (count == -1 or executed < count):
            question = f"{username} {captions[executed % len(captions)]}"
            try:
                client.createPoll(question=question, options=["Trùm war."], groupId=thread_id)
                executed += 1
                time.sleep(war_config['poll']['delay'])
            except Exception as e:
                client.replyMessage(Message(text=f"Lỗi khi tạo poll: {str(e)}"), message_object, thread_id, thread_type)
                break
        is_polling = False

    threading.Thread(target=poll_loop).start()

def handle_todo_war(message_object, thread_id, thread_type, author_id, client, count=-1):
    global is_todo_active
    
    user_id = message_object.mentions[0]['uid']
    is_todo_active = True

    def send_todo():
        global is_todo_active
        try:
            with open(war_config['todo']['file'], "r", encoding="utf-8") as file:
                captions = [caption.strip() for caption in file.readlines() if caption.strip()]

            if not captions:
                client.replyMessage(Message(text=f"❗️ File {war_config['todo']['file']} trống."), message_object, thread_id, thread_type)
                return

            executed = 0
            while is_todo_active and (count == -1 or executed < count):
                content = captions[executed % len(captions)]
                client.sendToDo(message_object, content, [user_id], thread_id, thread_type, -1, "Nhiệm vụ tự động")
                executed += 1
                time.sleep(war_config['todo']['delay'])
            is_todo_active = False

        except Exception as e:
            client.replyMessage(Message(text=f"Lỗi khi tạo todo: {str(e)}"), message_object, thread_id, thread_type)
            is_todo_active = False

    threading.Thread(target=send_todo).start()

def handle_random_war(message_object, thread_id, thread_type, author_id, client, count=-1):
    war_type = random.choice(['reo', 'spam', 'poll', 'todo'])
    response = f"🎲 Đã chọn ngẫu nhiên: {war_type} - Delay: {war_config[war_type]['delay']}s - File: {os.path.basename(war_config[war_type]['file'])} - Số lần: {count if count >= 0 else '∞'}"
    client.replyMessage(Message(text=response), message_object, thread_id, thread_type)
    
    if war_type == 'reo':
        handle_reo_war(message_object, thread_id, thread_type, author_id, client, count)
    elif war_type == 'spam':
        handle_spam_war(message_object, thread_id, thread_type, author_id, client, count)
    elif war_type == 'poll':
        handle_poll_war(message_object, thread_id, thread_type, author_id, client, count)
    elif war_type == 'todo':
        handle_todo_war(message_object, thread_id, thread_type, author_id, client, count)
    elif war_type == 'lv':
        handle_lv_war(message_object, thread_id, thread_type, author_id, client, count)

#lv
def handle_lv_war(message_object, thread_id, thread_type, author_id, client, count=-1):
    global is_lv
    
    tagged_users = message_object.mentions[0]['uid']

    try:
        with open(war_config['lv']['file'], 'r', encoding='utf-8') as file:
            content = file.readlines()
    except FileNotFoundError:
        client.replyMessage(Message(text=f"❌Không tìm thấy file {war_config['lv']['file']}."), message_object, thread_id, thread_type)
        return

    if not content:
        client.replyMessage(Message(text=f"❌File {war_config['lv']['file']} trống."), message_object, thread_id, thread_type)
        return

    with is_lv:
        is_reo_running = True

    def is_lv():
        global is_lv
        executed = 0
        while is_lv and (count == -1 or executed < count):
            for line in content:
                if not is_lv or (count != -1 and executed >= count):
                    break
                mention = Mention(tagged_users, length=0, offset=4)
                client.send(Message(text=f" {line.strip()}", mention=mention), thread_id, thread_type)
                executed += 1
                time.sleep(war_config['lv']['delay'])

        with is_lv:
            is_lv = False

    Thread(target=is_lv, daemon=True).start()
    
    
def create_new_txt(filename, content):
    try:
        if not filename.endswith('.txt'):
            filename += '.txt'
        
        filepath = os.path.join(WAR_TXT_DIR, filename)
        
        if os.path.exists(filepath):
            return False, "File already exists!"
        
        with open(filepath, 'w', encoding='utf-8') as file:
            file.write(content)
        
        return True, f"File {filename} created successfully!"
    except Exception as e:
        return False, f"Error creating file: {str(e)}"

def handle_allwar_command(bot, message_object, author_id, thread_id, thread_type, command):
    def send_response():
        try:
            parts = command.split()
            if len(parts) == 1:
                response = (
                    f"{get_user_name_by_id(bot, author_id)}\n"
                    f"➤ 🎯 Bắt đầu war: {prefix}war [reo/spam/poll/todo/random] [số lần] @tag\n"
                    f"➤ ⚙️ Cài đặt delay: {prefix}war [reo/spam/poll/todo] delay [thời gian]\n"
                    f"➤ 📝 Đặt file text: {prefix}war [reo/spam/poll/todo] set [tên file]\n"
                    f"➤ 📋 Danh sách file: {prefix}war txt list\n"
                    f"➤ ⭕️ Tắt war: {prefix}war off\n"
                    f"🔹 reo: Gửi tin nhắn chậm (delay: {war_config['reo']['delay']}s, file: {os.path.basename(war_config['reo']['file'])})\n"
                    f"🔹 spam: Tin nhắn + sticker (delay: {war_config['spam']['delay']}s, file: {os.path.basename(war_config['spam']['file'])})\n"
                    f"🔹 poll: Tạo bình chọn (delay: {war_config['poll']['delay']}s, file: {os.path.basename(war_config['poll']['file'])})\n"
                    f"🔹 todo: Giao nhiệm vụ (delay: {war_config['todo']['delay']}s, file: {os.path.basename(war_config['todo']['file'])})\n"
                    f"🔹 random: Chọn ngẫu nhiên\n"
                    f"📌 Ví dụ:\n"
                    f"- {prefix}war spam 5 @bot\n"
                    f"- {prefix}war reo delay 0.5\n"
                    f"- {prefix}war spam set noidung\n"
                    f"- {prefix}war txt list\n"
                    f"- {prefix}war off"
                )
                
                temp_image_path = create_menu1_image({"response": response}, 1, bot, author_id)
                if temp_image_path:
                    bot.sendLocalImage(
                        temp_image_path, 
                        thread_id=thread_id, 
                        thread_type=thread_type,
                        message=Message(text=response), 
                        height=500, 
                        width=1280
                    )
                    os.remove(temp_image_path)
                return
            
            action = parts[1].lower()
            
            if action == 'off':
                stop_all_wars(bot, message_object, thread_id, thread_type)
                return
                
            if action == 'txt' and len(parts) > 2 and parts[2].lower() == 'list':
                files = list_text_files()
                if files:
                    response = "📋 Danh sách file txt có sẵn:\n" + "\n".join(f"• {f}" for f in files)
                else:
                    response = f"❌ Không có file txt nào trong thư mục {WAR_TXT_DIR}!"
                bot.replyMessage(Message(text=response), message_object, thread_id, thread_type)
                return
                
            if not is_admin(author_id):
                bot.replyMessage(Message(text="❌ Bạn không phải admin!"), message_object, thread_id, thread_type)
                return
                
            if len(parts) >= 3 and parts[2].lower() == 'delay':
                if len(parts) < 4:
                    bot.replyMessage(Message(text="❌ Thiếu thời gian delay!"), message_object, thread_id, thread_type)
                    return
                    
                if action in war_config:
                    if set_war_delay(action, parts[3]):
                        bot.replyMessage(Message(text=f"✅ Đã đặt delay {action} thành {parts[3]} giây"), 
                                       message_object, thread_id, thread_type)
                    else:
                        bot.replyMessage(Message(text="❌ Thời gian delay không hợp lệ!"), 
                                       message_object, thread_id, thread_type)
                else:
                    bot.replyMessage(Message(text="❌ Loại war không hợp lệ!"), message_object, thread_id, thread_type)
                return
            
            if action == 'newtxt':
                if not is_admin(author_id):
                    bot.replyMessage(Message(text="❌ Bạn không phải admin!"), message_object, thread_id, thread_type)
                    return
                
                if len(parts) < 4:
                    bot.replyMessage(Message(text="❌ Thiếu tên file hoặc nội dung!\nVí dụ: /war newtxt tênfile nộidung"), 
                                   message_object, thread_id, thread_type)
                    return
                
                filename = parts[2]
                content = ' '.join(parts[3:])
                
                success, message = create_new_txt(filename, content)
                if success:
                    bot.replyMessage(Message(text=f"✅ {message}"), message_object, thread_id, thread_type)
                else:
                    bot.replyMessage(Message(text=f"❌ {message}"), message_object, thread_id, thread_type)
                return
                
            if not is_admin(author_id):
                bot.replyMessage(Message(text="❌ Bạn không phải admin!"), message_object, thread_id, thread_type)
                return
                
            if len(parts) >= 3 and parts[2].lower() == 'set':
                if len(parts) < 4:
                    bot.replyMessage(Message(text="❌ Thiếu tên file!"), message_object, thread_id, thread_type)
                    return
                    
                if action in war_config:
                    if set_war_file(action, parts[3]):
                        bot.replyMessage(Message(text=f"✅ Đã đặt file {action} thành {os.path.basename(war_config[action]['file'])}"), 
                                       message_object, thread_id, thread_type)
                    else:
                        bot.replyMessage(Message(text=f"❌ File {parts[3]}.txt không tồn tại!"), 
                                       message_object, thread_id, thread_type)
                else:
                    bot.replyMessage(Message(text="❌ Loại war không hợp lệ!"), message_object, thread_id, thread_type)
                return
                
            if thread_type != ThreadType.GROUP:
                bot.replyMessage(Message(text="❌ Chỉ dùng trong nhóm!"), message_object, thread_id, thread_type)
                return
                
            if not message_object.mentions and action not in ['delay', 'set']:
                bot.replyMessage(Message(text="❌ Vui lòng tag người muốn war!"), message_object, thread_id, thread_type)
                return
                
            count = -1
            if len(parts) > 2 and parts[2].isdigit():
                count = int(parts[2])
                if count < 0:
                    bot.replyMessage(Message(text="❌ Số lần phải ≥ 0!"), message_object, thread_id, thread_type)
                    return
                
            if action == 'reo':
                handle_reo_war(message_object, thread_id, thread_type, author_id, bot, count)
            elif action == 'spam':
                handle_spam_war(message_object, thread_id, thread_type, author_id, bot, count)
            elif action == 'poll':
                handle_poll_war(message_object, thread_id, thread_type, author_id, bot, count)
            elif action == 'todo':
                handle_todo_war(message_object, thread_id, thread_type, author_id, bot, count)
            elif action == 'random':
                handle_random_war(message_object, thread_id, thread_type, author_id, bot, count)
            elif action == 'lv':
                handle_lv_war(message_object, thread_id, thread_type, author_id, bot, count)
            else:
                bot.replyMessage(Message(text=f"❌ Lệnh không hợp lệ!"), message_object, thread_id, thread_type)

        except Exception as e:
            bot.replyMessage(Message(text=f"❌ Lỗi: {str(e)}"), message_object, thread_id, thread_type)

    Thread(target=send_response).start()