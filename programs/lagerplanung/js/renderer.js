(function (global) {
  "use strict";

  const G = global.LPGeom;
  const C = global.LPCatalog.COLORS;

  function measureCanvas(canvas) {
    const host = canvas.parentElement;
    const w = Math.max(360, Math.floor((host && host.clientWidth) || canvas.clientWidth || 800));
    const footer = 32;
    const rawH = (host && host.clientHeight) ? host.clientHeight - footer : canvas.clientHeight;
    const h = Math.max(360, Math.floor(rawH || 520));
    return { w, h };
  }

  function resizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = measureCanvas(canvas);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const bw = Math.floor(w * dpr);
    const bh = Math.floor(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h, dpr };
  }

  function worldToScreen(p, cam, view) {
    return {
      x: (p.x - cam.x) * cam.zoom + view.w / 2,
      y: (p.y - cam.y) * cam.zoom + view.h / 2,
    };
  }

  function screenToWorld(p, cam, view) {
    return {
      x: (p.x - view.w / 2) / cam.zoom + cam.x,
      y: (p.y - view.h / 2) / cam.zoom + cam.y,
    };
  }

  function canvasPoint(evt, canvas) {
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function fitCamera(points, extras, view, padPx) {
    const boxes = [];
    if (points && points.length) boxes.push(G.polygonBounds(points));
    (extras || []).forEach((item) => boxes.push(G.itemBBox(item)));
    if (!boxes.length) {
      return { x: 2000, y: 1250, zoom: 0.18 };
    }
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
    const w = Math.max(200, maxX - minX);
    const d = Math.max(200, maxY - minY);
    const pad = padPx || 72;
    const zoom = Math.max(0.02, Math.min((view.w - pad * 2) / w, (view.h - pad * 2) / d, 2.4));
    return { x: minX + w / 2, y: minY + d / 2, zoom };
  }

  function drawBackground(ctx, w, h) {
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, w, h);
  }

  function drawWorldGrid(ctx, cam, view, grid, bounds) {
    if (!grid) return;
    const step = grid;
    const major = grid >= 50 ? grid * 2 : 100;
    const topLeft = screenToWorld({ x: 0, y: 0 }, cam, view);
    const botRight = screenToWorld({ x: view.w, y: view.h }, cam, view);
    const x0 = Math.floor(topLeft.x / step) * step;
    const y0 = Math.floor(topLeft.y / step) * step;
    ctx.save();
    for (let x = x0; x <= botRight.x + step; x += step) {
      const s = worldToScreen({ x, y: 0 }, cam, view);
      ctx.beginPath();
      ctx.strokeStyle = Math.round(x) % major === 0 ? "rgba(148,163,184,0.28)" : C.grid;
      ctx.lineWidth = 1;
      ctx.moveTo(s.x, 0);
      ctx.lineTo(s.x, view.h);
      ctx.stroke();
    }
    for (let y = y0; y <= botRight.y + step; y += step) {
      const s = worldToScreen({ x: 0, y }, cam, view);
      ctx.beginPath();
      ctx.strokeStyle = Math.round(y) % major === 0 ? "rgba(148,163,184,0.28)" : C.grid;
      ctx.lineWidth = 1;
      ctx.moveTo(0, s.y);
      ctx.lineTo(view.w, s.y);
      ctx.stroke();
    }
    ctx.restore();
    if (bounds) drawRulers(ctx, cam, view, bounds);
  }

  function drawRulers(ctx, cam, view, bounds) {
    ctx.save();
    ctx.fillStyle = C.dim;
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    const step = bounds.w > 6000 ? 500 : 100;
    for (let x = bounds.x; x <= bounds.x + bounds.w + 0.1; x += step) {
      const s = worldToScreen({ x, y: bounds.y }, cam, view);
      ctx.fillText(G.fmtM(x - bounds.x), s.x, Math.max(14, s.y - 10));
    }
    ctx.textAlign = "right";
    for (let y = bounds.y; y <= bounds.y + bounds.d + 0.1; y += step) {
      const s = worldToScreen({ x: bounds.x, y }, cam, view);
      ctx.fillText(G.fmtM(y - bounds.y), Math.max(8, s.x - 8), s.y + 4);
    }
    ctx.restore();
  }

  function drawFloor(ctx, points, cam, view) {
    if (points.length < 3) return;
    ctx.save();
    ctx.beginPath();
    points.forEach((p, i) => {
      const s = worldToScreen(p, cam, view);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
    ctx.fillStyle = C.floor;
    ctx.fill();
    const bounds = G.polygonBounds(points);
    const label = worldToScreen({ x: bounds.x + 16, y: bounds.y + 28 }, cam, view);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "bold 13px Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${G.fmtM(bounds.w)} × ${G.fmtM(bounds.d)}`, label.x, label.y);
    ctx.restore();
  }

  function openingsOnWall(openings, wallIndex) {
    return openings
      .filter((o) => o.wallIndex === wallIndex)
      .slice()
      .sort((a, b) => a.offset - b.offset);
  }

  function drawWalls(ctx, state, cam, view) {
    const points = state.outline.points;
    if (points.length < 2) return;
    const closed = state.outline.closed;
    const last = closed ? points.length : points.length - 1;
    const thick = Math.max(2, state.wallThickness * cam.zoom);

    for (let i = 0; i < last; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const len = G.dist(a, b);
      const segs = openingsOnWall(state.openings, i);
      let cursor = 0;
      const selected = state.selected && state.selected.kind === "edge" && state.selected.index === i;
      ctx.strokeStyle = selected ? C.wallSel : C.wall;
      ctx.lineWidth = thick;
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";

      const drawSeg = (from, to) => {
        if (to - from < 0.5) return;
        const p1 = G.lerp(a, b, from / len);
        const p2 = G.lerp(a, b, to / len);
        const s1 = worldToScreen(p1, cam, view);
        const s2 = worldToScreen(p2, cam, view);
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
      };

      segs.forEach((open) => {
        drawSeg(cursor, open.offset);
        drawOpening(ctx, state, open, a, b, cam, view);
        cursor = open.offset + open.width;
      });
      drawSeg(cursor, len);

      if (state.showDims && len > 1) {
        drawEdgeDim(ctx, a, b, cam, view, G.fmtCm(len), selected);
      }
    }

    points.forEach((p, index) => {
      const s = worldToScreen(p, cam, view);
      const sel = state.selected && state.selected.kind === "vertex" && state.selected.index === index;
      ctx.beginPath();
      ctx.fillStyle = sel ? C.select : "#cbd5e1";
      ctx.arc(s.x, s.y, sel ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawOpening(ctx, state, open, a, b, cam, view) {
    const len = G.dist(a, b);
    const p1 = G.lerp(a, b, open.offset / len);
    const p2 = G.lerp(a, b, (open.offset + open.width) / len);
    const s1 = worldToScreen(p1, cam, view);
    const s2 = worldToScreen(p2, cam, view);
    const mid = { x: (s1.x + s2.x) / 2, y: (s1.y + s2.y) / 2 };
    const angle = Math.atan2(s2.y - s1.y, s2.x - s1.x);
    const widthPx = G.dist(s1, s2);
    const selected = state.selected && state.selected.kind === "opening" && state.selected.id === open.id;
    const color = selected ? C.select : (open.type === "door" ? C.door : open.type === "gate" ? C.gate : C.window);

    ctx.save();
    ctx.translate(mid.x, mid.y);
    ctx.rotate(angle);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = selected ? 2.5 : 1.6;

    if (open.type === "door") {
      ctx.beginPath();
      ctx.moveTo(-widthPx / 2, 0);
      ctx.lineTo(-widthPx / 2, widthPx * 0.72);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-widthPx / 2, 0, widthPx * 0.72, 0, Math.PI / 2);
      ctx.stroke();
    } else if (open.type === "gate") {
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(-widthPx / 2, 0);
      ctx.lineTo(widthPx / 2, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillRect(-widthPx / 2, -5, 4, 10);
      ctx.fillRect(widthPx / 2 - 4, -5, 4, 10);
    } else {
      ctx.beginPath();
      ctx.moveTo(-widthPx / 2, -4);
      ctx.lineTo(widthPx / 2, -4);
      ctx.moveTo(-widthPx / 2, 4);
      ctx.lineTo(widthPx / 2, 4);
      ctx.stroke();
    }

    ctx.fillStyle = "#e8edf4";
    ctx.font = "bold 10px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = `${global.LPCatalog.typeLabel(open.type)} ${Math.round(open.width)}×${Math.round(open.height)}`;
    ctx.fillText(label, 0, open.type === "window" ? -14 : 16);
    ctx.restore();
  }

  function drawEdgeDim(ctx, a, b, cam, view, text, emphasize) {
    const s1 = worldToScreen(a, cam, view);
    const s2 = worldToScreen(b, cam, view);
    const angle = Math.atan2(s2.y - s1.y, s2.x - s1.x);
    const mx = (s1.x + s2.x) / 2;
    const my = (s1.y + s2.y) / 2;
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    ctx.save();
    ctx.fillStyle = emphasize ? C.dimLive : C.dim;
    ctx.font = emphasize ? "bold 12px Segoe UI, sans-serif" : "11px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(mx + nx * 16, my + ny * 16);
    let rot = angle;
    if (rot > Math.PI / 2 || rot < -Math.PI / 2) rot += Math.PI;
    ctx.rotate(rot);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function drawItem(ctx, item, state, cam, view) {
    const b = G.itemBBox(item);
    const origin = worldToScreen({ x: b.x, y: b.y }, cam, view);
    const localW = item.w * cam.zoom;
    const localD = item.d * cam.zoom;
    const boxW = b.w * cam.zoom;
    const boxD = b.d * cam.zoom;
    const selected = state.selected && state.selected.kind === "item" && state.selected.id === item.id;
    const colliding = state.collidingIds && state.collidingIds.has(item.id);
    const outside = state.outsideIds && state.outsideIds.has(item.id);
    ctx.save();
    ctx.translate(origin.x + boxW / 2, origin.y + boxD / 2);
    ctx.rotate((item.rot || 0) * Math.PI / 180);
    ctx.translate(-localW / 2, -localD / 2);

    if (item.type === "block") drawBlock(ctx, item, localW, localD);
    else if (item.type === "pallet") drawPalletRack(ctx, item, localW, localD, cam.zoom);
    else drawCantilever(ctx, item, localW, localD, cam.zoom);

    ctx.strokeStyle = colliding ? C.collide : outside ? C.outside : selected ? C.select : "rgba(226,232,240,0.55)";
    ctx.lineWidth = selected || colliding ? 3 : 1.4;
    ctx.strokeRect(0, 0, localW, localD);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = origin.x + boxW / 2;
    const cy = origin.y + boxD / 2;
    const vertical = boxD > boxW + 8;
    ctx.translate(cx, cy);
    if (vertical) ctx.rotate(-Math.PI / 2);
    ctx.fillText(item.name, 0, state.showDims ? -7 : 0);
    if (state.showDims) {
      ctx.font = "10px Segoe UI, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(`${Math.round(item.w)} × ${Math.round(item.d)} cm`, 0, 8);
    }
    ctx.restore();

    if (selected) {
      ctx.fillStyle = C.select;
      ctx.beginPath();
      ctx.arc(origin.x + boxW - 8, origin.y + 8, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBlock(ctx, item, w, h) {
    ctx.fillStyle = "rgba(56, 189, 248, 0.55)";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    ctx.strokeStyle = "rgba(125, 211, 252, 0.45)";
    ctx.lineWidth = 1;
    const step = 10;
    for (let x = -h; x < w + h; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
    }
    ctx.restore();
    const palW = 120 * (w / item.w);
    const palD = 80 * (h / item.d);
    ctx.strokeStyle = "rgba(186, 230, 253, 0.45)";
    for (let x = 4; x + palW < w - 2; x += palW + 2) {
      for (let y = 4; y + palD < h - 2; y += palD + 2) {
        ctx.strokeRect(x, y, palW, palD);
      }
    }
  }

  function drawPalletRack(ctx, item, w, h, zoom) {
    ctx.fillStyle = "rgba(59, 130, 246, 0.5)";
    ctx.fillRect(0, 0, w, h);
    const bays = Math.max(1, item.bays || 1);
    const frame = Math.max(2, 8 * zoom);
    ctx.fillStyle = C.palletFrame;
    for (let i = 0; i <= bays; i += 1) {
      const x = (w / bays) * i - frame / 2;
      ctx.fillRect(Math.max(0, x), 0, frame, h);
    }
    ctx.fillStyle = C.palletSlot;
    const slotW = (w / bays) - frame * 1.2;
    for (let i = 0; i < bays; i += 1) {
      const x = (w / bays) * i + frame * 0.8;
      ctx.fillRect(x, 3, slotW, h - 6);
    }
  }

  function drawCantilever(ctx, item, w, h, zoom) {
    ctx.fillStyle = "rgba(34, 197, 94, 0.45)";
    ctx.fillRect(0, 0, w, h);
    const spine = Math.max(3, 16 * zoom);
    ctx.fillStyle = C.cantileverSpine;
    if (item.sided === "single") {
      ctx.fillRect(0, 0, w, spine);
    } else {
      ctx.fillRect(0, (h - spine) / 2, w, spine);
    }
    const cols = Math.max(2, item.columns || 2);
    ctx.fillStyle = C.cantilever;
    for (let i = 0; i < cols; i += 1) {
      const x = (w / (cols - 1 || 1)) * i;
      ctx.fillRect(x - 1.5, 0, 3, h);
    }
  }

  function drawDraft(ctx, state, cam, view) {
    const pts = state.outline.points;
    if (state.tool !== "draw" || !pts.length || !state.cursorWorld) return;
    const last = pts[pts.length - 1];
    let target = state.cursorWorld;
    if (state.shiftOrtho) target = G.orthoFrom(last, target);
    const a = worldToScreen(last, cam, view);
    const b = worldToScreen(target, cam, view);
    ctx.save();
    ctx.strokeStyle = C.dimLive;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    drawEdgeDim(ctx, last, target, cam, view, G.fmtCm(G.dist(last, target)), true);
    ctx.restore();
  }

  function drawPlan(ctx, state, cam, view) {
    drawBackground(ctx, view.w, view.h);
    const bounds = state.outline.points.length
      ? G.polygonBounds(state.outline.points)
      : null;
    if (state.showGrid) drawWorldGrid(ctx, cam, view, state.grid, bounds);
    if (state.outline.closed) drawFloor(ctx, state.outline.points, cam, view);
    state.items.forEach((item) => drawItem(ctx, item, state, cam, view));
    drawWalls(ctx, state, cam, view);
    drawDraft(ctx, state, cam, view);
  }

  function drawElevation(ctx, state, view, axis) {
    drawBackground(ctx, view.w, view.h);
    const item = state.items.find((it) => state.selected && state.selected.kind === "item" && state.selected.id === it.id);
    ctx.fillStyle = C.text;
    ctx.font = "13px Segoe UI, sans-serif";
    ctx.textAlign = "left";
    if (!item || (item.type !== "pallet" && item.type !== "cantilever" && item.type !== "block")) {
      ctx.fillStyle = C.dim;
      ctx.fillText("Regal oder Blocklager in der Draufsicht auswählen, um die Ansicht zu sehen.", 28, 40);
      return;
    }

    const hallH = state.hallHeight;
    const widthCm = axis === "front" ? item.w : item.d;
    const heightCm = Math.max(item.h, hallH);
    const pad = 70;
    const scale = Math.min((view.w - pad * 2) / widthCm, (view.h - pad * 2) / heightCm);
    const ox = (view.w - widthCm * scale) / 2;
    const oy = view.h - pad - hallH * scale;

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(ox, oy, widthCm * scale, hallH * scale);
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, widthCm * scale, hallH * scale);

    ctx.strokeStyle = "rgba(148,163,184,0.35)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + widthCm * scale, oy);
    ctx.stroke();
    ctx.setLineDash([]);

    if (item.type === "pallet") drawPalletElevation(ctx, item, ox, oy, scale, hallH, axis);
    else if (item.type === "cantilever") drawCantileverElevation(ctx, item, ox, oy, scale, hallH, axis);
    else drawBlockElevation(ctx, item, ox, oy, scale, hallH, axis);

    ctx.fillStyle = C.dim;
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${item.name} · ${axis === "front" ? "Front" : "Seite"} · ${G.fmtCm(widthCm)} × ${G.fmtCm(item.h)}`, view.w / 2, 28);
    ctx.textAlign = "right";
    ctx.fillText(`Raumhöhe ${G.fmtCm(hallH)}`, ox - 10, oy + 4);
    ctx.fillText(G.fmtCm(item.h), ox - 10, oy + (hallH - item.h) * scale + 4);
    ctx.textAlign = "center";
    ctx.fillText(G.fmtCm(widthCm), ox + widthCm * scale / 2, oy + hallH * scale + 22);
  }

  function drawPalletElevation(ctx, item, ox, floorTop, scale, hallH, axis) {
    const w = (axis === "front" ? item.w : item.d) * scale;
    const h = item.h * scale;
    const x = ox;
    const y = floorTop + (hallH - item.h) * scale;
    const levels = Math.max(1, item.levels || 1);
    const first = Math.max(0, item.firstBeam || 0) * scale;
    const bays = Math.max(1, item.bays || 1);
    ctx.fillStyle = "rgba(37, 99, 235, 0.2)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.pallet;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    if (axis === "front") {
      for (let i = 0; i <= bays; i += 1) {
        const px = x + (w / bays) * i;
        ctx.fillStyle = C.palletFrame;
        ctx.fillRect(px - 3, y, 6, h);
      }
    } else {
      ctx.fillStyle = C.palletFrame;
      ctx.fillRect(x, y, 6, h);
      ctx.fillRect(x + w - 6, y, 6, h);
    }
    for (let i = 0; i < levels; i += 1) {
      const ly = y + h - first - ((h - first) / levels) * i;
      ctx.fillStyle = "#60a5fa";
      ctx.fillRect(x, ly - 3, w, 6);
      ctx.fillStyle = "rgba(253, 224, 71, 0.35)";
      if (i < levels) ctx.fillRect(x + 8, ly - 22, w - 16, 18);
      ctx.fillStyle = C.dim;
      ctx.font = "10px Segoe UI, sans-serif";
      ctx.textAlign = "left";
      const heightCm = item.firstBeam + ((item.h - item.firstBeam) / levels) * i;
      ctx.fillText(G.fmtCm(heightCm), x + 8, ly - 8);
    }
  }

  function drawCantileverElevation(ctx, item, ox, floorTop, scale, hallH, axis) {
    const w = (axis === "front" ? item.w : item.d) * scale;
    const h = item.h * scale;
    const x = ox;
    const y = floorTop + (hallH - item.h) * scale;
    const levels = Math.max(1, item.levels || 1);
    const cols = Math.max(2, item.columns || 2);
    ctx.fillStyle = "rgba(34, 197, 94, 0.16)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.cantilever;
    ctx.strokeRect(x, y, w, h);
    if (axis === "front") {
      for (let i = 0; i < cols; i += 1) {
        const px = x + (w / (cols - 1 || 1)) * i;
        ctx.fillStyle = C.cantileverSpine;
        ctx.fillRect(px - 4, y, 8, h);
      }
    } else {
      const spineX = item.sided === "single" ? x : x + w / 2 - 4;
      ctx.fillStyle = C.cantileverSpine;
      ctx.fillRect(spineX, y, 8, h);
    }
    for (let i = 1; i <= levels; i += 1) {
      const ly = y + h - (h / (levels + 1)) * i;
      ctx.fillStyle = C.cantilever;
      if (axis === "side" && item.sided === "double") {
        ctx.fillRect(x, ly - 3, w, 6);
      } else if (axis === "side") {
        ctx.fillRect(x, ly - 3, w, 6);
      } else {
        ctx.fillRect(x, ly - 3, w, 6);
      }
      ctx.fillStyle = C.dim;
      ctx.font = "10px Segoe UI, sans-serif";
      ctx.fillText(G.fmtCm((item.h / (levels + 1)) * i), x + 8, ly - 8);
    }
  }

  function drawBlockElevation(ctx, item, ox, floorTop, scale, hallH, axis) {
    const w = (axis === "front" ? item.w : item.d) * scale;
    const h = item.h * scale;
    const x = ox;
    const y = floorTop + (hallH - item.h) * scale;
    ctx.fillStyle = "rgba(14, 165, 233, 0.35)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.block;
    ctx.strokeRect(x, y, w, h);
  }

  function draw(canvas, state) {
    const { ctx, w, h } = resizeCanvas(canvas);
    const view = { w, h };
    if (state.view === "plan") {
      drawPlan(ctx, state, state.cam, view);
    } else {
      drawElevation(ctx, state, view, state.view === "front" ? "front" : "side");
    }
    return view;
  }

  global.LPRender = {
    resizeCanvas,
    worldToScreen,
    screenToWorld,
    canvasPoint,
    fitCamera,
    draw,
  };
})(window);
