/* Khung "Trợ lý AI (Gemini)" trong phần chi tiết bot Zalo.
   Dùng $, api, say, esc từ app.js và biến zl (bảng điều khiển Zalo) từ bots.js. */
(() => {
  const anchor = document.getElementById("zlPay");
  if (!anchor) return;

  const box = document.createElement("div");
  box.id = "gmBox";
  box.innerHTML = `
    <h3>Trợ lý AI (Gemini)</h3>
    <p class="hint">Cho bot trả lời bằng Gemini. Khoá API lấy miễn phí tại Google AI Studio (aistudio.google.com). Khoá được mã hoá khi lưu và không hiển thị lại. Trong Zalo, gõ <b>chat &lt;câu hỏi&gt;</b> với ký tự lệnh của bot. Trong nhóm, admin bot gõ <b>chat on</b> để bật trước. Lưu xong hãy tắt rồi bật lại bot để áp dụng.</p>
    <div class="field">
      <label for="gmKey">Khoá API Gemini</label>
      <input type="password" id="gmKey" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Dán khoá API để lưu hoặc thay">
      <div class="hint" id="gmKeyHint"></div>
    </div>
    <div class="field">
      <label for="gmModel">Model</label>
      <input type="text" id="gmModel" list="gmModels" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="gemini-flash-latest">
      <datalist id="gmModels">
        <option value="gemini-flash-latest"></option>
        <option value="gemini-flash-lite-latest"></option>
        <option value="gemini-2.5-flash"></option>
        <option value="gemini-2.5-flash-lite"></option>
        <option value="gemini-2.5-pro"></option>
      </datalist>
    </div>
    <div class="field">
      <label for="gmPrompt">Tính cách và cách trả lời (không bắt buộc)</label>
      <textarea id="gmPrompt" rows="4" maxlength="2000" placeholder="Ví dụ: Bạn là trợ lý của shop, trả lời lịch sự, ngắn gọn bằng tiếng Việt. Để trống sẽ dùng lời dặn mặc định."></textarea>
    </div>
    <div class="row">
      <button class="primary" id="gmSave" type="button">Lưu cấu hình AI</button>
      <button id="gmTest" type="button">Thử khoá</button>
      <button class="danger" id="gmClear" type="button">Xoá khoá</button>
    </div>
    <p class="hint" id="gmMsg"></p>`;
  anchor.before(box);

  const botId = () => (typeof zl !== "undefined" && zl.st ? zl.st.sel : null);
  const path = () => zl.botPath(botId(), "/gemini");
  const msg = (t, bad) => { const m = $("gmMsg"); m.textContent = t || ""; m.style.color = bad ? "var(--bad, #ff6b81)" : ""; };

  function show(d) {
    $("gmKeyHint").textContent = d.hasKey
      ? `Đã lưu khoá (${d.keyHint}). Để trống ô này nếu muốn giữ nguyên.`
      : d.sharedKey
        ? "Bot chưa có khoá riêng, đang dùng khoá chung của máy chủ."
        : "Chưa có khoá. Bot sẽ chưa trả lời được bằng AI.";
    $("gmKey").value = "";
    $("gmModel").value = d.model || "";
    $("gmModel").placeholder = d.defaultModel || "gemini-flash-latest";
    $("gmPrompt").value = d.prompt || "";
    $("gmClear").disabled = !d.hasKey;
    msg("");
  }

  async function load() {
    try { show(await api(path())); } catch (e) { msg(e.message, true); }
  }

  const post = (url, obj) => api(url, { method: "POST", body: JSON.stringify(obj) });

  $("gmSave").onclick = async () => {
    const b = $("gmSave");
    b.disabled = true;
    try {
      await post(path(), { key: $("gmKey").value, model: $("gmModel").value, prompt: $("gmPrompt").value });
      say("Đã lưu cấu hình AI. Tắt rồi bật lại bot để áp dụng.");
      await load();
    } catch (e) { say(e.message, "bad"); msg(e.message, true); }
    b.disabled = false;
  };

  $("gmTest").onclick = async () => {
    const b = $("gmTest");
    b.disabled = true;
    b.textContent = "Đang thử…";
    msg("");
    try {
      const d = await post(path() + "/test", { key: $("gmKey").value, model: $("gmModel").value });
      msg(`Khoá hoạt động tốt (model ${d.model}, Gemini trả lời: ${d.reply}).`);
    } catch (e) { msg(e.message, true); }
    b.disabled = false;
    b.textContent = "Thử khoá";
  };

  $("gmClear").onclick = async () => {
    const ask = typeof confirmBox === "function"
      ? confirmBox("Bot sẽ không trả lời bằng AI nữa cho đến khi bạn nhập khoá mới.", { title: "Xoá khoá Gemini?", ok: "Xoá khoá", danger: true })
      : Promise.resolve(confirm("Xoá khoá Gemini của bot này?"));
    if (!(await ask)) return;
    try {
      await post(path(), { clearKey: true, model: $("gmModel").value, prompt: $("gmPrompt").value });
      say("Đã xoá khoá Gemini.");
      await load();
    } catch (e) { say(e.message, "bad"); }
  };

  // Tải lại khi người dùng chọn bot khác
  let cur = null;
  setInterval(() => {
    const id = botId();
    if (id !== cur) { cur = id; if (id) load(); }
  }, 700);
})();
