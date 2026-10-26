from zlapi.models import Message, MultiMsgStyle, MessageStyle
import requests
from bs4 import BeautifulSoup

des = {
    'version': "1.0.1",
    'credits': "Vũ Xuân Kiên",
    'description': "Lệnh tìm kiếm thông tin trên Google",
    'power': "admin"
}

# ===== LỆNH GG =====
def handle_gg_command(message, message_object, thread_id, thread_type, author_id, client):
    parts = message.split(" ", 1)

    if len(parts) < 2:
        reply(client, message_object, thread_id, thread_type, "❗ Vui lòng nhập từ khóa cần tìm")
        return

    query = parts[1].strip()
    results = search_google(query)

    if not results:
        msg = f"❌ Không tìm thấy kết quả cho: {query}"
    else:
        text = "\n\n".join(
            [f"{i+1}. {title}\n🔗 {link}" for i, (title, link) in enumerate(results[:5])]
        )
        msg = f"🔍 Kết quả tìm kiếm cho: {query}\n\n{text}"

    reply(client, message_object, thread_id, thread_type, msg)


# ===== TÌM GOOGLE =====
def search_google(query):
    url = "https://www.google.com/search"
    headers = {
        "User-Agent": "Mozilla/5.0"
    }
    params = {"q": query}

    try:
        res = requests.get(url, headers=headers, params=params, timeout=10)
        res.raise_for_status()
    except Exception:
        return []

    soup = BeautifulSoup(res.text, "html.parser")
    results = []

    for g in soup.select("div.yuRUbf a"):
        title = g.select_one("h3")
        if title:
            results.append((title.text, g["href"]))

    return results


# ===== REPLY =====
def reply(client, message_object, thread_id, thread_type, text):
    styles = MultiMsgStyle([
        MessageStyle(
            offset=0,
            length=10000,
            style="font",
            size="10",
            auto_format=False
        )
    ])

    client.replyMessage(
        Message(text=text, style=styles),
        message_object,
        thread_id,
        thread_type,
        ttl=86400000
    )


# ===== EXPORT LỆNH =====
def ft_vxkiue():
    return {
        "gg": handle_gg_command
    }