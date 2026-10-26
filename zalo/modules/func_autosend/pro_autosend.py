from datetime import datetime, timedelta
import random
import threading
import time
from zlapi.models import *
import pytz
import requests
import json
from core.bot_sys import get_user_name_by_id, read_settings, write_settings


time_poems = {
    "01:00": [
        "🌙✨ Đêm khuya vắng, giấc mơ đây, ngủ ngon nhé!",
        "🌌💤 Gió lạnh ru, lòng nhẹ bay, nghỉ thôi nào!",
        "🌃❄️ 1 giờ sáng, chăn ấm đầy, mơ đẹp nha!",
        "🌜🌠 Trăng mờ ảo, giấc mơ bay, ngủ thật sâu!",
        "✨🌙 Đêm sâu lắng, mắt nhắm ngay, nghỉ ngơi nào!",
        "🌌💫 Sao lung linh, đêm yên đây, ngủ ngon thôi!",
        "🌃🌬️ Khuya tĩnh lặng, giấc mơ đầy, nghỉ ngơi nhé!",
        "🌙❄️ Đêm lạnh lắm, chăn kéo đây, mơ đẹp nào!",
        "🌠✨ Trăng dịu dàng, lòng nhẹ bay, ngủ thật sâu!",
        "🌜🌌 1 giờ rồi, đừng thức nữa, nghỉ thôi nha!",
        "✨💤 Đêm yên bình, giấc mơ đây, ngủ ngon nhé!",
        "🌙🌠 Gió khuya lạnh, mắt nhắm đầy, nghỉ ngơi thôi!",
        "🌌❄️ Đêm sâu thẳm, chăn ấm bay, mơ đẹp nha!",
        "🌃✨ Khuya vắng vẻ, lòng nhẹ đây, ngủ thật sâu!",
        "🌜💫 Trăng lặng lẽ, giấc mơ đầy, nghỉ ngơi nào!"
    ],
    "02:30": [
        "🌙🌌 Khuya lạnh lắm, giấc mơ đây, ngủ ngon nhé!",
        "🌃✨ Đêm sâu lắng, chăn kéo ngay, nghỉ thôi nào!",
        "🌜💤 Gió khuya ru, lòng nhẹ bay, mơ đẹp nha!",
        "🌠❄️ 2 rưỡi sáng, mắt nhắm đầy, ngủ thật sâu!",
        "✨🌙 Đêm tĩnh lặng, giấc mơ bay, nghỉ ngơi thôi!",
        "🌌💫 Sao lấp lánh, chăn ấm đây, ngủ ngon nào!",
        "🌃🌬️ Khuya yên bình, giấc mơ đầy, nghỉ ngơi nhé!",
        "🌙❄️ Đêm sâu thẳm, lòng nhẹ bay, mơ đẹp thôi!",
        "🌠✨ Trăng mờ ảo, giấc mơ đây, ngủ thật sâu!",
        "🌜🌌 2 giờ hơn, đừng thức nữa, nghỉ ngơi nha!",
        "✨💤 Đêm lạnh lắm, chăn kéo đầy, ngủ ngon nhé!",
        "🌙🌠 Gió hát ru, giấc mơ bay, nghỉ thôi nào!",
        "🌌❄️ Khuya tĩnh lặng, mắt nhắm đây, mơ đẹp nha!",
        "🌃✨ Đêm sâu lắng, lòng nhẹ đầy, ngủ thật sâu!"
    ],
    "04:00": [
        "🌃🌙 Đêm khuya lạnh, giấc mơ đây, ngủ ngon nhé!",
        "🌜✨ 4 giờ sáng, chăn ấm bay, nghỉ thôi nào!",
        "🌌💤 Gió lạnh ru, lòng nhẹ đầy, mơ đẹp nha!",
        "🌠❄️ Đêm tĩnh lặng, mắt nhắm ngay, ngủ thật sâu!",
        "✨🌙 Trăng mờ ảo, giấc mơ bay, nghỉ ngơi thôi!",
        "🌃💫 Sao lung linh, chăn kéo đây, ngủ ngon nào!",
        "🌙🌬️ Khuya yên bình, giấc mơ đầy, nghỉ ngơi nhé!",
        "🌌❄️ Đêm sâu thẳm, lòng nhẹ bay, mơ đẹp thôi!",
        "🌠✨ Trăng lặng lẽ, giấc mơ đây, ngủ thật sâu!",
        "🌜🌌 4 giờ rồi, đừng thức nữa, nghỉ ngơi nha!",
        "✨💤 Đêm lạnh lắm, chăn ấm đầy, ngủ ngon nhé!",
        "🌙🌠 Gió khuya ru, giấc mơ bay, nghỉ thôi nào!",
        "🌌❄️ Khuya tĩnh lặng, mắt nhắm đây, mơ đẹp nha!",
        "🌃✨ Đêm sâu lắng, lòng nhẹ đầy, ngủ thật sâu!"
    ],
    "05:30": [
        "🌅☀️ Bình minh gần, giấc mơ đây, dậy thôi nào!",
        "☀️✨ Sáng nhẹ nhàng, năng lượng bay, chào ngày nhé!",
        "🌞💫 5 rưỡi sáng, lòng hăng say, khởi đầu thôi!",
        "🌻❀ Nắng ban mai, giấc mơ đầy, dậy thật nhanh!",
        "✨🌅 Sáng tươi mới, tinh thần bay, chào buổi sáng!",
        "☀️🌬️ Gió mát lành, năng lượng đây, bắt đầu nào!",
        "🌞🌈 Bình minh rạng, giấc mơ bay, dậy đi thôi!",
        "🌅💤 Sáng lung linh, lòng nhẹ đầy, chào ngày nhé!",
        "☀️🌻 Nắng dịu dàng, tinh thần bay, khởi đầu thôi!",
        "✨🌞 5 giờ hơn, ngày mới đây, dậy thật nhanh!",
        "🌅❀ Sáng rực rỡ, giấc mơ đầy, chào buổi sáng!",
        "☀️🌬️ Nắng ban mai, lòng hăng say, bắt đầu nào!",
        "🌞💫 Sáng tươi đẹp, năng lượng bay, dậy đi nhé!",
        "🌻✨ Gió mát sáng, giấc mơ đây, chào ngày thôi!"
    ],
    "07:00": [
        "🌞☀️ Sáng rực rỡ, ngày mới đây, dậy thôi nào!",
        "☀️✨ 7 giờ sáng, nắng lung lay, chào buổi sáng!",
        "🌅💫 Một ngày mới, lòng hăng say, bắt đầu thôi!",
        "🌻❀ Nắng ban mai, giấc mơ đầy, dậy thật nhanh!",
        "✨🌞 Sáng tươi đẹp, năng lượng bay, chào ngày mới!",
        "☀️🌬️ Gió mát lành, tinh thần đây, khởi đầu nào!",
        "🌞🌈 Bình minh rạng, giấc mơ bay, dậy đi thôi!",
        "🌅💤 Sáng lung linh, lòng nhẹ đầy, chào ngày nhé!",
        "☀️🌻 Nắng dịu dàng, tinh thần bay, bắt đầu thôi!",
        "✨🌞 7 giờ rồi, ngày mới đây, dậy thật nhanh!",
        "🌅❀ Sáng rực rỡ, giấc mơ đầy, chào buổi sáng!",
        "☀️🌬️ Nắng ban mai, lòng hăng say, bắt đầu nào!",
        "🌞💫 Sáng tươi đẹp, năng lượng bay, dậy đi nhé!",
        "🌻✨ Gió mát sáng, giấc mơ đây, chào ngày thôi!"
    ],
    "08:30": [
        "🌞☕ Sáng hiệu quả, công việc đây, cố lên nào!",
        "☕✨ 8 rưỡi sáng, tinh thần bay, làm việc thôi!",
        "🌻💫 Nắng ban mai, năng lượng đầy, bắt đầu nhé!",
        "✨🌞 Sáng rực rỡ, lòng hăng say, làm thật tốt!",
        "☀️🌬️ Gió mát lành, giấc mơ bay, hiệu quả nào!",
        "🌅❀ Nắng dịu dàng, tinh thần đây, làm việc thôi!",
        "🌞🌈 8 giờ hơn, công việc đầy, cố lên nhé!",
        "☕💤 Sáng tươi mới, lòng nhẹ bay, làm thật nhanh!",
        "✨🌻 Nắng lung linh, năng lượng đây, hiệu quả thôi!",
        "☀️🌞 Sáng yên bình, giấc mơ đầy, làm việc nào!",
        "🌅💫 Gió mát sáng, tinh thần bay, cố lên thôi!",
        "🌞❀ Nắng ban mai, lòng hăng say, làm thật tốt!",
        "☕✨ Sáng rực rỡ, công việc đây, hiệu quả nào!"
    ],
    "10:06": [
        "🌞⏰ 10 giờ sáng, năng lượng đây, làm việc nào!",
        "☀️✨ Nắng rực rỡ, tinh thần bay, cố lên nhé!",
        "🌻💫 Sáng tươi mới, giấc mơ đầy, hiệu quả thôi!",
        "✨🌞 Gió mát lành, lòng hăng say, làm thật tốt!",
        "☕❀ Nắng dịu dàng, công việc đây, bắt đầu nào!",
        "🌅🌈 10 giờ rồi, tinh thần bay, làm việc thôi!",
        "🌞💤 Sáng lung linh, năng lượng đầy, cố lên nhé!",
        "☀️🌻 Nắng ban mai, giấc mơ bay, hiệu quả nào!",
        "✨⏰ Sáng yên bình, lòng nhẹ đây, làm thật nhanh!",
        "🌞❀ Gió mát sáng, tinh thần đầy, làm việc thôi!",
        "☕💫 Nắng rực rỡ, công việc bay, cố lên nào!",
        "🌅✨ Sáng tươi đẹp, năng lượng đây, hiệu quả thôi!"
    ],
    "11:30": [
        "🌞🍽️ Gần trưa rồi, nghỉ ngơi đây, ăn ngon nhé!",
        "☀️✨ 11 rưỡi sáng, giấc mơ bay, nghỉ thôi nào!",
        "🌻💤 Nắng ban trưa, lòng nhẹ đầy, thư giãn thôi!",
        "✨⏰ Trưa yên bình, năng lượng đây, ăn thật ngon!",
        "☕❀ Gió mát lành, tinh thần bay, nghỉ ngơi nào!",
        "🌅🌈 Nắng dịu dàng, giấc mơ đầy, ăn ngon nhé!",
        "🌞💫 11 giờ hơn, bụng đói đây, nghỉ thôi nào!",
        "☀️🌻 Trưa rực rỡ, món ngon bay, thư giãn thôi!",
        "✨🍽️ Nắng ban trưa, lòng hăng say, ăn thật ngon!",
        "🌞❀ Gió mát trưa, giấc mơ đây, nghỉ ngơi nào!"
    ],
    "13:00": [
        "🌞⏰ 1 giờ chiều, năng lượng đây, làm việc nào!",
        "☀️✨ Nắng rực rỡ, tinh thần bay, cố lên nhé!",
        "🌻💫 Chiều tươi mới, giấc mơ đầy, hiệu quả thôi!",
        "✨🌞 Gió mát lành, lòng hăng say, làm thật tốt!",
        "☕❀ Nắng dịu dàng, công việc đây, bắt đầu nào!",
        "🌅🌈 1 giờ rồi, tinh thần bay, làm việc thôi!",
        "🌞💤 Chiều lung linh, năng lượng đầy, cố lên nhé!",
        "☀️🌻 Nắng ban chiều, giấc mơ bay, hiệu quả nào!",
        "✨⏰ Chiều yên bình, lòng nhẹ đây, làm thật nhanh!"
    ],
    "14:30": [
        "🌞🌻 Chiều lãng mạn, giấc mơ đây, vui vẻ nào!",
        "☀️✨ 2 rưỡi chiều, tinh thần bay, làm việc nhé!",
        "🌅💫 Nắng dịu dàng, năng lượng đầy, cố lên thôi!",
        "✨⏰ Chiều rực rỡ, lòng hăng say, hiệu quả nào!",
        "☕❀ Gió mát lành, giấc mơ bay, làm thật tốt!",
        "🌞🌈 Nắng ban chiều, tinh thần đây, bắt đầu nào!",
        "🌻💤 Chiều yên bình, công việc bay, cố lên nhé!"
    ],
    "16:00": [
        "🌅✨ Chiều dần trôi, giấc mơ đây, thư giãn nào!",
        "☀️🌻 4 giờ chiều, tinh thần bay, nghỉ ngơi nhé!",
        "🌞💫 Nắng nhạt dần, năng lượng đầy, làm việc thôi!",
        "✨⏰ Chiều yên bình, lòng hăng say, hiệu quả nào!",
        "☕❀ Gió mát chiều, giấc mơ bay, cố lên nhé!",
        "🌅🌈 Nắng dịu dàng, tinh thần đây, làm thật tốt!"
    ],
    "17:30": [
        "🌅🌞 Hoàng hôn gần, giấc mơ đây, nghỉ ngơi nào!",
        "☀️✨ 5 rưỡi chiều, tinh thần bay, thư giãn nhé!",
        "🌻💤 Nắng nhạt dần, lòng nhẹ đầy, nghỉ thôi nào!",
        "✨⏰ Chiều tà đến, năng lượng bay, thư giãn thôi!",
        "☕❀ Gió mát lành, giấc mơ đây, nghỉ ngơi nhé!"
    ],
    "19:00": [
        "🌙✨ Tối dịu dàng, giấc mơ đây, ăn ngon nào!",
        "🌌💤 7 giờ tối, tinh thần bay, nghỉ ngơi nhé!",
        "🌜❄️ Đêm yên bình, món ngon đầy, thư giãn thôi!",
        "✨🍽️ Tối rực rỡ, lòng hăng say, ăn thật ngon!",
        "☕🌙 Gió mát đêm, giấc mơ bay, nghỉ ngơi nào!"
    ],
    "20:30": [
        "🌙✨ Sắp ngủ rồi, giấc mơ đây, ngủ ngon nào!",
        "🌌💤 8 rưỡi tối, chăn kéo bay, nghỉ thôi nhé!",
        "🌜❄️ Đêm yên tĩnh, lòng nhẹ đầy, mơ đẹp thôi!",
        "✨⏰ Tối dịu dàng, tinh thần bay, ngủ thật sâu!",
        "☕🌙 Gió mát đêm, giấc mơ đây, nghỉ ngơi nào!"
    ],
    "22:06": [
        "🌙🌌 Đêm khuya đến, giấc mơ đây, ngủ ngon nào!",
        "🌃✨ 10 giờ tối, chăn ấm bay, nghỉ thôi nhé!",
        "🌜💤 Gió lạnh ru, lòng nhẹ đầy, mơ đẹp thôi!",
        "✨⏰ Đêm yên bình, tinh thần bay, ngủ thật sâu!",
        "☕🌙 Trăng lặng lẽ, giấc mơ đây, nghỉ ngơi nào!"
    ],
    "23:30": [
        "🌙✨ Khuya lắm rồi, giấc mơ đây, ngủ ngon nào!",
        "🌌💤 11 rưỡi tối, chăn kéo bay, nghỉ thôi nhé!",
        "🌜❄️ Đêm tĩnh lặng, lòng nhẹ đầy, mơ đẹp thôi!",
        "✨⏰ Gió khuya ru, tinh thần bay, ngủ thật sâu!",
        "☕🌙 Trăng mờ ảo, giấc mơ đây, nghỉ ngơi nào!"
    ],
    "00:00": [
        "🌙🌌 Nửa đêm rồi, giấc mơ đây, ngủ ngon nào!",
        "🌃✨ 12 giờ khuya, chăn ấm bay, nghỉ thôi nhé!",
        "🌜💤 Gió lạnh ru, lòng nhẹ đầy, mơ đẹp thôi!",
        "✨⏰ Đêm sâu thẳm, tinh thần bay, ngủ thật sâu!",
        "☕🌙 Trăng lặng lẽ, giấc mơ đây, nghỉ ngơi nào!"
    ]
}

vn_tz = pytz.timezone('Asia/Ho_Chi_Minh')

def handle_autosend_on(bot, thread_id):
    settings = read_settings()
    if "autosend" not in settings:
        settings["autosend"] = {}
    settings["autosend"][thread_id] = True
    write_settings(settings)
    return f"🚦Lệnh {prefix}autosend đã được Bật 🚀 trong nhóm này ✅"

def handle_autosend_off(bot, thread_id):
    settings = read_settings()
    if "autosend" in settings and thread_id in settings["autosend"]:
        settings["autosend"][thread_id] = False
        write_settings(settings)
        return f"🚦Lệnh {prefix}autosend đã Tắt ⭕️ trong nhóm này ✅"
    return "🚦Nhóm chưa có thông tin cấu hình autosend để ⭕️ Tắt 🤗"

def autosend_task(client):
    last_sent_time = {}
    
    while True:
        try:
            settings = read_settings()
            if not settings.get("autosend"):
                time.sleep(30)
                continue
                
            now = datetime.now(vn_tz)
            current_time_str = now.strftime("%H:%M")
            
            if current_time_str in time_poems:
                listvd = "https://github.com/trannguyen-shiniuem/trannguyen-shiniuem/blob/main/autosend1.json"
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
                }
                try:
                    response = requests.get(listvd, headers=headers, timeout=10)
                    response.raise_for_text()
                    urls = response.json()
                    if not urls:
                        raise ValueError("Danh sách video rỗng")
                    video_url = random.choice(urls)
                except Exception as e:
                    print(f"❌ Lỗi khi lấy danh sách video: {e}")
                    time.sleep(30)
                    continue
                try:
                    video_check = requests.head(video_url, headers=headers, timeout=5)
                    if video_check.text_code != 200:
                        raise ValueError(f"Video URL không hợp lệ: {video_url}")
                except Exception as e:
                    print(f"❌ Video URL không khả dụng: {e}")
                    time.sleep(30)
                    continue
                
                thumbnail_url = "https://f66-zpg-r.zdn.vn/jxl/8107149848477004187/d08a4d364d8cf9d2a09d.jxl"
                duration = '1000000'
                poem = random.choice(time_poems[current_time_str])
                formatted_message = f"🚦{poem}\n🚦{current_time_str} - Bot: {get_user_name_by_id(client, client.uid)} Autosend"
                
                for thread_id, enabled in settings["autosend"].items():
                    if not enabled:
                        continue
                        
                    if thread_id not in last_sent_time or (now - last_sent_time.get(thread_id, now) >= timedelta(minutes=1)):
                        gui = Message(text=formatted_message)
                        try:
                            client.sendRemoteVideo(
                                video_url,
                                thumbnail_url,
                                duration=duration,
                                message=gui,
                                thread_id=thread_id,
                                thread_type=ThreadType.GROUP,
                                width=1080,
                                height=1920,
                                ttl=3600000
                            )
                            last_sent_time[thread_id] = now
                            print(f"✅ Đã gửi tin nhắn đến {thread_id}")
                            time.sleep(0.3)
                        except Exception as e:
                            print(f"❌ Lỗi khi gửi tin nhắn đến {thread_id}: {e}")
                            
        except Exception as e:
            print(f"❌ Lỗi trong autosend_task: {e}")
            
        time.sleep(30)

def start_autosend_handle(client, thread_type, message_object, message, thread_id):
    user_message = message.replace(f"{prefix}autosend ", "").strip().lower()
    
    if user_message == "on":
        response = handle_autosend_on(client, thread_id)
        client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
        if not hasattr(client, 'autosend_thread'):
            client.autosend_thread = threading.Thread(target=autosend_task, args=(client,), daemon=True)
            client.autosend_thread.start()
            
    elif user_message == "off":
        response = handle_autosend_off(client, thread_id)
        client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)