from core.bot_sys import admin_cao
from zlapi.models import *
import time
import json

    
def blockto(message, message_object, thread_id, thread_type, author_id, self):
    if not admin_cao(self, author_id):
        self.replyMessage(
            Message(text="🚦Bạn không có quyền sử dụng lệnh này."),
            message_object, thread_id, thread_type, ttl=60000
        )
        return

    user_id = None
    if thread_type == ThreadType.USER:
        user_id = thread_id
    elif message_object.mentions:
        user_id = message_object.mentions[0]['uid']
    else:
        self.replyMessage(
            Message(text="🚦 Vui lòng tag người dùng để chặn hoặc sử dụng lệnh trong cuộc trò chuyện riêng."),
            message_object, thread_id, thread_type, ttl=60000
        )
        return

    try:
        user_info = self.fetchUserInfo(user_id)
        profile = user_info.changed_profiles.get(user_id, {})
        user_name = profile.get('zaloName', 'Không xác định')

        self.blockUser(user_id)
        success_message = f"🚦 Đã chặn {user_name}."
        self.replyMessage(Message(text=success_message), message_object, thread_id, thread_type, ttl=60000)
    
    except Exception as e:
        error_message = f"🚦 Không thể chặn người dùng. Lỗi: {str(e)}"
        self.replyMessage(Message(text=error_message), message_object, thread_id, thread_type, ttl=60000)

def unblockto(message, message_object, thread_id, thread_type, author_id, self):
    if not admin_cao(self, author_id):
        self.replyMessage(
            Message(text="🚦Bạn không có quyền sử dụng lệnh này."),
            message_object, thread_id, thread_type, ttl=60000
        )
        return

    user_id = None
    if thread_type == ThreadType.USER:
        user_id = thread_id
    elif message_object.mentions:
        user_id = message_object.mentions[0]['uid']
    else:
        self.replyMessage(
            Message(text="🚦 Vui lòng tag người dùng để mở chặn hoặc sử dụng lệnh trong cuộc trò chuyện riêng."),
            message_object, thread_id, thread_type, ttl=60000
        )
        return

    try:
        user_info = self.fetchUserInfo(user_id)
        profile = user_info.changed_profiles.get(user_id, {})
        user_name = profile.get('zaloName', 'Không xác định')

        self.unblockUser(user_id)
        success_message = f"🚦 Đã mở chặn {user_name}."
        self.replyMessage(Message(text=success_message), message_object, thread_id, thread_type, ttl=60000)

    except Exception as e:
        error_message = f"🚦 Không thể mở chặn người dùng. Lỗi: {str(e)}"
        self.replyMessage(Message(text=error_message), message_object, thread_id, thread_type, ttl=60000)


def addfrito(message, message_object, thread_id, thread_type, author_id, self):
    if not admin_cao(self, author_id):
        self.replyMessage(
            Message(text="🚦Bạn không có quyền sử dụng lệnh này."),
            message_object, thread_id, thread_type, ttl=60000
        )
        return

    try:
        if thread_type == ThreadType.USER:
            user_id = thread_id
        else:
            if not message_object.mentions:
                response_message = "🚦 Vui lòng tag người dùng để kết bạn. Ví dụ: @Minh Vũ"
                self.replyMessage(Message(text=response_message), message_object, thread_id, thread_type, ttl=60000)
                return
            user_id = message_object.mentions[0]['uid']

        if user_id == self.uid:
            self.replyMessage(
                Message(text="🚦 Không thể gửi lời mời kết bạn cho chính mình."),
                message_object, thread_id, thread_type, ttl=60000
            )
            return

        user_info = self.fetchUserInfo(user_id)
        profile = user_info.changed_profiles.get(user_id, {})
        user_name = profile.get('zaloName', 'Không xác định')

        if user_id:
            print(f"User ID to add: {user_id}")
            self.sendFriendRequest(user_id, "Xin chào, mình muốn kết bạn!")
            success_message = f"🚦 Đã gửi lời mời kết bạn đến {user_name}."
            self.replyMessage(Message(text=success_message), message_object, thread_id, thread_type, ttl=60000)
        else:
            self.replyMessage(
                Message(text="🚦 Không tìm thấy ID hợp lệ trong mentions."),
                message_object, thread_id, thread_type, ttl=60000
            )
    except Exception as e:
        error_message = f"🚦 Không thể kết bạn người dùng. Lỗi: {str(e)}"
        self.replyMessage(Message(text=error_message), message_object, thread_id, thread_type, ttl=60000)

def removefrito(message, message_object, thread_id, thread_type, author_id, self):
    if not admin_cao(self, author_id):
        self.replyMessage(
            Message(text="🚦Bạn không có quyền sử dụng lệnh này."),
            message_object, thread_id, thread_type, ttl=60000
        )
        return

    try:
        if thread_type == ThreadType.USER:
            user_id = thread_id
        else:
            if not message_object.mentions:
                response_message = "🚦 Vui lòng tag người dùng để xóa kết bạn. Ví dụ: @Minh Vũ"
                self.replyMessage(Message(text=response_message), message_object, thread_id, thread_type, ttl=60000)
                return
            user_id = message_object.mentions[0]['uid']

        if user_id == self.uid:
            self.replyMessage(
                Message(text="🚦 Không thể xóa kết bạn chính mình."),
                message_object, thread_id, thread_type, ttl=60000
            )
            return

        user_info = self.fetchUserInfo(user_id)
        profile = user_info.changed_profiles.get(user_id, {})
        user_name = profile.get('zaloName', 'Không xác định')

        if user_id:
            print(f"User ID to add: {user_id}")
            self.unfriendUser(user_id)
            success_message = f"🚦 Đã xóa kết bạn {user_name}."
            self.replyMessage(Message(text=success_message), message_object, thread_id, thread_type, ttl=60000)
        else:
            self.replyMessage(
                Message(text="🚦 Không tìm thấy ID hợp lệ trong mentions."),
                message_object, thread_id, thread_type, ttl=60000
            )
    except Exception as e:
        error_message = f"🚦 Không thể xóa kết bạn người dùng. Lỗi: {str(e)}"
        self.replyMessage(Message(text=error_message), message_object, thread_id, thread_type, ttl=60000)

def addallfriongr(message, message_object, thread_id, thread_type, author_id, self):
    if not admin_cao(self, author_id):
        self.replyMessage(
            Message(text="🚦Bạn không có quyền sử dụng lệnh này."),
            message_object, thread_id, thread_type, ttl=60000
        )
        return

    try:
        command, content = message.split(' ', 1)
    except ValueError:
        self.replyMessage(
            Message(text=f"🚦 Sai cú pháp. Vui lòng sử dụng: {self.prefix}kb\"Nội dung kết bạn\""),
            message_object, thread_id, thread_type, ttl=60000
        )
        return

    if not (content.startswith('"') and content.endswith('"')):
        warning_message = f"🚦 Vui lòng cung cấp nội dung trong dấu ngoặc kép. Ví dụ: {self.prefix}kb \"Nội dung kết bạn\""
        self.replyMessage(
            Message(text=warning_message), message_object, thread_id, thread_type, ttl=60000
        )
        return
    
    content = content.strip('"')

    try:
        group_info = self.fetchGroupInfo(thread_id).gridInfoMap[thread_id]
        members = group_info.get('memVerList', [])
        total_members = len(members)
        successful_requests = 0

        for mem in members:
            user_id = mem.split('_')[0]
            user_name = mem.split('_')[1]
            if content:  
                try:
                    self.sendFriendRequest(userId=user_id, msg=content)
                    successful_requests += 1 
                except Exception as e:
                    print(f"Lỗi khi gửi yêu cầu kết bạn cho {user_name}: {str(e)}")

            time.sleep(0) 

        success_message = (
            f"🚦 Đã gửi lời mời kết bạn đến {successful_requests}/{total_members} thành viên trong nhóm.\n"
            f"🚀 Nội dung tin nhắn: {content}"
        )
        self.replyMessage(Message(text=success_message), message_object, thread_id, thread_type, ttl=60000)

    except Exception as e:
        error_message = f"🚦 Lỗi: {str(e)}"
        self.replyMessage(Message(text=error_message), message_object, thread_id, thread_type, ttl=60000)