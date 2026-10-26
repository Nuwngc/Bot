from pytz import timezone
import requests
import threading
from core.bot_sys import is_admin, read_settings, write_settings
from zlapi.models import *

vn_tz = timezone('Asia/Ho_Chi_Minh')

locations = {
    'Hà Nội': {'latitude': 21.0285, 'longitude': 105.804},
    'Hồ Chí Minh': {'latitude': 10.8231, 'longitude': 106.6297},
    'Đà Nẵng': {'latitude': 16.0471, 'longitude': 108.2068},
    'Cần Thơ': {'latitude': 10.0457, 'longitude': 105.7469},
    'Hải Phòng': {'latitude': 20.8443, 'longitude': 106.6881},
    'An Giang': {'latitude': 10.4515, 'longitude': 105.0719},
    'Bà Rịa – Vũng Tàu': {'latitude': 10.4285, 'longitude': 107.2155},
    'Bắc Giang': {'latitude': 21.2716, 'longitude': 106.1942},
    'Bắc Kạn': {'latitude': 22.0049, 'longitude': 105.8494},
    'Bạc Liêu': {'latitude': 9.2896, 'longitude': 105.7171},
    'Bến Tre': {'latitude': 10.2435, 'longitude': 106.3776},
    'Bình Định': {'latitude': 13.0805, 'longitude': 109.2007},
    'Bình Dương': {'latitude': 10.9639, 'longitude': 106.6678},
    'Bình Phước': {'latitude': 11.2898, 'longitude': 106.9397},
    'Bình Thuận': {'latitude': 10.9333, 'longitude': 108.1097},
    'Cao Bằng': {'latitude': 22.6584, 'longitude': 106.2892},
    'Đắk Lắk': {'latitude': 12.6893, 'longitude': 108.0744},
    'Đắk Nông': {'latitude': 12.0104, 'longitude': 107.8124},
    'Điện Biên': {'latitude': 21.0291, 'longitude': 103.0061},
    'Đồng Nai': {'latitude': 10.9625, 'longitude': 106.6823},
    'Đồng Tháp': {'latitude': 10.4602, 'longitude': 105.7087},
    'Gia Lai': {'latitude': 13.9281, 'longitude': 108.0809},
    'Hà Giang': {'latitude': 22.1545, 'longitude': 104.9862},
    'Hà Nam': {'latitude': 20.5726, 'longitude': 105.8907},
    'Hà Tĩnh': {'latitude': 18.3389, 'longitude': 105.9114},
    'Hải Dương': {'latitude': 20.9294, 'longitude': 106.3181},
    'Hòa Bình': {'latitude': 20.8045, 'longitude': 105.3421},
    'Hưng Yên': {'latitude': 20.9241, 'longitude': 106.0671},
    'Khánh Hòa': {'latitude': 12.2389, 'longitude': 109.1967},
    'Kiên Giang': {'latitude': 10.0109, 'longitude': 104.1043},
    'Kon Tum': {'latitude': 13.0129, 'longitude': 108.0252},
    'Lai Châu': {'latitude': 22.3364, 'longitude': 103.3227},
    'Lâm Đồng': {'latitude': 11.9402, 'longitude': 108.4557},
    'Lạng Sơn': {'latitude': 21.8449, 'longitude': 106.7715},
    'Lào Cai': {'latitude': 22.4799, 'longitude': 103.9821},
    'Long An': {'latitude': 10.5695, 'longitude': 106.4204},
    'Nam Định': {'latitude': 20.4097, 'longitude': 106.1638},
    'Nghệ An': {'latitude': 19.2833, 'longitude': 104.2231},
    'Ninh Bình': {'latitude': 20.2583, 'longitude': 105.9762},
    'Ninh Thuận': {'latitude': 11.5971, 'longitude': 108.9305},
    'Phú Thọ': {'latitude': 21.3103, 'longitude': 105.1919},
    'Phú Yên': {'latitude': 13.0902, 'longitude': 109.3082},
    'Quảng Bình': {'latitude': 17.4905, 'longitude': 106.5991},
    'Quảng Nam': {'latitude': 15.5968, 'longitude': 108.2736},
    'Quảng Ngãi': {'latitude': 15.1312, 'longitude': 108.8055},
    'Quảng Ninh': {'latitude': 21.0469, 'longitude': 107.0837},
    'Sóc Trăng': {'latitude': 9.5951, 'longitude': 105.9719},
    'Sơn La': {'latitude': 21.3144, 'longitude': 103.9005},
    'Tây Ninh': {'latitude': 11.5576, 'longitude': 106.1349},
    'Thái Bình': {'latitude': 20.4469, 'longitude': 106.3384},
    'Thái Nguyên': {'latitude': 21.5976, 'longitude': 105.8427},
    'Thanh Hóa': {'latitude': 19.8052, 'longitude': 105.7847},
    'Thừa Thiên – Huế': {'latitude': 16.4633, 'longitude': 107.5952},
    'Tiền Giang': {'latitude': 10.4574, 'longitude': 106.3501},
    'Trà Vinh': {'latitude': 9.9372, 'longitude': 106.3506},
    'Tuyên Quang': {'latitude': 21.8251, 'longitude': 105.2234},
    'Vĩnh Long': {'latitude': 10.2534, 'longitude': 105.9702},
    'Vĩnh Phúc': {'latitude': 21.3279, 'longitude': 105.5496},
    'Yên Bái': {'latitude': 21.7155, 'longitude': 104.9053},
    'Afghanistan': {'latitude': 34.5553, 'longitude': 69.2075},
    'Albania': {'latitude': 41.3275, 'longitude': 19.8189},
    'Algeria': {'latitude': 36.7377, 'longitude': 3.0866},
    'Andorra': {'latitude': 42.5078, 'longitude': 1.5211},
    'Angola': {'latitude': -8.839, 'longitude': 13.2894},
    'Antigua and Barbuda': {'latitude': 17.1274, 'longitude': -61.8468},
    'Argentina': {'latitude': -34.6037, 'longitude': -58.3816},
    'Armenia': {'latitude': 40.1792, 'longitude': 44.4991},
    'Australia': {'latitude': -35.2809, 'longitude': 149.1300},
    'Austria': {'latitude': 48.2082, 'longitude': 16.3738},
    'Azerbaijan': {'latitude': 40.4093, 'longitude': 49.8671},
    'Bahamas': {'latitude': 25.0343, 'longitude': -77.3963},
    'Bahrain': {'latitude': 26.2235, 'longitude': 50.5876},
    'Bangladesh': {'latitude': 23.8103, 'longitude': 90.4125},
    'Barbados': {'latitude': 13.1939, 'longitude': -59.5432},
    'Belarus': {'latitude': 53.9, 'longitude': 27.5667},
    'Belgium': {'latitude': 50.8503, 'longitude': 4.3517},
    'Belize': {'latitude': 17.1899, 'longitude': -88.4976},
    'Benin': {'latitude': 6.3763, 'longitude': 2.4021},
    'Bhutan': {'latitude': 27.4728, 'longitude': 89.6395},
    'Bolivia': {'latitude': -16.5000, 'longitude': -68.1193},
    'Bosnia and Herzegovina': {'latitude': 43.8486, 'longitude': 18.3564},
    'Botswana': {'latitude': -24.6584, 'longitude': 25.9087},
    'Brazil': {'latitude': -15.7801, 'longitude': -47.9292},
    'Brunei': {'latitude': 4.5353, 'longitude': 114.7277},
    'Bulgaria': {'latitude': 42.6977, 'longitude': 23.3219},
    'Burkina Faso': {'latitude': 12.2383, 'longitude': -1.5616},
    'Burundi': {'latitude': -3.3731, 'longitude': 29.9189},
    'Cabo Verde': {'latitude': 14.933, 'longitude': -23.5133},
    'Cambodia': {'latitude': 11.5624, 'longitude': 104.9259},
    'Cameroon': {'latitude': 3.848, 'longitude': 11.5021},
    'Canada': {'latitude': 45.4215, 'longitude': -75.6992},
    'Central African Republic': {'latitude': 4.3947, 'longitude': 18.5582},
    'Chad': {'latitude': 12.1348, 'longitude': 15.0557},
    'Chile': {'latitude': -33.4489, 'longitude': -70.6693},
    'China': {'latitude': 39.9042, 'longitude': 116.4074},
    'Colombia': {'latitude': 4.7110, 'longitude': -74.0721},
    'Comoros': {'latitude': -11.6455, 'longitude': 43.3333},
    'Congo (Congo-Brazzaville)': {'latitude': -4.4419, 'longitude': 15.2663},
    'Costa Rica': {'latitude': 9.9281, 'longitude': -84.0907},
    'Croatia': {'latitude': 45.1, 'longitude': 15.2},
    'Cuba': {'latitude': 23.1136, 'longitude': -82.3666},
    'Cyprus': {'latitude': 35.1264, 'longitude': 33.4299},
    'Czech Republic': {'latitude': 50.0755, 'longitude': 14.4378},
    'Denmark': {'latitude': 55.6761, 'longitude': 12.5683},
    'Djibouti': {'latitude': 11.8251, 'longitude': 42.5903},
    'Dominica': {'latitude': 15.4149, 'longitude': -61.3704},
    'Dominican Republic': {'latitude': 18.7357, 'longitude': -70.1627},
    'Ecuador': {'latitude': -0.1807, 'longitude': -78.4678},
    'Egypt': {'latitude': 30.0444, 'longitude': 31.2357},
    'El Salvador': {'latitude': 13.6929, 'longitude': -89.2182},
    'Equatorial Guinea': {'latitude': 3.7492, 'longitude': 8.7379},
    'Eritrea': {'latitude': 15.332, 'longitude': 38.013},
    'Estonia': {'latitude': 59.437, 'longitude': 24.7535},
    'Eswatini': {'latitude': -26.5225, 'longitude': 31.4659},
    'Ethiopia': {'latitude': 9.145, 'longitude': 40.4897},
    'Fiji': {'latitude': -18.1248, 'longitude': 178.0650},
    'Finland': {'latitude': 60.1692, 'longitude': 24.9402},
    'France': {'latitude': 48.8566, 'longitude': 2.3522},
    'Gabon': {'latitude': 0.4162, 'longitude': 9.4673},
    'Gambia': {'latitude': 13.4549, 'longitude': -16.5790},
    'Georgia': {'latitude': 41.7151, 'longitude': 44.8271},
    'Germany': {'latitude': 52.5200, 'longitude': 13.4050},
    'Ghana': {'latitude': 5.6037, 'longitude': -0.1870},
    'Greece': {'latitude': 37.9838, 'longitude': 23.7275},
    'Grenada': {'latitude': 12.1165, 'longitude': -61.6790},
    'Guatemala': {'latitude': 14.6349, 'longitude': -90.5069},
    'Guinea': {'latitude': 9.9456, 'longitude': -9.6966},
    'Guinea-Bissau': {'latitude': 11.8037, 'longitude': -15.1804},
    'Guyana': {'latitude': 6.8013, 'longitude': -58.1550},
    'Haiti': {'latitude': 18.5944, 'longitude': -72.3074},
    'Honduras': {'latitude': 13.9431, 'longitude': -83.0000},
    'Hungary': {'latitude': 47.4979, 'longitude': 19.0402},
    'Iceland': {'latitude': 64.1355, 'longitude': -21.8954},
    'India': {'latitude': 28.6139, 'longitude': 77.2090},
    'Indonesia': {'latitude': -6.2088, 'longitude': 106.8456},
    'Iran': {'latitude': 35.6892, 'longitude': 51.3890},
    'Iraq': {'latitude': 33.3152, 'longitude': 44.3661},
    'Ireland': {'latitude': 53.3498, 'longitude': -6.2603},
    'Israel': {'latitude': 31.7683, 'longitude': 35.2137},
    'Italy': {'latitude': 41.9028, 'longitude': 12.4964},
    'Jamaica': {'latitude': 18.1096, 'longitude': -77.2975},
    'Japan': {'latitude': 35.6762, 'longitude': 139.6503},
    'Jordan': {'latitude': 31.9634, 'longitude': 35.9300},
    'Kazakhstan': {'latitude': 51.1694, 'longitude': 71.4491},
    'Kenya': {'latitude': -1.2867, 'longitude': 36.8219},
    'Kiribati': {'latitude': -1.4515, 'longitude': 173.0322},
    'Korea North': {'latitude': 39.0392, 'longitude': 125.7625},
    'Korea South': {'latitude': 37.5665, 'longitude': 126.9780},
    'Kuwait': {'latitude': 29.3759, 'longitude': 47.9774},
    'Kyrgyzstan': {'latitude': 42.8746, 'longitude': 74.6126},
    'Laos': {'latitude': 17.9757, 'longitude': 102.6331},
    'Latvia': {'latitude': 56.946, 'longitude': 24.1059},
    'Lebanon': {'latitude': 33.8886, 'longitude': 35.4955},
    'Lesotho': {'latitude': -29.6094, 'longitude': 28.2336},
    'Liberia': {'latitude': 6.4281, 'longitude': -9.4295},
    'Libya': {'latitude': 32.8872, 'longitude': 13.1913},
    'Liechtenstein': {'latitude': 47.1415, 'longitude': 9.5215},
    'Lithuania': {'latitude': 54.6892, 'longitude': 25.2798},
    'Luxembourg': {'latitude': 49.6117, 'longitude': 6.13},
    'Madagascar': {'latitude': -18.8792, 'longitude': 47.5079},
    'Malawi': {'latitude': -13.2543, 'longitude': 34.3015},
    'Malaysia': {'latitude': 3.139, 'longitude': 101.6869},
    'Maldives': {'latitude': 3.2028, 'longitude': 73.2207},
    'Mali': {'latitude': 12.6392, 'longitude': -8.0029},
    'Malta': {'latitude': 35.8997, 'longitude': 14.5147},
    'Marshall Islands': {'latitude': 7.094, 'longitude': 171.3802},
    'Mauritania': {'latitude': 18.075, 'longitude': -15.9795},
    'Mauritius': {'latitude': -20.2290, 'longitude': 57.5050},
    'Mexico': {'latitude': 19.4326, 'longitude': -99.1332},
    'Micronesia': {'latitude': 6.9206, 'longitude': 158.2491},
    'Moldova': {'latitude': 47.0105, 'longitude': 28.8638},
    'Monaco': {'latitude': 43.7333, 'longitude': 7.4167},
    'Mongolia': {'latitude': 47.8864, 'longitude': 106.9057},
    'Montenegro': {'latitude': 42.4411, 'longitude': 19.2636},
    'Morocco': {'latitude': 34.020882, 'longitude': -6.84165},
    'Mozambique': {'latitude': -25.9664, 'longitude': 32.5892},
    'Myanmar': {'latitude': 16.8409, 'longitude': 96.1735},
    'Namibia': {'latitude': -22.5597, 'longitude': 17.0832},
    'Nauru': {'latitude': -0.5477, 'longitude': 166.9200},
    'Nepal': {'latitude': 27.7172, 'longitude': 85.3240},
    'Netherlands': {'latitude': 52.3676, 'longitude': 4.9041},
    'New Zealand': {'latitude': -36.8485, 'longitude': 174.7633},
    'Nicaragua': {'latitude': 12.1364, 'longitude': -86.2512},
    'Niger': {'latitude': 13.5128, 'longitude': 2.1128},
    'Nigeria': {'latitude': 9.082, 'longitude': 8.6753},
    'North Macedonia': {'latitude': 41.9981, 'longitude': 21.4254},
    'Norway': {'latitude': 59.9139, 'longitude': 10.7461},
    'Oman': {'latitude': 23.585, 'longitude': 58.4059},
    'Pakistan': {'latitude': 33.6844, 'longitude': 73.0479},
    'Palau': {'latitude': 7.51498, 'longitude': 134.5825},
    'Panama': {'latitude': 8.9824, 'longitude': -79.5190},
    'Papua New Guinea': {'latitude': -9.4438, 'longitude': 147.1803},
    'Paraguay': {'latitude': -25.2637, 'longitude': -57.5759},
    'Peru': {'latitude': -12.0464, 'longitude': -77.0428},
    'Philippines': {'latitude': 14.5995, 'longitude': 120.9842},
    'Poland': {'latitude': 52.2298, 'longitude': 21.0118},
    'Portugal': {'latitude': 38.7169, 'longitude': -9.1395},
    'Qatar': {'latitude': 25.276987, 'longitude': 51.520008},
    'Romania': {'latitude': 44.4268, 'longitude': 26.1025},
    'Russia': {'latitude': 55.7558, 'longitude': 37.6173},
    'Rwanda': {'latitude': -1.9403, 'longitude': 29.8739},
    'Saint Kitts and Nevis': {'latitude': 17.3576, 'longitude': -62.7834},
    'Saint Lucia': {'latitude': 13.9094, 'longitude': -60.9789},
    'Saint Vincent and the Grenadines': {'latitude': 13.2528, 'longitude': -61.1977},
    'Samoa': {'latitude': -13.7590, 'longitude': -172.1046},
    'San Marino': {'latitude': 43.9333, 'longitude': 12.45},
    'São Tomé and Príncipe': {'latitude': 0.1864, 'longitude': 6.6131},
    'Saudi Arabia': {'latitude': 24.7136, 'longitude': 46.6753},
    'Senegal': {'latitude': 14.6928, 'longitude': -17.4467},
    'Serbia': {'latitude': 44.8176, 'longitude': 20.4633},
    'Seychelles': {'latitude': -4.6293, 'longitude': 55.4510},
    'Sierra Leone': {'latitude': 8.4657, 'longitude': -13.2317},
    'Singapore': {'latitude': 1.3521, 'longitude': 103.8198},
    'Slovakia': {'latitude': 48.1482, 'longitude': 17.1067},
    'Slovenia': {'latitude': 46.0511, 'longitude': 14.5051},
    'Solomon Islands': {'latitude': -9.4295, 'longitude': 160.0101},
    'Somalia': {'latitude': 2.0469, 'longitude': 45.3182},
    'South Africa': {'latitude': -25.7461, 'longitude': 28.1881},
    'South Sudan': {'latitude': 4.8594, 'longitude': 31.5712},
    'Spain': {'latitude': 40.4168, 'longitude': -3.7038},
    'Sri Lanka': {'latitude': 6.9271, 'longitude': 79.8612},
    'Sudan': {'latitude': 15.5007, 'longitude': 32.5599},
    'Suriname': {'latitude': 5.8661, 'longitude': -55.1711},
    'Sweden': {'latitude': 59.3293, 'longitude': 18.0686},
    'Switzerland': {'latitude': 46.9481, 'longitude': 7.4474},
    'Syria': {'latitude': 33.5138, 'longitude': 36.2765},
    'Taiwan': {'latitude': 25.0329, 'longitude': 121.5654},
    'Tajikistan': {'latitude': 38.5367, 'longitude': 68.7791},
    'Tanzania': {'latitude': -6.7924, 'longitude': 39.2083},
    'Thailand': {'latitude': 13.7563, 'longitude': 100.5018},
    'Timor-Leste': {'latitude': -8.5569, 'longitude': 125.5872},
    'Togo': {'latitude': 6.1725, 'longitude': 1.2315},
    'Tonga': {'latitude': -21.1789, 'longitude': -175.1982},
    'Trinidad and Tobago': {'latitude': 10.6918, 'longitude': -61.2225},
    'Tunisia': {'latitude': 36.8065, 'longitude': 10.1815},
    'Turkey': {'latitude': 41.0082, 'longitude': 28.9784},
    'Turkmenistan': {'latitude': 37.9601, 'longitude': 58.3792},
    'Tuvalu': {'latitude': -7.1095, 'longitude': 179.1940},
    'Uganda': {'latitude': 0.3136, 'longitude': 32.5810},
    'Ukraine': {'latitude': 50.4501, 'longitude': 30.5236},
    'United Arab Emirates': {'latitude': 23.4241, 'longitude': 53.8478},
    'United Kingdom': {'latitude': 51.5074, 'longitude': -0.1278},
    'United States': {'latitude': 38.9072, 'longitude': -77.0369},
    'Uruguay': {'latitude': -34.9011, 'longitude': -56.1645},
    'Uzbekistan': {'latitude': 41.2995, 'longitude': 69.2401},
    'Vanuatu': {'latitude': -17.7333, 'longitude': 168.3219},
    'Vatican City': {'latitude': 41.9029, 'longitude': 12.4534},
    'Venezuela': {'latitude': 10.4806, 'longitude': -66.8772},
    'Vietnam': {'latitude': 21.0285, 'longitude': 105.804},
    'Yemen': {'latitude': 15.3694, 'longitude': 44.1910},
    'Zambia': {'latitude': -15.3875, 'longitude': 28.3228},
    'Zimbabwe': {'latitude': -17.8292, 'longitude': 31.0522},
}

def fetch_weather_info(area):
    if area not in locations:
        return "Không tìm thấy địa điểm này!"
    
    latitude = locations[area]['latitude']
    longitude = locations[area]['longitude']
    
    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={latitude}&longitude={longitude}&"
        f"current_weather=true&"
        f"daily=precipitation_sum,temperature_2m_max,temperature_2m_min,weathercode&"
        f"timezone=auto"
    )
    
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as e:
        return f"Lỗi khi lấy dữ liệu thời tiết: {str(e)}"

    if 'daily' not in data or 'current_weather' not in data:
        return "Không thể lấy thông tin thời tiết từ API."

    daily_data = data['daily']
    weather_code = daily_data['weathercode'][0]
    min_temp = daily_data['temperature_2m_min'][0]
    max_temp = daily_data['temperature_2m_max'][0]
    precipitation = daily_data['precipitation_sum'][0]
    current_temp = data['current_weather']['temperature']

    weather_info = create_weather_message(area, weather_code, min_temp, max_temp, precipitation, current_temp)
    return weather_info
def create_weather_message(area, weather_code, min_temp, max_temp, precipitation, current_temp):
    weather_descriptions = {
        0: "Trời quang",
        1: "Chủ yếu là trời quang",
        2: "Mây rải rác",
        3: "Mây nhiều",
        45: "Sương mù",
        48: "Sương mù đóng băng",
        51: "Mưa phùn nhẹ",
        53: "Mưa phùn vừa",
        55: "Mưa phùn dày",
        61: "Mưa nhẹ",
        63: "Mưa vừa",
        65: "Mưa lớn",
        71: "Tuyết rơi nhẹ",
        73: "Tuyết rơi vừa",
        75: "Tuyết rơi dày",
        80: "Mưa rào nhẹ",
        81: "Mưa rào vừa",
        82: "Mưa rào lớn",
        95: "Dông bão",
        96: "Dông bão với mưa đá nhẹ",
        99: "Dông bão với mưa đá nặng"
    }
    
    weather_description = weather_descriptions.get(weather_code, "Thời tiết không xác định")

    message = (
        f"📢 [THÔNG BÁO THỜI TIẾT]\n"
        f"Thời tiết của {area} hôm nay:\n"
        f"Dự kiến thời tiết: {weather_description}\n"
        f"🌡 Nhiệt độ thấp nhất - cao nhất: {min_temp}°C - {max_temp}°C\n"
        f"🌡 Nhiệt độ hiện tại: {current_temp}°C\n"
        f"🌧 Lượng mưa: {precipitation} mm\n"
    )
    return message

def handle_weather_on(bot, thread_id):
    settings = read_settings(bot.uid)
    if "weather" not in settings:
        settings["weather"] = {}
    settings["weather"][thread_id] = True
    write_settings(bot.uid, settings)
    return f"🚦Lệnh {bot.prefix}weather đã được Bật 🚀 trong nhóm này ✅"

def handle_weather_off(bot, thread_id):
    settings = read_settings(bot.uid)
    if "weather" in settings and thread_id in settings["weather"]:
        settings["weather"][thread_id] = False
        write_settings(bot.uid, settings)
        return f"🚦Lệnh {bot.prefix}weather đã Tắt ⭕️ trong nhóm này ✅"
    return "🚦Nhóm chưa có thông tin cấu hình weather để ⭕️ Tắt 🤗"

def handle_weather_command(message, message_object, thread_id, thread_type, author_id, client):
    args = message.split(" ", 1)
    area = args[1].strip() if len(args) > 1 else "Đồng Nai"
    settings = read_settings(client.uid)
    
    user_message = message.replace(f"{client.prefix}weather ", "").strip().lower()
    if user_message == "on":
        if not is_admin(client, author_id):  
            response = "❌Bạn không phải admin bot!"
        else:
            response = handle_weather_on(client, thread_id)
        client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
        return
    elif user_message == "off":
        if not is_admin(client, author_id):  
            response = "❌Bạn không phải admin bot!"
        else:
            response = handle_weather_off(client, thread_id)
        client.replyMessage(Message(text=response), thread_id=thread_id, thread_type=thread_type, replyMsg=message_object)
        return
    
    if not (settings.get("weather", {}).get(thread_id, False)):
        return
    def send_weather():
        weather_info = fetch_weather_info(area)
        try:
            client.sendMessage(
                Message(text=f"[Shin Yeu Em]\n{weather_info}"),
                thread_id,
                thread_type,
                ttl=120000
            )
        except Exception as e:
            error_msg = f"Lỗi khi gửi tin nhắn: {str(e)}"
            client.sendMessage(
                Message(text=error_msg),
                thread_id,
                thread_type,
                ttl=120000
            )

    weather_thread = threading.Thread(target=send_weather)
    weather_thread.start()