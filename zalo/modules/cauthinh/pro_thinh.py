import random
import threading
import requests
from datetime import datetime, timedelta
from core.bot_sys import is_admin, read_settings, write_settings
from zlapi.models import Message, Mention

geminiApiKey = 'AIzaSyDww-n_ftr3lLh3hOst62pGkod59tl-giI'
user_contexts = {}
last_message_times = {}

THA_THINH_MAU = {
    "Nguyên": "Anh như nguyên tố quý, chỉ cần Nguyên để trái tim anh trọn vẹn.",
    "Tâm": "Anh là đường tròn hoàn hảo, vì có Tâm là trung tâm của trái tim anh.",
    "Hương": "Trái tim anh như cánh đồng, chỉ cần Hương là đủ để thơm ngát cả đời.",
    "Anh": "Siêu anh hùng chỉ trong phim, còn siêu yêu Anh chỉ trong tim em đây.",
    "Duyên": "Anh là sợi dây đỏ, chỉ cần Duyên là đủ để buộc tim anh mãi mãi.",
    "Mai": "Trái tim anh là mùa đông lạnh, chỉ cần Mai là đủ để xuân về rực rỡ.",
    "Lan": "Anh là khu vườn trống, chỉ cần Lan là đủ để tim anh ngập tràn hoa.",
    "Thu": "Mùa thu gió nhẹ thoảng qua, nhưng tim anh chỉ đắm say mỗi Thu thôi.",
    "Bảo": "Trái tim anh là kho báu, và Bảo là viên ngọc quý nhất anh tìm thấy.",
    "Hạnh": "Anh là bầu trời u ám, chỉ cần Hạnh là đủ để tim anh rạng ngời hạnh phúc.",
    "Linh": "Trái tim anh là cỗ máy, chỉ có Linh mới làm nó rung lên từng nhịp.",
    "My": "Anh là cuốn sách trắng, chỉ cần My là đủ để viết nên chuyện tình đẹp.",
    "Kiều": "Trái tim anh là bức tranh, chỉ cần Kiều là nét vẽ hoàn mỹ cuối cùng.",
    "Diễm": "Anh là ngọn lửa nhỏ, chỉ cần Diễm là đủ để tim anh bùng cháy yêu thương.",
    "Vân": "Trái tim anh là bầu trời, chỉ có Vân mới làm nó nhẹ nhàng trôi mãi.",
    "Thảo": "Anh là cánh đồng khô, chỉ cần Thảo là đủ để tim anh xanh mát tình yêu.",
    "Tú": "Trái tim anh là đêm tối, chỉ cần Tú là ngôi sao sáng nhất anh ngắm hoài.",
    "Cẩm": "Anh là tấm vải thô, chỉ cần Cẩm là đủ để tim anh hóa lụa yêu thương.",
    "Ngọc": "Trái tim anh là vỏ sò, chỉ cần Ngọc là viên ngọc sáng nhất bên trong.",
    "Lệ": "Anh là bầu trời khô hạn, chỉ cần Lệ là giọt sương làm tim anh đắm say.",
    "Thuý": "Trái tim anh là mùa hè nóng, chỉ cần Thuý là đủ để mát lành tình yêu.",
    "Quỳnh": "Anh là đêm đen tĩnh lặng, chỉ cần Quỳnh là hoa nở rực rỡ trong tim.",
    "Hải": "Trái tim anh là bờ cát, chỉ cần Hải là sóng cuốn anh vào biển tình.",
    "Bích": "Anh là viên đá thô, chỉ cần Bích là đủ để tim anh hóa ngọc quý.",
    "Hoa": "Trái tim anh là đất khô, chỉ cần Hoa là đủ để nở rộ tình yêu bất tận.",
    "Thùy": "Anh là bến sông vắng, chỉ cần Thùy là sóng vỗ mãi trong tim anh.",
    "Nhung": "Trái tim anh là mùa đông lạnh, chỉ cần Nhung là đủ để ấm áp yêu thương.",
    "Ngân": "Anh là bản nhạc trầm, chỉ cần Ngân là nốt cao làm tim anh rung động.",
    "Shin": "Trái tim anh là bóng tối, chỉ cần Shin là ánh sáng làm anh mê đắm.",
    "Thủy": "Anh là sa mạc khô cằn, chỉ cần Thủy là dòng suối làm tim anh hồi sinh."
}

def generate_tha_thinh(ten):
    ten = ten.capitalize()
    if ten in THA_THINH_MAU:
        return THA_THINH_MAU[ten]
    else:
        templates = [
            f"Anh là bài toán khó, chỉ cần {ten} là đáp án làm tim anh sáng tỏ.",
            f"Trái tim anh là cánh cửa, chỉ có {ten} mới là chìa khóa mở ra tình yêu.",
            f"Anh là bầu trời đêm, chỉ cần {ten} là ngôi sao làm tim anh lung linh.",
            f"Trái tim anh như sa mạc, chỉ có {ten} mới là cơn mưa làm anh hồi sinh.",
            f"Anh là ngọn lửa nhỏ, chỉ cần {ten} là đủ để tim anh cháy mãi không ngừng.",
            f"Trái tim anh là câu đố, chỉ có {ten} mới giải được bằng tình yêu."
        ]
        return random.choice(templates)

def get_user_name_by_id(bot, author_id):
    try:
        user_info = bot.fetchUserInfo(author_id).changed_profiles[author_id]
        return user_info.zaloName or user_info.displayName
    except Exception:
        return "Unknown User"

def gemini_scrip(context_prompt, message_object, thread_id, thread_type, author_id, client):
    headers = {'Content-Type': 'application/json'}
    params = {'key': geminiApiKey}
    json_data = {'contents': [{'parts': [{'text': context_prompt}]}]}

    try:
        response = requests.post(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
            params=params, headers=headers, json=json_data
        )
        response.raise_for_status()

        result = response.json()
        if 'candidates' in result and len(result['candidates']) > 0:
            candidate = result['candidates'][0]
            content = candidate.get('content', {}).get('parts', [])
            if content and 'text' in content[0]:
                response_text = content[0]['text'].replace('*', '')
                if "tên trường" in response_text.lower() or not response_text.strip():
                    response_text = generate_tha_thinh(message_object.text.split()[-1])
                client.replyMessage(
                    Message(text=response_text),
                    thread_id=thread_id, thread_type=thread_type, replyMsg=message_object
                )
                if author_id not in user_contexts:
                    user_contexts[author_id] = {'chat_history': []}
                user_contexts[author_id]['chat_history'][-1]['bot'] = response_text
                return
        tha_thinh_message = generate_tha_thinh(message_object.text.split()[-1])
        client.replyMessage(
            Message(text=tha_thinh_message),
            thread_id=thread_id, thread_type=thread_type, replyMsg=message_object
        )
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        tha_thinh_message = generate_tha_thinh(message_object.text.split()[-1])
        client.replyMessage(
            Message(text=tha_thinh_message),
            thread_id=thread_id, thread_type=thread_type, replyMsg=message_object
        )

def handle_love_on(bot, thread_id):
    settings = read_settings(bot.uid)
    if "love" not in settings:
        settings["love"] = {}
    settings["love"][thread_id] = True
    write_settings(bot.uid, settings)
    return f"🚦Lệnh {bot.prefix}love đã được Bật 🚀 trong nhóm này ✅"

def handle_love_off(bot, thread_id):
    settings = read_settings(bot.uid)
    if "love" in settings and thread_id in settings["love"]:
        settings["love"][thread_id] = False
        write_settings(bot.uid, settings)
        return f"🚦Lệnh {bot.prefix}love đã Tắt ⭕️ trong nhóm này ✅"
    return "🚦Nhóm chưa có thông tin cấu hình love để ⭕️ Tắt 🤗"

def handle_tha_thinh_command(message, message_object, thread_id, thread_type, author_id, client):
    try:
        settings = read_settings(client.uid)
    
        user_message = message.replace(f"{client.prefix}love ", "").strip().lower()
        if user_message == "on":
            if not is_admin(client, author_id):  
                    response = "❌Bạn không phải admin bot!"
            else:
                response = handle_love_on(client, thread_id)
            client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
            return
        elif user_message == "off":
            if not is_admin(client, author_id):  
                response = "❌Bạn không phải admin bot!"
            else:
                response = handle_love_off(client, thread_id)
            client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
            return
        
        if not (settings.get("love", {}).get(thread_id, False)):
            return
        parts = user_message.split()
        if len(parts) != 1:
            client.send(
                Message(text="Vui lòng chỉ nhập tên 1 chữ để thả thính. Ví dụ: 'love Shin' hoặc 'love Thủy'"),
                thread_id=thread_id,
                thread_type=thread_type,
                ttl=15000
            )
            return

        ten = parts[0].strip()
        if ' ' in ten or not ten.isalpha():
            client.send(
                Message(text="Tên phải là 1 chữ cái duy nhất"),
                thread_id=thread_id,
                thread_type=thread_type,
                ttl=15000
            )
            return

        tha_thinh_message = generate_tha_thinh(ten)
        mention_text = f"@{ten}"
        mention = Mention(author_id, length=len(mention_text), offset=0)
        user_message = f"{mention_text}, {tha_thinh_message}"

        current_time = datetime.now()
        if author_id in last_message_times:
            time_diff = current_time - last_message_times[author_id]
            if time_diff < timedelta(seconds=5):
                client.send(
                    Message(text="Vui lòng chờ 5 giây trước khi thả thính tiếp!"),
                    thread_id=thread_id,
                    thread_type=thread_type,
                    ttl=15000
                )
                return

        last_message_times[author_id] = current_time

        if author_id not in user_contexts:
            user_contexts[author_id] = {'chat_history': []}
        user_contexts[author_id]['chat_history'].append({'user': user_message, 'bot': ''})

        context_prompt = (
            f"Tạo một câu thả thính ngắn gọn, sáng tạo, logic và mang tính tỏ tình, liên quan trực tiếp đến tên {ten}. "
            f"Câu phải dùng tên {ten} để tạo sự gắn kết, không lạc đề, không triết lý, chỉ tập trung vào thả thính/tỏ tình. "
            f"Ví dụ: 'Anh là đường tròn hoàn hảo, vì có Tâm là trung tâm của trái tim anh' hoặc "
            f"'Trái tim anh là cánh cửa, chỉ có Duyên mới là chìa khóa mở ra tình yêu'. "
            f"Tạo câu thả thính cho {ten} theo phong cách này, không yêu cầu thêm thông tin như 'tên trường' hay bất kỳ dữ liệu nào khác, "
            f"chỉ dùng tên {ten} là đủ, không dài dòng."
        )

        threading.Thread(target=gemini_scrip, args=(context_prompt, message_object, thread_id, thread_type, author_id, client)).start()

    except Exception as e:
        print(f"Lỗi khi xử lý lệnh thả thính: {str(e)}")
        tha_thinh_message = generate_tha_thinh(user_message)
        client.send(
            Message(text=f"@{user_message}, {tha_thinh_message}"),
            thread_id=thread_id,
            thread_type=thread_type,
            ttl=15000
        )