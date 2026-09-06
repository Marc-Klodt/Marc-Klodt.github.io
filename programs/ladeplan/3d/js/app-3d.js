(() => {

  'use strict';



  const GRID_M = 0.1;

  const DRAG_THRESHOLD_PX = 5;

  const STORAGE_KEY = 'ladeplan-3d-state';

  const MAX_UNDO = 50;



  let items = [];

  let colorIndex = 0;

  let selectedId = null;

  let contextMenuItemId = null;

  let beladungDialogItemId = null;

  let dragState = null;

  let undoStack = [];

  let dragUndoSnapshot = null;

  let cornerOrbitActive = false;

  let hoveredCornerIndex = null;

  let cornerHandleMeshes = [];

  let planGroup = null;

  let xyzModeActive = false;

  let positionModeActive = false;

  let planPan = { x: 0, y: 0, z: 0 };

  let positionDragState = null;



  let scene;

  let camera;

  let renderer;

  let controls;

  let bedGroup;

  let cargoGroup;

  let floorGridGroup;

  let raycaster;

  let pointerNdc;



  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const dragHit = new THREE.Vector3();



  const canvas = document.getElementById('ladeplan-3d-canvas');

  const truckSelect = document.getElementById('truck-select');

  const customFields = document.getElementById('custom-truck-fields');

  const customLength = document.getElementById('custom-length');

  const customWidth = document.getElementById('custom-width');

  const customHeight = document.getElementById('custom-height');

  const customMaxWeight = document.getElementById('custom-max-weight');

  const cargoPresets = document.getElementById('cargo-presets');

  const volumeInfo = document.getElementById('volume-info');

  const weightInfo = document.getElementById('weight-info');

  const heightInfo = document.getElementById('height-info');

  const collisionInfo = document.getElementById('collision-info');

  const truckHeightInfo = document.getElementById('truck-height-info');

  const autoResult = document.getElementById('auto-result');

  const scaleInfo = document.getElementById('scale-info');

  const bedInfo = document.getElementById('bed-info');

  const maxHeightInfo = document.getElementById('max-height-info');

  const headerTruckInfo = document.getElementById('header-truck-info');

  const weightBarChart = document.getElementById('weight-bar-chart');

  const volumeBarChart = document.getElementById('volume-bar-chart');

  const heightBarChart = document.getElementById('height-bar-chart');

  const cargoDetailContent = document.getElementById('cargo-detail-content');

  const contextMenu = document.getElementById('cargo-context-menu');

  const contextMenuWeightRow = document.getElementById('context-menu-weight-row');

  const contextMenuWeightInput = document.getElementById('context-menu-weight');

  const contextMenuHeightRow = document.getElementById('context-menu-height-row');

  const contextMenuHeightInput = document.getElementById('context-menu-height');



  function uid() {

    return `c3d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  }



  function itemLabel(item, index) {

    return item.label || `Ladegut ${index + 1}`;

  }



  function normalizeBeladung(value) {

    if (!value) return [];

    if (Array.isArray(value)) return value.map((e) => String(e).trim()).filter(Boolean);

    return String(value).split('\n').map((e) => e.trim()).filter(Boolean);

  }



  function getItemBeladung(item) {

    return normalizeBeladung(item?.beladung);

  }



  function formatBeladungText(item) {

    const lines = getItemBeladung(item);

    return lines.length ? lines.join('\n') : '';

  }



  function formatBeladungSummary(item, maxLen = 48) {

    const lines = getItemBeladung(item);

    if (!lines.length) return 'Noch keine Beladung';

    if (lines.length === 1) {

      return lines[0].length <= maxLen ? lines[0] : `${lines[0].slice(0, maxLen - 1)}…`;

    }

    return `${lines[0]} … (+${lines.length - 1})`;

  }



  function snap(value) {

    if (!document.getElementById('snap-grid')?.checked) return Math.round(value * 1000) / 1000;

    return Math.round(value / GRID_M) * GRID_M;

  }



  function getTruck() {

    const id = truckSelect.value;

    if (!id) return null;

    if (id === 'custom') {

      return {

        id: 'custom',

        name: 'Benutzerdefiniert',

        length: parseFloat(customLength.value) || 6,

        width: parseFloat(customWidth.value) || 2.45,

        interiorHeight: parseFloat(customHeight.value) || 2.45,

        maxWeight: parseFloat(customMaxWeight.value) || 3000,

        category: 'Individuell',

      };

    }

    return TRUCK_TYPES.find((t) => t.id === id) || TRUCK_TYPES[0];

  }



  function getTruckHeight(truck) {

    return getTruckInteriorHeight(truck);

  }



  function getMaxStackHeight() {

    if (!items.length) return 0;

    return Math.max(...items.map((i) => i.z + i.height));

  }



  function nextColor(presetColor) {

    if (presetColor) return presetColor;

    const palette = typeof CARGO_COLORS !== 'undefined' ? CARGO_COLORS : ['#3b82f6'];

    const color = palette[colorIndex % palette.length];

    colorIndex += 1;

    return color;

  }



  function hexToThree(color) {

    return new THREE.Color(color);

  }



  function findItemById(id) {

    return items.find((item) => item.id === id) || null;

  }



  function getCollidingIds() {

    const colliding = new Set();

    for (let i = 0; i < items.length; i += 1) {

      for (let j = i + 1; j < items.length; j += 1) {

        if (LadeplanPacker3D.boxesOverlap(items[i], items[j])) {

          colliding.add(items[i].id);

          colliding.add(items[j].id);

        }

      }

    }

    return colliding;

  }



  const EPS = 1e-6;



  function overlapsXY(a, b) {

    return (

      a.x < b.x + b.length - EPS &&

      a.x + a.length > b.x + EPS &&

      a.y < b.y + b.width - EPS &&

      a.y + a.width > b.y + EPS

    );

  }



  function createNotStackableMark(item) {

    const hl = item.length / 2;

    const hw = item.width / 2;

    const hh = item.height / 2;

    const insetL = Math.max(hl * 0.22, 0.03);

    const insetW = Math.max(hw * 0.22, 0.03);

    const insetH = Math.max(hh * 0.22, 0.03);

    const eps = 0.01;

    const pts = [];



    const addFaceX = (a, b, c, d) => {

      pts.push(new THREE.Vector3(...a), new THREE.Vector3(...b));

      pts.push(new THREE.Vector3(...c), new THREE.Vector3(...d));

    };



    addFaceX(

      [-hl + insetL, hh + eps, -hw + insetW],

      [hl - insetL, hh + eps, hw - insetW],

      [hl - insetL, hh + eps, -hw + insetW],

      [-hl + insetL, hh + eps, hw - insetW],

    );

    addFaceX(

      [-hl + insetL, -hh + insetH, hw + eps],

      [hl - insetL, hh - insetH, hw + eps],

      [hl - insetL, -hh + insetH, hw + eps],

      [-hl + insetL, hh - insetH, hw + eps],

    );

    addFaceX(

      [-hl + insetL, -hh + insetH, -hw - eps],

      [hl - insetL, hh - insetH, -hw - eps],

      [hl - insetL, -hh + insetH, -hw - eps],

      [-hl + insetL, hh - insetH, -hw - eps],

    );

    addFaceX(

      [hl + eps, -hh + insetH, -hw + insetW],

      [hl + eps, hh - insetH, hw - insetW],

      [hl + eps, -hh + insetH, hw - insetW],

      [hl + eps, hh - insetH, -hw + insetW],

    );

    addFaceX(

      [-hl - eps, -hh + insetH, -hw + insetW],

      [-hl - eps, hh - insetH, hw - insetW],

      [-hl - eps, -hh + insetH, hw - insetW],

      [-hl - eps, hh - insetH, -hw + insetW],

    );



    const mark = new THREE.LineSegments(

      new THREE.BufferGeometry().setFromPoints(pts),

      new THREE.LineBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.95, depthTest: true }),

    );

    mark.userData = { itemId: item.id, role: 'not-stackable-mark' };

    mark.renderOrder = 2;

    return mark;

  }



  function resolveItemStackZ(item) {

    let supportZ = 0;

    items.forEach((other) => {

      if (other.id === item.id) return;

      if (other.notStackable) return;

      if (!overlapsXY(item, other)) return;

      const top = other.z + other.height;

      if (top > supportZ) supportZ = top;

    });

    return snap(supportZ);

  }



  function resolveItemStackZAll(item) {

    let supportZ = 0;

    items.forEach((other) => {

      if (other.id === item.id) return;

      if (!overlapsXY(item, other)) return;

      const top = other.z + other.height;

      if (top > supportZ) supportZ = top;

    });

    return snap(supportZ);

  }



  function getNotStackableStackAttempt(item) {

    if (!item) return null;

    const allowedZ = resolveItemStackZ(item);

    const naturalZ = resolveItemStackZAll(item);

    if (naturalZ <= allowedZ + EPS) return null;

    let blockedBy = null;

    let blockedTop = -1;

    items.forEach((other) => {

      if (other.id === item.id || !other.notStackable) return;

      if (!overlapsXY(item, other)) return;

      const top = snap(other.z + other.height);

      if (top >= blockedTop && naturalZ >= top - EPS) {

        blockedTop = top;

        blockedBy = other;

      }

    });

    return blockedBy;

  }



  function findActiveNotStackableStackAttempt() {

    const item = dragState

      ? findItemById(dragState.id)

      : (selectedId ? findItemById(selectedId) : null);

    if (!item) return null;

    const blockedBy = getNotStackableStackAttempt(item);

    return blockedBy ? { item, blockedBy } : null;

  }



  function reresolveStackingAfterSupportChange(changedItem) {

    items.forEach((other) => {

      if (other.id === changedItem.id) return;

      if (!overlapsXY(other, changedItem)) return;

      finalizeItemPlacement(other, { resolveStack: true });

    });

  }



  function toggleItemNotStackable(itemId) {

    const item = findItemById(itemId);

    if (!item) return;

    pushUndo();

    item.notStackable = !item.notStackable;

    reresolveStackingAfterSupportChange(item);

    finalizeItemPlacement(item, { resolveStack: true });

    selectedId = item.id;

    updateUI();

  }



  function clampItem(item) {

    const truck = getTruck();

    if (!truck) return;

    const h = getTruckHeight(truck);

    item.x = Math.max(0, Math.min(item.x, truck.length - item.length));

    item.y = Math.max(0, Math.min(item.y, truck.width - item.width));

    item.z = Math.max(0, Math.min(item.z, h - item.height));

  }



  function finalizeItemPlacement(item, { resolveStack = false } = {}) {

    clampItem(item);

    if (resolveStack) {

      const truck = getTruck();

      if (truck) {

        const maxZ = getTruckHeight(truck) - item.height;

        item.z = Math.max(0, Math.min(resolveItemStackZ(item), maxZ));

      }

    }

    clampItem(item);

  }



  function clampAllItems() {

    items.forEach(clampItem);

  }



  function renderBarRow(label, used, total, unit) {

    const pct = total > 0 ? (used / total) * 100 : 0;

    const displayPct = pct.toFixed(1);

    const barWidth = Math.min(100, pct);

    const over = pct >= 101;

    let title;

    if (unit === 'kg') title = `${used.toLocaleString('de-DE')} / ${total.toLocaleString('de-DE')} kg`;

    else if (unit === 'm³') title = `${used.toFixed(2)} / ${total.toFixed(2)} m³`;

    else title = `${used.toFixed(2)} / ${total.toFixed(2)} m`;

    return `

      <div class="usage-bar-row">

        <span class="usage-bar-label">${label}</span>

        <div class="usage-bar-track" title="${title}">

          <div class="usage-bar-fill${over ? ' usage-bar-fill-over' : ''}" style="width: ${barWidth}%"></div>

        </div>

        <span class="usage-bar-value${over ? ' usage-bar-value-over' : ''}">${displayPct}%</span>

      </div>`;

  }



  function updateBarCharts(truck) {

    if (!truck) {

      if (weightBarChart) weightBarChart.innerHTML = '';

      if (volumeBarChart) volumeBarChart.innerHTML = '';

      if (heightBarChart) heightBarChart.innerHTML = '';

      return;

    }

    const bedH = getTruckHeight(truck);

    const totalVol = truck.length * truck.width * bedH;

    const usedVol = items.reduce((s, i) => s + i.length * i.width * i.height, 0);

    const totalW = items.reduce((s, i) => s + (i.weight ?? 0), 0);

    const maxStack = getMaxStackHeight();



    if (weightBarChart) {

      weightBarChart.innerHTML = renderBarRow('Gesamt · kg', totalW, truck.maxWeight, 'kg');

    }

    if (volumeBarChart) {

      volumeBarChart.innerHTML = renderBarRow('Raum · m³', usedVol, totalVol, 'm³');

    }

    if (heightBarChart) {

      heightBarChart.innerHTML = renderBarRow('Stapel · m', maxStack, bedH, 'm');

    }

  }



  function getPresetHeightFromInput(preset) {

    const input = cargoPresets?.querySelector(`.preset-height-input[data-preset-id="${preset.id}"]`);

    const cm = parseFloat(input?.value);

    if (Number.isFinite(cm) && cm > 0) return cm / 100;

    return preset.height || 1.0;

  }



  function updateUI() {

    updateStats();

    updateHeaderTruck();

    updateCargoDetail();

    VehiclePhotoPanel.update(getTruck());

    drawScene();

    scheduleSave();

  }



  function getPresetHeight(preset) {

    return getPresetHeightFromInput(preset);

  }



  function updateCargoDetail() {

    if (!cargoDetailContent) return;

    const item = selectedId ? findItemById(selectedId) : null;

    const btnBeladen = document.getElementById('btn-cargo-beladen');

    const btnRotate = document.getElementById('btn-rotate');

    const btnDelete = document.getElementById('btn-delete');

    [btnBeladen, btnRotate, btnDelete].forEach((btn) => { if (btn) btn.disabled = !item; });



    if (!item) {

      cargoDetailContent.innerHTML = `

        <div class="cargo-detail-card cargo-detail-card-empty">

          <div class="cargo-detail-name cargo-detail-empty">Kein Ladegut ausgewählt</div>

          <p class="cargo-detail-hint">Ladegut in der 3D-Ansicht anklicken.</p>

        </div>`;

      return;

    }



    const idx = items.indexOf(item);

    const colliding = getCollidingIds().has(item.id);

    const truck = getTruck();

    const bedH = truck ? getTruckHeight(truck) : 0;

    const overH = item.z + item.height > bedH + 1e-6;

    cargoDetailContent.innerHTML = `

      <div class="cargo-detail-card">

        <div class="cargo-detail-name">${itemLabel(item, idx)}</div>

        <dl class="cargo-detail-list">

          <dt>Maße (L×B×H)</dt>

          <dd>${(item.length * 100).toFixed(0)} × ${(item.width * 100).toFixed(0)} × ${(item.height * 100).toFixed(0)} cm</dd>

          <dt>Volumen</dt>

          <dd>${(item.length * item.width * item.height).toFixed(2)} m³</dd>

          <dt>Position</dt>

          <dd>x ${item.x.toFixed(2)} · y ${item.y.toFixed(2)} · z ${item.z.toFixed(2)} m</dd>

          <dt>Gewicht</dt>

          <dd>${item.weight != null ? `${item.weight.toLocaleString('de-DE')} kg` : '— nicht gesetzt —'}</dd>

          <dt>Status</dt>

          <dd>${colliding ? '⚠ Überlappung' : overH ? '⚠ über Innenhöhe' : item.notStackable ? 'Nicht stapelbar' : 'OK'}</dd>

          <dt>Beladung</dt>

          <dd>${formatBeladungSummary(item)}</dd>

        </dl>

      </div>`;

  }



  function applyItemWeight(itemId, rawValue) {

    const item = findItemById(itemId);

    if (!item) return;

    pushUndo();

    const value = rawValue === '' || rawValue == null ? null : parseFloat(rawValue);

    item.weight = Number.isFinite(value) ? value : null;

    updateUI();

  }



  function applyItemHeightCm(itemId, cm) {

    const item = findItemById(itemId);

    if (!item) return;

    const height = (parseFloat(cm) || 0) / 100;

    if (height <= 0) return;

    pushUndo();

    item.height = height;

    clampItem(item);

    updateUI();

  }



  function rotateItemById(itemId) {

    const item = findItemById(itemId);

    if (!item) return;

    pushUndo();

    item.rotation = ((item.rotation || 0) + 90) % 360;

    const prevL = item.length;

    item.length = item.width;

    item.width = prevL;

    finalizeItemPlacement(item, { resolveStack: true });

    selectedId = item.id;

    updateUI();

  }



  function duplicateItem(itemId) {

    const item = findItemById(itemId);

    if (!item) return;

    pushUndo();

    const copy = {

      ...item,

      id: uid(),

      x: snap(Math.min(item.x + 0.1, (getTruck()?.length || 10) - item.length)),

      y: snap(item.y),

      z: snap(item.z),

      beladung: [...getItemBeladung(item)],

    };

    items.push(copy);

    selectedId = copy.id;

    updateUI();

  }



  function deleteItem(itemId) {

    pushUndo();

    items = items.filter((i) => i.id !== itemId);

    if (selectedId === itemId) selectedId = null;

    updateUI();

  }



  function hideContextMenu() {

    if (contextMenu) contextMenu.classList.add('hidden');

    contextMenuItemId = null;

  }



  function showContextMenu(clientX, clientY, itemId) {

    if (!contextMenu) return;

    contextMenuItemId = itemId;

    if (itemId) selectedId = itemId;

    contextMenu.classList.remove('hidden');

    if (contextMenuWeightRow) contextMenuWeightRow.classList.toggle('hidden', !itemId);

    if (contextMenuHeightRow) contextMenuHeightRow.classList.toggle('hidden', !itemId);

    if (itemId) {

      const item = findItemById(itemId);

      if (contextMenuWeightInput) contextMenuWeightInput.value = item?.weight ?? '';

      if (contextMenuHeightInput) contextMenuHeightInput.value = item ? (item.height * 100).toFixed(0) : '';

    }

    const menuW = contextMenu.offsetWidth || 180;

    const menuH = contextMenu.offsetHeight || 160;

    contextMenu.style.left = `${Math.min(clientX, window.innerWidth - menuW - 8)}px`;

    contextMenu.style.top = `${Math.min(clientY, window.innerHeight - menuH - 8)}px`;

    contextMenu.querySelectorAll('[data-action="copy"], [data-action="delete"], [data-action="rotate"], [data-action="beladen"], [data-action="not-stackable"]').forEach((btn) => {

      btn.disabled = !itemId;

    });

    const notStackableBtn = contextMenu.querySelector('[data-action="not-stackable"]');

    if (notStackableBtn && itemId) {

      const item = findItemById(itemId);

      notStackableBtn.textContent = item?.notStackable ? 'Stapelbar machen' : 'Nicht stapelbar';

    }

    updateUndoControls();

    updateCargoDetail();

  }



  function activateContextMenuAction(action) {

    if (action === 'undo') {

      undoLastStep();

      hideContextMenu();

      return;

    }

    const id = contextMenuItemId || selectedId;

    if (!id) return;

    hideContextMenu();

    if (action === 'rotate') rotateItemById(id);

    else if (action === 'not-stackable') toggleItemNotStackable(id);

    else if (action === 'beladen') openBeladungDialog(id);

    else if (action === 'copy') duplicateItem(id);

    else if (action === 'delete') deleteItem(id);

  }



  function openBeladungDialog(itemId) {

    const item = findItemById(itemId);

    const dialog = document.getElementById('beladung-dialog');

    const nameEl = document.getElementById('beladung-dialog-item-name');

    const input = document.getElementById('beladung-dialog-input');

    if (!item || !dialog || !input) return;

    beladungDialogItemId = itemId;

    selectedId = itemId;

    if (nameEl) {

      nameEl.textContent = `${itemLabel(item, items.indexOf(item))} · ${(item.length * 100).toFixed(0)}×${(item.width * 100).toFixed(0)}×${(item.height * 100).toFixed(0)} cm`;

    }

    input.value = formatBeladungText(item);

    dialog.classList.remove('hidden');

    input.focus();

  }



  function closeBeladungDialog() {

    const dialog = document.getElementById('beladung-dialog');

    if (dialog) dialog.classList.add('hidden');

    beladungDialogItemId = null;

  }



  function saveBeladungDialog() {

    if (!beladungDialogItemId) return;

    const item = findItemById(beladungDialogItemId);

    const input = document.getElementById('beladung-dialog-input');

    if (!item || !input) return;

    const nextBeladung = normalizeBeladung(input.value);

    const currentBeladung = getItemBeladung(item);

    if (JSON.stringify(nextBeladung) === JSON.stringify(currentBeladung)) {

      closeBeladungDialog();

      return;

    }

    pushUndo();

    item.beladung = nextBeladung;

    closeBeladungDialog();

    updateUI();

  }



  function buildFloorGrid(L, W) {

    const group = new THREE.Group();

    const material = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.55 });

    const majorMat = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.75 });

    const points = [];

    for (let x = 0; x <= L + 1e-6; x += GRID_M) {

      const isMajor = Math.abs(x - Math.round(x)) < 1e-6;

      const mat = isMajor ? majorMat : material;

      const geo = new THREE.BufferGeometry().setFromPoints([

        new THREE.Vector3(x, 0.002, 0),

        new THREE.Vector3(x, 0.002, W),

      ]);

      group.add(new THREE.Line(geo, mat));

    }

    for (let z = 0; z <= W + 1e-6; z += GRID_M) {

      const isMajor = Math.abs(z - Math.round(z)) < 1e-6;

      const mat = isMajor ? majorMat : material;

      const geo = new THREE.BufferGeometry().setFromPoints([

        new THREE.Vector3(0, 0.002, z),

        new THREE.Vector3(L, 0.002, z),

      ]);

      group.add(new THREE.Line(geo, mat));

    }

    return group;

  }



  function buildCornerHandles(L, W, bedH) {

    const group = new THREE.Group();

    const corners = [

      { x: 0, z: 0, dx: 1, dz: 1 },

      { x: L, z: 0, dx: -1, dz: 1 },

      { x: 0, z: W, dx: 1, dz: -1 },

      { x: L, z: W, dx: -1, dz: -1 },

    ];

    const size = Math.min(0.14, L * 0.035, W * 0.035);

    const arm = Math.min(0.4, L * 0.1, W * 0.1);

    cornerHandleMeshes = [];

    const addCornerSet = (yBase, indexOffset, isTop) => {

      corners.forEach((c, i) => {

        const index = indexOffset + i;

        const markerMat = new THREE.MeshStandardMaterial({

          color: isTop ? 0x60a5fa : 0x38bdf8,

          emissive: isTop ? 0x38bdf8 : 0x0ea5e9,

          emissiveIntensity: 0.35,

          transparent: true,

          opacity: 0.92,

        });

        const sphereY = isTop ? yBase - size * 1.8 : yBase + size * 1.8;

        const sphere = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 14), markerMat);

        sphere.position.set(c.x, sphereY, c.z);

        sphere.userData = { role: 'corner-handle', cornerIndex: index };

        cornerHandleMeshes.push(sphere);

        group.add(sphere);

        const ring = new THREE.Mesh(

          new THREE.TorusGeometry(size * 1.35, size * 0.18, 8, 20),

          new THREE.MeshBasicMaterial({

            color: isTop ? 0x93c5fd : 0x7dd3fc,

            transparent: true,

            opacity: 0.75,

          }),

        );

        ring.rotation.x = Math.PI / 2;

        ring.position.set(c.x, isTop ? yBase - 0.015 : yBase + 0.015, c.z);

        ring.userData = { role: 'corner-handle', cornerIndex: index };

        group.add(ring);

        const lineMat = new THREE.LineBasicMaterial({

          color: isTop ? 0x60a5fa : 0x38bdf8,

          transparent: true,

          opacity: 0.9,

        });

        const ax = c.x + c.dx * arm;

        const az = c.z + c.dz * arm;

        const bracketY = isTop ? yBase - 0.012 : yBase + 0.012;

        const bracket = new THREE.Line(

          new THREE.BufferGeometry().setFromPoints([

            new THREE.Vector3(c.x, bracketY, c.z),

            new THREE.Vector3(ax, bracketY, c.z),

            new THREE.Vector3(c.x, bracketY, c.z),

            new THREE.Vector3(c.x, bracketY, az),

          ]),

          lineMat,

        );

        bracket.userData = { role: 'corner-handle', cornerIndex: index };

        group.add(bracket);

      });

    };

    addCornerSet(0, 0, false);

    addCornerSet(bedH, 4, true);

    return group;

  }



  function getCornerIndexFromObject(obj) {

    while (obj) {

      if (obj.userData?.cornerIndex != null) return obj.userData.cornerIndex;

      obj = obj.parent;

    }

    return null;

  }



  function setCornerHighlight(index) {

    cornerHandleMeshes.forEach((mesh) => {

      if (!mesh.material?.emissive) return;

      const active = index != null && mesh.userData.cornerIndex === index;

      mesh.material.emissiveIntensity = active ? 0.9 : 0.35;

      mesh.material.opacity = active ? 1 : 0.92;

    });

    hoveredCornerIndex = index;

  }



  function createStirnWallFaceMaterial() {

    const canvas = document.createElement('canvas');

    canvas.width = 512;

    canvas.height = 512;

    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#22c55e';

    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#000000';

    ctx.font = 'bold 48px Segoe UI, sans-serif';

    ctx.textAlign = 'center';

    ctx.textBaseline = 'middle';

    ctx.fillText('Stirnwand', canvas.width / 2, canvas.height / 2);

    const map = new THREE.CanvasTexture(canvas);

    map.needsUpdate = true;

    return new THREE.MeshBasicMaterial({ map, side: THREE.FrontSide });

  }



  function addStirnWall(bedGroup, W, bedH) {

    const innerFace = new THREE.Mesh(

      new THREE.PlaneGeometry(W, bedH),

      createStirnWallFaceMaterial(),

    );

    innerFace.position.set(0, bedH / 2, W / 2);

    innerFace.rotation.y = Math.PI / 2;

    bedGroup.add(innerFace);

    const outerFace = new THREE.Mesh(

      new THREE.PlaneGeometry(W, bedH),

      createStirnWallFaceMaterial(),

    );

    outerFace.position.set(0, bedH / 2, W / 2);

    outerFace.rotation.y = -Math.PI / 2;

    bedGroup.add(outerFace);

  }



  function disableCornerOrbit() {

    cornerOrbitActive = false;

    if (controls) {

      controls.mouseButtons.LEFT = null;

    }

  }



  function enableCornerOrbit() {

    cornerOrbitActive = true;

    if (controls) {

      controls.enabled = true;

      controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;

    }

  }



  function updateModeButtons() {

    const btnXyz = document.getElementById('btn-mode-xyz');

    const btnPos = document.getElementById('btn-mode-position');

    if (btnXyz) {

      btnXyz.textContent = xyzModeActive ? 'X Y Z aus' : 'X Y Z ein';

      btnXyz.classList.toggle('is-active', xyzModeActive);

      btnXyz.classList.toggle('is-sibling-active', !xyzModeActive && positionModeActive);

      btnXyz.setAttribute('aria-pressed', xyzModeActive ? 'true' : 'false');

    }

    if (btnPos) {

      btnPos.textContent = positionModeActive ? 'Position aus' : 'Position ein';

      btnPos.classList.toggle('is-active', positionModeActive);

      btnPos.classList.toggle('is-sibling-active', !positionModeActive && xyzModeActive);

      btnPos.setAttribute('aria-pressed', positionModeActive ? 'true' : 'false');

    }

  }



  function toggleXyzMode() {

    xyzModeActive = !xyzModeActive;

    if (xyzModeActive) {

      positionModeActive = false;

    }

    disableCornerOrbit();

    setCornerHighlight(null);

    updateModeButtons();

    drawScene();

    updateCanvasCursorForMode();

  }



  function togglePositionMode() {

    positionModeActive = !positionModeActive;

    if (positionModeActive) {

      xyzModeActive = false;

      disableCornerOrbit();

      setCornerHighlight(null);

    }

    updateModeButtons();

    drawScene();

    updateCanvasCursorForMode();

  }



  function updateCanvasCursorForMode() {

    if (positionModeActive) setCanvasCursor('move');

    else if (xyzModeActive) setCanvasCursor('default');

    else setCanvasCursor(items.length ? 'grab' : 'default');

  }



  function panPlanByScreenDelta(dx, dy) {

    if (!camera || !controls || !planGroup) return;

    const offset = new THREE.Vector3().copy(camera.position).sub(controls.target);

    const dist = offset.length();

    const panLeft = new THREE.Vector3().crossVectors(camera.up, offset).normalize();

    const factor = dist * 0.0012;

    planPan.x += (panLeft.x * dx - camera.up.x * dy) * factor;

    planPan.y += (panLeft.y * dx - camera.up.y * dy) * factor;

    planPan.z += (panLeft.z * dx - camera.up.z * dy) * factor;

    planGroup.position.set(planPan.x, planPan.y, planPan.z);

  }



  function bindPositionDocumentListeners() {

    if (bindPositionDocumentListeners.bound) return;

    bindPositionDocumentListeners.bound = true;

    document.addEventListener('pointermove', onPositionPointerMove);

    document.addEventListener('pointerup', onPositionPointerUp);

    document.addEventListener('pointercancel', onPositionPointerUp);

  }



  function unbindPositionDocumentListeners() {

    if (!bindPositionDocumentListeners.bound) return;

    bindPositionDocumentListeners.bound = false;

    document.removeEventListener('pointermove', onPositionPointerMove);

    document.removeEventListener('pointerup', onPositionPointerUp);

    document.removeEventListener('pointercancel', onPositionPointerUp);

  }



  function onPositionPointerMove(event) {

    if (!positionDragState) return;

    event.preventDefault();

    panPlanByScreenDelta(

      event.clientX - positionDragState.lastClientX,

      event.clientY - positionDragState.lastClientY,

    );

    positionDragState.lastClientX = event.clientX;

    positionDragState.lastClientY = event.clientY;

  }



  function finishPositionDrag(event) {

    if (!positionDragState) return;

    positionDragState = null;

    if (controls) controls.enabled = true;

    unbindPositionDocumentListeners();

    updateCanvasCursorForMode();

    if (canvas && event?.pointerId != null) {

      try { canvas.releasePointerCapture(event.pointerId); } catch { /* ignore */ }

    }

  }



  function onPositionPointerUp(event) {

    finishPositionDrag(event);

  }



  function initThree() {

    if (!canvas || typeof THREE === 'undefined') return;



    scene = new THREE.Scene();

    scene.background = new THREE.Color(0x0a0f18);



    const host = canvas.parentElement;

    const w = host.clientWidth || 800;

    const h = host.clientHeight || 500;



    camera = new THREE.PerspectiveCamera(48, w / h, 0.05, 500);

    camera.position.set(8, 6, 8);



    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    renderer.setSize(w, h, false);



    controls = new THREE.OrbitControls(camera, canvas);

    controls.enableDamping = true;

    controls.target.set(3, 1.2, 1.2);

    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null };



    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const dir = new THREE.DirectionalLight(0xffffff, 0.85);

    dir.position.set(5, 10, 4);

    scene.add(dir);

    const fill = new THREE.DirectionalLight(0x93c5fd, 0.35);

    fill.position.set(-4, 2, -3);

    scene.add(fill);



    bedGroup = new THREE.Group();

    cargoGroup = new THREE.Group();

    planGroup = new THREE.Group();

    planGroup.add(bedGroup);

    planGroup.add(cargoGroup);

    planGroup.position.set(planPan.x, planPan.y, planPan.z);

    scene.add(planGroup);



    raycaster = new THREE.Raycaster();

    pointerNdc = new THREE.Vector2();



    window.addEventListener('resize', onResize);

    initDragHandlers();

    initContextMenuHandlers();

    document.getElementById('btn-mode-xyz')?.addEventListener('click', toggleXyzMode);

    document.getElementById('btn-mode-position')?.addEventListener('click', togglePositionMode);

    updateModeButtons();

    animate();

  }



  function onResize() {

    if (!renderer || !camera || !canvas) return;

    const host = canvas.parentElement;

    const w = host.clientWidth || 800;

    const h = host.clientHeight || 500;

    camera.aspect = w / h;

    camera.updateProjectionMatrix();

    renderer.setSize(w, h, false);

    VehiclePhotoPanel.resize();

  }



  function animate() {

    requestAnimationFrame(animate);

    if (controls) controls.update();

    if (renderer && scene && camera) renderer.render(scene, camera);

  }



  function disposeThreeObject(object) {

    object.traverse((node) => {

      if (node.geometry) node.geometry.dispose();

      if (node.material) {

        if (Array.isArray(node.material)) node.material.forEach((m) => {

          if (m.map) m.map.dispose();

          m.dispose();

        });

        else {

          if (node.material.map) node.material.map.dispose();

          node.material.dispose();

        }

      }

    });

  }



  function clearGroup(group) {

    while (group.children.length) {

      const child = group.children[0];

      disposeThreeObject(child);

      group.remove(child);

    }

  }



  function drawScene() {

    if (!bedGroup || !cargoGroup) return;

    const truck = getTruck();

    clearGroup(bedGroup);

    clearGroup(cargoGroup);

    floorGridGroup = null;



    if (!truck) {

      bedInfo.textContent = 'Laderaum: —';

      scaleInfo.textContent = 'Bitte Fahrzeug wählen';

      if (maxHeightInfo) maxHeightInfo.textContent = 'Max. Ladehöhe: —';

      cornerHandleMeshes = [];

      return;

    }



    const bedH = getTruckHeight(truck);

    const L = truck.length;

    const W = truck.width;



    bedInfo.textContent = `Laderaum: ${L.toFixed(2)} × ${W.toFixed(2)} × ${bedH.toFixed(2)} m`;

    scaleInfo.textContent = truck.name;

    if (maxHeightInfo) maxHeightInfo.textContent = `Max. Ladehöhe: ${bedH.toFixed(2)} m`;



    const floor = new THREE.Mesh(

      new THREE.PlaneGeometry(L, W),

      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9, metalness: 0.05 }),

    );

    floor.rotation.x = -Math.PI / 2;

    floor.position.set(L / 2, 0, W / 2);

    bedGroup.add(floor);



    if (document.getElementById('show-grid')?.checked) {

      floorGridGroup = buildFloorGrid(L, W);

      bedGroup.add(floorGridGroup);

    }



    const edges = new THREE.LineSegments(

      new THREE.EdgesGeometry(new THREE.BoxGeometry(L, bedH, W)),

      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 }),

    );

    edges.position.set(L / 2, bedH / 2, W / 2);

    bedGroup.add(edges);



    addStirnWall(bedGroup, W, bedH);



    if (xyzModeActive) {

      bedGroup.add(buildCornerHandles(L, W, bedH));

    }



    const heightLineY = getMaxStackHeight();

    if (heightLineY > 0 && items.length) {

      const hLine = new THREE.Line(

        new THREE.BufferGeometry().setFromPoints([

          new THREE.Vector3(0, heightLineY, 0),

          new THREE.Vector3(L, heightLineY, 0),

          new THREE.Vector3(L, heightLineY, W),

          new THREE.Vector3(0, heightLineY, W),

          new THREE.Vector3(0, heightLineY, 0),

        ]),

        new THREE.LineBasicMaterial({

          color: heightLineY > bedH + 1e-6 ? 0xef4444 : 0x22c55e,

          transparent: true,

          opacity: 0.6,

        }),

      );

      bedGroup.add(hLine);

    }



    const colliding = getCollidingIds();

    items.forEach((item) => {

      const geo = new THREE.BoxGeometry(item.length, item.height, item.width);

      const isBad = colliding.has(item.id);

      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({

        color: hexToThree(item.color || '#3b82f6'),

        transparent: true,

        opacity: isBad ? 0.92 : 0.78,

        roughness: 0.55,

        emissive: isBad ? new THREE.Color(0x991b1b) : new THREE.Color(0x000000),

        emissiveIntensity: isBad ? 0.35 : 0,

      }));

      mesh.userData = { itemId: item.id, role: 'mesh' };

      mesh.position.set(item.x + item.length / 2, item.z + item.height / 2, item.y + item.width / 2);

      const edge = new THREE.LineSegments(

        new THREE.EdgesGeometry(geo),

        new THREE.LineBasicMaterial({ color: isBad ? 0xff4444 : 0xffffff, transparent: true, opacity: 0.35 }),

      );

      edge.userData = { itemId: item.id, role: 'edge' };

      edge.position.copy(mesh.position);

      cargoGroup.add(mesh);

      cargoGroup.add(edge);

      if (item.notStackable) mesh.add(createNotStackableMark(item));

    });



    updateCollisionVisuals();

    updateCanvasCursorForMode();

    if (!dragState) controls.target.set(L * 0.45, bedH * 0.35, W / 2);

    if (planGroup) planGroup.position.set(planPan.x, planPan.y, planPan.z);

  }



  function getPointerNdc(event) {

    const rect = canvas.getBoundingClientRect();

    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;

    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  }



  function pickCargoMesh(event) {

    if (!raycaster || !camera || !cargoGroup) return null;

    getPointerNdc(event);

    raycaster.setFromCamera(pointerNdc, camera);

    const hits = raycaster.intersectObjects(cargoGroup.children, false);

    for (let i = 0; i < hits.length; i += 1) {

      const mesh = hits[i].object;

      if (mesh.userData?.role === 'mesh' && mesh.userData.itemId) {

        return { itemId: mesh.userData.itemId, point: hits[i].point };

      }

    }

    return null;

  }



  function pickCornerHandle(event) {

    if (!raycaster || !camera || !bedGroup) return null;

    getPointerNdc(event);

    raycaster.setFromCamera(pointerNdc, camera);

    raycaster.params.Line = { threshold: 0.12 };

    const hits = raycaster.intersectObjects(bedGroup.children, true);

    for (let i = 0; i < hits.length; i += 1) {

      const idx = getCornerIndexFromObject(hits[i].object);

      if (idx != null) return { cornerIndex: idx, point: hits[i].point };

    }

    return null;

  }



  function itemToWorldPosition(item) {

    return { x: item.x + item.length / 2, y: item.z + item.height / 2, z: item.y + item.width / 2 };

  }



  function updateCargoPositions() {

    if (!cargoGroup) return;

    cargoGroup.children.forEach((child) => {

      const item = findItemById(child.userData?.itemId);

      if (!item) return;

      const pos = itemToWorldPosition(item);

      child.position.set(pos.x, pos.y, pos.z);

    });

  }



  function updateCollisionVisuals() {

    if (!cargoGroup) return;

    const colliding = getCollidingIds();

    cargoGroup.children.forEach((child) => {

      const item = findItemById(child.userData?.itemId);

      if (!item) return;

      if (child.userData?.role === 'mesh' && child.material) {

        const isSelected = item.id === selectedId;

        const isBad = colliding.has(item.id);

        child.material.emissive.setHex(isBad ? 0x991b1b : (isSelected ? 0x1d4ed8 : 0x000000));

        child.material.emissiveIntensity = isBad ? 0.35 : (isSelected ? 0.22 : 0);

        child.material.opacity = isBad ? 0.92 : (isSelected ? 0.9 : 0.78);

      }

      if (child.userData?.role === 'edge' && child.material) {

        const isSelected = item.id === selectedId;

        const isBad = colliding.has(item.id);

        child.material.color.setHex(isBad ? 0xff4444 : (isSelected ? 0x60a5fa : 0xffffff));

        child.material.opacity = isSelected ? 0.75 : 0.35;

      }

    });

  }



  function setCanvasCursor(cursor) {

    if (canvas) canvas.style.cursor = cursor;

  }



  function bindDragDocumentListeners() {

    if (bindDragDocumentListeners.bound) return;

    bindDragDocumentListeners.bound = true;

    document.addEventListener('pointermove', onDocumentPointerMove);

    document.addEventListener('pointerup', onDocumentPointerUp);

    document.addEventListener('pointercancel', onDocumentPointerUp);

  }



  function unbindDragDocumentListeners() {

    if (!bindDragDocumentListeners.bound) return;

    bindDragDocumentListeners.bound = false;

    document.removeEventListener('pointermove', onDocumentPointerMove);

    document.removeEventListener('pointerup', onDocumentPointerUp);

    document.removeEventListener('pointercancel', onDocumentPointerUp);

  }



  function intersectDragPlane(clientX, clientY, planeY) {

    getPointerNdc({ clientX, clientY });

    raycaster.setFromCamera(pointerNdc, camera);

    dragPlane.constant = -planeY;

    return raycaster.ray.intersectPlane(dragPlane, dragHit) ? dragHit.clone() : null;

  }



  function applyDragAt(clientX, clientY) {

    if (!dragState) return;

    const item = findItemById(dragState.id);

    if (!item) return;

    const hit = intersectDragPlane(clientX, clientY, 0);

    if (!hit) return;

    item.x = snap(hit.x - dragState.offsetX - item.length / 2);

    item.y = snap(hit.z - dragState.offsetZ - item.width / 2);

    finalizeItemPlacement(item, { resolveStack: true });

    updateCargoPositions();

    updateCollisionVisuals();

    updateStats();

  }



  function finishDrag(event) {

    if (!dragState) return;

    const item = findItemById(dragState.id);

    const didMove = dragState.moved;

    if (item && didMove) {

      finalizeItemPlacement(item, { resolveStack: true });

    }

    if (dragUndoSnapshot && dragState && didMove) {

      const movedItem = findItemById(dragState.id);

      const beforeItem = dragUndoSnapshot.items?.find((entry) => entry.id === dragState.id);

      if (

        movedItem && beforeItem &&

        (movedItem.x !== beforeItem.x || movedItem.y !== beforeItem.y || movedItem.z !== beforeItem.z)

      ) {

        undoStack.push(dragUndoSnapshot);

        while (undoStack.length > MAX_UNDO) undoStack.shift();

        updateUndoControls();

      }

      dragUndoSnapshot = null;

    } else {

      dragUndoSnapshot = null;

    }

    dragState = null;

    if (controls) controls.enabled = true;

    disableCornerOrbit();

    unbindDragDocumentListeners();

    setCanvasCursor('grab');

    if (canvas && event?.pointerId != null) {

      try { canvas.releasePointerCapture(event.pointerId); } catch { /* ignore */ }

    }

    drawScene();

    updateStats();

    scheduleSave();

  }



  function onDocumentPointerMove(event) {

    if (!dragState) return;

    const dx = event.clientX - dragState.startClientX;

    const dy = event.clientY - dragState.startClientY;

    if (!dragState.moved) {

      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

      dragState.moved = true;

    }

    event.preventDefault();

    applyDragAt(event.clientX, event.clientY);

  }



  function onDocumentPointerUp(event) {

    finishDrag(event);

  }



  function onCanvasPointerDown(event) {

    if (event.button === 2) return;

    if (event.button !== 0 || !camera) return;

    hideContextMenu();

    const pick = pickCargoMesh(event);

    if (pick) {

      event.preventDefault();

      event.stopPropagation();

      event.stopImmediatePropagation();

      disableCornerOrbit();

      selectedId = pick.itemId;

      const item = findItemById(pick.itemId);

      if (!item) return;

      const pos = itemToWorldPosition(item);

      const floorHit = intersectDragPlane(event.clientX, event.clientY, 0);

      const ref = floorHit || pick.point;

      dragState = {

        id: pick.itemId,

        offsetX: ref.x - pos.x,

        offsetZ: ref.z - pos.z,

        startClientX: event.clientX,

        startClientY: event.clientY,

        moved: false,

      };

      dragUndoSnapshot = cloneStateForUndo();

      if (controls) controls.enabled = false;

      bindDragDocumentListeners();

      setCanvasCursor('grabbing');

      try { canvas.setPointerCapture(event.pointerId); } catch { /* ignore */ }

      updateCollisionVisuals();

      updateCargoDetail();

      return;

    }



    const cornerPick = xyzModeActive ? pickCornerHandle(event) : null;

    if (cornerPick) {

      enableCornerOrbit();

      setCornerHighlight(cornerPick.cornerIndex);

      setCanvasCursor('grab');

      return;

    }



    if (positionModeActive) {

      event.preventDefault();

      event.stopPropagation();

      event.stopImmediatePropagation();

      disableCornerOrbit();

      positionDragState = {

        lastClientX: event.clientX,

        lastClientY: event.clientY,

      };

      if (controls) controls.enabled = false;

      bindPositionDocumentListeners();

      setCanvasCursor('grabbing');

      try { canvas.setPointerCapture(event.pointerId); } catch { /* ignore */ }

      selectedId = null;

      updateCollisionVisuals();

      updateCargoDetail();

      return;

    }



    if (xyzModeActive) {

      event.preventDefault();

      event.stopPropagation();

      event.stopImmediatePropagation();

      disableCornerOrbit();

      selectedId = null;

      updateCollisionVisuals();

      updateCargoDetail();

      return;

    }



    disableCornerOrbit();

    selectedId = null;

    updateCollisionVisuals();

    updateCargoDetail();

  }



  function onCanvasContextMenu(event) {

    event.preventDefault();

    hideContextMenu();

    const pick = pickCargoMesh(event);

    if (pick) showContextMenu(event.clientX, event.clientY, pick.itemId);

    else showContextMenu(event.clientX, event.clientY, selectedId);

  }



  function onCanvasDblClick(event) {

    const pick = pickCargoMesh(event);

    if (pick) openBeladungDialog(pick.itemId);

  }



  function initDragHandlers() {

    if (!canvas) return;

    canvas.addEventListener('pointerdown', onCanvasPointerDown, { capture: true });

    canvas.addEventListener('contextmenu', onCanvasContextMenu);

    canvas.addEventListener('dblclick', onCanvasDblClick);

    canvas.addEventListener('pointermove', (event) => {

      if (dragState || cornerOrbitActive || positionDragState) return;

      if (!xyzModeActive) {

        setCornerHighlight(null);

        updateCanvasCursorForMode();

        return;

      }

      const corner = pickCornerHandle(event);

      if (corner) {

        setCornerHighlight(corner.cornerIndex);

        setCanvasCursor('grab');

      } else {

        setCornerHighlight(null);

        updateCanvasCursorForMode();

      }

    });

    canvas.addEventListener('pointerup', () => {

      if (!dragState) {

        disableCornerOrbit();

        finishPositionDrag({});

        if (!xyzModeActive) setCornerHighlight(null);

      }

    });

    canvas.addEventListener('pointerleave', () => {

      if (!cornerOrbitActive) setCornerHighlight(null);

    });

    document.addEventListener('keydown', (event) => {

      if (event.target.matches('input, textarea, select')) return;

      if (event.key === 'r' || event.key === 'R') rotateItemById(selectedId);

      if ((event.ctrlKey || event.metaKey) && event.key === 'z') {

        event.preventDefault();

        undoLastStep();

      }

      if (event.key === 'Escape') hideContextMenu();

    });

    document.addEventListener('click', (event) => {

      if (!contextMenu?.contains(event.target)) hideContextMenu();

    });

  }



  function initContextMenuHandlers() {

    contextMenu?.querySelectorAll('[data-action]').forEach((btn) => {

      btn.addEventListener('click', () => activateContextMenuAction(btn.dataset.action));

    });

    contextMenuWeightInput?.addEventListener('change', () => {

      if (contextMenuItemId) applyItemWeight(contextMenuItemId, contextMenuWeightInput.value);

    });

    contextMenuHeightInput?.addEventListener('change', () => {

      if (contextMenuItemId) applyItemHeightCm(contextMenuItemId, contextMenuHeightInput.value);

    });

    document.getElementById('btn-cargo-beladen')?.addEventListener('click', () => {

      if (selectedId) openBeladungDialog(selectedId);

    });

    document.getElementById('btn-rotate')?.addEventListener('click', () => {

      if (selectedId) rotateItemById(selectedId);

    });

    document.getElementById('btn-delete')?.addEventListener('click', () => {

      if (selectedId && confirm('Ladegut wirklich löschen?')) deleteItem(selectedId);

    });

    document.getElementById('beladung-dialog-save')?.addEventListener('click', saveBeladungDialog);

    document.getElementById('beladung-dialog-cancel')?.addEventListener('click', closeBeladungDialog);

    document.getElementById('beladung-dialog-backdrop')?.addEventListener('click', closeBeladungDialog);

  }



  function updateStats() {

    const truck = getTruck();

    if (!truck) {

      [volumeInfo, weightInfo, heightInfo, collisionInfo, truckHeightInfo].forEach((el) => {

        if (el) el.textContent = '';

      });

      updateBarCharts(null);

      return;

    }



    const bedH = getTruckHeight(truck);

    const totalVol = truck.length * truck.width * bedH;

    const usedVol = items.reduce((s, i) => s + i.length * i.width * i.height, 0);

    const volPct = totalVol > 0 ? ((usedVol / totalVol) * 100).toFixed(1) : '0.0';

    const totalW = items.reduce((s, i) => s + (i.weight ?? 0), 0);

    const maxStack = getMaxStackHeight();

    const stackPct = bedH > 0 ? ((maxStack / bedH) * 100).toFixed(1) : '0.0';

    const colliding = getCollidingIds();

    const overHeight = items.filter((i) => i.z + i.height > bedH + 1e-6);



    if (truckHeightInfo) {

      truckHeightInfo.className = 'stat-info ok';

      truckHeightInfo.innerHTML = `<strong>Max. Innenhöhe: ${bedH.toFixed(2)} m</strong><br>Laderaum ${truck.length.toFixed(2)} × ${truck.width.toFixed(2)} m`;

    }

    if (volumeInfo) {

      volumeInfo.className = parseFloat(volPct) >= 101 ? 'stat-info warning' : 'stat-info ok';

      volumeInfo.innerHTML = `<strong>Raumauslastung: ${volPct}%</strong><br>${usedVol.toFixed(2)} / ${totalVol.toFixed(2)} m³`;

    }

    if (weightInfo) {

      weightInfo.className = totalW > truck.maxWeight ? 'stat-info warning' : 'stat-info ok';

      weightInfo.innerHTML = `<strong>Gewicht: ${totalW.toLocaleString('de-DE')} kg</strong><br>Nutzlast max. ${truck.maxWeight.toLocaleString('de-DE')} kg`;

    }

    if (heightInfo) {

      const over = maxStack > bedH + 1e-6;

      heightInfo.className = over ? 'stat-info warning-height' : 'stat-info ok';

      heightInfo.innerHTML = `<strong>Stapelhöhe: ${maxStack.toFixed(2)} m (${stackPct}%)</strong><br>Max. Ladehöhe ${bedH.toFixed(2)} m`;

    }

    if (collisionInfo) {

      const stackAttempt = findActiveNotStackableStackAttempt();

      if (stackAttempt) {

        collisionInfo.className = 'stat-info warning';

        collisionInfo.innerHTML = '<strong>⚠ Nicht stapelbar</strong>';

      } else if (colliding.size > 0) {

        collisionInfo.className = 'stat-info warning';

        collisionInfo.innerHTML = `<strong>⚠ ${colliding.size} Überlappung${colliding.size > 1 ? 'en' : ''}</strong>`;

      } else if (overHeight.length > 0) {

        collisionInfo.className = 'stat-info warning-height';

        collisionInfo.innerHTML = `<strong>⚠ ${overHeight.length} über Innenhöhe</strong>`;

      } else {

        collisionInfo.className = 'stat-info ok';

        collisionInfo.textContent = 'Keine Überlappung · Höhe OK';

      }

    }

    updateBarCharts(truck);

  }



  function updateHeaderTruck() {

    const truck = getTruck();

    if (!truck || !headerTruckInfo) return;

    const h = getTruckHeight(truck);

    headerTruckInfo.innerHTML = `

      <div class="header-truck-row">

        <span class="header-truck-btn">

          <span class="header-truck-btn-name">${truck.name}</span>

          <span class="header-truck-btn-category">${truck.category}</span>

        </span>

      </div>

      <p class="header-truck-note">${truck.length.toFixed(2)} × ${truck.width.toFixed(2)} × ${h.toFixed(2)} m · ${items.length} Ladegut${items.length === 1 ? '' : 'stücke'}</p>`;

  }



  function addCargoFromPreset(preset, qty = 1) {

    const truck = getTruck();

    if (!truck) { alert('Bitte zuerst ein Fahrzeug wählen.'); return; }

    const count = Math.max(1, Math.min(99, qty));

    const height = getPresetHeight(preset);

    pushUndo();

    for (let i = 0; i < count; i += 1) {

      items.push({

        id: uid(),

        length: preset.length,

        width: preset.width,

        height,

        x: snap(0), y: snap(0), z: snap(0),

        label: count > 1 ? `${preset.name} ${i + 1}` : preset.name,

        color: nextColor(preset.color),

        weight: null,

        rotation: 0,

        beladung: [],

        notStackable: false,

      });

    }

    clampAllItems();

    updateUI();

  }



  function addCustomCargo() {

    const truck = getTruck();

    if (!truck) { alert('Bitte zuerst ein Fahrzeug wählen.'); return; }

    const length = (parseFloat(document.getElementById('cargo-length').value) || 0) / 100;

    const width = (parseFloat(document.getElementById('cargo-width').value) || 0) / 100;

    const height = (parseFloat(document.getElementById('cargo-height').value) || 0) / 100;

    const weightRaw = document.getElementById('cargo-weight').value;

    const label = document.getElementById('cargo-label').value.trim();

    const qty = parseInt(document.getElementById('cargo-qty').value, 10) || 1;

    if (length <= 0 || width <= 0 || height <= 0) {

      alert('Bitte gültige Maße L × B × H eingeben.');

      return;

    }

    const weight = weightRaw === '' ? null : parseFloat(weightRaw);

    pushUndo();

    for (let i = 0; i < qty; i += 1) {

      items.push({

        id: uid(), length, width, height, x: 0, y: 0, z: 0,

        label: label || `Ladegut ${items.length + 1}`,

        color: nextColor(), weight: Number.isFinite(weight) ? weight : null,

        customDimensions: true, rotation: 0, beladung: [], notStackable: false,

      });

    }

    clampAllItems();

    updateUI();

  }



  function openAutoPackDialog() {

    const truck = getTruck();

    if (!truck) { alert('Bitte zuerst ein Fahrzeug wählen.'); return; }

    if (!items.length) { alert('Kein Ladegut vorhanden.'); return; }

    document.getElementById('auto-pack-dialog')?.classList.remove('hidden');

  }



  function closeAutoPackDialog() {

    document.getElementById('auto-pack-dialog')?.classList.add('hidden');

  }



  function runAutoPack(packMode) {

    const truck = getTruck();

    if (!truck) { alert('Bitte zuerst ein Fahrzeug wählen.'); return; }

    if (!items.length) { alert('Kein Ladegut vorhanden.'); return; }

    closeAutoPackDialog();

    pushUndo();

    const bedH = getTruckHeight(truck);

    const result = LadeplanPacker3D.packBest(truck.length, truck.width, bedH, items.map((i) => ({ ...i })), {

      allowRotate: document.getElementById('auto-rotate').checked,

      gridStep: document.getElementById('snap-grid').checked ? GRID_M : 0,

      maxWeight: document.getElementById('auto-respect-weight').checked ? truck.maxWeight : Infinity,

      packMode: packMode === 'floor' ? 'floor' : 'stack',

    });

    const placedIds = new Set(result.placed.map((p) => p.id));

    items = items.filter((item) => placedIds.has(item.id)).map((item) => {

      const placed = result.placed.find((p) => p.id === item.id);

      return placed ? { ...item, ...placed } : item;

    });

    clampAllItems();

    const pct = (result.utilization * 100).toFixed(1);

    const floorPct = ((result.floorUtilization || 0) * 100).toFixed(1);

    const stackedCount = result.placed.filter((p) => p.z > EPS).length;

    const modeLabel = packMode === 'floor' ? 'Ladefläche' : 'Stapeln';

    if (result.unplaced.length > 0) {

      autoResult.className = 'stat-info warning';

      autoResult.innerHTML = `<strong>${result.placedCount} platziert (${modeLabel})</strong><br>${pct}% Raum · ${floorPct}% Ladefläche · ${stackedCount} gestapelt · ${result.unplaced.length} passen nicht`;

    } else {

      autoResult.className = 'stat-info ok';

      autoResult.innerHTML = `<strong>3D-Plan erstellt (${modeLabel})</strong><br>${result.placedCount} Ladegüter · ${pct}% Raum · ${floorPct}% Ladefläche · ${stackedCount} gestapelt`;

    }

    updateUI();

  }



  function captureExportCanvas() {

    if (!renderer || !scene || !camera) return null;

    const previousBackground = scene.background;

    scene.background = new THREE.Color(0xffffff);

    renderer.render(scene, camera);

    scene.background = previousBackground;

    const exportCanvas = document.createElement('canvas');

    exportCanvas.width = 1600;

    exportCanvas.height = 960;

    const ctx = exportCanvas.getContext('2d');

    const truck = getTruck();

    ctx.fillStyle = '#ffffff';

    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    ctx.fillStyle = '#0f172a';

    ctx.font = 'bold 22px Segoe UI, system-ui, sans-serif';

    const bedH = truck ? getTruckHeight(truck) : 0;

    ctx.fillText(

      truck ? `Ladeplan 3D · ${truck.name} · ${truck.length.toFixed(2)}×${truck.width.toFixed(2)}×${bedH.toFixed(2)} m · Max. Ladehöhe ${bedH.toFixed(2)} m` : 'Ladeplan 3D',

      24, 34,

    );

    ctx.drawImage(renderer.domElement, 24, 48, exportCanvas.width - 48, exportCanvas.height - 72);

    return exportCanvas;

  }



  function getStateForExport() {

    return {

      version: 2,

      truckId: truckSelect.value,

      customLength: customLength.value,

      customWidth: customWidth.value,

      customHeight: customHeight.value,

      customMaxWeight: customMaxWeight.value,

      items: items.map((item) => ({ ...item, beladung: getItemBeladung(item) })),

      colorIndex,

      selectedId,

    };

  }



  function cloneStateForUndo() {

    return JSON.parse(JSON.stringify(getStateForExport()));

  }



  function updateUndoControls() {

    const canUndo = undoStack.length > 0;

    const undoBtn = contextMenu?.querySelector('[data-action="undo"]');

    if (undoBtn) {

      undoBtn.disabled = !canUndo;

      undoBtn.textContent = 'Rückgängig';

    }

  }



  function pushUndo() {

    const snapshot = cloneStateForUndo();

    const last = undoStack[undoStack.length - 1];

    if (last && JSON.stringify(last) === JSON.stringify(snapshot)) return;

    undoStack.push(snapshot);

    while (undoStack.length > MAX_UNDO) undoStack.shift();

    updateUndoControls();

  }



  function restoreUndoState(state) {

    loadStateFromData(state);

    selectedId = state.selectedId ?? null;

    if (selectedId && !findItemById(selectedId)) selectedId = null;

    customFields.classList.toggle('hidden', truckSelect.value !== 'custom');

    clampAllItems();

  }



  function undoLastStep() {

    if (!undoStack.length) return false;

    restoreUndoState(undoStack.pop());

    updateUndoControls();

    updateUI();

    scheduleSave();

    return true;

  }



  function loadStateFromData(data) {

    if (data.truckId) truckSelect.value = data.truckId;

    if (data.customLength) customLength.value = data.customLength;

    if (data.customWidth) customWidth.value = data.customWidth;

    if (data.customHeight) customHeight.value = data.customHeight;

    if (data.customMaxWeight) customMaxWeight.value = data.customMaxWeight;

    items = (data.items || []).map((item) => ({

      ...item,

      height: item.height || 1,

      z: item.z || 0,

      rotation: item.rotation || 0,

      beladung: normalizeBeladung(item.beladung),

      notStackable: !!item.notStackable,

    }));

    colorIndex = data.colorIndex || 0;

    customFields.classList.toggle('hidden', truckSelect.value !== 'custom');

  }



  function resetPlan() {

    items = [];

    selectedId = null;

    autoResult.textContent = '';

    updateUI();

  }



  function initTruckSelect() {

    const placeholder = document.createElement('option');

    placeholder.value = '';

    placeholder.textContent = '— Fahrzeug wählen —';

    truckSelect.appendChild(placeholder);

    TRUCK_TYPES.forEach((truck) => {

      const opt = document.createElement('option');

      opt.value = truck.id;

      opt.textContent = truck.name;

      truckSelect.appendChild(opt);

    });

    truckSelect.value = 'lk_75t_plane';

    truckSelect.addEventListener('change', () => {

      customFields.classList.toggle('hidden', truckSelect.value !== 'custom');

      clampAllItems();

      updateUI();

    });

  }



  function initPresets() {

    cargoPresets.innerHTML = '';

    CARGO_PRESETS.forEach((preset) => {

      const card = document.createElement('div');

      card.className = 'preset-card';

      card.style.borderLeftColor = preset.color;

      const hCm = ((preset.height || 1) * 100).toFixed(0);

      card.innerHTML = `

        <strong class="preset-card-name">${preset.name}</strong>

        <span class="preset-card-dims">${(preset.length * 100).toFixed(0)} × ${(preset.width * 100).toFixed(0)} cm</span>

        <label class="preset-height-label">H (cm)

          <input type="number" class="preset-height-input" data-preset-id="${preset.id}" min="10" max="300" step="1" value="${hCm}" aria-label="Höhe ${preset.name} in cm">

        </label>

        <button type="button" class="btn preset-card-add">Platzieren</button>`;

      card.querySelector('.preset-card-add').addEventListener('click', () => {

        const qty = parseInt(document.getElementById('cargo-qty').value, 10) || 1;

        addCargoFromPreset(preset, qty);

      });

      card.querySelector('.preset-height-input')?.addEventListener('click', (e) => e.stopPropagation());

      cargoPresets.appendChild(card);

    });

  }



  function scheduleSave() {

    clearTimeout(scheduleSave.timer);

    scheduleSave.timer = setTimeout(() => {

      localStorage.setItem(STORAGE_KEY, JSON.stringify(getStateForExport()));

    }, 400);

  }



  function loadState() {

    try {

      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) return;

      loadStateFromData(JSON.parse(raw));

    } catch { /* ignore */ }

  }



  function init() {

    if (typeof THREE === 'undefined') {

      scaleInfo.textContent = 'Three.js konnte nicht geladen werden.';

      return;

    }

    initTruckSelect();

    initPresets();

    VehiclePhotoPanel.init({ assetBase: '../assets/vehicles/' });

    loadState();

    initThree();



    document.getElementById('btn-add-cargo')?.addEventListener('click', addCustomCargo);

    document.getElementById('btn-auto-pack')?.addEventListener('click', openAutoPackDialog);

    document.getElementById('auto-pack-mode-stack')?.addEventListener('click', () => runAutoPack('stack'));

    document.getElementById('auto-pack-mode-floor')?.addEventListener('click', () => runAutoPack('floor'));

    document.getElementById('auto-pack-dialog-cancel')?.addEventListener('click', closeAutoPackDialog);

    document.getElementById('auto-pack-dialog-backdrop')?.addEventListener('click', closeAutoPackDialog);

    document.getElementById('btn-clear')?.addEventListener('click', () => {

      if (items.length && !confirm('Alle Ladegüter wirklich entfernen?')) return;

      pushUndo();

      resetPlan();

    });

    document.getElementById('show-grid')?.addEventListener('change', () => drawScene());

    [customLength, customWidth, customHeight, customMaxWeight].forEach((el) => {

      el?.addEventListener('change', () => { clampAllItems(); updateUI(); });

    });



    window.Ladeplan3D = {

      getTruck,

      getItems: () => items,

      getTruckHeight,

      findItemById,

      itemLabel,

      getItemBeladung,

      captureExportCanvas,

      getStateForExport,

      loadStateFromData,

      resetPlan,

      clearUndoHistory: () => {

        undoStack = [];

        dragUndoSnapshot = null;

        updateUndoControls();

      },

      updateUI,

    };



    updateUndoControls();

    updateUI();

  }



  init();

})();


