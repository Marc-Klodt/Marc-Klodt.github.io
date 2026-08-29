(() => {
  const STORAGE_KEY = "abc-analyse-items";
  const SAMPLE_ITEMS = [
    { id: "1", name: "CNC-Fräsmaschine XF-200", qty: 2, price: 48500 },
    { id: "2", name: "Hydraulikaggregat HA-90", qty: 4, price: 12800 },
    { id: "3", name: "SPS-Steuerung S7-1500", qty: 6, price: 4200 },
    { id: "4", name: "Servomotor SM-400", qty: 8, price: 1850 },
    { id: "5", name: "Linearführung LF-35", qty: 12, price: 890 },
    { id: "6", name: "Industrie-PC IPC-17", qty: 5, price: 1650 },
    { id: "7", name: "Frequenzumrichter FU-22", qty: 7, price: 980 },
    { id: "8", name: "Sensorik-Set Proximity", qty: 40, price: 125 },
    { id: "9", name: "Pneumatikzylinder PZ-50", qty: 25, price: 168 },
    { id: "10", name: "Kugellager 6208-2RS", qty: 180, price: 18.5 },
    { id: "11", name: "Dichtungssatz Viton", qty: 60, price: 42 },
    { id: "12", name: "Relaisbaustein 24V", qty: 90, price: 22 },
    { id: "13", name: "Kabelverschraubung M20", qty: 400, price: 3.8 },
    { id: "14", name: "Schlauch DN16", qty: 200, price: 6.4 },
    { id: "15", name: "Filterpatrone F-10", qty: 80, price: 14.2 },
    { id: "16", name: "Schmierfett EP2", qty: 45, price: 18 },
    { id: "17", name: "Schraube M8x30 8.8", qty: 5000, price: 0.12 },
    { id: "18", name: "Unterlegscheibe M8", qty: 8000, price: 0.04 },
    { id: "19", name: "Kabelbinder 200mm", qty: 2000, price: 0.08 },
    { id: "20", name: "Typenschild Alu", qty: 150, price: 0.85 },
  ];

  const els = {
    kpis: document.getElementById("kpis"),
    aThreshold: document.getElementById("a-threshold"),
    bThreshold: document.getElementById("b-threshold"),
    aLabel: document.getElementById("a-label"),
    bLabel: document.getElementById("b-label"),
    pareto: document.getElementById("pareto-chart"),
    classChart: document.getElementById("class-chart"),
    body: document.getElementById("item-body"),
    paste: document.getElementById("paste-area"),
    csv: document.getElementById("csv-input"),
    tooltip: document.getElementById("tooltip"),
    overlay: document.getElementById("pdf-overlay"),
    stage: document.getElementById("pdf-stage"),
    exportMenu: document.getElementById("export-menu"),
  };

  let items = loadItems();

  function uid() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function parseNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = String(value ?? "").trim().replace(/\s/g, "").replace(/€/g, "");
    if (!raw) return 0;
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    if (lastComma > lastDot) {
      return Number(raw.replace(/\./g, "").replace(",", ".")) || 0;
    }
    return Number(raw.replace(/,/g, "")) || 0;
  }

  function formatEUR(value) {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value);
  }

  function formatPct(value) {
    return `${new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value)} %`;
  }

  function formatQty(value) {
    return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(value);
  }

  function formatAxisEUR(value) {
    if (value >= 1_000_000) {
      return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(value / 1_000_000)} Mio`;
    }
    if (value >= 1000) {
      return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value / 1000)} Tsd.`;
    }
    return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value);
  }

  function loadItems() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return SAMPLE_ITEMS.map((item) => ({ ...item }));
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return SAMPLE_ITEMS.map((item) => ({ ...item }));
      }
      return parsed.map((item) => ({
        id: item.id || uid(),
        name: String(item.name ?? ""),
        qty: parseNumber(item.qty),
        price: parseNumber(item.price),
      }));
    } catch {
      return SAMPLE_ITEMS.map((item) => ({ ...item }));
    }
  }

  function saveItems() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function classify(source, aLimit, bLimit) {
    const prepared = source.map((item) => ({
      ...item,
      value: Math.max(0, parseNumber(item.qty)) * Math.max(0, parseNumber(item.price)),
    }));
    const total = prepared.reduce((sum, item) => sum + item.value, 0);
    const ranked = [...prepared].sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return a.name.localeCompare(b.name, "de");
    });

    let cumulative = 0;
    return ranked.map((item, index) => {
      const share = total > 0 ? (item.value / total) * 100 : 0;
      const previous = cumulative;
      cumulative += share;
      let abc = "C";
      if (previous < aLimit) abc = "A";
      else if (previous < bLimit) abc = "B";
      return {
        ...item,
        rank: index + 1,
        share,
        cumulative,
        abc,
      };
    });
  }

  function summarize(rows) {
    const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
    const byClass = { A: [], B: [], C: [] };
    for (const row of rows) byClass[row.abc].push(row);
    const stats = (key) => {
      const group = byClass[key];
      const value = group.reduce((sum, row) => sum + row.value, 0);
      return {
        count: group.length,
        countShare: rows.length ? (group.length / rows.length) * 100 : 0,
        value,
        valueShare: totalValue ? (value / totalValue) * 100 : 0,
      };
    };
    return {
      totalCount: rows.length,
      totalValue,
      A: stats("A"),
      B: stats("B"),
      C: stats("C"),
    };
  }

  function detectDelimiter(text) {
    const first = text.split(/\r?\n/).find((line) => line.trim()) || "";
    const counts = {
      "\t": (first.match(/\t/g) || []).length,
      ";": (first.match(/;/g) || []).length,
      ",": (first.match(/,/g) || []).length,
    };
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  function splitLine(line, delimiter) {
    const cells = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        quoted = !quoted;
      } else if (ch === delimiter && !quoted) {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  }

  function parseTable(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim());
    if (!lines.length) return [];
    const delimiter = detectDelimiter(text);
    const rows = lines.map((line) => splitLine(line, delimiter));
    const header = rows[0].map((cell) => cell.toLowerCase());
    const looksLikeHeader = header.some((cell) =>
      /artikel|bezeichnung|name|menge|anzahl|preis|stück|stueck|umsatz|wert|value/.test(cell)
    );
    const dataRows = looksLikeHeader ? rows.slice(1) : rows;
    const indexOf = (...keys) => header.findIndex((cell) => keys.some((key) => cell.includes(key)));

    let nameIdx = 0;
    let qtyIdx = 1;
    let priceIdx = 2;
    if (looksLikeHeader) {
      nameIdx = Math.max(0, indexOf("artikel", "bezeichnung", "name"));
      qtyIdx = indexOf("menge", "anzahl", "qty");
      priceIdx = indexOf("preis", "stück", "stueck");
      const valueIdx = indexOf("umsatz", "wert", "value");
      if (priceIdx < 0 && valueIdx >= 0) {
        qtyIdx = -1;
        priceIdx = valueIdx;
      }
    }

    return dataRows
      .map((cells) => {
        const name = (cells[nameIdx] || "").replace(/^"|"$/g, "");
        const qty = qtyIdx >= 0 ? parseNumber(cells[qtyIdx]) : 1;
        const price = parseNumber(cells[priceIdx] ?? cells[1]);
        return { id: uid(), name, qty: qty || 1, price };
      })
      .filter((item) => item.name);
  }

  function renderKpis(summary) {
    els.kpis.innerHTML = `
      <article class="kpi">
        <p class="label">Jahresverbrauchswert</p>
        <p class="value">${formatEUR(summary.totalValue)}</p>
        <p class="sub">${summary.totalCount} Artikel</p>
      </article>
      <article class="kpi a">
        <p class="label">Klasse A</p>
        <p class="value">${formatPct(summary.A.valueShare)}</p>
        <p class="sub">${summary.A.count} Artikel · ${formatEUR(summary.A.value)}</p>
      </article>
      <article class="kpi b">
        <p class="label">Klasse B</p>
        <p class="value">${formatPct(summary.B.valueShare)}</p>
        <p class="sub">${summary.B.count} Artikel · ${formatEUR(summary.B.value)}</p>
      </article>
      <article class="kpi c">
        <p class="label">Klasse C</p>
        <p class="value">${formatPct(summary.C.valueShare)}</p>
        <p class="sub">${summary.C.count} Artikel · ${formatEUR(summary.C.value)}</p>
      </article>
    `;
  }

  function showTooltip(html, event) {
    els.tooltip.hidden = false;
    els.tooltip.innerHTML = html;
    const x = Math.min(event.clientX + 12, window.innerWidth - 220);
    const y = Math.min(event.clientY + 12, window.innerHeight - 80);
    els.tooltip.style.left = `${x}px`;
    els.tooltip.style.top = `${y}px`;
  }

  function hideTooltip() {
    els.tooltip.hidden = true;
  }

  function svgEl(name, attrs, children = "") {
    const parts = Object.entries(attrs)
      .map(([key, value]) => `${key}="${value}"`)
      .join(" ");
    return `<${name} ${parts}>${children}</${name}>`;
  }

  function renderPareto(rows, aLimit, bLimit, target = els.pareto, options = {}) {
    const chartRows = options.maxBars && rows.length > options.maxBars
      ? rows.slice(0, options.maxBars)
      : rows;
    const width = options.width || Math.max(target.clientWidth || 640, 480);
    const height = options.height || 340;
    const m = options.margin || { top: 28, right: 58, bottom: 30, left: 54 };
    const innerW = width - m.left - m.right;
    const innerH = height - m.top - m.bottom;
    const maxValue = Math.max(...chartRows.map((row) => row.value), 1);
    const barW = Math.max(6, (innerW / Math.max(chartRows.length, 1)) * 0.72);
    const gap = innerW / Math.max(chartRows.length, 1);

    const x = (index) => m.left + gap * index + (gap - barW) / 2;
    const yValue = (value) => m.top + innerH - (value / maxValue) * innerH;
    const yCum = (pct) => m.top + innerH - (pct / 100) * innerH;
    const neon = {
      A: "#39FF14",
      B: "#FF5F1F",
      C: "#FF00E6",
      line: "#00B8D4",
      refA: "#FF9900",
      refB: "#BF00FF",
      grid: "#39FF14",
      text: "#1c1917",
      bg: "#ffffff",
    };

    const bars = chartRows
      .map((row, index) => {
        const h = innerH - (yValue(row.value) - m.top);
        return svgEl("rect", {
          x: x(index).toFixed(1),
          y: yValue(row.value).toFixed(1),
          width: barW.toFixed(1),
          height: Math.max(h, 0).toFixed(1),
          fill: neon[row.abc],
          "data-index": index,
        });
      })
      .join("");

    const points = chartRows
      .map((row, index) => `${(x(index) + barW / 2).toFixed(1)},${yCum(row.cumulative).toFixed(1)}`)
      .join(" ");
    const line = chartRows.length
      ? svgEl("polyline", {
          points,
          fill: "none",
          stroke: neon.line,
          "stroke-width": "2.5",
        })
      : "";
    const dots = chartRows
      .map((row, index) =>
        svgEl("circle", {
          cx: (x(index) + barW / 2).toFixed(1),
          cy: yCum(row.cumulative).toFixed(1),
          r: "3.5",
          fill: neon.line,
          "data-index": index,
        })
      )
      .join("");

    const yA = yCum(aLimit);
    const yB = yCum(bLimit);
    let aLabelY = yA + 4;
    let bLabelY = yB + 4;
    if (Math.abs(aLabelY - bLabelY) < 14) {
      if (aLabelY > bLabelY) {
        aLabelY += 8;
        bLabelY -= 8;
      } else {
        aLabelY -= 8;
        bLabelY += 8;
      }
    }

    const ref = (pct, label, stroke, labelY) => {
      const y = yCum(pct);
      return (
        svgEl("line", {
          x1: m.left,
          x2: width - m.right,
          y1: y.toFixed(1),
          y2: y.toFixed(1),
          stroke,
          "stroke-width": "1.5",
          "stroke-dasharray": "5 4",
        }) +
        svgEl("text", {
          x: width - m.right + 8,
          y: labelY.toFixed(1),
          fill: stroke,
          "font-size": "10",
        }, label)
      );
    };

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const value = maxValue * t;
      const y = yValue(value);
      return (
        svgEl("line", {
          x1: m.left,
          x2: width - m.right,
          y1: y.toFixed(1),
          y2: y.toFixed(1),
          stroke: neon.grid,
          "stroke-opacity": "0.22",
        }) +
        svgEl("text", {
          x: m.left - 8,
          y: y + 4,
          fill: neon.text,
          "font-size": "10",
          "text-anchor": "end",
        }, formatAxisEUR(value))
      );
    }).join("");

    const labelStep = chartRows.length > 18 ? 2 : 1;
    const xLabels = chartRows
      .map((row, index) => {
        if (index % labelStep !== 0 && index !== chartRows.length - 1) return "";
        const tx = x(index) + barW / 2;
        const ty = height - 8;
        return svgEl("text", {
          x: tx.toFixed(1),
          y: ty,
          fill: neon.text,
          "font-size": "10",
          "text-anchor": "middle",
        }, String(row.rank));
      })
      .join("");

    const axisLabels =
      svgEl("text", {
        x: m.left,
        y: 14,
        fill: neon.text,
        "font-size": "11",
      }, "Wert (€)") +
      svgEl("text", {
        x: width - m.right,
        y: 14,
        fill: neon.line,
        "font-size": "11",
        "text-anchor": "end",
      }, "Kumuliert (%)");

    const backdrop = svgEl("rect", {
      x: "0",
      y: "0",
      width,
      height,
      fill: neon.bg,
    });

    target.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Pareto-Diagramm">
        ${backdrop}
        ${ticks}
        ${ref(aLimit, `A ${aLimit}%`, neon.refA, aLabelY)}
        ${ref(bLimit, `B ${bLimit}%`, neon.refB, bLabelY)}
        ${bars}
        ${line}
        ${dots}
        ${xLabels}
        ${axisLabels}
      </svg>
      <div class="legend legend-neon">
        <span><i style="background:${neon.A}"></i>Klasse A</span>
        <span><i style="background:${neon.B}"></i>Klasse B</span>
        <span><i style="background:${neon.C}"></i>Klasse C</span>
        <span><i style="background:${neon.line}"></i>Kumulierter Wertanteil</span>
      </div>
    `;

    if (options.interactive === false) return;
    target.querySelectorAll("[data-index]").forEach((node) => {
      node.addEventListener("mousemove", (event) => {
        const row = chartRows[Number(node.getAttribute("data-index"))];
        showTooltip(
          `<strong>${row.name}</strong><br>Klasse ${row.abc} · Rang ${row.rank}<br>${formatEUR(row.value)} · ${formatPct(row.share)}<br>Kumuliert ${formatPct(row.cumulative)}`,
          event
        );
      });
      node.addEventListener("mouseleave", hideTooltip);
    });
  }

  function polar(cx, cy, r, angle) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  function arcPath(cx, cy, r, start, end) {
    const [x1, y1] = polar(cx, cy, r, end);
    const [x0, y0] = polar(cx, cy, r, start);
    const large = end - start > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
  }

  function renderClassChart(summary, target = els.classChart, options = {}) {
    const width = options.width || Math.max(target.clientWidth || 420, 360);
    const height = options.height || 340;
    const cx = options.cx || 108;
    const cy = options.cy || Math.round(height / 2);
    const r = options.r || 78;
    const holeFill = options.holeFill || "#ffffff";
    const neon = {
      A: "#39FF14",
      B: "#FF5F1F",
      C: "#FF00E6",
      count: "#00B8D4",
    };
    const slices = [
      { key: "A", color: neon.A, ...summary.A },
      { key: "B", color: neon.B, ...summary.B },
      { key: "C", color: neon.C, ...summary.C },
    ].filter((slice) => slice.value > 0);

    let angle = 0;
    const donut = slices
      .map((slice) => {
        const sweep = (slice.valueShare / 100) * 360;
        const start = angle;
        const end = angle + Math.max(sweep, 0.01);
        angle = end;
        return svgEl("path", {
          d: arcPath(cx, cy, r, start, end),
          fill: slice.color,
          "data-class": slice.key,
        });
      })
      .join("");

    const hole = svgEl("circle", { cx, cy, r: 42, fill: holeFill });
    const center =
      svgEl("text", {
        x: cx,
        y: cy - 2,
        "text-anchor": "middle",
        "font-size": "13",
        fill: neon.count,
        "font-weight": "650",
      }, "Wert") +
      svgEl("text", {
        x: cx,
        y: cy + 16,
        "text-anchor": "middle",
        "font-size": "11",
        fill: neon.count,
      }, formatAxisEUR(summary.totalValue));

    const maxShare = Math.max(...slices.map((slice) => Math.max(slice.valueShare, slice.countShare)), 1);
    const barX = options.barX || 230;
    const barW = Math.min(options.barWidth || 220, Math.max(80, width - barX - 52));
    const barStartY = options.barStartY || 48;
    const barGap = options.barGap || 88;
    const bars = ["A", "B", "C"]
      .map((key, index) => {
        const stat = summary[key];
        const y = barStartY + index * barGap;
        const valueW = (stat.valueShare / maxShare) * barW;
        const countW = (stat.countShare / maxShare) * barW;
        return `
          ${svgEl("text", { x: barX, y: y, fill: neon[key], "font-size": "13", "font-weight": "650" }, `Klasse ${key}`)}
          ${svgEl("text", { x: barX, y: y + 14, fill: neon.count, "font-size": "10" }, `${stat.count} Art. · ${formatPct(stat.countShare)}`)}
          ${svgEl("rect", { x: barX, y: y + 22, width: Math.max(valueW, 0).toFixed(1), height: 10, fill: neon[key] })}
          ${svgEl("rect", { x: barX, y: y + 36, width: Math.max(countW, 0).toFixed(1), height: 10, fill: neon.count })}
          ${svgEl("text", { x: width - 8, y: y + 31, fill: neon[key], "font-size": "10", "text-anchor": "end" }, formatPct(stat.valueShare))}
        `;
      })
      .join("");

    target.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Klassenverteilung">
        ${donut}${hole}${center}${bars}
      </svg>
      <div class="legend legend-neon">
        <span><i style="background:${neon.A}"></i>Klasse A</span>
        <span><i style="background:${neon.B}"></i>Klasse B</span>
        <span><i style="background:${neon.C}"></i>Klasse C</span>
        <span><i style="background:${neon.count}"></i>Artikelanteil</span>
      </div>
    `;
  }

  function renderTable(rows) {
    if (!items.length) {
      els.body.innerHTML = `<tr><td colspan="9" class="empty">Keine Artikel. Beispieldaten laden oder Zeilen hinzufügen.</td></tr>`;
      return;
    }

    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    els.body.innerHTML = items
      .map((item) => {
        const row = byId[item.id];
        const abc = row?.abc ?? "";
        return `
          <tr>
            <td class="num">${row ? row.rank : "–"}</td>
            <td>${abc ? `<span class="badge ${abc}">${abc}</span>` : ""}</td>
            <td><input data-id="${item.id}" data-field="name" value="${escapeAttr(item.name)}" /></td>
            <td class="num"><input data-id="${item.id}" data-field="qty" value="${formatQty(item.qty)}" /></td>
            <td class="num"><input data-id="${item.id}" data-field="price" value="${formatQty(item.price)}" /></td>
            <td class="num">${row ? formatEUR(row.value) : "–"}</td>
            <td class="num">${row ? formatPct(row.share) : "–"}</td>
            <td class="num">${row ? formatPct(row.cumulative) : "–"}</td>
            <td><button class="icon-btn" data-remove="${item.id}" type="button" title="Löschen">×</button></td>
          </tr>
        `;
      })
      .join("");
  }

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function thresholds() {
    let a = Number(els.aThreshold.value);
    let b = Number(els.bThreshold.value);
    if (b <= a) {
      b = Math.min(99, a + 1);
      els.bThreshold.value = String(b);
    }
    els.aLabel.textContent = `${a} %`;
    els.bLabel.textContent = `${b} %`;
    return { a, b };
  }

  function render() {
    const { a, b } = thresholds();
    const rows = classify(items, a, b);
    const summary = summarize(rows);
    renderKpis(summary);
    renderPareto(rows, a, b);
    renderClassChart(summary);
    renderTable(rows);
    saveItems();
  }

  function exportCsv(rows) {
    const header = ["Rang", "Klasse", "Artikel", "Menge", "Stückpreis", "Jahreswert", "Anteil_%", "Kumuliert_%"];
    const lines = [
      header.join(";"),
      ...rows.map((row) =>
        [
          row.rank,
          row.abc,
          `"${row.name.replace(/"/g, '""')}"`,
          String(row.qty).replace(".", ","),
          String(row.price).replace(".", ","),
          String(row.value.toFixed(2)).replace(".", ","),
          String(row.share.toFixed(2)).replace(".", ","),
          String(row.cumulative.toFixed(2)).replace(".", ","),
        ].join(";")
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "abc-analyse.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function dateStamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function formatDateLong() {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date());
  }

  function chunkRows(rows, size) {
    if (!rows.length) return [[]];
    const pages = [];
    for (let i = 0; i < rows.length; i += size) pages.push(rows.slice(i, i + size));
    return pages;
  }

  function pageChrome(titleRight, inner, page, total) {
    return `
      <article class="pdf-page">
        <header class="pdf-page-head">
          <div>
            <p class="eyebrow">Bestands- und Umsatzklassifikation</p>
            <h1>ABC-Analyse</h1>
          </div>
          <p class="pdf-note">${titleRight}</p>
        </header>
        <div class="pdf-body">${inner}</div>
        <footer class="pdf-foot">
          <span>DIN A4 · ${formatDateLong()}</span>
          <span>Seite ${page} von ${total}</span>
        </footer>
      </article>
    `;
  }

  function reportTable(chunk) {
    if (!chunk.length) {
      return `<p class="pdf-note">Keine Artikel vorhanden.</p>`;
    }
    const body = chunk
      .map((row) => `
        <tr>
          <td class="num">${row.rank}</td>
          <td><span class="badge ${row.abc}">${row.abc}</span></td>
          <td>${escapeAttr(row.name)}</td>
          <td class="num">${formatQty(row.qty)}</td>
          <td class="num">${formatEUR(row.price)}</td>
          <td class="num">${formatEUR(row.value)}</td>
          <td class="num">${formatPct(row.share)}</td>
          <td class="num">${formatPct(row.cumulative)}</td>
        </tr>
      `)
      .join("");
    return `
      <table class="pdf-table">
        <thead>
          <tr>
            <th>Rang</th>
            <th>Klasse</th>
            <th>Artikel</th>
            <th class="num">Menge</th>
            <th class="num">Stückpreis</th>
            <th class="num">Jahreswert</th>
            <th class="num">Anteil</th>
            <th class="num">Kumuliert</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `;
  }

  function buildReport() {
    const { a, b } = thresholds();
    const rows = classify(items, a, b);
    const summary = summarize(rows);
    const tableChunks = chunkRows(rows, 24);
    const totalPages = 1 + tableChunks.length;
    const chartNote = rows.length > 32
      ? `Pareto: die 32 wertstärksten von ${rows.length} Artikeln. Vollständige Liste ab Seite 2.`
      : "X-Achse: Rang nach Jahresverbrauchswert · Balken: Wert in € · Linie: kumuliert in %";

    const page1 = pageChrome(
      "Übersicht und Grafiken",
      `
        <div class="pdf-meta">
          <span>A-Grenze ${a} %</span>
          <span>B-Grenze ${b} %</span>
          <span>${summary.totalCount} Artikel</span>
          <span>Wert ${formatEUR(summary.totalValue)}</span>
        </div>
        <div class="pdf-kpis" id="pdf-kpis"></div>
        <p class="pdf-note">
          Artikel absteigend nach Jahresverbrauchswert (Menge × Stückpreis).
          Klasse A bis zur A-Grenze, Klasse B bis zur B-Grenze, Rest Klasse C.
          ${summary.A.count} A-Artikel (${formatPct(summary.A.countShare)} der Menge) tragen
          ${formatPct(summary.A.valueShare)} des Werts.
        </p>
        <figure class="pdf-chart">
          <figcaption>
            <strong>Pareto-Diagramm</strong>
            <span>${chartNote}</span>
          </figcaption>
          <div id="pdf-pareto" class="chart-host"></div>
        </figure>
        <figure class="pdf-chart">
          <figcaption>
            <strong>Klassenverteilung</strong>
            <span>Kreis: Wertanteil · Balken: Wertanteil (farbig) gegen Artikelanteil (grau)</span>
          </figcaption>
          <div id="pdf-class" class="chart-host"></div>
        </figure>
      `,
      1,
      totalPages
    );

    const tablePages = tableChunks
      .map((chunk, index) =>
        pageChrome(
          index === 0 ? "Klassifizierte Artikel" : `Klassifizierte Artikel (Fortsetzung ${index + 1})`,
          reportTable(chunk),
          index + 2,
          totalPages
        )
      )
      .join("");

    els.stage.innerHTML = page1 + tablePages;
    const kpiHost = document.getElementById("pdf-kpis");
    if (kpiHost) {
      kpiHost.innerHTML = els.kpis.innerHTML;
    }
    renderPareto(rows, a, b, document.getElementById("pdf-pareto"), {
      width: 690,
      height: 248,
      maxBars: 32,
      interactive: false,
      margin: { top: 26, right: 54, bottom: 28, left: 52 },
    });
    renderClassChart(summary, document.getElementById("pdf-class"), {
      width: 690,
      height: 210,
      cx: 120,
      cy: 108,
      r: 72,
      barX: 250,
      barWidth: 380,
      barStartY: 28,
      barGap: 58,
      holeFill: "#ffffff",
    });
    return { a, b, rows };
  }

  function closePreview() {
    els.overlay.classList.remove("is-open", "is-printing");
    els.overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("pdf-open");
  }

  function openPreview() {
    buildReport();
    els.overlay.classList.add("is-open");
    els.overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("pdf-open");
    els.stage.scrollTop = 0;
  }

  function printPdf() {
    const keepOpen = els.overlay.classList.contains("is-open");
    buildReport();
    els.overlay.classList.add("is-printing");
    if (keepOpen) els.overlay.classList.add("is-open");
    const previousTitle = document.title;
    document.title = `ABC-Analyse_${dateStamp()}`;
    const restore = () => {
      document.title = previousTitle;
      els.overlay.classList.remove("is-printing");
      if (!keepOpen) closePreview();
    };
    window.addEventListener("afterprint", restore, { once: true });
    setTimeout(() => window.print(), 50);
  }

  function closeExportMenu() {
    if (els.exportMenu) els.exportMenu.open = false;
  }

  document.getElementById("btn-sample").addEventListener("click", () => {
    items = SAMPLE_ITEMS.map((item) => ({ ...item, id: uid() }));
    render();
  });

  document.getElementById("btn-add").addEventListener("click", () => {
    items.push({ id: uid(), name: "", qty: 1, price: 0 });
    render();
    const last = els.body.querySelector("tr:last-child input[data-field='name']");
    last?.focus();
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    items = [];
    render();
  });

  document.getElementById("btn-pdf-preview").addEventListener("click", () => {
    closeExportMenu();
    openPreview();
  });

  document.getElementById("btn-pdf-print").addEventListener("click", () => {
    closeExportMenu();
    printPdf();
  });

  document.getElementById("btn-export-csv").addEventListener("click", () => {
    closeExportMenu();
    const { a, b } = thresholds();
    exportCsv(classify(items, a, b));
  });

  document.getElementById("pdf-print").addEventListener("click", printPdf);
  document.getElementById("pdf-close").addEventListener("click", closePreview);

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".export-menu")) closeExportMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeExportMenu();
      closePreview();
    }
  });

  els.csv.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseTable(text);
    if (parsed.length) items = parsed;
    event.target.value = "";
    render();
  });

  function applyPastedText(text) {
    const parsed = parseTable(text);
    if (parsed.length >= 2 || (parsed.length === 1 && parsed[0].price > 0)) {
      items = parsed;
      els.paste.value = "";
      render();
      return true;
    }
    return false;
  }

  els.paste.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text") || "";
    if (applyPastedText(text)) event.preventDefault();
  });

  els.paste.addEventListener("change", () => {
    applyPastedText(els.paste.value);
  });

  els.body.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-id]");
    if (!input) return;
    const item = items.find((entry) => entry.id === input.dataset.id);
    if (!item) return;
    if (input.dataset.field === "name") item.name = input.value;
    if (input.dataset.field === "qty") item.qty = parseNumber(input.value);
    if (input.dataset.field === "price") item.price = parseNumber(input.value);
    setTimeout(() => {
      const focused = document.activeElement;
      const focusId = focused instanceof HTMLInputElement ? focused.dataset.id : "";
      const focusField = focused instanceof HTMLInputElement ? focused.dataset.field : "";
      render();
      if (!focusId || !focusField) return;
      const next = els.body.querySelector(
        `input[data-id="${focusId}"][data-field="${focusField}"]`
      );
      if (next instanceof HTMLInputElement) next.focus();
    }, 0);
  });

  els.body.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    items = items.filter((item) => item.id !== button.dataset.remove);
    render();
  });

  els.aThreshold.addEventListener("input", render);
  els.bThreshold.addEventListener("input", render);
  window.addEventListener("resize", () => {
    if (els.overlay.classList.contains("is-open")) return;
    const { a, b } = thresholds();
    const rows = classify(items, a, b);
    renderPareto(rows, a, b);
    renderClassChart(summarize(rows));
  });

  render();
})();
