(function (global) {
  const C = {
    bg: "#111827",
    grid: "rgba(45, 58, 79, 0.85)",
    axis: "#8b9cb3",
    fill: "rgba(59, 130, 246, 0.28)",
    line: "#60a5fa",
    rop: "#00e5ff",
    ss: "#39ff14",
    stock: "#fbbf24",
    danger: "#ef4444",
    muted: "#8b9cb3",
    text: "#e8edf4",
  };

  function niceMax(value) {
    if (!(value > 0)) return 10;
    const exp = Math.pow(10, Math.floor(Math.log10(value)));
    const n = value / exp;
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return nice * exp;
  }

  function draw(canvas, result, article) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 800;
    const cssH = canvas.clientHeight || 420;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, cssW, cssH);

    const pad = { l: 64, r: 28, t: 28, b: 48 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;
    if (w < 40 || h < 40) return;

    const r = result || {};
    const Q = Math.max(r.orderQty || 0, 1);
    const ss = Math.max(r.safety || 0, 0);
    const s = Math.max(r.reorderPoint || 0, 0);
    const dDay = Math.max(r.dDay || 0, 0.0001);
    const L = Math.max(r.leadDays || 0, 0);
    const cycle = Math.max(Q / dDay, L + 1, 1);
    const cycles = 2;
    const tMax = cycle * cycles + Math.max(L, cycle * 0.15);
    const yMax = niceMax(Math.max(ss + Q, s, r.inventoryPosition || 0, r.stock || 0, 1) * 1.12);

    const x = (t) => pad.l + (t / tMax) * w;
    const y = (v) => pad.t + h - (v / yMax) * h;

    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    const ticks = 5;
    ctx.font = "11px Segoe UI, system-ui, sans-serif";
    ctx.fillStyle = C.muted;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= ticks; i++) {
      const v = (yMax / ticks) * i;
      const yy = y(v);
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(pad.l + w, yy);
      ctx.stroke();
      ctx.fillText(global.BestellpunktCalc.formatQty(v, v >= 100 ? 0 : 1), pad.l - 8, yy);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const tTicks = 6;
    for (let i = 0; i <= tTicks; i++) {
      const t = (tMax / tTicks) * i;
      const xx = x(t);
      ctx.beginPath();
      ctx.moveTo(xx, pad.t);
      ctx.lineTo(xx, pad.t + h);
      ctx.stroke();
      ctx.fillText(global.BestellpunktCalc.formatQty(t, t >= 10 ? 0 : 1) + " d", xx, pad.t + h + 8);
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = C.axis;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + h);
    ctx.lineTo(pad.l + w, pad.t + h);
    ctx.stroke();

    function stockAt(t) {
      const phase = ((t % cycle) + cycle) % cycle;
      if (phase < L) {
        const atOrder = ss + Q - dDay * (cycle - L);
        return Math.max(0, atOrder - dDay * phase);
      }
      return Math.max(0, ss + Q - dDay * (phase - L));
    }

    const steps = Math.max(120, Math.floor(w));
    ctx.beginPath();
    ctx.moveTo(x(0), y(0));
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * tMax;
      ctx.lineTo(x(t), y(stockAt(t)));
    }
    ctx.lineTo(x(tMax), y(0));
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, pad.t, 0, pad.t + h);
    fill.addColorStop(0, "rgba(59, 130, 246, 0.42)");
    fill.addColorStop(1, "rgba(15, 20, 25, 0.05)");
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * tMax;
      const yy = y(stockAt(t));
      if (i === 0) ctx.moveTo(x(t), yy);
      else ctx.lineTo(x(t), yy);
    }
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2.4;
    ctx.shadowColor = "rgba(96, 165, 250, 0.55)";
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    function hLine(value, color, label, dash) {
      if (!(value >= 0)) return;
      const yy = y(value);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.setLineDash(dash || [7, 5]);
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(pad.l + w, yy);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = color;
      ctx.font = "700 11px Segoe UI, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(label, pad.l + 8, yy - 3);
    }

    hLine(s, C.rop, "Bestellpunkt s = " + global.BestellpunktCalc.formatQty(s), [8, 5]);
    hLine(ss, C.ss, "Sicherheitsbestand = " + global.BestellpunktCalc.formatQty(ss), [4, 4]);

    if (L > 0) {
      const tOrder = cycle - L;
      ctx.save();
      ctx.strokeStyle = C.rop;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(x(tOrder), y(s));
      ctx.lineTo(x(cycle), y(ss));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.rop;
      ctx.font = "11px Segoe UI, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("WBZ " + global.BestellpunktCalc.formatQty(L, 0) + " d", x(tOrder + L / 2), y(ss) + 6);
      ctx.restore();
    }

    const current = Math.max(0, r.inventoryPosition || 0);
    const tNow = dDay > 0 ? clampTimeOnCycle(current, ss, Q, dDay, L, cycle) : 0;
    const cx = x(tNow);
    const cy = y(current);
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = r.mustOrder ? C.danger : C.stock;
    ctx.shadowColor = r.mustOrder ? C.danger : C.stock;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = C.text;
    ctx.font = "12px Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    const name = (article && article.name) || "Artikel";
    ctx.fillText(name + " – Sägezahndiagramm (s, Q)", pad.l, pad.t - 8);

    ctx.fillStyle = C.muted;
    ctx.font = "11px Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Zeit", pad.l + w, pad.t + h + 30);
    ctx.save();
    ctx.translate(16, pad.t + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Bestand", 0, 0);
    ctx.restore();
  }

  function clampTimeOnCycle(stock, ss, Q, dDay, L, cycle) {
    const max = ss + Q;
    const min = Math.max(0, ss);
    const v = Math.min(max, Math.max(0, stock));
    const decline = Math.max(cycle - L, 0.0001);
    const fromMax = (max - v) / dDay;
    if (fromMax <= decline) return L + fromMax;
    const afterOrder = Math.max(0, max - dDay * decline);
    const fromAfter = (afterOrder - v) / dDay;
    return Math.max(0, Math.min(cycle, fromAfter));
  }

  global.BestellpunktChart = { draw };
})(window);
