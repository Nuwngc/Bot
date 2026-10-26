from datetime import date
import json
import os
import random
from threading import Thread
import time
from modules.func_bot_info import create_menu1_image, is_admin, read_settings, write_settings
from config import *
from zlapi.models import *
from PIL import Image

baucua_file = 'modules/baucua/baucua.json'
bc_folder = 'modules/baucua/'
bcgif_folder = 'modules/baucua/'

def baucuadk(author_id, thread_id, thread_type, message_object, client):
    try:

        user_info = client.fetchUserInfo(author_id)
        user_name = user_info.changed_profiles[author_id].displayName

        if not os.path.exists(baucua_file):
            with open(baucua_file, 'w') as f:
                json.dump({}, f)
        
        with open(baucua_file, 'r') as f:
            baucua_data = json.load(f)
        
        if str(author_id) in baucua_data:
            client.sendMessage(
                Message(text=f"🦊 Bạn đã đăng ký rồi!"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return
        
        baucua_data[str(author_id)] = {
            "username": user_name, "coins": 5000, "wins": 0, "losses": 0, 
            "draws": 0, "total_spent": 0, "lucky_number": 0, "luck_percent": 0
        }
        
        with open(baucua_file, 'w') as f:
            json.dump(baucua_data, f)
        
        user_info = client.fetchUserInfo(author_id)
        user_name = user_info.changed_profiles[author_id].displayName
        
        client.sendMessage(
            Message(text=f"🌸 Chào {user_name}! Bạn nhận được 5000 coins 🎉"),
            thread_id=thread_id,
            thread_type=thread_type
        )
    
    except Exception as e:
        # Thực hiện gửi lỗi nếu có
        client.sendMessage(
            Message(text=f"🐞 Lỗi: {str(e)}"),
            thread_id=thread_id,
            thread_type=thread_type
        )


# Function to place a bet in the game
def baucuadat(author_id, content, thread_id, thread_type, message_object, client):
    try:
        user_info = client.fetchUserInfo(author_id)
        user_name = user_info.changed_profiles[author_id].displayName
        # Kiểm tra sự tồn tại của file dữ liệu
        if not os.path.exists(baucua_file):
            return
        
        with open(baucua_file, 'r') as f:
            baucua_data = json.load(f)
        
        # Kiểm tra xem người chơi đã đăng ký chưa
        if str(author_id) not in baucua_data:
            client.sendMessage(
                Message(text=f"❌ Bạn chưa đăng ký!"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return
        
        # Kiểm tra nếu content là một chuỗi, rồi tách thành các phần
        if isinstance(content, str):
            parts = content.strip().split()
        else:
            # Nếu content đã là một danh sách, không cần gọi split
            parts = content

        # Kiểm tra xem người chơi đã cung cấp đủ thông tin chưa
        if len(parts) < 4:
            client.sendMessage(
                Message(text=f"❌ Sai cú pháp! VD: baucua dat 1 gà"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return
        
        # Kiểm tra phần bet (cửa) có phải là chuỗi hợp lệ không
        bet_parts = parts[3:]  # Các cửa người chơi đặt
        
        # Kiểm tra các phần tử trong bet_parts có phải là chuỗi không
        if not all(isinstance(bet, str) for bet in bet_parts):
            client.sendMessage(
                Message(text=f"❌ Các cửa đặt không hợp lệ"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return

        # Kiểm tra coin của người chơi
        coins = int(parts[2])
        if baucua_data[str(author_id)]["coins"] < coins:
            client.sendMessage(
                Message(text=f"❌ Không đủ coins!"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return
        
        # Lấy hình ảnh ngẫu nhiên từ thư mục
        images = [f for f in os.listdir(bc_folder) if f.endswith('.png')]
        results = random.sample(images, 3)

        # Lấy tên người dùng
        user_info = client.fetchUserInfo(author_id)
        user_name = user_info.changed_profiles[author_id].displayName
        # **Fix**: Initialize payout here
        payout = 0  # Initialize payout to 0
        result_text = f"🕹️ {user_name}\n🎊 Về bờ rồi 😍😤\n🥠 Khui: {' '.join([img.split('.')[0] for img in results])}\n🪙 Coin mỗi cửa: {coins}\n🎯 Cửa bạn đặt: {' '.join(bet_parts)}\n🔁 Biến động: {payout} Coins"

        icon_map = {'tôm': '🦐', 'cua': '🦀', 'gà': '🐔', 'bầu': '🍐', 'cá': '🐟', 'nai': '🦌'}
        bet_counts = {bet: 0 for bet in icon_map}

        # Đếm các cửa đặt
        for bet in bet_parts:
            if bet in bet_counts:
                bet_counts[bet] += 1

        result_text += "\n🚥 Chi tiết kết quả:"
        for bet, count in bet_counts.items():
            if count > 0:
                icon = icon_map[bet]
                if any(bet in result for result in results):
                    payout += coins * count
                    result_text += f"\n    ➜ x{count} {icon}: +{coins * count}"
                else:
                    payout -= coins * count
                    result_text += f"\n    ➜ x{count} {icon}: -{coins * count}"

        if payout > 0:
            baucua_data[str(author_id)]["wins"] += 1
            result_text += f"\n🎉 Bạn thắng {payout} coins!"
        elif payout < 0:
            baucua_data[str(author_id)]["losses"] += 1
            result_text += f"\n😞 Bạn thua {-payout} coins!"
        else:
            baucua_data[str(author_id)]["draws"] += 1
            result_text += f"\n🤝 Hòa! Bạn không thắng cũng không thua!"

        # Cập nhật dữ liệu người chơi
        baucua_data[str(author_id)]["coins"] += payout
        baucua_data[str(author_id)]["total_spent"] += coins
        total_games = baucua_data[str(author_id)]["wins"] + baucua_data[str(author_id)]["losses"] + baucua_data[str(author_id)]["draws"]
        baucua_data[str(author_id)]["lucky_number"] = round(total_games / 3, 2) if total_games else 0
        baucua_data[str(author_id)]["luck_percent"] = round((baucua_data[str(author_id)]["wins"] / total_games) * 100, 2) if total_games else 0

        with open(baucua_file, 'w') as f: json.dump(baucua_data, f)

        merged_image = mergeImages([os.path.join(bc_folder, img) for img in results])

        result_text += f"\n🔁 Biến động: {payout} Coins\n💰 Số dư cuối: {baucua_data[str(author_id)]['coins']} Coins"
        result_text += f"\n🏆 [Thắng: {baucua_data[str(author_id)]['wins']}] - [Thua: {baucua_data[str(author_id)]['losses']}] - [Hòa: {baucua_data[str(author_id)]['draws']}]"
        result_text += f"\n🍀 Số may mắn: {baucua_data[str(author_id)]['lucky_number']}, Phần trăm may mắn: {baucua_data[str(author_id)]['luck_percent']}%"
        result_text += "\n🌏 申拥有一切，但没有你，一切都变得毫无意义\n🌟 Shin có tất cả, nhưng thiếu em, thì tất cả đều trở nên vô nghĩa."

        # Lưu lại dữ liệu đã thay đổi
        with open(baucua_file, 'w') as f:
            json.dump(baucua_data, f)

        # Gửi GIF trong khi chờ kết quả
        gif_path = os.path.join(bcgif_folder, "baucua.gif")
        client.sendLocalGif(
            gifPath=gif_path,
            thumbnailUrl=None,
            thread_id=thread_id,
            thread_type=thread_type,
            width=800,
            height=100,
            ttl=4000
        )

        # Thông báo đang khui kết quả
        client.sendMessage(
            Message(text="⏳ Đang khui, bỏ tay ra nhé..."),
            thread_id=thread_id,
            thread_type=thread_type,
            ttl=4000
        )
        time.sleep(5)

        # Ghép các hình ảnh lại với nhau
        merged_image = mergeImages([os.path.join(bc_folder, img) for img in results])

        # Gửi ảnh kết quả
        client.sendLocalImage(
            imagePath=merged_image,
            thread_id=thread_id,
            thread_type=thread_type,
            message=Message(text=result_text),
            width=3300,
            height=1180,
            ttl=30000
        )

        # Xóa ảnh đã ghép sau khi gửi
        os.remove(merged_image)

    except Exception as e:
        client.sendMessage(
            Message(text=f"🐞 Lỗi: {str(e)}"),
            thread_id=thread_id,
            thread_type=thread_type
        )


def mergeImages(images):
    imgs = [Image.open(img) for img in images]
    widths, heights = zip(*(i.size for i in imgs))
    total_width = sum(widths)
    max_height = max(heights)
    new_img = Image.new('RGB', (total_width, max_height))
    x_offset = 0
    for img in imgs:
        new_img.paste(img, (x_offset, 0))
        x_offset += img.width
    merged_path = os.path.join(bc_folder, "merged.png")
    new_img.save(merged_path)
    return merged_path

def diemdanh(author_id, thread_id, thread_type, message_object, client):
    try:
        user_name = "User" + str(author_id)

        # Kiểm tra sự tồn tại của file dữ liệu
        if not os.path.exists(baucua_file):
            with open(baucua_file, 'w') as f:
                json.dump({}, f)
        
        with open(baucua_file, 'r') as f:
            baucua_data = json.load(f)
        
        # Kiểm tra xem người chơi đã đăng ký chưa
        if str(author_id) not in baucua_data:
            client.sendMessage(
                Message(text=f"❌ Bạn chưa đăng ký!"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return

        # Lấy ngày hiện tại
        today = str(date.today())

        # Kiểm tra xem người chơi đã điểm danh hôm nay chưa
        if 'attendance' not in baucua_data[str(author_id)]:
            baucua_data[str(author_id)]["attendance"] = []

        if today in baucua_data[str(author_id)]["attendance"]:
            client.sendMessage(
                Message(text=f"❌ Bạn đã điểm danh hôm nay rồi!"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return

        # Cập nhật điểm danh của người chơi
        baucua_data[str(author_id)]["attendance"].append(today)

        # Thưởng điểm danh
        baucua_data[str(author_id)]["coins"] += 1000  # Thưởng 1000 coins cho việc điểm danh

        with open(baucua_file, 'w') as f:
            json.dump(baucua_data, f)
        
        # Thông báo điểm danh thành công
        client.sendMessage(
            Message(text=f"🌟 Bạn đã điểm danh thành công hôm nay và nhận được 1000 coins!"),
            thread_id=thread_id,
            thread_type=thread_type
        )

    except Exception as e:
        # Xử lý lỗi nếu có
        client.sendMessage(
            Message(text=f"🐞 Lỗi: {str(e)}"),
            thread_id=thread_id,
            thread_type=thread_type
        )

def chuyen_tien(author_id, content, thread_id, thread_type, message_object, client):
    try:
        # Kiểm tra xem có mention người chơi không
        mentions = message_object.mentions if hasattr(message_object, 'mentions') else []
        
        # Nếu không có ai được tag, thông báo lỗi
        if not mentions:
            client.replyMessage(Message(text="❌ Bạn phải tag người nhận!"), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
            return
        
        mentioned_user_id = mentions[0]['uid']

        # Kiểm tra sự tồn tại của file dữ liệu
        if not os.path.exists(baucua_file):
            with open(baucua_file, 'w') as f:
                json.dump({}, f)
        
        with open(baucua_file, 'r') as f:
            baucua_data = json.load(f)
        
        # Kiểm tra xem người gửi và người nhận có đăng ký chưa
        if str(author_id) not in baucua_data:
            client.replyMessage(Message(text="❌ Bạn chưa đăng ký!"), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
            return
        
        if str(mentioned_user_id) not in baucua_data:
            client.replyMessage(Message(text="❌ Người được tag chưa đăng ký!"), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
            return
        
        # Kiểm tra cú pháp lệnh và số tiền chuyển
        if len(content) < 3:
            client.sendMessage(
                Message(text=f"❌ Cú pháp không hợp lệ! Sử dụng: [-baucua chuyen <số tiền> @User]"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return
        
        # Kiểm tra số tiền chuyển
        try:
            amount = int(content[2])
        except ValueError:
            client.sendMessage(
                Message(text=f"❌ Số tiền không hợp lệ!"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return

        if amount <= 0:
            client.sendMessage(
                Message(text=f"❌ Số tiền chuyển phải lớn hơn 0!"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return

        # Kiểm tra số dư của người gửi
        if baucua_data[str(author_id)]["coins"] < amount:
            client.sendMessage(
                Message(text=f"❌ Bạn không đủ coins để thực hiện giao dịch!"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return

        # Tiến hành chuyển tiền
        baucua_data[str(author_id)]["coins"] -= amount
        baucua_data[str(mentioned_user_id)]["coins"] += amount

        # Cập nhật dữ liệu vào file
        with open(baucua_file, 'w') as f:
            json.dump(baucua_data, f)

        # Lấy tên người gửi và người nhận
        sender_info = client.fetchUserInfo(author_id)
        sender_name = sender_info.changed_profiles[author_id].displayName
        receiver_info = client.fetchUserInfo(mentioned_user_id)
        receiver_name = receiver_info.changed_profiles[mentioned_user_id].displayName

        # Thông báo kết quả chuyển tiền
        client.sendMessage(
            Message(text=f"🎉 Bạn đã chuyển {amount} coins cho {receiver_name}.\n💰 Số dư hiện tại của {sender_name}: {baucua_data[str(author_id)]['coins']} coins!\n💰 Số dư hiện tại của {receiver_name}: {baucua_data[str(mentioned_user_id)]['coins']} coins!"),
            thread_id=thread_id,
            thread_type=thread_type
        )
        
    except Exception as e:
        # Xử lý lỗi nếu có
        client.sendMessage(
            Message(text=f"🐞 Lỗi: {str(e)}"),
            thread_id=thread_id,
            thread_type=thread_type
        )

def xem_sodu(author_id, thread_id, thread_type, message_object, client):
    try:
        # Kiểm tra sự tồn tại của file dữ liệu
        if not os.path.exists(baucua_file):
            with open(baucua_file, 'w') as f:
                json.dump({}, f)
        
        with open(baucua_file, 'r') as f:
            baucua_data = json.load(f)
        
        # Kiểm tra xem người chơi có đăng ký chưa
        if str(author_id) not in baucua_data:
            client.sendMessage(
                Message(text="❌ Bạn chưa đăng ký! Sử dụng lệnh [-baucua dk] để đăng ký."),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return

        # Lấy thông tin người chơi
        user_data = baucua_data[str(author_id)]
        username = user_data["username"]
        coins = user_data["coins"]
        wins = user_data["wins"]
        losses = user_data["losses"]
        draws = user_data["draws"]
        total_spent = user_data["total_spent"]
        lucky_number = user_data["lucky_number"]
        luck_percent = user_data["luck_percent"]

        # Tạo thông báo số dư
        stats_message = (
            f"Tài khoản: {username}\n"
            f"🎮 Số coins: {coins}\n"
            f"🏆 Thắng: {wins}\n"
            f"💔 Thua: {losses}\n"
            f"🤝 Hòa: {draws}\n"
            f"💸 Tiền đã tiêu: {total_spent}\n"
            f"🍀 Lucky Number: {lucky_number}\n"
            f"🎰 Tỉ lệ may mắn: {luck_percent}%"
        )

        # Gửi thông báo số dư
        client.sendMessage(
            Message(text=stats_message),
            thread_id=thread_id,
            thread_type=thread_type
        )

    except Exception as e:
        # Xử lý lỗi nếu có
        client.sendMessage(
            Message(text=f"🐞 Lỗi: {str(e)}"),
            thread_id=thread_id,
            thread_type=thread_type
        )

def add_coins_for_player(author_id, content, thread_id, thread_type, message_object, client):
    try:
        if not is_admin(client, author_id):
            msg = "❌Bạn không phải admin bot!\n"
            styles = MultiMsgStyle([
                MessageStyle(offset=0, length=2, style="color", color="#f38ba8", auto_format=False),
                MessageStyle(offset=2, length=len(msg)-2, style="color", color="#cdd6f4", auto_format=False),
                MessageStyle(offset=0, length=len(msg), style="font", size="13", auto_format=False)
            ])
            client.replyMessage(Message(text=msg, style=styles), message_object, thread_id, thread_type, ttl=120000)
            return

        mentions = message_object.mentions if hasattr(message_object, 'mentions') else []
        
        if not mentions:
            client.replyMessage(
                Message(text="❌ Bạn phải tag người nhận!"),
                thread_id=thread_id,
                thread_type=thread_type,
                replyMsg=message_object
            )
            return
        
        mentioned_user_id = mentions[0]['uid']

        if not os.path.exists(baucua_file):
            with open(baucua_file, 'w') as f:
                json.dump({}, f)
        
        with open(baucua_file, 'r') as f:
            baucua_data = json.load(f)
        
        if str(mentioned_user_id) not in baucua_data:
            client.replyMessage(
                Message(text="❌ Người được tag chưa đăng ký!"),
                thread_id=thread_id,
                thread_type=thread_type,
                replyMsg=message_object
            )
            return
        if len(content) < 3:
            client.sendMessage(
                Message(text=f"❌ Cú pháp không hợp lệ! Sử dụng: [-baucua add <số tiền> @User]"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return
        try:
            amount = int(content[2])
        except ValueError:
            client.sendMessage(
                Message(text=f"❌ Số tiền không hợp lệ!"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return

        if amount <= 0:
            client.sendMessage(
                Message(text=f"❌ Số tiền cộng phải lớn hơn 0!"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return
        baucua_data[str(mentioned_user_id)]["coins"] += amount

        with open(baucua_file, 'w') as f:
            json.dump(baucua_data, f)
        receiver_info = client.fetchUserInfo(mentioned_user_id)
        receiver_name = receiver_info.changed_profiles[mentioned_user_id].displayName

        client.sendMessage(
            Message(text=f"🎉 {amount} coins đã được cộng cho [{receiver_name}]!\n💰 Số dư hiện tại của [{receiver_name}]: [{baucua_data[str(mentioned_user_id)]['coins']} coins]!"),
            thread_id=thread_id,
            thread_type=thread_type
        )
        
    except Exception as e:
        client.sendMessage(
            Message(text=f"🐞 Lỗi: {str(e)}"),
            thread_id=thread_id,
            thread_type=thread_type
        )

confirmation_requests = {}

def remove_account_for_player(author_id, content, thread_id, thread_type, message_object, client):
    try:
        if not is_admin(client, author_id):
            msg = "❌Bạn không phải admin bot!\n"
            styles = MultiMsgStyle([
                MessageStyle(offset=0, length=2, style="color", color="#f38ba8", auto_format=False),
                MessageStyle(offset=2, length=len(msg)-2, style="color", color="#cdd6f4", auto_format=False),
                MessageStyle(offset=0, length=len(msg), style="font", size="13", auto_format=False)
            ])
            client.replyMessage(Message(text=msg, style=styles), message_object, thread_id, thread_type, ttl=120000)
            return
        mentions = message_object.mentions if hasattr(message_object, 'mentions') else []
        
        if not mentions:
            client.replyMessage(
                Message(text="❌ Bạn phải tag người cần xóa tài khoản!"),
                thread_id=thread_id,
                thread_type=thread_type,
                replyMsg=message_object
            )
            return
        
        mentioned_user_id = mentions[0]['uid']
        if not os.path.exists(baucua_file):
            with open(baucua_file, 'w') as f:
                json.dump({}, f)
        
        with open(baucua_file, 'r') as f:
            baucua_data = json.load(f)

        if str(mentioned_user_id) not in baucua_data:
            client.replyMessage(
                Message(text="❌ Người được tag không tồn tại trong hệ thống!"),
                thread_id=thread_id,
                thread_type=thread_type,
                replyMsg=message_object
            )
            return

        receiver_info = client.fetchUserInfo(mentioned_user_id)
        receiver_name = receiver_info.changed_profiles[mentioned_user_id].displayName

        del baucua_data[str(mentioned_user_id)]

        with open(baucua_file, 'w') as f:
            json.dump(baucua_data, f)
        client.sendMessage(
            Message(text=f"🎉 Tài khoản của {receiver_name} đã được xóa thành công!"),
            thread_id=thread_id,
            thread_type=thread_type
        )
        
    except Exception as e:
        client.sendMessage(
            Message(text=f"🐞 Lỗi: {str(e)}"),
            thread_id=thread_id,
            thread_type=thread_type
        )

def deduct_coins_from_player(author_id, content, thread_id, thread_type, message_object, client):
    try:
        if not is_admin(client, author_id):
            msg = "❌Bạn không phải admin bot!\n"
            styles = MultiMsgStyle([
                MessageStyle(offset=0, length=2, style="color", color="#f38ba8", auto_format=False),
                MessageStyle(offset=2, length=len(msg)-2, style="color", color="#cdd6f4", auto_format=False),
                MessageStyle(offset=0, length=len(msg), style="font", size="13", auto_format=False)
            ])
            client.replyMessage(Message(text=msg, style=styles), message_object, thread_id, thread_type, ttl=120000)
            return

        mentions = message_object.mentions if hasattr(message_object, 'mentions') else []
        
        if not mentions:
            client.replyMessage(
                Message(text="❌ Bạn phải tag người cần trừ tiền!"),
                thread_id=thread_id,
                thread_type=thread_type,
                replyMsg=message_object
            )
            return
        
        mentioned_user_id = mentions[0]['uid']

        if not os.path.exists(baucua_file):
            with open(baucua_file, 'w') as f:
                json.dump({}, f)
        
        with open(baucua_file, 'r') as f:
            baucua_data = json.load(f)

        if str(mentioned_user_id) not in baucua_data:
            client.replyMessage(
                Message(text="❌ Người được tag không tồn tại trong hệ thống!"),
                thread_id=thread_id,
                thread_type=thread_type,
                replyMsg=message_object
            )
            return

        if len(content) < 3:
            client.sendMessage(
                Message(text=f"❌ Cú pháp không hợp lệ! Sử dụng: [-baucua trutien <số tiền> @User]"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return
        
        try:
            amount = int(content[2])
        except ValueError:
            client.sendMessage(
                Message(text=f"❌ Số tiền không hợp lệ!"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return

        if amount <= 0:
            client.sendMessage(
                Message(text=f"❌ Số tiền trừ phải lớn hơn 0!"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return

        if baucua_data[str(mentioned_user_id)]["coins"] < amount:
            client.sendMessage(
                Message(text=f"❌ Người chơi không có đủ coins để trừ!"),
                thread_id=thread_id,
                thread_type=thread_type
            )
            return

        baucua_data[str(mentioned_user_id)]["coins"] -= amount

        with open(baucua_file, 'w') as f:
            json.dump(baucua_data, f)

        receiver_info = client.fetchUserInfo(mentioned_user_id)
        receiver_name = receiver_info.changed_profiles[mentioned_user_id].displayName
        client.sendMessage(
            Message(text=f"🎉 Bạn đã trừ {amount} coins từ tài khoản của {receiver_name}.\n💰 Số dư hiện tại của {receiver_name}: {baucua_data[str(mentioned_user_id)]['coins']} coins!"),
            thread_id=thread_id,
            thread_type=thread_type
        )
        
    except Exception as e:
        client.sendMessage(
            Message(text=f"🐞 Lỗi: {str(e)}"),
            thread_id=thread_id,
            thread_type=thread_type
        )

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

def handle_top_command(self, message_object, thread_id, thread_type, author_id):
    try:
        file_path = baucua_file
        if not os.path.exists(file_path):
            self.replyMessage(Message(text="💢 Không có dữ liệu người dùng!"), message_object, thread_id=thread_id, thread_type=thread_type)
            return
        with open(file_path, 'r') as f:
            data = json.load(f)
        for user in data:
            try:
                if user.get('coins') == "Vô Hạn":
                    user['coins'] = float('inf')
                else:
                    user['coins'] = int(user.get('coins', 0))
            except ValueError:
                user['coins'] = 0
        sorted_data = sorted(data, key=lambda x: x['coins'], reverse=True)
        top_players = sorted_data[:10]
        top_message = "🏆 **Top 10 Người Chơi Có Nhiều Coin Nhất**\n"
        for idx, player in enumerate(top_players, start=1):
            player_name = player.get('user_name', 'Không tên')
            coins_display = "Vô hạn coins" if player['coins'] == float('inf') else f"{player['coins']} coins"
            top_message += f"{idx}. {player_name} - {coins_display}\n"
        self.replyMessage(Message(text=top_message), message_object, thread_id=thread_id, thread_type=thread_type, ttl=30000)

    except Exception as e:
        self.replyMessage(Message(text=f"💢 Đã xảy ra lỗi khi lấy danh sách top: {str(e)}"), message_object, thread_id=thread_id, thread_type=thread_type)

def handle_baucua_on(bot, thread_id):
    settings = read_settings()
    if "baucua" not in settings:
        settings["baucua"] = {}
    settings["baucua"][thread_id] = True
    write_settings(settings)
    return f"🚦Lệnh {prefix}baucua đã được Bật 🚀 trong nhóm này ✅"

def handle_baucua_off(bot, thread_id):
    settings = read_settings()
    if "baucua" in settings and thread_id in settings["baucua"]:
        settings["baucua"][thread_id] = False
        write_settings(settings)
        return f"🚦Lệnh {prefix}baucua đã Tắt ⭕️ trong nhóm này ✅"
    return "🚦Nhóm chưa có thông tin cấu hình baucua để ⭕️ Tắt 🤗"

def handle_baucua_command(bot, message_object, author_id, thread_id, thread_type, command):
    def send_response():
        try:
            settings = read_settings()
    
            user_message = command.replace(f"{prefix}baucua ", "").strip().lower()
            if user_message == "on":
                if not is_admin(author_id):  
                    response = "❌Bạn không phải admin bot!"
                else:
                    response = handle_baucua_on(bot, thread_id)
                bot.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
                return
            elif user_message == "off":
                if not is_admin(author_id):  
                    response = "❌Bạn không phải admin bot!"
                else:
                    response = handle_baucua_off(bot, thread_id)
                bot.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
                return

            if not (settings.get("baucua", {}).get(thread_id, False)):
                return
            parts = command.strip().split()
            commands = "baucua"
            
            if len(parts) == 1:
                response = (
                    f"{get_user_name_by_id(bot, author_id)}\n"
                    f"💵 Trừ tiền ({prefix}{commands} tru)\n"
                    f"🗑️ Xóa tài khoản(Admin) ({prefix}{commands} remo)\n"
                    f"➡️ Thêm tiền ({prefix}{commands} add)\n"
                    f"🔒 Xem số dư ({prefix}{commands} sodu)\n"
                    f"📟 Đăng ký game ({prefix}{commands} dk)\n"
                    f"💵 Đặt cược ({prefix}{commands} dat)\n"
                    f"🎁 Nhận quà ({prefix}{commands} daily)\n"
                    f"〽️ Chuyển tiền ({prefix}{commands} bank)\n"
                )
            else:
                action = parts[1].lower()
                if action == 'tru':
                    response = deduct_coins_from_player(bot, author_id, command, thread_id, thread_type, message_object)
                elif action == 'remo':
                    response = remove_account_for_player(bot, author_id, command, thread_id, thread_type, message_object)
                elif action == 'add':
                    response = add_coins_for_player(bot, author_id, command, thread_id, thread_type, message_object)
                elif action == 'sodu':
                    response = xem_sodu(bot, author_id, thread_id, thread_type, message_object)
                elif action == 'dk':
                    response = baucuadk(bot, author_id, thread_id, thread_type, message_object)
                elif action == 'dat':
                    response = baucuadat(author_id, command, thread_id, thread_type, message_object, bot)
                elif action == 'daily':
                    response = diemdanh(bot, author_id, thread_id, thread_type, message_object)
                elif action == 'bank':
                    response = chuyen_tien(bot, author_id, command, thread_id, thread_type, message_object)
                elif action == 'bxh':
                    response = handle_top_command(bot, message_object, thread_id, thread_type, author_id)
                else:
                    response = f"➜ Lệnh [{prefix}{commands} {action}] không được hỗ trợ 🤧"
            
            if response:
                if len(parts) == 1:
                    temp_image_path = create_menu1_image({"response": response}, 1, bot, author_id)
                    bot.sendLocalImage(
                        temp_image_path, thread_id=thread_id, thread_type=thread_type,
                        message=Message(text=response, mention=Mention(author_id, length=len(f"{get_user_name_by_id(bot, author_id)}"), offset=0)), height=500, width=1280, ttl=1200000
                    )
                    os.remove(temp_image_path)
                else:
                    bot.replyMessage(Message(text=response),message_object, thread_id=thread_id, thread_type=thread_type)
        
        except Exception as e:
            print(f"Error: {e}")
            bot.replyMessage(Message(text=f"➜ 🐞 Đã xảy ra lỗi: {e}🤧"), message_object, thread_id=thread_id, thread_type=thread_type)

    thread = Thread(target=send_response)
    thread.start()