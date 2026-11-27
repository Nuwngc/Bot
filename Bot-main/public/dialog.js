/* Hộp thoại xác nhận / nhập liệu thay cho confirm() và prompt() của trình duyệt.
   Dùng:
     if (await confirmBox("Nội dung", { title: "Tiêu đề", ok: "Xoá", danger: true })) { ... }
     const v = await promptBox("Nội dung", { value: "30", validate: (s) => s ? "" : "Chưa nhập" });
     // v === null khi bấm Huỷ / Esc / bấm ra ngoài
   File độc lập, nhận màu từ biến CSS nên đổi sáng/tối là tự theo. */
(() => {
  const ICONS = {
    ask: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.5-1.2 1-1.2 1.9M12 17h.01"/></svg>',
    danger: '<svg viewBox="0 0 24 24"><path d="M12 3.5 2.6 19.5h18.8L12 3.5z"/><path d="M12 10v4.2M12 17.2h.01"/></svg>',
    ok: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12.4 2.6 2.6L16 9.6"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/></svg>',
  };

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  let seq = 0;
  let chain = Promise.resolve(); // nhiều hộp thoại cùng lúc thì xếp hàng, hiện lần lượt

  function run(o) {
    return new Promise((resolve) => {
      const id = "dlg" + ++seq;
      const prevFocus = document.activeElement;
      const isPrompt = !!o.prompt;

      const scrim = el("div", "dlg-scrim" + (isPrompt ? " has-input" : ""));
      const dlg = el("div", "dlg " + o.kind);
      dlg.setAttribute("role", o.danger ? "alertdialog" : "dialog");
      dlg.setAttribute("aria-modal", "true");
      dlg.setAttribute("aria-labelledby", id + "t");
      if (o.message) dlg.setAttribute("aria-describedby", id + "m");

      const ico = el("div", "dlg-ico");
      ico.innerHTML = ICONS[o.kind] || ICONS.ask;
      const title = el("h3", "dlg-title", o.title);
      title.id = id + "t";
      dlg.append(ico, title);

      if (o.message) {
        const msg = el("p", "dlg-msg", o.message);
        msg.id = id + "m";
        dlg.append(msg);
      }

      let input = null, err = null;
      if (isPrompt) {
        input = el("input", "dlg-input");
        input.type = o.type === "password" ? "password" : "text";
        input.value = o.value || "";
        input.placeholder = o.placeholder || "";
        input.autocomplete = o.type === "password" ? "current-password" : "off";
        input.autocapitalize = "off";
        input.spellcheck = false;
        if (o.maxLength) input.maxLength = o.maxLength;
        input.setAttribute("aria-label", o.title);
        err = el("div", "dlg-err");
        err.setAttribute("role", "alert");
        dlg.append(input, err);
      }

      const actions = el("div", "dlg-actions");
      const cancel = el("button", "", o.cancel);
      cancel.type = "button";
      const ok = el("button", o.danger ? "danger solid" : "primary", o.ok);
      ok.type = "button";
      actions.append(cancel, ok);
      dlg.append(actions);
      scrim.append(dlg);

      let done = false;
      const close = (val) => {
        if (done) return;
        done = true;
        document.removeEventListener("keydown", onKey, true);
        scrim.classList.add("out");
        setTimeout(() => {
          scrim.remove();
          if (!document.querySelector(".dlg-scrim")) document.body.classList.remove("dlg-open");
          try { prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true }); } catch (_) {}
        }, 170);
        resolve(val);
      };

      const submit = () => {
        if (!isPrompt) return close(true);
        const v = o.type === "password" ? input.value : input.value.trim();
        let msg = "";
        if (!v && !o.allowEmpty) msg = "Hãy nhập một giá trị.";
        else if (o.validate) msg = o.validate(v) || "";
        if (msg) {
          err.textContent = msg;
          input.setAttribute("aria-invalid", "true");
          dlg.classList.remove("shake");
          void dlg.offsetWidth; // chạy lại hiệu ứng rung
          dlg.classList.add("shake");
          input.focus();
          return;
        }
        close(v);
      };

      function onKey(e) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          return close(isPrompt ? null : false);
        }
        if (e.key === "Enter" && isPrompt && e.target === input) {
          e.preventDefault();
          return submit();
        }
        if (e.key === "Tab") {
          // giữ phím Tab xoay vòng trong hộp thoại
          const items = [...dlg.querySelectorAll("input, button")].filter((x) => !x.disabled);
          const first = items[0], last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
          else if (!dlg.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        }
      }

      if (input) input.addEventListener("input", () => { err.textContent = ""; input.removeAttribute("aria-invalid"); });
      cancel.onclick = () => close(isPrompt ? null : false);
      ok.onclick = submit;
      // bấm ra ngoài khung = huỷ (chỉ tính khi bấm trúng nền, không tính kéo chọn chữ)
      let downOnScrim = false;
      scrim.addEventListener("pointerdown", (e) => { downOnScrim = e.target === scrim; });
      scrim.addEventListener("click", (e) => { if (downOnScrim && e.target === scrim) close(isPrompt ? null : false); });

      document.addEventListener("keydown", onKey, true);
      document.body.classList.add("dlg-open");
      document.body.append(scrim);

      // Xoá/huỷ nguy hiểm thì đặt tiêu điểm vào nút Huỷ để lỡ bấm Enter không mất dữ liệu
      if (input) { input.focus(); input.select(); }
      else (o.danger ? cancel : ok).focus();
    });
  }

  function open(o) {
    const p = chain.then(() => run(o));
    chain = p.catch(() => {});
    return p;
  }

  /** Hỏi Đồng ý / Huỷ. Trả về true hoặc false. */
  window.confirmBox = (message, opts = {}) =>
    open({
      message,
      title: opts.title || "Xác nhận",
      ok: opts.ok || "Đồng ý",
      cancel: opts.cancel || "Huỷ",
      danger: !!opts.danger,
      kind: opts.kind || (opts.danger ? "danger" : "ask"),
    });

  /** Hỏi nhập một dòng chữ. Trả về chuỗi (đã cắt khoảng trắng) hoặc null nếu huỷ. */
  window.promptBox = (message, opts = {}) =>
    open({
      prompt: true,
      message,
      title: opts.title || "Nhập thông tin",
      ok: opts.ok || "Lưu",
      cancel: opts.cancel || "Huỷ",
      danger: false,
      kind: opts.kind || "edit",
      value: opts.value,
      placeholder: opts.placeholder,
      maxLength: opts.maxLength,
      allowEmpty: !!opts.allowEmpty,
      type: opts.type,
      validate: opts.validate,
    });
})();
