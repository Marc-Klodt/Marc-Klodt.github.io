(() => {
  "use strict";

  const GEO = {
    racks: 6,
    lengthM: 6,
    heightM: 8,
    levels: 5,
    bays: 3,
    armM: 1.2,
    colM: 0.4,
    aisleM: 3.2,
    rowGapM: 3.6,
    rows: 2,
    cols: 3,
  };

  const LEVEL_H = GEO.heightM / GEO.levels;
  const BAY_L = GEO.lengthM / GEO.bays;
  const RACK_W = GEO.armM * 2 + GEO.colM;
  const SLOTS = GEO.racks * 2 * GEO.levels * GEO.bays;

  const ZONE_COLOR = { C: "#c24e1f", B: "#b8922d", A: "#4d6572", empty: "#d8d2c6" };
  const ZONE_FACE = { C: "#d9784e", B: "#d4b56a", A: "#6d8490", empty: "#cfc8ba" };
  const ZONE_TOP = { C: "#e39a78", B: "#e2cc8e", A: "#8aa0ab", empty: "#e4dfd4" };

  const CATALOG = [
    "IPE 160 Träger", "IPE 200 Träger", "IPE 240 Träger", "HEA 180 Träger",
    "HEA 200 Träger", "UNP 140 U-Profil", "UNP 180 U-Profil", "Flachstahl 80x10",
    "Flachstahl 100x12", "Rundstahl Ø40", "Rundstahl Ø60", "Rohr DN40 nahtlos",
    "Rohr DN50 nahtlos", "Rohr DN80 nahtlos", "Vierkantrohr 40x40", "Vierkantrohr 60x40",
    "Winkelstahl 50x50", "Winkelstahl 70x70", "Kantholz 80x80 Fichte", "Kantholz 100x100 Fichte",
    "Bohlen 40x140 Fichte", "Latten 24x48", "Trapezblech 35/207", "Alu-Profil 40x40",
    "Edelstahlrohr Ø42", "Kupferstange Ø20", "Gewindestange M16", "Flachmaterial 60x8",
    "C-Profil 100", "Z-Profil 150", "Hohlkasten 80x80", "Leimholz 120x60",
  ];

  const ART_STORE = "abc-lagerzonen-artikel";

  const state = {
    articles: [],
    slots: [],
    view: "iso",
    selectedRack: 1,
    selectedSlot: null,
    filterZone: "all",
    search: "",
    thrC: 0.8,
    thrB: 0.95,
  };

  function el(id) {
    return document.getElementById(id);
  }

  function fmt(n, digits) {
    return n.toLocaleString("de-DE", {
      minimumFractionDigits: digits || 0,
      maximumFractionDigits: digits || 0,
    });
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function newUid() {
    return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function rawList(articles) {
    return (articles || state.articles).map((a) => ({
      uid: a.uid || newUid(),
      artikel: a.artikel,
      bezeichnung: a.bezeichnung,
      entnahmen: Number(a.entnahmen) || 0,
    }));
  }

  function persistArticles() {
    try {
      localStorage.setItem(ART_STORE, JSON.stringify(rawList()));
    } catch (err) {
      /* ignore quota */
    }
  }

  function nextArtikelNr() {
    const nums = state.articles.map((a) => {
      const m = String(a.artikel || "").match(/(\d+)\s*$/);
      return m ? Number(m[1]) : 0;
    });
    const n = Math.max(0, ...nums) + 1;
    return `ART-${String(n).padStart(4, "0")}`;
  }

  function rackOrigin(rackNo) {
    const i = rackNo - 1;
    const col = i % GEO.cols;
    const row = Math.floor(i / GEO.cols);
    return {
      x: col * (GEO.lengthM + GEO.aisleM),
      y: row * (RACK_W + GEO.rowGapM),
      row,
      col,
    };
  }

  function buildSlots() {
    const slots = [];
    for (let rack = 1; rack <= GEO.racks; rack += 1) {
      for (const side of ["L", "R"]) {
        for (let level = 1; level <= GEO.levels; level += 1) {
          for (let bay = 1; bay <= GEO.bays; bay += 1) {
            const origin = rackOrigin(rack);
            const id = `R${String(rack).padStart(2, "0")}-${side}-E${level}-F${bay}`;
            const heightM = (level - 1) * LEVEL_H;
            const nearWA = origin.row === 0 ? 1 : 0;
            const levelScore = (GEO.levels - level + 1) / GEO.levels;
            const bayScore = (GEO.bays - bay + 1) / GEO.bays;
            const access =
              levelScore * 0.58 +
              nearWA * 0.28 +
              bayScore * 0.14;
            slots.push({
              id,
              rack,
              side,
              level,
              bay,
              heightM,
              access,
              article: null,
            });
          }
        }
      }
    }
    return slots;
  }

  function generateSample() {
    const lengths = [4, 6, 12];
    const articles = [];
    let n = 0;
    CATALOG.forEach((name) => {
      lengths.forEach((len) => {
        n += 1;
        articles.push({
          uid: newUid(),
          artikel: `ART-${String(n).padStart(4, "0")}`,
          bezeichnung: `${name} ${fmt(len, 0)} m`,
        });
      });
    });
    articles.forEach((a, i) => {
      a.entnahmen = Math.max(1, Math.round(2400 / Math.pow(i + 1, 1.18)));
    });
    return articles;
  }

  function parseCsv(text) {
    const raw = text.replace(/^\uFEFF/, "").trim();
    if (!raw) return [];
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ";" : ",";
    const split = (line) => {
      const out = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') q = !q;
        else if (ch === sep && !q) {
          out.push(cur.trim());
          cur = "";
        } else cur += ch;
      }
      out.push(cur.trim());
      return out;
    };
    const header = split(lines[0]).map((h) => h.toLowerCase());
    const idx = {
      artikel: header.findIndex((h) => /artikel|sku|nr|nummer|id/.test(h)),
      bezeichnung: header.findIndex((h) => /bez|name|bezeich|artikelbe/.test(h)),
      entnahmen: header.findIndex((h) => /entnahme|pick|freq|anzahl|bewegung|zugriff/.test(h)),
    };
    if (idx.artikel < 0) idx.artikel = 0;
    if (idx.bezeichnung < 0) idx.bezeichnung = Math.min(1, header.length - 1);
    if (idx.entnahmen < 0) idx.entnahmen = Math.min(2, header.length - 1);
    return lines.slice(1).map((line, i) => {
      const c = split(line);
      return {
        uid: newUid(),
        artikel: c[idx.artikel] || `ART-${String(i + 1).padStart(4, "0")}`,
        bezeichnung: c[idx.bezeichnung] || "",
        entnahmen: Number(String(c[idx.entnahmen] || "0").replace(",", ".")) || 0,
      };
    }).filter((a) => a.artikel);
  }

  function classify(articles, thrC, thrB) {
    const list = articles.map((a) => ({
      uid: a.uid || newUid(),
      artikel: a.artikel,
      bezeichnung: a.bezeichnung,
      entnahmen: Number(a.entnahmen) || 0,
    }));
    const total = list.reduce((s, a) => s + a.entnahmen, 0) || 1;
    list.sort((a, b) => b.entnahmen - a.entnahmen || a.artikel.localeCompare(b.artikel, "de"));
    let cum = 0;
    list.forEach((a, i) => {
      const prevShare = cum / total;
      cum += a.entnahmen;
      a.anteil = a.entnahmen / total;
      a.kumuliert = cum / total;
      a.rang = i + 1;
      if (a.entnahmen <= 0) a.zone = "A";
      else if (prevShare < thrC || i === 0) a.zone = "C";
      else if (prevShare < thrB) a.zone = "B";
      else a.zone = "A";
    });
    return { list, total };
  }

  function place(articles, slots) {
    slots.forEach((s) => { s.article = null; });
    const ranked = [...articles].sort((a, b) => {
      const z = { C: 0, B: 1, A: 2 };
      return z[a.zone] - z[b.zone] || b.entnahmen - a.entnahmen;
    });
    const free = [...slots].sort((a, b) => b.access - a.access);
    ranked.forEach((art, i) => {
      if (i >= free.length) {
        art.slot = null;
        return;
      }
      const slot = free[i];
      slot.article = art;
      art.slot = slot;
    });
    for (let i = free.length; i < ranked.length; i += 1) ranked[i].slot = null;
  }

  function stats() {
    const arts = state.articles;
    const total = arts.reduce((s, a) => s + a.entnahmen, 0) || 1;
    const by = (z) => arts.filter((a) => a.zone === z);
    const pickShare = (z) => by(z).reduce((s, a) => s + a.entnahmen, 0) / total;
    const assigned = arts.filter((a) => a.slot);
    const wHeight = assigned.reduce((s, a) => s + a.entnahmen * (a.slot.heightM + LEVEL_H / 2), 0);
    const wPicks = assigned.reduce((s, a) => s + a.entnahmen, 0) || 1;
    const lowPicks = assigned
      .filter((a) => a.slot.level <= 2)
      .reduce((s, a) => s + a.entnahmen, 0) / wPicks;
    const filled = state.slots.filter((s) => s.article).length;
    return {
      nC: by("C").length,
      nB: by("B").length,
      nA: by("A").length,
      pC: pickShare("C"),
      pB: pickShare("B"),
      pA: pickShare("A"),
      filled,
      occupancy: filled / SLOTS,
      avgHeight: wHeight / wPicks,
      lowPicks,
      total,
    };
  }

  function iso(x, y, z, o) {
    const s = o.scale;
    return {
      x: o.ox + (x - y) * s * Math.cos(Math.PI / 6),
      y: o.oy + (x + y) * s * Math.sin(Math.PI / 6) - z * s,
    };
  }

  function boxFaces(x, y, z, dx, dy, dz, o) {
    const p = (xx, yy, zz) => iso(xx, yy, zz, o);
    const a = p(x, y, z + dz);
    const b = p(x + dx, y, z + dz);
    const c = p(x + dx, y + dy, z + dz);
    const d = p(x, y + dy, z + dz);
    const f = p(x + dx, y, z);
    const g = p(x + dx, y + dy, z);
    const h = p(x, y + dy, z);
    const poly = (pts) => pts.map((t) => `${t.x.toFixed(1)},${t.y.toFixed(1)}`).join(" ");
    return {
      top: poly([a, b, c, d]),
      right: poly([b, f, g, c]),
      front: poly([d, c, g, h]),
    };
  }

  function svgEl(name, attrs, text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) node.setAttribute(k, String(v));
    });
    if (text != null) node.textContent = text;
    return node;
  }

  function drawBox(parent, x, y, z, dx, dy, dz, o, fills, slot) {
    const faces = boxFaces(x, y, z, dx, dy, dz, o);
    const g = svgEl("g", {
      class: slot ? `slot${state.selectedSlot === slot.id ? " sel" : ""}` : "",
      "data-slot": slot ? slot.id : undefined,
      "data-rack": slot ? slot.rack : undefined,
    });
    if (slot) {
      const art = slot.article;
      const tip = art
        ? `${slot.id} · Zone ${art.zone} · ${art.artikel} ${art.bezeichnung}`
        : `${slot.id} · frei`;
      g.appendChild(svgEl("title", {}, tip));
    }
    g.appendChild(svgEl("polygon", { class: "face", points: faces.right, fill: fills.right, stroke: "#8f887c", "stroke-width": 0.6 }));
    g.appendChild(svgEl("polygon", { class: "face", points: faces.front, fill: fills.front, stroke: "#8f887c", "stroke-width": 0.6 }));
    g.appendChild(svgEl("polygon", { class: "face", points: faces.top, fill: fills.top, stroke: "#8f887c", "stroke-width": 0.6 }));
    parent.appendChild(g);
    return g;
  }

  function slotFills(slot) {
    const z = slot.article ? slot.article.zone : "empty";
    return { top: ZONE_TOP[z], front: ZONE_COLOR[z], right: ZONE_FACE[z] };
  }

  function hallBounds() {
    const w = GEO.cols * GEO.lengthM + (GEO.cols - 1) * GEO.aisleM;
    const d = GEO.rows * RACK_W + (GEO.rows - 1) * GEO.rowGapM;
    return { w, d };
  }

  function renderIso() {
    const { w, d } = hallBounds();
    const scale = 28;
    const pad = 70;
    const o = { scale, ox: 0, oy: 0 };
    const corners = [
      iso(-1.5, -3.2, 0, o),
      iso(w + 1.5, -3.2, 0, o),
      iso(w + 1.5, d + 1.8, 0, o),
      iso(-1.5, d + 1.8, 0, o),
      iso(-1.5, -3.2, 8, o),
    ];
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - 40;
    const maxY = Math.max(...ys) + 50;
    o.ox = -minX;
    o.oy = -minY;
    const svg = svgEl("svg", {
      viewBox: `0 0 ${maxX - minX} ${maxY - minY}`,
      width: Math.round(maxX - minX),
      height: Math.round(maxY - minY),
      role: "img",
      "aria-label": "Isometrische Ansicht der sechs Kragarmregale",
    });

    const floor = [
      iso(-1.5, -3.2, 0, o),
      iso(w + 1.5, -3.2, 0, o),
      iso(w + 1.5, d + 1.8, 0, o),
      iso(-1.5, d + 1.8, 0, o),
    ];
    svg.appendChild(svgEl("polygon", {
      points: floor.map((p) => `${p.x},${p.y}`).join(" "),
      fill: "#e7e1d4",
      stroke: "#b9b1a3",
    }));

    const wa = [
      iso(-1.2, -3.0, 0, o),
      iso(w + 1.2, -3.0, 0, o),
      iso(w + 1.2, -1.4, 0, o),
      iso(-1.2, -1.4, 0, o),
    ];
    svg.appendChild(svgEl("polygon", {
      points: wa.map((p) => `${p.x},${p.y}`).join(" "),
      fill: "#d5e0da",
      stroke: "#2f5d4c",
    }));
    const waLabel = iso(w / 2, -2.2, 0.02, o);
    svg.appendChild(svgEl("text", {
      x: waLabel.x, y: waLabel.y, "text-anchor": "middle",
      fill: "#2f5d4c", "font-size": 13, "font-family": "IBM Plex Sans, Segoe UI, sans-serif",
    }, "WARENAUSGANG / KOMMISSIONIERUNG"));

    const drawOrder = [...Array(GEO.racks).keys()]
      .map((i) => i + 1)
      .sort((a, b) => {
        const oa = rackOrigin(a);
        const ob = rackOrigin(b);
        return ob.x + ob.y - (oa.x + oa.y);
      });

    drawOrder.forEach((rack) => {
      const group = svgEl("g", { "data-rack": rack });
      const origin = rackOrigin(rack);
      const spineX = origin.x;
      const spineY = origin.y + GEO.armM;
      drawBox(group, spineX, spineY, 0, GEO.lengthM, GEO.colM, GEO.heightM, o, {
        top: "#9aa3aa", front: "#6d757c", right: "#818990",
      }, null);

      const rackSlots = state.slots
        .filter((s) => s.rack === rack)
        .sort((a, b) => (b.level - a.level) || (b.bay - a.bay) || (a.side === "R" ? 1 : -1));

      rackSlots.forEach((slot) => {
        const z0 = (slot.level - 1) * LEVEL_H + 0.08;
        const x0 = origin.x + (slot.bay - 1) * BAY_L + 0.05;
        const y0 = slot.side === "L" ? origin.y : origin.y + GEO.armM + GEO.colM;
        drawBox(group, x0, y0, z0, BAY_L - 0.1, GEO.armM - 0.05, LEVEL_H - 0.18, o, slotFills(slot), slot);
      });

      const tag = iso(origin.x + GEO.lengthM / 2, origin.y + RACK_W / 2, GEO.heightM + 0.4, o);
      group.appendChild(svgEl("text", {
        x: tag.x, y: tag.y, "text-anchor": "middle",
        fill: "#1d232b", "font-size": 12, "font-weight": 600,
        "font-family": "IBM Plex Sans, Segoe UI, sans-serif",
      }, `Regal ${rack}`));
      svg.appendChild(group);
    });

    const d1 = iso(0, d + 1.2, 0, o);
    const d2 = iso(GEO.lengthM, d + 1.2, 0, o);
    svg.appendChild(svgEl("line", { x1: d1.x, y1: d1.y, x2: d2.x, y2: d2.y, class: "dim" }));
    svg.appendChild(svgEl("text", { x: (d1.x + d2.x) / 2, y: d1.y + 14, class: "dim-text", "text-anchor": "middle" }, "6,00 m"));

    const h1 = iso(-1.1, 0, 0, o);
    const h2 = iso(-1.1, 0, GEO.heightM, o);
    svg.appendChild(svgEl("line", { x1: h1.x, y1: h1.y, x2: h2.x, y2: h2.y, class: "dim" }));
    svg.appendChild(svgEl("text", { x: h2.x - 8, y: (h1.y + h2.y) / 2, class: "dim-text", "text-anchor": "end" }, "8,00 m"));

    return svg;
  }

  function renderPlan() {
    const m = 42;
    const { w, d } = hallBounds();
    const scale = 48;
    const waH = 1.8;
    const svgW = (w + 3) * scale + m * 2;
    const svgH = (d + waH + 3.2) * scale + m * 2;
    const sx = (x) => m + (x + 1.5) * scale;
    const sy = (y) => m + (y + waH + 1.2) * scale;
    const svg = svgEl("svg", {
      viewBox: `0 0 ${svgW} ${svgH}`,
      width: svgW,
      height: svgH,
      "aria-label": "Grundriss der Kragarmregalanlage",
    });

    svg.appendChild(svgEl("rect", {
      x: sx(-1.5), y: sy(-waH - 0.8), width: (w + 3) * scale, height: (d + waH + 2.6) * scale,
      fill: "#e7e1d4", stroke: "#b9b1a3",
    }));
    svg.appendChild(svgEl("rect", {
      x: sx(-1.2), y: sy(-waH), width: (w + 2.4) * scale, height: waH * scale,
      fill: "#d5e0da", stroke: "#2f5d4c",
    }));
    svg.appendChild(svgEl("text", {
      x: sx(w / 2), y: sy(-waH / 2) + 4, "text-anchor": "middle",
      fill: "#2f5d4c", "font-size": 13, "font-family": "IBM Plex Sans, Segoe UI, sans-serif",
    }, "WARENAUSGANG"));

    for (let rack = 1; rack <= GEO.racks; rack += 1) {
      const o = rackOrigin(rack);
      const g = svgEl("g", { "data-rack": rack, class: "slot" });
      g.appendChild(svgEl("rect", {
        x: sx(o.x), y: sy(o.y), width: GEO.lengthM * scale, height: RACK_W * scale,
        fill: "#efe9dc", stroke: "#1d232b",
        "stroke-width": rack === state.selectedRack ? 2.4 : 1.2,
      }));
      g.appendChild(svgEl("rect", {
        x: sx(o.x), y: sy(o.y + GEO.armM), width: GEO.lengthM * scale, height: GEO.colM * scale,
        fill: "#6d757c",
      }));

      state.slots.filter((s) => s.rack === rack).forEach((slot) => {
        const x = o.x + (slot.bay - 1) * BAY_L;
        const y = slot.side === "L" ? o.y : o.y + GEO.armM + GEO.colM;
        const z = slot.article ? slot.article.zone : "empty";
        const levelBand = (LEVEL_H / GEO.heightM) * GEO.armM;
        const yy = slot.side === "L"
          ? y + (slot.level - 1) * levelBand
          : y + (GEO.levels - slot.level) * levelBand;
        const rect = svgEl("rect", {
          class: "face",
          x: sx(x) + 1,
          y: sy(yy) + 0.5,
          width: BAY_L * scale - 2,
          height: Math.max(2, levelBand * scale - 1),
          fill: ZONE_COLOR[z],
          "data-slot": slot.id,
          "data-rack": rack,
        });
        const art = slot.article;
        rect.appendChild(svgEl("title", {}, art
          ? `${slot.id} · Zone ${art.zone} · ${art.artikel}`
          : `${slot.id} · frei`));
        g.appendChild(rect);
      });

      g.appendChild(svgEl("text", {
        x: sx(o.x + GEO.lengthM / 2), y: sy(o.y + RACK_W / 2) + 4,
        "text-anchor": "middle", fill: "#fff", "font-size": 12, "font-weight": 600,
        "font-family": "IBM Plex Sans, Segoe UI, sans-serif",
      }, `R${rack}`));
      svg.appendChild(g);
    }

    const l1 = { x: sx(0), y: sy(d + 1.1) };
    const l2 = { x: sx(GEO.lengthM), y: sy(d + 1.1) };
    svg.appendChild(svgEl("line", { x1: l1.x, y1: l1.y, x2: l2.x, y2: l2.y, class: "dim" }));
    svg.appendChild(svgEl("text", { x: (l1.x + l2.x) / 2, y: l1.y + 14, class: "dim-text", "text-anchor": "middle" }, "6,00 m Länge"));

    const a1 = { x: sx(GEO.lengthM + 0.15), y: sy(0) };
    const a2 = { x: sx(GEO.lengthM + GEO.aisleM - 0.15), y: sy(0) };
    svg.appendChild(svgEl("line", { x1: a1.x, y1: a1.y - 18, x2: a2.x, y2: a2.y - 18, class: "dim" }));
    svg.appendChild(svgEl("text", {
      x: (a1.x + a2.x) / 2, y: a1.y - 22, class: "dim-text", "text-anchor": "middle",
    }, "Gang"));

    return svg;
  }

  function renderCut() {
    const rack = state.selectedRack;
    const scaleX = 70;
    const scaleZ = 38;
    const padL = 90;
    const padT = 36;
    const gap = 70;
    const colW = 18;
    const arm = GEO.armM * scaleX;
    const width = padL + arm + colW + arm + gap + GEO.lengthM * scaleX + 80;
    const height = padT + GEO.heightM * scaleZ + 70;
    const svg = svgEl("svg", {
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
      "aria-label": `Schnitt durch Regal ${rack}, fünf Ebenen beidseitig`,
    });

    svg.appendChild(svgEl("text", {
      x: padL + arm + colW / 2, y: 20, "text-anchor": "middle",
      fill: "#1d232b", "font-size": 14, "font-weight": 600,
      "font-family": "IBM Plex Sans, Segoe UI, sans-serif",
    }, `Regal ${rack} · Querschnitt 8,00 m · 5 Ebenen à 1,60 m`));

    const ground = padT + GEO.heightM * scaleZ;
    const colX = padL + arm;

    svg.appendChild(svgEl("line", {
      x1: padL - 20, y1: ground, x2: colX + colW + arm + 20, y2: ground,
      stroke: "#8f887c", "stroke-width": 2,
    }));
    svg.appendChild(svgEl("rect", {
      x: colX, y: padT, width: colW, height: GEO.heightM * scaleZ, fill: "#6d757c",
    }));

    ["L", "R"].forEach((side) => {
      for (let level = 1; level <= GEO.levels; level += 1) {
        const zTop = padT + (GEO.levels - level) * LEVEL_H * scaleZ;
        const yArm = zTop + LEVEL_H * scaleZ - 10;
        const x = side === "L" ? colX - arm : colX + colW;
        svg.appendChild(svgEl("rect", {
          x, y: yArm, width: arm, height: 10, fill: "#9aa3aa",
        }));
      }
    });

    state.slots.filter((s) => s.rack === rack).forEach((slot) => {
      const zTop = padT + (GEO.levels - slot.level) * LEVEL_H * scaleZ + 4;
      const h = LEVEL_H * scaleZ - 16;
      const x = slot.side === "L" ? colX - arm + 4 : colX + colW + 4;
      const z = slot.article ? slot.article.zone : "empty";
      const g = svgEl("g", {
        class: `slot${state.selectedSlot === slot.id ? " sel" : ""}`,
        "data-slot": slot.id,
        "data-rack": rack,
      });
      const art = slot.article;
      g.appendChild(svgEl("title", {}, art
        ? `${slot.id} · Zone ${art.zone} · ${art.artikel} ${art.bezeichnung}`
        : `${slot.id} · frei`));
      g.appendChild(svgEl("rect", {
        class: "face",
        x, y: zTop, width: arm - 8, height: h,
        fill: ZONE_COLOR[z], stroke: "#8f887c",
      }));
      const label = slot.article ? slot.article.zone : "";
      if (label) {
        g.appendChild(svgEl("text", {
          x: x + (arm - 8) / 2, y: zTop + h / 2 + 4, "text-anchor": "middle",
          fill: "#fff", "font-size": 12, "font-weight": 600,
        }, label));
      }
      svg.appendChild(g);
    });

    for (let level = 1; level <= GEO.levels; level += 1) {
      const y = padT + (GEO.levels - level) * LEVEL_H * scaleZ + LEVEL_H * scaleZ - 2;
      const hm = (level - 1) * LEVEL_H;
      svg.appendChild(svgEl("line", { x1: 28, y1: y, x2: padL - 24, y2: y, class: "dim" }));
      svg.appendChild(svgEl("text", {
        x: 24, y: y + 4, class: "dim-text", "text-anchor": "end",
      }, `${fmt(hm, 1)} m · E${level}`));
    }
    svg.appendChild(svgEl("text", {
      x: 24, y: padT + 4, class: "dim-text", "text-anchor": "end",
    }, "8,00 m"));

    svg.appendChild(svgEl("text", {
      x: padL + arm / 2, y: ground + 22, "text-anchor": "middle", class: "dim-text",
    }, "Seite L"));
    svg.appendChild(svgEl("text", {
      x: colX + colW + arm / 2, y: ground + 22, "text-anchor": "middle", class: "dim-text",
    }, "Seite R"));

    const elevX = padL + arm + colW + arm + gap;
    svg.appendChild(svgEl("text", {
      x: elevX + GEO.lengthM * scaleX / 2, y: 20, "text-anchor": "middle",
      fill: "#1d232b", "font-size": 14, "font-weight": 600,
      "font-family": "IBM Plex Sans, Segoe UI, sans-serif",
    }, `Längsansicht Seite L · 6,00 m`));

    svg.appendChild(svgEl("rect", {
      x: elevX + GEO.lengthM * scaleX / 2 - 8, y: padT,
      width: 16, height: GEO.heightM * scaleZ, fill: "#6d757c",
    }));

    state.slots.filter((s) => s.rack === rack && s.side === "L").forEach((slot) => {
      const x = elevX + (slot.bay - 1) * BAY_L * scaleX + 3;
      const y = padT + (GEO.levels - slot.level) * LEVEL_H * scaleZ + 4;
      const z = slot.article ? slot.article.zone : "empty";
      const g = svgEl("g", {
        class: `slot${state.selectedSlot === slot.id ? " sel" : ""}`,
        "data-slot": slot.id,
        "data-rack": rack,
      });
      g.appendChild(svgEl("rect", {
        class: "face",
        x, y, width: BAY_L * scaleX - 6, height: LEVEL_H * scaleZ - 16,
        fill: ZONE_COLOR[z], stroke: "#8f887c",
      }));
      const txt = slot.article ? `${slot.article.zone}  F${slot.bay}` : `F${slot.bay}`;
      g.appendChild(svgEl("text", {
        x: x + (BAY_L * scaleX - 6) / 2, y: y + (LEVEL_H * scaleZ - 16) / 2 + 4,
        "text-anchor": "middle", fill: slot.article ? "#fff" : "#5d6670", "font-size": 11,
      }, txt));
      svg.appendChild(g);
    });

    svg.appendChild(svgEl("line", {
      x1: elevX, y1: ground + 8, x2: elevX + GEO.lengthM * scaleX, y2: ground + 8, class: "dim",
    }));
    svg.appendChild(svgEl("text", {
      x: elevX + GEO.lengthM * scaleX / 2, y: ground + 22, class: "dim-text", "text-anchor": "middle",
    }, "6,00 m · 3 Fächer à 2,00 m"));

    return svg;
  }

  function renderPareto() {
    const box = el("pareto");
    box.innerHTML = "";
    const arts = [...state.articles].sort((a, b) => a.rang - b.rang);
    if (!arts.length) return;
    const w = 276;
    const h = 118;
    const l = 28;
    const t = 8;
    const pw = w - 36;
    const ph = h - 28;
    const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, width: "100%", height: h });
    arts.forEach((a, i) => {
      const x = l + (i / arts.length) * pw;
      const bw = Math.max(1, pw / arts.length - 0.4);
      const bh = a.anteil * ph * (1 / Math.max(...arts.map((x) => x.anteil)));
      svg.appendChild(svgEl("rect", {
        x, y: t + ph - bh, width: bw, height: bh,
        fill: ZONE_COLOR[a.zone],
      }));
    });
    let d = "";
    arts.forEach((a, i) => {
      const x = l + ((i + 1) / arts.length) * pw;
      const y = t + ph - a.kumuliert * ph;
      d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    });
    svg.appendChild(svgEl("path", { d, fill: "none", stroke: "#1d232b", "stroke-width": 1.4 }));
    const yC = t + ph - state.thrC * ph;
    svg.appendChild(svgEl("line", { x1: l, y1: yC, x2: l + pw, y2: yC, stroke: ZONE_COLOR.C, "stroke-dasharray": "3 3" }));
    svg.appendChild(svgEl("text", { x: 2, y: h - 4, class: "dim-text" }, "Rang"));
    svg.appendChild(svgEl("text", { x: l + pw, y: 10, class: "dim-text", "text-anchor": "end" }, "kumuliert"));
    box.appendChild(svg);
  }

  function renderKpis() {
    const s = stats();
    el("kpi-grid").innerHTML = `
      <div class="kpi"><div class="l">Artikel C / B / A</div><div class="v">${s.nC} / ${s.nB} / ${s.nA}</div></div>
      <div class="kpi"><div class="l">Entnahmen C / B / A</div><div class="v">${fmt(s.pC * 100, 0)} / ${fmt(s.pB * 100, 0)} / ${fmt(s.pA * 100, 0)} %</div></div>
      <div class="kpi"><div class="l">Belegte Stellplätze</div><div class="v">${s.filled} / ${SLOTS} · ${fmt(s.occupancy * 100, 0)} %</div></div>
      <div class="kpi"><div class="l">Entn. in Ebene 1–2</div><div class="v">${fmt(s.lowPicks * 100, 0)} %</div></div>
      <div class="kpi"><div class="l">Mittlere Entnahmehöhe</div><div class="v">${fmt(s.avgHeight, 1)} m</div></div>
      <div class="kpi"><div class="l">Summe Entnahmen</div><div class="v">${fmt(s.total, 0)}</div></div>
    `;
    renderPareto();
  }

  function renderTable() {
    const q = state.search.trim().toLowerCase();
    const rows = state.articles.filter((a) => {
      if (state.filterZone !== "all" && a.zone !== state.filterZone) return false;
      if (!q) return true;
      const hay = `${a.artikel} ${a.bezeichnung} ${a.slot ? a.slot.id : ""}`.toLowerCase();
      return hay.includes(q);
    });
    el("tbody").innerHTML = rows.map((a) => `
      <tr data-uid="${esc(a.uid)}" data-slot="${a.slot ? esc(a.slot.id) : ""}" data-rack="${a.slot ? a.slot.rack : ""}">
        <td><input class="cell-in" data-field="artikel" value="${esc(a.artikel)}" aria-label="Artikelnummer"></td>
        <td><input class="cell-in" data-field="bezeichnung" value="${esc(a.bezeichnung)}" aria-label="Bezeichnung"></td>
        <td class="num"><input class="cell-in num" data-field="entnahmen" type="number" min="0" step="1" value="${a.entnahmen}" aria-label="Entnahmen"></td>
        <td class="num">${fmt(a.anteil * 100, 1)} %</td>
        <td><span class="pill ${a.zone}">${a.zone}</span></td>
        <td class="loc">${a.slot ? esc(a.slot.id) : "—"}</td>
        <td class="num">${a.slot ? fmt(a.slot.heightM, 1) + " m" : "—"}</td>
        <td><button type="button" class="row-del" data-uid="${esc(a.uid)}">Löschen</button></td>
      </tr>
    `).join("");
  }

  function renderDetail() {
    if (state.view === "custom") return;
    const box = el("detail");
    if (state.selectedSlot) {
      const slot = state.slots.find((s) => s.id === state.selectedSlot);
      const art = slot.article;
      box.innerHTML = `
        <h3>Stellplatz ${slot.id}</h3>
        <div class="detail-grid">
          <div><span>Regal / Seite</span><br>Regal ${slot.rack}, Seite ${slot.side}</div>
          <div><span>Ebene / Fach</span><br>E${slot.level} · F${slot.bay} · ${fmt(slot.heightM, 1)}–${fmt(slot.heightM + LEVEL_H, 1)} m</div>
          <div><span>Zugriffsrang</span><br>${fmt(slot.access * 100, 0)} / 100</div>
          <div><span>Artikel</span><br>${art ? `${esc(art.artikel)} · ${esc(art.bezeichnung)}` : "frei"}</div>
          <div><span>Zone</span><br>${art ? art.zone : "—"}</div>
          <div><span>Entnahmen</span><br>${art ? fmt(art.entnahmen, 0) : "—"}</div>
        </div>`;
      return;
    }
    const rackSlots = state.slots.filter((s) => s.rack === state.selectedRack);
    const filled = rackSlots.filter((s) => s.article).length;
    const byZ = { C: 0, B: 0, A: 0 };
    rackSlots.forEach((s) => { if (s.article) byZ[s.article.zone] += 1; });
    box.innerHTML = `
      <h3>Regal ${state.selectedRack} · beidseitig · 30 Stellplätze</h3>
      <div class="detail-grid">
        <div><span>Belegung</span><br>${filled} / 30</div>
        <div><span>C / B / A Plätze</span><br>${byZ.C} / ${byZ.B} / ${byZ.A}</div>
        <div><span>Ebenen</span><br>E1 = 0,00 m · E5 = 6,40 m · Kopf 8,00 m</div>
        <div><span>Fächer</span><br>3 × 2,00 m auf 6,00 m Länge</div>
      </div>`;
  }

  function renderRackNav() {
    const nav = el("rack-nav");
    nav.innerHTML = "";
    for (let r = 1; r <= GEO.racks; r += 1) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `rack-btn${state.selectedRack === r ? " on" : ""}`;
      btn.textContent = String(r);
      btn.title = `Regal ${r}`;
      btn.addEventListener("click", () => {
        state.selectedRack = r;
        state.selectedSlot = null;
        render();
      });
      nav.appendChild(btn);
    }
  }

  function renderStage() {
    if (state.view === "custom") {
      document.body.classList.add("view-custom");
      if (window.EigenesLager) window.EigenesLager.show();
      return;
    }
    document.body.classList.remove("view-custom");
    renderRackNav();
    const wrap = el("canvas-wrap");
    wrap.innerHTML = "";
    const svg = state.view === "iso" ? renderIso() : state.view === "plan" ? renderPlan() : renderCut();
    wrap.appendChild(svg);
    wrap.querySelectorAll("[data-slot]").forEach((node) => {
      node.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const id = node.getAttribute("data-slot");
        const rack = Number(node.getAttribute("data-rack"));
        if (id) state.selectedSlot = id;
        if (rack) state.selectedRack = rack;
        render();
      });
    });
    wrap.querySelectorAll("[data-rack]:not([data-slot])").forEach((node) => {
      node.addEventListener("click", () => {
        state.selectedRack = Number(node.getAttribute("data-rack"));
        state.selectedSlot = null;
        render();
      });
    });
    renderDetail();
  }

  function render() {
    renderKpis();
    renderStage();
    renderTable();
  }

  function runSetup(articles) {
    const { list } = classify(articles, state.thrC, state.thrB);
    state.articles = list;
    state.slots = buildSlots();
    place(state.articles, state.slots);
    state.selectedSlot = null;
    persistArticles();
    render();
    if (el("new-artikel") && !el("new-bezeichnung").value.trim()) {
      el("new-artikel").value = nextArtikelNr();
    }
  }

  function exportCsv() {
    const header = [
      "Lagerplatz", "Zone", "Artikel", "Bezeichnung", "Entnahmen",
      "Anteil_pct", "Regal", "Seite", "Ebene", "Fach", "Hoehe_m", "Hoehe_bis_m",
    ];
    const lines = [header.join(";")];
    const rows = [...state.slots].sort((a, b) => a.id.localeCompare(b.id, "de"));
    rows.forEach((s) => {
      const a = s.article;
      lines.push([
        s.id,
        a ? a.zone : "",
        a ? a.artikel : "",
        a ? a.bezeichnung : "",
        a ? a.entnahmen : "",
        a ? (a.anteil * 100).toFixed(2).replace(".", ",") : "",
        s.rack, s.side, s.level, s.bay,
        s.heightM.toFixed(2).replace(".", ","),
        (s.heightM + LEVEL_H).toFixed(2).replace(".", ","),
      ].join(";"));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "abc-lagerzonen-einrichtung.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function bind() {
    el("btn-sample").addEventListener("click", () => runSetup(generateSample()));
    el("btn-setup").addEventListener("click", () => {
      if (!state.articles.length) runSetup(generateSample());
      else runSetup(rawList());
    });
    el("btn-export").addEventListener("click", exportCsv);
    el("csv-input").addEventListener("change", (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => runSetup(parseCsv(String(reader.result)));
      reader.readAsText(file, "utf-8");
    });
    function applyThresholds() {
      if (!state.articles.length) return;
      runSetup(rawList());
    }
    el("thr-c").addEventListener("input", (ev) => {
      let v = Number(ev.target.value);
      const b = Number(el("thr-b").value);
      if (v >= b) v = b - 1;
      ev.target.value = String(v);
      el("lbl-c").textContent = String(v);
      state.thrC = v / 100;
    });
    el("thr-c").addEventListener("change", applyThresholds);
    el("thr-b").addEventListener("input", (ev) => {
      let v = Number(ev.target.value);
      const c = Number(el("thr-c").value);
      if (v <= c) v = c + 1;
      ev.target.value = String(v);
      el("lbl-b").textContent = String(v);
      state.thrB = v / 100;
    });
    el("thr-b").addEventListener("change", applyThresholds);
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.view = btn.getAttribute("data-view");
        document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b === btn));
        const hints = {
          cut: "Querschnitt und Längsansicht des gewählten Regals. Stellplatz anklicken.",
          custom: "Bewegen / Zoom mit dem Button ein- oder ausschalten.",
        };
        el("stage-hint").textContent = hints[state.view]
          || "Regal oder Stellplatz anklicken für Details und Schnitt.";
        renderStage();
      });
    });
    el("search").addEventListener("input", (ev) => {
      state.search = ev.target.value;
      renderTable();
    });
    document.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.filterZone = btn.getAttribute("data-zone");
        document.querySelectorAll(".chip").forEach((b) => b.classList.toggle("on", b === btn));
        renderTable();
      });
    });
    function insertArticle() {
      const artikel = el("new-artikel").value.trim();
      const bezeichnung = el("new-bezeichnung").value.trim();
      const entnahmen = Math.max(0, Number(String(el("new-entnahmen").value).replace(",", ".")) || 0);
      const hint = el("article-form-hint");
      if (!artikel || !bezeichnung) {
        hint.textContent = "Bitte Artikelnummer und Bezeichnung vollständig ausfüllen.";
        return;
      }
      if (state.articles.some((a) => a.artikel.toLowerCase() === artikel.toLowerCase())) {
        hint.textContent = "Diese Artikelnummer ist bereits in der Liste.";
        return;
      }
      runSetup(rawList().concat([{
        uid: newUid(),
        artikel,
        bezeichnung,
        entnahmen,
      }]));
      el("new-artikel").value = nextArtikelNr();
      el("new-bezeichnung").value = "";
      el("new-entnahmen").value = "0";
      hint.textContent = `${artikel} wurde in die Artikelliste eingefügt.`;
      el("new-bezeichnung").focus();
    }

    el("article-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      insertArticle();
    });
    el("btn-clear-articles").addEventListener("click", () => {
      runSetup([]);
    });
    el("tbody").addEventListener("change", (ev) => {
      const input = ev.target.closest("[data-field]");
      if (!input) return;
      const tr = input.closest("tr");
      const uid = tr && tr.dataset.uid;
      const art = state.articles.find((a) => a.uid === uid);
      if (!art) return;
      const field = input.dataset.field;
      if (field === "entnahmen") {
        art.entnahmen = Math.max(0, Number(String(input.value).replace(",", ".")) || 0);
        runSetup(rawList());
      } else if (field === "artikel") {
        art.artikel = input.value.trim() || art.artikel;
        persistArticles();
      } else if (field === "bezeichnung") {
        art.bezeichnung = input.value;
        persistArticles();
      }
    });
    el("tbody").addEventListener("click", (ev) => {
      const del = ev.target.closest(".row-del");
      if (del) {
        ev.stopPropagation();
        const uid = del.getAttribute("data-uid");
        runSetup(rawList().filter((a) => a.uid !== uid));
        return;
      }
      if (ev.target.closest("input, button, select")) return;
      const tr = ev.target.closest("tr");
      if (!tr || !tr.dataset.slot) return;
      state.selectedSlot = tr.dataset.slot;
      state.selectedRack = Number(tr.dataset.rack);
      state.view = "cut";
      document.body.classList.remove("view-custom");
      document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.getAttribute("data-view") === "cut"));
      el("stage-hint").textContent = "Querschnitt und Längsansicht des gewählten Regals. Stellplatz anklicken.";
      render();
    });
  }

  bind();
  (function loadInitial() {
    try {
      const raw = localStorage.getItem(ART_STORE);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          runSetup(list);
          return;
        }
      }
    } catch (err) {
      /* ignore */
    }
    runSetup(generateSample());
  }());
})();
