from datetime import datetime
import json
import os
import random
from threading import Thread
import time
import requests
from modules.func_bot_info import is_admin, read_settings, write_settings
from config import *
from zlapi.models import *
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO

def create_gradient_colors(num_colors):
    return [(random.randint(100, 175), random.randint(100, 180), random.randint(100, 170)) for _ in range(num_colors)]

def interpolate_colors(colors, text_length, change_every):
    gradient = []
    num_segments = len(colors) - 1
    steps_per_segment = (text_length // change_every) + 1
    for i in range(num_segments):
        for j in range(steps_per_segment):
            if len(gradient) < text_length:
                ratio = j / steps_per_segment
                interpolated_color = (
                    int(colors[i][0] * (1 - ratio) + colors[i + 1][0] * ratio),
                    int(colors[i][1] * (1 - ratio) + colors[i + 1][1] * ratio),
                    int(colors[i][2] * (1 - ratio) + colors[i + 1][2] * ratio)
                )
                gradient.append(interpolated_color)
    while len(gradient) < text_length:
        gradient.append(colors[-1])
    return gradient[:text_length]

def get_user_name_by_id(bot, author_id):
    try:
        user_info = bot.fetchUserInfo(author_id).changed_profiles[author_id]
        return user_info.zaloName or user_info.displayName
    except Exception as e:
        return "Unknown User"

def create_menu_image(command_names, bot, author_id):
    avatar_url = None

    if author_id:
        user_info = bot.fetchUserInfo(author_id)
        avatar_url = user_info.changed_profiles.get(author_id).avatar

    current_page_commands = list(command_names.items())

    numbered_commands = [f"{name} - {desc}" for i, (name, desc) in enumerate(current_page_commands)]

    menu_message = (
        f"{get_user_name_by_id(bot, author_id)}\n"
        + "\n".join(numbered_commands)
    )
    background_dir = "background"
    background_files = [os.path.join(background_dir, f) for f in os.listdir(background_dir) if f.endswith(('.png', '.jpg'))]
    background_path = random.choice(background_files)
    image = Image.open(background_path).convert("RGBA")
    image = image.resize((1280, 500))

    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    rect_x0 = (1280 - 1100) // 2
    rect_y0 = (500 - 300) // 2
    rect_x1 = rect_x0 + 1100
    rect_y1 = rect_y0 + 300

    radius = 50
    draw.rounded_rectangle([rect_x0, rect_y0, rect_x1, rect_y1], radius=radius, fill=(255, 255, 255, 200))
    overlay = Image.alpha_composite(image, overlay)
    if avatar_url:
        try:
            avatar_response = requests.get(avatar_url)
            avatar_image = Image.open(BytesIO(avatar_response.content)).convert("RGBA").resize((100, 100))

            gradient_size = 110
            gradient_colors = create_gradient_colors(7)
            gradient_overlay = Image.new("RGBA", (gradient_size, gradient_size), (0, 0, 0, 0))
            gradient_draw = ImageDraw.Draw(gradient_overlay)

            for i, color in enumerate(gradient_colors):
                radius = gradient_size // 2 - i
                gradient_draw.ellipse(
                    (i, i, gradient_size - i, gradient_size - i),
                    outline=color,
                    width=1
                )

            mask = Image.new("L", avatar_image.size, 0)
            ImageDraw.Draw(mask).ellipse((0, 0, 100, 100), fill=255)
            gradient_overlay.paste(avatar_image, (5, 5), mask)

            overlay.paste(gradient_overlay, (rect_x0 + 20, rect_y0 + 100), gradient_overlay)
        except Exception:
            pass

    text_hi = f"Hi {user_info.changed_profiles[author_id].displayName}!" if author_id in user_info.changed_profiles else "Hi Người dùng!"
    text_welcome = f"🎊 Chào {user_info.changed_profiles[author_id].displayName}, Tôi có thể giúp gì cho bạn?"
    text_bot_info = f"🤖 Bot: {get_user_name_by_id(bot, bot.uid)} 💻 version 1.0.0 🗓️ update 08-01-24"
    text_bot_ready = f"♥️ bot sẵn sàng phục vụ"
    font_paci = "kai.ttf"
    font_emoji = "NotoEmoji-Bold.ttf"
    draw = ImageDraw.Draw(overlay)

    font_hi = ImageFont.truetype(font_paci, size=50) if os.path.exists(font_paci) else ImageFont.load_default()
    font_welcome = ImageFont.truetype(font_paci, size=35) if os.path.exists(font_paci) else ImageFont.load_default()
    font_bot_info = ImageFont.truetype(font_emoji, size=25) if os.path.exists(font_emoji) else ImageFont.load_default()

    x_hi = (1300 - draw.textbbox((0, 0), text_hi, font=font_hi)[2]) // 2
    y_hi = rect_y0 + 10

    gradient_colors_hi = interpolate_colors(create_gradient_colors(5), len(text_hi), 1)
    for i, char in enumerate(text_hi):
        draw.text((x_hi, y_hi), char, font=font_hi, fill=gradient_colors_hi[i])
        x_hi += draw.textbbox((0, 0), char, font=font_hi)[2]

    x_welcome = (1300 - draw.textbbox((0, 0), text_welcome, font=font_welcome)[2]) // 2
    y_welcome = y_hi + 60

    gradient_colors_welcome = interpolate_colors(create_gradient_colors(5), len(text_welcome), 1)
    for i, char in enumerate(text_welcome):
        draw.text((x_welcome, y_welcome), char, font=font_welcome, fill=gradient_colors_welcome[i])
        x_welcome += draw.textbbox((0, 0), char, font=font_welcome)[2]

    x_bot_info = rect_x0 + 130
    y_bot_info = rect_y1 - 60

    gradient_colors_bot_info = interpolate_colors(create_gradient_colors(7), len(text_bot_info), 1)
    current_x = x_bot_info

    for i, char in enumerate(text_bot_info):
        if char in "🤖💻🗓️🎊 ":
            current_font = font_bot_info
        else:
            current_font = font_welcome

        draw.text((current_x, y_bot_info), char, font=current_font, fill=gradient_colors_bot_info[i])
        char_width = draw.textbbox((0, 0), char, font=current_font)[2]
        current_x += char_width

    y_bot_ready = y_bot_info - 80
    gradient_colors_bot_ready = interpolate_colors(create_gradient_colors(5), len(text_bot_ready), 1)
    current_x_bot_ready = (1300 - draw.textbbox((0, 0), text_bot_ready, font=font_welcome)[2]) // 2

    for i, char in enumerate(text_bot_ready):
        if char in "♥️:3🤗🎉🎊 ":
            current_font = font_bot_info
        else:
            current_font = font_welcome
        draw.text((current_x_bot_ready, y_bot_ready), char, font=current_font, fill=gradient_colors_bot_ready[i])
        current_x_bot_ready += draw.textbbox((0, 0), char, font=current_font)[2]

    overlay = Image.alpha_composite(image, overlay)
    temp_image_path = "temp_image.png"
    overlay.save(temp_image_path)

    return temp_image_path, menu_message

timeLimit = 300

game_sessions = {}

attendance_file = 'modules/dhbc/attendance.json'

def read_json(file):
    try:
        if os.path.exists(file):
            with open(file, 'r', encoding='utf-8') as f:
                return json.load(f)
        else:
            print(f"[WARNING] File không tồn tại: {file}")
            return {}
    except json.JSONDecodeError as e:
        print(f"[ERROR] Lỗi khi đọc file JSON: {file}, Chi tiết: {e}")
        return {}
    
def write_json(file, data):
    try:
        with open(file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"[ERROR] Lỗi khi ghi dữ liệu vào file {file}: {e}")

def save_score(user_id, score):
    leaderboard = read_json('modules/dhbc/scoreboard.json')
    leaderboard[user_id] = leaderboard.get(user_id, 0) + score
    write_json('modules/dhbc/scoreboard.json', leaderboard)

def handle_attendance(user_id, client, thread_id, thread_type):
    today = datetime.today().strftime('%Y-%m-%d')
    attendance_data = read_json(attendance_file)
    
    # Kiểm tra nếu người chơi đã điểm danh hôm nay chưa
    if str(user_id) in attendance_data and attendance_data[str(user_id)] == today:
        client.sendMessage(
            Message(text="⚠️ Bạn đã điểm danh hôm nay rồi. Bạn chỉ có thể điểm danh một lần trong ngày."),
            thread_id=thread_id,
            thread_type=thread_type,
        )
        return
    attendance_data[str(user_id)] = today
    write_json(attendance_file, attendance_data)
    save_score(user_id, 100)
    client.sendMessage(
        Message(text="🎉 Chúc mừng bạn đã điểm danh thành công và nhận 100 điểm!"),
        thread_id=thread_id,
        thread_type=thread_type,
    )
def get_current_top_and_score(user_id):
    leaderboard = read_json('modules/dhbc/scoreboard.json')
    user_score = leaderboard.get(str(user_id), 0)
    sorted_leaderboard = sorted(leaderboard.items(), key=lambda x: x[1], reverse=True)
    position = next((i + 1 for i, (uid, _) in enumerate(sorted_leaderboard) if uid == str(user_id)), None)
    return position, user_score
def get_image_dimensions(url, headers):
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        image = Image.open(BytesIO(response.content))
        image.verify()
        return image.size
    except requests.exceptions.RequestException as req_error:
        return None
    except Exception as e:
        return None

asked_questions = set()
def send_next_question(thread_id, thread_type, client):
    try:
        if thread_id in game_sessions:
            session = game_sessions[thread_id]
            for msg_id, data in session.items():
                if time.time() - data['timestamp'] > timeLimit:
                    del game_sessions[thread_id][msg_id]
                    client.sendMessage(
                        Message(text="⏰ Bạn đã hết thời gian trả lời câu hỏi cũ. Câu hỏi mới sẽ được gửi."),
                        thread_id=thread_id,
                        thread_type=thread_type,
                    )
                    break  
            if game_sessions[thread_id]:
                client.sendMessage(
                    Message(text="⚠️ Bạn vẫn còn một câu hỏi chưa trả lời. Hãy trả lời câu hỏi đó trước khi bắt đầu câu hỏi mới."),
                    thread_id=thread_id,
                    thread_type=thread_type,
                )
                return

        data = read_json('modules/dhbc/data.json')
        if not data or 'doanhinh' not in data or not data['doanhinh']:
            raise ValueError("Dữ liệu câu hỏi không hợp lệ hoặc trống.")

        available_questions = [
            question for question in data['doanhinh']
            if question['tukhoa'] not in asked_questions and 'link' in question
        ]
        if not available_questions:
            client.sendMessage(
                Message(text="❌ Không còn câu hỏi mới nào. Vui lòng nạp thêm câu hỏi!"),
                thread_id=thread_id,
                thread_type=thread_type,
            )
            return

        question = random.choice(available_questions)
        asked_questions.add(question['tukhoa'])

        headers = {'User-Agent': 'Mozilla/5.0'}
        image_path = 'modules/dhbc/cache/next_question.png'
        print(f"[DEBUG] Đang tải ảnh từ: {question['link']}")
        image_response = requests.get(question['link'], headers=headers, timeout=10)
        image_response.raise_for_status()
        with open(image_path, 'wb') as f:
            f.write(image_response.content)

        width, height = get_image_dimensions(question['link'], headers)
        if not width or not height:
            raise ValueError("Kích thước ảnh không xác định.")

        hint = f"Từ này có {question['sokitu']} ký tự.\n"
        if 'suggestions' in question:
            hint += f"Gợi ý: {' '.join(question['suggestions'])}"

        message_to_send = Message(
            text=f"Vui lòng trả lời câu hỏi dưới đây\n{hint}\n⏰ Bạn có {timeLimit}s = 5 phút để trả lời"
        )
        sent_message = client.sendLocalImage(
            image_path,
            message=message_to_send,
            thread_id=thread_id,
            thread_type=thread_type,
            width=width,
            height=height,
        )
        print(f"[DEBUG] Tin nhắn đã được gửi: {sent_message}")

        game_sessions[thread_id] = {
            sent_message.msgId: {
                "tukhoa": question['tukhoa'],
                "timestamp": time.time(),
            }
        }
    except KeyError as e:
        print(f"[ERROR] Lỗi thiếu trường trong dữ liệu: {e}")
        client.sendMessage(
            Message(text=f"Đã xảy ra lỗi: Thiếu trường {e} trong dữ liệu câu hỏi"),
            thread_id=thread_id,
            thread_type=thread_type,
        )
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] Lỗi khi tải ảnh: {e}")
        client.sendMessage(
            Message(text=f"Đã xảy ra lỗi khi tải ảnh: {e}"),
            thread_id=thread_id,
            thread_type=thread_type,
        )
    except ValueError as e:
        print(f"[ERROR] Lỗi dữ liệu câu hỏi: {e}")
        client.sendMessage(
            Message(text=f"Đã xảy ra lỗi: {e}"),
            thread_id=thread_id,
            thread_type=thread_type,
        )
    except Exception as e:
        print(f"[ERROR] Lỗi không mong muốn: {type(e).__name__} - {e}")
        client.sendMessage(
            Message(text=f"Đã xảy ra lỗi không mong muốn: {e}"),
            thread_id=thread_id,
            thread_type=thread_type,
        )

def get_user_name_by_id(bot, author_id):
    try:
        user_info = bot.fetchUserInfo(author_id).changed_profiles[author_id]
        return user_info.zaloName or user_info.displayName
    except Exception:
        return "Unknown User"

def handle_answer(message, thread_id, thread_type, user_id, client, is_correct, is_quitting=False):
    try:
        position, user_score = get_current_top_and_score(user_id)
        user = get_user_name_by_id(client, user_id)
        if isinstance(message, dict) and 'tukhoa' in message:
            correct_answer = message['tukhoa']
        else:
            if thread_id in game_sessions:
                session = game_sessions[thread_id]
                for msg_id, data in session.items():
                    correct_answer = data["tukhoa"]
                    break
            else:
                correct_answer = None

        if is_quitting:
            save_score(user_id, -5)
            response_message = f"❌ {user} đã đầu hàng!\n{user} bị trừ [20] điểm khi đầu hàng\nTổng điểm: {user_score - 20}\nTop: {position} trong bảng xếp hạng.\nBạn sẽ bị trừ 5 điểm khi không trả lời."
        elif is_correct:
            save_score(user_id, 10)
            response_message = f"🎉 Chúc mừng {user} đã trả lời đúng!\n{user} được cộng [10] điểm khi trả lời đúng\nTổng điểm: {user_score + 10}\nTop: {position} trong bảng xếp hạng."
        else:
            save_score(user_id, -5)
            response_message = f"❌ Rất tiếc {user} đã trả lời sai.\n{user} bị trừ [5] điểm khi trả lời sai\nTổng điểm: {user_score - 5}\nTop: {position} trong bảng xếp hạng."

        # Thêm bảng xếp hạng vào thông báo
        leaderboard_message = get_leaderboard(client)  # Lấy bảng xếp hạng
        response_message += f"\n=============================\n{leaderboard_message}"

        mention = Mention(uid=user_id, length=len(user), offset=response_message.index(user))
        client.send(
            Message(text=response_message, mention=mention),
            thread_id=thread_id,
            thread_type=thread_type,
        )

        # Nếu trả lời đúng, gửi câu hỏi tiếp theo
        if is_correct and not is_quitting:
            if thread_id in game_sessions:
                del game_sessions[thread_id]
            send_next_question(thread_id, thread_type, client)

    except Exception as e:
        print(f"[ERROR] Lỗi khi xử lý trả lời: {e}")
        client.sendMessage(
            Message(text=f"Đã xảy ra lỗi khi xử lý câu trả lời: {e}"),
            thread_id=thread_id,
            thread_type=thread_type,
        )

def handle_quit_command(message, thread_id, thread_type, user_id, client):
    if thread_id in game_sessions:
        session = game_sessions[thread_id]
        for msg_id, data in session.items():
            handle_answer(message, thread_id, thread_type, user_id, client, is_correct=False, is_quitting=True)
            del game_sessions[thread_id][msg_id]
            return

    client.sendMessage(
        Message(text="⚠️ Bạn chưa tham gia câu hỏi nào để đầu hàng."),
        thread_id=thread_id,
        thread_type=thread_type,
    )

# Hàm lấy bảng xếp hạng
def get_leaderboard(client):
    leaderboard = read_json('modules/dhbc/scoreboard.json')
    sorted_leaderboard = sorted(leaderboard.items(), key=lambda x: x[1], reverse=True)
    leaderboard_message = "🎉 Bảng xếp hạng 🎯:\n"

    # Lấy 5 người đứng đầu
    for i, (user_id, score) in enumerate(sorted_leaderboard[:10]):
        user_name = get_user_name_by_id(client, user_id)
        leaderboard_message += f"{i + 1}. {user_name} [{score}] điểm\n"

    return leaderboard_message

def send_answer_for_admin(thread_id, thread_type, client):
    try:
        if thread_id not in game_sessions or not game_sessions[thread_id]:
            client.sendMessage(
                Message(text="⚠️ Không có câu hỏi nào đang chờ giải đáp."),
                thread_id=thread_id,
                thread_type=thread_type,
            )
            return

        session = game_sessions[thread_id]
        for msg_id, data in session.items():
            correct_answer = data["tukhoa"]
            client.sendMessage(
                Message(text=f"Đáp án là: [{correct_answer}]\n🤪Chơi game vui vẻ\nKhông cay bạn nhé🤣"),
                thread_id=thread_id,
                thread_type=thread_type,
            )

    except Exception as e:
        print(f"[ERROR] Lỗi khi gửi đáp án cho admin: {e}")
        client.sendMessage(
            Message(text=f"Đã xảy ra lỗi khi gửi đáp án: {e}"),
            thread_id=thread_id,
            thread_type=thread_type,
        )

duck_base_image_path = "modules/dhbc/assets/duck.png"
waiting_image_path = "modules/dhbc/assets/waiting.png"
duck_race_gif_path = "modules/dhbc/assets/duck_race.gif"

num_ducks = 10
ducks = [f"🦆 {i+1}" for i in range(num_ducks)]

def create_duck_image(duck_number, output_path):
    try:
        base_image = Image.open(duck_base_image_path)
        draw = ImageDraw.Draw(base_image)
        font = ImageFont.truetype("arial unicode ms.otf", 50)

        # Thêm số lên lưng vịt
        text_position = (base_image.width // 2 - 20, base_image.height // 2 - 20)
        draw.text(text_position, duck_number, fill="red", font=font)

        base_image.save(output_path)
    except Exception as e:
        print(f"[ERROR] Lỗi khi tạo ảnh vịt chiến thắng: {e}")

def start_duck_race(thread_id, thread_type, client, player_choice):
    try:
        if player_choice not in ducks:
            client.sendMessage(
                Message(text="❌ Vịt bạn chọn không hợp lệ! Vui lòng chọn lại số vịt."),
                thread_id=thread_id,
                thread_type=thread_type,
            )
            return

        client.sendMessage(
            Message(text="🦆 Cuộc đua vịt sắp bắt đầu! Vui lòng chờ..."),
            thread_id=thread_id,
            thread_type=thread_type,
        )

        client.sendLocalImage(
            waiting_image_path,
            thread_id=thread_id,
            thread_type=thread_type,
        )

        time.sleep(5)

        # Đếm ngược từ 3
        for i in range(3, 0, -1):
            client.sendMessage(
                Message(text=f"{i}..."),
                thread_id=thread_id,
                thread_type=thread_type,
            )
            time.sleep(1)

        client.sendMessage(
            Message(text="🏁 Cuộc đua vịt bắt đầu!"),
            thread_id=thread_id,
            thread_type=thread_type,
        )

        client.sendLocalGif(
            duck_race_gif_path,
            thumbnailUrl="modules/dhbc/assets/duck_race_thumbnail.jpg",
            thread_id=thread_id,
            thread_type=thread_type,
        )

        time.sleep(10)
        winner_duck = random.choice(ducks)
        race_image_path = "modules/dhbc/assets/duck_winner.png"
        create_duck_image(winner_duck.split()[1], race_image_path)

        if player_choice == winner_duck:
            save_score(thread_id, 10)
            client.sendMessage(
                Message(text=f"🎉 Chúc mừng bạn! Vịt của bạn ({player_choice}) đã chiến thắng và bạn nhận được 10 điểm!"),
                thread_id=thread_id,
                thread_type=thread_type,
            )
        else:
            client.sendMessage(
                Message(text=f"😢 Rất tiếc, vịt của bạn ({player_choice}) đã thua. Vịt thắng cuộc là {winner_duck}."),
                thread_id=thread_id,
                thread_type=thread_type,
            )
        client.sendLocalImage(
            race_image_path,
            message=Message(text=f"Vịt thắng cuộc: {winner_duck}"),
            thread_id=thread_id,
            thread_type=thread_type,
        )

    except Exception as e:
        print(f"[ERROR] Lỗi khi bắt đầu đua vịt: {e}")
        client.sendMessage(
            Message(text=f"Đã xảy ra lỗi khi bắt đầu đua vịt: {e}"),
            thread_id=thread_id,
            thread_type=thread_type,
        )

def handle_bc_on(bot, thread_id):
    settings = read_settings()
    if "bc" not in settings:
        settings["bc"] = {}
    settings["bc"][thread_id] = True
    write_settings(settings)
    return f"🚦Lệnh {prefix}bc đã được Bật 🚀 trong nhóm này ✅"

def handle_bc_off(bot, thread_id):
    settings = read_settings()
    if "bc" in settings and thread_id in settings["bc"]:
        settings["bc"][thread_id] = False
        write_settings(settings)
        return f"🚦Lệnh {prefix}bc đã Tắt ⭕️ trong nhóm này ✅"
    return "🚦Nhóm chưa có thông tin cấu hình bc để ⭕️ Tắt 🤗"

def handle_dhbc_command(client, message_object, author_id, thread_id, thread_type, message):
    try:
        settings = read_settings()
        user_message = message.replace(f"{prefix}bc ", "").strip().lower()
        if user_message == "on":
            if not is_admin(author_id):  
                response = "❌Bạn không phải admin bot!"
            else:
                response = handle_bc_on(client, thread_id)
            client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
            return
        elif user_message == "off":
            if not is_admin(author_id):  
                response = "❌Bạn không phải admin bot!"
            else:
                response = handle_bc_off(client, thread_id)
            client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
            return
        
        if not (settings.get("bc", {}).get(thread_id, False)):
            return
        
        content = message.strip().split()
        commands = "bc"
    
        if len(content) < 2:
            msg = {
                "📝 Bắt đầu trò chơi": f"({prefix}{commands} batdau)",
                "🎁 Nhận quà hàng ngày": f"({prefix}{commands} daily)",
                "🏆 Xem bảng xếp hạng": f"({prefix}{commands} bxh)",
                "🦆 Đua vịt": f"({prefix}{commands} duavit [số vịt])",
                "✋ Đầu hàng": f"({prefix}{commands} dauhang)",
                "💬 Đầu hàng": f"({prefix}{commands} dapans)"
            }
            temp_image_path, menu_message = create_menu_image(msg, client, author_id)
            client.sendLocalImage(
                temp_image_path, thread_id=thread_id, thread_type=thread_type,
                message=Message(text=menu_message, mention=Mention(author_id, length=len(f"{get_user_name_by_id(client, author_id)}"), offset=0)), height=500, width=1280
            )
            os.remove(temp_image_path)
            return

        if len(content) >= 2:
            command = content[1].lower()

        if content[1] == 'daily':
            handle_attendance(author_id, client, thread_id, thread_type)
            return

        if content[1] == 'batdau':
            save_score(author_id, -5)
            send_next_question(thread_id, thread_type, client)
            return
        if content[1] == 'bxh':
            leaderboard_message = get_leaderboard()
            client.sendMessage(
                Message(text=leaderboard_message),
                thread_id=thread_id,
                thread_type=thread_type,
            )
            return

        if content[1] == "duavit":
            if len(content) < 3:
                client.sendMessage(
                    Message(text="❌ Vui lòng chọn số vịt bằng cách nhập: [-bc duavit [số vịt]]"),
                    thread_id=thread_id,
                    thread_type=thread_type,
                )
                return
            
            duck_number = content[2]
            if not duck_number.isdigit() or int(duck_number) < 1 or int(duck_number) > 100:
                client.sendMessage(
                    Message(text="❌ Số vịt không hợp lệ! Vui lòng chọn một số từ 1 đến 100."),
                    thread_id=thread_id,
                    thread_type=thread_type,
                )
                return
            
            player_choice = f"🦆 {duck_number}"
            start_duck_race(thread_id, thread_type, client, player_choice)
            return
        
        if content[1] == 'dapans':
            send_answer_for_admin(thread_id, thread_type, client)
            if not is_admin(author_id):
                msg = "• Không đủ đẳng cấp để sử dụng!!\n"
                styles = MultiMsgStyle([MessageStyle(offset=0, length=2, style="color", color="#f38ba8", auto_format=False),
                                        MessageStyle(offset=2, length=len(msg)-2, style="color", color="#cdd6f4", auto_format=False),
                                        MessageStyle(offset=0, length=len(msg), style="font", size="13", auto_format=False)])
                client.replyMessage(Message(text=msg, style=styles), message_object, thread_id, thread_type)
                return
            return

        if content[1] == 'dauhang':
            handle_quit_command(message, thread_id, thread_type, author_id, client)
            return

        if thread_id in game_sessions:
            session = game_sessions[thread_id]

            if isinstance(session, dict):
                for msg_id, data in session.items():
                    if time.time() - data['timestamp'] > timeLimit:
                        client.sendMessage(
                            Message(text="⏰ Bạn hết thời gian trả lời!\nVui lòng nhập [-bc batdau] để bắt đầu chơi tiếp."),
                            thread_id=thread_id,
                            thread_type=thread_type,
                        )
                        del game_sessions[thread_id][msg_id]
                        return

                    answer = " ".join(content[1:]).strip().lower()
                    if answer == data['tukhoa'].lower():
                        handle_answer(message, thread_id, thread_type, author_id, client, is_correct=True)
                    else:
                        handle_answer(message, thread_id, thread_type, author_id, client, is_correct=False)
                    return
            else:
                client.sendMessage(
                    Message(text="➜ 🐞 Đã xảy ra lỗi: Phiên trò chơi không hợp lệ!"),
                    thread_id=thread_id,
                    thread_type=thread_type,
                )
                return
    except Exception as e:
        client.replyMessage(Message(text=f"➜ 🐞 Đã xảy ra lỗi: {e}🤧"), message_object, thread_id=thread_id, thread_type=thread_type)