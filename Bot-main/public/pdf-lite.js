/* Ghi file PDF từ danh sách ảnh JPEG, không cần thư viện ngoài.
   Dùng trong trình duyệt (window.PdfLite) và trong Node để kiểm thử (module.exports). */
(function (root) {
  const PAGE = { a4: [595.28, 841.89], a5: [419.53, 595.28], letter: [612, 792] }; // đơn vị: point (1/72 inch)
  const MM = 72 / 25.4;
  const f = (n) => String(Math.round(n * 100) / 100);

  /** Tính khổ trang và vị trí đặt ảnh.
      opts: { size: "a4"|"a5"|"letter"|"fit", orient: "auto"|"portrait"|"landscape", marginMm } */
  function layout(iw, ih, opts) {
    const margin = Math.max(0, Number(opts.marginMm) || 0) * MM;
    if (opts.size === "fit" || !PAGE[opts.size]) {
      // Trang vừa khít ảnh (quy ước 150 điểm ảnh/inch), cộng lề
      const w = (iw * 72) / 150, h = (ih * 72) / 150;
      return { w: w + margin * 2, h: h + margin * 2, x: margin, y: margin, dw: w, dh: h };
    }
    let [pw, ph] = PAGE[opts.size];
    const land = opts.orient === "landscape" || (opts.orient !== "portrait" && iw > ih);
    if (land) [pw, ph] = [ph, pw];
    const bw = Math.max(1, pw - margin * 2), bh = Math.max(1, ph - margin * 2);
    const k = Math.min(bw / iw, bh / ih);
    const dw = iw * k, dh = ih * k;
    return { w: pw, h: ph, x: (pw - dw) / 2, y: (ph - dh) / 2, dw, dh };
  }

  /** pages: [{ jpg: Uint8Array, iw, ih, w, h, x, y, dw, dh }] -> Blob / Uint8Array PDF */
  function build(pages, info) {
    const enc = new TextEncoder();
    const chunks = [];
    let len = 0;
    const offsets = [];
    const push = (d) => { const u = typeof d === "string" ? enc.encode(d) : d; chunks.push(u); len += u.length; };
    const obj = (id, fn) => { offsets[id] = len; push(`${id} 0 obj\n`); fn(); push("\nendobj\n"); };

    const n = pages.length;
    const infoId = 3 + 3 * n;
    push("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");
    obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
    obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${3 + 3 * i} 0 R`).join(" ")}] >>`));
    pages.forEach((p, i) => {
      const pid = 3 + 3 * i, cid = pid + 1, iid = pid + 2;
      obj(pid, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(p.w)} ${f(p.h)}] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>`));
      const content = `q ${f(p.dw)} 0 0 ${f(p.dh)} ${f(p.x)} ${f(p.y)} cm /Im0 Do Q`;
      obj(cid, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
      obj(iid, () => {
        push(`<< /Type /XObject /Subtype /Image /Width ${p.iw} /Height ${p.ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpg.length} >>\nstream\n`);
        push(p.jpg);
        push("\nendstream");
      });
    });
    const d = new Date();
    const pad = (x) => String(x).padStart(2, "0");
    const stamp = `D:${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
    obj(infoId, () => push(`<< /Producer (Image to PDF) /CreationDate (${stamp}) >>`));

    const total = infoId;
    const xref = len;
    let x = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= total; i++) x += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    push(x);
    push(`trailer\n<< /Size ${total + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF`);

    if (typeof Blob !== "undefined") return new Blob(chunks, { type: "application/pdf" });
    const out = new Uint8Array(len);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  const api = { layout, build, PAGE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PdfLite = api;
})(typeof window !== "undefined" ? window : globalThis);
