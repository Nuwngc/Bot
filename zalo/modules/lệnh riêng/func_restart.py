import os
import sys


def Updatebot(bot, thread_id, author_id, message_object, thread_type):
    try:
        bot.sendReaction(message_object, "✅", thread_id, thread_type)
        python = sys.executable
        os.execl(python, python, *sys.argv)
    except Exception as e:
        bot.sendReaction(message_object, "❌", thread_id, thread_type)

base_dir = os.path.dirname(os.path.abspath(__file__))
cache_dir = os.path.join(base_dir, 'cache')
os.makedirs(cache_dir, exist_ok=True)