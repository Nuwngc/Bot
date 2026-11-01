/* ĐĂNG NHẬP ZALO BẰNG MÃ QR trong mục "Đăng nhập Zalo" của bot Zalo.
   Web tạo mã QR, bạn quét bằng Zalo trên điện thoại và bấm Đồng ý; web tự lấy cookie + IMEI,
   lưu mã hoá cho bot rồi bật bot. Cookie và IMEI không bao giờ gửi về trình duyệt.
   Dùng: api, say (app.js), zl (bots.js). Được nạp từ ui.js. */
(() => {
  const hint = document.getElementById("zlLoginHint");
  if (!hint || document.getElementById("zqStart") || typeof zl === "undefined") return;

  const g = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const FINAL = ["done", "declined", "expired", "error", "cancelled", "none"];

  const css = document.createElement("style");
  css.textContent = `
  .zq{margin:.4rem 0 1.1rem;padding:1rem;border-radius:16px;border:1px solid var(--line);background:linear-gradient(135deg,rgba(167,125,255,.1),rgba(232,64,122,.1)),var(--panel)}
  .zq-note{margin:.6rem 0 0;font-size:.82rem;color:var(--dim)}
  .zq-panel{margin-top:1rem;text-align:center}
  .zq-qr{position:relative;display:inline-block;min-width:11rem;min-height:11rem;border-radius:16px;background:#fff;padding:8px;line-height:0}
  .zq-qr img{width:min(15rem,70vw);height:auto;border-radius:10px;transition:filter .4s,opacity .4s}
  .zq-qr.dim img{filter:blur(6px);opacity:.35}
  .zq-qr .zq-ov{position:absolute;inset:0;display:grid;place-items:center;align-content:center;gap:.5rem;line-height:1.3;color:#111;font-weight:600;font-size:.9rem;padding:.5rem}
  .zq-ov img{width:3.4rem;height:3.4rem;border-radius:50%;filter:none;opacity:1}
  .zq-spin{width:2rem;height:2rem;border-radius:50%;border:3px solid #ddd;border-top-color:var(--lamp);animation:spin .8s linear infinite}
  .zq-status{margin:.8rem 0 .2rem;font-weight:600}
  .zq-status.bad{color:var(--alert)}.zq-status.ok{color:var(--ok)}
  .zq-steps{text-align:left;margin:.7rem auto 0;padding-left:1.2rem;max-width:22rem;font-size:.86rem;color:var(--dim)}
  .zq-steps li{margin:.25rem 0}.zq-steps b{color:var(--paper)}
  .zq-actions{display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;margin-top:.9rem}
  .zq-actions a{display:inline-flex;align-items:center;padding:.68rem 1.1rem;border-radius:12px;border:1px solid var(--line);background:var(--raised);color:var(--paper);text-decoration:none;font-weight:500}`;
  document.head.append(css);

  const box = document.createElement("div");
  box.className = "zq";
  box.innerHTML = `
    <button class="primary wide" id="zqStart" type="button">Đăng nhập bằng mã QR</button>
    <p class="zq-note" id="zqNote">Quét mã bằng Zalo trên điện thoại, web tự lấy cookie và IMEI rồi bật bot cho bạn. Không cần cài tiện ích hay tự copy cookie.</p>
    <div class="zq-panel" id="zqPanel" hidden>
      <div class="zq-qr" id="zqQr"><img id="zqImg" alt="Mã QR đăng nhập Zalo"><div class="zq-ov" id="zqOv" hidden></div></div>
      <div class="zq-status" id="zqStatus"></div>
      <ol class="zq-steps" id="zqSteps"></ol>
      <div class="zq-actions"><button id="zqCancel" type="button">Huỷ</button><a id="zqSave" download="zalo-qr.png" hidden>Lưu ảnh QR</a></div>
    </div>`;
  hint.before(box);
  const sep = document.createElement("p");
  sep.className = "hint";
  sep.textContent = "Hoặc nhập thủ công IMEI và cookie:";
  hint.before(sep);

  let timer = null, curId = null;
  const stop = () => { clearInterval(timer); timer = null; };

  function setStatus(text, kind = "") { const s = g("zqStatus"); s.textContent = text; s.className = "zq-status " + kind; }
  function steps(list) { g("zqSteps").innerHTML = list.map((t) => `<li>${t}</li>`).join(""); }
  function overlay(html) { const o = g("zqOv"); o.hidden = !html; o.innerHTML = html || ""; }

  function render(v) {
    const st = v.state, active = !FINAL.includes(st);          // starting, qr, scanned, saving
    const idle = st === "none" || st === "cancelled";
    const panel = g("zqPanel"), qr = g("zqQr"), img = g("zqImg"), save = g("zqSave");
    panel.hidden = idle;
    g("zqStart").hidden = active;
    g("zqStart").textContent = idle ? "Đăng nhập bằng mã QR" : "Tạo mã QR mới";
    g("zqCancel").hidden = !active;
    qr.hidden = !active;
    qr.classList.toggle("dim", st === "scanned" || st === "saving");
    save.hidden = true;
    overlay("");
    if (st === "starting") {
      img.removeAttribute("src");
      overlay('<div class="zq-spin"></div>');
      setStatus("Đang tạo mã QR…");
      steps([]);
    } else if (st === "qr") {
      img.src = v.image;
      save.href = v.image;
      save.hidden = false;
      setStatus("Quét mã bằng Zalo trên điện thoại");
      steps(["Mở <b>Zalo</b> trên điện thoại.", "Chạm vào biểu tượng <b>quét mã QR</b> (thanh tìm kiếm) và quét mã này.", "Bấm <b>Đồng ý</b> trên điện thoại để cho phép đăng nhập.", "Chỉ có một điện thoại? Bấm <b>Lưu ảnh QR</b> rồi chọn ảnh từ thư viện trong màn hình quét mã của Zalo."]);
    } else if (st === "scanned") {
      overlay((v.avatar ? `<img src="${esc(v.avatar)}" alt="">` : "") + `<div>${esc(v.name || "Đã quét")}</div>`);
      setStatus("Đã quét. Bấm Đồng ý trên điện thoại.");
      steps(["Xem lại tên tài khoản hiện trên điện thoại, rồi bấm <b>Đồng ý</b>.", "Không phải bạn quét? Bấm <b>Huỷ</b> hoặc từ chối trên điện thoại."]);
    } else if (st === "saving") {
      overlay('<div class="zq-spin"></div>');
      setStatus("Đang lưu đăng nhập…");
      steps([]);
    } else if (st === "done") {
      setStatus("Đăng nhập Zalo thành công. Đang bật bot…", "ok");
      steps(v.result && v.result.warn ? [esc(v.result.warn)] : []);
    } else if (!idle) {
      setStatus(v.error || "Đăng nhập QR không thành công.", "bad");
      steps([]);
    }
  }

  async function onDone(id) {
    say("Đã đăng nhập Zalo bằng mã QR.");
    try {
      await zl.load();
      const bots = (await api("/zalo/bots")).bots || [];
      const b = bots.find((x) => x.id === id);
      if (b && (b.status === "running" || b.status === "starting")) await api(`/zalo/bots/${id}/stop`, { method: "POST", body: "{}" });
    } catch (_) {}
    if (zl.st.sel === id) await zl.act(zl.botPath(id, "/start"), zl.post(), "Đang bật bot…", true);
    g("zqPanel").hidden = true; g("zqStart").hidden = false; g("zqStart").textContent = "Đăng nhập lại bằng mã QR";
  }

  async function poll() {
    const id = curId;
    if (!id || zl.st.sel !== id) { stop(); g("zqPanel").hidden = true; g("zqStart").hidden = false; return; }
    try {
      const v = await api(`/zalo/bots/${id}/qr`);
      if (id !== curId) return;
      render(v);
      if (FINAL.includes(v.state)) { stop(); if (v.state === "done") onDone(id); }
    } catch (e) { stop(); render({ state: "error", error: e.message }); }
  }

  g("zqStart").onclick = async () => {
    const id = zl.st.sel;
    if (!id) return say("Chọn hoặc tạo một bot Zalo trước.", "bad");
    stop(); curId = id;
    render({ state: "starting" });
    try {
      const v = await api(`/zalo/bots/${id}/qr/start`, { method: "POST", body: "{}" });
      render(v);
      timer = setInterval(poll, 1500);
    } catch (e) { render({ state: "error", error: e.message }); }
  };
  g("zqCancel").onclick = async () => {
    stop();
    if (curId) { try { await api(`/zalo/bots/${curId}/qr/cancel`, { method: "POST", body: "{}" }); } catch (_) {} }
    g("zqPanel").hidden = true; g("zqStart").hidden = false; g("zqStart").textContent = "Đăng nhập bằng mã QR";
  };

  // máy chủ chưa cài thư viện: báo rõ và dùng cách nhập tay
  api("/zalo/qr/support").then((d) => {
    if (d.available) return;
    g("zqStart").disabled = true;
    g("zqNote").textContent = "Đăng nhập bằng QR chưa sẵn sàng trên máy chủ này (chưa cài thư viện zca-js). Hãy nhập thủ công IMEI và cookie bên dưới.";
  }).catch(() => {});
})();
