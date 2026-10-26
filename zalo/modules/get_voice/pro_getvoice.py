import json
import os
import requests


def handle_getvoice_command(message, message_object, thread_id, thread_type, author_id, client):
    msg_obj = message_object
    if msg_obj.quote:
        attach = msg_obj.quote.attach
        if attach:
            try:
                attach_data = json.loads(attach)
            except json.JSONDecodeError as e:
                print(f"Lỗi khi phân tích JSON: {str(e)}")
                return

            video_url = attach_data.get('hdUrl') or attach_data.get('href')
            if video_url:
                download_path = "downloaded_audio.mp4"
                send_voice_from_video(video_url, download_path, thread_id, thread_type, client)
            else:
                send_error_message(thread_id, thread_type, client, "Không tìm thấy URL video.")
        else:
            send_error_message(thread_id, thread_type, client, "Vui lòng reply tin nhắn chứa video.")
    else:
        send_error_message(thread_id, thread_type, client, "Vui lòng reply tin nhắn chứa video.")


def send_voice_from_video(uguu_url, download_path, thread_id, thread_type, client):
    try:
        audio_file = download_file_from_url(uguu_url, download_path)

        if not audio_file:
            send_error_message(thread_id, thread_type, client, "Không thể tải video từ Uguu.")
            return

        uploaded_url = upload_to_uguu(audio_file)
        if uploaded_url:
            print(f"Đã upload tệp lên Uguu: {uploaded_url}")
            if hasattr(client, 'sendRemoteVoice'):
                client.sendRemoteVoice(uploaded_url, thread_id, thread_type)
            else:
                print("Client không hỗ trợ gửi voice.")
        else:
            send_error_message(thread_id, thread_type, client, "Không thể upload tệp âm thanh lên Uguu.")

        os.remove(audio_file)
        print(f"Đã xóa tệp: {audio_file}")

    except Exception as e:
        print(f"Lỗi khi gửi voice từ video: {str(e)}")
        send_error_message(thread_id, thread_type, client, "Không thể gửi voice từ video này.")


def download_file_from_url(url, download_path):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
    }

    try:
        print(f"Đang tải từ {url} tới {download_path}")
        response = requests.get(url, headers=headers, stream=True)
        response.raise_for_status()
        with open(download_path, 'wb') as file:
            for chunk in response.iter_content(chunk_size=1024):
                if chunk:
                    file.write(chunk)
        return download_path
    except Exception as e:
        print(f"Lỗi khi tải file từ URL: {e}")
        return None


def upload_to_uguu(file_path):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
    }

    try:
        with open(file_path, 'rb') as file:
            files = {'files[]': file}
            print(f"➜   Uploading file to Uguu: {file_path}")
            response = requests.post("https://uguu.se/upload", files=files, headers=headers)
        
        if response.status_code == 200:
            result = response.json()
            if result.get("success"):
                print(f"➜   Upload thành công!: {file_path}")
                uploaded_url = result["files"][0]["url"]
                return uploaded_url
            else:
                return None
        else:
            return None
    except Exception as e:
        print(f"➜   Lỗi khi upload file lên Uguu: {e}")
        return None


def send_error_message(thread_id, thread_type, client, error_message="Lỗi không xác định."):
    if hasattr(client, 'send_message'):
        client.send_message(thread_id, thread_type, error_message)
    else:
        print("Client không hỗ trợ gửi tin nhắn.")