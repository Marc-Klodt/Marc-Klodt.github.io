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
    outerGrid: 100,
    innerUnit: "cm",
    outerUnit: "m",
    snap: true,
    showGrid: true,
    showOuterGrid: true,
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
    draftSegment: null,
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

  const CM_STEPS = [1, 5, 10, 20, 50, 100];
  const M_STEPS = [0.5, 1, 2, 5];

  function isInsideHall(p) {
    return Boolean(
      state.outline.closed
      && state.outline.points.length >= 3
      && G.pointInPolygon(p, state.outline.points)
    );
  }

  function gridForZone(zone) {
    return zone === "outer" ? (state.outerGrid || 100) : (state.grid || 10);
  }

  function gridAt(p, zone) {
    if (zone === "inner" || zone === "outer") return gridForZone(zone);
    if (state.tool === "draw") return gridForZone("outer");
    if (isInsideHall(p)) return gridForZone("inner");
    return gridForZone("outer");
  }

  function snapValue(v, zone) {
    return state.snap ? G.snap(v, gridForZone(zone || "inner")) : v;
  }

  function snapP(p, zone) {
    return state.snap ? G.snapPoint(p, gridAt(p, zone)) : { x: p.x, y: p.y };
  }

  function snapItemXY(item, x, y) {
    if (!state.snap) return { x, y };
    const swapped = item.rot === 90 || item.rot === 270;
    const bw = swapped ? item.d : item.w;
    const bd = swapped ? item.w : item.d;
    const center = { x: x + bw / 2, y: y + bd / 2 };
    return G.snapRectToGrid(x, y, bw, bd, gridAt(center));
  }

  function fmtGridLabel(cm, unit) {
    if (unit === "m") {
      const m = cm / 100;
      return `${String(m).replace(".", ",")} m`;
    }
    return `${cm} cm`;
  }

  function fillStepSelect(sel, unit, currentCm) {
    sel.innerHTML = "";
    const stepsCm = unit === "m" ? M_STEPS.map((m) => Math.round(m * 100)) : CM_STEPS;
    stepsCm.forEach((cm, i) => {
      const opt = document.createElement("option");
      opt.value = String(cm);
      opt.textContent = unit === "m"
        ? `${String(M_STEPS[i]).replace(".", ",")} m`
        : `${cm} cm`;
      sel.appendChild(opt);
    });
    let best = stepsCm[0];
    let dist = Infinity;
    stepsCm.forEach((cm) => {
      const d = Math.abs(cm - currentCm);
      if (d < dist) {
        dist = d;
        best = cm;
      }
    });
    sel.value = String(best);
    return best;
  }

  function syncGridControls() {
    const snapEl = $("snap-grid");
    const showEl = $("show-grid");
    const outerEl = $("show-outer-grid");
    const dimEl = $("show-dimensions");
    if (snapEl) snapEl.checked = state.snap;
    if (showEl) showEl.checked = state.showGrid;
    if (outerEl) outerEl.checked = state.showOuterGrid;
    if (dimEl) dimEl.checked = state.showDims;
    document.querySelectorAll("input[name=inner-unit]").forEach((el) => {
      el.checked = el.value === state.innerUnit;
    });
    document.querySelectorAll("input[name=outer-unit]").forEach((el) => {
      el.checked = el.value === state.outerUnit;
    });
    if ($("grid-in-step")) {
      state.grid = fillStepSelect($("grid-in-step"), state.innerUnit, state.grid);
    }
    if ($("grid-out-step")) {
      state.outerGrid = fillStepSelect($("grid-out-step"), state.outerUnit, state.outerGrid);
    }
  }

  function readGridFromUi() {
    const inner = document.querySelector("input[name=inner-unit]:checked");
    const outer = document.querySelector("input[name=outer-unit]:checked");
    state.innerUnit = inner && inner.value === "m" ? "m" : "cm";
    state.outerUnit = outer && outer.value === "cm" ? "cm" : "m";
    state.grid = Number($("grid-in-step").value) || 10;
    state.outerGrid = Number($("grid-out-step").value) || 100;
    persist();
    refresh();
  }

  function requireHall() {
    if (state.outline.closed && state.outline.points.length >= 3) return true;
    window.alert("Bitte zuerst den Hallenumriss schließen oder eine Rechteck-Halle anlegen.");
    return false;
  }

  function overlapsBarrier(rect, exceptId) {
    return state.items.some((it) => (
      it.id !== exceptId
      && G.isBarrier(it)
      && G.rectsOverlap(rect, G.itemBBox(it))
    ));
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
      outerGrid: state.outerGrid,
      innerUnit: state.innerUnit,
      outerUnit: state.outerUnit,
      snap: state.snap,
      showGrid: state.showGrid,
      showOuterGrid: state.showOuterGrid,
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
    state.outerGrid = data.outerGrid || 100;
    state.innerUnit = data.innerUnit === "m" ? "m" : "cm";
    state.outerUnit = data.outerUnit === "cm" ? "cm" : "m";
    state.snap = data.snap !== false;
    state.showGrid = data.showGrid !== false;
    state.showOuterGrid = data.showOuterGrid !== false;
    state.outline = data.outline || { points: [], closed: false };
    state.openings = Array.isArray(data.openings) ? data.openings : [];
    state.items = Array.isArray(data.items) ? data.items : [];
    state.seq = data.seq || state.items.length + state.openings.length + 1;
    state.selected = null;
    $("hall-height").value = (state.hallHeight / 100).toFixed(1);
    $("wall-thick").value = state.wallThickness;
    syncGridControls();
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
    state.draftSegment = null;
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
      select: "Objekt anklicken und ziehen zum Versetzen. R dreht, Entf löscht. Wege und Mauern per Rechtsklick oder an den Punkten bearbeiten. Duplizieren nur über das Rechtsklick-Menü.",
      draw: "Klicken setzt Punkte. Linie folgt der Maus in cm. Umschalt = rechtwinklig. Ersten Punkt oder Enter schließt.",
      door: "An eine Wand klicken. Danach wieder Auswählen. Duplizieren nur über Rechtsklick.",
      gate: "An eine Wand klicken. Danach wieder Auswählen. Duplizieren nur über Rechtsklick.",
      window: "An eine Wand klicken. Danach wieder Auswählen. Duplizieren nur über Rechtsklick.",
      block: "Ein Klick platziert das Blocklager. Danach wieder Auswählen. Duplizieren nur über Rechtsklick.",
      pallet: "Ein Klick platziert das Palettenregal. Danach wieder Auswählen. Duplizieren nur über Rechtsklick.",
      cantilever: "Ein Klick platziert das Kragarmregal. Danach wieder Auswählen. Duplizieren nur über Rechtsklick.",
      wall: "Zwei Punkte klicken: Start und Ende. Mauern sind rot und mindestens 20 cm stark. Danach ziehen zum Versetzen.",
      line: "Zwei Punkte klicken: Start und Ende der Linie. Danach wieder Auswählen. Auf Linien kann nichts stehen.",
      path: "Zwei Punkte klicken: Start und Ende des gelben Weges. Danach wieder Auswählen. Auf Wegen kann nichts stehen.",
      platform: "Ein Klick platziert das Podest. Danach wieder Auswählen. Duplizieren nur über Rechtsklick.",
      gallery: "Ein Klick platziert die Empore. Danach wieder Auswählen. Duplizieren nur über Rechtsklick.",
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
      const item = state.items[i];
      if (G.isPath(item)) continue;
      const a = G.itemBBox(item);
      if (state.outline.closed && !G.rectInsidePolygon(a, state.outline.points)) {
        outside.add(item.id);
      }
      if (!G.isBarrier(item) && overlapsBarrier(a, item.id)) {
        collide.add(item.id);
      }
      for (let j = i + 1; j < state.items.length; j += 1) {
        const other = state.items[j];
        if (G.isPath(other)) continue;
        if (G.rectsOverlap(a, G.itemBBox(other)) && !G.allowedOverlap(item, other)) {
          collide.add(item.id);
          collide.add(other.id);
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
      if (!G.isEquipment(item)) return sum;
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
      <div class="header-stat"><strong>${state.items.filter((i) => G.isEquipment(i) || G.isSurface(i)).length}</strong>Einrichtungen</div>
    `;
    renderBar($("usage-bar-chart"), "Grundfläche", used / 10000, Math.max(area / 10000, 0.01), "m²");
    renderBar($("height-bar-chart"), "Höhe", maxH / 100, state.hallHeight / 100, "m");
    const pxPerM = state.cam.zoom * 100;
    $("scale-info").textContent = state.view === "plan"
      ? `Maßstab · ${pxPerM.toFixed(1)} px / m · innen ${fmtGridLabel(state.grid, state.innerUnit)} · außen ${fmtGridLabel(state.outerGrid, state.outerUnit)}`
      : "Aufriss · Höhen in cm";
    $("stat-info").innerHTML = [
      `Wände: ${state.outline.closed ? state.outline.points.length : Math.max(0, state.outline.points.length - 1)}`,
      `Innenmauern: ${state.items.filter((i) => i.type === "wall").length}`,
      `Linien: ${state.items.filter((i) => i.type === "line").length}`,
      `Wege: ${state.items.filter((i) => i.type === "path").length}`,
      `Podeste: ${state.items.filter((i) => i.type === "platform").length}`,
      `Emporen: ${state.items.filter((i) => i.type === "gallery").length}`,
      `Öffnungen: ${state.openings.length}`,
      `Blocklager: ${state.items.filter((i) => i.type === "block").length}`,
      `Palettenregale: ${state.items.filter((i) => i.type === "pallet").length}`,
      `Kragarmregale: ${state.items.filter((i) => i.type === "cantilever").length}`,
      state.collidingIds.size ? `<span class="warning">Konflikt (Überlappung oder auf Mauer/Linie/Weg): ${state.collidingIds.size}</span>` : "Keine Überlappung",
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
    $("btn-delete").disabled = !canEdit;

    if (item) {
      if (item.type === "path") {
        box.innerHTML = `
          <div class="detail-card">
            <div class="detail-name">${escapeHtml(item.name)}</div>
            <label>Bezeichnung
              <input type="text" id="detail-path-name" maxlength="40" value="${escapeHtml(item.name)}">
            </label>
            <label>Länge (cm)
              <input type="number" id="detail-path-len" min="40" max="50000" step="1" value="${Math.round(item.w)}">
            </label>
            <label>Wegbreite (cm)
              <input type="number" id="detail-path-width" min="40" max="2000" step="1" value="${Math.round(item.d)}">
            </label>
            <dl class="detail-list">
              <dt>Markierung</dt><dd>gelb</dd>
              <dt>Position</dt><dd>${Math.round(item.x)} / ${Math.round(item.y)} cm</dd>
              <dt>Stellfläche</dt><dd class="warn">keine Platzierung</dd>
            </dl>
            <p class="panel-note">Rechtsklick öffnet dieselben Felder. Quadrate an den Längsseiten ändern die Breite, Kreise an den Enden die Länge.</p>
          </div>`;
        const applyDetailPath = () => {
          applyPathEdit(item, {
            name: $("detail-path-name").value,
            length: num("detail-path-len", item.w),
            width: num("detail-path-width", item.d),
          });
        };
        ["detail-path-name", "detail-path-len", "detail-path-width"].forEach((id) => {
          const el = $(id);
          if (el) el.addEventListener("change", applyDetailPath);
        });
        return;
      }
      if (item.type === "wall") {
        box.innerHTML = `
          <div class="detail-card">
            <div class="detail-name">${escapeHtml(item.name)}</div>
            <label>Länge (cm)
              <input type="number" id="detail-wall-len" min="20" max="50000" step="1" value="${Math.round(item.w)}">
            </label>
            <label>Stärke (cm)
              <input type="number" id="detail-wall-thick" min="20" max="80" step="1" value="${Math.round(item.d)}">
            </label>
            <dl class="detail-list">
              <dt>Farbe</dt><dd>rot</dd>
              <dt>Position</dt><dd>${Math.round(item.x)} / ${Math.round(item.y)} cm</dd>
              <dt>Stellfläche</dt><dd class="warn">keine Platzierung</dd>
            </dl>
            <p class="panel-note">Die Mauer ziehen, um sie zu versetzen. Quadrate ändern die Stärke (mindestens 20 cm), Kreise die Länge.</p>
          </div>`;
        const applyDetailWall = () => {
          applyWallEdit(item, {
            length: num("detail-wall-len", item.w),
            width: num("detail-wall-thick", item.d),
          });
        };
        ["detail-wall-len", "detail-wall-thick"].forEach((id) => {
          const el = $(id);
          if (el) el.addEventListener("change", applyDetailWall);
        });
        return;
      }
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
            ${G.isSurface(item) ? `<dt>Tragfläche</dt><dd>Regale dürfen hier stehen</dd>` : ""}
            ${G.isBarrier(item) ? `<dt>Stellfläche</dt><dd class="warn">keine Platzierung</dd>` : ""}
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

  function itemPickRect(item, pick) {
    const b = G.itemBBox(item);
    if (item.type !== "wall" && item.type !== "line") return b;
    const pad = Math.max(pick, 18);
    const swapped = item.rot === 90 || item.rot === 270;
    if (swapped) {
      return { x: b.x - pad, y: b.y, w: b.w + pad * 2, d: b.d };
    }
    return { x: b.x, y: b.y - pad, w: b.w, d: b.d + pad * 2 };
  }

  function hitTest(world) {
    const pick = 14 / state.cam.zoom;
    const selected = selectedItem();
    if (selected && (selected.type === "path" || selected.type === "wall")) {
      const ends = G.pathEndPoints(selected);
      for (let i = 0; i < ends.length; i += 1) {
        if (G.dist(world, ends[i]) <= pick) {
          return { kind: "path-end", id: selected.id, end: i };
        }
      }
      const sides = G.pathSidePoints(selected);
      for (let i = 0; i < sides.length; i += 1) {
        if (G.dist(world, sides[i]) <= pick) {
          return { kind: "path-side", id: selected.id, side: i };
        }
      }
    }
    const rank = (item) => (G.isBarrier(item) ? 2 : G.isSurface(item) ? 0 : 1);
    const ordered = state.items.slice().sort((a, b) => rank(b) - rank(a));
    for (let i = 0; i < ordered.length; i += 1) {
      if (G.pointInRect(world, itemPickRect(ordered[i], pick))) {
        return { kind: "item", id: ordered[i].id };
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
    setTool("select");
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
    if (type === "platform") {
      return {
        type: "platform",
        name: $("plat-name").value || "Podest",
        w: snapValue(num("plat-w", 400)),
        d: snapValue(num("plat-d", 240)),
        h: num("plat-h", 80),
        rot: 0,
      };
    }
    if (type === "gallery") {
      return {
        type: "gallery",
        name: $("gal-name").value || "Empore",
        w: snapValue(num("gal-w", 800)),
        d: snapValue(num("gal-d", 600)),
        h: num("gal-h", 350),
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
    if (!requireHall()) return;
    const stamp = currentStamp(type);
    const pos = snapItemXY(stamp, world.x - stamp.w / 2, world.y - stamp.d / 2);
    stamp.x = pos.x;
    stamp.y = pos.y;
    if (overlapsBarrier(G.itemBBox(stamp))) {
      window.alert("Auf Mauern, Linien und Wegen kann nichts gestellt werden.");
      return;
    }
    pushHistory();
    const item = {
      ...stamp,
      id: G.uid(type, state.seq),
    };
    state.seq += 1;
    const names = state.items.filter((i) => i.type === type).length + 1;
    if (!stamp.name.match(/\d+$/)) item.name = `${stamp.name} ${names}`;
    state.items.push(item);
    state.selected = { kind: "item", id: item.id };
    persist();
    setTool("select");
  }

  function finishSegment(type, start, end) {
    if (!requireHall()) return;
    const a = snapP(start);
    let b = G.orthoFrom(a, end);
    b = snapP(b);
    const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    const len = horizontal ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
    if (len < state.grid) return;
    let thick;
    let height;
    let name;
    if (type === "line") {
      thick = Math.max(state.grid, 8);
      height = 0;
      name = "Linie";
    } else if (type === "path") {
      thick = clampPathWidth(num("path-width", 250));
      height = 0;
      name = "Weg";
    } else {
      thick = clampWallThick(num("inner-wall-thick", 20));
      height = num("inner-wall-h", state.hallHeight);
      name = "Mauer";
    }
    const item = {
      type,
      name,
      w: snapValue(len),
      d: thick,
      h: height,
      rot: horizontal ? 0 : 90,
      x: 0,
      y: 0,
    };
    if (horizontal) {
      item.x = Math.min(a.x, b.x);
      item.y = snapValue(a.y - thick / 2);
    } else {
      item.x = snapValue(a.x - thick / 2);
      item.y = Math.min(a.y, b.y);
    }
    const pos = snapItemXY(item, item.x, item.y);
    item.x = pos.x;
    item.y = pos.y;
    pushHistory();
    item.id = G.uid(type, state.seq);
    state.seq += 1;
    const names = state.items.filter((i) => i.type === type).length + 1;
    item.name = `${item.name} ${names}`;
    state.items.push(item);
    state.selected = { kind: "item", id: item.id };
    state.draftSegment = null;
    persist();
    setTool("select");
  }

  function rotateItem(item) {
    const box = G.itemBBox(item);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.d / 2;
    item.rot = (item.rot + 90) % 360;
    const next = G.itemBBox(item);
    item.x = cx - next.w / 2;
    item.y = cy - next.d / 2;
    const pos = snapItemXY(item, item.x, item.y);
    item.x = pos.x;
    item.y = pos.y;
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
    };
    state.seq += 1;
    const pos = snapItemXY(copy, item.x + state.grid * 2, item.y + state.grid * 2);
    copy.x = pos.x;
    copy.y = pos.y;
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
    const length = Math.max(100, snapValue(num("hall-length", 40) * 100, "outer"));
    const width = Math.max(100, snapValue(num("hall-width", 25) * 100, "outer"));
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

  function clampWallThick(v) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return 20;
    return Math.max(20, Math.min(80, n));
  }

  function clampPathWidth(v) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return 250;
    return Math.max(40, Math.min(2000, n));
  }

  function applyPathEdit(item, fields, options) {
    if (!item || item.type !== "path") return;
    const opts = options || {};
    if (!opts.skipHistory) pushHistory();
    if (fields.name != null) {
      const name = String(fields.name).trim();
      if (name) item.name = name;
    }
    const box = G.itemBBox(item);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.d / 2;
    if (fields.length != null) {
      const length = Number(fields.length);
      if (Number.isFinite(length)) item.w = Math.max(40, snapValue(length));
    }
    if (fields.width != null) {
      const width = Number(fields.width);
      if (Number.isFinite(width)) item.d = clampPathWidth(width);
    }
    const next = G.itemBBox(item);
    item.x = cx - next.w / 2;
    item.y = cy - next.d / 2;
    const pos = snapItemXY(item, item.x, item.y);
    item.x = pos.x;
    item.y = pos.y;
    if ($("path-width")) $("path-width").value = Math.round(item.d);
    persist();
    refresh();
    syncContextPathFields(item);
  }

  function syncContextPathFields(item) {
    const path = item && item.type === "path" ? item : null;
    const box = $("context-path-edit");
    if (!box) return;
    box.classList.toggle("hidden", !path);
    if (!path) return;
    const nameEl = $("ctx-path-name");
    const lenEl = $("ctx-path-len");
    const widthEl = $("ctx-path-width");
    if (nameEl) nameEl.value = path.name;
    if (lenEl) lenEl.value = String(Math.round(path.w));
    if (widthEl) widthEl.value = String(Math.round(path.d));
  }

  function applyPathFromContext() {
    const item = selectedItem();
    if (!item || item.type !== "path") return;
    applyPathEdit(item, {
      name: $("ctx-path-name").value,
      length: num("ctx-path-len", item.w),
      width: num("ctx-path-width", item.d),
    });
  }

  function setPathWidthFromHandle(item, sideIndex, world) {
    const b = G.itemBBox(item);
    const swapped = item.rot === 90 || item.rot === 270;
    const clamp = item.type === "wall" ? clampWallThick : clampPathWidth;
    if (!swapped) {
      const centerY = b.y + b.d / 2;
      item.d = clamp(Math.abs(world.y - centerY) * 2);
      item.y = centerY - item.d / 2;
    } else {
      const centerX = b.x + b.w / 2;
      item.d = clamp(Math.abs(world.x - centerX) * 2);
      item.x = centerX - item.d / 2;
    }
    if (item.type === "path" && $("path-width")) $("path-width").value = String(Math.round(item.d));
    if (item.type === "wall" && $("inner-wall-thick")) $("inner-wall-thick").value = String(Math.round(item.d));
  }

  function setPathEnd(item, endIndex, world) {
    const b = G.itemBBox(item);
    const swapped = item.rot === 90 || item.rot === 270;
    if (!swapped) {
      const fixedX = endIndex === 0 ? b.x + b.w : b.x;
      const movingX = snapValue(world.x);
      const x0 = Math.min(fixedX, movingX);
      const x1 = Math.max(fixedX, movingX);
      const len = x1 - x0;
      if (len < state.grid) return;
      item.w = snapValue(len);
      item.x = x0;
      item.y = snapValue(b.y + b.d / 2 - item.d / 2);
    } else {
      const fixedY = endIndex === 0 ? b.y + b.d : b.y;
      const movingY = snapValue(world.y);
      const y0 = Math.min(fixedY, movingY);
      const y1 = Math.max(fixedY, movingY);
      const len = y1 - y0;
      if (len < state.grid) return;
      item.w = snapValue(len);
      item.x = snapValue(b.x + b.w / 2 - item.d / 2);
      item.y = y0;
    }
    const pos = snapItemXY(item, item.x, item.y);
    item.x = pos.x;
    item.y = pos.y;
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
    } else if (item.type === "platform") {
      item.name = $("plat-name").value || item.name;
      item.w = snapValue(num("plat-w", item.w));
      item.d = snapValue(num("plat-d", item.d));
      item.h = num("plat-h", item.h);
    } else if (item.type === "gallery") {
      item.name = $("gal-name").value || item.name;
      item.w = snapValue(num("gal-w", item.w));
      item.d = snapValue(num("gal-d", item.d));
      item.h = num("gal-h", item.h);
    } else if (item.type === "wall") {
      item.d = clampWallThick(num("inner-wall-thick", item.d));
      item.h = num("inner-wall-h", item.h);
    } else if (item.type === "path") {
      applyPathEdit(item, { width: num("path-width", item.d) }, { skipHistory: true });
      return;
    }
    persist();
    refresh();
  }

  function applyWallEdit(item, fields, options) {
    if (!item || item.type !== "wall") return;
    const opts = options || {};
    if (!opts.skipHistory) pushHistory();
    const box = G.itemBBox(item);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.d / 2;
    if (fields.length != null) {
      const length = Number(fields.length);
      if (Number.isFinite(length)) item.w = Math.max(20, snapValue(length));
    }
    if (fields.width != null) {
      const width = Number(fields.width);
      if (Number.isFinite(width)) item.d = clampWallThick(width);
    }
    const next = G.itemBBox(item);
    item.x = cx - next.w / 2;
    item.y = cy - next.d / 2;
    const pos = snapItemXY(item, item.x, item.y);
    item.x = pos.x;
    item.y = pos.y;
    if ($("inner-wall-thick")) $("inner-wall-thick").value = String(Math.round(item.d));
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
    } else if (item.type === "platform") {
      $("plat-name").value = item.name;
      $("plat-w").value = Math.round(item.w);
      $("plat-d").value = Math.round(item.d);
      $("plat-h").value = Math.round(item.h);
    } else if (item.type === "gallery") {
      $("gal-name").value = item.name;
      $("gal-w").value = Math.round(item.w);
      $("gal-d").value = Math.round(item.d);
      $("gal-h").value = Math.round(item.h);
    } else if (item.type === "wall") {
      $("inner-wall-thick").value = Math.round(item.d);
      $("inner-wall-h").value = Math.round(item.h || 0);
    } else if (item.type === "path") {
      $("path-width").value = Math.round(item.d);
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
    if (drag && drag.kind === "path-side") {
      const item = state.items.find((i) => i.id === drag.id);
      if (item) return `${item.type === "wall" ? "Stärke" : "Breite"} ${G.fmtCm(item.d)}`;
    }
    if ((state.tool === "wall" || state.tool === "line" || state.tool === "path") && state.draftSegment && state.draftSegment.start) {
      const from = state.draftSegment.start;
      let target = state.cursorWorld;
      if (!target) return "";
      target = G.orthoFrom(from, target);
      return G.fmtCmM(G.dist(from, target));
    }
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
    if (evt.button === 0) hideMenu();
    if (evt.button === 1 || ((state.tool === "pan" || spacePan) && evt.button === 0)) {
      drag = { kind: "pan", x: evt.clientX, y: evt.clientY, camX: state.cam.x, camY: state.cam.y };
      canvas.setPointerCapture(evt.pointerId);
      return;
    }
    if (evt.button !== 0) return;
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
      if (pts.length >= 3 && G.dist(world, pts[0]) <= Math.max(state.outerGrid, 20)) {
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
    if (state.tool === "wall" || state.tool === "line" || state.tool === "path") {
      if (!state.draftSegment) {
        if (!requireHall()) return;
        const thick = state.tool === "wall"
          ? clampWallThick(num("inner-wall-thick", 20))
          : state.tool === "path"
            ? clampPathWidth(num("path-width", 250))
            : Math.max(state.grid, 8);
        state.draftSegment = {
          type: state.tool,
          start: world,
          thick,
        };
        refresh();
        return;
      }
      finishSegment(state.tool, state.draftSegment.start, world);
      return;
    }
    if (state.tool === "block" || state.tool === "pallet" || state.tool === "cantilever" || state.tool === "platform" || state.tool === "gallery") {
      placeItem(state.tool, world);
      return;
    }

    const hit = hitTest(worldFromEvent(evt));
    if (hit && (hit.kind === "path-end" || hit.kind === "path-side")) {
      state.selected = { kind: "item", id: hit.id };
    } else {
      state.selected = hit;
    }
    fillFormsFromSelection();
    if (hit && hit.kind === "item") {
      const item = selectedItem();
      drag = { kind: "item", id: item.id, dx: world.x - item.x, dy: world.y - item.y };
      pushHistory();
    } else if (hit && hit.kind === "path-end") {
      drag = { kind: "path-end", id: hit.id, end: hit.end };
      pushHistory();
    } else if (hit && hit.kind === "path-side") {
      drag = { kind: "path-side", id: hit.id, side: hit.side };
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
    if (!drag && state.snap && state.view === "plan") {
      if (state.tool === "draw") {
        state.cursorWorld = snapP(state.cursorWorld, "outer");
      } else if (state.tool === "wall" || state.tool === "line" || state.tool === "path") {
        state.cursorWorld = snapP(state.cursorWorld);
      }
    }
    if (drag && drag.kind === "pan") {
      state.cam.x = drag.camX - (evt.clientX - drag.x) / state.cam.zoom;
      state.cam.y = drag.camY - (evt.clientY - drag.y) / state.cam.zoom;
      refresh();
      return;
    }
    if (drag && drag.kind === "item") {
      const item = state.items.find((i) => i.id === drag.id);
      if (item) {
        const pos = snapItemXY(item, state.cursorWorld.x - drag.dx, state.cursorWorld.y - drag.dy);
        item.x = pos.x;
        item.y = pos.y;
      }
    } else if (drag && drag.kind === "path-end") {
      const item = state.items.find((i) => i.id === drag.id);
      if (item) setPathEnd(item, drag.end, state.cursorWorld);
    } else if (drag && drag.kind === "path-side") {
      const item = state.items.find((i) => i.id === drag.id);
      if (item) setPathWidthFromHandle(item, drag.side, state.cursorWorld);
    } else if (drag && drag.kind === "vertex") {
      let p = state.cursorWorld;
      if (state.shiftOrtho && state.outline.points.length > 1) {
        const prev = state.outline.points[(drag.index - 1 + state.outline.points.length) % state.outline.points.length];
        p = G.orthoFrom(prev, p);
      }
      state.outline.points[drag.index] = snapP(p, "outer");
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
    if (drag && (drag.kind === "item" || drag.kind === "vertex" || drag.kind === "opening" || drag.kind === "path-end" || drag.kind === "path-side")) persist();
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

  function syncContextMenu() {
    const menu = $("context-menu");
    const item = selectedItem();
    const canEdit = Boolean(item || selectedOpening() || (state.selected && (state.selected.kind === "edge" || state.selected.kind === "vertex")));
    const undoBtn = menu.querySelector('[data-action="undo"]');
    const rotateBtn = menu.querySelector('[data-action="rotate"]');
    const dupBtn = menu.querySelector('[data-action="dup"]');
    const deleteBtn = menu.querySelector('[data-action="delete"]');
    if (undoBtn) undoBtn.disabled = history.length === 0;
    if (rotateBtn) rotateBtn.disabled = !item;
    if (dupBtn) dupBtn.disabled = !item;
    if (deleteBtn) deleteBtn.disabled = !canEdit;
    syncContextPathFields(item);
  }

  function onContextMenu(evt) {
    evt.preventDefault();
    const world = worldFromEvent(evt);
    const hit = hitTest(world);
    if (hit && (hit.kind === "item" || hit.kind === "path-end" || hit.kind === "path-side")) {
      state.selected = { kind: "item", id: hit.id };
      fillFormsFromSelection();
    } else if (hit) {
      state.selected = hit;
      fillFormsFromSelection();
    }
    const menu = $("context-menu");
    menu.style.left = `${evt.clientX}px`;
    menu.style.top = `${evt.clientY}px`;
    syncContextMenu();
    menu.classList.remove("hidden");
    refresh();
    const path = selectedItem();
    if (path && path.type === "path") {
      const widthEl = $("ctx-path-width");
      if (widthEl) {
        window.requestAnimationFrame(() => {
          widthEl.focus();
          widthEl.select();
        });
      }
    }
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
      { id: "wall-1", type: "wall", name: "Innenmauer 1", x: 2290, y: 200, w: 1200, d: 20, h: 800, rot: 90 },
      { id: "line-1", type: "line", name: "Linie 1", x: 80, y: 1480, w: 1800, d: 10, h: 0, rot: 0 },
      { id: "path-1", type: "path", name: "Weg 1", x: 80, y: 1180, w: 1800, d: 250, h: 0, rot: 0 },
      { id: "gallery-1", type: "gallery", name: "Empore 1", x: 1400, y: 80, w: 800, d: 700, h: 350, rot: 0 },
      { id: "platform-1", type: "platform", name: "Podest 1", x: 3140, y: 1760, w: 400, d: 240, h: 80, rot: 0 },
      { id: "pallet-4", type: "pallet", name: "Palettenregal Empore", x: 1480, y: 160, w: 360, d: 110, h: 450, rot: 0, bays: 3, levels: 3, firstBeam: 20 },
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

    function openDialog(id) {
      closeDialogs();
      hideMenu();
      const dialog = $(id);
      if (!dialog) return;
      dialog.classList.remove("hidden");
      const btn = id === "dialog-guide" ? $("btn-guide") : $("btn-info");
      if (btn) btn.setAttribute("aria-expanded", "true");
    }

    function closeDialogs() {
      ["dialog-guide", "dialog-info"].forEach((id) => {
        const dialog = $(id);
        if (dialog) dialog.classList.add("hidden");
      });
      ["btn-guide", "btn-info"].forEach((id) => {
        const btn = $(id);
        if (btn) btn.setAttribute("aria-expanded", "false");
      });
    }

    function isDialogOpen() {
      return ["dialog-guide", "dialog-info"].some((id) => {
        const dialog = $(id);
        return dialog && !dialog.classList.contains("hidden");
      });
    }

    $("btn-guide").addEventListener("click", () => {
      if ($("dialog-guide").classList.contains("hidden")) openDialog("dialog-guide");
      else closeDialogs();
    });
    $("btn-info").addEventListener("click", () => {
      if ($("dialog-info").classList.contains("hidden")) openDialog("dialog-info");
      else closeDialogs();
    });
    document.querySelectorAll("[data-close-dialog]").forEach((el) => {
      el.addEventListener("click", closeDialogs);
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
    $("btn-place-wall").addEventListener("click", () => setTool("wall"));
    $("btn-place-line").addEventListener("click", () => setTool("line"));
    $("btn-place-path").addEventListener("click", () => setTool("path"));
    $("btn-place-platform").addEventListener("click", () => setTool("platform"));
    $("btn-place-gallery").addEventListener("click", () => setTool("gallery"));
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
    function printOptions() {
      const format = $("print-format").value || "A4";
      const tileA4 = $("print-tile-a4").checked && format !== "A4";
      return { format, tileA4 };
    }

    function syncPrintHint() {
      const format = $("print-format").value || "A4";
      const tile = $("print-tile-a4");
      tile.disabled = format === "A4";
      $("print-hint").textContent = window.LPPdf.printHint(format, tile.checked);
    }

    $("print-format").addEventListener("change", syncPrintHint);
    $("print-tile-a4").addEventListener("change", syncPrintHint);
    syncPrintHint();

    $("btn-pdf").addEventListener("click", () => {
      const { format, tileA4 } = printOptions();
      try {
        window.LPPdf.downloadPdf(state, format, tileA4);
      } catch (err) {
        console.error(err);
        window.alert("Das PDF konnte nicht erzeugt werden.");
      }
    });
    $("btn-print").addEventListener("click", () => {
      const { format, tileA4 } = printOptions();
      try {
        window.LPPdf.printPlan(state, format, tileA4);
      } catch (err) {
        console.error(err);
        window.alert("Drucken ist fehlgeschlagen.");
      }
    });
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

    syncGridControls();
    $("snap-grid").addEventListener("change", () => {
      state.snap = $("snap-grid").checked;
      persist();
    });
    $("show-grid").addEventListener("change", () => {
      state.showGrid = $("show-grid").checked;
      persist();
      refresh();
    });
    $("show-outer-grid").addEventListener("change", () => {
      state.showOuterGrid = $("show-outer-grid").checked;
      persist();
      refresh();
    });
    $("show-dimensions").addEventListener("change", () => {
      state.showDims = $("show-dimensions").checked;
      persist();
      refresh();
    });
    document.querySelectorAll("input[name=inner-unit]").forEach((el) => {
      el.addEventListener("change", () => {
        const unit = el.value === "m" ? "m" : "cm";
        const prefer = (unit === "m" && state.grid < 50) ? 100 : state.grid;
        fillStepSelect($("grid-in-step"), unit, prefer);
        readGridFromUi();
      });
    });
    document.querySelectorAll("input[name=outer-unit]").forEach((el) => {
      el.addEventListener("change", () => {
        const unit = el.value === "cm" ? "cm" : "m";
        const prefer = (unit === "cm" && state.outerGrid >= 200) ? 100 : state.outerGrid;
        fillStepSelect($("grid-out-step"), unit, prefer);
        readGridFromUi();
      });
    });
    $("grid-in-step").addEventListener("change", readGridFromUi);
    $("grid-out-step").addEventListener("change", readGridFromUi);
    ["hall-height", "wall-thick"].forEach((id) => {
      $(id).addEventListener("change", applyHallFields);
    });
    ["block-name", "block-w", "block-d", "block-h", "pallet-name", "pallet-w", "pallet-d", "pallet-h", "pallet-bays", "pallet-levels", "pallet-first", "cant-name", "cant-w", "cant-arm", "cant-h", "cant-levels", "cant-cols", "cant-sided", "plat-name", "plat-w", "plat-d", "plat-h", "gal-name", "gal-w", "gal-d", "gal-h", "inner-wall-thick", "inner-wall-h", "path-width"].forEach((id) => {
      $(id).addEventListener("change", applySelectedFromForms);
    });
    ["open-w", "open-h", "open-sill"].forEach((id) => {
      $(id).addEventListener("change", applyOpeningFromForms);
    });

    $("context-menu").addEventListener("pointerdown", (evt) => evt.stopPropagation());
    $("context-menu").addEventListener("click", (evt) => {
      evt.stopPropagation();
      const action = evt.target.closest("[data-action]");
      if (!action || action.disabled) return;
      if (action.dataset.action === "undo") undo();
      if (action.dataset.action === "rotate") $("btn-rotate").click();
      if (action.dataset.action === "dup") duplicateSelected();
      if (action.dataset.action === "delete") deleteSelected();
      hideMenu();
    });
    ["ctx-path-name", "ctx-path-len", "ctx-path-width"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("change", applyPathFromContext);
      el.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter") {
          evt.preventDefault();
          applyPathFromContext();
        }
      });
    });
    const ctxWidth = $("ctx-path-width");
    if (ctxWidth) {
      ctxWidth.addEventListener("input", () => {
        const item = selectedItem();
        if (!item || item.type !== "path") return;
        const v = Number(ctxWidth.value);
        if (!Number.isFinite(v) || v < 40 || v > 2000) return;
        applyPathEdit(item, { width: v }, { skipHistory: true });
      });
    }

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
        if (isDialogOpen()) {
          closeDialogs();
          return;
        }
        if (state.draftSegment) {
          state.draftSegment = null;
        } else if (state.tool === "draw" && state.outline.points.length && !state.outline.closed) {
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

  try {
    bindPresets();
    bindUi();
  } catch (err) {
    console.error(err);
  }
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
      try {
        if (restore()) {
          fitView();
          updateHint();
          return;
        }
      } catch (err) {
        console.error(err);
      }
      loadExample();
      history.length = 0;
      $("btn-undo").disabled = true;
      updateHint();
    });
  });
})();
