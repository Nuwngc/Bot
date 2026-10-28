/**
 * Giá vàng SJC (cùng nguồn với bot Zalo). Mặc định hiện chi nhánh Hồ Chí Minh.
 *   !giavang          chi nhánh Hồ Chí Minh
 *   !giavang hà nội   chi nhánh khác (gõ một phần tên)
 *   !giavang all      tất cả chi nhánh
 */

const { getJson, plain } = require("./util");

const SJC = "https://sjc.com.vn/GoldPrice/Services/PriceService.ashx";
const money = (v) => Number(v).toLocaleString("vi-VN");

module.exports = {
  name: "Giá vàng",
  command: "giavang",
  aliases: ["vang"],
  group: "tien-ich",
  kind: "command",
  description: "Giá vàng SJC: giavang [tỉnh|all]",

  async run(args, msg, adapter) {
    try {
      const data = await getJson(SJC);
      if (!data.success) throw new Error("SJC không trả dữ liệu");

      const byBranch = new Map();
      for (const it of data.data) {
        if (!byBranch.has(it.BranchName)) byBranch.set(it.BranchName, []);
        byBranch.get(it.BranchName).push(it);
      }

      const want = plain(args.join(" "));
      let names = [...byBranch.keys()];
      if (want && want !== "all") {
        names = names.filter((n) => plain(n).includes(want));
        if (!names.length) return adapter.send(msg.threadId, `Không có chi nhánh "${args.join(" ")}".`);
      } else if (!want) {
        const hcm = names.find((n) => plain(n).includes("ho chi minh"));
        names = [hcm || names[0]];
      }

      const lines = [`Giá vàng SJC - cập nhật ${data.latestDate}`];
      for (const n of names) {
        lines.push(`\n${n.toUpperCase()}`);
        for (const it of byBranch.get(n)) {
          lines.push(`• ${it.TypeName}\n  Mua: ${money(it.BuyValue)} | Bán: ${money(it.SellValue)}`);
        }
      }
      return adapter.send(msg.threadId, lines.join("\n").slice(0, 4000));
    } catch (err) {
      return adapter.send(msg.threadId, `Không lấy được giá vàng (${err.message}).`);
    }
  },
};
