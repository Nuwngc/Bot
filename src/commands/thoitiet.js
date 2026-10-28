/**
 * Thời tiết theo tên thành phố, dữ liệu Open-Meteo (không cần API key).
 */

const { getJson, plain } = require("./util");

const CODE = {
  0: "Trời quang", 1: "Ít mây", 2: "Có mây", 3: "Nhiều mây",
  45: "Sương mù", 48: "Sương mù đóng băng",
  51: "Mưa phùn nhẹ", 53: "Mưa phùn", 55: "Mưa phùn dày", 56: "Mưa phùn lạnh", 57: "Mưa phùn lạnh dày",
  61: "Mưa nhẹ", 63: "Mưa vừa", 65: "Mưa to", 66: "Mưa lạnh", 67: "Mưa lạnh to",
  71: "Tuyết nhẹ", 73: "Tuyết", 75: "Tuyết dày", 77: "Hạt tuyết",
  80: "Mưa rào nhẹ", 81: "Mưa rào", 82: "Mưa rào rất to", 85: "Tuyết rào nhẹ", 86: "Tuyết rào to",
  95: "Dông", 96: "Dông kèm mưa đá nhẹ", 99: "Dông kèm mưa đá to",
};
const desc = (c) => CODE[c] || "Không rõ";

async function geocode(name) {
  for (const q of [name, plain(name)]) {
    const url =
      "https://geocoding-api.open-meteo.com/v1/search?count=1&language=vi&format=json&name=" +
      encodeURIComponent(q);
    const data = await getJson(url);
    if (data.results && data.results.length) return data.results[0];
  }
  return null;
}

module.exports = {
  name: "Thời tiết",
  command: "thoitiet",
  aliases: ["weather", "tt"],
  group: "tien-ich",
  kind: "command",
  description: "Thời tiết: thoitiet Hà Nội",

  async run(args, msg, adapter, ctx) {
    const city = args.join(" ").trim();
    if (!city) return adapter.send(msg.threadId, `Cú pháp: ${ctx.prefix}thoitiet <tên thành phố>`);

    try {
      const place = await geocode(city);
      if (!place) return adapter.send(msg.threadId, `Không tìm thấy địa điểm "${city}".`);

      const url =
        "https://api.open-meteo.com/v1/forecast?timezone=auto&forecast_days=3" +
        `&latitude=${place.latitude}&longitude=${place.longitude}` +
        "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m" +
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max";
      const w = await getJson(url);
      const c = w.current;
      const d = w.daily;

      const days = d.time
        .map((t, i) => {
          const [, mm, dd] = t.split("-");
          return `• ${dd}/${mm}: ${desc(d.weather_code[i])}, ${Math.round(d.temperature_2m_min[i])}-${Math.round(d.temperature_2m_max[i])}°C, mưa ${d.precipitation_probability_max[i] ?? 0}%`;
        })
        .join("\n");

      return adapter.send(
        msg.threadId,
        `Thời tiết ${place.name}${place.country ? ", " + place.country : ""}\n` +
          `Hiện tại: ${desc(c.weather_code)}, ${Math.round(c.temperature_2m)}°C ` +
          `(cảm giác ${Math.round(c.apparent_temperature)}°C)\n` +
          `Độ ẩm ${c.relative_humidity_2m}%, gió ${Math.round(c.wind_speed_10m)} km/h\n\n` +
          `3 ngày tới:\n${days}`
      );
    } catch (err) {
      return adapter.send(msg.threadId, `Không lấy được thời tiết (${err.message}). Thử lại sau nhé.`);
    }
  },
};
