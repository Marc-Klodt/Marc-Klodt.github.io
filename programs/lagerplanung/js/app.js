(function () {
  "use strict";

  const G = window.LPGeom;
  const Cat = window.LPCatalog;
  const R = window.LPRender;
  const STORE = "lagerplanung-v1";

  const canvas = document.getElementById("plan-canvas");
  const liveDim = document.getElementById("live-dim");
  const fileImport = document.getElementById("file-import");

  const state = {
    name: "Lager 1",
    hallHeight: 800,
    wallThickness: 20,
    grid: 10,
    snap: true,
    showGrid: true,
    showDims: true,
    outline: { points: [], closed: false },
    openings: [],
    items: [],
    selected: null,
    tool: "select",
    view: "plan",
    cam: { x: 2000, y: 1250, zoom: 0.18 },
    seq: 1,
    cursorWorld: null,
    shiftOrtho: false,
    collidingIds: new Set(),
    outsideIds: new Set(),
    hover: null,
  };

  const history = [];
  let viewSize = { w: 800, h: 600 };
  let drag = null;
  let spacePan = false;
  let fittedOnce = false;

  function $(id) {
    return document.getElementById(id);
  }

  function num(id, fallback) {
    const el = $(id);
    const v = el ? Number(el.value) : NaN;
    return Number.isFinite(v) ? v : fallback;
  }

  function snapValue(v) {
    return state.snap ? G.snap(v, state.grid) : v;
  }

  function snapP(p) {
    return state.snap ? G.snapPoint(p, state.grid) : { x: p.x, y: p.y };
  }

  function worldFromEvent(evt) {
    const s = R.canvasPoint(evt, canvas);
    return R.screenToWorld(s, state.cam, viewSize);
  }

  function pushHistory() {
    history.push(JSON.stringify({
      outline: state.outline,
      openings: state.openings,
      items: state.items,
      hallHeight: state.hallHeight,
      wallThickness: state.wallThickness,
      seq: state.seq,
    }));
    if (history.length > 60) history.shift();
    $("btn-undo").disabled = history.length === 0;
  }

  function undo() {
    const raw = history.pop();
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(state, data);
    state.selected = null;
    $("btn-undo").disabled = history.length === 0;
    persist();
    refresh();
  }

  function persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify(exportData()));
    } catch (err) {
      /* ignore */
    }
  }

  function exportData() {
    return {
      version: 1,
      name: state.name,
      hallHeight: state.hallHeight,
      wallThickness: state.wallThickness,
      grid: state.grid,
      outline: state.outline,
      openings: state.openings,
      items: state.items,
      seq: state.seq,
    };
  }

  function importData(data) {
    if (!data || typeof data !== "object") return;
    state.name = data.name || "Lager 1";
    state.hallHeight = data.hallHeight || 800;
    state.wallThickness = data.wallThickness || 20;
    state.grid = data.grid || 10;
    state.outline = data.outline || { points: [], closed: false };
    state.openings = Array.isArray(data.openings) ? data.openings : [];
    state.items = Array.isArray(data.items) ? data.items : [];
    state.seq = data.seq || state.items.length + state.openings.length + 1;
    state.selected = null;
    $("hall-height").value = (state.hallHeight / 100).toFixed(1);
    $("wall-thick").value = state.wallThickness;
    $("grid-size").value = String(state.grid);
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return false;
      importData(JSON.parse(raw));
      return true;
    } catch (err) {
      return false;
    }
  }

  function setTool(tool) {
    state.tool = tool;
    document.querySelectorAll(".tool-btn").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.tool === tool);
    });
    updateHint();
    refresh();
  }

  function setView(view) {
    state.view = view;
    document.querySelectorAll(".view-tab").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.view === view);
    });
    updateHint();
    refresh();
  }

  function updateHint() {
    const hints = {
      select: "Objekt, Wand oder Eckpunkt anklicken. Ziehen verschiebt. R dreht, Entf löscht.",
      draw: "Klicken setzt Punkte. Linie folgt der Maus in cm. Umschalt = rechtwinklig. Ersten Punkt oder Enter schließt.",
      door: "An eine Wand klicken. Breite und Höhe vorher einstellen.",
      gate: "An eine Wand klicken. Torbreite und -höhe vorher einstellen.",
      window: "An eine Wand klicken. Fensterbreite, Höhe und Brüstung einstellen.",
      block: "Klicken platziert das Blocklager mit den aktuellen Maßen.",
      pallet: "Klicken platziert das Palettenregal mit den aktuellen Maßen.",
      cantilever: "Klicken platziert das Kragarmregal mit den aktuellen Maßen.",
      pan: "Ziehen verschiebt die Ansicht. Mausrad zoomt.",
    };
    if (state.view !== "plan") {
      $("stage-hint").textContent = "Regal in der Draufsicht auswählen. Maße der Ebenen erscheinen in cm.";
      return;
    }
    $("stage-hint").textContent = hints[state.tool] || "";
  }

  function analyze() {
    const collide = new Set();
    const outside = new Set();
    for (let i = 0; i < state.items.length; i += 1) {
      const a = G.itemBBox(state.items[i]);
      if (state.outline.closed && !G.rectInsidePolygon(a, state.outline.points)) {
        outside.add(state.items[i].id);
      }
      for (let j = i + 1; j < state.items.length; j += 1) {
        if (G.rectsOverlap(a, G.itemBBox(state.items[j]))) {
          collide.add(state.items[i].id);
          collide.add(state.items[j].id);
        }
      }
    }
    state.collidingIds = collide;
    state.outsideIds = outside;
  }

  function hallArea() {
    return state.outline.closed ? G.polygonArea(state.outline.points) : 0;
  }

  function usedArea() {
    return state.items.reduce((sum, item) => {
      const b = G.itemBBox(item);
      return sum + b.w * b.d;
    }, 0);
  }

  function maxItemHeight() {
    return state.items.reduce((max, item) => Math.max(max, item.h || 0), 0);
  }

  function renderBar(host, label, used, total, unit) {
    const pct = total > 0 ? (used / total) * 100 : 0;
    const over = pct >= 101;
    host.innerHTML = `
      <div class="usage-bar-row">
        <span class="usage-bar-label">${label}</span>
        <div class="usage-bar-track">
          <div class="usage-bar-fill${over ? " usage-bar-fill-over" : ""}" style="width:${Math.min(100, pct)}%"></div>
        </div>
        <span class="usage-bar-value">${pct.toFixed(1)}%</span>
      </div>
      <p class="panel-note">${used.toLocaleString("de-DE", { maximumFractionDigits: 1 })} / ${total.toLocaleString("de-DE", { maximumFractionDigits: 1 })} ${unit}</p>
    `;
  }

  function updateChrome() {
    const area = hallArea();
    const used = usedArea();
    const free = Math.max(0, area - used);
    const maxH = maxItemHeight();
    $("header-stats").innerHTML = `
      <div class="header-stat"><strong>${G.fmtM2(area)}</strong>Hallenfläche</div>
      <div class="header-stat"><strong>${G.fmtM2(used)}</strong>belegt</div>
      <div class="header-stat"><strong>${G.fmtM2(free)}</strong>frei</div>
      <div class="header-stat"><strong>${state.items.length}</strong>Einrichtungen</div>
    `;
    renderBar($("usage-bar-chart"), "Grundfläche", used / 10000, Math.max(area / 10000, 0.01), "m²");
    renderBar($("height-bar-chart"), "Höhe", maxH / 100, state.hallHeight / 100, "m");
    const pxPerM = state.cam.zoom * 100;
    $("scale-info").textContent = state.view === "plan"
      ? `Maßstab · ${pxPerM.toFixed(1)} px / m · Raster ${state.grid} cm`
      : "Aufriss · Höhen in cm";
    $("stat-info").innerHTML = [
      `Wände: ${state.outline.closed ? state.outline.points.length : Math.max(0, state.outline.points.length - 1)}`,
      `Öffnungen: ${state.openings.length}`,
      `Blocklager: ${state.items.filter((i) => i.type === "block").length}`,
      `Palettenregale: ${state.items.filter((i) => i.type === "pallet").length}`,
      `Kragarmregale: ${state.items.filter((i) => i.type === "cantilever").length}`,
      state.collidingIds.size ? `<span class="warning">Überlappungen: ${state.collidingIds.size}</span>` : "Keine Überlappung",
      state.outsideIds.size ? `<span class="warning">Außerhalb der Halle: ${state.outsideIds.size}</span>` : "",
    ].filter(Boolean).join("<br>");
    updateDetail();
  }

  function selectedItem() {
    if (!state.selected || state.selected.kind !== "item") return null;
    return state.items.find((i) => i.id === state.selected.id) || null;
  }

  function selectedOpening() {
    if (!state.selected || state.selected.kind !== "opening") return null;
    return state.openings.find((o) => o.id === state.selected.id) || null;
  }

  function updateDetail() {
    const box = $("detail-content");
    const item = selectedItem();
    const opening = selectedOpening();
    const canEdit = Boolean(item || opening || (state.selected && (state.selected.kind === "edge" || state.selected.kind === "vertex")));
    $("btn-rotate").disabled = !item;
    $("btn-dup").disabled = !item;
    $("btn-delete").disabled = !canEdit;

    if (item) {
      const b = G.itemBBox(item);
      const inside = !state.outsideIds.has(item.id);
      const tall = item.h > state.hallHeight;
      box.innerHTML = `
        <div class="detail-card">
          <div class="detail-name">${escapeHtml(item.name)}</div>
          <dl class="detail-list">
            <dt>Typ</dt><dd>${Cat.typeLabel(item.type)}</dd>
            <dt>Grundfläche</dt><dd>${Math.round(b.w)} × ${Math.round(b.d)} cm</dd>
            <dt>Höhe</dt><dd class="${tall ? "warn" : ""}">${G.fmtCm(item.h)}${tall ? " über Raumhöhe" : ""}</dd>
            <dt>Position</dt><dd>${Math.round(item.x)} / ${Math.round(item.y)} cm</dd>
            <dt>Drehung</dt><dd>${item.rot}°</dd>
            <dt>In der Halle</dt><dd class="${inside ? "" : "warn"}">${inside ? "ja" : "ragt hinaus"}</dd>
            ${item.type === "pallet" ? `<dt>Felder / Ebenen</dt><dd>${item.bays} / ${item.levels}</dd>` : ""}
            ${item.type === "cantilever" ? `<dt>Ständer / Ebenen</dt><dd>${item.columns} / ${item.levels} · ${item.sided === "double" ? "beidseitig" : "einseitig"}</dd>` : ""}
          </dl>
        </div>`;
      return;
    }
    if (opening) {
      box.innerHTML = `
        <div class="detail-card">
          <div class="detail-name">${Cat.typeLabel(opening.type)}</div>
          <dl class="detail-list">
            <dt>Lichte Breite</dt><dd>${G.fmtCm(opening.width)}</dd>
            <dt>Lichte Höhe</dt><dd>${G.fmtCm(opening.height)}</dd>
            <dt>Brüstung</dt><dd>${G.fmtCm(opening.sill || 0)}</dd>
            <dt>Wand</dt><dd>${opening.wallIndex + 1}</dd>
            <dt>Abstand</dt><dd>${G.fmtCm(opening.offset)}</dd>
          </dl>
        </div>`;
      return;
    }
    if (state.selected && state.selected.kind === "edge") {
      const i = state.selected.index;
      const len = G.wallLength(state.outline.points, i);
      box.innerHTML = `
        <div class="detail-card">
          <div class="detail-name">Wand ${i + 1}</div>
          <dl class="detail-list">
            <dt>Länge</dt><dd>${G.fmtCmM(len)}</dd>
          </dl>
          <label>Länge setzen (cm)
            <input type="number" id="edge-len" min="10" max="50000" step="1" value="${Math.round(len)}">
          </label>
        </div>`;
      const input = $("edge-len");
      if (input) {
        input.addEventListener("change", () => {
          setEdgeLength(i, Number(input.value));
        });
      }
      return;
    }
    box.innerHTML = `
      <div class="detail-card empty">
        <div class="detail-name" style="font-weight:600;color:var(--text-muted)">Nichts ausgewählt</div>
        <p class="panel-note">Objekt in der Draufsicht anklicken. Beim Linienzug erscheint die Länge in cm an der Maus.</p>
      </div>`;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function setEdgeLength(index, lengthCm) {
    const points = state.outline.points;
    if (points.length < 2) return;
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const current = G.dist(a, b);
    if (current < G.EPS || !Number.isFinite(lengthCm) || lengthCm < 10) return;
    pushHistory();
    const dir = G.scale(G.sub(b, a), lengthCm / current);
    points[(index + 1) % points.length] = { x: a.x + dir.x, y: a.y + dir.y };
    persist();
    refresh();
  }

  function hitTest(world) {
    const pick = 12 / state.cam.zoom;
    for (let i = state.items.length - 1; i >= 0; i -= 1) {
      if (G.pointInRect(world, G.itemBBox(state.items[i]))) {
        return { kind: "item", id: state.items[i].id };
      }
    }
    if (state.outline.points.length) {
      const vertex = G.nearestVertex(world, state.outline.points, pick);
      if (vertex) return { kind: "vertex", index: vertex.index };
      const edge = G.nearestEdge(world, state.outline.points, state.outline.closed);
      if (edge && edge.dist <= pick) {
        const opening = state.openings.find((o) => (
          o.wallIndex === edge.index
          && worldAlong(edge, o)
        ));
        if (opening) return { kind: "opening", id: opening.id };
        return { kind: "edge", index: edge.index };
      }
    }
    return null;
  }

  function worldAlong(edge, opening) {
    return edge.t * edge.length >= opening.offset - 4
      && edge.t * edge.length <= opening.offset + opening.width + 4;
  }

  function placeOpening(type, world) {
    if (!state.outline.closed || state.outline.points.length < 3) {
      window.alert("Bitte zuerst den Hallenumriss schließen oder eine Rechteck-Halle anlegen.");
      return;
    }
    const edge = G.nearestEdge(world, state.outline.points, true);
    if (!edge || edge.dist > 80) return;
    pushHistory();
    const width = snapValue(num("open-w", type === "gate" ? 400 : type === "window" ? 150 : 100));
    const height = num("open-h", type === "gate" ? 400 : type === "window" ? 120 : 210);
    const sill = num("open-sill", type === "window" ? 100 : 0);
    const opening = G.clampOpening({
      id: G.uid("open", state.seq),
      type,
      wallIndex: edge.index,
      offset: snapValue(edge.t * edge.length - width / 2),
      width,
      height,
      sill,
    }, edge.length);
    state.seq += 1;
    state.openings.push(opening);
    state.selected = { kind: "opening", id: opening.id };
    persist();
    refresh();
  }

  function currentStamp(type) {
    if (type === "block") {
      return {
        type: "block",
        name: $("block-name").value || "Blocklager",
        w: snapValue(num("block-w", 480)),
        d: snapValue(num("block-d", 320)),
        h: num("block-h", 180),
        rot: 0,
      };
    }
    if (type === "pallet") {
      return {
        type: "pallet",
        name: $("pallet-name").value || "Palettenregal",
        w: snapValue(num("pallet-w", 360)),
        d: snapValue(num("pallet-d", 110)),
        h: num("pallet-h", 600),
        bays: Math.max(1, Math.round(num("pallet-bays", 3))),
        levels: Math.max(1, Math.round(num("pallet-levels", 4))),
        firstBeam: num("pallet-first", 20),
        rot: 0,
      };
    }
    const sided = $("cant-sided").value;
    const arm = snapValue(num("cant-arm", 120));
    return {
      type: "cantilever",
      name: $("cant-name").value || "Kragarmregal",
      w: snapValue(num("cant-w", 600)),
      d: sided === "single" ? arm + 40 : arm * 2 + 40,
      h: num("cant-h", 800),
      arm,
      sided,
      columns: Math.max(2, Math.round(num("cant-cols", 4))),
      levels: Math.max(1, Math.round(num("cant-levels", 5))),
      rot: 0,
    };
  }

  function placeItem(type, world) {
    pushHistory();
    const stamp = currentStamp(type);
    const item = {
      ...stamp,
      id: G.uid(type, state.seq),
    };
    state.seq += 1;
    const names = state.items.filter((i) => i.type === type).length + 1;
    if (!stamp.name.match(/\d+$/)) item.name = `${stamp.name} ${names}`;
    item.x = snapValue(world.x - item.w / 2);
    item.y = snapValue(world.y - item.d / 2);
    state.items.push(item);
    state.selected = { kind: "item", id: item.id };
    persist();
    refresh();
  }

  function rotateItem(item) {
    const box = G.itemBBox(item);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.d / 2;
    item.rot = (item.rot + 90) % 360;
    const next = G.itemBBox(item);
    item.x = cx - next.w / 2;
    item.y = cy - next.d / 2;
  }

  function deleteSelected() {
    if (!state.selected) return;
    pushHistory();
    if (state.selected.kind === "item") {
      state.items = state.items.filter((i) => i.id !== state.selected.id);
    } else if (state.selected.kind === "opening") {
      state.openings = state.openings.filter((o) => o.id !== state.selected.id);
    } else if (state.selected.kind === "vertex" && !state.outline.closed) {
      state.outline.points.splice(state.selected.index, 1);
    } else if (state.selected.kind === "vertex" && state.outline.points.length > 3) {
      const removed = state.selected.index;
      state.outline.points.splice(removed, 1);
      state.openings = state.openings
        .filter((o) => o.wallIndex !== removed)
        .map((o) => (o.wallIndex > removed ? { ...o, wallIndex: o.wallIndex - 1 } : o));
    } else if (state.selected.kind === "edge") {
      state.openings = state.openings.filter((o) => o.wallIndex !== state.selected.index);
    }
    state.selected = null;
    persist();
    refresh();
  }

  function duplicateSelected() {
    const item = selectedItem();
    if (!item) return;
    pushHistory();
    const copy = {
      ...item,
      id: G.uid(item.type, state.seq),
      name: `${item.name} Kopie`,
      x: item.x + state.grid * 2,
      y: item.y + state.grid * 2,
    };
    state.seq += 1;
    state.items.push(copy);
    state.selected = { kind: "item", id: copy.id };
    persist();
    refresh();
  }

  function closeOutline() {
    if (state.outline.points.length < 3) return;
    pushHistory();
    state.outline.closed = true;
    state.tool = "select";
    setTool("select");
    persist();
    fitView();
  }

  function makeRectHall() {
    const length = Math.max(100, num("hall-length", 40) * 100);
    const width = Math.max(100, num("hall-width", 25) * 100);
    pushHistory();
    state.outline = {
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: length, y: 0 },
        { x: length, y: width },
        { x: 0, y: width },
      ],
    };
    state.openings = [];
    state.hallHeight = Math.max(200, num("hall-height", 8) * 100);
    state.wallThickness = num("wall-thick", 20);
    persist();
    fitView();
  }

  function applyHallFields() {
    state.hallHeight = Math.max(200, num("hall-height", 8) * 100);
    state.wallThickness = num("wall-thick", 20);
    persist();
    refresh();
  }

  function applySelectedFromForms() {
    const item = selectedItem();
    if (!item) return;
    pushHistory();
    if (item.type === "block") {
      item.name = $("block-name").value || item.name;
      item.w = snapValue(num("block-w", item.w));
      item.d = snapValue(num("block-d", item.d));
      item.h = num("block-h", item.h);
    } else if (item.type === "pallet") {
      item.name = $("pallet-name").value || item.name;
      item.w = snapValue(num("pallet-w", item.w));
      item.d = snapValue(num("pallet-d", item.d));
      item.h = num("pallet-h", item.h);
      item.bays = Math.max(1, Math.round(num("pallet-bays", item.bays)));
      item.levels = Math.max(1, Math.round(num("pallet-levels", item.levels)));
      item.firstBeam = num("pallet-first", item.firstBeam);
    } else if (item.type === "cantilever") {
      item.name = $("cant-name").value || item.name;
      item.w = snapValue(num("cant-w", item.w));
      item.arm = snapValue(num("cant-arm", item.arm || 120));
      item.sided = $("cant-sided").value;
      item.d = item.sided === "single" ? item.arm + 40 : item.arm * 2 + 40;
      item.h = num("cant-h", item.h);
      item.columns = Math.max(2, Math.round(num("cant-cols", item.columns)));
      item.levels = Math.max(1, Math.round(num("cant-levels", item.levels)));
    }
    persist();
    refresh();
  }

  function applyOpeningFromForms() {
    const opening = selectedOpening();
    if (!opening) return;
    pushHistory();
    opening.width = snapValue(num("open-w", opening.width));
    opening.height = num("open-h", opening.height);
    opening.sill = num("open-sill", opening.sill || 0);
    if (state.outline.closed) {
      G.clampOpening(opening, G.wallLength(state.outline.points, opening.wallIndex));
    }
    persist();
    refresh();
  }

  function fillFormsFromSelection() {
    const item = selectedItem();
    const opening = selectedOpening();
    if (opening) {
      $("open-w").value = Math.round(opening.width);
      $("open-h").value = Math.round(opening.height);
      $("open-sill").value = Math.round(opening.sill || 0);
      return;
    }
    if (!item) return;
    if (item.type === "block") {
      $("block-name").value = item.name;
      $("block-w").value = Math.round(item.w);
      $("block-d").value = Math.round(item.d);
      $("block-h").value = Math.round(item.h);
    } else if (item.type === "pallet") {
      $("pallet-name").value = item.name;
      $("pallet-w").value = Math.round(item.w);
      $("pallet-d").value = Math.round(item.d);
      $("pallet-h").value = Math.round(item.h);
      $("pallet-bays").value = item.bays;
      $("pallet-levels").value = item.levels;
      $("pallet-first").value = item.firstBeam;
    } else if (item.type === "cantilever") {
      $("cant-name").value = item.name;
      $("cant-w").value = Math.round(item.w);
      $("cant-arm").value = Math.round(item.arm || 120);
      $("cant-h").value = Math.round(item.h);
      $("cant-levels").value = item.levels;
      $("cant-cols").value = item.columns;
      $("cant-sided").value = item.sided;
    }
  }

  function showLiveDim(evt, text) {
    if (!text) {
      liveDim.classList.add("hidden");
      return;
    }
    const wrap = canvas.parentElement.getBoundingClientRect();
    liveDim.textContent = text;
    liveDim.style.left = `${evt.clientX - wrap.left + 14}px`;
    liveDim.style.top = `${evt.clientY - wrap.top - 12}px`;
    liveDim.classList.remove("hidden");
  }

  function liveDimText(evt) {
    if (state.view !== "plan") return "";
    if (state.tool === "draw" && state.outline.points.length) {
      const last = state.outline.points[state.outline.points.length - 1];
      let target = state.cursorWorld;
      if (!target) return "";
      if (state.shiftOrtho) target = G.orthoFrom(last, target);
      return G.fmtCmM(G.dist(last, target));
    }
    if (drag && drag.kind === "vertex") {
      const pts = state.outline.points;
      const i = drag.index;
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      const p = pts[i];
      if (state.outline.closed || i > 0) {
        return `${G.fmtCm(G.dist(prev, p))} · ${G.fmtCm(G.dist(p, next))}`;
      }
      return G.fmtCm(G.dist(p, next));
    }
    if (drag && drag.kind === "edge") {
      return G.fmtCmM(G.wallLength(state.outline.points, drag.index));
    }
    return "";
  }

  function onPointerDown(evt) {
    if (evt.button === 1 || state.tool === "pan" || spacePan) {
      drag = { kind: "pan", x: evt.clientX, y: evt.clientY, camX: state.cam.x, camY: state.cam.y };
      canvas.setPointerCapture(evt.pointerId);
      return;
    }
    if (state.view !== "plan") return;
    const world = snapP(worldFromEvent(evt));
    state.cursorWorld = world;

    if (state.tool === "draw") {
      if (state.outline.closed) {
        const ok = window.confirm("Bestehenden Hallenumriss neu zeichnen? Türen, Tore und Fenster an den Wänden entfallen.");
        if (!ok) return;
        pushHistory();
        state.outline = { points: [], closed: false };
        state.openings = [];
      } else if (!state.outline.points.length) {
        pushHistory();
      }
      const pts = state.outline.points;
      if (pts.length >= 3 && G.dist(world, pts[0]) <= Math.max(state.grid, 20)) {
        closeOutline();
        return;
      }
      let point = world;
      if (state.shiftOrtho && pts.length) point = G.orthoFrom(pts[pts.length - 1], world);
      pts.push(snapP(point));
      persist();
      refresh();
      return;
    }

    if (state.tool === "door" || state.tool === "gate" || state.tool === "window") {
      placeOpening(state.tool, world);
      return;
    }
    if (state.tool === "block" || state.tool === "pallet" || state.tool === "cantilever") {
      placeItem(state.tool, world);
      return;
    }

    const hit = hitTest(worldFromEvent(evt));
    state.selected = hit;
    fillFormsFromSelection();
    if (hit && hit.kind === "item") {
      const item = selectedItem();
      drag = { kind: "item", id: item.id, dx: world.x - item.x, dy: world.y - item.y };
      pushHistory();
    } else if (hit && hit.kind === "vertex") {
      drag = { kind: "vertex", index: hit.index };
      pushHistory();
    } else if (hit && hit.kind === "opening") {
      const opening = selectedOpening();
      drag = { kind: "opening", id: opening.id, grab: world };
      pushHistory();
    } else if (hit && hit.kind === "edge") {
      drag = { kind: "edge", index: hit.index, grab: world };
    }
    canvas.setPointerCapture(evt.pointerId);
    refresh();
  }

  function onPointerMove(evt) {
    state.shiftOrtho = evt.shiftKey;
    const screen = R.canvasPoint(evt, canvas);
    state.cursorWorld = R.screenToWorld(screen, state.cam, viewSize);
    if (drag && drag.kind === "pan") {
      state.cam.x = drag.camX - (evt.clientX - drag.x) / state.cam.zoom;
      state.cam.y = drag.camY - (evt.clientY - drag.y) / state.cam.zoom;
      refresh();
      return;
    }
    if (drag && drag.kind === "item") {
      const item = state.items.find((i) => i.id === drag.id);
      if (item) {
        item.x = snapValue(state.cursorWorld.x - drag.dx);
        item.y = snapValue(state.cursorWorld.y - drag.dy);
      }
    } else if (drag && drag.kind === "vertex") {
      let p = state.cursorWorld;
      if (state.shiftOrtho && state.outline.points.length > 1) {
        const prev = state.outline.points[(drag.index - 1 + state.outline.points.length) % state.outline.points.length];
        p = G.orthoFrom(prev, p);
      }
      state.outline.points[drag.index] = snapP(p);
    } else if (drag && drag.kind === "opening") {
      const opening = state.openings.find((o) => o.id === drag.id);
      const edge = G.nearestEdge(state.cursorWorld, state.outline.points, true);
      if (opening && edge && edge.dist < 120) {
        opening.wallIndex = edge.index;
        opening.offset = snapValue(edge.t * edge.length - opening.width / 2);
        G.clampOpening(opening, edge.length);
      }
    }
    showLiveDim(evt, liveDimText(evt));
    refresh();
  }

  function onPointerUp() {
    if (drag && (drag.kind === "item" || drag.kind === "vertex" || drag.kind === "opening")) persist();
    drag = null;
    refresh();
  }

  function onWheel(evt) {
    evt.preventDefault();
    const factor = evt.deltaY < 0 ? 1.12 : 1 / 1.12;
    const screen = R.canvasPoint(evt, canvas);
    const before = R.screenToWorld(screen, state.cam, viewSize);
    state.cam.zoom = Math.max(0.02, Math.min(3.5, state.cam.zoom * factor));
    const after = R.screenToWorld(screen, state.cam, viewSize);
    state.cam.x += before.x - after.x;
    state.cam.y += before.y - after.y;
    refresh();
  }

  function onContextMenu(evt) {
    evt.preventDefault();
    const world = worldFromEvent(evt);
    const hit = hitTest(world);
    if (hit) {
      state.selected = hit;
      fillFormsFromSelection();
    }
    const menu = $("context-menu");
    menu.style.left = `${evt.clientX}px`;
    menu.style.top = `${evt.clientY}px`;
    menu.classList.remove("hidden");
    refresh();
  }

  function hideMenu() {
    $("context-menu").classList.add("hidden");
  }

  function fitView() {
    viewSize = R.resizeCanvas(canvas);
    state.cam = R.fitCamera(state.outline.points, state.items, viewSize, 88);
    fittedOnce = true;
    refresh();
  }

  function refresh() {
    analyze();
    viewSize = R.draw(canvas, state);
    updateChrome();
  }

  function loadExample() {
    pushHistory();
    state.outline = {
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 2500 },
        { x: 0, y: 2500 },
      ],
    };
    state.hallHeight = 800;
    state.wallThickness = 20;
    state.openings = [
      { id: "open-1", type: "gate", wallIndex: 2, offset: 400, width: 400, height: 400, sill: 0 },
      { id: "open-2", type: "gate", wallIndex: 2, offset: 1600, width: 400, height: 400, sill: 0 },
      { id: "open-3", type: "door", wallIndex: 3, offset: 200, width: 100, height: 210, sill: 0 },
      { id: "open-4", type: "window", wallIndex: 0, offset: 800, width: 150, height: 120, sill: 110 },
      { id: "open-5", type: "window", wallIndex: 0, offset: 2000, width: 150, height: 120, sill: 110 },
    ];
    state.items = [
      { id: "pallet-1", type: "pallet", name: "Palettenregal 1", x: 80, y: 80, w: 1080, d: 110, h: 600, rot: 0, bays: 4, levels: 4, firstBeam: 20 },
      { id: "pallet-2", type: "pallet", name: "Palettenregal 2", x: 80, y: 320, w: 1080, d: 110, h: 600, rot: 0, bays: 4, levels: 4, firstBeam: 20 },
      { id: "pallet-3", type: "pallet", name: "Palettenregal 3", x: 80, y: 560, w: 1080, d: 110, h: 750, rot: 0, bays: 4, levels: 5, firstBeam: 20 },
      { id: "cant-1", type: "cantilever", name: "Kragarmregal 1", x: 3200, y: 80, w: 600, d: 280, h: 800, rot: 90, arm: 120, sided: "double", columns: 4, levels: 5 },
      { id: "cant-2", type: "cantilever", name: "Kragarmregal 2", x: 3560, y: 80, w: 600, d: 160, h: 800, rot: 90, arm: 120, sided: "single", columns: 4, levels: 5 },
      { id: "block-1", type: "block", name: "Blocklager WE", x: 1400, y: 1700, w: 800, d: 480, h: 180, rot: 0 },
      { id: "block-2", type: "block", name: "Blocklager WA", x: 2400, y: 1700, w: 640, d: 400, h: 160, rot: 0 },
    ];
    state.seq = 20;
    state.selected = null;
    $("hall-length").value = "40";
    $("hall-width").value = "25";
    $("hall-height").value = "8";
    persist();
    fitView();
  }

  function bindPresets() {
    const openHost = $("opening-presets");
    Cat.OPENING_PRESETS.forEach((preset) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "preset-btn";
      btn.innerHTML = `${preset.label}<span>${preset.width} × ${preset.height} cm</span>`;
      btn.addEventListener("click", () => {
        $("open-w").value = preset.width;
        $("open-h").value = preset.height;
        $("open-sill").value = preset.sill;
        setTool(preset.type);
      });
      openHost.appendChild(btn);
    });

    const palletHost = $("pallet-presets");
    Cat.PALLET_PRESETS.forEach((preset) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "preset-btn";
      btn.innerHTML = `${preset.label}<span>${preset.w} × ${preset.d} × ${preset.h} cm</span>`;
      btn.addEventListener("click", () => {
        $("pallet-w").value = preset.w;
        $("pallet-d").value = preset.d;
        $("pallet-h").value = preset.h;
        $("pallet-bays").value = preset.bays;
        $("pallet-levels").value = preset.levels;
        $("pallet-first").value = preset.firstBeam;
        setTool("pallet");
      });
      palletHost.appendChild(btn);
    });

    const cantHost = $("cantilever-presets");
    Cat.CANTILEVER_PRESETS.forEach((preset) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "preset-btn";
      btn.innerHTML = `${preset.label}<span>${preset.w} cm · ${preset.sided === "double" ? "beidseitig" : "einseitig"}</span>`;
      btn.addEventListener("click", () => {
        $("cant-w").value = preset.w;
        $("cant-arm").value = preset.arm;
        $("cant-h").value = preset.h;
        $("cant-levels").value = preset.levels;
        $("cant-cols").value = preset.columns;
        $("cant-sided").value = preset.sided;
        setTool("cantilever");
      });
      cantHost.appendChild(btn);
    });
  }

  function bindUi() {
    document.querySelectorAll(".tool-btn").forEach((btn) => {
      btn.addEventListener("click", () => setTool(btn.dataset.tool));
    });
    document.querySelectorAll(".view-tab").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });
    $("btn-rect-hall").addEventListener("click", makeRectHall);
    $("btn-draw-outline").addEventListener("click", () => setTool("draw"));
    $("btn-close-outline").addEventListener("click", closeOutline);
    $("btn-place-door").addEventListener("click", () => setTool("door"));
    $("btn-place-gate").addEventListener("click", () => setTool("gate"));
    $("btn-place-window").addEventListener("click", () => setTool("window"));
    $("btn-place-block").addEventListener("click", () => setTool("block"));
    $("btn-place-pallet").addEventListener("click", () => setTool("pallet"));
    $("btn-place-cantilever").addEventListener("click", () => setTool("cantilever"));
    $("btn-undo").addEventListener("click", undo);
    $("btn-fit").addEventListener("click", fitView);
    $("btn-rotate").addEventListener("click", () => {
      const item = selectedItem();
      if (!item) return;
      pushHistory();
      rotateItem(item);
      persist();
      refresh();
    });
    $("btn-dup").addEventListener("click", duplicateSelected);
    $("btn-delete").addEventListener("click", deleteSelected);
    $("btn-clear").addEventListener("click", () => {
      if (!window.confirm("Den gesamten Lagerplan löschen?")) return;
      pushHistory();
      state.outline = { points: [], closed: false };
      state.openings = [];
      state.items = [];
      state.selected = null;
      persist();
      refresh();
    });
    $("btn-example").addEventListener("click", loadExample);
    $("btn-save").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "lagerplanung.json";
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $("btn-load").addEventListener("click", () => fileImport.click());
    fileImport.addEventListener("change", () => {
      const file = fileImport.files && fileImport.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          pushHistory();
          importData(JSON.parse(String(reader.result)));
          persist();
        } catch (err) {
          window.alert("Die Datei konnte nicht gelesen werden.");
        }
      };
      reader.readAsText(file);
      fileImport.value = "";
    });

    $("snap-grid").addEventListener("change", () => {
      state.snap = $("snap-grid").checked;
    });
    $("show-grid").addEventListener("change", () => {
      state.showGrid = $("show-grid").checked;
      refresh();
    });
    $("show-dimensions").addEventListener("change", () => {
      state.showDims = $("show-dimensions").checked;
      refresh();
    });
    $("grid-size").addEventListener("change", () => {
      state.grid = Number($("grid-size").value) || 10;
      persist();
      refresh();
    });
    ["hall-height", "wall-thick"].forEach((id) => {
      $(id).addEventListener("change", applyHallFields);
    });
    ["block-name", "block-w", "block-d", "block-h", "pallet-name", "pallet-w", "pallet-d", "pallet-h", "pallet-bays", "pallet-levels", "pallet-first", "cant-name", "cant-w", "cant-arm", "cant-h", "cant-levels", "cant-cols", "cant-sided"].forEach((id) => {
      $(id).addEventListener("change", applySelectedFromForms);
    });
    ["open-w", "open-h", "open-sill"].forEach((id) => {
      $(id).addEventListener("change", applyOpeningFromForms);
    });

    $("context-menu").addEventListener("click", (evt) => {
      const action = evt.target.closest("[data-action]");
      if (!action) return;
      if (action.dataset.action === "rotate") $("btn-rotate").click();
      if (action.dataset.action === "dup") duplicateSelected();
      if (action.dataset.action === "delete") deleteSelected();
      hideMenu();
    });

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener("pointerleave", () => showLiveDim(null, ""));
    window.addEventListener("click", hideMenu);
    window.addEventListener("resize", () => {
      if (fittedOnce) refresh();
      else fitView();
    });
    window.addEventListener("keydown", (evt) => {
      if (evt.code === "Space") spacePan = true;
      if (evt.key === "Escape") {
        if (state.tool === "draw" && state.outline.points.length && !state.outline.closed) {
          state.outline.points.pop();
          persist();
        } else {
          state.selected = null;
          setTool("select");
        }
        refresh();
      }
      if (evt.key === "Enter" && state.tool === "draw") closeOutline();
      if ((evt.key === "Delete" || evt.key === "Backspace") && !isTyping(evt)) {
        evt.preventDefault();
        deleteSelected();
      }
      if (evt.key.toLowerCase() === "r" && !isTyping(evt)) $("btn-rotate").click();
      if (evt.ctrlKey && evt.key.toLowerCase() === "z") {
        evt.preventDefault();
        undo();
      }
    });
    window.addEventListener("keyup", (evt) => {
      if (evt.code === "Space") spacePan = false;
    });
  }

  function isTyping(evt) {
    const tag = evt.target && evt.target.tagName;
    return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
  }

  bindPresets();
  bindUi();
  if (window.ResizeObserver) {
    let lastKey = "";
    new ResizeObserver(() => {
      const key = `${canvas.parentElement.clientWidth}x${canvas.parentElement.clientHeight}`;
      if (key === lastKey) return;
      lastKey = key;
      if (fittedOnce && state.outline.points.length) fitView();
      else refresh();
    }).observe(canvas.parentElement);
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (restore()) {
        fitView();
      } else {
        loadExample();
        history.length = 0;
        $("btn-undo").disabled = true;
      }
      updateHint();
    });
  });
})();
