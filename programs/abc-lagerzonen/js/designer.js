(() => {
  "use strict";

  const STORE = "abc-lagerzonen-eigenes-lager";

  const GROUPS = {
    regal: "Regale",
    tisch: "Tische",
    maschine: "Maschinen",
  };

  const CATALOG = [
    { type: "kragarm", group: "regal", label: "Kragarmregal beidseitig", w: 600, d: 280, h: 800, levels: 5 },
    { type: "kragarm-1", group: "regal", label: "Kragarmregal einseitig", w: 600, d: 160, h: 800, levels: 5 },
    { type: "palette", group: "regal", label: "Palettenregal", w: 360, d: 110, h: 600, levels: 4 },
    { type: "fachboden", group: "regal", label: "Fachbodenregal", w: 200, d: 60, h: 220, levels: 5 },
    { type: "arbeitstisch", group: "tisch", label: "Arbeitstisch", w: 200, d: 80, h: 90 },
    { type: "packtisch", group: "tisch", label: "Packtisch", w: 240, d: 120, h: 92 },
    { type: "zuschneide", group: "tisch", label: "Zuschneidetisch", w: 300, d: 150, h: 90 },
    { type: "pult", group: "tisch", label: "Schreibpult", w: 120, d: 60, h: 75 },
    { type: "kreissaege", group: "maschine", label: "Kreissäge", w: 180, d: 90, h: 140 },
    { type: "kappsaege", group: "maschine", label: "Kappsäge", w: 140, d: 80, h: 130 },
    { type: "cnc", group: "maschine", label: "CNC-Säge", w: 400, d: 180, h: 180 },
    { type: "stapler-lade", group: "maschine", label: "Stapler-Ladestation", w: 160, d: 120, h: 160 },
    { type: "absaugung", group: "maschine", label: "Absauganlage", w: 100, d: 80, h: 220 },
    { type: "presse", group: "maschine", label: "Ballenpresse", w: 200, d: 120, h: 200 },
  ];

  const FILL = {
    regal: { body: "#4d6572", mark: "#2f414a" },
    tisch: { body: "#8a6a3d", mark: "#5c4524" },
    maschine: { body: "#5a4a42", mark: "#3c312c" },
  };

  const VB_PAD = { left: 92, top: 62, right: 56, bottom: 56 };

  const state = {
    room: { w: 2400, d: 1800, h: 800 },
    grid: 10,
    items: [],
    selectedId: null,
    stamp: null,
    seq: 1,
    drag: null,
    pan: null,
    navOn: false,
    vb: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function svgEl(name, attrs, text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) node.setAttribute(k, String(v));
    });
    if (text != null) node.textContent = text;
    return node;
  }

  function catalogOf(type) {
    return CATALOG.find((c) => c.type === type);
  }

  function bbox(item) {
    const swapped = item.rot === 90 || item.rot === 270;
    return {
      x: item.x,
      y: item.y,
      w: swapped ? item.d : item.w,
      d: swapped ? item.w : item.d,
    };
  }

  function snap(v) {
    const g = state.grid || 10;
    return Math.round(v / g) * g;
  }

  function fmtM(cm) {
    return (cm / 100).toLocaleString("de-DE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  function clampItem(item) {
    const b = bbox(item);
    item.x = Math.max(0, Math.min(item.x, state.room.w - b.w));
    item.y = Math.max(0, Math.min(item.y, state.room.d - b.d));
    if (item.w > state.room.w) item.w = state.room.w;
    if (item.d > state.room.d) item.d = state.room.d;
    const b2 = bbox(item);
    item.x = Math.max(0, Math.min(item.x, state.room.w - b2.w));
    item.y = Math.max(0, Math.min(item.y, state.room.d - b2.d));
  }

  function nextName(label) {
    const n = state.items.filter((i) => i.labelBase === label).length + 1;
    return `${label} ${n}`;
  }

  function makeItem(type, x, y) {
    const cat = catalogOf(type);
    if (!cat) return null;
    const item = {
      id: `obj-${state.seq++}`,
      type: cat.type,
      group: cat.group,
      labelBase: cat.label,
      name: nextName(cat.label),
      x: snap(x),
      y: snap(y),
      w: cat.w,
      d: cat.d,
      h: cat.h,
      rot: 0,
      levels: cat.levels || null,
    };
    clampItem(item);
    return item;
  }

  function selected() {
    return state.items.find((i) => i.id === state.selectedId) || null;
  }

  function persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        room: state.room,
        grid: state.grid,
        items: state.items,
        seq: state.seq,
      }));
    } catch (err) {
      /* ignore quota */
    }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.room) state.room = data.room;
      if (data.grid) state.grid = data.grid;
      if (Array.isArray(data.items)) state.items = data.items;
      if (data.seq) state.seq = data.seq;
    } catch (err) {
      /* ignore */
    }
  }

  function svgPoint(evt) {
    const svg = $("custom-svg");
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    return pt.matrixTransform(ctm.inverse());
  }

  let lastFitKey = "";
  let lastRoomKey = "";

  function baseVB() {
    const { left, top, right, bottom } = VB_PAD;
    return {
      x: -left,
      y: -top,
      w: state.room.w + left + right,
      h: state.room.d + top + bottom,
    };
  }

  function applyVB() {
    const svg = $("custom-svg");
    const vb = state.vb || baseVB();
    state.vb = vb;
    svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  }

  function resetView() {
    state.vb = baseVB();
    applyVB();
  }

  function syncNavUi() {
    const btn = $("btn-nav-view");
    if (!btn) return;
    btn.classList.toggle("on", state.navOn);
    btn.setAttribute("aria-pressed", state.navOn ? "true" : "false");
    $("custom-wrap").classList.toggle("nav-on", state.navOn);
    const hint = $("stage-hint");
    if (document.body.classList.contains("view-custom") && hint) {
      hint.textContent = state.navOn
        ? "Bewegen / Zoom an. Linke Maustaste verschiebt, Mausrad zoomt."
        : "Bewegen / Zoom aus. Objekte platzieren und verschieben.";
    }
  }

  function panBy(dxPx, dyPx) {
    const svg = $("custom-svg");
    const vb = state.vb || baseVB();
    const widthPx = Number(svg.getAttribute("width")) || 1;
    const heightPx = Number(svg.getAttribute("height")) || 1;
    vb.x -= dxPx * (vb.w / widthPx);
    vb.y -= dyPx * (vb.h / heightPx);
    state.vb = vb;
    applyVB();
  }

  function zoomAt(svgX, svgY, factor) {
    const vb = state.vb || baseVB();
    const base = baseVB();
    const nextW = vb.w / factor;
    const minW = base.w / 10;
    const maxW = base.w * 1.2;
    const newW = Math.min(maxW, Math.max(minW, nextW));
    const s = newW / vb.w;
    if (s === 1) return;
    state.vb = {
      x: svgX - (svgX - vb.x) * s,
      y: svgY - (svgY - vb.y) * s,
      w: vb.w * s,
      h: vb.h * s,
    };
    applyVB();
  }

  function fitSvg(resetCam) {
    const host = $("custom-floor-host");
    const svg = $("custom-svg");
    if (!host || !svg) return false;
    const rw = state.room.w;
    const rd = state.room.d;
    const cs = getComputedStyle(host);
    const availW = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = host.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const maxW = Math.max(120, availW);
    const maxH = Math.max(120, availH);
    const { left, top, right, bottom } = VB_PAD;
    const scale = Math.min(maxW / (rw + left + right), maxH / (rd + top + bottom));
    const w = Math.floor((rw + left + right) * scale);
    const h = Math.floor((rd + top + bottom) * scale);
    const key = `${w}x${h}:${rw}x${rd}`;
    const roomKey = `${rw}x${rd}`;
    const roomChanged = roomKey !== lastRoomKey;
    lastRoomKey = roomKey;
    if (key === lastFitKey && !resetCam && !roomChanged) {
      applyVB();
      return false;
    }
    lastFitKey = key;
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    if (resetCam || roomChanged || !state.vb) state.vb = baseVB();
    applyVB();
    return true;
  }

  function screenCm(px) {
    const svg = $("custom-svg");
    const widthPx = Number(svg.getAttribute("width")) || 800;
    const vbW = (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) || (state.room.w + 80);
    return px * (vbW / widthPx);
  }

  function drawRotateButton(parent, box) {
    const r = Math.max(screenCm(7.02), 7.8);
    const cx = box.w - r * 0.85;
    const cy = r * 0.85;
    const btn = svgEl("g", {
      class: "rot-btn",
      "data-rotate": "1",
    });
    btn.appendChild(svgEl("title", {}, "90° drehen"));
    btn.appendChild(svgEl("circle", {
      cx, cy, r,
      fill: "#e8c547",
      stroke: "#1d232b",
      "stroke-width": Math.max(1.6, r * 0.1),
    }));
    const s = r * 0.76;
    btn.appendChild(svgEl("polygon", {
      points: [
        `${cx - s * 0.45},${cy - s * 0.7}`,
        `${cx + s * 0.75},${cy}`,
        `${cx - s * 0.45},${cy + s * 0.7}`,
      ].join(" "),
      fill: "#1d232b",
      "pointer-events": "none",
    }));
    parent.appendChild(btn);
  }

  function drawItem(item) {
    const b = bbox(item);
    const fill = FILL[item.group] || FILL.regal;
    const g = svgEl("g", {
      class: `item${state.selectedId === item.id ? " sel" : ""}`,
      "data-id": item.id,
      transform: `translate(${b.x} ${b.y})`,
    });
    g.appendChild(svgEl("rect", {
      class: "body",
      x: 0,
      y: 0,
      width: b.w,
      height: b.d,
      fill: fill.body,
      stroke: fill.mark,
      "stroke-width": 4,
    }));

    if (item.type === "kragarm" || item.type === "kragarm-1") {
      const thick = Math.max(8, Math.min(b.w, b.d) * 0.14);
      const upright = item.rot === 90 || item.rot === 270;
      if (item.type === "kragarm") {
        if (upright) {
          g.appendChild(svgEl("rect", {
            x: (b.w - thick) / 2, y: 0, width: thick, height: b.d, fill: fill.mark,
          }));
        } else {
          g.appendChild(svgEl("rect", {
            x: 0, y: (b.d - thick) / 2, width: b.w, height: thick, fill: fill.mark,
          }));
        }
      } else if (item.rot === 0) {
        g.appendChild(svgEl("rect", { x: 0, y: 0, width: b.w, height: thick, fill: fill.mark }));
      } else if (item.rot === 90) {
        g.appendChild(svgEl("rect", { x: b.w - thick, y: 0, width: thick, height: b.d, fill: fill.mark }));
      } else if (item.rot === 180) {
        g.appendChild(svgEl("rect", { x: 0, y: b.d - thick, width: b.w, height: thick, fill: fill.mark }));
      } else {
        g.appendChild(svgEl("rect", { x: 0, y: 0, width: thick, height: b.d, fill: fill.mark }));
      }
      const bays = 3;
      for (let i = 1; i < bays; i += 1) {
        if (upright) {
          const y = (b.d / bays) * i;
          g.appendChild(svgEl("line", {
            x1: 0, y1: y, x2: b.w, y2: y,
            stroke: "#d8d2c6", "stroke-width": 2, "stroke-dasharray": "8 8",
          }));
        } else {
          const x = (b.w / bays) * i;
          g.appendChild(svgEl("line", {
            x1: x, y1: 0, x2: x, y2: b.d,
            stroke: "#d8d2c6", "stroke-width": 2, "stroke-dasharray": "8 8",
          }));
        }
      }
    } else if (item.type === "palette" || item.type === "fachboden") {
      const n = item.type === "palette" ? 3 : 4;
      for (let i = 1; i < n; i += 1) {
        g.appendChild(svgEl("line", {
          x1: (b.w / n) * i, y1: 4, x2: (b.w / n) * i, y2: b.d - 4,
          stroke: "#d8d2c6", "stroke-width": 3,
        }));
      }
    } else if (item.group === "tisch") {
      g.appendChild(svgEl("rect", {
        x: b.w * 0.12, y: b.d * 0.12, width: b.w * 0.76, height: b.d * 0.76,
        fill: "none", stroke: "#e7d7b5", "stroke-width": 4,
      }));
    } else if (item.group === "maschine") {
      g.appendChild(svgEl("circle", {
        cx: b.w * 0.32, cy: b.d * 0.5, r: Math.min(b.w, b.d) * 0.18,
        fill: "none", stroke: "#cfc8ba", "stroke-width": 5,
      }));
      g.appendChild(svgEl("line", {
        x1: 8, y1: 8, x2: b.w - 8, y2: b.d - 8,
        stroke: "#cfc8ba", "stroke-width": 3,
      }));
    }

    const vertical = item.rot === 90 || item.rot === 270;
    const along = vertical ? b.d : b.w;
    const across = vertical ? b.w : b.d;
    const fs = Math.max(18, Math.min(44, along / Math.max(8, item.name.length * 0.72), across * 0.38));
    const label = svgEl("text", {
      x: b.w / 2,
      y: b.d / 2,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      fill: "#fbf8f1",
      "font-size": fs,
      "font-family": "IBM Plex Sans, Segoe UI, sans-serif",
      "pointer-events": "none",
    }, item.name);
    if (vertical) {
      label.setAttribute("transform", `rotate(-90 ${b.w / 2} ${b.d / 2})`);
    }
    g.appendChild(label);
    g.appendChild(svgEl("title", {}, `${item.name} · ${item.w} × ${item.d} × ${item.h} cm`));
    drawRotateButton(g, b);
    return g;
  }

  function drawDims(parent, item) {
    const b = bbox(item);
    parent.appendChild(svgEl("line", {
      x1: b.x, y1: b.y - 18, x2: b.x + b.w, y2: b.y - 18,
      stroke: "#1d232b", "stroke-width": 2,
    }));
    parent.appendChild(svgEl("text", {
      x: b.x + b.w / 2, y: b.y - 24, "text-anchor": "middle",
      fill: "#1d232b", "font-size": 28,
      "font-family": "IBM Plex Sans, Segoe UI, sans-serif",
    }, `${Math.round(b.w)} cm`));
    parent.appendChild(svgEl("line", {
      x1: b.x - 18, y1: b.y, x2: b.x - 18, y2: b.y + b.d,
      stroke: "#1d232b", "stroke-width": 2,
    }));
    parent.appendChild(svgEl("text", {
      x: b.x - 26, y: b.y + b.d / 2, "text-anchor": "end",
      fill: "#1d232b", "font-size": 28,
      "font-family": "IBM Plex Sans, Segoe UI, sans-serif",
    }, `${Math.round(b.d)} cm`));
  }

  function axisTicks(lengthCm) {
    const out = [];
    for (let v = 0; v < lengthCm; v += 100) out.push(v);
    if (out[out.length - 1] !== lengthCm) out.push(lengthCm);
    return out;
  }

  function drawRulers(svg, rw, rd) {
    const font = "IBM Plex Sans, Segoe UI, sans-serif";
    const fs = 24;
    axisTicks(rw).forEach((x) => {
      const major = x % 500 === 0 || x === 0 || x === rw;
      svg.appendChild(svgEl("line", {
        x1: x, y1: 0, x2: x, y2: major ? -14 : -8,
        stroke: "#5d6670", "stroke-width": major ? 3 : 2,
      }));
      svg.appendChild(svgEl("text", {
        x, y: -20, "text-anchor": "middle",
        fill: "#3f464d", "font-size": fs, "font-family": font,
      }, fmtM(x)));
    });
    axisTicks(rd).forEach((y) => {
      const major = y % 500 === 0 || y === 0 || y === rd;
      svg.appendChild(svgEl("line", {
        x1: 0, y1: y, x2: major ? -14 : -8, y2: y,
        stroke: "#5d6670", "stroke-width": major ? 3 : 2,
      }));
      svg.appendChild(svgEl("text", {
        x: -20, y: y + 8, "text-anchor": "end",
        fill: "#3f464d", "font-size": fs, "font-family": font,
      }, fmtM(y)));
    });
    svg.appendChild(svgEl("text", {
      x: -20, y: -20, "text-anchor": "end",
      fill: "#5d6670", "font-size": 20, "font-family": font,
    }, "m"));
  }

  function renderFloor() {
    const svg = $("custom-svg");
    if (!svg) return;
    svg.innerHTML = "";
    const rw = state.room.w;
    const rd = state.room.d;
    const defs = svgEl("defs");
    const minor = Math.max(state.grid, 10);
    const pat = svgEl("pattern", {
      id: "floor-grid",
      width: minor,
      height: minor,
      patternUnits: "userSpaceOnUse",
    });
    pat.appendChild(svgEl("path", {
      d: `M ${minor} 0 L 0 0 0 ${minor}`,
      fill: "none",
      stroke: "#7d7468",
      "stroke-width": 3,
    }));
    defs.appendChild(pat);
    svg.appendChild(defs);

    svg.appendChild(svgEl("rect", {
      x: 0, y: 0, width: rw, height: rd,
      fill: "url(#floor-grid)", stroke: "#1d232b", "stroke-width": 6,
    }));
    drawRulers(svg, rw, rd);

    svg.appendChild(svgEl("line", {
      x1: 0, y1: rd + 28, x2: rw, y2: rd + 28, stroke: "#5d6670", "stroke-width": 2,
    }));
    svg.appendChild(svgEl("text", {
      x: rw / 2, y: rd + 52, "text-anchor": "middle", fill: "#5d6670", "font-size": 32,
      "font-family": "IBM Plex Sans, Segoe UI, sans-serif",
    }, `${fmtM(rw)} m Breite`));
    svg.appendChild(svgEl("line", {
      x1: rw + 28, y1: 0, x2: rw + 28, y2: rd, stroke: "#5d6670", "stroke-width": 2,
    }));
    svg.appendChild(svgEl("text", {
      x: rw + 36, y: rd / 2, fill: "#5d6670", "font-size": 32,
      "font-family": "IBM Plex Sans, Segoe UI, sans-serif",
    }, `${fmtM(rd)} m Tiefe`));

    state.items.forEach((item) => svg.appendChild(drawItem(item)));
    const sel = selected();
    if (sel) drawDims(svg, sel);
  }

  function syncRoomInputs() {
    $("room-w").value = String(state.room.w / 100);
    $("room-d").value = String(state.room.d / 100);
    $("room-h").value = String(state.room.h / 100);
    $("room-grid").value = String(state.grid);
  }

  function syncObjectPanel() {
    const item = selected();
    const empty = !item;
    $("obj-name").value = empty ? "kein Objekt" : item.name;
    $("obj-w").value = empty ? "0" : String(item.w);
    $("obj-d").value = empty ? "0" : String(item.d);
    $("obj-h").value = empty ? "0" : String(item.h);
    $("obj-rot").value = empty ? "0" : String(item.rot);
    $("obj-levels").value = empty || item.levels == null ? "0" : String(item.levels);
    ["obj-name", "obj-w", "obj-d", "obj-h", "obj-rot"].forEach((id) => {
      $(id).disabled = empty;
    });
    $("obj-levels").disabled = empty || (item && item.levels == null);
    $("obj-rotate").disabled = empty;
    $("obj-dup").disabled = empty;
    $("obj-del").disabled = empty;
  }

  function renderDetail() {
    const box = $("detail");
    if (!document.body.classList.contains("view-custom")) return;
    const item = selected();
    if (!item) {
      const n = state.items.length;
      box.innerHTML = `
        <h3>Eigenes Lager</h3>
        <div class="detail-grid">
          <div><span>Raum</span><br>${fmtM(state.room.w)} × ${fmtM(state.room.d)} × ${fmtM(state.room.h)} m</div>
          <div><span>Objekte</span><br>${n}</div>
          <div><span>Raster</span><br>${state.grid} cm</div>
          <div><span>Hinweis</span><br>Regal, Tisch oder Maschine aus dem Menü auf die Fläche ziehen.</div>
        </div>`;
      return;
    }
    const b = bbox(item);
    box.innerHTML = `
      <h3>${item.name}</h3>
      <div class="detail-grid">
        <div><span>Typ</span><br>${GROUPS[item.group]} · ${item.labelBase}</div>
        <div><span>Position</span><br>X ${Math.round(item.x)} cm · Y ${Math.round(item.y)} cm</div>
        <div><span>Grundfläche</span><br>${Math.round(b.w)} × ${Math.round(b.d)} cm</div>
        <div><span>Höhe</span><br>${item.h} cm</div>
        ${item.levels ? `<div><span>Ebenen</span><br>${item.levels}</div>` : ""}
        <div><span>Drehung</span><br>${item.rot}°</div>
      </div>`;
  }

  function refresh() {
    renderFloor();
    syncObjectPanel();
    renderDetail();
    persist();
  }

  function placeAt(type, x, y) {
    const item = makeItem(type, x, y);
    if (!item) return;
    state.items.push(item);
    state.selectedId = item.id;
    state.stamp = null;
    document.querySelectorAll(".pal-item").forEach((n) => n.classList.remove("on"));
    refresh();
  }

  function rotateItem(item) {
    const before = bbox(item);
    const cx = before.x + before.w / 2;
    const cy = before.y + before.d / 2;
    item.rot = (item.rot + 90) % 360;
    const after = bbox(item);
    item.x = cx - after.w / 2;
    item.y = cy - after.d / 2;
    clampItem(item);
  }

  function buildPalette() {
    const root = $("palette");
    root.innerHTML = "";
    Object.entries(GROUPS).forEach(([group, title]) => {
      const wrap = document.createElement("div");
      wrap.className = "pal-group";
      wrap.innerHTML = `<h3>${title}</h3>`;
      const list = document.createElement("div");
      list.className = "pal-list";
      CATALOG.filter((c) => c.group === group).forEach((cat) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pal-item";
        btn.draggable = true;
        btn.dataset.type = cat.type;
        btn.innerHTML = `
          <span class="pal-swatch ${cat.group}"></span>
          <span>${cat.label}<small>${cat.w} × ${cat.d} × ${cat.h} cm</small></span>`;
        btn.addEventListener("click", () => {
          const on = !btn.classList.contains("on");
          document.querySelectorAll(".pal-item").forEach((n) => n.classList.remove("on"));
          state.stamp = on ? cat.type : null;
          if (on) btn.classList.add("on");
        });
        btn.addEventListener("dragstart", (ev) => {
          ev.dataTransfer.setData("text/plain", cat.type);
          ev.dataTransfer.effectAllowed = "copy";
          state.stamp = cat.type;
        });
        list.appendChild(btn);
      });
      wrap.appendChild(list);
      root.appendChild(wrap);
    });
  }

  function bindFloor() {
    const svg = $("custom-svg");
    const wrap = $("custom-wrap");

    svg.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) {
        ev.preventDefault();
        return;
      }
      const rotBtn = ev.target.closest(".rot-btn");
      if (rotBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        const itemNode = rotBtn.closest("[data-id]");
        const item = itemNode && state.items.find((i) => i.id === itemNode.getAttribute("data-id"));
        if (item) {
          rotateItem(item);
          state.selectedId = item.id;
          refresh();
        }
        return;
      }
      const itemNode = ev.target.closest("[data-id]");
      if (!itemNode) {
        if (state.stamp) {
          const p = svgPoint(ev);
          const cat = catalogOf(state.stamp);
          placeAt(state.stamp, p.x - cat.w / 2, p.y - cat.d / 2);
          return;
        }
        if (state.navOn) {
          state.pan = { cx: ev.clientX, cy: ev.clientY, moved: false };
          wrap.classList.add("panning");
          ev.preventDefault();
          svg.setPointerCapture(ev.pointerId);
          return;
        }
        state.selectedId = null;
        refresh();
        return;
      }
      const item = state.items.find((i) => i.id === itemNode.getAttribute("data-id"));
      if (!item) return;
      state.selectedId = item.id;
      svg.querySelectorAll(".item").forEach((n) => {
        n.classList.toggle("sel", n.getAttribute("data-id") === item.id);
      });
      const p = svgPoint(ev);
      state.drag = {
        id: item.id,
        dx: p.x - item.x,
        dy: p.y - item.y,
      };
      itemNode.classList.add("dragging");
      ev.preventDefault();
      svg.setPointerCapture(ev.pointerId);
      syncObjectPanel();
      renderDetail();
    });

    svg.addEventListener("pointermove", (ev) => {
      if (state.pan) {
        const dx = ev.clientX - state.pan.cx;
        const dy = ev.clientY - state.pan.cy;
        if (Math.abs(dx) + Math.abs(dy) > 2) state.pan.moved = true;
        panBy(dx, dy);
        state.pan.cx = ev.clientX;
        state.pan.cy = ev.clientY;
        return;
      }
      if (!state.drag) return;
      const item = state.items.find((i) => i.id === state.drag.id);
      if (!item) return;
      const p = svgPoint(ev);
      item.x = snap(p.x - state.drag.dx);
      item.y = snap(p.y - state.drag.dy);
      clampItem(item);
      const node = svg.querySelector(`[data-id="${item.id}"]`);
      const b = bbox(item);
      if (node) node.setAttribute("transform", `translate(${b.x} ${b.y})`);
    });

    const endDrag = () => {
      if (state.drag) {
        state.drag = null;
        refresh();
        return;
      }
      if (state.pan) {
        const wasClick = !state.pan.moved;
        state.pan = null;
        wrap.classList.remove("panning");
        if (wasClick) {
          state.selectedId = null;
          refresh();
        }
      }
    };
    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointercancel", endDrag);

    svg.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
    });

    wrap.addEventListener("wheel", (ev) => {
      if (!state.navOn) return;
      ev.preventDefault();
      const p = svgPoint(ev);
      const factor = ev.deltaY < 0 ? 1.14 : 1 / 1.14;
      zoomAt(p.x, p.y, factor);
    }, { passive: false });

    wrap.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "copy";
    });
    wrap.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const type = ev.dataTransfer.getData("text/plain") || state.stamp;
      const cat = catalogOf(type);
      if (!cat) return;
      const p = svgPoint(ev);
      placeAt(type, p.x - cat.w / 2, p.y - cat.d / 2);
    });
  }

  function readNum(id, min, max, fallback) {
    const v = Number(String($(id).value).replace(",", "."));
    if (!Number.isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, v));
  }

  function readMeters(id, minM, maxM, fallbackCm) {
    const meters = readNum(id, minM, maxM, fallbackCm / 100);
    return Math.round(meters * 100);
  }

  function bindPanel() {
    const applyRoom = () => {
      state.room.w = readMeters("room-w", 3, 200, state.room.w);
      state.room.d = readMeters("room-d", 3, 200, state.room.d);
      state.room.h = readMeters("room-h", 2, 20, state.room.h);
      state.grid = readNum("room-grid", 5, 100, state.grid);
      state.items.forEach(clampItem);
      syncRoomInputs();
      fitSvg(true);
      refresh();
    };
    ["room-w", "room-d", "room-h", "room-grid"].forEach((id) => {
      $(id).addEventListener("change", applyRoom);
    });

    $("obj-name").addEventListener("change", () => {
      const item = selected();
      if (!item) return;
      item.name = $("obj-name").value.trim() || item.name;
      refresh();
    });
    const applyObj = () => {
      const item = selected();
      if (!item) return;
      item.w = readNum("obj-w", 20, 5000, item.w);
      item.d = readNum("obj-d", 20, 5000, item.d);
      item.h = readNum("obj-h", 20, 2000, item.h);
      item.rot = Number($("obj-rot").value) || 0;
      if (item.levels != null) item.levels = readNum("obj-levels", 1, 12, item.levels);
      clampItem(item);
      refresh();
    };
    ["obj-w", "obj-d", "obj-h", "obj-rot", "obj-levels"].forEach((id) => {
      $(id).addEventListener("change", applyObj);
    });

    $("obj-rotate").addEventListener("click", () => {
      const item = selected();
      if (!item) return;
      rotateItem(item);
      refresh();
    });
    $("obj-dup").addEventListener("click", () => {
      const item = selected();
      if (!item) return;
      const copy = {
        ...item,
        id: `obj-${state.seq++}`,
        name: nextName(item.labelBase),
        x: snap(item.x + state.grid * 4),
        y: snap(item.y + state.grid * 4),
      };
      clampItem(copy);
      state.items.push(copy);
      state.selectedId = copy.id;
      refresh();
    });
    $("obj-del").addEventListener("click", () => {
      const item = selected();
      if (!item) return;
      state.items = state.items.filter((i) => i.id !== item.id);
      state.selectedId = null;
      refresh();
    });
    $("layout-clear").addEventListener("click", () => {
      state.items = [];
      state.selectedId = null;
      refresh();
    });
    function onResetView() {
      resetView();
    }
    $("btn-reset-view").addEventListener("click", onResetView);
    $("btn-reset-view-side").addEventListener("click", onResetView);
    $("btn-nav-view").addEventListener("click", () => {
      state.navOn = !state.navOn;
      if (!state.navOn && state.pan) {
        state.pan = null;
        $("custom-wrap").classList.remove("panning");
      }
      syncNavUi();
    });

    document.addEventListener("keydown", (ev) => {
      if (!document.body.classList.contains("view-custom")) return;
      const tag = ev.target && ev.target.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const item = selected();
      if (ev.key === "Escape") {
        state.selectedId = null;
        state.stamp = null;
        document.querySelectorAll(".pal-item").forEach((n) => n.classList.remove("on"));
        refresh();
      }
      if (!item) return;
      if (ev.key === "Delete" || ev.key === "Backspace") {
        ev.preventDefault();
        state.items = state.items.filter((i) => i.id !== item.id);
        state.selectedId = null;
        refresh();
      }
      if (ev.key === "r" || ev.key === "R") {
        rotateItem(item);
        refresh();
      }
      const step = state.grid;
      if (ev.key === "ArrowLeft") { item.x = snap(item.x - step); clampItem(item); ev.preventDefault(); refresh(); }
      if (ev.key === "ArrowRight") { item.x = snap(item.x + step); clampItem(item); ev.preventDefault(); refresh(); }
      if (ev.key === "ArrowUp") { item.y = snap(item.y - step); clampItem(item); ev.preventDefault(); refresh(); }
      if (ev.key === "ArrowDown") { item.y = snap(item.y + step); clampItem(item); ev.preventDefault(); refresh(); }
    });
  }

  restore();
  buildPalette();
  bindFloor();
  bindPanel();
  syncRoomInputs();
  renderFloor();
  syncObjectPanel();

  function refit() {
    if (!document.body.classList.contains("view-custom")) return;
    lastFitKey = "";
    if (fitSvg()) renderFloor();
  }

  window.addEventListener("resize", refit);

  window.EigenesLager = {
    show() {
      const go = () => {
        fitSvg();
        renderFloor();
        syncObjectPanel();
        renderDetail();
        syncNavUi();
      };
      requestAnimationFrame(() => requestAnimationFrame(go));
    },
  };
})();
