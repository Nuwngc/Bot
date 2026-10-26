import time
from zlapi.models import *
import datetime
import os
import json
from collections import deque

last_sms_time = None
current_processing_number = None
cooldown = 300 
set_box = "5921723661355323434"
type_group = ThreadType.GROUP

def handle_sms_command(message, message_object, thread_id, thread_type, author_id, self):
    global last_sms_time, current_processing_number
    
    parts = message.split()
    
    if len(parts) < 2:
        self.sendMessage(Message(text=f'➜ 🚦 Định dạng lệnh: {self.prefix}sms [Phone]'), thread_id=thread_id, thread_type=thread_type)
        return

    attack_phone_number = parts[1]
    
    if len(attack_phone_number) != 10 or not attack_phone_number.isnumeric():
        self.sendMessage(Message(text='🚦 Số điện thoại phải có đúng 10 chữ số!'), thread_id=thread_id, thread_type=thread_type)
        return

    current_time = datetime.datetime.now()

    if current_processing_number:
        error_msg = f"🚦 Vui lòng đợi số {current_processing_number} xử lý xong!"
        styles = MultiMsgStyle([
            MessageStyle(offset=0, length=len(error_msg), style="color", color="#DB342E", auto_format=False),
            MessageStyle(offset=0, length=len(error_msg), style="bold", size="15", auto_format=False)
        ])
        self.sendMessage(Message(text=error_msg, style=styles), thread_id=thread_id, thread_type=thread_type)
        return

    if last_sms_time and (current_time - last_sms_time).total_seconds() < cooldown:
        remaining_time = cooldown - int((current_time - last_sms_time).total_seconds())
        remaining_minutes = remaining_time // 60
        remaining_seconds = remaining_time % 60
        self.sendReaction(message_object, "⏱️", thread_id, thread_type)
        return
    current_processing_number = attack_phone_number
    init_msg = f"🚦 Bắt đầu spam số {attack_phone_number}"
    styles = MultiMsgStyle([
        MessageStyle(offset=0, length=len(init_msg), style="color", color="#15A85F", auto_format=False),
        MessageStyle(offset=0, length=len(init_msg), style="bold", size="15", auto_format=False)
    ])
    self.sendMessage(Message(text=init_msg, style=styles), thread_id=thread_id, thread_type=thread_type)
    
    last_sms_time = current_time
    spam_msg = f"@sms {attack_phone_number} 5"
    self.sendMessage(Message(text=spam_msg), thread_id=set_box, thread_type=type_group)
    
    time.sleep(5 * 60)
    success_msg = f"🚦 ✅ Hoàn tất spam tới số {attack_phone_number}!"
    success_styles = MultiMsgStyle([
        MessageStyle(offset=0, length=len(success_msg), style="color", color="#15A85F", auto_format=False),
        MessageStyle(offset=0, length=len(success_msg), style="bold", size="15", auto_format=False)
    ])
    self.sendMessage(Message(text=success_msg, style=success_styles), thread_id=thread_id, thread_type=thread_type)
    current_processing_number = None
    last_sms_time = datetime.datetime.now()