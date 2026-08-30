(() => {
  const STORAGE_KEY = "stochastik-bedarf-v2";
  const MC_N = 4000;
  const UNITS = ["Tag", "Woche", "Monat", "Jahr"];
  const UNIT_DAYS = { Tag: 1, Woche: 7, Monat: 365.25 / 12, Jahr: 365.25 };
  const RATE_FIELDS = { Tag: "day", Woche: "week", Monat: "month", Jahr: "year" };
  const XYZ_COLORS = { X: "#0f766e", Y: "#b45309", Z: "#9f1239" };

  const SAMPLE_ITEMS = [
    { sku: "100-6208", name: "Kugellager 6208-2RS", lt: 2, price: 18.5, day: 2.8, week: 20, month: 86, year: 1040 },
    { sku: "110-M830", name: "Schraube M8x30 8.8", lt: 1, price: 0.12, day: 58, week: 410, month: 1780, year: 21300 },
    { sku: "120-F10", name: "Filterpatrone F-10", lt: 3, price: 14.2, day: 2.2, week: 13, month: 40, year: 380 },
    { sku: "130-VIT", name: "Dichtungssatz Viton", lt: 2, price: 42, day: 1.1, week: 8, month: 22, year: 210 },
    { sku: "140-HA90", name: "Hydraulikaggregat HA-90", lt: 6, price: 12800, day: 0, week: 0, month: 1, year: 4 },
    { sku: "150-S715", name: "SPS-Steuerung S7-1500", lt: 5, price: 4200, day: 0, week: 0.5, month: 1, year: 6 },
    { sku: "160-LF35", name: "Linearführung LF-35", lt: 4, price: 890, day: 0.7, week: 4.8, month: 21, year: 250 },
    { sku: "170-SM400", name: "Servomotor SM-400", lt: 5, price: 1850, day: 0.25, week: 2, month: 6, year: 90 },
    { sku: "180-PROX", name: "Sensorik-Set Proximity", lt: 2, price: 125, day: 3.6, week: 26, month: 110, year: 1350 },
    { sku: "190-M20", name: "Kabelverschraubung M20", lt: 1, price: 3.8, day: 11.5, week: 80, month: 350, year: 4200 },
    { sku: "200-REL24", name: "Relaisbaustein 24V", lt: 2, price: 22, day: 1.8, week: 13, month: 48, year: 620 },
    { sku: "210-PZ50", name: "Pneumatikzylinder PZ-50", lt: 3, price: 168, day: 1, week: 7, month: 30, year: 365 },
  ];

  const els = {
    kpis: document.getElementById("kpis"),
    periodUnit: document.getElementById("period-unit"),
    serviceLevel: document.getElementById("service-level"),
    slLabel: document.getElementById("sl-label"),
    policy: document.getElementById("policy"),
    reviewWrap: document.getElementById("review-wrap"),
    reviewInterval: document.getElementById("review-interval"),
    distMode: document.getElementById("dist-mode"),
    xThreshold: document.getElementById("x-threshold"),
    yThreshold: document.getElementById("y-threshold"),
    xLabel: document.getElementById("x-label"),
    yLabel: document.getElementById("y-label"),
    body: document.getElementById("item-body"),
    paste: document.getElementById("paste-area"),
    csv: document.getElementById("csv-input"),
    detail: document.getElementById("detail"),
    xyzChart: document.getElementById("xyz-chart"),
    resultChart: document.getElementById("result-chart"),
    resultCaption: document.getElementById("result-chart-caption"),
    horizonChart: document.getElementById("horizon-chart"),
    ltHead: document.getElementById("lt-head"),
    tooltip: document.getElementById("tooltip"),
    overlay: document.getElementById("pdf-overlay"),
    stage: document.getElementById("pdf-stage"),
    exportMenu: document.getElementById("export-menu"),
  };

  let items = [];
  let selectedId = "";
  let settings = loadSettings();

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

  function parseDemand(value) {
    if (Array.isArray(value)) {
      return value.map((v) => parseNumber(v)).filter((v) => Number.isFinite(v));
    }
    const raw = String(value ?? "").trim();
    if (!raw) return [];
    return raw
      .split(/[;|\t/,]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map(parseNumber)
      .filter((v) => Number.isFinite(v) && v >= 0);
  }

  function formatQty(value, digits = 2) {
    if (!Number.isFinite(value)) return "–";
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    }).format(value);
  }

  function formatPct(value) {
    return `${new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value)} %`;
  }

  function formatCV(value) {
    if (!Number.isFinite(value)) return "–";
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  function formatEUR(value) {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value);
  }

  function formatDemand(demand) {
    return demand.map((v) => String(v).replace(".", ",")).join("; ");
  }

  function formatInput(value) {
    if (value == null || value === "") return "";
    return formatQty(value);
  }

  function parseOptionalNumber(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const num = parseNumber(raw);
    return Number.isFinite(num) ? num : null;
  }

  function convertDemand(value, fromUnit, toUnit) {
    if (!Number.isFinite(value)) return null;
    return value * UNIT_DAYS[toUnit] / UNIT_DAYS[fromUnit];
  }

  function rateEntries(item) {
    return UNITS.map((unit) => ({
      unit,
      field: RATE_FIELDS[unit],
      value: item[RATE_FIELDS[unit]],
    })).filter((entry) => entry.value != null && Number.isFinite(entry.value));
  }

  function demandFromRates(item, unit) {
    return rateEntries(item).map((entry) => convertDemand(entry.value, entry.unit, unit));
  }

  function blankItem() {
    return { id: uid(), sku: "", name: "", lt: 1, price: 0, day: null, week: null, month: null, year: null };
  }

  function normalizeItem(item) {
    const next = {
      id: item.id || uid(),
      sku: String(item.sku ?? ""),
      name: String(item.name ?? ""),
      lt: Math.max(0, parseNumber(item.lt)),
      price: Math.max(0, parseNumber(item.price)),
      day: item.day == null || item.day === "" ? null : parseNumber(item.day),
      week: item.week == null || item.week === "" ? null : parseNumber(item.week),
      month: item.month == null || item.month === "" ? null : parseNumber(item.month),
      year: item.year == null || item.year === "" ? null : parseNumber(item.year),
    };
    const hasRates = rateEntries(next).length > 0;
    if (!hasRates && Array.isArray(item.demand) && item.demand.length) {
      const mu = mean(parseDemand(item.demand));
      next.week = mu;
      next.day = convertDemand(mu, "Woche", "Tag");
      next.month = convertDemand(mu, "Woche", "Monat");
      next.year = convertDemand(mu, "Woche", "Jahr");
    }
    return next;
  }

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function hashSeed(text) {
    let h = 2166136261;
    const s = String(text);
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  function stdev(values, avg) {
    if (values.length < 2) return 0;
    const m = avg ?? mean(values);
    const ss = values.reduce((sum, v) => sum + (v - m) ** 2, 0);
    return Math.sqrt(ss / (values.length - 1));
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    if (sorted.length === 1) return sorted[0];
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const t = idx - lo;
    return sorted[lo] * (1 - t) + sorted[hi] * t;
  }

  function erf(x) {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const t = 1 / (1 + 0.3275911 * ax);
    const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax));
    return sign * y;
  }

  function normCdf(x) {
    return 0.5 * (1 + erf(x / Math.SQRT2));
  }

  function normPdf(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  function normsInv(p) {
    if (p <= 0) return -8;
    if (p >= 1) return 8;
    const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577509590705e2, -3.066479806614716e1, 2.506628277459239];
    const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    const pLow = 0.02425;
    const pHigh = 1 - pLow;
    let q;
    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p <= pHigh) {
      q = p - 0.5;
      const r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  function poissonPmf(k, lambda) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    if (k < 0) return 0;
    let log = -lambda + k * Math.log(lambda);
    for (let i = 2; i <= k; i += 1) log -= Math.log(i);
    return Math.exp(log);
  }

  function poissonInv(p, lambda) {
    if (lambda <= 0) return 0;
    if (p >= 1) return Infinity;
    if (lambda > 80) {
      return Math.max(0, Math.ceil(lambda + normsInv(p) * Math.sqrt(lambda) - 0.5));
    }
    let cdf = 0;
    let pmf = Math.exp(-lambda);
    let k = 0;
    const cap = Math.ceil(lambda + 12 * Math.sqrt(lambda) + 40);
    while (cdf + pmf < p && k < cap) {
      cdf += pmf;
      k += 1;
      pmf *= lambda / k;
    }
    return k;
  }

  function gauss(rng) {
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function poissonSample(lambda, rng) {
    if (lambda <= 0) return 0;
    if (lambda > 30) {
      return Math.max(0, Math.round(lambda + gauss(rng) * Math.sqrt(lambda)));
    }
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= rng();
    } while (p > L);
    return k - 1;
  }

  function recommendDist(demand, mu, sigma) {
    if (demand.length < 2) return { key: "empirical", label: "Empirisch" };
    const variance = sigma * sigma;
    const integerish = demand.every((v) => Math.abs(v - Math.round(v)) < 1e-6);
    const overDisp = mu > 0 ? variance / mu : Infinity;
    const cv = mu > 0 ? sigma / mu : Infinity;
    const zeros = demand.filter((v) => v === 0).length / demand.length;
    if (zeros > 0.45 || cv >= 1.2) return { key: "empirical", label: "Empirisch" };
    if (integerish && mu < 25 && overDisp < 1.35 && overDisp > 0.65) {
      return { key: "poisson", label: "Poisson" };
    }
    if (cv < 1.15) return { key: "normal", label: "Normal" };
    return { key: "empirical", label: "Empirisch" };
  }

  function coveragePeriods(lt, policy, review) {
    const lead = Math.max(0, lt);
    if (policy === "periodic") return lead + Math.max(1, review);
    return Math.max(lead, 0.01);
  }

  function analyzeItem(item, params) {
    const demand = demandFromRates(item, params.periodUnit).filter((v) => Number.isFinite(v) && v >= 0);
    const n = demand.length;
    const mu = mean(demand);
    const sigma = stdev(demand, mu);
    const med = median(demand);
    const cv = mu > 0 ? sigma / mu : n ? Infinity : 0;
    const xmin = n ? Math.min(...demand) : 0;
    const xmax = n ? Math.max(...demand) : 0;
    let xyz = "Z";
    if (Number.isFinite(cv) && cv < params.xLimit) xyz = "X";
    else if (Number.isFinite(cv) && cv < params.yLimit) xyz = "Y";
    if (n < 1) xyz = "Z";

    const rec = recommendDist(demand, mu, sigma);
    const distKey = params.distMode === "auto" ? rec.key : params.distMode;
    const distLabel = {
      normal: "Normal",
      poisson: "Poisson",
      empirical: "Empirisch",
    }[distKey] || rec.label;

    const T = coveragePeriods(item.lt, params.policy, params.review);
    const muL = mu * T;
    const sigmaL = sigma * Math.sqrt(T);
    const z = normsInv(params.sl);
    let ss;
    let target;
    let sim = null;
    if (distKey === "poisson") {
      const k = poissonInv(params.sl, muL);
      target = k;
      ss = Math.max(0, k - muL);
    } else if (distKey === "empirical") {
      sim = simulateLeadDemand(demand, T, distKey, mu, sigma, item.id);
      const q = percentile(sim, params.sl);
      target = q;
      ss = Math.max(0, q - muL);
    } else {
      ss = Math.max(0, z * sigmaL);
      target = muL + ss;
    }

    const ssUnits = Math.ceil(ss - 1e-9);
    const reorder = Math.ceil(target - 1e-9);
    const ssValue = ssUnits * Math.max(0, item.price);

    return {
      ...item,
      demand,
      n,
      mu,
      sigma,
      median: med,
      cv,
      min: xmin,
      max: xmax,
      xyz,
      distKey,
      distLabel,
      recLabel: rec.label,
      T,
      muL,
      sigmaL,
      z,
      ss,
      ssUnits,
      reorder,
      ssValue,
      policy: params.policy,
      sim,
    };
  }

  function simulateLeadDemand(demand, T, distKey, mu, sigma, seedKey) {
    const rng = mulberry32(hashSeed(`${seedKey}|${distKey}|${T}|${demand.join(",")}`));
    const whole = Math.floor(T);
    const frac = Math.max(0, T - whole);
    const out = [];
    for (let i = 0; i < MC_N; i += 1) {
      let sum = 0;
      if (distKey === "empirical" && demand.length) {
        for (let p = 0; p < whole; p += 1) {
          sum += demand[Math.floor(rng() * demand.length)];
        }
        if (frac > 0) sum += frac * demand[Math.floor(rng() * demand.length)];
      } else if (distKey === "poisson") {
        sum = poissonSample(mu * T, rng);
      } else {
        sum = mu * T + gauss(rng) * sigma * Math.sqrt(T);
      }
      out.push(Math.max(0, sum));
    }
    out.sort((a, b) => a - b);
    return out;
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}-settings`);
      if (!raw) return defaultSettings();
      return { ...defaultSettings(), ...JSON.parse(raw) };
    } catch {
      return defaultSettings();
    }
  }

  function defaultSettings() {
    return {
      periodUnit: "Woche",
      sl: 95,
      policy: "continuous",
      review: 4,
      distMode: "auto",
      xLimit: 0.5,
      yLimit: 1,
    };
  }

  function saveSettings() {
    localStorage.setItem(`${STORAGE_KEY}-settings`, JSON.stringify(settings));
  }

  function sampleItems() {
    return SAMPLE_ITEMS.map((item) => normalizeItem({ ...item, id: uid() }));
  }

  function loadItems() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("stochastik-bedarf-v1");
      if (!raw) return sampleItems();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) return sampleItems();
      return parsed.map((item) => normalizeItem(item));
    } catch {
      return sampleItems();
    }
  }

  function saveItems() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function currentParams() {
    let xLimit = Number(els.xThreshold.value);
    let yLimit = Number(els.yThreshold.value);
    if (yLimit <= xLimit) {
      yLimit = Math.min(2, xLimit + 0.05);
      els.yThreshold.value = String(yLimit);
    }
    const sl = Number(els.serviceLevel.value) / 100;
    els.slLabel.textContent = `${formatQty(Number(els.serviceLevel.value), 1)} %`;
    els.xLabel.textContent = formatCV(xLimit);
    els.yLabel.textContent = formatCV(yLimit);
    els.reviewWrap.hidden = els.policy.value !== "periodic";
    if (els.ltHead) els.ltHead.textContent = `WBZ (${els.periodUnit.value})`;
    if (els.resultCaption) {
      els.resultCaption.textContent = `Balken je Artikel in ${els.periodUnit.value} · Bedarf μ, Sicherheitsbestand, Meldebestand s`;
    }
    settings = {
      periodUnit: els.periodUnit.value,
      sl: Number(els.serviceLevel.value),
      policy: els.policy.value,
      review: Math.max(1, parseNumber(els.reviewInterval.value) || 1),
      distMode: els.distMode.value,
      xLimit,
      yLimit,
    };
    saveSettings();
    return { ...settings, sl };
  }

  function applySettingsToForm() {
    els.periodUnit.value = settings.periodUnit;
    els.serviceLevel.value = String(settings.sl);
    els.policy.value = settings.policy;
    els.reviewInterval.value = String(settings.review);
    els.distMode.value = settings.distMode;
    els.xThreshold.value = String(settings.xLimit);
    els.yThreshold.value = String(settings.yLimit);
    els.reviewWrap.hidden = settings.policy !== "periodic";
  }

  function analyzeAll() {
    const params = currentParams();
    return items.map((item) => analyzeItem(item, params));
  }

  function summarize(rows) {
    const by = { X: [], Y: [], Z: [] };
    for (const row of rows) by[row.xyz]?.push(row);
    const stats = (key) => {
      const group = by[key];
      const ss = group.reduce((sum, row) => sum + row.ssUnits, 0);
      const value = group.reduce((sum, row) => sum + row.ssValue, 0);
      return {
        count: group.length,
        countShare: rows.length ? (group.length / rows.length) * 100 : 0,
        ss,
        ssShare: 0,
        value,
      };
    };
    const X = stats("X");
    const Y = stats("Y");
    const Z = stats("Z");
    const totalSs = X.ss + Y.ss + Z.ss;
    const totalValue = X.value + Y.value + Z.value;
    const withShare = (s) => ({
      ...s,
      ssShare: totalSs ? (s.ss / totalSs) * 100 : 0,
      valueShare: totalValue ? (s.value / totalValue) * 100 : 0,
    });
    const cvs = rows.filter((r) => Number.isFinite(r.cv) && r.n >= 2).map((r) => r.cv);
    return {
      totalCount: rows.length,
      totalSs,
      totalValue,
      avgCv: cvs.length ? mean(cvs) : 0,
      X: withShare(X),
      Y: withShare(Y),
      Z: withShare(Z),
    };
  }

  function showTooltip(html, event) {
    els.tooltip.hidden = false;
    els.tooltip.innerHTML = html;
    const x = Math.min(event.clientX + 12, window.innerWidth - 240);
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

  function renderKpis(summary) {
    els.kpis.innerHTML = `
      <article class="kpi navy">
        <p class="label">Artikel</p>
        <p class="value">${summary.totalCount}</p>
        <p class="sub">Ø CV ${formatCV(summary.avgCv)}</p>
      </article>
      <article class="kpi x">
        <p class="label">Klasse X</p>
        <p class="value">${summary.X.count}</p>
        <p class="sub">${formatPct(summary.X.countShare)} · regelmäßig</p>
      </article>
      <article class="kpi y">
        <p class="label">Klasse Y</p>
        <p class="value">${summary.Y.count}</p>
        <p class="sub">${formatPct(summary.Y.countShare)} · schwankend</p>
      </article>
      <article class="kpi z">
        <p class="label">Klasse Z</p>
        <p class="value">${summary.Z.count}</p>
        <p class="sub">${formatPct(summary.Z.countShare)} · unregelmäßig</p>
      </article>
      <article class="kpi navy">
        <p class="label">Sicherheitsbestand</p>
        <p class="value">${formatQty(summary.totalSs, 0)}</p>
        <p class="sub">${formatEUR(summary.totalValue)}</p>
      </article>
    `;
  }

  function renderTable(rows) {
    if (!items.length) {
      els.body.innerHTML = `<tr><td colspan="12" class="empty">Keine Artikel. Beispieldaten laden oder Zeilen hinzufügen.</td></tr>`;
      return;
    }
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    const pointLabel = currentParams().policy === "periodic" ? "S" : "s";
    els.body.innerHTML = items
      .map((item) => {
        const row = byId[item.id];
        const selected = item.id === selectedId ? "is-selected" : "";
        return `
          <tr class="${selected}" data-select="${item.id}">
            <td data-result="xyz">${row ? `<span class="badge ${row.xyz}">${row.xyz}</span>` : ""}</td>
            <td class="sku-col cell-entry"><input data-id="${item.id}" data-field="sku" placeholder="Artikelnr" title="Eingabefeld Artikelnr" value="${escapeAttr(item.sku)}" /></td>
            <td class="cell-entry"><input data-id="${item.id}" data-field="name" placeholder="Bezeichnung" title="Eingabefeld Artikel" value="${escapeAttr(item.name)}" /></td>
            <td class="num demand-col cell-entry"><input data-id="${item.id}" data-field="day" inputmode="decimal" placeholder="Tag" title="Bedarf pro Tag" value="${formatInput(item.day)}" /></td>
            <td class="num demand-col cell-entry"><input data-id="${item.id}" data-field="week" inputmode="decimal" placeholder="Woche" title="Bedarf pro Woche" value="${formatInput(item.week)}" /></td>
            <td class="num demand-col cell-entry"><input data-id="${item.id}" data-field="month" inputmode="decimal" placeholder="Monat" title="Bedarf pro Monat" value="${formatInput(item.month)}" /></td>
            <td class="num demand-col cell-entry"><input data-id="${item.id}" data-field="year" inputmode="decimal" placeholder="Jahr" title="Bedarf pro Jahr" value="${formatInput(item.year)}" /></td>
            <td class="num cell-entry"><input data-id="${item.id}" data-field="lt" inputmode="decimal" placeholder="WBZ" title="Wiederbeschaffungszeit" value="${formatQty(item.lt, 1)}" /></td>
            <td class="num" data-result="mu">${row ? formatQty(row.mu) : "–"}</td>
            <td class="num" data-result="ss">${row ? formatQty(row.ssUnits, 0) : "–"}</td>
            <td class="num" data-result="rop">${row ? `${pointLabel} ${formatQty(row.reorder, 0)}` : "–"}</td>
            <td><button class="icon-btn" data-remove="${item.id}" type="button" title="Löschen">×</button></td>
          </tr>
        `;
      })
      .join("");
  }

  function renderXyzChart(summary, target = els.xyzChart, options = {}) {
    const width = options.width || Math.max(target.clientWidth || 420, 360);
    const height = options.height || 300;
    const cx = options.cx || 108;
    const cy = options.cy || Math.round(height / 2);
    const r = options.r || 78;
    const colors = { X: "#0f766e", Y: "#b45309", Z: "#9f1239" };
    const slices = ["X", "Y", "Z"]
      .map((key) => ({ key, color: colors[key], ...summary[key] }))
      .filter((slice) => slice.count > 0);
    let angle = 0;
    const donut = slices
      .map((slice) => {
        const sweep = (slice.countShare / 100) * 360;
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
    const hole = svgEl("circle", { cx, cy, r: 42, fill: options.holeFill || "#ffffff" });
    const center =
      svgEl("text", { x: cx, y: cy - 2, "text-anchor": "middle", "font-size": "13", fill: "#1e3a5f", "font-weight": "650" }, "Artikel") +
      svgEl("text", { x: cx, y: cy + 16, "text-anchor": "middle", "font-size": "11", fill: "#57534e" }, String(summary.totalCount));
    const maxShare = Math.max(...["X", "Y", "Z"].map((k) => Math.max(summary[k].countShare, summary[k].ssShare)), 1);
    const barX = options.barX || 230;
    const barW = Math.min(options.barWidth || 220, Math.max(80, width - barX - 52));
    const barStartY = options.barStartY || 48;
    const barGap = options.barGap || 78;
    const bars = ["X", "Y", "Z"]
      .map((key, index) => {
        const stat = summary[key];
        const y = barStartY + index * barGap;
        const countW = (stat.countShare / maxShare) * barW;
        const ssW = (stat.ssShare / maxShare) * barW;
        return `
          ${svgEl("text", { x: barX, y, fill: colors[key], "font-size": "13", "font-weight": "650" }, `Klasse ${key}`)}
          ${svgEl("text", { x: barX, y: y + 14, fill: "#57534e", "font-size": "10" }, `${stat.count} Art. · SS ${formatQty(stat.ss, 0)}`)}
          ${svgEl("rect", { x: barX, y: y + 22, width: Math.max(countW, 0).toFixed(1), height: 10, fill: colors[key] })}
          ${svgEl("rect", { x: barX, y: y + 36, width: Math.max(ssW, 0).toFixed(1), height: 10, fill: "#1e3a5f" })}
        `;
      })
      .join("");
    target.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="XYZ-Verteilung">
        ${donut}${hole}${center}${bars}
      </svg>
      <div class="legend">
        <span><i style="background:#0f766e"></i>X regelmäßig</span>
        <span><i style="background:#b45309"></i>Y schwankend</span>
        <span><i style="background:#9f1239"></i>Z unregelmäßig</span>
        <span><i style="background:#1e3a5f"></i>Anteil Sicherheitsbestand</span>
      </div>
    `;
  }

  function articleLabel(row) {
    return String(row.sku || row.name || "–").slice(0, 12);
  }

  function renderResultChart(rows, target = els.resultChart, options = {}) {
    if (!target) return;
    const width = options.width || Math.max(target.clientWidth || 720, 520);
    const height = options.height || 360;
    const m = options.margin || { top: 18, right: 16, bottom: 64, left: 52 };
    if (!rows.length) {
      target.innerHTML = `<p class="empty">Keine Artikel für das Diagramm.</p>`;
      return;
    }
    const innerW = width - m.left - m.right;
    const innerH = height - m.top - m.bottom;
    const maxY = Math.max(...rows.map((row) => Math.max(row.mu, row.ssUnits, row.reorder, 0)), 1);
    const groupW = innerW / rows.length;
    const barW = Math.min(16, Math.max(4, groupW / 4.2));
    const gap = barW * 0.15;
    const y = (v) => m.top + innerH - (Math.max(0, v) / maxY) * innerH;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const v = maxY * t;
      return svgEl("line", { x1: m.left, x2: width - m.right, y1: y(v), y2: y(v), stroke: "#eeebe4" }) +
        svgEl("text", { x: m.left - 6, y: y(v) + 3, "text-anchor": "end", fill: "#57534e", "font-size": "10" }, formatQty(v, 0));
    }).join("");
    const groups = rows.map((row, index) => {
      const cx = m.left + index * groupW + groupW / 2;
      const xMu = cx - barW - gap - barW / 2;
      const xSs = cx - barW / 2;
      const xRop = cx + gap + barW / 2;
      const selected = row.id === selectedId;
      const label = articleLabel(row);
      const labelAttrs = {
        x: cx,
        y: height - (rows.length > 8 ? 8 : 18),
        "text-anchor": rows.length > 8 ? "end" : "middle",
        fill: selected ? "#1e3a5f" : "#57534e",
        "font-size": "10",
        "font-weight": selected ? "650" : "400",
      };
      if (rows.length > 8) labelAttrs.transform = `rotate(-40 ${cx} ${height - 8})`;
      const labelNode = svgEl("text", labelAttrs, escapeAttr(label));
      const h = (v) => Math.max(0, m.top + innerH - y(v));
      return `
        ${svgEl("rect", {
          x: xMu.toFixed(1), y: y(row.mu).toFixed(1), width: barW.toFixed(1), height: h(row.mu).toFixed(1),
          fill: XYZ_COLORS[row.xyz] || "#1e3a5f",
          "data-index": index, "data-series": "mu",
        })}
        ${svgEl("rect", {
          x: xSs.toFixed(1), y: y(row.ssUnits).toFixed(1), width: barW.toFixed(1), height: h(row.ssUnits).toFixed(1),
          fill: "#c4a35a",
          "data-index": index, "data-series": "ss",
        })}
        ${svgEl("rect", {
          x: xRop.toFixed(1), y: y(row.reorder).toFixed(1), width: barW.toFixed(1), height: h(row.reorder).toFixed(1),
          fill: "#1e3a5f", opacity: "0.85",
          "data-index": index, "data-series": "rop",
        })}
        ${labelNode}
      `;
    }).join("");
    const unit = els.periodUnit.value;
    const point = currentParams().policy === "periodic" ? "Bestellgrenze S" : "Meldebestand s";
    target.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bedarf und Sicherheitsbestand je Artikel">
        ${ticks}
        ${svgEl("text", { x: 14, y: 12, fill: "#57534e", "font-size": "11" }, `Stück / ${unit}`)}
        ${groups}
      </svg>
      <div class="legend">
        <span><i style="background:#0f766e"></i>Bedarf μ (X)</span>
        <span><i style="background:#b45309"></i>Bedarf μ (Y)</span>
        <span><i style="background:#9f1239"></i>Bedarf μ (Z)</span>
        <span><i style="background:#c4a35a"></i>Sicherheitsbestand</span>
        <span><i style="background:#1e3a5f"></i>${point}</span>
      </div>
    `;
    if (options.interactive === false) return;
    target.querySelectorAll("[data-index]").forEach((node) => {
      node.addEventListener("mousemove", (event) => {
        const row = rows[Number(node.getAttribute("data-index"))];
        const series = node.getAttribute("data-series");
        const value = series === "ss" ? row.ssUnits : series === "rop" ? row.reorder : row.mu;
        const label = series === "ss" ? "Sicherheitsbestand" : series === "rop" ? point : "Bedarf μ";
        showTooltip(
          `<strong>${escapeAttr(row.sku ? `${row.sku} · ${row.name}` : row.name)}</strong><br>${label}: ${formatQty(value)} / ${unit}<br>Klasse ${row.xyz} · CV ${Number.isFinite(row.cv) ? formatCV(row.cv) : "–"}`,
          event
        );
      });
      node.addEventListener("mouseleave", hideTooltip);
      node.addEventListener("click", () => {
        selectedId = rows[Number(node.getAttribute("data-index"))].id;
        render();
      });
    });
  }

  function renderHorizonChart(row, target = els.horizonChart, options = {}) {
    if (!target) return;
    if (!row) {
      target.innerHTML = `<p class="empty">Artikel in der Tabelle wählen.</p>`;
      return;
    }
    const width = options.width || Math.max(target.clientWidth || 420, 320);
    const height = options.height || 300;
    const m = options.margin || { top: 18, right: 16, bottom: 40, left: 48 };
    const unit = els.periodUnit.value;
    const series = UNITS.map((from) => {
      const raw = row[RATE_FIELDS[from]];
      const converted = raw == null ? null : convertDemand(raw, from, unit);
      return { from, raw, converted };
    });
    const values = series.map((s) => s.converted).filter((v) => v != null && v >= 0);
    const maxY = Math.max(...values, row.mu || 0, 1);
    const innerW = width - m.left - m.right;
    const innerH = height - m.top - m.bottom;
    const barW = Math.min(48, innerW / series.length - 16);
    const y = (v) => m.top + innerH - (Math.max(0, v) / maxY) * innerH;
    const ticks = [0, 0.5, 1].map((t) => {
      const v = maxY * t;
      return svgEl("line", { x1: m.left, x2: width - m.right, y1: y(v), y2: y(v), stroke: "#eeebe4" }) +
        svgEl("text", { x: m.left - 6, y: y(v) + 3, "text-anchor": "end", fill: "#57534e", "font-size": "10" }, formatQty(v, 0));
    }).join("");
    const colors = { Tag: "#1e3a5f", Woche: "#0f766e", Monat: "#c4a35a", Jahr: "#b45309" };
    const bars = series.map((s, index) => {
      const cx = m.left + (index + 0.5) * (innerW / series.length);
      const x = cx - barW / 2;
      const val = s.converted == null ? 0 : s.converted;
      const h = Math.max(0, m.top + innerH - y(val));
      const empty = s.converted == null;
      return `
        ${svgEl("rect", {
          x: x.toFixed(1),
          y: y(val).toFixed(1),
          width: barW.toFixed(1),
          height: empty ? "0" : h.toFixed(1),
          fill: colors[s.from],
          opacity: empty ? "0.2" : "1",
          "data-horizon": s.from,
        })}
        ${svgEl("text", { x: cx, y: height - 14, "text-anchor": "middle", fill: "#57534e", "font-size": "11" }, s.from)}
        ${svgEl("text", { x: cx, y: y(val) - 6, "text-anchor": "middle", fill: "#1c1917", "font-size": "10" }, empty ? "–" : formatQty(val))}
      `;
    }).join("");
    const meanLine = svgEl("line", {
      x1: m.left, x2: width - m.right, y1: y(row.mu), y2: y(row.mu),
      stroke: "#9f1239", "stroke-dasharray": "4 3", "stroke-width": "1.4",
    });
    target.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bedarf nach Zeithorizont">
        ${ticks}${meanLine}${bars}
        ${svgEl("text", { x: 14, y: 12, fill: "#57534e", "font-size": "11" }, `Stück / ${unit}`)}
      </svg>
      <div class="legend">
        <span><i style="background:#9f1239"></i>Mittelwert μ ${formatQty(row.mu)}</span>
        <span>Eingetragen: ${series.filter((s) => s.raw != null).map((s) => `${s.from} ${formatQty(s.raw)}`).join(" · ") || "keine Werte"}</span>
      </div>
    `;
  }

  function renderLineChart(values, target, options) {
    const width = options.width || Math.max(target.clientWidth || 360, 280);
    const height = options.height || 190;
    const m = options.margin || { top: 16, right: 12, bottom: 28, left: 36 };
    const innerW = width - m.left - m.right;
    const innerH = height - m.top - m.bottom;
    if (!values.length) {
      target.innerHTML = `<p class="empty">Keine Periodenwerte.</p>`;
      return;
    }
    const maxY = Math.max(...values, options.mean || 0, 1);
    const x = (i) => m.left + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
    const y = (v) => m.top + innerH - (v / maxY) * innerH;
    const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const meanLine = options.mean != null
      ? svgEl("line", {
          x1: m.left, x2: width - m.right, y1: y(options.mean), y2: y(options.mean),
          stroke: "#0f766e", "stroke-dasharray": "4 3", "stroke-width": "1.2",
        })
      : "";
    const ticks = [0, 0.5, 1].map((t) => {
      const v = maxY * t;
      const yy = y(v);
      return svgEl("line", { x1: m.left, x2: width - m.right, y1: yy, y2: yy, stroke: "#eeebe4" }) +
        svgEl("text", { x: m.left - 6, y: yy + 3, "text-anchor": "end", fill: "#57534e", "font-size": "10" }, formatQty(v, 0));
    }).join("");
    const xLabels = values.map((_, i) => {
      if (values.length > 16 && i % Math.ceil(values.length / 8) !== 0 && i !== values.length - 1) return "";
      return svgEl("text", { x: x(i), y: height - 8, "text-anchor": "middle", fill: "#57534e", "font-size": "10" }, String(i + 1));
    }).join("");
    target.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${options.title || "Verlauf"}">
        ${ticks}
        ${meanLine}
        ${svgEl("polyline", { points: pts, fill: "none", stroke: "#1e3a5f", "stroke-width": "2" })}
        ${values.map((v, i) => svgEl("circle", { cx: x(i), cy: y(v), r: 3, fill: "#c4a35a" })).join("")}
        ${xLabels}
      </svg>
    `;
  }

  function histogram(values, bins) {
    if (!values.length) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(max - min, 1e-6);
    const width = span / bins;
    const counts = Array.from({ length: bins }, (_, i) => ({
      x0: min + i * width,
      x1: min + (i + 1) * width,
      count: 0,
    }));
    for (const v of values) {
      let i = Math.floor((v - min) / width);
      if (i >= bins) i = bins - 1;
      if (i < 0) i = 0;
      counts[i].count += 1;
    }
    return counts;
  }

  function renderHistogram(row, target, options = {}) {
    const width = options.width || Math.max(target.clientWidth || 360, 280);
    const height = options.height || 190;
    const m = { top: 12, right: 10, bottom: 28, left: 36 };
    const sim = row.sim || simulateLeadDemand(row.demand, row.T, row.distKey, row.mu, row.sigma, row.id);
    const bins = histogram(sim, 18);
    const innerW = width - m.left - m.right;
    const innerH = height - m.top - m.bottom;
    const maxC = Math.max(...bins.map((b) => b.count), 1);
    const minX = bins[0]?.x0 ?? 0;
    const maxX = bins[bins.length - 1]?.x1 ?? 1;
    const x = (v) => m.left + ((v - minX) / Math.max(maxX - minX, 1e-6)) * innerW;
    const barW = Math.max(1, (innerW / bins.length) - 1);
    const bars = bins.map((b) => {
      const h = (b.count / maxC) * innerH;
      return svgEl("rect", {
        x: x(b.x0) + 0.5,
        y: m.top + innerH - h,
        width: barW.toFixed(1),
        height: h.toFixed(1),
        fill: "#1e3a5f",
        opacity: "0.72",
      });
    }).join("");
    const ropX = x(row.reorder);
    const muX = x(row.muL);
    const p95 = percentile(sim, 0.95);
    target.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bedarf in der Wiederbeschaffungszeit">
        ${bars}
        ${svgEl("line", { x1: muX, x2: muX, y1: m.top, y2: m.top + innerH, stroke: "#0f766e", "stroke-dasharray": "4 3" })}
        ${svgEl("line", { x1: ropX, x2: ropX, y1: m.top, y2: m.top + innerH, stroke: "#b45309", "stroke-width": "1.6" })}
        ${svgEl("text", { x: m.left, y: height - 8, fill: "#57534e", "font-size": "10" }, formatQty(minX, 0))}
        ${svgEl("text", { x: width - m.right, y: height - 8, "text-anchor": "end", fill: "#57534e", "font-size": "10" }, formatQty(maxX, 0))}
      </svg>
      <div class="legend">
        <span><i style="background:#1e3a5f"></i>Monte-Carlo (${MC_N.toLocaleString("de-DE")})</span>
        <span><i style="background:#0f766e"></i>Erwartungswert ${formatQty(row.muL, 1)}</span>
        <span><i style="background:#b45309"></i>${row.policy === "periodic" ? "S" : "s"} ${formatQty(row.reorder, 0)}</span>
        <span>P95 ${formatQty(p95, 1)}</span>
      </div>
    `;
  }

  function safetyStockAt(row, sl, sim) {
    if (row.distKey === "poisson") {
      return Math.max(0, poissonInv(sl, row.muL) - row.muL);
    }
    if (row.distKey === "empirical") {
      const series = sim || row.sim || simulateLeadDemand(row.demand, row.T, row.distKey, row.mu, row.sigma, row.id);
      return Math.max(0, percentile(series, sl) - row.muL);
    }
    return Math.max(0, normsInv(sl) * row.sigmaL);
  }

  function renderSlChart(row, target = els.slChart, options = {}) {
    if (!row || row.n < 2) {
      target.innerHTML = `<p class="empty">Artikel mit mindestens zwei Perioden wählen.</p>`;
      return;
    }
    const width = options.width || Math.max(target.clientWidth || 420, 360);
    const height = options.height || 300;
    const m = options.margin || { top: 18, right: 16, bottom: 36, left: 44 };
    const innerW = width - m.left - m.right;
    const innerH = height - m.top - m.bottom;
    const sls = [];
    for (let p = 80; p <= 99.5; p += 0.5) sls.push(p / 100);
    const sim = row.distKey === "empirical"
      ? (row.sim || simulateLeadDemand(row.demand, row.T, row.distKey, row.mu, row.sigma, row.id))
      : null;
    const ys = sls.map((sl) => safetyStockAt(row, sl, sim));
    const maxY = Math.max(...ys, 1);
    const x = (sl) => m.left + ((sl - 0.8) / 0.195) * innerW;
    const y = (v) => m.top + innerH - (v / maxY) * innerH;
    const d = sls.map((sl, i) => `${i ? "L" : "M"} ${x(sl).toFixed(1)} ${y(ys[i]).toFixed(1)}`).join(" ");
    const current = Number(els.serviceLevel.value) / 100;
    const currentSs = safetyStockAt(row, current, sim);
    const yTicks = [0, 0.5, 1].map((t) => {
      const v = maxY * t;
      return svgEl("line", { x1: m.left, x2: width - m.right, y1: y(v), y2: y(v), stroke: "#eeebe4" }) +
        svgEl("text", { x: m.left - 6, y: y(v) + 3, "text-anchor": "end", fill: "#57534e", "font-size": "10" }, formatQty(v, 0));
    }).join("");
    const xTicks = [0.8, 0.9, 0.95, 0.99].map((sl) =>
      svgEl("text", { x: x(sl), y: height - 10, "text-anchor": "middle", fill: "#57534e", "font-size": "10" }, `${Math.round(sl * 100)} %`)
    ).join("");
    target.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Sicherheitsbestand nach Servicegrad">
        ${yTicks}
        ${svgEl("path", { d, fill: "none", stroke: "#1e3a5f", "stroke-width": "2" })}
        ${svgEl("line", { x1: x(current), x2: x(current), y1: m.top, y2: m.top + innerH, stroke: "#c4a35a", "stroke-dasharray": "3 3" })}
        ${svgEl("circle", { cx: x(current), cy: y(currentSs), r: 4.5, fill: "#c4a35a" })}
        ${svgEl("text", { x: m.left, y: 12, fill: "#57534e", "font-size": "11" }, "SS (Stück)")}
        ${xTicks}
      </svg>
    `;
  }

  function renderDetail(row) {
    if (!row) {
      els.detail.innerHTML = `<p class="empty">Artikel in der Tabelle wählen.</p>`;
      return;
    }
    const unit = els.periodUnit.value;
    const pointName = row.policy === "periodic" ? "Bestellgrenze S" : "Meldebestand s";
    const recNote = settings.distMode === "auto"
      ? `Empfohlen: ${row.recLabel}.`
      : `Vorgabe: ${row.distLabel} (automatisch wäre ${row.recLabel}).`;
    const title = row.sku ? `${escapeAttr(row.sku)} · ${escapeAttr(row.name) || "Ohne Bezeichnung"}` : (escapeAttr(row.name) || "Ohne Bezeichnung");
    els.detail.innerHTML = `
      <div class="detail-head">
        <div>
          <p class="eyebrow">Artikeldetail</p>
          <h2>${title}</h2>
          <p class="detail-meta">
            <span class="badge ${row.xyz}">${row.xyz}</span>
            <span>${row.distLabel}</span>
            <span>WBZ ${formatQty(row.lt, 1)} ${unit}</span>
            <span>${row.n} Horizonte</span>
            <span>z = ${formatQty(row.z, 2)}</span>
          </p>
        </div>
      </div>
      <div class="detail-stats">
        <div class="stat"><p class="label">Mittelwert μ</p><p class="value">${formatQty(row.mu)}</p></div>
        <div class="stat"><p class="label">Std.abw. σ</p><p class="value">${formatQty(row.sigma)}</p></div>
        <div class="stat"><p class="label">CV</p><p class="value">${Number.isFinite(row.cv) ? formatCV(row.cv) : "–"}</p></div>
        <div class="stat"><p class="label">Sicherheitsbestand</p><p class="value">${formatQty(row.ssUnits, 0)}</p></div>
        <div class="stat"><p class="label">${pointName}</p><p class="value">${formatQty(row.reorder, 0)}</p></div>
        <div class="stat"><p class="label">SS-Wert</p><p class="value">${formatEUR(row.ssValue)}</p></div>
      </div>
      <p class="policy-note">
        ${recNote}
        Horizont T = ${formatQty(row.T, 1)} ${unit}.
        E[Bedarf] = ${formatQty(row.muL, 1)}, σ_T = ${formatQty(row.sigmaL, 1)}.
      </p>
      <label class="field-label">Stückpreis (€)
        <input id="price-input" data-id="${row.id}" data-field="price" value="${formatQty(row.price)}" />
      </label>
    `;
    const priceInput = document.getElementById("price-input");
    priceInput.addEventListener("change", () => {
      const item = items.find((entry) => entry.id === row.id);
      if (!item) return;
      item.price = parseNumber(priceInput.value);
      render();
    });
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
      if (ch === '"') quoted = !quoted;
      else if (ch === delimiter && !quoted) {
        cells.push(current.trim());
        current = "";
      } else current += ch;
    }
    cells.push(current.trim());
    return cells;
  }

  function looksNumeric(cell) {
    const raw = String(cell ?? "").trim();
    if (!raw) return false;
    return /^-?\d/.test(raw.replace(/\s/g, ""));
  }

  function parseTable(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim());
    if (!lines.length) return [];
    const delimiter = detectDelimiter(text);
    const rows = lines.map((line) => splitLine(line, delimiter));
    const header = rows[0].map((cell) => cell.toLowerCase());
    const looksLikeHeader = header.some((cell) =>
      /artikel|name|bezeichnung|artikelnr|sku|wbz|lead|preis|tag|woche|monat|jahr|bedarf/.test(cell)
    );
    const dataRows = looksLikeHeader ? rows.slice(1) : rows;
    const idx = (pattern, fallback) => {
      if (!looksLikeHeader) return fallback;
      const found = header.findIndex((h) => pattern.test(h));
      return found;
    };
    const skuIdx = idx(/artikelnr|artikelnummer|^nr$|sku|nummer/, 0);
    const nameIdx = idx(/^(artikel|name|bezeichnung)$|artikel(?!n|nr)/, 1);
    const dayIdx = idx(/tag|tagesbedarf/, 2);
    const weekIdx = idx(/woche|wochenbedarf/, 3);
    const monthIdx = idx(/monat|monatsbedarf/, 4);
    const yearIdx = idx(/jahr|jahresbedarf/, 5);
    const ltIdx = idx(/wbz|lead|wiederbeschaff/, 6);
    const priceIdx = idx(/preis|price|€|eur/, 7);
    const cell = (cells, i) => (i >= 0 ? cells[i] : "");
    return dataRows
      .map((cells) => normalizeItem({
        sku: String(cell(cells, skuIdx) || "").replace(/^"|"$/g, ""),
        name: String(cell(cells, nameIdx) || "").replace(/^"|"$/g, ""),
        day: parseOptionalNumber(cell(cells, dayIdx)),
        week: parseOptionalNumber(cell(cells, weekIdx)),
        month: parseOptionalNumber(cell(cells, monthIdx)),
        year: parseOptionalNumber(cell(cells, yearIdx)),
        lt: parseNumber(cell(cells, ltIdx) || 1) || 1,
        price: parseNumber(cell(cells, priceIdx) || 0),
      }))
      .filter((item) => item.name || item.sku || rateEntries(item).length);
  }

  function csvNum(value) {
    if (value == null || !Number.isFinite(value)) return "";
    return String(value).replace(".", ",");
  }

  function exportCsv(rows) {
    const header = ["XYZ", "Artikelnr", "Artikel", "Tag", "Woche", "Monat", "Jahr", "WBZ", "Mittelwert", "StdAbw", "CV", "Verteilung", "Sicherheitsbestand", "Melde_oder_Bestellgrenze", "SS_Wert_EUR"];
    const lines = [
      header.join(";"),
      ...rows.map((row) =>
        [
          row.xyz,
          `"${String(row.sku || "").replace(/"/g, '""')}"`,
          `"${row.name.replace(/"/g, '""')}"`,
          csvNum(row.day),
          csvNum(row.week),
          csvNum(row.month),
          csvNum(row.year),
          csvNum(row.lt),
          csvNum(Number(row.mu.toFixed(4))),
          csvNum(Number(row.sigma.toFixed(4))),
          Number.isFinite(row.cv) ? csvNum(Number(row.cv.toFixed(4))) : "",
          row.distLabel,
          row.ssUnits,
          row.reorder,
          csvNum(Number(row.ssValue.toFixed(2))),
        ].join(";")
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "stochastische-bedarfsanalyse.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function dateStamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function formatDateLong() {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short" }).format(new Date());
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
            <p class="eyebrow">Bestandsplanung unter Unsicherheit</p>
            <h1>Stochastische Bedarfsanalyse</h1>
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
    if (!chunk.length) return `<p class="pdf-note">Keine Artikel vorhanden.</p>`;
    const point = currentParams().policy === "periodic" ? "S" : "s";
    const body = chunk.map((row) => `
      <tr>
        <td><span class="badge ${row.xyz}">${row.xyz}</span></td>
        <td>${escapeAttr(row.sku)}</td>
        <td>${escapeAttr(row.name)}</td>
        <td class="num">${formatInput(row.day) || "–"}</td>
        <td class="num">${formatInput(row.week) || "–"}</td>
        <td class="num">${formatInput(row.month) || "–"}</td>
        <td class="num">${formatInput(row.year) || "–"}</td>
        <td class="num">${formatQty(row.lt, 1)}</td>
        <td class="num">${formatQty(row.mu)}</td>
        <td class="num">${formatQty(row.ssUnits, 0)}</td>
        <td class="num">${point} ${formatQty(row.reorder, 0)}</td>
      </tr>
    `).join("");
    return `
      <table class="pdf-table">
        <thead>
          <tr>
            <th>XYZ</th><th>Nr</th><th>Artikel</th>
            <th class="num">Tag</th><th class="num">Woche</th><th class="num">Monat</th><th class="num">Jahr</th>
            <th class="num">WBZ</th><th class="num">μ</th><th class="num">SS</th><th class="num">${point}</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `;
  }

  function buildReport() {
    const params = currentParams();
    const rows = analyzeAll();
    const summary = summarize(rows);
    const tableChunks = chunkRows(rows, 20);
    const totalPages = 1 + tableChunks.length;
    const page1 = pageChrome(
      "Übersicht und Grafiken",
      `
        <div class="pdf-meta">
          <span>Servicegrad ${formatQty(Number(els.serviceLevel.value), 1)} %</span>
          <span>${params.policy === "periodic" ? `Periodisch, R = ${params.review}` : "Kontinuierlich (s, Q)"}</span>
          <span>Periode: ${params.periodUnit}</span>
          <span>${summary.totalCount} Artikel</span>
        </div>
        <div class="pdf-kpis" id="pdf-kpis"></div>
        <p class="pdf-note">
          XYZ nach CV (X &lt; ${formatCV(params.xLimit)}, Y &lt; ${formatCV(params.yLimit)}, sonst Z).
          Sicherheitsbestand aus z(α)·σ·√T bzw. Poisson-/Perzentilmethode.
          Summe SS ${formatQty(summary.totalSs, 0)} Stück (${formatEUR(summary.totalValue)}).
        </p>
        <figure class="pdf-chart">
          <figcaption><strong>XYZ-Verteilung</strong><span>Artikelanteil und Anteil am Sicherheitsbestand</span></figcaption>
          <div id="pdf-xyz" class="chart-host"></div>
        </figure>
        <figure class="pdf-chart">
          <figcaption><strong>Bedarf und Sicherheitsbestand</strong><span>μ, SS und ${params.policy === "periodic" ? "S" : "s"} je Artikel in ${params.periodUnit}</span></figcaption>
          <div id="pdf-result" class="chart-host"></div>
        </figure>
      `,
      1,
      totalPages
    );
    const tablePages = tableChunks
      .map((chunk, index) =>
        pageChrome(
          index === 0 ? "Artikelkennzahlen" : `Artikelkennzahlen (Fortsetzung ${index + 1})`,
          reportTable(chunk),
          index + 2,
          totalPages
        )
      )
      .join("");
    els.stage.innerHTML = page1 + tablePages;
    const kpiHost = document.getElementById("pdf-kpis");
    if (kpiHost) kpiHost.innerHTML = els.kpis.innerHTML;
    renderXyzChart(summary, document.getElementById("pdf-xyz"), {
      width: 690, height: 180, cx: 120, cy: 92, r: 64, barX: 250, barWidth: 380, barStartY: 24, barGap: 50,
    });
    renderResultChart(rows, document.getElementById("pdf-result"), {
      width: 690, height: 220, margin: { top: 16, right: 12, bottom: 52, left: 44 }, interactive: false,
    });
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
    document.title = `Stochastische-Bedarfsanalyse_${dateStamp()}`;
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

  function updateTableResults(rows) {
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    const pointLabel = settings.policy === "periodic" ? "S" : "s";
    els.body.querySelectorAll("tr[data-select]").forEach((tr) => {
      const row = byId[tr.dataset.select];
      tr.classList.toggle("is-selected", tr.dataset.select === selectedId);
      if (!row) return;
      const xyz = tr.querySelector("[data-result='xyz']");
      const mu = tr.querySelector("[data-result='mu']");
      const ss = tr.querySelector("[data-result='ss']");
      const rop = tr.querySelector("[data-result='rop']");
      if (xyz) xyz.innerHTML = `<span class="badge ${row.xyz}">${row.xyz}</span>`;
      if (mu) mu.textContent = formatQty(row.mu);
      if (ss) ss.textContent = formatQty(row.ssUnits, 0);
      if (rop) rop.textContent = `${pointLabel} ${formatQty(row.reorder, 0)}`;
    });
  }

  function applyField(item, field, value) {
    if (field === "name") item.name = value;
    if (field === "sku") item.sku = value;
    if (field === "lt") item.lt = Math.max(0, parseNumber(value));
    if (field === "day" || field === "week" || field === "month" || field === "year") {
      item[field] = parseOptionalNumber(value);
    }
  }

  function render(options = {}) {
    if (!items.length) selectedId = "";
    else if (!items.some((item) => item.id === selectedId)) selectedId = items[0].id;
    const rows = analyzeAll();
    const summary = summarize(rows);
    const selected = rows.find((row) => row.id === selectedId);
    renderKpis(summary);
    if (options.keepInputs && els.body.querySelector("tr[data-select]")) {
      updateTableResults(rows);
    } else {
      renderTable(rows);
    }
    renderDetail(selected);
    renderResultChart(rows);
    renderHorizonChart(selected);
    renderXyzChart(summary);
    saveItems();
  }

  items = loadItems();
  applySettingsToForm();
  selectedId = items[0]?.id || "";

  document.getElementById("btn-sample").addEventListener("click", () => {
    items = sampleItems();
    selectedId = items[0]?.id || "";
    render();
  });

  document.getElementById("btn-add").addEventListener("click", () => {
    const item = blankItem();
    items.push(item);
    selectedId = item.id;
    render();
    els.body.querySelector("tr.is-selected input[data-field='name']")?.focus();
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
    exportCsv(analyzeAll());
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
    const parsed = parseTable(await file.text());
    if (parsed.length) {
      items = parsed;
      selectedId = items[0]?.id || "";
    }
    event.target.value = "";
    render();
  });

  function applyPastedText(text) {
    const parsed = parseTable(text);
    if (parsed.length) {
      items = parsed;
      selectedId = items[0]?.id || "";
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
  els.paste.addEventListener("change", () => applyPastedText(els.paste.value));

  els.body.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-id]");
    if (!input) return;
    const item = items.find((entry) => entry.id === input.dataset.id);
    if (!item) return;
    applyField(item, input.dataset.field, input.value);
    if (input.dataset.field === "lt") input.value = formatQty(item.lt, 1);
    if (["day", "week", "month", "year"].includes(input.dataset.field)) {
      input.value = formatInput(item[input.dataset.field]);
    }
    selectedId = item.id;
    render({ keepInputs: true });
  });

  els.body.addEventListener("focusin", (event) => {
    const input = event.target.closest("input[data-id]");
    if (!input) return;
    if (selectedId === input.dataset.id) return;
    selectedId = input.dataset.id;
    render({ keepInputs: true });
  });

  els.body.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove]");
    if (remove) {
      items = items.filter((item) => item.id !== remove.dataset.remove);
      render();
      return;
    }
    const row = event.target.closest("tr[data-select]");
    if (!row || event.target.closest("input")) return;
    if (selectedId === row.dataset.select) return;
    selectedId = row.dataset.select;
    render({ keepInputs: true });
  });

  ["period-unit", "policy", "dist-mode"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => render({ keepInputs: true }));
  });
  ["service-level", "x-threshold", "y-threshold"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => render({ keepInputs: true }));
  });
  els.reviewInterval.addEventListener("change", () => render({ keepInputs: true }));

  window.addEventListener("resize", () => {
    if (els.overlay.classList.contains("is-open")) return;
    const rows = analyzeAll();
    const summary = summarize(rows);
    const selected = rows.find((row) => row.id === selectedId);
    renderXyzChart(summary);
    renderResultChart(rows);
    renderHorizonChart(selected);
  });

  render();
})();
