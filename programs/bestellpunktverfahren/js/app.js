(function () {
  const STORAGE_KEY = "bestellpunkt.articles.v1";
  const FIELDS = [
    "name", "sku", "unit", "demand", "period", "sigma", "workingDays",
    "leadDays", "ssMode", "serviceLevel", "extraDays", "ssFixed",
    "orderCost", "unitPrice", "holdRate", "holdCost", "packSize", "minQty",
    "stock", "onOrder",
  ];

  const $ = (id) => document.getElementById(id);

  function uid() {
    return "a" + Math.random().toString(36).slice(2, 10);
  }

  function sampleArticles() {
    return [
      {
        id: uid(),
        name: "Europalette",
        sku: "PAL-800",
        unit: "Stk",
        demand: 40,
        period: "tag",
        sigma: 8,
        workingDays: 250,
        leadDays: 5,
        ssMode: "service",
        serviceLevel: 95,
        extraDays: 3,
        ssFixed: 50,
        orderCost: 45,
        unitPrice: 12.5,
        holdRate: 18,
        holdCost: 0,
        packSize: 1,
        minQty: 10,
        stock: 180,
        onOrder: 0,
      },
      {
        id: uid(),
        name: "Schraubenset M8",
        sku: "SCH-M8",
        unit: "Set",
        demand: 120,
        period: "woche",
        sigma: 18,
        workingDays: 250,
        leadDays: 10,
        ssMode: "service",
        serviceLevel: 97.5,
        extraDays: 4,
        ssFixed: 30,
        orderCost: 28,
        unitPrice: 2.4,
        holdRate: 20,
        holdCost: 0,
        packSize: 20,
        minQty: 20,
        stock: 95,
        onOrder: 0,
      },
      {
        id: uid(),
        name: "Hydraulikpumpe",
        sku: "HYD-220",
        unit: "Stk",
        demand: 6,
        period: "monat",
        sigma: 2.2,
        workingDays: 250,
        leadDays: 45,
        ssMode: "service",
        serviceLevel: 99,
        extraDays: 10,
        ssFixed: 2,
        orderCost: 90,
        unitPrice: 186,
        holdRate: 15,
        holdCost: 0,
        packSize: 1,
        minQty: 1,
        stock: 3,
        onOrder: 1,
      },
    ];
  }

  function blankArticle() {
    return {
      id: uid(),
      name: "Neuer Artikel",
      sku: "",
      unit: "Stk",
      demand: 10,
      period: "tag",
      sigma: 2,
      workingDays: 250,
      leadDays: 7,
      ssMode: "service",
      serviceLevel: 95,
      extraDays: 3,
      ssFixed: 10,
      orderCost: 40,
      unitPrice: 10,
      holdRate: 18,
      holdCost: 0,
      packSize: 1,
      minQty: 0,
      stock: 50,
      onOrder: 0,
    };
  }

  const state = {
    articles: [],
    selectedId: null,
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          state.articles = parsed;
          state.selectedId = parsed[0].id;
          return;
        }
      }
    } catch (_) {}
    state.articles = sampleArticles();
    state.selectedId = state.articles[0].id;
    persist();
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.articles));
  }

  function selected() {
    return state.articles.find((a) => a.id === state.selectedId) || null;
  }

  function readFormInto(article) {
    if (!article) return;
    for (const key of FIELDS) {
      const el = $(key);
      if (!el) continue;
      if (el.type === "number") article[key] = el.value === "" ? 0 : Number(el.value);
      else article[key] = el.value;
    }
  }

  function writeForm(article) {
    if (!article) return;
    for (const key of FIELDS) {
      const el = $(key);
      if (!el) continue;
      el.value = article[key] == null ? "" : article[key];
    }
    updateSsModeUi();
  }

  function updateSsModeUi() {
    const mode = $("ssMode").value;
    $("ss-service").classList.toggle("hidden", mode !== "service");
    $("ss-days").classList.toggle("hidden", mode !== "days");
    $("ss-fixed").classList.toggle("hidden", mode !== "fixed");
  }

  function statusClass(status) {
    if (status === "kritisch") return "danger";
    if (status === "bestellen") return "warn";
    return "ok";
  }

  function pct(part, total) {
    if (!(total > 0)) return 0;
    return Math.min(100, Math.max(0, (part / total) * 100));
  }

  function renderList() {
    const box = $("article-list");
    box.innerHTML = state.articles.map((article) => {
      const r = BestellpunktCalc.compute(article);
      const cls = statusClass(r.status);
      const on = article.id === state.selectedId ? " on" : "";
      return `<button type="button" class="article-item${on}" data-id="${article.id}">
        <span class="dot ${cls}"></span>
        <span style="flex:1;min-width:0">
          <strong>${escapeHtml(article.name || "Ohne Namen")}</strong>
          <span class="meta">${escapeHtml(article.sku || "–")} · s ${BestellpunktCalc.formatQty(r.reorderPoint)}</span>
        </span>
      </button>`;
    }).join("");
  }

  function renderHeader(article, result) {
    const box = $("header-stats");
    if (!article || !result) {
      box.innerHTML = `<div class="header-stat"><span>Artikel</span><strong>–</strong></div>`;
      return;
    }
    const cls = statusClass(result.status);
    box.innerHTML = `
      <div class="header-stat"><span>Bestellpunkt s</span><strong>${BestellpunktCalc.formatQty(result.reorderPoint)} ${escapeHtml(article.unit || "")}</strong></div>
      <div class="header-stat"><span>Bestellmenge Q</span><strong>${BestellpunktCalc.formatQty(result.orderQty, 0)} ${escapeHtml(article.unit || "")}</strong></div>
      <div class="header-stat ${cls}"><span>Status</span><strong>${BestellpunktCalc.statusLabel(result.status)}</strong></div>
      <div class="header-stat"><span>Reichweite</span><strong>${BestellpunktCalc.formatDays(result.coverageDays)}</strong></div>
    `;
  }

  function renderBars(article, result) {
    const box = $("usage-bars");
    if (!result) {
      box.innerHTML = "";
      return;
    }
    const unit = article.unit || "";
    const posPct = pct(result.inventoryPosition, Math.max(result.maxStock, result.reorderPoint, 1));
    const ssPct = pct(result.safety, Math.max(result.maxStock, 1));
    const posCls = statusClass(result.status);
    box.innerHTML = `
      <aside class="usage-bar-panel">
        <h2 class="usage-bar-title">Verfügbarer Bestand</h2>
        <div class="usage-bar-row">
          <span class="usage-bar-label">Position</span>
          <div class="usage-bar-track"><div class="usage-bar-fill ${posCls}" style="width:${posPct.toFixed(1)}%"></div></div>
          <span class="usage-bar-value">${BestellpunktCalc.formatQty(result.inventoryPosition)} ${escapeHtml(unit)}</span>
        </div>
        <div class="usage-bar-row">
          <span class="usage-bar-label">bis s</span>
          <div class="usage-bar-track"><div class="usage-bar-fill" style="width:${pct(Math.max(0, result.inventoryPosition - result.reorderPoint), Math.max(result.maxStock, 1)).toFixed(1)}%"></div></div>
          <span class="usage-bar-value">${BestellpunktCalc.formatDays(result.daysToReorder)}</span>
        </div>
      </aside>
      <aside class="usage-bar-panel">
        <h2 class="usage-bar-title">Puffer</h2>
        <div class="usage-bar-row">
          <span class="usage-bar-label">SB-Anteil</span>
          <div class="usage-bar-track"><div class="usage-bar-fill ok" style="width:${ssPct.toFixed(1)}%"></div></div>
          <span class="usage-bar-value">${BestellpunktCalc.formatQty(result.safety)} ${escapeHtml(unit)}</span>
        </div>
        <div class="usage-bar-row">
          <span class="usage-bar-label">Servicegrad</span>
          <div class="usage-bar-track"><div class="usage-bar-fill" style="width:${(result.serviceLevel * 100).toFixed(1)}%"></div></div>
          <span class="usage-bar-value">${(result.serviceLevel * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %</span>
        </div>
      </aside>
    `;
  }

  function renderResults(article, result) {
    const banner = $("order-banner");
    const grid = $("result-grid");
    const formula = $("formula-box");
    if (!article || !result) {
      banner.className = "order-banner ok";
      banner.textContent = "Kein Artikel gewählt.";
      grid.innerHTML = "";
      formula.textContent = "";
      return;
    }
    const unit = article.unit || "";
    const cls = statusClass(result.status);
    banner.className = "order-banner " + cls;
    if (result.mustOrder) {
      banner.innerHTML = `<strong>${BestellpunktCalc.statusLabel(result.status)}.</strong> Vorschlag: <strong>${BestellpunktCalc.formatQty(result.suggestedQty, 0)} ${escapeHtml(unit)}</strong> bestellen.`;
    } else {
      banner.innerHTML = `<strong>Bestand ok.</strong> Nächste Bestellung in ${BestellpunktCalc.formatDays(result.daysToReorder)}.`;
    }

    const rows = [
      ["Bedarf / Tag", BestellpunktCalc.formatQty(result.dDay) + " " + unit],
      ["Bedarf in WBZ", BestellpunktCalc.formatQty(result.ddlt) + " " + unit],
      ["z-Wert", BestellpunktCalc.formatQty(result.z, 3)],
      ["σ in WBZ", BestellpunktCalc.formatQty(result.sigmaLead)],
      ["Sicherheitsbestand", BestellpunktCalc.formatQty(result.safety) + " " + unit],
      ["Bestellpunkt s", BestellpunktCalc.formatQty(result.reorderPoint) + " " + unit],
      ["Andler-Menge Q*", BestellpunktCalc.formatQty(result.eoq, 1) + " " + unit],
      ["Bestellmenge Q", BestellpunktCalc.formatQty(result.orderQty, 0) + " " + unit],
      ["Verfügbarer Bestand", BestellpunktCalc.formatQty(result.inventoryPosition) + " " + unit],
      ["Mittlerer Bestand", BestellpunktCalc.formatQty(result.avgStock) + " " + unit],
      ["Bestellzyklus", BestellpunktCalc.formatDays(result.cycleDays)],
      ["Umschlag / Jahr", BestellpunktCalc.formatQty(result.turnover, 1)],
      ["Lagerkostensatz", BestellpunktCalc.formatMoney(result.holdCostYear) + " / Jahr"],
    ];
    grid.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");

    const period = BestellpunktCalc.PERIOD_LABEL[result.period] || result.period;
    formula.innerHTML = `
      <code>s = d · WBZ + SB</code><br>
      Tagesbedarf d aus ${BestellpunktCalc.formatQty(result.demandPeriod)} / ${period}.
      WBZ = ${BestellpunktCalc.formatQty(result.leadDays, 1)} Tage.
      ${result.ssMode === "service"
        ? `SB = z · σ · √WBZ mit z = ${BestellpunktCalc.formatQty(result.z, 3)} bei ${(result.serviceLevel * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })}&nbsp;%.`
        : result.ssMode === "days"
          ? `SB = d · ${BestellpunktCalc.formatQty(result.extraDays, 1)} zusätzliche Tage.`
          : "SB als feste Menge."}
      <br><code>Q = √(2 · D · K<sub>B</sub> / k<sub>L</sub>)</code>
      ${result.stockoutRisk ? "<br>Hinweis: Q ist kleiner als der Bedarf in der WBZ – Fehlmengen möglich." : ""}
    `;
  }

  function renderOverview() {
    const body = $("overview-body");
    body.innerHTML = state.articles.map((article) => {
      const r = BestellpunktCalc.compute(article);
      const on = article.id === state.selectedId ? " on" : "";
      return `<tr class="${on}" data-id="${article.id}">
        <td>${escapeHtml(article.name || "–")}</td>
        <td class="num">${BestellpunktCalc.formatQty(r.inventoryPosition)}</td>
        <td class="num">${BestellpunktCalc.formatQty(r.reorderPoint)}</td>
        <td class="num">${BestellpunktCalc.formatQty(r.orderQty, 0)}</td>
        <td>${BestellpunktCalc.statusLabel(r.status)}</td>
      </tr>`;
    }).join("");
  }

  function render() {
    const article = selected();
    if (article) readFormInto(article);
    persist();
    const result = article ? BestellpunktCalc.compute(article) : null;
    renderList();
    renderHeader(article, result);
    renderBars(article, result);
    renderResults(article, result);
    renderOverview();
    BestellpunktChart.draw($("rop-canvas"), result, article);
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function bind() {
    for (const key of FIELDS) {
      const el = $(key);
      if (!el) continue;
      el.addEventListener("input", () => {
        if (key === "ssMode") updateSsModeUi();
        render();
      });
      el.addEventListener("change", render);
    }

    $("article-list").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-id]");
      if (!btn) return;
      const current = selected();
      if (current) readFormInto(current);
      state.selectedId = btn.dataset.id;
      writeForm(selected());
      render();
    });

    $("overview-body").addEventListener("click", (event) => {
      const row = event.target.closest("tr[data-id]");
      if (!row) return;
      const current = selected();
      if (current) readFormInto(current);
      state.selectedId = row.dataset.id;
      writeForm(selected());
      render();
    });

    $("btn-add").addEventListener("click", () => {
      const current = selected();
      if (current) readFormInto(current);
      const next = blankArticle();
      state.articles.push(next);
      state.selectedId = next.id;
      writeForm(next);
      render();
    });

    $("btn-delete").addEventListener("click", () => {
      if (!state.selectedId) return;
      state.articles = state.articles.filter((a) => a.id !== state.selectedId);
      if (!state.articles.length) state.articles = [blankArticle()];
      state.selectedId = state.articles[0].id;
      writeForm(selected());
      render();
    });

    $("btn-sample").addEventListener("click", () => {
      state.articles = sampleArticles();
      state.selectedId = state.articles[0].id;
      writeForm(selected());
      render();
    });

    $("btn-print").addEventListener("click", () => window.print());

    $("btn-export").addEventListener("click", () => {
      const current = selected();
      if (current) readFormInto(current);
      persist();
      const blob = new Blob([JSON.stringify(state.articles, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bestellpunkt.json";
      a.click();
      URL.revokeObjectURL(url);
    });

    $("btn-import").addEventListener("click", () => $("file-import").click());
    $("file-import").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (!Array.isArray(parsed) || !parsed.length) throw new Error("leer");
        state.articles = parsed.map((item) => Object.assign(blankArticle(), item, { id: item.id || uid() }));
        state.selectedId = state.articles[0].id;
        writeForm(selected());
        render();
      } catch (_) {
        alert("Die Datei konnte nicht gelesen werden.");
      }
    });

    window.addEventListener("resize", () => {
      const article = selected();
      BestellpunktChart.draw($("rop-canvas"), article ? BestellpunktCalc.compute(article) : null, article);
    });
  }

  load();
  writeForm(selected());
  bind();
  render();
})();
