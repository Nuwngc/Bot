from zlapi.models import Message
from logging_utils import Logging
import json
logger = Logging()
class UndoHandler:
    def __init__(self, client):
        self.client = client
    def handle_undo_command(self, message, message_object, thread_id, thread_type, author_id):
        if author_id != self.client.ADMIN:
            self.client.replyMessage(
                Message(text="Bạn không có quyền sử dụng lệnh này."),
                message_object,
                thread_id=thread_id,
                thread_type=thread_type,
                ttl=5000
            )
            return
        parts = message.lower().split()
        if len(parts) < 2:
          self.client.replyMessage(
              Message(text="Cú pháp không hợp lệ. Sử dụng: ..antiundo on/off/rs"),
              message_object,
              thread_id=thread_id,
              thread_type=thread_type,
              ttl=5000
          )
          return
        action = parts[1]
        if action == 'on':
            if "groups" not in self.client.undo_enabled:
              self.client.undo_enabled["groups"] = {}
            self.client.undo_enabled["groups"][thread_id] = True
            self.client.save_undo_settings()
            self.client.replyMessage(
                Message(text="Đã bật chức năng đọc tin nhắn thu hồi cho nhóm này."),
                message_object,
                thread_id=thread_id,
                thread_type=thread_type,
                ttl=5000
            )
        elif action == 'off':
            if "groups" not in self.client.undo_enabled:
              self.client.undo_enabled["groups"] = {}
            self.client.undo_enabled["groups"][thread_id] = False
            self.client.save_undo_settings()
            self.client.replyMessage(
                Message(text="Đã tắt chức năng đọc tin nhắn thu hồi cho nhóm này."),
                message_object,
                thread_id=thread_id,
                thread_type=thread_type,
                ttl=5000
            )
        elif action == 'rs':
            try:
                with open("database/dataundo.json", "w") as f:
                    json.dump([], f)
                self.client.replyMessage(
                    Message(text="Đã reset nội dung file dataundo.json."),
                    message_object,
                    thread_id=thread_id,
                    thread_type=thread_type,
                    ttl=5000
                )
            except Exception as e:
                logger.error(f"Error resetting dataundo.json: {e}")
                self.client.replyMessage(
                    Message(text=f"Có lỗi xảy ra khi reset file: {e}"),
                    message_object,
                    thread_id=thread_id,
                    thread_type=thread_type,
                    ttl=5000
                )
        else:
            self.client.replyMessage(
                Message(text="Cú pháp không hợp lệ. Sử dụng: ..antiundo on/off/rs"),
                message_object,
                thread_id=thread_id,
                thread_type=thread_type,
                ttl=5000
            )