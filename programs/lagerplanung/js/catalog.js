(function (global) {
  "use strict";

  const OPENING_PRESETS = [
    { type: "door", label: "Tür 90", width: 90, height: 210, sill: 0 },
    { type: "door", label: "Tür 100", width: 100, height: 210, sill: 0 },
    { type: "gate", label: "Sektionaltor 300", width: 300, height: 300, sill: 0 },
    { type: "gate", label: "Sektionaltor 400", width: 400, height: 400, sill: 0 },
    { type: "gate", label: "Verladetor 500", width: 500, height: 450, sill: 0 },
    { type: "window", label: "Fenster 120", width: 120, height: 120, sill: 100 },
    { type: "window", label: "Fenster 150", width: 150, height: 100, sill: 110 },
    { type: "window", label: "Fenster 200", width: 200, height: 120, sill: 100 },
  ];

  const PALLET_PRESETS = [
    { label: "3 Felder EPAL", w: 360, d: 110, h: 600, bays: 3, levels: 4, firstBeam: 20 },
    { label: "4 Felder hoch", w: 480, d: 110, h: 750, bays: 4, levels: 5, firstBeam: 20 },
    { label: "2 Felder kompakt", w: 270, d: 110, h: 450, bays: 2, levels: 3, firstBeam: 15 },
    { label: "Doppelttief", w: 360, d: 220, h: 600, bays: 3, levels: 4, firstBeam: 20 },
  ];

  const CANTILEVER_PRESETS = [
    { label: "Beidseitig 6 m", w: 600, d: 280, h: 800, levels: 5, columns: 4, sided: "double", arm: 120 },
    { label: "Einseitig 6 m", w: 600, d: 160, h: 800, levels: 5, columns: 4, sided: "single", arm: 120 },
    { label: "Langgut 8 m", w: 800, d: 300, h: 600, levels: 4, columns: 5, sided: "double", arm: 130 },
  ];

  const COLORS = {
    floor: "#2a3a52",
    wall: "#cbd5e1",
    wallSel: "#fbbf24",
    grid: "rgba(148, 163, 184, 0.15)",
    dim: "#94a3b8",
    dimLive: "#00e5ff",
    door: "#fbbf24",
    gate: "#f97316",
    window: "#38bdf8",
    block: "#38bdf8",
    blockHatch: "#0ea5e9",
    pallet: "#60a5fa",
    palletFrame: "#2563eb",
    palletSlot: "rgba(147, 197, 253, 0.42)",
    cantilever: "#4ade80",
    cantileverSpine: "#15803d",
    select: "#fbbf24",
    collide: "#ef4444",
    outside: "#f97316",
    text: "#e8edf4",
  };

  const TYPE_LABELS = {
    block: "Blocklager",
    pallet: "Palettenregal",
    cantilever: "Kragarmregal",
    door: "Tür",
    gate: "Tor",
    window: "Fenster",
    vertex: "Eckpunkt",
    edge: "Wand",
  };

  function typeLabel(type) {
    return TYPE_LABELS[type] || type;
  }

  function defaultDepth(item) {
    if (item.type === "cantilever") {
      const arm = item.arm || 120;
      return item.sided === "single" ? arm + 40 : arm * 2 + 40;
    }
    return item.d;
  }

  global.LPCatalog = {
    OPENING_PRESETS,
    PALLET_PRESETS,
    CANTILEVER_PRESETS,
    COLORS,
    TYPE_LABELS,
    typeLabel,
    defaultDepth,
  };
})(window);
