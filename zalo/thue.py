def handle_mybot_real(bot, author_id, thread_id, message_text):
    def is_admin(user_id):
        admin_ids = ["0"]
        return user_id in admin_ids

    if not is_admin(author_id):
        return bot.sendMessage("❌ Bạn không có quyền truy cập hệ thống MyBot.", thread_id=thread_id)

    if message_text.lower() == "mybot":
        menu = (
            "【🤖 MYBOT ZALO RENTAL SYSTEM – MENU VIP 】\n"
            "> Xin chào! Đây là hệ thống thuê & quản lý Bot Zalo tự động – phiên bản nâng cấp.\n"
            "Mọi thao tác đều được bảo mật & kiểm soát bởi Dkhoa.\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            "[✨ CHỨC NĂNG CHÍNH]\n"
            "[📨] >taobot [imel] [cookie] [prefix] → Tạo bot Zalo từ email + session.\n"
            "[✅] >activebot @user → Kích hoạt bot & gán cho người dùng.\n"
            "[📆] >thuebot @user [số ngày] → Cho thuê Bot Zalo giới hạn thời gian.\n"
            "[📋] >dsbot → Danh sách bot đang cho thuê + trạng thái.\n"
            "[🔧] >qlybot → Truy cập bảng điều khiển bot.\n"
            "[⛔] >thuhoibot @user → Thu hồi quyền bot từ người thuê.\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            "[⚙️ QUẢN TRỊ NÂNG CAO]\n"
            "[⏱️] >timebot @user → Kiểm tra thời gian còn lại.\n"
            "[🔄] >giahanbot @user [ngày] → Gia hạn thêm thời gian thuê.\n"
            "[📛] >setprefix @user [ký tự] → Gán prefix riêng cho bot.\n"
            "[🛡️] >banbot @user → Tạm khoá bot người dùng.\n"
            "[♻️] >resetbot @user → Reset bot về mặc định.\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            "[📢 THÔNG TIN]\n"
            "[👑 Chủ hệ thống]: Dkhoa\n"
            "[🧠 Ghi nhớ]: MyBot nhớ người đã thuê, lịch sử thuê, lỗi.\n"
            "[🚀 Tự động hoá]: Bot tự ngắt khi hết hạn.\n"
            "[🔐 Bảo mật]: Mọi session/imel mã hoá bảo mật.\n"
        )
        return bot.sendMessage(menu, thread_id=thread_id)

if message_text.lower().startswith("mybot"):
    handle_mybot_real(bot, author_id, thread_id, message_text)
