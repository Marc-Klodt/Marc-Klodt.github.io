(function (global) {
  "use strict";

  const R = global.LPRender;
  const G = global.LPGeom;
  const MM = 72 / 25.4;
  const DPI = 140;
  const OVERLAP_MM = 8;

  function paperPortraitMm(format) {
    if (format === "A2") return { w: 420, h: 594 };
    if (format === "A3") return { w: 297, h: 420 };
    return { w: 210, h: 297 };
  }

  function orientMm(format, landscape) {
    const p = paperPortraitMm(format);
    return landscape
      ? { w: Math.max(p.w, p.h), h: Math.min(p.w, p.h) }
      : { w: Math.min(p.w, p.h), h: Math.max(p.w, p.h) };
  }

  function a4Mm(landscape) {
    return landscape ? { w: 297, h: 210 } : { w: 210, h: 297 };
  }

  function mmToPx(mm) {
    return Math.max(1, Math.round(mm / 25.4 * DPI));
  }

  function planAspect(state) {
    const boxes = [];
    if (state.outline.points.length) boxes.push(G.polygonBounds(state.outline.points));
    state.items.forEach((item) => boxes.push(G.itemBBox(item)));
    if (!boxes.length) return 1.4;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    boxes.forEach((b) => {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.d);
    });
    return Math.max(0.2, (maxX - minX) / Math.max(1, maxY - minY));
  }

  function tileLayout(format, landscape) {
    if (format === "A4") return { cols: 1, rows: 1 };
    if (format === "A3") {
      return landscape ? { cols: 2, rows: 1 } : { cols: 1, rows: 2 };
    }
    return { cols: 2, rows: 2 };
  }

  function printHint(format, tileA4) {
    if (format === "A4") return "Ein A4-Blatt im gewählten Maßstab.";
    if (!tileA4) {
      return format === "A3"
        ? "Eine A3-Seite. Nur für Drucker mit A3-Fach."
        : "Eine A2-Seite. Nur für Großformatdrucker.";
    }
    return format === "A3"
      ? "A3 wird auf 2 A4-Blätter aufgeteilt. Blätter an den Markierungen zusammenkleben."
      : "A2 wird auf 4 A4-Blätter aufgeteilt. Blätter an den Markierungen zusammenkleben.";
  }

  function canvasToJpeg(canvas, quality) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality || 0.9);
    const raw = atob(dataUrl.split(",")[1]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  function concatBytes(parts) {
    let total = 0;
    parts.forEach((p) => {
      total += p.length;
    });
    const out = new Uint8Array(total);
    let offset = 0;
    parts.forEach((p) => {
      out.set(p, offset);
      offset += p.length;
    });
    return out;
  }

  function strBytes(text) {
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff;
    return out;
  }

  function buildPdf(pages) {
    const encoder = strBytes;
    const parts = [];
    const offsets = [0];
    let length = 0;

    function add(chunk) {
      const bytes = typeof chunk === "string" ? encoder(chunk) : chunk;
      parts.push(bytes);
      length += bytes.length;
    }

    add("%PDF-1.4\n");
    const pageCount = pages.length;
    const objCount = 2 + pageCount * 3;
    const catalogId = 1;
    const pagesId = 2;
    const pageIds = pages.map((_, i) => 3 + i * 3);
    const contentIds = pages.map((_, i) => 4 + i * 3);
    const imageIds = pages.map((_, i) => 5 + i * 3);

    function markObj() {
      offsets.push(length);
    }

    markObj();
    add(`${catalogId} 0 obj<< /Type /Catalog /Pages ${pagesId} 0 R >>endobj\n`);
    markObj();
    add(`${pagesId} 0 obj<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>endobj\n`);

    pages.forEach((page, i) => {
      const w = page.widthPt.toFixed(2);
      const h = page.heightPt.toFixed(2);
      const content = `q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q\n`;
      markObj();
      add(`${pageIds[i]} 0 obj<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i} ${imageIds[i]} 0 R >> >> /Contents ${contentIds[i]} 0 R >>endobj\n`);
      markObj();
      add(`${contentIds[i]} 0 obj<< /Length ${content.length} >>stream\n${content}endstream\nendobj\n`);
      markObj();
      add(`${imageIds[i]} 0 obj<< /Type /XObject /Subtype /Image /Width ${page.imgW} /Height ${page.imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>stream\n`);
      add(page.jpeg);
      add("endstream\nendobj\n");
    });

    const xrefStart = length;
    add(`xref\n0 ${objCount + 1}\n`);
    add("0000000000 65535 f \n");
    for (let i = 1; i <= objCount; i += 1) {
      add(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    }
    add(`trailer<< /Size ${objCount + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
    return concatBytes(parts);
  }

  function printState(state) {
    return Object.assign({}, state, {
      selected: null,
      hover: null,
      collidingIds: new Set(),
      outsideIds: new Set(),
      cursorWorld: null,
      draftSegment: null,
      tool: "select",
      view: "plan",
    });
  }

  function renderSheet(state, sheetMm, title, footer) {
    const wPx = mmToPx(sheetMm.w);
    const hPx = mmToPx(sheetMm.h);
    const canvas = document.createElement("canvas");
    canvas.width = wPx;
    canvas.height = hPx;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, wPx, hPx);

    const headerPx = mmToPx(10);
    const footerPx = mmToPx(9);
    const pad = mmToPx(6);
    ctx.fillStyle = "#e8edf4";
    ctx.font = `bold ${Math.max(12, Math.round(headerPx * 0.42))}px Segoe UI, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(title, pad, headerPx / 2);

    const view = { w: wPx - pad * 2, h: hPx - headerPx - footerPx - pad };
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, headerPx, view.w, view.h);
    ctx.clip();
    ctx.translate(pad, headerPx);
    const cam = R.fitCamera(state.outline.points, state.items, view, Math.max(24, mmToPx(8)));
    const snapCap = Math.max(cam.zoom, 0.02);
    cam.zoom = Math.min(snapCap, 8);
    R.drawPlanTo(ctx, printState(state), cam, view);
    ctx.restore();

    ctx.fillStyle = "#94a3b8";
    ctx.font = `${Math.max(10, Math.round(footerPx * 0.38))}px Segoe UI, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(footer, pad, hPx - footerPx / 2);
    const printedPerWorld = cam.zoom * 2.54 / DPI;
    const scale = Math.max(1, Math.round(1 / Math.max(printedPerWorld, 1e-6)));
    ctx.textAlign = "right";
    ctx.fillText(`Maßstab ca. 1:${scale}`, wPx - pad, hPx - footerPx / 2);
    return canvas;
  }

  function pageMmForTile(tileCanvas, format, tileA4, sheetLandscape) {
    if (!tileA4 && format !== "A4") return orientMm(format, sheetLandscape);
    return a4Mm(tileCanvas.width >= tileCanvas.height);
  }

  function fitOnPage(src, pageMm, caption) {
    const pageW = mmToPx(pageMm.w);
    const pageH = mmToPx(pageMm.h);
    const canvas = document.createElement("canvas");
    canvas.width = pageW;
    canvas.height = pageH;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, pageW, pageH);
    const margin = mmToPx(3);
    const capH = caption ? mmToPx(6) : 0;
    const boxW = pageW - margin * 2;
    const boxH = pageH - margin * 2 - capH;
    const scale = Math.min(boxW / src.width, boxH / src.height);
    const dw = src.width * scale;
    const dh = src.height * scale;
    ctx.drawImage(src, margin + (boxW - dw) / 2, margin + (boxH - dh) / 2, dw, dh);
    if (caption) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = `${Math.max(10, Math.round(capH * 0.55))}px Segoe UI, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(caption, pageW / 2, pageH - margin - capH / 2);
    }
    return canvas;
  }

  function sliceTiles(sheet, format, landscape, tileA4) {
    const layout = tileA4 && format !== "A4" ? tileLayout(format, landscape) : { cols: 1, rows: 1 };
    const overlapPx = tileA4 && format !== "A4" ? mmToPx(OVERLAP_MM) : 0;
    const cellW = sheet.width / layout.cols;
    const cellH = sheet.height / layout.rows;
    const tiles = [];
    for (let row = 0; row < layout.rows; row += 1) {
      for (let col = 0; col < layout.cols; col += 1) {
        const sx = Math.max(0, Math.round(col * cellW - (col > 0 ? overlapPx : 0)));
        const sy = Math.max(0, Math.round(row * cellH - (row > 0 ? overlapPx : 0)));
        const ex = Math.min(sheet.width, Math.round((col + 1) * cellW + (col < layout.cols - 1 ? overlapPx : 0)));
        const ey = Math.min(sheet.height, Math.round((row + 1) * cellH + (row < layout.rows - 1 ? overlapPx : 0)));
        const tile = document.createElement("canvas");
        tile.width = Math.max(1, ex - sx);
        tile.height = Math.max(1, ey - sy);
        const ctx = tile.getContext("2d");
        ctx.drawImage(sheet, sx, sy, tile.width, tile.height, 0, 0, tile.width, tile.height);
        drawCropMarks(ctx, tile.width, tile.height, col, row, layout);
        tiles.push(tile);
      }
    }
    return tiles;
  }

  function drawCropMarks(ctx, w, h, col, row, layout) {
    if (layout.cols === 1 && layout.rows === 1) return;
    ctx.save();
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 1.5;
    const mark = 14;
    [[0, 0], [w, 0], [0, h], [w, h]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.moveTo(x === 0 ? 0 : w, y);
      ctx.lineTo(x === 0 ? mark : w - mark, y);
      ctx.moveTo(x, y === 0 ? 0 : h);
      ctx.lineTo(x, y === 0 ? mark : h - mark);
      ctx.stroke();
    });
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${col + 1}/${layout.cols} · ${row + 1}/${layout.rows}`, w / 2, 16);
    ctx.restore();
  }

  function buildPages(state, format, tileA4) {
    const aspect = planAspect(state);
    const landscape = aspect >= 1;
    const sheetMm = orientMm(format, landscape);
    const date = new Date().toLocaleDateString("de-DE");
    const title = `Lagerplanung · ${state.name || "Lager"} · ${format}`;
    const footer = tileA4 && format !== "A4"
      ? `${date} · ${format} auf A4 aufgeteilt`
      : `${date} · ${format}`;
    const sheet = renderSheet(state, sheetMm, title, footer);
    const tiles = sliceTiles(sheet, format, landscape, tileA4);
    return tiles.map((tile, i) => {
      const label = `Blatt ${i + 1} von ${tiles.length}`;
      const pageMm = pageMmForTile(tile, format, tileA4, landscape);
      const caption = tiles.length > 1 ? `${label} · an den Markierungen überlappend zusammenkleben` : "";
      const page = fitOnPage(tile, pageMm, caption);
      return {
        widthPt: pageMm.w * MM,
        heightPt: pageMm.h * MM,
        jpeg: canvasToJpeg(page, 0.9),
        imgW: page.width,
        imgH: page.height,
        dataUrl: page.toDataURL("image/jpeg", 0.9),
        landscape: pageMm.w > pageMm.h,
        label,
      };
    });
  }

  function downloadPdf(state, format, tileA4) {
    const pages = buildPages(state, format, tileA4);
    const pdf = buildPdf(pages);
    const blob = new Blob([pdf], { type: "application/pdf" });
    const a = document.createElement("a");
    const split = tileA4 && format !== "A4" ? `-auf-A4` : "";
    a.href = URL.createObjectURL(blob);
    a.download = `lagerplanung-${(state.name || "lager").replace(/\s+/g, "-")}-${format}${split}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
    return pages.length;
  }

  function printPlan(state, format, tileA4) {
    const pages = buildPages(state, format, tileA4);
    const first = pages[0];
    const paper = (tileA4 || format === "A4") ? "A4" : format;
    const images = pages.map((p) => (
      `<section class="sheet ${p.landscape ? "land" : "port"}"><img src="${p.dataUrl}" alt="${p.label}"></section>`
    )).join("");
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) {
      iframe.remove();
      window.alert("Drucken ist fehlgeschlagen. Bitte das PDF speichern und daraus drucken.");
      return;
    }
    doc.open();
    doc.write(`<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Lagerplanung Druck</title>
      <style>
        @page { size: ${paper} ${first.landscape ? "landscape" : "portrait"}; margin: 0; }
        html, body { margin: 0; background: #fff; }
        .sheet { margin: 0; page-break-after: always; break-after: page; }
        .sheet:last-child { page-break-after: auto; }
        img { display: block; width: 100%; height: auto; }
      </style></head><body>${images}</body></html>`);
    doc.close();
    const cleanup = () => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };
    const run = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (err) {
        window.alert("Drucken ist fehlgeschlagen. Bitte das PDF speichern und daraus drucken.");
      }
      setTimeout(cleanup, 1500);
    };
    if (iframe.contentWindow.document.readyState === "complete") setTimeout(run, 250);
    else iframe.onload = () => setTimeout(run, 250);
  }

  global.LPPdf = {
    printHint,
    downloadPdf,
    printPlan,
  };
})(window);
