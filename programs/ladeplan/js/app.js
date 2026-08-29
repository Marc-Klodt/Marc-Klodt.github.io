(() => {
  'use strict';

  const GRID_M = 0.1;
  const PADDING = 48;
  const PIXELS_PER_METER = 100;
  const EPS = 1e-6;
  const STORAGE_KEY = 'ladeplan-state';
  const LPN_STORAGE_KEY = 'ladeplan-lpn-counter';
  const LPN_HEADER_TOOLTIP = 'Aktuelle Ladeplan Nummer. Nach Abschluß des Ladeplans wird für den nächsten Ladeplan eine neue Ladeplannummer ( LPN ) vergeben.';
  const LPN_START = 1001;
  const MAX_UNDO = 10;
  const VEHICLE_PHOTO_MAX_W = 225;
  const ROTATE_HANDLE_MIN_R = 5;
  const ROTATE_HANDLE_MAX_R = 8;

  /** Zugfahrzeug- + Anhänger-Ladefläche (Draufsicht, m) */
  const ANHAENGER_COMBOS = {
    anhaenger_plane: {
      truckBed: { length: 6.0, width: 2.45 },
      trailerBed: { length: 7.0, width: 2.48 },
    },
    anhaenger_lang: {
      truckBed: { length: 7.8, width: 2.45 },
      trailerBed: { length: 13.6, width: 2.48 },
    },
  };

  const canvas = document.getElementById('ladeplan-canvas');
  const ctx = canvas.getContext('2d');
  const anhaengerPlanSection = document.getElementById('anhaenger-plan-section');
  const trailerCanvas = document.getElementById('anhaenger-canvas');
  const trailerCtx = trailerCanvas ? trailerCanvas.getContext('2d') : null;
  const anhaengerScaleInfo = document.getElementById('anhaenger-scale-info');
  const truckSelect = document.getElementById('truck-select');
  const customFields = document.getElementById('custom-truck-fields');
  const customLength = document.getElementById('custom-length');
  const customWidth = document.getElementById('custom-width');
  const customMaxWeight = document.getElementById('custom-max-weight');
  const headerTruckInfo = document.getElementById('header-truck-info');
  const cargoPresets = document.getElementById('cargo-presets');
  const cargoDetailContent = document.getElementById('cargo-detail-content');
  const btnCargoWeight = document.getElementById('btn-cargo-weight');
  const btnCargoBeladen = document.getElementById('btn-cargo-beladen');
  const cargoDetailWeightInput = document.getElementById('cargo-detail-weight');
  const weightInfo = document.getElementById('weight-info');
  const collisionInfo = document.getElementById('collision-info');
  const scaleInfo = document.getElementById('scale-info');
  const usageBarChart = document.getElementById('usage-bar-chart');
  const weightBarChart = document.getElementById('weight-bar-chart');
  const vehiclePanel = document.getElementById('vehicle-panel');
  const adSlot = document.getElementById('ad-slot');
  const fileImport = document.getElementById('file-import');
  const autoMode = document.getElementById('auto-mode');
  const autoListPanel = document.getElementById('auto-list-panel');
  const autoList = document.getElementById('auto-list');
  const autoResult = document.getElementById('auto-result');
  const weightList = document.getElementById('weight-list');
  const weightListEmpty = document.getElementById('weight-list-empty');
  const contextMenu = document.getElementById('cargo-context-menu');
  const contextMenuWeightRow = document.getElementById('context-menu-weight-row');
  const contextMenuWeightInput = document.getElementById('context-menu-weight');
  const btnUndo = document.getElementById('btn-undo');
  const vehiclePhoto = document.getElementById('vehicle-photo');
  const vehiclePhotoFrame = document.getElementById('vehicle-photo-frame');
  const vehiclePhotoCaption = document.getElementById('vehicle-photo-caption');

  let items = [];
  let trailerItems = [];
  let selectedId = null;
  let dragState = null;
  let colorIndex = 0;
  let pixelsPerMeter = PIXELS_PER_METER;
  let contextMenuItemId = null;
  let undoStack = [];
  let dragUndoSnapshot = null;
  let weightUndoArmed = false;
  let cargoWeightEditing = false;
  let weightListEditingId = null;
  let hoveredItemId = null;
  let beladungDialogItemId = null;
  let cargoListExportPreviewActive = false;
  let currentPlanLpnValue = null;
  function normalizeWeight(value) {
    if (value === '' || value === null || value === undefined) return null;
    const n = parseFloat(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function itemLabel(item, index) {
    return item.label || `Ladegut ${index + 1}`;
  }

  function normalizeBeladung(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry).trim()).filter(Boolean);
    }
    return String(value).split('\n').map((entry) => entry.trim()).filter(Boolean);
  }

  function getItemBeladung(item) {
    return normalizeBeladung(item?.beladung);
  }

  function formatBeladungText(item) {
    const lines = getItemBeladung(item);
    return lines.length ? lines.join('\n') : '';
  }

  function formatBeladungHtml(item) {
    const lines = getItemBeladung(item);
    if (!lines.length) {
      return '<p class="cargo-list-beladung-empty">— keine Beladung —</p>';
    }
    return `<ul class="cargo-list-beladung">${lines.map((line) => `<li>${escapeXml(line)}</li>`).join('')}</ul>`;
  }

  function formatBeladungSummary(item, maxLen = 48) {
    const lines = getItemBeladung(item);
    if (!lines.length) return 'Noch keine Beladung';

    if (lines.length === 1) {
      const line = lines[0];
      return line.length <= maxLen ? line : `${line.slice(0, maxLen - 1)}…`;
    }

    let summary = '';
    for (let i = 0; i < lines.length; i += 1) {
      const part = i === 0 ? lines[i] : ` · ${lines[i]}`;
      if ((summary + part).length > maxLen - 4) {
        const remaining = lines.length - i;
        return remaining > 0 ? `${summary} … (+${remaining})` : `${summary.slice(0, maxLen - 1)}…`;
      }
      summary += part;
    }
    return summary.length <= maxLen ? summary : `${summary.slice(0, maxLen - 1)}…`;
  }

  function getSelectedCargoListMode() {
    const selected = document.querySelector('input[name="cargo-list-mode"]:checked');
    const mode = selected?.value;
    if (mode === 'plan' || mode === 'both' || mode === 'beladung' || mode === 'all') return mode;
    return 'list';
  }

  function isEditableTarget(el) {
    if (!el || !(el instanceof Element)) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') {
      const type = (el.type || 'text').toLowerCase();
      return !['button', 'submit', 'reset', 'checkbox', 'radio', 'file'].includes(type);
    }
    return el.isContentEditable;
  }

  function isBeladungDialogOpen() {
    const dialog = document.getElementById('beladung-dialog');
    return Boolean(dialog && !dialog.classList.contains('hidden'));
  }

  function shouldIgnoreCanvasShortcuts() {
    if (isBeladungDialogOpen()) return true;
    if (!contextMenu.classList.contains('hidden')) return true;
    return isEditableTarget(document.activeElement);
  }

  function getContextMenuFocusables() {
    const nodes = [];
    if (
      contextMenuWeightRow
      && !contextMenuWeightRow.classList.contains('hidden')
      && contextMenuWeightInput
      && !contextMenuWeightInput.disabled
    ) {
      nodes.push(contextMenuWeightInput);
    }
    contextMenu.querySelectorAll('[data-action]').forEach((btn) => {
      if (!btn.disabled) nodes.push(btn);
    });
    return nodes;
  }

  function focusContextMenuItem(index) {
    const items = getContextMenuFocusables();
    if (!items.length) return null;
    const i = ((index % items.length) + items.length) % items.length;
    items[i].focus();
    return items[i];
  }

  function focusNextContextMenuItem(delta) {
    const items = getContextMenuFocusables();
    if (!items.length) return;
    const current = document.activeElement;
    let idx = items.indexOf(current);
    if (idx < 0) idx = delta > 0 ? -1 : 0;
    focusContextMenuItem(idx + delta);
  }

  function getItemScreenCenter(itemId) {
    const item = findItemById(itemId);
    if (!item) {
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }
    const bed = getItemBed(itemId);
    const targetCanvas = bed === 'trailer' ? trailerCanvas : canvas;
    if (!targetCanvas) {
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }
    const origin = bedOrigin();
    const cx = origin.x + mToPx(item.x + item.length / 2);
    const cy = origin.y + mToPx(item.y + item.width / 2);
    const rect = targetCanvas.getBoundingClientRect();
    const scaleX = rect.width / targetCanvas.width;
    const scaleY = rect.height / targetCanvas.height;
    return {
      x: rect.left + cx * scaleX,
      y: rect.top + cy * scaleY,
    };
  }

  function activateContextMenuAction(action) {
    if (action === 'undo') {
      undoLastStep();
      hideContextMenu();
      return;
    }
    if (!contextMenuItemId) return;
    if (action === 'beladen') {
      openBeladungDialog(contextMenuItemId);
      hideContextMenu();
      return;
    }
    if (action === 'copy') copyCargo(contextMenuItemId);
    if (action === 'delete') deleteItemById(contextMenuItemId);
    hideContextMenu();
  }

  function openContextMenuKeyboard() {
    if (!selectedId) return;
    const { x, y } = getItemScreenCenter(selectedId);
    showContextMenu(x, y, selectedId, { keyboard: true, focusAction: 'beladen' });
  }

  function trapFocusInDialog(dialog, event) {
    if (event.key !== 'Tab' || !dialog || dialog.classList.contains('hidden')) return;
    const focusables = [...dialog.querySelectorAll(
      'textarea, button:not([disabled]), input:not([disabled]), select:not([disabled])',
    )];
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function countWithoutWeight() {
    return getAllItems().filter((item) => item.weight === null || item.weight === undefined).length;
  }

  function getTotalWeight() {
    return [...items, ...trailerItems].reduce((sum, item) => sum + (item.weight ?? 0), 0);
  }

  function getAllItems() {
    return [...items, ...trailerItems];
  }

  function getCollidingIdsFor(list) {
    const colliding = new Set();
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        if (rectsOverlap(list[i], list[j])) {
          colliding.add(list[i].id);
          colliding.add(list[j].id);
        }
      }
    }
    return colliding;
  }

  function getCollidingIds() {
    return new Set([...getCollidingIdsFor(items), ...getCollidingIdsFor(trailerItems)]);
  }

  let saveTimer = null;

  function getTruck() {
    const id = truckSelect.value;
    if (!id) return null;
    if (id === 'custom') {
      return {
        id: 'custom',
        name: 'Benutzerdefiniert',
        length: parseFloat(customLength.value) || 6,
        width: parseFloat(customWidth.value) || 2.45,
        maxWeight: parseFloat(customMaxWeight.value) || 3000,
        category: 'Individuell',
        note: 'Eigene Maße',
      };
    }
    return TRUCK_TYPES.find((t) => t.id === id) || TRUCK_TYPES[0];
  }

  function isAnhaenger(truck) {
    return Boolean(truck && truck.category === 'Anhänger');
  }

  function getAnhaengerCombo(truck) {
    return ANHAENGER_COMBOS[truck.id] || null;
  }

  function getBedDims(truck, bed) {
    const combo = getAnhaengerCombo(truck);
    if (combo) {
      return bed === 'trailer' ? combo.trailerBed : combo.truckBed;
    }
    return { length: truck.length, width: truck.width };
  }

  function getItemList(bed) {
    return bed === 'trailer' ? trailerItems : items;
  }

  function findItemById(id) {
    return items.find((item) => item.id === id) || trailerItems.find((item) => item.id === id);
  }

  function getItemBed(id) {
    return trailerItems.some((item) => item.id === id) ? 'trailer' : 'truck';
  }

  function mapItems(rawItems) {
    return (rawItems || []).map((item) => ({
      ...item,
      weight: item.weight === undefined || item.weight === null ? null : item.weight,
      rotation: item.rotation || 0,
      beladung: normalizeBeladung(item.beladung),
    }));
  }

  function inferRotationAfterPlacement(original, placed) {
    const baseRotation = original.rotation || 0;
    const swapped =
      Math.abs(placed.length - original.width) < EPS &&
      Math.abs(placed.width - original.length) < EPS &&
      Math.abs(placed.length - original.length) > EPS;
    if (swapped) return (baseRotation + 90) % 360;
    return baseRotation;
  }

  function migrateAnhaengerItems(truck) {
    if (!isAnhaenger(truck) || trailerItems.length || !items.length) return;
    trailerItems = items;
    items = [];
  }

  function clampItemsForBed(bed) {
    getItemList(bed).forEach((item) => clampItem(item, bed));
  }

  function clampAllItems() {
    clampItemsForBed('truck');
    clampItemsForBed('trailer');
  }

  function nextColor(presetColor) {
    if (presetColor) return presetColor;
    const color = CARGO_COLORS[colorIndex % CARGO_COLORS.length];
    colorIndex += 1;
    return color;
  }

  const CUSTOM_CARGO_STRIPE_LIGHT = '#fde047';
  const CUSTOM_CARGO_STRIPE_DARK = '#ca8a04';
  const CUSTOM_CARGO_STRIPE_WIDTH = 16;

  function dimensionsMatchPreset(length, width) {
    const EPS = 0.001;
    return CARGO_PRESETS.some((preset) => (
      (Math.abs(preset.length - length) < EPS && Math.abs(preset.width - width) < EPS)
      || (Math.abs(preset.length - width) < EPS && Math.abs(preset.width - length) < EPS)
    ));
  }

  function isCustomCargoItem(item) {
    if (!item) return false;
    if (item.customDimensions) return true;
    return !dimensionsMatchPreset(item.length, item.width);
  }

  function fillCustomCargoStripes(targetCtx, x, y, w, h) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const iw = Math.round(w);
    const ih = Math.round(h);
    const stripeWidth = CUSTOM_CARGO_STRIPE_WIDTH;
    const stripeStep = stripeWidth * 2;

    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.rect(ix, iy, iw, ih);
    targetCtx.clip();
    targetCtx.imageSmoothingEnabled = false;

    targetCtx.fillStyle = CUSTOM_CARGO_STRIPE_LIGHT;
    targetCtx.fillRect(ix, iy, iw, ih);

    targetCtx.fillStyle = CUSTOM_CARGO_STRIPE_DARK;
    for (let offset = -ih; offset < iw + ih; offset += stripeStep) {
      targetCtx.beginPath();
      targetCtx.moveTo(ix + offset, iy);
      targetCtx.lineTo(ix + offset + stripeWidth, iy);
      targetCtx.lineTo(ix + offset + stripeWidth + ih, iy + ih);
      targetCtx.lineTo(ix + offset + ih, iy + ih);
      targetCtx.closePath();
      targetCtx.fill();
    }

    targetCtx.restore();
  }

  function fillCargoItemRect(targetCtx, item, x, y, w, h, alpha = 1) {
    targetCtx.save();
    targetCtx.globalAlpha = alpha;
    if (isCustomCargoItem(item)) {
      fillCustomCargoStripes(targetCtx, x, y, w, h);
    } else {
      targetCtx.fillStyle = item.color;
      targetCtx.fillRect(x, y, w, h);
    }
    targetCtx.restore();
  }

  function getCargoItemStrokeColor(item, isSelected, isColliding) {
    if (isColliding) return '#ef4444';
    if (isSelected) return '#fbbf24';
    if (isCustomCargoItem(item)) return '#a16207';
    return item.color;
  }

  function uid() {
    return `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function snap(value) {
    if (!document.getElementById('snap-grid').checked) return value;
    return Math.round(value / GRID_M) * GRID_M;
  }

  function clampItem(item, bed) {
    const truck = getTruck();
    const dims = getBedDims(truck, bed || getItemBed(item.id));
    item.x = Math.max(0, Math.min(item.x, dims.length - item.length));
    item.y = Math.max(0, Math.min(item.y, dims.width - item.width));
  }

  function rectsOverlap(a, b) {
    return LadeplanPacker.rectsOverlap(a, b);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveToLocalStorage, 400);
  }

  function serializeState() {
    return {
      version: 1,
      truckId: truckSelect.value,
      customLength: customLength.value,
      customWidth: customWidth.value,
      customMaxWeight: customMaxWeight.value,
      items,
      trailerItems,
      colorIndex,
      selectedId,
      planLpnValue: currentPlanLpnValue,
    };
  }

  function cloneStateForUndo() {
    return JSON.parse(JSON.stringify(serializeState()));
  }

  function trimUndoStack() {
    while (undoStack.length > MAX_UNDO) undoStack.shift();
  }

  function pushUndo() {
    const snapshot = cloneStateForUndo();
    const last = undoStack[undoStack.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(snapshot)) return;
    undoStack.push(snapshot);
    trimUndoStack();
    updateUndoControls();
  }

  function clearUndoStack() {
    undoStack = [];
    dragUndoSnapshot = null;
    updateUndoControls();
  }

  function restoreUndoState(state) {
    truckSelect.value = state.truckId != null ? state.truckId : 'lk_75t_plane';
    if (state.customLength) customLength.value = state.customLength;
    if (state.customWidth) customWidth.value = state.customWidth;
    if (state.customMaxWeight) customMaxWeight.value = state.customMaxWeight;
    items = mapItems(state.items);
    trailerItems = mapItems(state.trailerItems);
    colorIndex = state.colorIndex || 0;
    selectedId = state.selectedId ?? null;
    currentPlanLpnValue = state.planLpnValue ?? null;
    if (selectedId && !findItemById(selectedId)) selectedId = null;
    migrateAnhaengerItems(getTruck());
    clampAllItems();
  }

  function undoLastStep() {
    if (!undoStack.length) return false;
    restoreUndoState(undoStack.pop());
    updateUndoControls();
    updateUI();
    draw();
    scheduleSave();
    return true;
  }

  function armWeightUndo() {
    weightUndoArmed = true;
  }

  function commitWeightUndoIfNeeded() {
    if (!weightUndoArmed) return;
    pushUndo();
    weightUndoArmed = false;
  }

  function updateUndoControls() {
    const canUndo = undoStack.length > 0;
    const undoBtn = contextMenu.querySelector('[data-action="undo"]');
    const copyBtn = contextMenu.querySelector('[data-action="copy"]');
    const deleteBtn = contextMenu.querySelector('[data-action="delete"]');
    if (undoBtn) {
      undoBtn.disabled = !canUndo;
      undoBtn.textContent = 'Rückgängig';
    }
    if (btnUndo) btnUndo.disabled = !canUndo;
    if (copyBtn) copyBtn.disabled = !contextMenuItemId;
    if (deleteBtn) deleteBtn.disabled = !contextMenuItemId;
    const beladenBtn = contextMenu.querySelector('[data-action="beladen"]');
    if (beladenBtn) beladenBtn.disabled = !contextMenuItemId;
    if (contextMenuWeightInput) contextMenuWeightInput.disabled = !contextMenuItemId;
  }

  function updateContextMenuButtons() {
    updateUndoControls();
  }

  function saveToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
    } catch {
      /* Speicher voll oder blockiert */
    }
  }

  function applyState(state) {
    if (!state || state.version !== 1) return false;
    truckSelect.value = state.truckId != null ? state.truckId : 'lk_75t_plane';
    if (state.customLength) customLength.value = state.customLength;
    if (state.customWidth) customWidth.value = state.customWidth;
    if (state.customMaxWeight) customMaxWeight.value = state.customMaxWeight;
    items = mapItems(state.items);
    trailerItems = mapItems(state.trailerItems);
    colorIndex = state.colorIndex || 0;
    selectedId = null;
    currentPlanLpnValue = state.planLpnValue ?? state.lpnValue ?? null;
    migrateAnhaengerItems(getTruck());
    clampAllItems();
    if (getTruck() && currentPlanLpnValue == null) {
      ensurePlanLpn();
    }
    return true;
  }

  function loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      applyState(JSON.parse(raw));
      clearUndoStack();
    } catch {
      /* ungültiger gespeicherter Stand */
    }
  }

  function getCurrentPlanLpn() {
    if (currentPlanLpnValue == null) return '';
    return formatLpn(currentPlanLpnValue);
  }

  function getCurrentPlanExportLpn() {
    if (currentPlanLpnValue == null) {
      return { lpn: '', lpnValue: null };
    }
    return { lpn: formatLpn(currentPlanLpnValue), lpnValue: currentPlanLpnValue };
  }

  function ensurePlanLpn() {
    if (currentPlanLpnValue != null) return getCurrentPlanExportLpn();
    if (!getTruck()) return null;
    currentPlanLpnValue = getNextLpnValue();
    updatePlanLpnDisplay();
    scheduleSave();
    return getCurrentPlanExportLpn();
  }

  function clearCurrentPlanLpn() {
    currentPlanLpnValue = null;
    updatePlanLpnDisplay();
  }

  function updatePlanLpnDisplay() {
    const lpn = getCurrentPlanLpn();
    const display = document.getElementById('plan-lpn-display');
    if (!display) return;
    if (lpn) {
      display.textContent = lpn;
      display.hidden = false;
    } else {
      display.textContent = '';
      display.hidden = true;
    }
  }

  async function exportJson() {
    return savePlanExport('json', 'all');
  }

  async function exportCompletedPlanJson() {
    return savePlanExport('json', 'all', null, { completed: true });
  }

  function hasActivePlanForCompletion() {
    return Boolean(getTruck()) && (items.length > 0 || trailerItems.length > 0);
  }

  function resetPlanAfterCompletion() {
    items = [];
    trailerItems = [];
    selectedId = null;
    colorIndex = 0;
    truckSelect.value = '';
    clearCurrentPlanLpn();
    clearUndoStack();
    updateUI();
    draw();
    saveToLocalStorage();
  }

  const COMPLETE_PLAN_FORMAT_LABELS = {
    pdf: 'PDF',
    excel: 'Excel',
    json: 'JSON',
  };

  let savePlanDialogOptions = {
    mode: 'all',
    exportLpn: null,
    completed: false,
    onComplete: null,
  };

  let completePlanSelectedFormat = null;
  let completePlanConfirmWithReprint = false;
  let completePlanExportPreviewActive = false;

  function getSelectedCompletePlanMode() {
    const selected = document.querySelector('input[name="complete-plan-mode"]:checked');
    return selected?.value || 'all';
  }

  function getSelectedCompletePlanPreviewFormat() {
    const selected = document.querySelector('input[name="complete-plan-preview-format"]:checked');
    return selected?.value === 'png' ? 'png' : 'pdf';
  }

  function updateCompletePlanPreviewButton() {
    const button = document.getElementById('complete-plan-btn-preview');
    if (!button) return;
    button.textContent = completePlanExportPreviewActive ? 'Vorschau beenden' : 'Vorschau';
    button.setAttribute('aria-pressed', completePlanExportPreviewActive ? 'true' : 'false');
  }

  function resetCompletePlanExportPreviewState() {
    completePlanExportPreviewActive = false;
    updateCompletePlanPreviewButton();
    const content = document.getElementById('complete-plan-preview-content');
    if (content) content.innerHTML = '';
  }

  function previewCompletePlanExport() {
    ensurePlanLpn();
    const content = document.getElementById('complete-plan-preview-content');
    if (!content) return;

    const mode = getSelectedCompletePlanMode();
    const format = getSelectedCompletePlanPreviewFormat();
    const exportData = getListExportData(mode);
    if (!exportData.pages.length) {
      content.innerHTML = '<p class="cargo-list-empty">Kein Ladeplan zum Anzeigen vorhanden.</p>';
      return;
    }

    const title = escapeXml(getCargoListTitle(mode));

    if (format === 'png') {
      const canvas = buildCombinedExportCanvasFromPages(exportData.pages);
      const dataUrl = canvas.toDataURL('image/png');
      content.innerHTML = `<img class="cargo-export-preview-img cargo-export-preview-png" src="${dataUrl}" alt="Vorschau ${title}">`;
      return;
    }

    const pagesHtml = exportData.pages.map((page, index) => {
      const dataUrl = page.canvas.toDataURL('image/png');
      const typeClass = page.type === 'list'
        ? 'cargo-export-preview-page-list'
        : 'cargo-export-preview-page-plan';
      return `
        <figure class="cargo-export-preview-page ${typeClass}">
          <img src="${dataUrl}" alt="Vorschau ${title} – Seite ${index + 1}">
        </figure>
      `;
    }).join('');

    content.innerHTML = `<div class="cargo-export-preview-pdf">${pagesHtml}</div>`;
  }

  function endCompletePlanExportPreview() {
    completePlanExportPreviewActive = false;
    updateCompletePlanPreviewButton();
    const content = document.getElementById('complete-plan-preview-content');
    if (content) content.innerHTML = '';
  }

  function startCompletePlanExportPreview() {
    completePlanExportPreviewActive = true;
    updateCompletePlanPreviewButton();
    previewCompletePlanExport();
  }

  function toggleCompletePlanExportPreview() {
    if (completePlanExportPreviewActive) {
      endCompletePlanExportPreview();
      return;
    }
    startCompletePlanExportPreview();
  }

  function refreshCompletePlanDialogContent() {
    if (completePlanExportPreviewActive) {
      previewCompletePlanExport();
    }
  }

  async function executeCompletePlanExport(action, { completed = false } = {}) {
    if (!hasActivePlanForCompletion()) {
      alert('Bitte Fahrzeug wählen und Ladegut platzieren, bevor der Ladeplan exportiert wird.');
      return false;
    }

    ensurePlanLpn();
    const exportLpn = getCurrentPlanExportLpn();
    const mode = getSelectedCompletePlanMode();

    if (action === 'pdf') return printPlanPdf(mode, exportLpn);
    if (action === 'excel') return printPlanExcel(mode, exportLpn);
    if (action === 'json') {
      openSavePlanDialog({ mode, exportLpn, completed });
      return true;
    }

    return false;
  }

  function getCompletePlanFormatLabel(action) {
    return COMPLETE_PLAN_FORMAT_LABELS[action] || action;
  }

  function showCompletePlanStep(step) {
    document.getElementById('complete-plan-step-formats')?.classList.toggle('hidden', step !== 'formats');
    document.getElementById('complete-plan-step-followup')?.classList.toggle('hidden', step !== 'followup');
    document.getElementById('complete-plan-step-reprint-choice')?.classList.toggle('hidden', step !== 'reprint-choice');
    document.getElementById('complete-plan-step-reprint-print')?.classList.toggle('hidden', step !== 'reprint-print');
    document.getElementById('complete-plan-step-confirm')?.classList.toggle('hidden', step !== 'confirm');
  }

  function resetCompletePlanDialogState() {
    completePlanSelectedFormat = null;
    completePlanConfirmWithReprint = false;
    resetCompletePlanExportPreviewState();
    showCompletePlanStep('formats');
  }

  function updateCompletePlanFollowupText() {
    const textEl = document.getElementById('complete-plan-followup-text');
    if (!textEl) return;
    if (completePlanSelectedFormat) {
      const formatLabel = getCompletePlanFormatLabel(completePlanSelectedFormat);
      textEl.textContent = `Der Ladeplan wurde als ${formatLabel} exportiert. Soll der Ladeplan jetzt abgeschlossen werden?`;
      return;
    }
    textEl.textContent = 'Soll der Ladeplan jetzt abgeschlossen werden?';
  }

  function openCompletePlanDialogAtFollowup() {
    if (!hasActivePlanForCompletion()) {
      alert('Bitte Fahrzeug wählen und Ladegut platzieren, bevor der Ladeplan abgeschlossen wird.');
      return;
    }
    const dialog = document.getElementById('complete-plan-dialog');
    if (!dialog) return;

    completePlanSelectedFormat = null;
    completePlanConfirmWithReprint = false;
    resetCompletePlanExportPreviewState();
    updateCompletePlanFollowupText();
    showCompletePlanStep('followup');
    dialog.classList.remove('hidden');
  }

  function updateCompletePlanConfirmText() {
    const textEl = document.getElementById('complete-plan-confirm-text');
    if (!textEl) return;

    const formatLabel = completePlanSelectedFormat
      ? getCompletePlanFormatLabel(completePlanSelectedFormat)
      : 'Export';

    if (completePlanConfirmWithReprint) {
      textEl.textContent = `Achtung: Der Ladeplan wird erneut als ${formatLabel} exportiert und anschließend abgeschlossen. Nach dem Abschließen steht der aktuelle Ladeplan nicht mehr zur Verfügung, sofern er nicht gespeichert wurde. Ladegut, Fahrzeug und LPN werden zurückgesetzt.`;
      return;
    }

    textEl.textContent = 'Achtung: Nach dem Abschließen steht der aktuelle Ladeplan nicht mehr zur Verfügung, sofern er nicht gespeichert wurde. Ladegut, Fahrzeug und LPN werden zurückgesetzt.';
  }

  async function handleCompletePlanFormatSelection(action) {
    if (!await executeCompletePlanExport(action)) return;

    completePlanSelectedFormat = action;
    updateCompletePlanFollowupText();
    showCompletePlanStep('followup');
  }

  function handleCompletePlanReprint() {
    if (!completePlanSelectedFormat) {
      showCompletePlanStep('formats');
      return;
    }
    showCompletePlanStep('reprint-choice');
  }

  function openSavePlanDialog(options = {}) {
    const dialog = document.getElementById('save-plan-dialog');
    if (!dialog) return;

    savePlanDialogOptions = {
      mode: 'all',
      exportLpn: null,
      completed: false,
      onComplete: null,
      ...options,
    };
    dialog.classList.remove('hidden');
  }

  function closeSavePlanDialog() {
    const dialog = document.getElementById('save-plan-dialog');
    if (!dialog) return;
    dialog.classList.add('hidden');
  }

  async function handleSavePlanFormatSelection(format) {
    const { mode, exportLpn, completed, onComplete } = savePlanDialogOptions;
    closeSavePlanDialog();
    const saved = await savePlanExport(format, mode, exportLpn, { completed });
    if (saved && typeof onComplete === 'function') {
      onComplete(format);
    }
    return saved;
  }

  function initSavePlanDialog() {
    const dialog = document.getElementById('save-plan-dialog');
    if (!dialog) return;

    document.getElementById('save-plan-dialog-backdrop')?.addEventListener('click', closeSavePlanDialog);
    document.getElementById('save-plan-btn-cancel')?.addEventListener('click', closeSavePlanDialog);
    document.getElementById('save-plan-btn-pdf')?.addEventListener('click', () => { handleSavePlanFormatSelection('pdf'); });
    document.getElementById('save-plan-btn-excel')?.addEventListener('click', () => { handleSavePlanFormatSelection('excel'); });
    document.getElementById('save-plan-btn-json')?.addEventListener('click', () => { handleSavePlanFormatSelection('json'); });

    dialog.addEventListener('keydown', (event) => {
      if (dialog.classList.contains('hidden')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSavePlanDialog();
      }
    });
  }

  function openCompletePlanSaveDialog() {
    if (!hasActivePlanForCompletion()) {
      alert('Bitte Fahrzeug wählen und Ladegut platzieren, bevor der Ladeplan gespeichert wird.');
      return;
    }

    ensurePlanLpn();
    openSavePlanDialog({
      mode: getSelectedCompletePlanMode(),
      exportLpn: getCurrentPlanExportLpn(),
      onComplete: (format) => {
        completePlanSelectedFormat = format;
        updateCompletePlanFollowupText();
        showCompletePlanStep('followup');
      },
    });
  }

  function handleCompletePlanReprintSaveOnly() {
    ensurePlanLpn();
    openSavePlanDialog({
      mode: getSelectedCompletePlanMode(),
      exportLpn: getCurrentPlanExportLpn(),
      onComplete: (format) => {
        completePlanSelectedFormat = format;
        updateCompletePlanFollowupText();
        showCompletePlanStep('followup');
      },
    });
  }

  function handleCompletePlanReprintPrintOnly() {
    showCompletePlanStep('reprint-print');
  }

  async function handleCompletePlanReprintPrintFormat(action) {
    if (!await executeCompletePlanExport(action)) return;
    completePlanSelectedFormat = action;
    updateCompletePlanFollowupText();
    showCompletePlanStep('followup');
  }

  function handleCompletePlanOtherFormat() {
    showCompletePlanStep('formats');
  }

  function handleCompletePlanContinueWorking() {
    closeCompletePlanDialog();
  }

  function openCompletePlanConfirmDialog(withReprint) {
    completePlanConfirmWithReprint = withReprint;
    updateCompletePlanConfirmText();
    showCompletePlanStep('confirm');
  }

  async function finalizePlanCompletion() {
    if (completePlanConfirmWithReprint && completePlanSelectedFormat) {
      const mode = getSelectedCompletePlanMode();
      const exportLpn = getCurrentPlanExportLpn();
      const format = completePlanSelectedFormat;
      if (format === 'pdf') {
        printPlanPdf(mode, exportLpn);
      } else if (format === 'excel') {
        printPlanExcel(mode, exportLpn);
      } else {
        await savePlanExport(format, mode, exportLpn, { completed: true });
      }
    }

    resetPlanAfterCompletion();
    closeCompletePlanDialog();
  }

  function openCanvasPrintDialog() {
    const dialog = document.getElementById('canvas-print-dialog');
    if (!dialog) return;
    dialog.classList.remove('hidden');
  }

  function closeCanvasPrintDialog() {
    const dialog = document.getElementById('canvas-print-dialog');
    if (!dialog) return;
    dialog.classList.add('hidden');
  }

  function handleCanvasPrintPdf() {
    if (printPlanPdf('all')) closeCanvasPrintDialog();
  }

  function handleCanvasPrintExcel() {
    if (printPlanExcel('all')) closeCanvasPrintDialog();
  }

  function handleCanvasPrintSave() {
    closeCanvasPrintDialog();
    openSavePlanDialog();
  }

  function focusCompletePlanButton() {
    openCompletePlanDialogAtFollowup();
  }

  function initCanvasPrintDialog() {
    const dialog = document.getElementById('canvas-print-dialog');
    if (!dialog) return;

    document.getElementById('btn-canvas-export')?.addEventListener('click', openCanvasPrintDialog);
    document.getElementById('btn-canvas-complete-hint')?.addEventListener('click', focusCompletePlanButton);
    document.getElementById('canvas-print-dialog-backdrop')?.addEventListener('click', closeCanvasPrintDialog);
    document.getElementById('canvas-print-btn-cancel')?.addEventListener('click', closeCanvasPrintDialog);
    document.getElementById('canvas-print-btn-pdf')?.addEventListener('click', handleCanvasPrintPdf);
    document.getElementById('canvas-print-btn-excel')?.addEventListener('click', handleCanvasPrintExcel);
    document.getElementById('canvas-print-btn-save')?.addEventListener('click', handleCanvasPrintSave);

    dialog.addEventListener('keydown', (event) => {
      if (dialog.classList.contains('hidden')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCanvasPrintDialog();
      }
    });
  }

  function openCompletePlanDialog() {
    openCompletePlanDialogAtFollowup();
  }

  function closeCompletePlanDialog() {
    const dialog = document.getElementById('complete-plan-dialog');
    if (!dialog) return;
    dialog.classList.add('hidden');
    resetCompletePlanDialogState();
  }

  function initCompletePlanDialog() {
    const dialog = document.getElementById('complete-plan-dialog');
    if (!dialog) return;

    document.getElementById('btn-print-complete')?.addEventListener('click', openCompletePlanDialog);
    document.getElementById('complete-plan-dialog-backdrop')?.addEventListener('click', closeCompletePlanDialog);
    document.getElementById('complete-plan-btn-cancel')?.addEventListener('click', closeCompletePlanDialog);
    document.getElementById('complete-plan-btn-preview')?.addEventListener('click', toggleCompletePlanExportPreview);
    document.getElementById('complete-plan-btn-pdf')?.addEventListener('click', () => handleCompletePlanFormatSelection('pdf'));
    document.getElementById('complete-plan-btn-excel')?.addEventListener('click', () => handleCompletePlanFormatSelection('excel'));
    document.getElementById('complete-plan-btn-save')?.addEventListener('click', openCompletePlanSaveDialog);
    document.getElementById('complete-plan-btn-print-and-complete')?.addEventListener('click', () => openCompletePlanConfirmDialog(true));
    document.getElementById('complete-plan-btn-complete-only')?.addEventListener('click', () => openCompletePlanConfirmDialog(false));
    document.getElementById('complete-plan-btn-reprint')?.addEventListener('click', handleCompletePlanReprint);
    document.getElementById('complete-plan-btn-reprint-print-only')?.addEventListener('click', handleCompletePlanReprintPrintOnly);
    document.getElementById('complete-plan-btn-reprint-save-only')?.addEventListener('click', handleCompletePlanReprintSaveOnly);
    document.getElementById('complete-plan-btn-reprint-choice-back')?.addEventListener('click', () => showCompletePlanStep('followup'));
    document.getElementById('complete-plan-btn-reprint-pdf')?.addEventListener('click', () => handleCompletePlanReprintPrintFormat('pdf'));
    document.getElementById('complete-plan-btn-reprint-excel')?.addEventListener('click', () => handleCompletePlanReprintPrintFormat('excel'));
    document.getElementById('complete-plan-btn-reprint-print-back')?.addEventListener('click', () => showCompletePlanStep('reprint-choice'));
    document.getElementById('complete-plan-btn-other-format')?.addEventListener('click', handleCompletePlanOtherFormat);
    document.getElementById('complete-plan-btn-continue')?.addEventListener('click', handleCompletePlanContinueWorking);
    document.getElementById('complete-plan-btn-confirm-yes')?.addEventListener('click', finalizePlanCompletion);
    document.getElementById('complete-plan-btn-confirm-no')?.addEventListener('click', () => showCompletePlanStep('followup'));

    dialog.querySelectorAll('input[name="complete-plan-mode"]').forEach((radio) => {
      radio.addEventListener('change', refreshCompletePlanDialogContent);
    });
    dialog.querySelectorAll('input[name="complete-plan-preview-format"]').forEach((radio) => {
      radio.addEventListener('change', refreshCompletePlanDialogContent);
    });

    dialog.addEventListener('keydown', (event) => {
      if (dialog.classList.contains('hidden')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        const confirmStep = document.getElementById('complete-plan-step-confirm');
        const reprintPrintStep = document.getElementById('complete-plan-step-reprint-print');
        const reprintChoiceStep = document.getElementById('complete-plan-step-reprint-choice');
        const followupStep = document.getElementById('complete-plan-step-followup');
        if (confirmStep && !confirmStep.classList.contains('hidden')) {
          showCompletePlanStep('followup');
          return;
        }
        if (reprintPrintStep && !reprintPrintStep.classList.contains('hidden')) {
          showCompletePlanStep('reprint-choice');
          return;
        }
        if (reprintChoiceStep && !reprintChoiceStep.classList.contains('hidden')) {
          showCompletePlanStep('followup');
          return;
        }
        if (followupStep && !followupStep.classList.contains('hidden')) {
          closeCompletePlanDialog();
          return;
        }
        closeCompletePlanDialog();
      }
    });
  }

  function importJsonFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const state = JSON.parse(reader.result);
        if (!applyState(state)) {
          alert('Ungültige Plan-Datei.');
          return;
        }
        clearUndoStack();
        updateUI();
        draw();
        saveToLocalStorage();
      } catch {
        alert('Datei konnte nicht gelesen werden.');
      }
    };
    reader.readAsText(file);
  }

  function getCargoQuantity() {
    const qty = parseInt(document.getElementById('cargo-qty')?.value, 10);
    if (!Number.isFinite(qty) || qty < 1) return 1;
    return Math.min(99, qty);
  }

  function addCargo({ length, width, label, color, weight, quantity = 1, customDimensions = false }) {
    if (!getTruck()) {
      alert('Bitte zuerst ein Fahrzeug wählen.');
      return;
    }
    ensurePlanLpn();
    const qty = Math.max(1, Math.min(99, Math.floor(quantity) || 1));
    pushUndo();
    const truck = getTruck();
    const bed = isAnhaenger(truck) ? 'trailer' : 'truck';
    const dims = getBedDims(truck, bed);
    const list = getItemList(bed);
    const baseLabel = label || '';
    const itemColor = nextColor(color);
    let lastAdded = null;

    for (let i = 0; i < qty; i += 1) {
      let itemLabel = baseLabel;
      if (qty > 1 && baseLabel) {
        itemLabel = `${baseLabel} ${i + 1}`;
      }

      const item = {
        id: uid(),
        length,
        width,
        x: 0,
        y: 0,
        label: itemLabel,
        color: itemColor,
        weight: weight === undefined ? null : weight,
        rotation: 0,
        beladung: [],
        customDimensions: customDimensions || !dimensionsMatchPreset(length, width),
      };

      if (!lastAdded) {
        item.x = snap(Math.max(0, (dims.length - length) / 2));
        item.y = snap(Math.max(0, (dims.width - width) / 2));
      } else {
        const pos = findCopyPosition(lastAdded, bed);
        item.x = pos.x;
        item.y = pos.y;
      }

      clampItem(item, bed);
      list.push(item);
      lastAdded = item;
      selectedId = item.id;
    }

    updateUI();
    draw();
    scheduleSave();
  }

  function deleteSelected() {
    if (!selectedId) return;
    pushUndo();
    const bed = getItemBed(selectedId);
    const list = getItemList(bed);
    const idx = list.findIndex((i) => i.id === selectedId);
    if (idx >= 0) list.splice(idx, 1);
    selectedId = null;
    updateUI();
    draw();
    scheduleSave();
  }

  function deleteItemById(itemId) {
    pushUndo();
    const bed = getItemBed(itemId);
    const list = getItemList(bed);
    const idx = list.findIndex((i) => i.id === itemId);
    if (idx >= 0) list.splice(idx, 1);
    if (selectedId === itemId) selectedId = null;
    updateUI();
    draw();
    scheduleSave();
  }

  function findCopyPosition(source, bed) {
    const truck = getTruck();
    const dims = getBedDims(truck, bed);
    const list = getItemList(bed);
    const step = GRID_M;

    for (let y = 0; y <= dims.width - source.width + EPS; y += step) {
      for (let x = 0; x <= dims.length - source.length + EPS; x += step) {
        const sx = snap(x);
        const sy = snap(y);
        if (Math.abs(sx - source.x) < EPS && Math.abs(sy - source.y) < EPS) continue;
        const candidate = { x: sx, y: sy, length: source.length, width: source.width };
        const overlaps = list.some(
          (item) => item.id !== source.id && rectsOverlap(candidate, item),
        );
        if (!overlaps) return { x: sx, y: sy };
      }
    }

    const offsetX = snap(Math.min(source.x + step, dims.length - source.length));
    const offsetY = snap(Math.min(source.y + step, dims.width - source.width));
    return { x: Math.max(0, offsetX), y: Math.max(0, offsetY) };
  }

  function copyCargo(itemId) {
    const source = findItemById(itemId);
    if (!source) return;
    const bed = getItemBed(itemId);

    pushUndo();
    const { x, y } = findCopyPosition(source, bed);
    const copy = {
      id: uid(),
      length: source.length,
      width: source.width,
      x,
      y,
      label: source.label,
      color: source.color,
      weight: source.weight ?? null,
      rotation: source.rotation || 0,
      beladung: [...getItemBeladung(source)],
      customDimensions: isCustomCargoItem(source),
    };
    clampItem(copy, bed);
    getItemList(bed).push(copy);
    selectedId = copy.id;
    updateUI();
    draw();
    scheduleSave();
  }

  function showContextMenu(clientX, clientY, itemId, options = {}) {
    const { keyboard = false, focusAction = 'beladen' } = options;
    const targetId = itemId || selectedId || null;
    contextMenuItemId = targetId;
    if (targetId) selectedId = targetId;

    contextMenu.classList.remove('hidden');
    if (contextMenuWeightRow) {
      contextMenuWeightRow.classList.toggle('hidden', !targetId);
    }
    if (contextMenuWeightInput && targetId) {
      const item = findItemById(targetId);
      contextMenuWeightInput.value = item?.weight ?? '';
    }

    const menuW = contextMenu.offsetWidth || 160;
    const menuH = contextMenu.offsetHeight || 120;
    const left = Math.min(clientX, window.innerWidth - menuW - 8);
    const top = Math.min(clientY, window.innerHeight - menuH - 8);
    contextMenu.style.left = `${left}px`;
    contextMenu.style.top = `${top}px`;

    updateContextMenuButtons();
    updateContextMenuActionStates(Boolean(targetId));
    updateUI();
    draw();

    requestAnimationFrame(() => {
      if (keyboard && targetId && focusAction === 'beladen') {
        const beladenBtn = contextMenu.querySelector('[data-action="beladen"]');
        if (beladenBtn && !beladenBtn.disabled) {
          beladenBtn.focus();
          return;
        }
      }
      if (targetId && contextMenuWeightInput && !keyboard) {
        contextMenuWeightInput.focus();
        contextMenuWeightInput.select();
        return;
      }
      focusContextMenuItem(0);
    });
  }

  function updateContextMenuActionStates(hasItem) {
    contextMenu.querySelectorAll('[data-action="copy"], [data-action="delete"]').forEach((btn) => {
      btn.disabled = !hasItem;
    });
  }

  function hideContextMenu() {
    contextMenu.classList.add('hidden');
    contextMenuItemId = null;
  }

  function rotateItemById(itemId) {
    const item = findItemById(itemId);
    if (!item) return;
    const bed = getItemBed(item.id);
    pushUndo();
    item.rotation = ((item.rotation || 0) + 90) % 360;
    const prevL = item.length;
    item.length = item.width;
    item.width = prevL;
    clampItem(item, bed);
    selectedId = item.id;
    updateUI();
    draw();
    scheduleSave();
  }

  function rotateSelected() {
    if (!selectedId) return;
    rotateItemById(selectedId);
  }

  function clearAll() {
    if ((items.length || trailerItems.length) && !confirm('Alle Ladegüter wirklich entfernen?')) return;
    pushUndo();
    items = [];
    trailerItems = [];
    selectedId = null;
    updateUI();
    draw();
    scheduleSave();
  }

  function computeLayoutForBed(bedDims) {
    return {
      w: Math.round(bedDims.length * pixelsPerMeter + PADDING * 2),
      h: Math.round(bedDims.width * pixelsPerMeter + PADDING * 2 + 36),
    };
  }

  function computeLayout() {
    const truck = getTruck();
    pixelsPerMeter = PIXELS_PER_METER;
    const bed = isAnhaenger(truck) ? getBedDims(truck, 'truck') : { length: truck.length, width: truck.width };
    return { ...computeLayoutForBed(bed), truck };
  }

  function mToPx(m) {
    return m * pixelsPerMeter;
  }

  function pxToM(px) {
    return px / pixelsPerMeter;
  }

  function bedOrigin() {
    return { x: PADDING, y: PADDING + 28 };
  }

  function hitTest(mx, my, bedItems) {
    const origin = bedOrigin();
    for (let i = bedItems.length - 1; i >= 0; i -= 1) {
      const item = bedItems[i];
      const x = origin.x + mToPx(item.x);
      const y = origin.y + mToPx(item.y);
      const w = mToPx(item.length);
      const h = mToPx(item.width);
      if (mx >= x && mx <= x + w && my >= y && my <= y + h) return item;
    }
    return null;
  }

  function getItemCanvasRect(item, origin = bedOrigin()) {
    return {
      x: origin.x + mToPx(item.x),
      y: origin.y + mToPx(item.y),
      w: mToPx(item.length),
      h: mToPx(item.width),
    };
  }

  function getRotateHandleMetrics(x, y, w, h) {
    let radius = Math.max(
      ROTATE_HANDLE_MIN_R,
      Math.min(ROTATE_HANDLE_MAX_R, Math.min(w, h) * 0.154),
    );
    const maxFitRadius = Math.max(3, Math.min(w, h) / 2 - 0.5);
    radius = Math.min(radius, maxFitRadius);
    const innerInset = Math.min(Math.min(w, h) * 0.05, Math.max(0, Math.min(w, h) / 2 - radius - 0.5));
    return {
      cx: x + w - radius - innerInset,
      cy: y + radius + innerInset,
      radius,
    };
  }

  function hitTestRotateHandle(mx, my, bedItems) {
    const origin = bedOrigin();
    for (let i = bedItems.length - 1; i >= 0; i -= 1) {
      const item = bedItems[i];
      const { x, y, w, h } = getItemCanvasRect(item, origin);
      const { cx, cy, radius } = getRotateHandleMetrics(x, y, w, h);
      const dx = mx - cx;
      const dy = my - cy;
      if (dx * dx + dy * dy <= radius * radius) return item;
    }
    return null;
  }

  function drawItemRotateHandle(targetCtx, x, y, w, h) {
    const { cx, cy, radius } = getRotateHandleMetrics(x, y, w, h);

    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    targetCtx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    targetCtx.fill();
    targetCtx.strokeStyle = '#0f172a';
    targetCtx.lineWidth = 1.25;
    targetCtx.stroke();

    targetCtx.translate(cx, cy);
    targetCtx.strokeStyle = '#0f172a';
    targetCtx.fillStyle = '#0f172a';
    targetCtx.lineWidth = 1.25;
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';

    const arcR = radius * 0.52;
    const start = Math.PI * 0.85;
    const end = Math.PI * 2.35;
    targetCtx.beginPath();
    targetCtx.arc(0, 0, arcR, start, end);
    targetCtx.stroke();

    const tipX = Math.cos(end) * arcR;
    const tipY = Math.sin(end) * arcR;
    const tangent = end + Math.PI / 2;
    targetCtx.beginPath();
    targetCtx.moveTo(tipX, tipY);
    targetCtx.lineTo(tipX - Math.cos(tangent) * 3.5 - Math.sin(tangent) * 2, tipY - Math.sin(tangent) * 3.5 + Math.cos(tangent) * 2);
    targetCtx.lineTo(tipX + Math.sin(tangent) * 2.5, tipY - Math.cos(tangent) * 2.5);
    targetCtx.closePath();
    targetCtx.fill();
    targetCtx.restore();
  }

  function drawGridOn(truck, origin, targetCtx) {
    if (!document.getElementById('show-grid').checked) return;
    targetCtx.save();
    targetCtx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    targetCtx.lineWidth = 1;
    for (let x = 0; x <= truck.length; x += GRID_M) {
      const px = origin.x + mToPx(x);
      targetCtx.beginPath();
      targetCtx.moveTo(px, origin.y);
      targetCtx.lineTo(px, origin.y + mToPx(truck.width));
      targetCtx.stroke();
    }
    for (let y = 0; y <= truck.width; y += GRID_M) {
      const py = origin.y + mToPx(y);
      targetCtx.beginPath();
      targetCtx.moveTo(origin.x, py);
      targetCtx.lineTo(origin.x + mToPx(truck.length), py);
      targetCtx.stroke();
    }
    targetCtx.restore();
  }

  function drawRulerOn(truck, origin, targetCtx) {
    targetCtx.save();
    targetCtx.fillStyle = '#94a3b8';
    targetCtx.font = '11px Segoe UI, sans-serif';
    targetCtx.textAlign = 'center';
    for (let m = 0; m <= Math.floor(truck.length); m += 1) {
      const px = origin.x + mToPx(m);
      targetCtx.fillText(`${m} m`, px, origin.y - 10);
      targetCtx.strokeStyle = '#475569';
      targetCtx.beginPath();
      targetCtx.moveTo(px, origin.y - 4);
      targetCtx.lineTo(px, origin.y);
      targetCtx.stroke();
    }
    targetCtx.textAlign = 'right';
    for (let m = 0; m <= Math.floor(truck.width); m += 1) {
      const py = origin.y + mToPx(m);
      targetCtx.fillText(`${m}`, origin.x - 8, py + 4);
    }
    targetCtx.restore();
  }

  function drawTruckBedOn(truck, origin, targetCtx, title, highlight) {
    const w = mToPx(truck.length);
    const h = mToPx(truck.width);

    targetCtx.fillStyle = '#1e293b';
    targetCtx.fillRect(origin.x, origin.y, w, h);

    targetCtx.strokeStyle = highlight ? '#38bdf8' : '#64748b';
    targetCtx.lineWidth = highlight ? 2.5 : 2;
    targetCtx.strokeRect(origin.x, origin.y, w, h);

    targetCtx.save();
    targetCtx.strokeStyle = highlight ? '#fbbf24' : '#94a3b8';
    targetCtx.lineWidth = highlight ? 3 : 2;
    targetCtx.setLineDash([6, 4]);
    targetCtx.beginPath();
    targetCtx.moveTo(origin.x, origin.y);
    targetCtx.lineTo(origin.x, origin.y + h);
    targetCtx.stroke();
    targetCtx.setLineDash([]);
    targetCtx.fillStyle = highlight ? '#fde68a' : '#cbd5e1';
    targetCtx.font = '10px Segoe UI, sans-serif';
    targetCtx.textAlign = 'left';
    targetCtx.fillText('Stirnwand', origin.x + 4, origin.y + h - 6);
    targetCtx.restore();

    targetCtx.fillStyle = '#475569';
    targetCtx.font = 'bold 12px Segoe UI, sans-serif';
    targetCtx.textAlign = 'left';
    targetCtx.fillText(title, origin.x + 8, origin.y + 18);

    targetCtx.textAlign = 'right';
    targetCtx.fillText(`${truck.length.toFixed(2)} × ${truck.width.toFixed(2)} m`, origin.x + w - 8, origin.y + 18);
  }

  function isSquareCargo(length, width) {
    return Math.abs(length - width) < EPS;
  }

  function isVerticalCargo(length, width) {
    if (isSquareCargo(length, width)) return false;
    return width > length;
  }

  function getCargoLabelRotationRad(length, width) {
    return isVerticalCargo(length, width) ? -Math.PI / 2 : 0;
  }

  function getItemDimLine(item) {
    return item.weight != null
      ? `${item.length.toFixed(2)} × ${item.width.toFixed(2)} m · ${item.weight} kg`
      : `${item.length.toFixed(2)} × ${item.width.toFixed(2)} m`;
  }

  function labelFitsInItem(targetCtx, label, dimLine, w, h, showDims) {
    const pad = 6;
    targetCtx.font = 'bold 11px Segoe UI, sans-serif';
    const labelW = targetCtx.measureText(label).width;
    const labelH = 11;
    let dimW = 0;
    let dimH = 0;
    if (showDims) {
      targetCtx.font = '10px Segoe UI, sans-serif';
      dimW = targetCtx.measureText(dimLine).width;
      dimH = 10;
    }
    const totalW = Math.max(labelW, dimW);
    const totalH = showDims ? labelH + dimH + 4 : labelH;
    const vertical = h > w && Math.abs(w - h) >= 2;
    const availW = vertical ? h : w;
    const availH = vertical ? w : h;
    return totalW <= availW - pad && totalH <= availH - pad;
  }

  function drawItemLabel(targetCtx, item, x, y, w, h, showDims) {
    const label = item.label || `${item.length.toFixed(2)}×${item.width.toFixed(2)}`;
    const dimLine = showDims ? getItemDimLine(item) : '';
    const fits = labelFitsInItem(targetCtx, label, dimLine, w, h, showDims);
    if (!fits && hoveredItemId !== item.id) return;

    const labelRot = getCargoLabelRotationRad(item.length, item.width);
    targetCtx.save();
    targetCtx.translate(x + w / 2, y + h / 2);
    targetCtx.rotate(labelRot);
    targetCtx.fillStyle = '#fff';
    targetCtx.font = 'bold 11px Segoe UI, sans-serif';
    targetCtx.textAlign = 'center';
    targetCtx.textBaseline = 'middle';
    targetCtx.fillText(label, 0, showDims ? -6 : 0);
    if (showDims) {
      targetCtx.font = '10px Segoe UI, sans-serif';
      targetCtx.fillStyle = 'rgba(255,255,255,0.85)';
      targetCtx.fillText(dimLine, 0, 8);
    }
    targetCtx.restore();
  }

  function drawItemsOn(origin, bedItems, collidingIds, targetCtx) {
    const showDims = document.getElementById('show-dimensions').checked;
    bedItems.forEach((item) => {
      const x = origin.x + mToPx(item.x);
      const y = origin.y + mToPx(item.y);
      const w = mToPx(item.length);
      const h = mToPx(item.width);
      const isSelected = item.id === selectedId;
      const isColliding = collidingIds.has(item.id);

      fillCargoItemRect(targetCtx, item, x, y, w, h, isSelected ? 0.87 : 0.6);

      targetCtx.strokeStyle = getCargoItemStrokeColor(item, isSelected, isColliding);
      targetCtx.lineWidth = isColliding ? (isSelected ? 4 : 3) : (isSelected ? 3 : 1.5);
      targetCtx.strokeRect(x, y, w, h);
      drawItemLabel(targetCtx, item, x, y, w, h, showDims);
      drawItemRotateHandle(targetCtx, x, y, w, h);
    });
  }

  function findHoveredItemId(clientX, clientY) {
    const truck = getTruck();
    const beds = isAnhaenger(truck)
      ? [{ bed: 'trailer', el: trailerCanvas }, { bed: 'truck', el: canvas }]
      : [{ bed: 'truck', el: canvas }];

    for (const { bed, el } of beds) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        continue;
      }
      const coords = canvasCoordsOn({ clientX, clientY }, el);
      const hit = hitTest(coords.x, coords.y, getItemList(bed));
      if (hit) return hit.id;
    }
    return null;
  }

  function updateCanvasCursor(clientX, clientY, targetCanvas, bedItems) {
    if (!targetCanvas) return;
    const { x, y } = canvasCoordsOn({ clientX, clientY }, targetCanvas);
    targetCanvas.style.cursor = hitTestRotateHandle(x, y, bedItems) ? 'pointer' : '';
  }

  function updateHoveredItem(clientX, clientY) {
    const nextId = findHoveredItemId(clientX, clientY);
    if (nextId === hoveredItemId) return;
    hoveredItemId = nextId;
    draw();
  }

  function clearHoveredItem() {
    if (!hoveredItemId) return;
    hoveredItemId = null;
    draw();
  }

  function paintLoadCanvas(targetCanvas, targetCtx, bedDims, bedItems, title, highlight) {
    if (!targetCanvas || !targetCtx) return getCollidingIdsFor(bedItems);
    const layout = computeLayoutForBed(bedDims);
    targetCanvas.width = layout.w;
    targetCanvas.height = layout.h;
    targetCtx.fillStyle = '#111827';
    targetCtx.fillRect(0, 0, layout.w, layout.h);
    const origin = bedOrigin();
    const collidingIds = getCollidingIdsFor(bedItems);
    drawTruckBedOn(bedDims, origin, targetCtx, title, highlight);
    drawGridOn(bedDims, origin, targetCtx);
    drawRulerOn(bedDims, origin, targetCtx);
    drawItemsOn(origin, bedItems, collidingIds, targetCtx);
    return collidingIds;
  }

  function renderBarRow(label, used, total, unit) {
    const pct = total > 0 ? (used / total) * 100 : 0;
    const displayPct = pct.toFixed(1);
    const barWidth = Math.min(100, pct);
    const over = pct >= 101;
    const title = unit === 'kg'
      ? `${used.toLocaleString('de-DE')} / ${total.toLocaleString('de-DE')} kg`
      : `${used.toFixed(2)} / ${total.toFixed(2)} m²`;
    return `
      <div class="usage-bar-row">
        <span class="usage-bar-label">${label}</span>
        <div class="usage-bar-track" title="${title}">
          <div class="usage-bar-fill${over ? ' usage-bar-fill-over' : ''}" style="width: ${barWidth}%"></div>
        </div>
        <span class="usage-bar-value${over ? ' usage-bar-value-over' : ''}">${displayPct}%</span>
      </div>
    `;
  }

  function updateUsageBarChart(truck, mainBed) {
    if (!usageBarChart) return;
    mainBed = mainBed || getBedDims(truck, 'truck');
    const usedMain = items.reduce((sum, i) => sum + i.length * i.width, 0);
    const totalMain = mainBed.length * mainBed.width;
    if (isAnhaenger(truck)) {
      const trailerBed = getBedDims(truck, 'trailer');
      const usedTrailer = trailerItems.reduce((sum, i) => sum + i.length * i.width, 0);
      const totalTrailer = trailerBed.length * trailerBed.width;
      usageBarChart.innerHTML = [
        renderBarRow('Zugfahrzeug', usedMain, totalMain, 'm²'),
        renderBarRow('Anhänger', usedTrailer, totalTrailer, 'm²'),
      ].join('');
    } else {
      usageBarChart.innerHTML = renderBarRow('Ladeboden · m²', usedMain, totalMain, 'm²');
    }
  }

  function updateWeightBarChart(truck) {
    if (!weightBarChart) return;
    const used = getTotalWeight();
    const total = truck.maxWeight || 0;
    weightBarChart.innerHTML = renderBarRow('Gesamt · kg', used, total, 'kg');
  }

  function draw() {
    const truck = getTruck();
    if (!truck) {
      if (canvas && ctx) {
        canvas.width = 480;
        canvas.height = 140;
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Segoe UI, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Bitte Fahrzeug wählen', canvas.width / 2, canvas.height / 2);
      }
      if (anhaengerPlanSection) anhaengerPlanSection.classList.add('hidden');
      if (scaleInfo) scaleInfo.textContent = '';
      if (anhaengerScaleInfo) anhaengerScaleInfo.textContent = '';
      if (usageBarChart) usageBarChart.innerHTML = '';
      if (weightBarChart) weightBarChart.innerHTML = '';
      updateVehiclePhoto(null);
      updateTruckInfo();
      return;
    }

    const anhaenger = isAnhaenger(truck);
    const mainBed = getBedDims(truck, 'truck');
    const mainTitle = anhaenger ? 'Zugfahrzeug (Draufsicht)' : 'Ladeboden (Draufsicht)';

    if (anhaengerPlanSection) {
      anhaengerPlanSection.classList.toggle('hidden', !anhaenger);
    }

    paintLoadCanvas(canvas, ctx, mainBed, items, mainTitle, false);

    let collidingIds = getCollidingIds();
    if (anhaenger && trailerCtx) {
      const trailerBed = getBedDims(truck, 'trailer');
      paintLoadCanvas(
        trailerCanvas,
        trailerCtx,
        trailerBed,
        trailerItems,
        'Anhänger (Draufsicht)',
        true,
      );
      collidingIds = getCollidingIds();
      if (anhaengerScaleInfo) {
        anhaengerScaleInfo.textContent = `Maßstab Anhänger: 1 m = ${pixelsPerMeter.toFixed(0)} px · ${trailerBed.length.toFixed(2)} × ${trailerBed.width.toFixed(2)} m`;
      }
    }

    scaleInfo.textContent = anhaenger
      ? `Maßstab Zugfahrzeug: 1 m = ${pixelsPerMeter.toFixed(0)} px · ${mainBed.length.toFixed(2)} × ${mainBed.width.toFixed(2)} m`
      : `Maßstab: 1 m = ${pixelsPerMeter.toFixed(0)} px`;

    updateUsage(truck, mainBed);
    updateStats(truck, collidingIds);
    updateVehiclePhoto(truck);
  }

  function resizeVehiclePhoto() {
    if (!vehiclePhoto || !vehiclePhoto.naturalWidth) return;
    const panel = document.getElementById('vehicle-photo-panel');
    const available = panel ? Math.max(100, panel.clientWidth - 32) : VEHICLE_PHOTO_MAX_W;
    const maxW = Math.min(VEHICLE_PHOTO_MAX_W, available);
    let w = vehiclePhoto.naturalWidth;
    let h = vehiclePhoto.naturalHeight;
    if (w > maxW) {
      const scale = maxW / w;
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const size = w + 'px';
    const sizeH = h + 'px';
    vehiclePhoto.style.width = size;
    vehiclePhoto.style.height = sizeH;
    if (vehiclePhotoFrame) {
      vehiclePhotoFrame.style.width = size;
      vehiclePhotoFrame.style.height = sizeH;
    }
  }

  function updateVehiclePhoto(truck) {
    if (!vehiclePhoto) return;
    if (!truck) {
      vehiclePhoto.removeAttribute('src');
      vehiclePhoto.alt = '';
      vehiclePhoto.style.width = '0';
      vehiclePhoto.style.height = '0';
      if (vehiclePhotoFrame) {
        vehiclePhotoFrame.style.width = '0';
        vehiclePhotoFrame.style.height = '0';
      }
      if (vehiclePhotoCaption) vehiclePhotoCaption.textContent = '';
      return;
    }
    const src = typeof VehicleImages !== 'undefined'
      ? VehicleImages.getImageSrc(truck.id)
      : 'assets/vehicles/generic.png';

    vehiclePhoto.style.width = '0';
    vehiclePhoto.style.height = '0';
    if (vehiclePhotoFrame) {
      vehiclePhotoFrame.style.width = '0';
      vehiclePhotoFrame.style.height = '0';
    }

    const onPhotoReady = () => {
      vehiclePhoto.onload = null;
      resizeVehiclePhoto();
    };

    vehiclePhoto.onload = onPhotoReady;
    vehiclePhoto.src = src;
    if (vehiclePhoto.complete) onPhotoReady();

    vehiclePhoto.alt = `${truck.name} – linke Seitenansicht (Referenzbild)`;
    if (vehiclePhotoCaption) {
      const truck = getTruck();
      if (isAnhaenger(truck)) {
        const trailerBed = getBedDims(truck, 'trailer');
        const area = (trailerBed.length * trailerBed.width).toFixed(2);
        vehiclePhotoCaption.textContent =
          `${truck.name} · Anhänger ${trailerBed.length.toFixed(2)} × ${trailerBed.width.toFixed(2)} m (${area} m²)`;
      } else {
        const area = (truck.length * truck.width).toFixed(2);
        vehiclePhotoCaption.textContent =
          `${truck.name} · Ladefläche ${truck.length.toFixed(2)} × ${truck.width.toFixed(2)} m (${area} m²)`;
      }
    }
  }

  function updateUsage(truck, mainBed) {
    mainBed = mainBed || getBedDims(truck, 'truck');
    updateUsageBarChart(truck, mainBed);
    updateWeightBarChart(truck);
  }

  function updateStats(truck, collidingIds) {
    if (!truck) return;
    const totalWeight = getTotalWeight();
    const maxWeight = truck.maxWeight || 0;
    const weightPct = maxWeight > 0 ? ((totalWeight / maxWeight) * 100).toFixed(1) : '0.0';
    const overWeight = totalWeight > maxWeight;
    const missingWeight = countWithoutWeight();

    weightInfo.className = `stat-info${overWeight ? ' warning' : totalWeight > 0 ? ' ok' : ''}`;
    let weightText = overWeight
      ? `<strong>⚠ Nutzlast überschritten</strong><br>${totalWeight.toLocaleString('de-DE')} / ${maxWeight.toLocaleString('de-DE')} kg (${weightPct}%)`
      : `Gewicht: ${totalWeight.toLocaleString('de-DE')} / ${maxWeight.toLocaleString('de-DE')} kg (${weightPct}%)`;
    if (missingWeight > 0) {
      weightText += `<br><em>${missingWeight} ohne Gewichtsangabe</em>`;
    }
    weightInfo.innerHTML = weightText;

    if (collidingIds.size > 0) {
      collisionInfo.className = 'stat-info warning';
      collisionInfo.innerHTML = `<strong>⚠ ${collidingIds.size} Überlappung${collidingIds.size > 1 ? 'en' : ''}</strong><br>Ladegüter überschneiden sich`;
    } else {
      collisionInfo.className = 'stat-info ok';
      collisionInfo.textContent = getAllItems().length > 1 ? 'Keine Überlappungen' : '—';
    }
  }

  function buildTruckInfoHtml(truck) {
    if (!truck) {
      return '<p class="header-truck-empty">Kein Fahrzeug ausgewählt</p>';
    }
    const lpn = getCurrentPlanLpn();
    const lpnHtml = lpn
      ? `<span class="header-truck-btn header-truck-btn-lpn" title="${escapeXml(LPN_HEADER_TOOLTIP)}">${escapeXml(lpn)}</span>`
      : '';
    const anhaenger = isAnhaenger(truck);
    const trailerBed = anhaenger ? getBedDims(truck, 'trailer') : null;
    const truckBed = anhaenger ? getBedDims(truck, 'truck') : null;
    const bedLine = anhaenger
      ? `Zug ${truckBed.length.toFixed(2)} × ${truckBed.width.toFixed(2)} m · Anhänger ${trailerBed.length.toFixed(2)} × ${trailerBed.width.toFixed(2)} m`
      : `Ladeboden ${truck.length.toFixed(2)} × ${truck.width.toFixed(2)} m`;
    const area = anhaenger
      ? (truckBed.length * truckBed.width + trailerBed.length * trailerBed.width).toFixed(2)
      : (truck.length * truck.width).toFixed(2);
    const detailItems = anhaenger
      ? [
        truck.category,
        `Zug ${truckBed.length.toFixed(2)} × ${truckBed.width.toFixed(2)} m`,
        `Anhänger ${trailerBed.length.toFixed(2)} × ${trailerBed.width.toFixed(2)} m`,
        `${area} m² gesamt`,
        `Nutzlast max. ${(truck.maxWeight || 0).toLocaleString('de-DE')} kg`,
      ]
      : [
        truck.category,
        bedLine,
        `${area} m² gesamt`,
        `Nutzlast max. ${(truck.maxWeight || 0).toLocaleString('de-DE')} kg`,
      ];

    return `
      <div class="header-truck-row">
        ${lpnHtml}
        <span class="header-truck-btn header-truck-btn-name">${truck.name}</span>
        ${detailItems.map((item, index) => (
          `<span class="header-truck-btn${index === 0 ? ' header-truck-btn-category' : ''}">${item}</span>`
        )).join('')}
      </div>
      ${truck.note ? `<p class="header-truck-note">${truck.note}</p>` : ''}
    `;
  }

  function updateTruckInfo() {
    const truck = getTruck();
    if (headerTruckInfo) {
      headerTruckInfo.innerHTML = buildTruckInfoHtml(truck);
    }
    customFields.classList.toggle('hidden', !truck || truck.id !== 'custom');
    syncAdSlotLayout();
  }

  function syncAdSlotLayout() {
    if (!vehiclePanel || !adSlot) return;
    requestAnimationFrame(() => {
      const panelHeight = Math.round(vehiclePanel.getBoundingClientRect().height);
      if (panelHeight <= 0) return;
      adSlot.style.height = `${panelHeight}px`;
      (window.AdSlots?.getAllPanels(adSlot) ?? []).forEach((slot) => {
        slot.style.height = `${panelHeight}px`;
      });
    });
  }

  function formatCargoWeightLabel(item) {
    if (!item || item.weight == null) return 'Kg ändern';
    return `${item.weight.toLocaleString('de-DE')} kg`;
  }

  function closeWeightListEdit() {
    weightListEditingId = null;
  }

  function finishWeightListEdit(itemId) {
    if (!itemId || weightListEditingId !== itemId) return;
    const input = weightList.querySelector(`.weight-list-weight-input[data-id="${itemId}"]`);
    const value = input?.value ?? '';
    weightListEditingId = null;
    applyItemWeight(itemId, value);
    weightUndoArmed = false;
  }

  function openWeightListEdit(itemId) {
    if (weightListEditingId && weightListEditingId !== itemId) {
      finishWeightListEdit(weightListEditingId);
    }
    closeCargoWeightEdit();
    const item = findItemById(itemId);
    if (!item) return;
    selectedId = itemId;
    weightListEditingId = itemId;
    updateWeightList();
    updateSelectionInfo();
    draw();
  }

  function closeCargoWeightEdit() {
    cargoWeightEditing = false;
    if (btnCargoWeight) btnCargoWeight.classList.remove('hidden');
    if (cargoDetailWeightInput) cargoDetailWeightInput.classList.add('hidden');
  }

  function openCargoWeightEdit() {
    if (weightListEditingId) finishWeightListEdit(weightListEditingId);
    const item = findItemById(selectedId);
    if (!item || !btnCargoWeight || !cargoDetailWeightInput) return;
    cargoWeightEditing = true;
    cargoDetailWeightInput.value = item.weight ?? '';
    btnCargoWeight.classList.add('hidden');
    cargoDetailWeightInput.classList.remove('hidden');
    cargoDetailWeightInput.focus();
    cargoDetailWeightInput.select();
  }

  function updateCargoWeightButton(item) {
    if (!btnCargoWeight) return;
    if (!item) {
      btnCargoWeight.disabled = true;
      btnCargoWeight.textContent = 'Kg ändern';
      closeCargoWeightEdit();
      return;
    }
    btnCargoWeight.disabled = false;
    if (!cargoWeightEditing) {
      btnCargoWeight.textContent = formatCargoWeightLabel(item);
    }
  }

  function syncWeightInputs(item) {
    if (!item) return;
    const value = item.weight ?? '';
    if (contextMenuWeightInput && document.activeElement !== contextMenuWeightInput) {
      contextMenuWeightInput.value = value;
    }
    if (cargoDetailWeightInput && document.activeElement !== cargoDetailWeightInput) {
      cargoDetailWeightInput.value = value;
    }
    updateCargoWeightButton(item);
  }

  function applyItemWeight(itemId, value) {
    const item = findItemById(itemId);
    if (!item) return;
    commitWeightUndoIfNeeded();
    item.weight = normalizeWeight(value);
    syncWeightInputs(item);
    updateSelectionInfo();
    updateWeightList();
    updateStats(getTruck(), getCollidingIds());
    draw();
    scheduleSave();
  }

  function finishCargoWeightEdit() {
    if (!selectedId) {
      closeCargoWeightEdit();
      return;
    }
    const value = cargoDetailWeightInput?.value ?? '';
    closeCargoWeightEdit();
    applyItemWeight(selectedId, value);
    weightUndoArmed = false;
  }

  function applyContextMenuWeight() {
    if (!contextMenuItemId) return;
    applyItemWeight(contextMenuItemId, contextMenuWeightInput?.value);
  }

  function applyCargoDetailWeight() {
    if (!selectedId) return;
    applyItemWeight(selectedId, cargoDetailWeightInput?.value);
  }

  function updateSelectionInfo() {
    const item = findItemById(selectedId);
    const btnRotate = document.getElementById('btn-rotate');
    const btnDelete = document.getElementById('btn-delete');
    if (!cargoDetailContent) return;

    if (!item) {
      cargoDetailContent.innerHTML = `
        <div class="cargo-detail-card cargo-detail-card-empty">
          <div class="cargo-detail-name cargo-detail-empty">Kein Ladegut ausgewählt</div>
          <p class="cargo-detail-hint">Ladegut in der Draufsicht anklicken.</p>
          <dl class="cargo-detail-list">
            <dt>Maße</dt>
            <dd>—</dd>
            <dt>Fläche</dt>
            <dd>—</dd>
            <dt>Position</dt>
            <dd>—</dd>
            <dt>Ladefläche</dt>
            <dd>—</dd>
            <dt>Gewicht</dt>
            <dd>—</dd>
            <dt>Status</dt>
            <dd>—</dd>
            <dt>Beladung</dt>
            <dd>—</dd>
          </dl>
        </div>
      `;
      btnRotate.disabled = true;
      btnDelete.disabled = true;
      if (btnCargoBeladen) btnCargoBeladen.disabled = true;
      updateCargoWeightButton(null);
      return;
    }

    const truck = getTruck();
    const bed = getItemBed(item.id);
    const bedLabel = isAnhaenger(truck)
      ? (bed === 'trailer' ? 'Anhänger' : 'Zugfahrzeug')
      : 'Ladeboden';
    const colliding = getCollidingIds().has(item.id);
    const area = (item.length * item.width).toFixed(2);
    const weightDisplay = item.weight != null
      ? `${item.weight.toLocaleString('de-DE')} kg`
      : '—';
    const beladungLines = getItemBeladung(item);
    const beladungSummary = formatBeladungSummary(item);
    const beladungFullTitle = beladungLines.length ? beladungLines.join('\n') : '';

    updateCargoWeightButton(item);
    if (cargoWeightEditing && cargoDetailWeightInput && document.activeElement !== cargoDetailWeightInput) {
      cargoDetailWeightInput.value = item.weight ?? '';
    }

    cargoDetailContent.innerHTML = `
      <div class="cargo-detail-card" style="border-left-color: ${item.color}">
        <div class="cargo-detail-name">${item.label || 'Ladegut'}</div>
        <dl class="cargo-detail-list">
          <dt>Maße</dt>
          <dd>${item.length.toFixed(2)} × ${item.width.toFixed(2)} m</dd>
          <dt>Fläche</dt>
          <dd>${area} m²</dd>
          <dt>Position</dt>
          <dd>X: ${item.x.toFixed(2)} m · Y: ${item.y.toFixed(2)} m</dd>
          <dt>Ladefläche</dt>
          <dd>${bedLabel}</dd>
          <dt>Gewicht</dt>
          <dd>${weightDisplay}</dd>
          <dt>Status</dt>
          <dd class="${colliding ? 'cargo-detail-warning' : ''}">${colliding ? 'Überlappung' : 'OK'}</dd>
          <dt>Beladung</dt>
          <dd class="cargo-detail-beladung-summary">
            <span class="cargo-detail-beladung-text${beladungLines.length ? '' : ' cargo-detail-hint'}"${beladungFullTitle ? ` title="${escapeXml(beladungFullTitle)}"` : ''}>${escapeXml(beladungSummary)}</span>
            <button type="button" class="btn btn-cargo-beladung-view" data-action="view-beladung">Anzeigen</button>
          </dd>
        </dl>
      </div>
    `;
    btnRotate.disabled = false;
    btnDelete.disabled = false;
    if (btnCargoBeladen) btnCargoBeladen.disabled = false;
  }

  function updateWeightList() {
    weightListEmpty.classList.toggle('hidden', getAllItems().length > 0);

    if (weightListEditingId && document.activeElement?.closest('.weight-list-weight-input')) {
      weightList.querySelectorAll('.weight-list-row').forEach((row) => {
        row.classList.toggle('selected', row.dataset.id === selectedId);
      });
      return;
    }

    const editingId = weightListEditingId;
    weightList.innerHTML = '';
    getAllItems().forEach((item, index) => {
      const bed = getItemBed(item.id);
      const bedTag = isAnhaenger(getTruck()) && bed === 'trailer' ? 'Anhänger · ' : bed === 'truck' && isAnhaenger(getTruck()) ? 'Zug · ' : '';
      const row = document.createElement('div');
      row.className = `weight-list-row${item.id === selectedId ? ' selected' : ''}`;
      row.dataset.id = item.id;
      const name = bedTag + itemLabel(item, index);
      const isEditing = editingId === item.id;
      row.innerHTML = `
        <span class="weight-list-name" title="${name} · ${item.length.toFixed(2)} × ${item.width.toFixed(2)} m">${name}</span>
        <div class="weight-list-weight-control">
          <button type="button" class="btn btn-weight-list${isEditing ? ' hidden' : ''}" data-id="${item.id}">${formatCargoWeightLabel(item)}</button>
          <input type="number" class="weight-list-weight-input${isEditing ? '' : ' hidden'}" data-id="${item.id}" min="0" max="50000" step="1" placeholder="kg" value="${item.weight ?? ''}" aria-label="Gewicht in kg für ${name}">
        </div>
      `;

      row.querySelector('.weight-list-name').addEventListener('click', () => {
        if (weightListEditingId && weightListEditingId !== item.id) {
          finishWeightListEdit(weightListEditingId);
        }
        selectedId = item.id;
        updateUI();
        draw();
      });

      row.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        if (weightListEditingId && weightListEditingId !== item.id) {
          finishWeightListEdit(weightListEditingId);
        }
        selectedId = item.id;
        showContextMenu(event.clientX, event.clientY, item.id);
      });

      row.querySelector('.btn-weight-list').addEventListener('click', (event) => {
        event.stopPropagation();
        openWeightListEdit(item.id);
      });

      const input = row.querySelector('.weight-list-weight-input');
      input.addEventListener('focus', armWeightUndo);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          finishWeightListEdit(item.id);
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          weightUndoArmed = false;
          weightListEditingId = null;
          updateWeightList();
        }
        event.stopPropagation();
      });
      input.addEventListener('blur', () => {
        if (weightListEditingId === item.id) finishWeightListEdit(item.id);
      });

      if (isEditing) {
        input.focus();
        input.select();
      }

      weightList.appendChild(row);
    });
  }

  function updateUI() {
    updatePlanLpnDisplay();
    updateTruckInfo();
    updateSelectionInfo();
    updateWeightList();
  }

  function canvasCoordsOn(event, targetCanvas) {
    const rect = targetCanvas.getBoundingClientRect();
    const scaleX = targetCanvas.width / rect.width;
    const scaleY = targetCanvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function transferItemBetweenBeds(item, fromBed, toBed) {
    if (fromBed === toBed) return;
    const fromList = getItemList(fromBed);
    const idx = fromList.findIndex((entry) => entry.id === item.id);
    if (idx >= 0) fromList.splice(idx, 1);
    getItemList(toBed).push(item);
  }

  function resolveBedAtClient(clientX, clientY) {
    const truck = getTruck();
    if (!isAnhaenger(truck)) return 'truck';

    const targets = [
      { bed: 'trailer', el: trailerCanvas },
      { bed: 'truck', el: canvas },
    ];
    for (const { bed, el } of targets) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return bed;
      }
    }
    return null;
  }

  function pointerToBedCoords(clientX, clientY, bed) {
    const targetCanvas = bed === 'trailer' ? trailerCanvas : canvas;
    const rect = targetCanvas.getBoundingClientRect();
    const scaleX = targetCanvas.width / rect.width;
    const scaleY = targetCanvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    const origin = bedOrigin();
    return {
      itemX: snap(pxToM(x - origin.x - dragState.offsetX)),
      itemY: snap(pxToM(y - origin.y - dragState.offsetY)),
    };
  }

  let dragDocumentBound = false;

  function bindDragDocumentListeners() {
    if (dragDocumentBound) return;
    dragDocumentBound = true;
    document.addEventListener('pointermove', onDocumentPointerMove);
    document.addEventListener('pointerup', onDocumentPointerUp);
    document.addEventListener('pointercancel', onDocumentPointerUp);
  }

  function unbindDragDocumentListeners() {
    if (!dragDocumentBound) return;
    dragDocumentBound = false;
    document.removeEventListener('pointermove', onDocumentPointerMove);
    document.removeEventListener('pointerup', onDocumentPointerUp);
    document.removeEventListener('pointercancel', onDocumentPointerUp);
  }

  function updateDragAtClient(clientX, clientY) {
    if (!dragState) return;
    const item = findItemById(dragState.id);
    if (!item) return;

    let bed = resolveBedAtClient(clientX, clientY);
    if (!bed) bed = dragState.bed;

    if (bed !== dragState.bed) {
      transferItemBetweenBeds(item, dragState.bed, bed);
      dragState.bed = bed;
    }

    const { itemX, itemY } = pointerToBedCoords(clientX, clientY, bed);
    item.x = itemX;
    item.y = itemY;
    clampItem(item, bed);
    updateSelectionInfo();
    draw();
  }

  function finishDrag(event) {
    if (!dragState) return;
    const targetCanvas = dragState.bed === 'trailer' ? trailerCanvas : canvas;
    if (dragUndoSnapshot) {
      const movedItem = findItemById(dragState.id);
      const beforeItem = dragUndoSnapshot.items.find((entry) => entry.id === dragState.id)
        || (dragUndoSnapshot.trailerItems || []).find((entry) => entry.id === dragState.id);
      const beforeBed = beforeItem
        ? (dragUndoSnapshot.trailerItems || []).some((entry) => entry.id === dragState.id)
          ? 'trailer'
          : 'truck'
        : null;
      const afterBed = movedItem ? getItemBed(movedItem.id) : null;
      if (
        movedItem &&
        beforeItem &&
        (
          movedItem.x !== beforeItem.x ||
          movedItem.y !== beforeItem.y ||
          beforeBed !== afterBed
        )
      ) {
        undoStack.push(dragUndoSnapshot);
        trimUndoStack();
        updateUndoControls();
      }
      dragUndoSnapshot = null;
    }
    scheduleSave();
    dragState = null;
    unbindDragDocumentListeners();
    if (targetCanvas && event?.pointerId != null) {
      try {
        targetCanvas.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  function onDocumentPointerMove(event) {
    if (!dragState) return;
    updateDragAtClient(event.clientX, event.clientY);
  }

  function onDocumentPointerUp(event) {
    finishDrag(event);
  }

  function onBedPointerDown(event, bed) {
    if (event.button === 2) return;
    hideContextMenu();
    const targetCanvas = bed === 'trailer' ? trailerCanvas : canvas;
    const { x, y } = canvasCoordsOn(event, targetCanvas);
    const bedItems = getItemList(bed);
    const rotateHit = hitTestRotateHandle(x, y, bedItems);
    if (rotateHit) {
      event.preventDefault();
      selectedId = rotateHit.id;
      rotateItemById(rotateHit.id);
      return;
    }
    const hit = hitTest(x, y, bedItems);
    if (cargoWeightEditing && (!hit || hit.id !== selectedId)) {
      finishCargoWeightEdit();
    }
    if (weightListEditingId && (!hit || hit.id !== selectedId)) {
      finishWeightListEdit(weightListEditingId);
    }
    selectedId = hit ? hit.id : null;
    if (hit) {
      dragUndoSnapshot = cloneStateForUndo();
      const origin = bedOrigin();
      dragState = {
        id: hit.id,
        bed,
        offsetX: x - (origin.x + mToPx(hit.x)),
        offsetY: y - (origin.y + mToPx(hit.y)),
      };
      bindDragDocumentListeners();
      targetCanvas.setPointerCapture(event.pointerId);
    }
    updateUI();
    draw();
  }

  function onBedPointerMove(event) {
    if (!dragState) return;
    updateDragAtClient(event.clientX, event.clientY);
  }

  function onBedPointerUp(event) {
    finishDrag(event);
  }

  function onBedDoubleClick(event, bed) {
    event.preventDefault();
    if (dragState) finishDrag(event);
    const targetCanvas = bed === 'trailer' ? trailerCanvas : canvas;
    const { x, y } = canvasCoordsOn(event, targetCanvas);
    const hit = hitTest(x, y, getItemList(bed));
    if (!hit) return;
    selectedId = hit.id;
    updateUI();
    draw();
    openBeladungDialog(hit.id);
  }

  function onPointerDown(event) {
    onBedPointerDown(event, 'truck');
  }

  function onPointerMove(event) {
    onBedPointerMove(event);
  }

  function onPointerUp(event) {
    onBedPointerUp(event);
  }

  function drawExportPlanOutlineText(ectx, text, x, y) {
    ectx.lineJoin = 'round';
    ectx.miterLimit = 2;
    ectx.lineWidth = 4;
    ectx.strokeStyle = '#0f172a';
    ectx.strokeText(text, x, y);
    ectx.fillStyle = '#ffffff';
    ectx.fillText(text, x, y);
  }

  function drawExportPlanCargoItem(ectx, x, y, w, h, item, isColliding) {
    const minDim = Math.min(w, h);
    const outerWidth = Math.max(3, Math.min(5, minDim * 0.06));
    const innerWidth = Math.max(1.5, outerWidth * 0.55);
    const inset = outerWidth * 0.75;
    const ix = x + inset;
    const iy = y + inset;
    const iw = Math.max(1, w - inset * 2);
    const ih = Math.max(1, h - inset * 2);

    ectx.save();
    fillCargoItemRect(ectx, item, x, y, w, h, 0.9);

    ectx.strokeStyle = '#ffffff';
    ectx.lineWidth = outerWidth + 1;
    ectx.strokeRect(ix, iy, iw, ih);

    ectx.strokeStyle = isColliding ? '#b91c1c' : '#0f172a';
    ectx.lineWidth = outerWidth;
    ectx.strokeRect(ix, iy, iw, ih);

    ectx.strokeStyle = isCustomCargoItem(item) ? '#a16207' : item.color;
    ectx.lineWidth = innerWidth;
    ectx.strokeRect(ix + innerWidth * 0.5, iy + innerWidth * 0.5, iw - innerWidth, ih - innerWidth);
    ectx.restore();
  }

  function drawExportBedPlan(ectx, bedDims, bedItems, collidingIds, ox, oy, exportScale) {
    const bw = bedDims.length * exportScale;
    const bh = bedDims.width * exportScale;

    ectx.fillStyle = '#e2e8f0';
    ectx.fillRect(ox, oy, bw, bh);
    ectx.strokeStyle = '#64748b';
    ectx.lineWidth = 2;
    ectx.strokeRect(ox, oy, bw, bh);

    ectx.strokeStyle = 'rgba(100,116,139,0.3)';
    for (let x = 0; x <= bedDims.length; x += 0.5) {
      const px = ox + x * exportScale;
      ectx.beginPath();
      ectx.moveTo(px, oy);
      ectx.lineTo(px, oy + bh);
      ectx.stroke();
    }
    for (let y = 0; y <= bedDims.width; y += 0.5) {
      const py = oy + y * exportScale;
      ectx.beginPath();
      ectx.moveTo(ox, py);
      ectx.lineTo(ox + bw, py);
      ectx.stroke();
    }

    bedItems.forEach((item) => {
      const x = ox + item.x * exportScale;
      const y = oy + item.y * exportScale;
      const iw = item.length * exportScale;
      const ih = item.width * exportScale;
      const isColliding = collidingIds.has(item.id);

      drawExportPlanCargoItem(ectx, x, y, iw, ih, item, isColliding);

      const label = item.label || `${item.length.toFixed(2)}×${item.width.toFixed(2)}`;
      const labelRot = getCargoLabelRotationRad(item.length, item.width);
      ectx.save();
      ectx.translate(x + iw / 2, y + ih / 2);
      ectx.rotate(labelRot);
      ectx.font = 'bold 12px Segoe UI, sans-serif';
      ectx.textAlign = 'center';
      ectx.textBaseline = 'middle';
      drawExportPlanOutlineText(ectx, label, 0, item.weight != null ? -6 : 0);
      if (item.weight != null) {
        ectx.font = '10px Segoe UI, sans-serif';
        drawExportPlanOutlineText(ectx, `${item.weight} kg`, 0, 8);
      }
      ectx.restore();
    });

    ectx.strokeStyle = '#cbd5e1';
    ectx.beginPath();
    ectx.moveTo(ox, oy - 8);
    ectx.lineTo(ox + bw, oy - 8);
    ectx.stroke();
    ectx.fillStyle = '#64748b';
    ectx.font = '11px Segoe UI, sans-serif';
    ectx.textAlign = 'center';
    for (let m = 0; m <= Math.floor(bedDims.length); m += 1) {
      ectx.fillText(`${m} m`, ox + m * exportScale, oy - 16);
    }
    ectx.textAlign = 'left';

    return { width: bw, height: bh };
  }

  function estimateCargoListHeight(bedItems, withTitle = false) {
    if (!bedItems.length) return withTitle ? 56 : 28;
    return (withTitle ? 36 : 0) + bedItems.length * 52 + 8;
  }

  function drawExportPageHeader(ectx, pad, truck, mainTitle, line2, line3, pageWidth, lpn) {
    if (lpn && pageWidth) {
      ectx.save();
      ectx.textAlign = 'right';
      ectx.font = 'bold 16px Segoe UI, sans-serif';
      ectx.fillStyle = '#111827';
      ectx.fillText(lpn, pageWidth - pad, 34);
      ectx.restore();
    }
    ectx.fillStyle = '#111827';
    ectx.font = 'bold 22px Segoe UI, sans-serif';
    ectx.textAlign = 'left';
    ectx.fillText(mainTitle, pad, 34);
    ectx.font = '14px Segoe UI, sans-serif';
    ectx.fillStyle = '#475569';
    ectx.fillText(line2, pad, 58);
    if (line3) ectx.fillText(line3, pad, 78);
  }

  const EXPORT_PORTRAIT = { w: 794, h: 1123 };
  const EXPORT_LANDSCAPE = { w: 1123, h: 794 };
  const EXPORT_LIST_ROW_H = 52;
  const EXPORT_LIST_COL_GAP = 24;
  const EXPORT_LINE_H = 14;
  const EXPORT_ITEM_GAP = 8;
  const EXPORT_BLOCK_GAP = 2;
  const EXPORT_BELADUNG_GAP = 6;

  let exportMeasureCtx = null;

  function getExportMeasureCtx() {
    if (!exportMeasureCtx) {
      exportMeasureCtx = document.createElement('canvas').getContext('2d');
    }
    return exportMeasureCtx;
  }

  function wrapCanvasText(ectx, text, maxWidth) {
    const value = String(text ?? '');
    if (!value) return [''];
    if (maxWidth <= 0) return [value];
    if (ectx.measureText(value).width <= maxWidth) return [value];

    const lines = [];
    value.split('\n').forEach((paragraph, paragraphIndex) => {
      if (paragraphIndex > 0) lines.push('');
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) return;

      let current = '';
      words.forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        if (ectx.measureText(candidate).width <= maxWidth) {
          current = candidate;
          return;
        }
        if (current) lines.push(current);
        if (ectx.measureText(word).width > maxWidth) {
          let chunk = '';
          word.split('').forEach((char) => {
            const next = chunk + char;
            if (ectx.measureText(next).width <= maxWidth) {
              chunk = next;
            } else {
              if (chunk) lines.push(chunk);
              chunk = char;
            }
          });
          current = chunk;
        } else {
          current = word;
        }
      });
      if (current) lines.push(current);
    });

    return lines.length ? lines : [''];
  }

  function layoutHeightFromFlatLines(flatLines) {
    let height = 10;
    flatLines.forEach((line) => {
      height += line.gapBefore + EXPORT_LINE_H;
    });
    return height + EXPORT_ITEM_GAP;
  }

  function flatLinesToBlocks(flatLines) {
    const blocks = [];
    flatLines.forEach((line) => {
      const last = blocks[blocks.length - 1];
      if (
        last
        && last.font === line.font
        && last.color === line.color
        && last.indent === line.indent
        && line.gapBefore === 0
      ) {
        last.lines.push(line.text);
        return;
      }
      blocks.push({
        font: line.font,
        color: line.color,
        indent: line.indent,
        gapBefore: line.gapBefore,
        lines: [line.text],
      });
    });
    return blocks;
  }

  function flattenLayoutBlocks(blocks) {
    const flatLines = [];
    blocks.forEach((block, blockIndex) => {
      block.lines.forEach((text, lineIndex) => {
        flatLines.push({
          font: block.font,
          color: block.color,
          indent: block.indent || 0,
          text,
          gapBefore: lineIndex === 0 && blockIndex > 0 ? (block.gapBefore ?? EXPORT_BLOCK_GAP) : 0,
        });
      });
    });
    return flatLines;
  }

  function layoutExportCargoListItem(ectx, item, globalIndex, columnW, mode) {
    const textW = Math.max(80, columnW - (mode === 'beladung' ? 0 : 16));
    const beladung = getItemBeladung(item);
    const blocks = [];

    if (mode !== 'beladung') {
      const name = itemLabel(item, globalIndex);
      const dims = `${item.length.toFixed(2)} × ${item.width.toFixed(2)} m`;
      blocks.push({
        font: 'bold 12px Segoe UI, sans-serif',
        color: '#111827',
        indent: 16,
        lines: wrapCanvasText(ectx, `${globalIndex + 1}. ${name}`, textW),
      });
      blocks.push({
        font: '11px Segoe UI, sans-serif',
        color: '#475569',
        indent: 16,
        lines: wrapCanvasText(ectx, dims, textW),
      });
    } else {
      const name = itemLabel(item, globalIndex);
      blocks.push({
        font: 'bold 12px Segoe UI, sans-serif',
        color: '#111827',
        indent: 0,
        lines: wrapCanvasText(ectx, `${globalIndex + 1}. ${name}`, textW),
      });
    }

    if (mode !== 'list') {
      if (beladung.length) {
        beladung.forEach((entry, entryIndex) => {
          blocks.push({
            font: '11px Segoe UI, sans-serif',
            color: '#334155',
            indent: mode === 'beladung' ? 0 : 16,
            gapBefore: entryIndex === 0 ? EXPORT_BELADUNG_GAP : EXPORT_BLOCK_GAP,
            lines: wrapCanvasText(ectx, `• ${entry}`, textW),
          });
        });
      } else if (mode === 'beladung') {
        blocks.push({
          font: '11px Segoe UI, sans-serif',
          color: '#64748b',
          indent: 0,
          gapBefore: EXPORT_BELADUNG_GAP,
          lines: ['— keine Beladung —'],
        });
      } else {
        blocks.push({
          font: '11px Segoe UI, sans-serif',
          color: '#64748b',
          indent: 16,
          gapBefore: EXPORT_BELADUNG_GAP,
          lines: ['Beladung: —'],
        });
      }
    }

    const flatLines = flattenLayoutBlocks(blocks);
    let height = layoutHeightFromFlatLines(flatLines);
    if (mode !== 'beladung') height = Math.max(height, 36);

    return {
      blocks,
      height,
      showSwatch: mode !== 'beladung',
      color: item.color,
    };
  }

  function splitExportListItemLayout(layout, item, globalIndex, contentH) {
    const flat = flattenLayoutBlocks(layout.blocks);
    if (layoutHeightFromFlatLines(flat) <= contentH) {
      return [{ layout, globalIndex, item }];
    }

    const entries = [];
    let chunk = [];
    let isFirst = true;

    const pushEntry = (continuation) => {
      let lines = chunk;
      if (continuation) {
        lines = [{
          font: 'bold 11px Segoe UI, sans-serif',
          color: '#64748b',
          indent: 0,
          text: `${globalIndex + 1}. ${itemLabel(item, globalIndex)} (Fortsetzung)`,
          gapBefore: 0,
        }, ...chunk];
      }
      const blocks = flatLinesToBlocks(lines);
      entries.push({
        layout: {
          blocks,
          height: layoutHeightFromFlatLines(lines),
          showSwatch: isFirst && layout.showSwatch,
          color: layout.color,
        },
        globalIndex,
        item,
      });
      chunk = [];
      isFirst = false;
    };

    flat.forEach((line) => {
      if (chunk.length && layoutHeightFromFlatLines([...chunk, line]) > contentH) {
        pushEntry(entries.length > 0);
      }
      chunk.push(line);
    });
    if (chunk.length) pushEntry(false);

    return entries.length ? entries : [{ layout, globalIndex, item }];
  }

  function buildExportListRenderEntries(items, columnW, mode, contentH) {
    const ectx = getExportMeasureCtx();
    return items.flatMap((item, globalIndex) => {
      const layout = layoutExportCargoListItem(ectx, item, globalIndex, columnW, mode);
      return splitExportListItemLayout(layout, item, globalIndex, contentH);
    });
  }

  function getExportListLayout(showMainHeader) {
    const pad = 48;
    const headerH = showMainHeader ? 72 : 40;
    const rowsPerColumn = Math.max(1, Math.floor((EXPORT_PORTRAIT.h - pad - headerH - pad) / EXPORT_LIST_ROW_H));
    const contentW = EXPORT_PORTRAIT.w - pad * 2;
    const columnW = Math.floor((contentW - EXPORT_LIST_COL_GAP) / 2);
    return {
      pad,
      headerH,
      rowsPerColumn,
      itemsPerPage: rowsPerColumn * 2,
      columnW,
      colGap: EXPORT_LIST_COL_GAP,
    };
  }

  function truncateCanvasText(ectx, text, maxWidth) {
    if (ectx.measureText(text).width <= maxWidth) return text;
    let trimmed = text;
    while (trimmed.length > 0 && ectx.measureText(`${trimmed}…`).width > maxWidth) {
      trimmed = trimmed.slice(0, -1);
    }
    return `${trimmed}…`;
  }

  function getExportListItemRowH(item, globalIndex, columnW, mode) {
    const ectx = getExportMeasureCtx();
    return layoutExportCargoListItem(ectx, item, globalIndex, columnW, mode).height;
  }

  function drawExportCargoListEntry(ectx, entry, x, y, columnW) {
    const { layout } = entry;
    if (layout.showSwatch) {
      ectx.fillStyle = layout.color;
      ectx.fillRect(x, y - 2, 10, 10);
    }

    let cy = y + 10;
    layout.blocks.forEach((block, blockIndex) => {
      if (blockIndex > 0) cy += block.gapBefore ?? EXPORT_BLOCK_GAP;
      ectx.font = block.font;
      ectx.fillStyle = block.color;
      ectx.textAlign = 'left';
      ectx.textBaseline = 'alphabetic';
      block.lines.forEach((line) => {
        ectx.fillText(line, x + (block.indent || 0), cy);
        cy += EXPORT_LINE_H;
      });
    });
  }

  function drawExportCargoListItem(ectx, item, globalIndex, x, y, columnW, mode = 'list') {
    const layout = layoutExportCargoListItem(ectx, item, globalIndex, columnW, mode);
    drawExportCargoListEntry(ectx, { layout, globalIndex, item }, x, y, columnW);
  }

  function drawExportCargoListColumns(ectx, columns, x, y, listLayout, mode = 'list') {
    const { columnW, colGap } = listLayout;
    const col2X = x + columnW + colGap;
    [0, 1].forEach((colIndex) => {
      let cy = y;
      (columns[colIndex] || []).forEach((entry) => {
        drawExportCargoListEntry(ectx, entry, colIndex === 0 ? x : col2X, cy, columnW);
        cy += entry.layout.height;
      });
    });
  }

  function packExportListItems(items, showMainHeader, mode) {
    const pageLayout = getExportListLayout(showMainHeader);
    const contentH = EXPORT_PORTRAIT.h - pageLayout.pad - pageLayout.headerH - pageLayout.pad;
    const entries = buildExportListRenderEntries(items, pageLayout.columnW, mode, contentH);
    const pages = [];
    let index = 0;

    while (index < entries.length) {
      const currentPageLayout = getExportListLayout(pages.length === 0);
      const pageContentH = EXPORT_PORTRAIT.h - currentPageLayout.pad - currentPageLayout.headerH - currentPageLayout.pad;
      const columns = [[], []];
      const colHeights = [0, 0];

      while (index < entries.length) {
        const entry = entries[index];
        const h = entry.layout.height;
        let placed = false;
        for (let col = 0; col < 2; col += 1) {
          if (colHeights[col] + h <= pageContentH) {
            columns[col].push(entry);
            colHeights[col] += h;
            index += 1;
            placed = true;
            break;
          }
        }
        if (!placed) break;
      }

      if (columns[0].length === 0 && columns[1].length === 0 && index < entries.length) {
        columns[0].push(entries[index]);
        index += 1;
      }

      pages.push({
        columns,
        layout: currentPageLayout,
      });
    }

    return pages;
  }

  function drawExportCargoList(ectx, bedItems, x, y, listTitle, startIndex = 0, listLayout, mode = 'list') {
    let contentY = y;
    if (listTitle) {
      ectx.fillStyle = '#111827';
      ectx.font = 'bold 16px Segoe UI, sans-serif';
      ectx.textAlign = 'left';
      ectx.fillText(listTitle, x, contentY);
      contentY += 32;
    }

    if (!bedItems.length) {
      ectx.fillStyle = '#64748b';
      ectx.font = '12px Segoe UI, sans-serif';
      ectx.fillText('Kein Ladegut auf dieser Ladefläche.', x, contentY);
      return contentY - y + 28;
    }

    const layout = listLayout || getExportListLayout(true);
    const contentH = EXPORT_PORTRAIT.h - layout.pad - layout.headerH - layout.pad;
    const entries = buildExportListRenderEntries(bedItems, layout.columnW, mode, contentH)
      .map((entry) => ({
        ...entry,
        globalIndex: startIndex + entry.globalIndex,
      }));
    const { columnW, colGap } = layout;
    const col2X = x + columnW + colGap;
    const columns = [[], []];
    const colHeights = [0, 0];

    entries.forEach((entry) => {
      const h = entry.layout.height;
      const col = colHeights[0] <= colHeights[1] ? 0 : 1;
      if (colHeights[col] + h > contentH && columns[col].length) return;
      columns[col].push(entry);
      colHeights[col] += h;
    });

    let maxHeight = 0;
    [0, 1].forEach((colIndex) => {
      let cy = contentY;
      columns[colIndex].forEach((entry) => {
        drawExportCargoListEntry(ectx, entry, colIndex === 0 ? x : col2X, cy, columnW);
        cy += entry.layout.height;
      });
      maxHeight = Math.max(maxHeight, colHeights[colIndex]);
    });

    return maxHeight + 8;
  }

  function formatLpn(value) {
    return `LPN-${String(value).padStart(6, '0')}`;
  }

  function normalizeExportLpn(exportLpn) {
    if (!exportLpn) return { lpn: '', lpnValue: null };
    return {
      lpn: exportLpn.lpn || '',
      lpnValue: exportLpn.lpnValue ?? null,
    };
  }

  function withExportLpn(config, exportLpn) {
    return { ...config, ...normalizeExportLpn(exportLpn) };
  }

  function buildExportLpnsList(exportLpn) {
    const { lpn } = normalizeExportLpn(exportLpn);
    return lpn ? [lpn] : [];
  }

  function getNextLpnValue() {
    const stored = parseInt(localStorage.getItem(LPN_STORAGE_KEY), 10);
    const next = Number.isFinite(stored) && stored >= LPN_START ? stored : LPN_START;
    localStorage.setItem(LPN_STORAGE_KEY, String(next + 1));
    return next;
  }

  function resolveExportLpn(exportLpn) {
    if (exportLpn != null) return normalizeExportLpn(exportLpn);
    return normalizeExportLpn(getCurrentPlanExportLpn());
  }

  function buildExportFilename(lpns, extension) {
    if (!lpns.length) return `ladeplan-${Date.now()}.${extension}`;
    if (lpns.length === 1) return `${lpns[0]}.${extension}`;
    return `${lpns[0]}-${lpns[lpns.length - 1]}.${extension}`;
  }

  function getExportBedConfigs() {
    const truck = getTruck();
    if (!truck) return [];
    const anhaenger = isAnhaenger(truck);
    if (anhaenger) {
      return [
        {
          truck,
          sectionTitle: 'Zugfahrzeug (Draufsicht)',
          bedDims: getBedDims(truck, 'truck'),
          bedItems: items,
          bedCollidingIds: getCollidingIdsFor(items),
          includeTotalWeight: true,
          sheetLabel: 'Zugfahrzeug',
        },
        {
          truck,
          sectionTitle: 'Anhänger (Draufsicht)',
          bedDims: getBedDims(truck, 'trailer'),
          bedItems: trailerItems,
          bedCollidingIds: getCollidingIdsFor(trailerItems),
          sheetLabel: 'Anhänger',
        },
      ];
    }
    return [{
      truck,
      sectionTitle: 'Ladeboden (Draufsicht)',
      bedDims: { length: truck.length, width: truck.width },
      bedItems: items,
      bedCollidingIds: getCollidingIds(),
      includeTotalWeight: true,
      sheetLabel: 'Ladeplan',
    }];
  }

  function buildExportData(includeLists, exportLpn = null) {
    if (!includeLists) return buildPlanOnlyExportData(exportLpn);
    return buildCombinedListExportData('both', exportLpn);
  }

  function buildPlanOnlyExportData(exportLpn = null) {
    const pages = [];
    const sections = [];

    getExportBedConfigs().forEach((config) => {
      const fullConfig = withExportLpn(config, exportLpn);
      pages.push({ type: 'plan', canvas: buildExportPlanPage(fullConfig), lpn: fullConfig.lpn });
      sections.push(fullConfig);
    });

    return {
      pages,
      sections,
      lpns: buildExportLpnsList(exportLpn),
    };
  }

  function buildCombinedListExportData(mode = 'list', exportLpn = null) {
    const pages = [];
    const sections = [];

    getExportBedConfigs().forEach((config) => {
      const fullConfig = withExportLpn(config, exportLpn);

      pages.push({ type: 'plan', canvas: buildExportPlanPage(fullConfig), lpn: fullConfig.lpn });
      sections.push(fullConfig);
      buildExportListPages(fullConfig, mode).forEach((canvas) => {
        pages.push({ type: 'list', canvas, lpn: fullConfig.lpn });
      });
    });

    return {
      pages,
      sections,
      lpns: buildExportLpnsList(exportLpn),
    };
  }

  function buildListOnlyExportData(mode = 'list', exportLpn = null) {
    const pages = [];
    const sections = [];

    getExportBedConfigs().forEach((config) => {
      const fullConfig = withExportLpn(config, exportLpn);
      sections.push(fullConfig);
      buildExportListPages(fullConfig, mode).forEach((canvas) => {
        pages.push({ type: 'list', canvas, lpn: fullConfig.lpn });
      });
    });

    return {
      pages,
      sections,
      lpns: buildExportLpnsList(exportLpn),
    };
  }

  function buildAllExportData(exportLpn = null) {
    const pages = [];
    const sections = [];

    getExportBedConfigs().forEach((config) => {
      const fullConfig = withExportLpn(config, exportLpn);

      pages.push({ type: 'plan', canvas: buildExportPlanPage(fullConfig), lpn: fullConfig.lpn });
      sections.push(fullConfig);
      ['list', 'both', 'beladung'].forEach((listMode) => {
        buildExportListPages(fullConfig, listMode).forEach((canvas) => {
          pages.push({ type: 'list', canvas, lpn: fullConfig.lpn });
        });
      });
    });

    return {
      pages,
      sections,
      lpns: buildExportLpnsList(exportLpn),
    };
  }

  function getListExportData(mode = 'list', exportLpn) {
    const resolvedLpn = resolveExportLpn(exportLpn);
    if (mode === 'all') return buildAllExportData(resolvedLpn);
    if (mode === 'plan') return buildPlanOnlyExportData(resolvedLpn);
    return buildListOnlyExportData(mode, resolvedLpn);
  }

  function getCargoListTitle(mode) {
    if (mode === 'plan') return 'Ladeplan';
    if (mode === 'all') return 'Alles';
    if (mode === 'beladung') return 'Beladung';
    if (mode === 'both') return 'Ladegut mit Beladung';
    return 'Ladegut';
  }

  function buildListExportFilename(lpns, extension, mode = 'list') {
    const prefix = mode === 'all'
      ? 'Alles'
      : mode === 'plan'
        ? 'Ladeplan'
        : mode === 'beladung'
          ? 'Beladung'
          : mode === 'both'
            ? 'Ladegut-Beladung'
            : 'Ladegut';
    if (!lpns.length) return `${prefix}-${Date.now()}.${extension}`;
    if (lpns.length === 1) return `${prefix}-${lpns[0]}.${extension}`;
    return `${prefix}-${lpns[0]}-${lpns[lpns.length - 1]}.${extension}`;
  }

  function splitListItemsTwoColumns(items) {
    const { rowsPerColumn } = getExportListLayout(true);
    const splitAt = Math.min(items.length, rowsPerColumn);
    return {
      left: items.slice(0, splitAt),
      right: items.slice(splitAt),
      splitAt,
    };
  }

  function buildCargoListTableRowsHtml(items, startIndex = 0, mode = 'list') {
    return items.map((item, index) => {
      const globalIndex = startIndex + index;
      if (mode === 'beladung') {
        return `
          <tr>
            <td>${globalIndex + 1}</td>
            <td><span class="cargo-list-color" style="background:${item.color}"></span>${escapeXml(itemLabel(item, globalIndex))}</td>
            <td>${formatBeladungHtml(item).replace(/<\/?p[^>]*>/g, '').replace(/<ul class="cargo-list-beladung">/, '<ul class="cargo-list-beladung" style="margin:0;padding-left:1rem;">')}</td>
          </tr>
        `;
      }
      const beladungCell = mode === 'both'
        ? `<td>${getItemBeladung(item).length ? getItemBeladung(item).map((line) => escapeXml(line)).join('<br>') : '—'}</td>`
        : '';
      return `
        <tr>
          <td>${globalIndex + 1}</td>
          <td><span class="cargo-list-color" style="background:${item.color}"></span>${escapeXml(itemLabel(item, globalIndex))}</td>
          <td>${item.length.toFixed(2)} × ${item.width.toFixed(2)} m</td>
          ${beladungCell}
        </tr>
      `;
    }).join('');
  }

  function buildCargoListTableHtml(items, mode = 'list') {
    const tableHead = mode === 'beladung'
      ? `
      <tr>
        <th>Nr.</th>
        <th>Ladegut</th>
        <th>Beladung</th>
      </tr>
    `
      : mode === 'both'
        ? `
      <tr>
        <th>Nr.</th>
        <th>Bezeichnung</th>
        <th>Maße</th>
        <th>Beladung</th>
      </tr>
    `
        : `
      <tr>
        <th>Nr.</th>
        <th>Bezeichnung</th>
        <th>Maße</th>
      </tr>
    `;

    if (!items.length) {
      return '<p class="cargo-list-empty">Kein Ladegut auf dieser Ladefläche.</p>';
    }

    const { left, right, splitAt } = splitListItemsTwoColumns(items);
    const renderTable = (colItems, colStart) => `
      <table class="cargo-list-table">
        <thead>${tableHead}</thead>
        <tbody>${buildCargoListTableRowsHtml(colItems, colStart, mode)}</tbody>
      </table>
    `;

    return `
      <div class="cargo-list-columns">
        ${renderTable(left, 0)}
        ${right.length ? renderTable(right, splitAt) : ''}
      </div>
    `;
  }

  function buildCargoPlanPreviewHtml() {
    const { lpn } = getCurrentPlanExportLpn();
    return getExportBedConfigs().map((config) => {
      const items = config.bedItems || [];
      const meta = `${config.truck.name} · ${config.sectionTitle} · Ladefläche ${config.bedDims.length.toFixed(2)} × ${config.bedDims.width.toFixed(2)} m`;
      const canvas = buildExportPlanPage({
        ...config,
        lpn,
      });
      const dataUrl = canvas.toDataURL('image/png');

      return `
        <section class="cargo-list-section cargo-plan-preview-section">
          <h3 class="cargo-list-section-title">Ladeplan – ${escapeXml(config.sectionTitle)}</h3>
          <p class="cargo-list-section-meta">${escapeXml(meta)} · ${items.length} Ladegut${items.length === 1 ? '' : 'stücke'}</p>
          <img class="cargo-plan-preview-img" src="${dataUrl}" alt="Ladeplan ${escapeXml(config.sectionTitle)}">
        </section>
      `;
    }).join('');
  }

  function buildCargoListLpnBannerHtml() {
    const lpn = getCurrentPlanLpn();
    if (!lpn) return '';
    return `<p class="cargo-list-lpn-banner">${escapeXml(lpn)}</p>`;
  }

  function buildCargoListSectionsHtml(mode) {
    const lpn = getCurrentPlanLpn();
    const lpnPrefix = lpn ? `${lpn} · ` : '';
    return getExportBedConfigs().map((config) => {
      const items = config.bedItems || [];
      const meta = `${config.truck.name} · ${config.sectionTitle} · Ladefläche ${config.bedDims.length.toFixed(2)} × ${config.bedDims.width.toFixed(2)} m`;

      return `
        <section class="cargo-list-section">
          <h3 class="cargo-list-section-title">${escapeXml(getCargoListTitle(mode))}</h3>
          <p class="cargo-list-section-meta">${escapeXml(lpnPrefix)}${escapeXml(meta)} · ${items.length} Stück · ${new Date().toLocaleString('de-DE')}</p>
          ${buildCargoListTableHtml(items, mode)}
        </section>
      `;
    }).join('');
  }

  function buildCargoListPreviewHtml(mode = 'list') {
    const configs = getExportBedConfigs();
    if (!configs.length) {
      return '<p class="cargo-list-empty">Kein Ladeplan vorhanden.</p>';
    }

    const lpnBanner = buildCargoListLpnBannerHtml();

    if (mode === 'plan') {
      return lpnBanner + buildCargoPlanPreviewHtml();
    }

    if (mode === 'all') {
      return lpnBanner
        + buildCargoPlanPreviewHtml()
        + buildCargoListSectionsHtml('list')
        + buildCargoListSectionsHtml('both')
        + buildCargoListSectionsHtml('beladung');
    }

    return lpnBanner + buildCargoListSectionsHtml(mode);
  }

  function buildExportPlanPage({
    truck,
    sectionTitle,
    bedDims,
    bedItems,
    bedCollidingIds,
    includeTotalWeight = false,
    lpn,
  }) {
    const pad = 48;
    const headerH = 96;
    const footerH = 24;
    const w = EXPORT_LANDSCAPE.w;
    const h = EXPORT_LANDSCAPE.h;
    const contentW = w - pad * 2;
    const contentH = h - pad * 2 - headerH - footerH;
    const exportScale = Math.min(contentW / bedDims.length, contentH / bedDims.width);
    const planW = bedDims.length * exportScale;
    const planH = bedDims.width * exportScale;
    const ox = pad + (contentW - planW) / 2;
    const oy = pad + headerH + (contentH - planH) / 2;
    const exp = document.createElement('canvas');
    exp.width = w;
    exp.height = h;
    const ectx = exp.getContext('2d');

    ectx.fillStyle = '#ffffff';
    ectx.fillRect(0, 0, w, h);

    let line3 = `Ladefläche: ${bedDims.length.toFixed(2)} × ${bedDims.width.toFixed(2)} m · Erstellt: ${new Date().toLocaleString('de-DE')}`;
    if (includeTotalWeight) {
      const totalWeight = getTotalWeight();
      line3 = `Gesamtgewicht: ${totalWeight.toLocaleString('de-DE')} / ${(truck.maxWeight || 0).toLocaleString('de-DE')} kg · ${line3}`;
    } else if (bedCollidingIds.size > 0) {
      line3 = `⚠ ${bedCollidingIds.size} Überlappung(en) · ${line3}`;
    }

    drawExportPageHeader(
      ectx,
      pad,
      truck,
      'Ladeplan',
      `${truck.name} · ${sectionTitle}`,
      line3,
      w,
      lpn,
    );

    drawExportBedPlan(ectx, bedDims, bedItems, bedCollidingIds, ox, oy, exportScale);
    return exp;
  }

  function renderExportListPage({
    truck,
    sectionTitle,
    bedDims,
    bedItems = [],
    columns,
    startIndex = 0,
    showMainHeader = true,
    totalCount,
    lpn,
    listLayout,
    mode = 'list',
  }) {
    const pad = 48;
    const layout = listLayout || getExportListLayout(showMainHeader);
    const w = EXPORT_PORTRAIT.w;
    const h = EXPORT_PORTRAIT.h;
    const exp = document.createElement('canvas');
    exp.width = w;
    exp.height = h;
    const ectx = exp.getContext('2d');
    const pageTitle = getCargoListTitle(mode);

    ectx.fillStyle = '#ffffff';
    ectx.fillRect(0, 0, w, h);

    const itemTotal = totalCount ?? (columns
      ? columns[0].length + columns[1].length
      : startIndex + bedItems.length);

    if (showMainHeader) {
      drawExportPageHeader(
        ectx,
        pad,
        truck,
        pageTitle,
        `${truck.name} · ${sectionTitle}`,
        `Ladefläche: ${bedDims.length.toFixed(2)} × ${bedDims.width.toFixed(2)} m · ${itemTotal} Ladegut${itemTotal === 1 ? '' : 'stücke'}`,
        w,
        lpn,
      );
    } else {
      ectx.save();
      ectx.textAlign = 'right';
      ectx.font = 'bold 16px Segoe UI, sans-serif';
      ectx.fillStyle = '#111827';
      if (lpn) ectx.fillText(lpn, w - pad, 34);
      ectx.textAlign = 'left';
      ectx.fillStyle = '#111827';
      ectx.font = 'bold 18px Segoe UI, sans-serif';
      ectx.fillText(`${pageTitle} (Fortsetzung)`, pad, 34);
      ectx.font = '13px Segoe UI, sans-serif';
      ectx.fillStyle = '#475569';
      ectx.fillText(`${truck.name} · ${sectionTitle}`, pad, 56);
      ectx.restore();
    }

    if (columns) {
      if (!columns[0].length && !columns[1].length) {
        drawExportCargoList(ectx, [], pad, pad + layout.headerH, '', 0, layout, mode);
      } else {
        drawExportCargoListColumns(ectx, columns, pad, pad + layout.headerH, layout, mode);
      }
    } else {
      drawExportCargoList(ectx, bedItems, pad, pad + layout.headerH, '', startIndex, layout, mode);
    }
    return exp;
  }

  function buildExportListPages(config, mode = 'list') {
    const items = config.bedItems || [];
    const totalCount = items.length;
    const pages = [];

    if (!items.length) {
      pages.push(renderExportListPage({
        ...config,
        columns: [[], []],
        showMainHeader: true,
        totalCount: 0,
        listLayout: getExportListLayout(true),
        mode,
      }));
      return pages;
    }

    packExportListItems(items, true, mode).forEach((page, pageNum) => {
      pages.push(renderExportListPage({
        ...config,
        columns: page.columns,
        showMainHeader: pageNum === 0,
        totalCount,
        listLayout: page.layout,
        mode,
      }));
    });

    return pages;
  }

  function buildExportPages(includeLists = true) {
    return buildExportData(includeLists).pages;
  }

  function buildCombinedExportCanvasFromPages(pages) {
    if (pages.length === 1) return pages[0].canvas;

    const pageGap = 32;
    const width = Math.max(...pages.map((page) => page.canvas.width));
    const height = pages.reduce((sum, page) => sum + page.canvas.height, 0) + pageGap * (pages.length - 1);
    const combined = document.createElement('canvas');
    combined.width = width;
    combined.height = height;
    const ctx = combined.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    let offsetY = 0;
    pages.forEach((page, index) => {
      ctx.drawImage(page.canvas, 0, offsetY);
      offsetY += page.canvas.height + (index < pages.length - 1 ? pageGap : 0);
    });

    return combined;
  }

  function buildCombinedExportCanvas(includeLists = true) {
    return buildCombinedExportCanvasFromPages(buildExportPages(includeLists));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const SAVE_FILE_TYPES = {
    pdf: { description: 'PDF-Dokument', accept: { 'application/pdf': ['.pdf'] } },
    png: { description: 'PNG-Bild', accept: { 'image/png': ['.png'] } },
    excel: { description: 'Excel-Tabelle', accept: { 'application/vnd.ms-excel': ['.xls'] } },
    json: { description: 'JSON-Datei', accept: { 'application/json': ['.json'] } },
  };

  async function saveBlobWithPicker(blob, filename, formatKey) {
    const fileTypes = SAVE_FILE_TYPES[formatKey];
    if (window.showSaveFilePicker && fileTypes) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [fileTypes],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch (error) {
        if (error?.name === 'AbortError') return false;
        console.warn('Speicherdialog nicht verfügbar, Fallback auf Download.', error);
      }
    }
    downloadBlob(blob, filename);
    return true;
  }

  async function canvasToJpegBytes(canvas) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) throw new Error('JPEG-Export fehlgeschlagen.');
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function buildPdfBlobFromPages(pages) {
    if (!pages.length) throw new Error('Keine Exportseiten vorhanden.');

    const encoder = new TextEncoder();
    const parts = [];
    let length = 0;

    const appendBytes = (bytes) => {
      parts.push(bytes);
      length += bytes.length;
    };
    const appendText = (text) => appendBytes(encoder.encode(text));

    appendText('%PDF-1.4\n');

    const offsets = [];
    let nextId = 1;
    const catalogId = nextId++;
    const pagesId = nextId++;
    const metas = [];

    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const landscape = page.type !== 'list';
      const pageWidth = landscape ? 842 : 595;
      const pageHeight = landscape ? 595 : 842;
      const jpeg = await canvasToJpegBytes(page.canvas);
      const imgW = page.canvas.width;
      const imgH = page.canvas.height;
      const scale = Math.min(pageWidth / imgW, pageHeight / imgH);
      const drawW = imgW * scale;
      const drawH = imgH * scale;
      const tx = (pageWidth - drawW) / 2;
      const ty = (pageHeight - drawH) / 2;
      metas.push({
        pageWidth,
        pageHeight,
        jpeg,
        imgW,
        imgH,
        tx,
        ty,
        drawW,
        drawH,
        imageName: `Im${index + 1}`,
        pageId: nextId++,
        contentId: nextId++,
        imageId: nextId++,
      });
    }

    const writeObj = (id, writer) => {
      offsets[id] = length;
      appendText(`${id} 0 obj\n`);
      writer();
      appendText('\nendobj\n');
    };

    const kidRefs = [];
    metas.forEach((meta) => {
      writeObj(meta.imageId, () => {
        appendText(`<< /Type /XObject /Subtype /Image /Width ${meta.imgW} /Height ${meta.imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${meta.jpeg.length} >>\nstream\n`);
        appendBytes(meta.jpeg);
        appendText('\nendstream');
      });

      const stream = `q ${meta.drawW.toFixed(2)} 0 0 ${meta.drawH.toFixed(2)} ${meta.tx.toFixed(2)} ${meta.ty.toFixed(2)} cm /${meta.imageName} Do Q\n`;
      const streamBytes = encoder.encode(stream);
      writeObj(meta.contentId, () => {
        appendText(`<< /Length ${streamBytes.length} >>\nstream\n`);
        appendBytes(streamBytes);
        appendText('endstream');
      });

      writeObj(meta.pageId, () => {
        appendText(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${meta.pageWidth} ${meta.pageHeight}] /Resources << /XObject << /${meta.imageName} ${meta.imageId} 0 R >> >> /Contents ${meta.contentId} 0 R >>`);
      });

      kidRefs.push(`${meta.pageId} 0 R`);
    });

    writeObj(pagesId, () => {
      appendText(`<< /Type /Pages /Kids [${kidRefs.join(' ')}] /Count ${kidRefs.length} >>`);
    });

    writeObj(catalogId, () => {
      appendText(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    });

    const xrefPos = length;
    appendText(`xref\n0 ${nextId}\n`);
    appendText('0000000000 65535 f \n');
    for (let id = 1; id < nextId; id += 1) {
      appendText(`${String(offsets[id] || 0).padStart(10, '0')} 00000 n \n`);
    }
    appendText(`trailer\n<< /Size ${nextId} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);

    return new Blob(parts, { type: 'application/pdf' });
  }

  function buildPlanJsonBlob({ completed = false } = {}) {
    ensurePlanLpn();
    const lpn = getCurrentPlanLpn();
    const state = completed
      ? { ...serializeState(), completedAt: new Date().toISOString() }
      : serializeState();
    return {
      blob: new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }),
      filename: lpn ? `${lpn}.json` : `ladeplan-${Date.now()}.json`,
    };
  }

  function buildExcelBlob(exportData, mode) {
    const xml = mode === 'all'
      ? buildExcelWorkbook(exportData.sections, 'all')
      : mode === 'plan'
        ? buildExcelWorkbook(exportData.sections, null)
        : buildExcelListWorkbook(exportData.sections, mode);
    return new Blob([`\ufeff${xml}`], { type: 'application/vnd.ms-excel' });
  }

  async function saveAllPlanFormats(mode, exportLpn = null, { completed = false } = {}) {
    const formats = ['pdf', 'png', 'excel', 'json'];

    if (window.showDirectoryPicker) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        for (const format of formats) {
          const saved = await savePlanExport(format, mode, exportLpn, {
            completed,
            directoryHandle: dirHandle,
          });
          if (!saved) return false;
        }
        return true;
      } catch (error) {
        if (error?.name === 'AbortError') return false;
        console.warn('Ordnerauswahl nicht verfügbar, einzelne Speicherdialoge werden verwendet.', error);
      }
    }

    for (const format of formats) {
      const saved = await savePlanExport(format, mode, exportLpn, { completed });
      if (!saved) return false;
    }
    return true;
  }

  async function savePlanExport(format, mode = 'all', exportLpn = null, options = {}) {
    const { completed = false, directoryHandle = null } = options;

    if (format === 'json') {
      const { blob, filename } = buildPlanJsonBlob({ completed });
      if (directoryHandle) {
        const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      }
      return saveBlobWithPicker(blob, filename, 'json');
    }

    if (format === 'all') {
      return saveAllPlanFormats(mode, exportLpn, { completed });
    }

    if (exportLpn == null && getTruck()) ensurePlanLpn();
    const exportData = getListExportData(mode, exportLpn);
    if (!exportData.pages.length) {
      alert('Kein Ladeplan zum Speichern vorhanden.');
      return false;
    }

    const extension = format === 'excel' ? 'xls' : format;
    const filename = buildListExportFilename(exportData.lpns, extension, mode);

    let blob;
    if (format === 'png') {
      const exp = buildCombinedExportCanvasFromPages(exportData.pages);
      blob = await new Promise((resolve) => exp.toBlob(resolve, 'image/png'));
      if (!blob) return false;
    } else if (format === 'pdf') {
      blob = await buildPdfBlobFromPages(exportData.pages);
    } else if (format === 'excel') {
      blob = buildExcelBlob(exportData, mode);
    } else {
      return false;
    }

    if (directoryHandle) {
      const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    }

    return saveBlobWithPicker(blob, filename, format);
  }

  function printPlanPdf(mode = 'all', exportLpn = null) {
    if (exportLpn == null && getTruck()) ensurePlanLpn();
    const exportData = getListExportData(mode, exportLpn);
    if (!exportData.pages.length) {
      alert('Kein Ladeplan zum Drucken vorhanden.');
      return false;
    }
    exportPdfPages(exportData.pages, exportData.lpns);
    return true;
  }

  function printPlanExcel(mode = 'all', exportLpn = null) {
    if (exportLpn == null && getTruck()) ensurePlanLpn();
    const exportData = getListExportData(mode, exportLpn);
    if (!exportData.pages.length) {
      alert('Kein Ladeplan zum Drucken vorhanden.');
      return false;
    }
    const filename = buildListExportFilename(exportData.lpns, 'xls', mode);
    downloadBlob(buildExcelBlob(exportData, mode), filename);
    return true;
  }

  function downloadText(content, filename, mimeType) {
    downloadBlob(new Blob([content], { type: mimeType }), filename);
  }

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function excelCell(value, type = 'String', wrap = false) {
    const safe = escapeXml(value ?? '');
    const style = wrap ? ' ss:StyleID="Wrap"' : '';
    return `<Cell${style}><Data ss:Type="${type}">${safe}</Data></Cell>`;
  }

  function excelRow(cells, heightPt = null) {
    const heightAttr = heightPt ? ` ss:Height="${heightPt}"` : '';
    return `<Row${heightAttr}>${cells.join('')}</Row>`;
  }

  function excelWorkbookStyles() {
    return `<Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Top"/>
    </Style>
    <Style ss:ID="Wrap" ss:Name="Wrap">
      <Alignment ss:Vertical="Top" ss:WrapText="1"/>
    </Style>
  </Styles>`;
  }

  function estimateExcelListRowHeight(item, mode) {
    if (mode === 'list') return null;
    const ectx = getExportMeasureCtx();
    const beladungLines = getItemBeladung(item).reduce((sum, entry) => (
      sum + wrapCanvasText(ectx, entry, 280).length
    ), 0) || 1;
    const labelLines = wrapCanvasText(ectx, itemLabel(item, 0), 180).length;
    return Math.max(18, (labelLines + beladungLines + 2) * 15);
  }

  function sanitizeSheetName(name) {
    return String(name).replace(/[\\/*?:[\]]/g, ' ').slice(0, 31).trim() || 'Sheet';
  }

  function buildExcelPlanSheet(section) {
    const rows = [
      excelRow([excelCell('LPN'), excelCell(section.lpn)]),
      excelRow([excelCell('Typ'), excelCell('Ladeplan')]),
      excelRow([excelCell('Fahrzeug'), excelCell(section.truck.name)]),
      excelRow([excelCell('Bereich'), excelCell(section.sectionTitle)]),
      excelRow([excelCell('Ladefläche L × B (m)'), excelCell(`${section.bedDims.length.toFixed(2)} × ${section.bedDims.width.toFixed(2)}`)]),
      excelRow([excelCell('Erstellt'), excelCell(new Date().toLocaleString('de-DE'))]),
      excelRow([excelCell('')]),
      excelRow([
        excelCell('Nr.'),
        excelCell('Bezeichnung'),
        excelCell('Länge (m)'),
        excelCell('Breite (m)'),
        excelCell('Gewicht (kg)'),
        excelCell('Position X (m)'),
        excelCell('Position Y (m)'),
        excelCell('Rotation (°)'),
      ]),
    ];

    section.bedItems.forEach((item, index) => {
      rows.push(excelRow([
        excelCell(String(index + 1), 'Number'),
        excelCell(itemLabel(item, index)),
        excelCell(item.length.toFixed(2), 'Number'),
        excelCell(item.width.toFixed(2), 'Number'),
        excelCell(item.weight != null ? String(item.weight) : '', 'Number'),
        excelCell(item.x.toFixed(2), 'Number'),
        excelCell(item.y.toFixed(2), 'Number'),
        excelCell(item.rotation || 0, 'Number'),
      ]));
    });

    const sheetName = sanitizeSheetName(`${section.lpn} Plan`);
    return `<Worksheet ss:Name="${escapeXml(sheetName)}"><Table>${rows.join('')}</Table></Worksheet>`;
  }

  function buildExcelListItemCells(item, globalIndex, mode = 'list') {
    const colCount = mode === 'beladung' ? 3 : mode === 'both' ? 4 : 3;
    if (!item) {
      return Array.from({ length: colCount }, () => excelCell(''));
    }

    const beladungText = getItemBeladung(item).join('\n');
    if (mode === 'beladung') {
      return [
        excelCell(String(globalIndex + 1), 'Number'),
        excelCell(itemLabel(item, globalIndex), 'String', true),
        excelCell(beladungText || '— keine Beladung —', 'String', true),
      ];
    }
    if (mode === 'both') {
      return [
        excelCell(String(globalIndex + 1), 'Number'),
        excelCell(itemLabel(item, globalIndex), 'String', true),
        excelCell(`${item.length.toFixed(2)} × ${item.width.toFixed(2)}`),
        excelCell(beladungText || '—', 'String', true),
      ];
    }
    return [
      excelCell(String(globalIndex + 1), 'Number'),
      excelCell(itemLabel(item, globalIndex)),
      excelCell(`${item.length.toFixed(2)} × ${item.width.toFixed(2)}`),
    ];
  }

  function getExcelListColumnCount(mode = 'list') {
    if (mode === 'beladung') return 3;
    if (mode === 'both') return 4;
    return 3;
  }

  function buildExcelListSheet(section, mode = 'list') {
    const items = section.bedItems || [];
    const { left, right, splitAt } = splitListItemsTwoColumns(items);
    const maxRows = Math.max(left.length, right.length, items.length ? 0 : 1);
    const colCount = getExcelListColumnCount(mode);
    const headerBlock = mode === 'beladung'
      ? [
        excelCell('Nr.'),
        excelCell('Ladegut'),
        excelCell('Beladung'),
      ]
      : mode === 'both'
        ? [
          excelCell('Nr.'),
          excelCell('Bezeichnung'),
          excelCell('L × B (m)'),
          excelCell('Beladung'),
        ]
        : [
          excelCell('Nr.'),
          excelCell('Bezeichnung'),
          excelCell('L × B (m)'),
        ];
    const sheetSuffix = mode === 'beladung' ? 'Beladung' : mode === 'both' ? 'Ladegut Beladung' : 'Ladegut';

    const rows = [
      excelRow([excelCell('LPN'), excelCell(section.lpn)]),
      excelRow([excelCell('Typ'), excelCell(getCargoListTitle(mode))]),
      excelRow([excelCell('Fahrzeug'), excelCell(section.truck.name)]),
      excelRow([excelCell('Bereich'), excelCell(section.sectionTitle)]),
      excelRow([excelCell('Ladefläche L × B (m)'), excelCell(`${section.bedDims.length.toFixed(2)} × ${section.bedDims.width.toFixed(2)}`)]),
      excelRow([excelCell('Anzahl Ladegut'), excelCell(String(items.length), 'Number')]),
      excelRow([excelCell('Erstellt'), excelCell(new Date().toLocaleString('de-DE'))]),
      excelRow([excelCell('')]),
    ];

    if (mode === 'list') {
      rows.push(excelRow([
        ...headerBlock,
        excelCell(''),
        ...headerBlock,
      ]));
    }

    if (!items.length) {
      rows.push(excelRow([
        excelCell('Kein Ladegut auf dieser Ladefläche.'),
        ...Array.from({ length: mode === 'list' ? colCount * 2 : colCount }, () => excelCell('')),
      ]));
    } else if (mode === 'list') {
      for (let i = 0; i < maxRows; i += 1) {
        rows.push(excelRow([
          ...buildExcelListItemCells(left[i], i, mode),
          excelCell(''),
          ...buildExcelListItemCells(right[i], splitAt + i, mode),
        ]));
      }
    } else {
      rows.push(excelRow(headerBlock));
      items.forEach((item, i) => {
        rows.push(excelRow(
          buildExcelListItemCells(item, i, mode),
          estimateExcelListRowHeight(item, mode),
        ));
      });
    }

    const sheetName = sanitizeSheetName(`${section.lpn} ${sheetSuffix}`);
    return `<Worksheet ss:Name="${escapeXml(sheetName)}"><Table>${rows.join('')}</Table></Worksheet>`;
  }

  function buildExcelListWorkbook(sections, mode = 'list') {
    const worksheets = sections.map((section) => buildExcelListSheet(section, mode));
    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  ${excelWorkbookStyles()}
  ${worksheets.join('\n  ')}
</Workbook>`;
  }

  function buildExcelWorkbook(sections, listMode = 'both') {
    const worksheets = sections.flatMap((section) => {
      if (listMode === 'all') {
        return [
          buildExcelPlanSheet(section),
          buildExcelListSheet(section, 'list'),
          buildExcelListSheet(section, 'both'),
          buildExcelListSheet(section, 'beladung'),
        ];
      }
      const sheets = [buildExcelPlanSheet(section)];
      if (listMode) sheets.push(buildExcelListSheet(section, listMode));
      return sheets;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  ${excelWorkbookStyles()}
  ${worksheets.join('\n  ')}
</Workbook>`;
  }

  function runListExport(format, mode = getSelectedCargoListMode(), exportLpn = null) {
    if (format === 'pdf') return printPlanPdf(mode, exportLpn);
    if (format === 'excel') return printPlanExcel(mode, exportLpn);
    return savePlanExport(format, mode, exportLpn);
  }

  function runExport(format, includeLists) {
    const exportData = buildExportData(includeLists);
    const extension = format === 'excel' ? 'xls' : format;
    const filename = buildExportFilename(exportData.lpns, extension);

    if (format === 'png') {
      const exp = buildCombinedExportCanvasFromPages(exportData.pages);
      exp.toBlob((blob) => {
        if (blob) downloadBlob(blob, filename);
      }, 'image/png');
      return;
    }

    if (format === 'pdf') {
      exportPdfPages(exportData.pages, exportData.lpns);
      return;
    }

    if (format === 'excel') {
      const xml = buildExcelWorkbook(exportData.sections, includeLists ? 'both' : null);
      downloadText(`\ufeff${xml}`, filename, 'application/vnd.ms-excel');
    }
  }

  function exportPdfPages(pages, lpns, { autoPrint = true, documentTitle = null } = {}) {
    const title = documentTitle || (lpns.length ? lpns.join(', ') : 'Ladeplan Export');
    const pagesHtml = pages.map((page, index) => {
      const dataUrl = page.canvas.toDataURL('image/png');
      const isLast = index === pages.length - 1;
      const onload = isLast && autoPrint ? ' onload="window.print()"' : '';
      const typeClass = page.type === 'list' ? ' export-page-list' : ' export-page-plan';
      return `<section class="export-page${typeClass}${isLast ? ' export-page-last' : ''}"><img src="${dataUrl}" alt="Ladeplan ${index + 1}"${onload}></section>`;
    }).join('');

    const win = window.open('', '_blank');
    if (!win) {
      alert('Pop-up blockiert – bitte Pop-ups erlauben für PDF-Export.');
      return;
    }
    win.document.write(`
      <!DOCTYPE html>
      <html lang="de">
      <head>
        <title>${escapeXml(title)}</title>
        <style>
          body { margin: 0; background: #fff; }
          .export-page {
            display: block;
            page-break-inside: avoid;
            break-inside: avoid;
            padding: 0;
          }
          .export-page-plan img {
            width: 100%;
            max-width: 297mm;
            height: auto;
            display: block;
          }
          .export-page-list img {
            width: 100%;
            max-width: 210mm;
            height: auto;
            display: block;
          }
          @media print {
            @page plan-landscape {
              size: A4 landscape;
              margin: 10mm;
            }
            @page list-portrait {
              size: A4 portrait;
              margin: 10mm;
            }
            body { margin: 0; }
            .export-page {
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .export-page-plan { page: plan-landscape; }
            .export-page-list { page: list-portrait; }
            .export-page + .export-page {
              page-break-before: always;
              break-before: page;
            }
            .export-page-plan img {
              width: 100%;
              max-width: none;
              max-height: 190mm;
              object-fit: contain;
            }
            .export-page-list img {
              width: 100%;
              max-width: none;
              max-height: 277mm;
              object-fit: contain;
            }
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
      </body>
      </html>
    `);
    win.document.close();
  }

  function viewCargoListAsPdf() {
    const mode = getSelectedCargoListMode();

    ensurePlanLpn();
    const exportData = getListExportData(mode);
    if (!exportData.pages.length) {
      alert('Kein Ladeplan zum Anzeigen vorhanden.');
      return;
    }

    exportPdfPages(exportData.pages, exportData.lpns, {
      autoPrint: false,
      documentTitle: getCargoListTitle(mode),
    });
  }

  function getCargoListDialogPurpose() {
    const dialog = document.getElementById('cargo-list-dialog');
    return dialog?.dataset.purpose === 'export' ? 'export' : 'view';
  }

  function setCargoListDialogPurpose(purpose) {
    const dialog = document.getElementById('cargo-list-dialog');
    if (!dialog) return;
    dialog.dataset.purpose = purpose === 'export' ? 'export' : 'view';

    const title = document.getElementById('cargo-list-dialog-title');
    if (title) {
      title.textContent = purpose === 'export' ? 'Export' : 'Ladung';
    }

    if (purpose === 'view') {
      resetCargoListExportPreviewState();
    }
  }

  function getSelectedExportPreviewFormat() {
    const selected = document.querySelector('input[name="cargo-list-preview-format"]:checked');
    return selected?.value === 'png' ? 'png' : 'pdf';
  }

  function updateCargoListPreviewButton() {
    const button = document.getElementById('cargo-list-btn-preview');
    if (!button) return;
    const active = cargoListExportPreviewActive;
    button.textContent = active ? 'Vorschau beenden' : 'Vorschau';
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  function endCargoListExportPreview() {
    cargoListExportPreviewActive = false;
    updateCargoListPreviewButton();
    refreshCargoListPreview();
  }

  function startCargoListExportPreview() {
    cargoListExportPreviewActive = true;
    updateCargoListPreviewButton();
    previewCargoListExport();
  }

  function toggleCargoListExportPreview() {
    if (cargoListExportPreviewActive) {
      endCargoListExportPreview();
      return;
    }
    startCargoListExportPreview();
  }

  function previewCargoListExport() {
    ensurePlanLpn();
    const content = document.getElementById('cargo-list-dialog-content');
    if (!content) return;

    const mode = getSelectedCargoListMode();
    const format = getSelectedExportPreviewFormat();
    const exportData = getListExportData(mode);
    if (!exportData.pages.length) {
      content.innerHTML = '<p class="cargo-list-empty">Kein Ladeplan zum Anzeigen vorhanden.</p>';
      return;
    }

    const title = escapeXml(getCargoListTitle(mode));

    if (format === 'png') {
      const canvas = buildCombinedExportCanvasFromPages(exportData.pages);
      const dataUrl = canvas.toDataURL('image/png');
      content.innerHTML = `<img class="cargo-export-preview-img cargo-export-preview-png" src="${dataUrl}" alt="Vorschau ${title}">`;
      return;
    }

    const pagesHtml = exportData.pages.map((page, index) => {
      const dataUrl = page.canvas.toDataURL('image/png');
      const typeClass = page.type === 'list'
        ? 'cargo-export-preview-page-list'
        : 'cargo-export-preview-page-plan';
      return `
        <figure class="cargo-export-preview-page ${typeClass}">
          <img src="${dataUrl}" alt="Vorschau ${title} – Seite ${index + 1}">
        </figure>
      `;
    }).join('');

    content.innerHTML = `<div class="cargo-export-preview-pdf">${pagesHtml}</div>`;
  }

  function refreshCargoListDialogContent() {
    if (getCargoListDialogPurpose() === 'export' && cargoListExportPreviewActive) {
      previewCargoListExport();
      return;
    }
    refreshCargoListPreview();
  }

  function resetCargoListExportPreviewState() {
    cargoListExportPreviewActive = false;
    updateCargoListPreviewButton();
  }

  function refreshCargoListPreview() {
    if (getCargoListDialogPurpose() === 'export' && getTruck()) ensurePlanLpn();
    const content = document.getElementById('cargo-list-dialog-content');
    if (!content) return;
    content.innerHTML = buildCargoListPreviewHtml(getSelectedCargoListMode());
  }

  function openCargoListViewDialog() {
    const dialog = document.getElementById('cargo-list-dialog');
    if (!dialog) return;
    setCargoListDialogPurpose('view');
    refreshCargoListPreview();
    dialog.classList.remove('hidden');
  }

  function openCargoExportDialog() {
    const dialog = document.getElementById('cargo-list-dialog');
    if (!dialog) return;
    resetCargoListExportPreviewState();
    setCargoListDialogPurpose('export');
    refreshCargoListPreview();
    dialog.classList.remove('hidden');
  }

  function openCargoListDialog() {
    openCargoListViewDialog();
  }

  function closeCargoListDialog() {
    const dialog = document.getElementById('cargo-list-dialog');
    if (!dialog) return;
    resetCargoListExportPreviewState();
    dialog.classList.add('hidden');
  }

  function openBeladungDialog(itemId) {
    const item = findItemById(itemId);
    const dialog = document.getElementById('beladung-dialog');
    const nameEl = document.getElementById('beladung-dialog-item-name');
    const input = document.getElementById('beladung-dialog-input');
    if (!item || !dialog || !input) return;

    beladungDialogItemId = itemId;
    if (nameEl) {
      nameEl.textContent = `${item.label || 'Ladegut'} · ${item.length.toFixed(2)} × ${item.width.toFixed(2)} m`;
    }
    input.value = formatBeladungText(item);
    dialog.classList.remove('hidden');
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }

  function closeBeladungDialog() {
    const dialog = document.getElementById('beladung-dialog');
    if (!dialog) return;
    dialog.classList.add('hidden');
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
    updateUI();
    draw();
    scheduleSave();
    closeBeladungDialog();
  }

  function initBeladungDialog() {
    const dialog = document.getElementById('beladung-dialog');
    const panel = dialog?.querySelector('.beladung-dialog-panel');
    if (!dialog) return;

    document.getElementById('beladung-dialog-backdrop')?.addEventListener('click', closeBeladungDialog);
    document.getElementById('beladung-dialog-cancel')?.addEventListener('click', closeBeladungDialog);
    document.getElementById('beladung-dialog-save')?.addEventListener('click', saveBeladungDialog);

    const input = document.getElementById('beladung-dialog-input');
    input?.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        closeBeladungDialog();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        saveBeladungDialog();
      }
    });

    dialog.addEventListener('keydown', (event) => {
      if (dialog.classList.contains('hidden')) return;
      trapFocusInDialog(panel || dialog, event);
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeBeladungDialog();
      }
    });
  }

  function initCargoListDialog() {
    const dialog = document.getElementById('cargo-list-dialog');
    if (!dialog) return;

    document.getElementById('btn-cargo-list')?.addEventListener('click', openCargoListViewDialog);
    document.getElementById('cargo-list-dialog-backdrop')?.addEventListener('click', closeCargoListDialog);
    document.getElementById('cargo-list-btn-close')?.addEventListener('click', closeCargoListDialog);
    document.getElementById('cargo-list-btn-view-pdf')?.addEventListener('click', viewCargoListAsPdf);
    document.getElementById('cargo-list-btn-preview')?.addEventListener('click', toggleCargoListExportPreview);

    dialog.querySelectorAll('input[name="cargo-list-mode"]').forEach((radio) => {
      radio.addEventListener('change', refreshCargoListDialogContent);
    });

    dialog.querySelectorAll('input[name="cargo-list-preview-format"]').forEach((radio) => {
      radio.addEventListener('change', refreshCargoListDialogContent);
    });

    const handleListExport = (format) => {
      runListExport(format, getSelectedCargoListMode());
    };

    document.getElementById('cargo-list-btn-pdf')?.addEventListener('click', () => handleListExport('pdf'));
    document.getElementById('cargo-list-btn-png')?.addEventListener('click', () => handleListExport('png'));
    document.getElementById('cargo-list-btn-excel')?.addEventListener('click', () => handleListExport('excel'));
  }

  function buildExportCanvas() {
    return buildCombinedExportCanvas(true);
  }

  function buildItemsFromAutoList() {
    const built = [];
    CARGO_PRESETS.forEach((preset) => {
      const input = document.getElementById(`auto-qty-${preset.id}`);
      const qty = parseInt(input?.value, 10) || 0;
      for (let i = 0; i < qty; i += 1) {
        built.push({
          id: uid(),
          length: preset.length,
          width: preset.width,
          label: qty > 1 ? `${preset.name} ${i + 1}` : preset.name,
          color: preset.color,
          weight: null,
        });
      }
    });
    return built;
  }

  function getPackOptions() {
    const useGrid = document.getElementById('snap-grid').checked;
    return {
      allowRotate: document.getElementById('auto-rotate').checked,
      gridStep: useGrid ? GRID_M : 0,
      maxWeight: document.getElementById('auto-respect-weight').checked
        ? getTruck().maxWeight
        : Infinity,
    };
  }

  function showAutoResult(result, totalCount, multiBed) {
    const collisionCount = getCollidingIds().size;
    const pct = (result.utilization * 100).toFixed(1);
    if (totalCount === 0) {
      autoResult.className = 'stat-info warning';
      autoResult.textContent = 'Kein Ladegut zum Verpacken vorhanden.';
      return;
    }

    const truckPct = result.truckUtilization != null
      ? (result.truckUtilization * 100).toFixed(1)
      : null;
    const trailerPct = result.trailerUtilization != null
      ? (result.trailerUtilization * 100).toFixed(1)
      : null;
    const bedDetail = multiBed && truckPct != null && trailerPct != null
      ? `<br>Zugfahrzeug: ${truckPct}% · Anhänger: ${trailerPct}%`
      : '';

    if (result.unplaced.length > 0) {
      autoResult.className = 'stat-info warning';
      autoResult.innerHTML = `
        <strong>${result.placedCount} / ${totalCount} platziert (ohne Überlappung)</strong><br>
        Flächenauslastung gesamt: ${pct}%${bedDetail}<br>
        ${result.unplaced.length} Ladegut${result.unplaced.length > 1 ? 'stücke' : ''} passen nicht auf die Ladeflächen
        ${collisionCount > 0 ? `<br><strong>⚠ ${collisionCount} Überlappung${collisionCount > 1 ? 'en' : ''} erkannt</strong>` : ''}
      `;
      return;
    }

    if (collisionCount > 0) {
      autoResult.className = 'stat-info warning';
      autoResult.innerHTML = `
        <strong>⚠ ${collisionCount} Überlappung${collisionCount > 1 ? 'en' : ''} im Plan</strong><br>
        ${result.placedCount} Ladegüter platziert · ${pct}% Fläche gesamt${bedDetail}
      `;
      return;
    }

    autoResult.className = 'stat-info ok';
    autoResult.innerHTML = `
      <strong>Optimaler Plan erstellt (lückenlos)</strong><br>
      ${result.placedCount} Ladegüter · ${pct}% Fläche gesamt${bedDetail} · ${result.usedWeight.toLocaleString('de-DE')} kg
    `;
  }

  function mergePlacedWithOriginal(placed, sourceItems) {
    return placed.map((placedItem) => {
      const original = sourceItems.find((item) => item.id === placedItem.id);
      if (!original) return placedItem;
      const merged = { ...original, ...placedItem };
      merged.rotation = inferRotationAfterPlacement(original, placedItem);
      return merged;
    });
  }

  function applyPackedItems(placed, sourceItems) {
    return placed.map((placedItem) => {
      const source = sourceItems.find((item) => item.id === placedItem.id);
      if (!source) return { ...placedItem, rotation: placedItem.rotation || 0 };
      return {
        ...placedItem,
        rotation: inferRotationAfterPlacement(source, placedItem),
      };
    });
  }

  function runAutoPack() {
    const truck = getTruck();
    if (!truck) {
      alert('Bitte zuerst ein Fahrzeug wählen.');
      return;
    }
    const anhaenger = isAnhaenger(truck);
    const mode = autoMode.value;
    let sourceItems = [];

    if (mode === 'optimize') {
      const existingItems = getAllItems();
      if (!existingItems.length) {
        alert('Kein Ladegut vorhanden. Bitte zuerst Ladegut hinzufügen oder „Aus Ladegut“ wählen.');
        return;
      }
      sourceItems = existingItems.map((item) => ({ ...item }));
    } else {
      sourceItems = buildItemsFromAutoList();
      if (!sourceItems.length) {
        alert('Bitte mindestens ein Ladegut mit Anzahl > 0 angeben.');
        return;
      }
    }

    pushUndo();

    let packResult;
    let packTotalCount = sourceItems.length;
    let packMultiBed = false;

    if (anhaenger) {
      const truckBed = getBedDims(truck, 'truck');
      const trailerBed = getBedDims(truck, 'trailer');
      packResult = LadeplanPacker.packBestMultiBed(
        truckBed.length,
        truckBed.width,
        trailerBed.length,
        trailerBed.width,
        sourceItems,
        getPackOptions(),
      );
      packMultiBed = true;

      if (mode === 'from-list') {
        items = applyPackedItems(packResult.truck, sourceItems);
        trailerItems = applyPackedItems(packResult.trailer, sourceItems);
        colorIndex = getAllItems().length;
      } else {
        items = mergePlacedWithOriginal(packResult.truck, sourceItems);
        trailerItems = mergePlacedWithOriginal(packResult.trailer, sourceItems);
      }
    } else {
      const dims = getBedDims(truck, 'truck');
      packResult = LadeplanPacker.packBest(
        dims.length,
        dims.width,
        sourceItems,
        getPackOptions(),
      );

      if (mode === 'from-list') {
        items = applyPackedItems(packResult.placed, sourceItems);
        trailerItems = [];
        colorIndex = items.length;
      } else {
        items = mergePlacedWithOriginal(packResult.placed, sourceItems);
        trailerItems = [];
      }
    }

    selectedId = null;
    clampAllItems();
    showAutoResult(packResult, packTotalCount, packMultiBed);
    updateUI();
    draw();
    scheduleSave();
  }

  function initAutoList() {
    autoList.innerHTML = '';
    CARGO_PRESETS.forEach((preset) => {
      const row = document.createElement('div');
      row.className = 'auto-list-row';
      row.innerHTML = `
        <span>${preset.name}</span>
        <input type="number" id="auto-qty-${preset.id}" min="0" max="99" step="1" value="0">
      `;
      autoList.appendChild(row);
    });

    autoMode.addEventListener('change', () => {
      autoListPanel.classList.toggle('hidden', autoMode.value !== 'from-list');
    });
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
  }

  function initPresets() {
    CARGO_PRESETS.forEach((preset) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-btn';
      btn.innerHTML = `${preset.name}<span>${preset.length} × ${preset.width} m</span>`;
      btn.style.borderLeftColor = preset.color;
      btn.style.borderLeftWidth = '3px';
      btn.addEventListener('click', () => {
        addCargo({
          length: preset.length,
          width: preset.width,
          label: preset.name,
          color: preset.color,
          quantity: getCargoQuantity(),
        });
      });
      cargoPresets.appendChild(btn);
    });
  }

  function bindEvents() {
    if (cargoDetailContent) {
      cargoDetailContent.addEventListener('contextmenu', (event) => {
        if (!selectedId) return;
        event.preventDefault();
        showContextMenu(event.clientX, event.clientY, selectedId);
      });
      cargoDetailContent.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-action="view-beladung"]');
        if (!btn || !selectedId) return;
        openBeladungDialog(selectedId);
      });
    }

    if (contextMenuWeightInput) {
      contextMenuWeightInput.addEventListener('focus', armWeightUndo);
      contextMenuWeightInput.addEventListener('input', () => {
        applyContextMenuWeight();
      });
      contextMenuWeightInput.addEventListener('blur', () => {
        weightUndoArmed = false;
      });
      contextMenuWeightInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          applyContextMenuWeight();
          weightUndoArmed = false;
          hideContextMenu();
        }
        event.stopPropagation();
      });
      contextMenuWeightInput.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
      });
    }

    if (cargoDetailWeightInput) {
      cargoDetailWeightInput.addEventListener('focus', armWeightUndo);
      cargoDetailWeightInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          finishCargoWeightEdit();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          weightUndoArmed = false;
          closeCargoWeightEdit();
          updateCargoWeightButton(findItemById(selectedId));
        }
        event.stopPropagation();
      });
      cargoDetailWeightInput.addEventListener('blur', () => {
        if (!cargoWeightEditing) return;
        finishCargoWeightEdit();
      });
    }

    if (btnCargoWeight) {
      btnCargoWeight.addEventListener('click', () => {
        openCargoWeightEdit();
      });
    }

    if (btnCargoBeladen) {
      btnCargoBeladen.addEventListener('click', () => {
        if (!selectedId) return;
        openBeladungDialog(selectedId);
      });
    }

    truckSelect.addEventListener('change', () => {
      if (getTruck()) {
        ensurePlanLpn();
      }
      migrateAnhaengerItems(getTruck());
      clampAllItems();
      updateUI();
      draw();
      scheduleSave();
    });
    customLength.addEventListener('input', () => { updateUI(); draw(); scheduleSave(); });
    customWidth.addEventListener('input', () => { updateUI(); draw(); scheduleSave(); });
    customMaxWeight.addEventListener('input', () => { updateUI(); draw(); scheduleSave(); });

    document.getElementById('btn-add-cargo').addEventListener('click', () => {
      const lengthCm = parseFloat(document.getElementById('cargo-length').value);
      const widthCm = parseFloat(document.getElementById('cargo-width').value);
      const length = lengthCm / 100;
      const width = widthCm / 100;
      const weight = normalizeWeight(document.getElementById('cargo-weight').value);
      const label = document.getElementById('cargo-label').value.trim();
      const quantity = getCargoQuantity();
      if (!lengthCm || !widthCm || lengthCm <= 0 || widthCm <= 0) {
        alert('Bitte gültige Maße in cm eingeben.');
        return;
      }
      addCargo({ length, width, label, weight, quantity, customDimensions: true });
      document.getElementById('cargo-weight').value = '';
    });

    document.getElementById('btn-rotate').addEventListener('click', rotateSelected);
    document.getElementById('btn-delete').addEventListener('click', deleteSelected);
    document.getElementById('btn-clear').addEventListener('click', clearAll);
    if (btnUndo) btnUndo.addEventListener('click', undoLastStep);
    initCargoListDialog();
    initBeladungDialog();
    initSavePlanDialog();
    initCanvasPrintDialog();
    initCompletePlanDialog();
    document.getElementById('btn-print-pdf')?.addEventListener('click', () => { printPlanPdf('all'); });
    document.getElementById('btn-print-excel')?.addEventListener('click', () => { printPlanExcel('all'); });
    document.getElementById('btn-save-plan')?.addEventListener('click', () => { openSavePlanDialog(); });
    document.getElementById('btn-load-json').addEventListener('click', () => fileImport.click());
    document.getElementById('btn-auto-pack').addEventListener('click', runAutoPack);
    fileImport.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importJsonFile(file);
      e.target.value = '';
    });

    ['snap-grid', 'show-grid', 'show-dimensions'].forEach((id) => {
      document.getElementById(id).addEventListener('change', draw);
    });

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('mousemove', (event) => {
      updateCanvasCursor(event.clientX, event.clientY, canvas, items);
      updateHoveredItem(event.clientX, event.clientY);
    });
    canvas.addEventListener('mouseleave', () => {
      canvas.style.cursor = '';
      clearHoveredItem();
    });
    canvas.addEventListener('dblclick', (event) => onBedDoubleClick(event, 'truck'));
    canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const { x, y } = canvasCoordsOn(event, canvas);
      const hit = hitTest(x, y, items);
      showContextMenu(event.clientX, event.clientY, hit ? hit.id : null);
    });

    if (trailerCanvas) {
      trailerCanvas.addEventListener('pointerdown', (event) => onBedPointerDown(event, 'trailer'));
      trailerCanvas.addEventListener('pointermove', onBedPointerMove);
      trailerCanvas.addEventListener('pointerup', onBedPointerUp);
      trailerCanvas.addEventListener('mousemove', (event) => {
        updateCanvasCursor(event.clientX, event.clientY, trailerCanvas, trailerItems);
        updateHoveredItem(event.clientX, event.clientY);
      });
      trailerCanvas.addEventListener('mouseleave', () => {
        trailerCanvas.style.cursor = '';
        clearHoveredItem();
      });
      trailerCanvas.addEventListener('dblclick', (event) => onBedDoubleClick(event, 'trailer'));
      trailerCanvas.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        const { x, y } = canvasCoordsOn(event, trailerCanvas);
        const hit = hitTest(x, y, trailerItems);
        showContextMenu(event.clientX, event.clientY, hit ? hit.id : null);
      });
    }

    contextMenu.addEventListener('click', (event) => {
      if (event.target.closest('#context-menu-weight')) return;
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      activateContextMenuAction(action);
    });

    contextMenu.addEventListener('keydown', (event) => {
      if (contextMenu.classList.contains('hidden')) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusNextContextMenuItem(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusNextContextMenuItem(-1);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        focusContextMenuItem(0);
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        const items = getContextMenuFocusables();
        focusContextMenuItem(items.length - 1);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        hideContextMenu();
        return;
      }

      const actionBtn = event.target.closest('[data-action]');
      if (!actionBtn || actionBtn.disabled) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateContextMenuAction(actionBtn.dataset.action);
      }
    });

    document.addEventListener('pointerdown', (event) => {
      if (!contextMenu.contains(event.target)) hideContextMenu();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        if (shouldIgnoreCanvasShortcuts()) return;
        if (selectedId) {
          e.preventDefault();
          openContextMenuKeyboard();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (isBeladungDialogOpen()) {
          e.preventDefault();
          closeBeladungDialog();
          return;
        }
        hideContextMenu();
        closeCargoListDialog();
        return;
      }

      if (shouldIgnoreCanvasShortcuts()) return;

      if ((e.key === 'b' || e.key === 'B') && selectedId) {
        e.preventDefault();
        openBeladungDialog(selectedId);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undoLastStep();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        rotateSelected();
      }
    });

    window.addEventListener('resize', () => {
      syncAdSlotLayout();
      draw();
      resizeVehiclePhoto();
    });
  }

  initTruckSelect();
  initPresets();
  initAutoList();
  bindEvents();
  loadFromLocalStorage();
  updateUI();
  draw();
  window.addEventListener('load', () => {
    syncAdSlotLayout();
    draw();
  });
})();
