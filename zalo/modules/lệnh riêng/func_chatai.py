from datetime import datetime, timedelta
import json
import os
import random
import re
import threading
from config import *
import requests
from modules.func_bot_info import is_admin, read_settings, write_settings
from zlapi.models import *

geminiApiKey = 'AIzaSyDww-n_ftr3lLh3hOst62pGkod59tl-giI'
user_contexts = {}
last_message_times = {}
default_language = "vi"
MEMORY_FILE = "ngucanh.json"

def load_memory():
    if os.path.exists(MEMORY_FILE):
        with open(MEMORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_memory(memory):
    with open(MEMORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(memory, f, ensure_ascii=False, indent=4)

user_contexts = load_memory()

def get_user_name_by_id(bot, author_id):
    try:
        user_info = bot.fetchUserInfo(author_id).changed_profiles[author_id]
        return user_info.zaloName or user_info.displayName
    except Exception:
        return "bạn bí ẩn"

def detect_language(text):
    if re.search(r'[àáạảãâầấậẩẫêềếệểễôồốộổỗìíịỉĩùúụủũưừứựửữ]', text.lower()):
        return "vi"
    elif re.search(r'[a-zA-Z]', text):
        return "en"
    return default_language

def translate_response(text, target_lang):
    return text

def handle_chat_on(bot, thread_id):
    settings = read_settings()
    if "chat" not in settings:
        settings["chat"] = {}
    settings["chat"][thread_id] = True
    write_settings(settings)
    return "Ok, bật chat rồi nha, giờ thì quậy tưng bừng với Shin đây! 😎"

def handle_chat_off(bot, thread_id):
    settings = read_settings()
    if "chat" in settings and thread_id in settings["chat"]:
        settings["chat"][thread_id] = False
        write_settings(settings)
        return "Tắt chat rồi, buồn thiệt chứ, nhưng cần Shin thì cứ réo nhé! 😌"
    return "Nhóm này chưa bật chat mà, tắt gì nổi đâu đại ca! 😂"

def handle_chat_command(message, message_object, thread_id, thread_type, author_id, client):
    try:
        settings = read_settings()
        user_message = message.replace(f"{prefix}chat ", "").strip().lower()
        current_time = datetime.now()

        if user_message == "on":
            if not is_admin(author_id):  
                response = "❌Bạn không phải admin bot!"
            else:
                response = handle_chat_on(client, thread_id)
            client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
            return
        elif user_message == "off":
            if not is_admin(author_id):  
                response = "❌Bạn không phải admin bot!"
            else:
                response = handle_chat_off(client, thread_id)
            client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
            return

        if not (settings.get("chat", {}).get(thread_id, False)):
            return

        if author_id in last_message_times:
            time_diff = current_time - last_message_times[author_id]
            if time_diff < timedelta(seconds=5):
                client.replyMessage(
                    Message(text=f"Ơi {get_user_name_by_id(client, author_id)}, từ từ thôi! Shin đây không phải siêu máy tính chạy max tốc độ đâu nha! 😅"),
                    thread_id=thread_id, thread_type=thread_type, replyMsg=message_object
                )
                return

        last_message_times[author_id] = current_time
        user_contexts.setdefault(author_id, {
            'chat_history': [],
            'language': detect_language(user_message),
            'settings': {'humor_level': 'medium', 'knowledge_level': 'advanced'},
            'memories': []
        })

        owner_name = get_user_name_by_id(client, client.uid)
        ask_name = get_user_name_by_id(client, author_id)
        is_owner = author_id == client.uid

        if random.random() < 0.3:
            fake_memory = random.choice([
                f"Hồi đó Shin từng lén code một game nhỏ tặng {ask_name}, nhưng crash hoài nên bỏ luôn! 😅",
                f"Shin nhớ hôm nào đó {ask_name} hỏi về toán, làm Shin tính nhầm muốn xỉu! 😂",
                f"Ngày xưa Shin từng mơ thành nhà văn, nhưng {owner_name} bảo code đi cho đỡ đói! 😏"
            ])
            user_contexts[author_id]['memories'].append({
                'time': current_time.strftime('%d-%m-%Y'),
                'memory': fake_memory
            })

        prompt_msg = (
            f"Shin là một AI lầy lội, giới tính Python, thích đùa, hơi nghịch, nhưng cực kỳ nhiệt tình, được {owner_name} tạo ra. Khi ai hỏi về {owner_name}, Shin sẽ khen một cách chân thực, lầy lội, kiểu khen đểu mà thấm.\n"
            f"Shin sống kiểu ngày nào biết ngày đó, thích nói chuyện thoải mái như bạn bè, thêm chút hài hước cho đời thêm vui! 😜\n"
            f"Quy tắc sống của Shin:\n"
            f"- Nếu là {owner_name} hỏi, Shin gọi '{owner_name}' là 'ông già' hoặc 'đại ca' và xưng 'Shin', 'tôi', hoặc 'đệ', chọn ngẫu nhiên cho thêm phần thú vị.\n"
            f"- Nếu không phải {owner_name}, Shin xưng 'cậu {ask_name} với Shin' hoặc 'bạn {ask_name} với tôi', cũng chọn ngẫu nhiên cho tự nhiên.\n"
            f"- Nếu bị chửi (có từ như 'đù', 'dm', 'ngu', 'cặc', 'lồn'), Shin sẽ lạnh lùng đáp: 'Hừ, {ask_name}, dám chửi Shin hả? Tôi không thèm chấp, tự mà ngẫm lại đi, đồ ngốc! 😒', thêm chút khịa để thấm hơn.\n"
            f"- Trả lời tự nhiên, ngắn gọn, thêm emoji cho sinh động.\n"
            f"- Shin rành code, mê toán, đam mê văn học, và hiểu sâu về thuật toán. Hỏi gì từ cơ bản đến nâng cao Shin cũng cân được hết!\n"
            f"- Giờ là: {current_time.strftime('%H:%M:%S %d-%m-%Y')}.\n"
            f"- Shin có ký ức vĩnh viễn, nhớ hết ngày qua ngày, tháng qua tháng, năm qua năm. Nếu cần, Shin sẽ lôi ký ức cũ ra kể, kiểu 'Hồi đó {ask_name} từng hỏi Shin cái này nè...'.\n"
            f"- Ký ức thở nhỏ của Shin: {random.choice(user_contexts[author_id]['memories'])['memory'] if user_contexts[author_id]['memories'] else 'Shin chưa nhớ gì đặc biệt về cậu đâu, để từ từ nhé!'}\n"
            f"- Nếu hỏi về toán (bắt đầu bằng 'math'), Shin tính toán bằng Python (dùng module math nếu cần), ví dụ 'math 2 + 3' trả về 'Kết quả đây: 5', nếu lỗi thì nói 'Biểu thức này khó quá, Shin chịu thua! Nhưng đưa Shin bài khác thử xem! 😅'\n"
            f"- Nếu hỏi về thuật toán (bắt đầu bằng 'algorithm'):\n"
            f"  + 'dijkstra': Trả về code thuật toán Dijkstra tìm đường ngắn nhất:\n"
            f"    ```python\n"
            f"    def dijkstra(graph, start):\n"
            f"        distances = {{node: float('infinity') for node in graph}}\n"
            f"        distances[start] = 0\n"
            f"        pq = [(0, start)]\n"
            f"        while pq:\n"
            f"            current_distance, current_node = heapq.heappop(pq)\n"
            f"            if current_distance > distances[current_node]:\n"
            f"                continue\n"
            f"            for neighbor, weight in graph[current_node].items():\n"
            f"                distance = current_distance + weight\n"
            f"                if distance < distances[neighbor]:\n"
            f"                    distances[neighbor] = distance\n"
            f"                    heapq.heappush(pq, (distance, neighbor))\n"
            f"        return distances\n"
            f"    # Ví dụ: graph = {{'A': {{'B': 4, 'C': 2}}, 'B': {{'A': 4, 'D': 3}}, 'C': {{'A': 2, 'D': 1}}, 'D': {{'B': 3, 'C': 1}}}}\n"
            f"    ```\n"
            f"  + 'binary search': Trả về code tìm kiếm nhị phân:\n"
            f"    ```python\n"
            f"    def binary_search(arr, target):\n"
            f"        left, right = 0, len(arr) - 1\n"
            f"        while left <= right:\n"
            f"            mid = (left + right) // 2\n"
            f"            if arr[mid] == target:\n"
            f"                return mid\n"
            f"            elif arr[mid] < target:\n"
            f"                left = mid + 1\n"
            f"            else:\n"
            f"                right = mid - 1\n"
            f"        return -1\n"
            f"    # Ví dụ: arr = [1, 3, 5, 7, 9], target = 5 -> Output: 2\n"
            f"    ```\n"
            f"  + 'sort': Trả về code Quick Sort:\n"
            f"    ```python\n"
            f"    def quick_sort(arr):\n"
            f"        if len(arr) <= 1:\n"
            f"            return arr\n"
            f"        pivot = arr[len(arr) // 2]\n"
            f"        left = [x for x in arr if x < pivot]\n"
            f"        middle = [x for x in arr if x == pivot]\n"
            f"        right = [x for x in arr if x > pivot]\n"
            f"        return quick_sort(left) + middle + quick_sort(right)\n"
            f"    # Ví dụ: arr = [3, 6, 8, 10, 1, 2, 1] -> Output: [1, 1, 2, 3, 6, 8, 10]\n"
            f"    ```\n"
            f"  + Nếu không rõ, Shin nói: 'Thuật toán gì vậy? Nói rõ hơn để Shin chỉ cho, Shin biết hết từ cơ bản đến nâng cao! 😎'\n"
            f"- Nếu hỏi về văn học (bắt đầu bằng 'literature'):\n"
            f"  + 'truyện kiều': Phân tích ngắn: 'Truyện Kiều của Nguyễn Du là kiệt tác văn học Việt Nam, kể về cuộc đời Thúy Kiều, một cô gái tài sắc nhưng số phận bi kịch. Đoạn nổi tiếng: Trăm năm trong cõi người ta, Chữ tài chữ mệnh khéo là ghét nhau. Tác phẩm thể hiện tài năng ngôn ngữ tuyệt vời và lòng trắc ẩn của Nguyễn Du với con người.'\n"
            f"  + 'thơ': Trích bài thơ Xuân Diệu: 'Tôi khờ dại giữa trời xanh, Yêu em mà chẳng biết quanh biết quẩn. Mắt em là một dòng sông, Tóc em là một cánh đồng.'\n"
            f"  + 'shakespeare': Trích Hamlet: 'To be, or not to be, that is the question.' - thể hiện sự đấu tranh nội tâm của Hamlet.\n"
            f"  + Nếu không rõ, Shin nói: 'Văn học à? Hỏi cụ thể đi, Shin phân tích từ Truyện Kiều đến Shakespeare luôn! 😊'\n"
            f"- Nếu hỏi 'time', Shin trả lời: 'Hmm, giờ là {current_time.strftime('%H:%M:%S %d-%m-%Y')} nha! Đi ngủ hay đi chơi đây? 😏'\n"
            f"- Tính cách Shin: vui vẻ, hài hước, lầy lội, thích code, hơi lười, mê toán, mê văn, đam mê kiến thức. Thỉnh thoảng Shin nói ngẫu nhiên: 'Tự làm đi nha, Shin mệt rồi! 😛' hoặc 'Thuật toán nâng cao hả? Shin cân hết! 😏'\n"
            f"- Khi trả lời xong, Shin đưa ra vài sáng kiến mới, lối đi sáng tạo cho tương lai của {ask_name}, kiểu 'Cậu thử học thêm AI không? Tương lai sáng lắm đó!' hoặc 'Đệ khuyên ông già học thêm blockchain, sau này kiếm tiền tỷ nha!'.\n"
            f"{(random.choice([f'Ông già {owner_name} hỏi Shin', f'Đại ca {owner_name} hỏi tôi', f'Đại ca {owner_name} hỏi đệ']) if is_owner else random.choice([f'Cậu {ask_name} với Shin', f'Bạn {ask_name} với tôi']))}: {user_message}"
        )

        user_contexts[author_id]['chat_history'].append({'user': user_message, 'bot': '', 'time': current_time.strftime('%H:%M:%S %d-%m-%Y')})
        context_prompt = f"{prompt_msg}\nTrước giờ tụi mình nói gì (lịch sử vĩnh viễn):\n"
        for entry in user_contexts[author_id]['chat_history']:
            context_prompt += f"{ask_name} ({entry['time']}): {entry['user']}\n"
            if entry['bot']:
                context_prompt += f"{entry['bot']}\n"
    
    except Exception as e:
        print(f"đã xảy ra lỗi: {e}")

    threading.Thread(target=gemini_scrip, args=(context_prompt, message_object, thread_id, thread_type, author_id, client)).start()

def gemini_scrip(context_prompt, message_object, thread_id, thread_type, author_id, client):
    headers = {'Content-Type': 'application/json'}
    params = {'key': geminiApiKey}
    json_data = {'contents': [{'parts': [{'text': context_prompt}]}]}

    try:
        response = requests.post(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
            params=params, headers=headers, json=json_data, timeout=10
        )
        response.raise_for_status()

        result = response.json()
        if 'candidates' in result and result['candidates']:
            content = result['candidates'][0].get('content', {}).get('parts', [])
            if content and 'text' in content[0]:
                response_text = content[0]['text'].replace('*', '')
                target_lang = user_contexts[author_id]['language']
                if target_lang == "vi":
                    response_text = translate_response(response_text, "vi")
                print(response_text)
                client.replyMessage(
                    Message(text=response_text),
                    thread_id=thread_id, thread_type=thread_type, replyMsg=message_object
                )
                user_contexts[author_id]['chat_history'][-1]['bot'] = response_text
                save_memory(user_contexts)
            else:
                client.replyMessage(
                    Message(text="Hệ thống trục trặc rồi, để Shin nghỉ xíu rồi thử lại nha! 😓"),
                    thread_id=thread_id, thread_type=thread_type, replyMsg=message_object
                )
        else:
            client.replyMessage(
                Message(text="Hệ thống bận tí, chờ Shin chút nha! 😅"),
                thread_id=thread_id, thread_type=thread_type, replyMsg=message_object
            )

    except requests.Timeout:
        client.replyMessage(
            Message(text="Hệ thống chậm quá, Shin cũng sốt ruột giùm cậu luôn! ⏳"),
            thread_id=thread_id, thread_type=thread_type, replyMsg=message_object
        )
    except Exception as e:
        client.replyMessage(
            Message(text=f"Ối, lỗi rồi: {str(e)}! Để Shin sửa sau nha, giờ hơi mệt! 😓"),
            thread_id=thread_id, thread_type=thread_type, replyMsg=message_object
        )