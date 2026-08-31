(function (global) {
  const DAYS = { tag: 1, woche: 7, monat: 30.437, jahr: 365.25 };

  function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function daysInPeriod(unit) {
    return DAYS[unit] || 1;
  }

  /** Abramowitz & Stegun inverse normal CDF */
  function invNorm(p) {
    const x = clamp(num(p, 0.95), 1e-9, 1 - 1e-9);
    const tail = x < 0.5 ? x : 1 - x;
    const t = Math.sqrt(-2 * Math.log(tail));
    const c0 = 2.515517;
    const c1 = 0.802853;
    const c2 = 0.010328;
    const d1 = 1.432788;
    const d2 = 0.189269;
    const d3 = 0.001308;
    const z = t - ((c2 * t + c1) * t + c0) / (((d3 * t + d2) * t + d1) * t + 1);
    return x < 0.5 ? -z : z;
  }

  function roundTo(value, step) {
    const s = num(step, 0);
    if (!(s > 0)) return Math.max(0, Math.round(value));
    return Math.max(s, Math.ceil(value / s - 1e-9) * s);
  }

  function compute(article) {
    const a = article || {};
    const period = a.period || "tag";
    const periodDays = daysInPeriod(period);
    const workingDays = Math.max(1, num(a.workingDays, 250));
    const demandPeriod = Math.max(0, num(a.demand, 0));
    const sigmaPeriod = Math.max(0, num(a.sigma, 0));
    const leadDays = Math.max(0, num(a.leadDays, 0));
    const serviceLevel = clamp(num(a.serviceLevel, 95) / 100, 0.5, 0.9995);
    const z = invNorm(serviceLevel);
    const stock = Math.max(0, num(a.stock, 0));
    const onOrder = Math.max(0, num(a.onOrder, 0));
    const orderCost = Math.max(0, num(a.orderCost, 0));
    const unitPrice = Math.max(0, num(a.unitPrice, 0));
    const holdRate = Math.max(0, num(a.holdRate, 0));
    const holdCostInput = Math.max(0, num(a.holdCost, 0));
    const packSize = Math.max(0, num(a.packSize, 0));
    const minQty = Math.max(0, num(a.minQty, 0));
    const extraDays = Math.max(0, num(a.extraDays, 0));
    const ssFixed = Math.max(0, num(a.ssFixed, 0));
    const ssMode = a.ssMode || "service";

    const dDay = demandPeriod / periodDays;
    const dYear = dDay * workingDays;
    const ddlt = dDay * leadDays;
    const sigmaLead = sigmaPeriod * Math.sqrt(leadDays / periodDays);

    let safety = 0;
    if (ssMode === "days") safety = dDay * extraDays;
    else if (ssMode === "fixed") safety = ssFixed;
    else safety = z * sigmaLead;

    const reorderPoint = ddlt + safety;
    const holdCostYear = holdCostInput > 0 ? holdCostInput : unitPrice * (holdRate / 100);
    let eoq = 0;
    if (dYear > 0 && orderCost > 0 && holdCostYear > 0) {
      eoq = Math.sqrt((2 * dYear * orderCost) / holdCostYear);
    }
    const rawQty = eoq > 0 ? eoq : Math.max(ddlt, packSize || minQty || demandPeriod);
    const orderQty = roundTo(Math.max(rawQty, minQty), packSize || 0);
    const inventoryPosition = stock + onOrder;
    const mustOrder = reorderPoint > 0 && inventoryPosition <= reorderPoint + 1e-9;
    const suggestedQty = mustOrder ? orderQty : 0;
    const daysToReorder = dDay > 0 ? (inventoryPosition - reorderPoint) / dDay : Infinity;
    const coverageDays = dDay > 0 ? inventoryPosition / dDay : Infinity;
    const avgStock = safety + orderQty / 2;
    const turnover = avgStock > 0 ? dYear / avgStock : 0;
    const cycleDays = dYear > 0 && orderQty > 0 ? (orderQty / dYear) * workingDays : 0;
    const fillAfterReceipt = safety + orderQty;
    const stockoutRisk = orderQty + 1e-9 < ddlt;
    const maxStock = fillAfterReceipt;
    const minStock = safety;

    let status = "ok";
    if (mustOrder && stock <= safety + 1e-9) status = "kritisch";
    else if (mustOrder) status = "bestellen";

    return {
      period,
      periodDays,
      workingDays,
      demandPeriod,
      dDay,
      dYear,
      leadDays,
      ddlt,
      sigmaPeriod,
      sigmaLead,
      serviceLevel,
      z,
      ssMode,
      safety,
      reorderPoint,
      eoq,
      orderQty,
      stock,
      onOrder,
      inventoryPosition,
      mustOrder,
      suggestedQty,
      daysToReorder,
      coverageDays,
      avgStock,
      turnover,
      cycleDays,
      fillAfterReceipt,
      stockoutRisk,
      maxStock,
      minStock,
      holdCostYear,
      orderCost,
      unitPrice,
      packSize,
      minQty,
      extraDays,
      status,
    };
  }

  function formatQty(value, digits) {
    if (!Number.isFinite(value)) return "–";
    const d = digits == null ? (Math.abs(value) >= 100 ? 0 : 1) : digits;
    return value.toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  }

  function formatDays(value) {
    if (!Number.isFinite(value)) return "–";
    if (value < 0) return "sofort";
    if (value > 1e6) return "–";
    return formatQty(value, value >= 10 ? 0 : 1) + " Tage";
  }

  function formatMoney(value) {
    if (!Number.isFinite(value)) return "–";
    return value.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  }

  function statusLabel(status) {
    if (status === "kritisch") return "Kritisch";
    if (status === "bestellen") return "Bestellen";
    return "Bestand ok";
  }

  const PERIOD_LABEL = { tag: "Tag", woche: "Woche", monat: "Monat", jahr: "Jahr" };

  global.BestellpunktCalc = {
    compute,
    invNorm,
    daysInPeriod,
    formatQty,
    formatDays,
    formatMoney,
    statusLabel,
    PERIOD_LABEL,
  };
})(window);
