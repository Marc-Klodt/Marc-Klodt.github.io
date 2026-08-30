(() => {
  const data = window.EUROJACKPOT_DATA;
  if (!data?.draws?.length) {
    document.body.insertAdjacentHTML("beforeend", "<p class='notice'>Ziehungsdaten fehlen.</p>");
    return;
  }

  let ALL = data.draws.map((d) => ({ ...d, main: [...d.main], euro: [...d.euro] }));
  const bundledLast = data.lastDraw;
  const LIVE_STORE = "eurojackpot-live-draws-v1";
  const WEATHER_STORE = "eurojackpot-helsinki-weather-v1";
  const live = { status: "updating", added: 0, nextDraw: null, error: null, source: "" };
  const wx = { status: "idle", byDate: {}, error: null, pending: null };
  const WX_SKY = [
    { id: "sun", label: "Sonnig", color: "#e8c547" },
    { id: "cloud", label: "Wolkig", color: "#8aa0d0" },
    { id: "rain", label: "Regen", color: "#6ea2ff" },
  ];
  const WX_TEMP = [
    { id: "frost", label: "Frost <0 °C", color: "#9bd7ff" },
    { id: "cold", label: "Kalt 0–8 °C", color: "#6ea2ff" },
    { id: "mild", label: "Mild 8–16 °C", color: "#6ee7b7" },
    { id: "warm", label: "Warm >16 °C", color: "#e8c547" },
  ];
  const WX_WIND = [
    { id: "calm", label: "Schwach <15 km/h", color: "#6ee7b7" },
    { id: "breeze", label: "Mäßig 15–30 km/h", color: "#e8c547" },
    { id: "windy", label: "Stark >30 km/h", color: "#c4a3ff" },
  ];
  const WD_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const MO_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const state = {
    period: "current",
    tab: "overview",
    main: [],
    euro: [],
    archiveQuery: "",
    archivePage: 1,
    forecast: null,
    forecastAsk: false,
    forecastVariant: 0,
    kiPack: null,
    kiRound: 0,
    kiTip: null,
    kiTipRound: 0,
    genView: null,
    askKind: null,
    analysis: null,
    analysisDraft: null,
    wxDim: "sky",
    wxNum: null,
    kiTipLoading: false,
  };

  const PRIZE = [
    { cls: 1, label: "5 + 2", main: 5, euro: 2 },
    { cls: 2, label: "5 + 1", main: 5, euro: 1 },
    { cls: 3, label: "5 + 0", main: 5, euro: 0 },
    { cls: 4, label: "4 + 2", main: 4, euro: 2 },
    { cls: 5, label: "4 + 1", main: 4, euro: 1 },
    { cls: 6, label: "3 + 2", main: 3, euro: 2 },
    { cls: 7, label: "4 + 0", main: 4, euro: 0 },
    { cls: 8, label: "2 + 2", main: 2, euro: 2 },
    { cls: 9, label: "3 + 1", main: 3, euro: 1 },
    { cls: 10, label: "3 + 0", main: 3, euro: 0 },
    { cls: 11, label: "1 + 2", main: 1, euro: 2 },
    { cls: 12, label: "2 + 1", main: 2, euro: 1 },
  ];

  function nCk(n, k) {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return Math.round(r);
  }

  const TOTAL_COMBOS = nCk(50, 5) * nCk(12, 2);

  function prizeOdds(mainHit, euroHit) {
    const ways = nCk(5, mainHit) * nCk(45, 5 - mainHit) * nCk(2, euroHit) * nCk(10, 2 - euroHit);
    return TOTAL_COMBOS / ways;
  }

  function fmt(n, digits = 0) {
    return n.toLocaleString("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: digits });
  }

  function fmtDate(iso) {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  }

  function weekday(iso) {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE", { weekday: "long" });
  }

  function todayNoon() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0);
  }

  function filtered() {
    const today = todayNoon();
    if (state.period === "all") return ALL;
    if (state.period === "current") return ALL.filter((d) => d.date >= "2022-03-25");
    const days = state.period === "y5" ? 365 * 5 : 365;
    const from = new Date(today);
    from.setDate(from.getDate() - days);
    const iso = toIso(from);
    return ALL.filter((d) => d.date >= iso);
  }

  function analyze(draws) {
    const n = draws.length;
    const mainCount = Array(51).fill(0);
    const euroCount = Array(13).fill(0);
    const lastMain = Array(51).fill(null);
    const lastEuro = Array(13).fill(null);
    let odd = 0;
    let low = 0;
    let sum = 0;
    const pairMap = new Map();

    draws.forEach((draw, idx) => {
      draw.main.forEach((num) => {
        mainCount[num] += 1;
        lastMain[num] = idx;
        if (num % 2 === 1) odd += 1;
        if (num <= 25) low += 1;
        sum += num;
      });
      draw.euro.forEach((num) => {
        euroCount[num] += 1;
        lastEuro[num] = idx;
      });
      for (let i = 0; i < 5; i++) {
        for (let j = i + 1; j < 5; j++) {
          const key = `${draw.main[i]}-${draw.main[j]}`;
          pairMap.set(key, (pairMap.get(key) || 0) + 1);
        }
      }
    });

    const expectedMain = n * (5 / 50);
    const expectedEuro = n * (2 / 12);
    let chi = 0;
    for (let i = 1; i <= 50; i++) {
      const diff = mainCount[i] - expectedMain;
      chi += (diff * diff) / expectedMain;
    }

    const mainStats = [];
    for (let i = 1; i <= 50; i++) {
      mainStats.push({
        n: i,
        count: mainCount[i],
        expected: expectedMain,
        overdue: lastMain[i] == null ? n : n - 1 - lastMain[i],
        last: lastMain[i] == null ? null : draws[lastMain[i]].date,
      });
    }
    const euroStats = [];
    for (let i = 1; i <= 12; i++) {
      euroStats.push({
        n: i,
        count: euroCount[i],
        expected: expectedEuro,
        overdue: lastEuro[i] == null ? n : n - 1 - lastEuro[i],
        last: lastEuro[i] == null ? null : draws[lastEuro[i]].date,
      });
    }

    const pairs = [...pairMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, count]) => ({ key, count }));

    return {
      n,
      first: draws[0]?.date,
      last: draws[n - 1],
      expectedMain,
      expectedEuro,
      chi,
      mainStats,
      euroStats,
      pairs,
      avgOdd: odd / n,
      avgLow: low / n,
      avgSum: sum / n,
    };
  }

  function heatColor(count, min, max) {
    const t = max === min ? 0.5 : (count - min) / (max - min);
    const h = 210 - t * 175;
    const s = 55 + t * 30;
    const l = 72 - t * 18;
    return `hsl(${h} ${s}% ${l}%)`;
  }

  function ballsHtml(nums, euro = false) {
    return nums.map((n) => `<span class="ball${euro ? " euro" : ""}">${n}</span>`).join("");
  }

  function lastTwoDraws() {
    return ALL.slice(-2).reverse();
  }

  function renderOverview(stats) {
    const hot = [...stats.mainStats].sort((a, b) => b.count - a.count).slice(0, 5);
    const cold = [...stats.mainStats].sort((a, b) => a.count - b.count).slice(0, 5);
    const overdue = [...stats.mainStats].sort((a, b) => b.overdue - a.overdue).slice(0, 5);
    const fair = stats.chi < 66.3;
    const nextIso = live.nextDraw || toIso(nextDrawDate(data.lastDraw));
    const recent = lastTwoDraws();

    const recentHtml = recent.length
      ? recent.map((d, i) => `
          <div class="recent-draw">
            <h3>${weekday(d.date)}, ${fmtDate(d.date)}</h3>
            <p class="muted">${i === 0 ? "Neueste Ziehung" : "Ziehung davor"}</p>
            <div class="last-draw">${ballsHtml(d.main)}<span class="plus">+</span>${ballsHtml(d.euro, true)}</div>
          </div>`).join("")
      : `<p class="muted">Noch keine Ziehungen im Archiv.</p>`;

    document.getElementById("tab-overview").innerHTML = `
      <div class="kpis">
        <article class="card"><p class="kpi-value">${fmt(stats.n)}</p><p class="kpi-label">Ziehungen im Zeitraum</p></article>
        <article class="card"><p class="kpi-value">${fmt(TOTAL_COMBOS)}</p><p class="kpi-label">Mögliche Tipps (5+2 aktuell)</p></article>
        <article class="card"><p class="kpi-value">1 : ${fmt(prizeOdds(5, 2))}</p><p class="kpi-label">Jackpot-Chance je Tipp</p></article>
        <article class="card"><p class="kpi-value">${fmt(stats.chi, 1)}</p><p class="kpi-label">Chi² Hauptzahlen (${fair ? "im Rahmen" : "auffällig"})</p></article>
      </div>
      <div class="grid-2">
        <article class="card">
          <h2>Die beiden letzten Ziehungen</h2>
          <div class="recent-draws">${recentHtml}</div>
          <p class="muted" style="margin-top:12px">Nächste Ziehung: ${weekday(nextIso)}, ${fmtDate(nextIso)}. Erste Ziehung im Filter: ${fmtDate(stats.first)}. Erwartet je Hauptzahl: ${fmt(stats.expectedMain, 1)} Treffer.</p>
        </article>
        <article class="card">
          <h2>Was die Historie wirklich sagt</h2>
          <div class="stat-row"><span>Ø ungerade Hauptzahlen</span><strong>${fmt(stats.avgOdd, 2)} / 5</strong></div>
          <div class="stat-row"><span>Ø Zahlen 1–25</span><strong>${fmt(stats.avgLow, 2)} / 5</strong></div>
          <div class="stat-row"><span>Ø Summe Hauptzahlen</span><strong>${fmt(stats.avgSum, 1)}</strong></div>
          <div class="stat-row"><span>Gleichverteilung?</span><strong class="${fair ? "ok" : ""}">${fair ? "Keine signifikante Abweichung" : "Abweichung prüfen"}</strong></div>
          <p class="muted" style="margin-top:10px">Chi²-Kritischwert (49 Freiheitsgrade, 5 %): 66,3. Werte darunter sind mit einer fairen Trommel vereinbar.</p>
        </article>
      </div>
      <div class="grid-2">
        <article class="card">
          <h2>Häufigste Hauptzahlen</h2>
          ${hot.map((s) => rowBar(s.n, s.count, stats.mainStats[0] ? Math.max(...stats.mainStats.map((x) => x.count)) : 1)).join("")}
        </article>
        <article class="card">
          <h2>Seltenste / überfällig</h2>
          <p class="muted">Kalt: ${cold.map((s) => s.n).join(", ")} · Überfällig: ${overdue.map((s) => `${s.n} (${s.overdue})`).join(", ")}</p>
          <h3 style="margin-top:14px">Häufigste Paare</h3>
          ${stats.pairs.map((p) => `<div class="stat-row"><span>${p.key.replace("-", " + ")}</span><strong>${p.count}×</strong></div>`).join("")}
        </article>
      </div>
    `;
  }

  function rowBar(n, count, max) {
    const pct = max ? (100 * count) / max : 0;
    return `<div class="stat-row"><span>${n}</span><div class="bar" style="flex:1"><span style="width:${pct}%"></span></div><strong>${count}</strong></div>`;
  }

  function renderFreq(stats) {
    const mainMax = Math.max(...stats.mainStats.map((s) => s.count));
    const mainMin = Math.min(...stats.mainStats.map((s) => s.count));
    const euroMax = Math.max(...stats.euroStats.map((s) => s.count));
    const euroMin = Math.min(...stats.euroStats.map((s) => s.count));
    const sorted = [...stats.mainStats].sort((a, b) => b.count - a.count);

    document.getElementById("tab-freq").innerHTML = `
      <article class="card">
        <h2>Hauptzahlen 1–50 · Treffer vs. Erwartung ${fmt(stats.expectedMain, 1)}</h2>
        <div class="heat">
          ${stats.mainStats.map((s) => `
            <div class="heat-cell" style="background:${heatColor(s.count, mainMin, mainMax)}" title="${s.count} Treffer, zuletzt ${s.last ? fmtDate(s.last) : "nie"}">
              ${s.n}<small>${s.count}</small>
            </div>`).join("")}
        </div>
      </article>
      <article class="card" style="margin-top:14px">
        <h2>Eurozahlen 1–12 · Treffer vs. Erwartung ${fmt(stats.expectedEuro, 1)}</h2>
        <p class="muted">Eurozahlen 9–12 existieren erst seit den Regeländerungen 2014 bzw. 2022. Für einen fairen Vergleich Zeitraum „Aktuelle Regeln“ wählen.</p>
        <div class="heat euro" style="margin-top:10px">
          ${stats.euroStats.map((s) => `
            <div class="heat-cell" style="background:${heatColor(s.count, euroMin, euroMax)}" title="${s.count} Treffer">
              ${s.n}<small>${s.count}</small>
            </div>`).join("")}
        </div>
      </article>
      <article class="card" style="margin-top:14px">
        <h2>Vollständige Frequenztabelle</h2>
        <div style="overflow:auto">
          <table>
            <thead><tr><th>Zahl</th><th>Treffer</th><th>Erwartet</th><th>Δ</th><th>Überfällig</th><th>Zuletzt</th></tr></thead>
            <tbody>
              ${sorted.map((s) => `<tr>
                <td>${s.n}</td><td>${s.count}</td><td>${fmt(s.expected, 1)}</td>
                <td>${s.count - s.expected >= 0 ? "+" : ""}${fmt(s.count - s.expected, 1)}</td>
                <td>${s.overdue} Ziehungen</td><td>${s.last ? fmtDate(s.last) : "–"}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </article>
      <article class="card wx-card" style="margin-top:14px">
        <div id="wx-root"></div>
      </article>
    `;
    ensureWeather();
    paintWx();
  }

  function wxDimBuckets() {
    if (state.wxDim === "temp") return WX_TEMP;
    if (state.wxDim === "wind") return WX_WIND;
    return WX_SKY;
  }

  function classifySky(w) {
    if (!w) return null;
    const code = w.code;
    const rain = w.rain;
    if (code == null && (rain == null || Number.isNaN(rain))) return null;
    if (code != null) {
      if (code <= 2) return "sun";
      if (code === 3 || (code >= 45 && code <= 48)) return "cloud";
      return "rain";
    }
    return rain > 0.2 ? "rain" : "cloud";
  }

  function classifyTemp(w) {
    if (w?.temp == null || Number.isNaN(w.temp)) return null;
    if (w.temp < 0) return "frost";
    if (w.temp < 8) return "cold";
    if (w.temp < 16) return "mild";
    return "warm";
  }

  function classifyWind(w) {
    if (w?.wind == null || Number.isNaN(w.wind)) return null;
    if (w.wind < 15) return "calm";
    if (w.wind < 30) return "breeze";
    return "windy";
  }

  function classifyWx(w, dim) {
    if (dim === "temp") return classifyTemp(w);
    if (dim === "wind") return classifyWind(w);
    return classifySky(w);
  }

  function weekOfMonth(iso) {
    return Math.ceil(Number(iso.slice(8, 10)) / 7);
  }

  function zScore(obs, n, p) {
    if (n < 1) return 0;
    const sd = Math.sqrt(n * p * (1 - p));
    if (sd < 0.05) return 0;
    return (obs - n * p) / sd;
  }

  function liftColor(z) {
    const t = clip01((z + 2.4) / 4.8);
    const h = 212 - t * 168;
    const s = 42 + t * 38;
    const l = 72 - t * 16;
    return `hsl(${h} ${s}% ${l}%)`;
  }

  function joinDrawsWeather(draws) {
    return draws.map((d) => ({
      ...d,
      w: wx.byDate[d.date] || null,
      wd: weekdayIndex(d.date),
      month: Number(d.date.slice(5, 7)),
      year: Number(d.date.slice(0, 4)),
      wom: weekOfMonth(d.date),
    }));
  }

  function bucketOf(row, dim) {
    return classifyWx(row.w, dim);
  }

  function hitsIn(rows, n) {
    if (n == null) return rows.length;
    return rows.reduce((s, d) => s + (d.main.includes(n) ? 1 : 0), 0);
  }

  function wxNamed(list, id) {
    return list.find((b) => b.id === id)?.label || "unbekannt";
  }

  function wxLiftScores(rows, kind, max) {
    const scores = Array(max + 1).fill(0);
    const counts = Array(max + 1).fill(0);
    const zs = Array(max + 1).fill(0);
    if (rows.length < 8) return { scores, counts, zs, n: rows.length };
    const expected = Array(max + 1).fill(0);
    rows.forEach((d) => {
      const cap = kind === "euro" ? (d.euroMax || 12) : max;
      d[kind].forEach((num) => {
        if (num >= 1 && num <= cap) counts[num] += 1;
      });
      if (kind === "euro") {
        for (let n = 1; n <= cap; n++) expected[n] += 2 / cap;
      }
    });
    for (let n = 1; n <= max; n++) {
      const p = kind === "euro"
        ? (rows.length ? expected[n] / rows.length : 1 / 6)
        : 0.1;
      const z = zScore(counts[n], rows.length, p);
      zs[n] = z;
      scores[n] = clip01(Math.max(0, z) / 2.15);
    }
    return { scores, counts, zs, n: rows.length };
  }

  function wxTop(scores, max, k) {
    return Array.from({ length: max }, (_, i) => i + 1)
      .filter((n) => scores[n] > 0.18)
      .sort((a, b) => scores[b] - scores[a] || a - b)
      .slice(0, k);
  }

  function inferWxProfile(iso) {
    const joined = joinDrawsWeather(ALL).filter((d) => d.w);
    const wd = weekdayIndex(iso);
    const month = Number(iso.slice(5, 7));
    let pool = joined.filter((d) => d.wd === wd && d.month === month);
    if (pool.length < 10) pool = joined.filter((d) => d.month === month);
    if (pool.length < 10) pool = joined;
    const mode = (fn) => {
      const c = {};
      pool.forEach((d) => {
        const id = fn(d.w);
        if (id) c[id] = (c[id] || 0) + 1;
      });
      return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || null;
    };
    return {
      sky: mode(classifySky),
      tempB: mode(classifyTemp),
      windB: mode(classifyWind),
      inferred: true,
      sample: pool.length,
    };
  }

  function buildWxSignal(iso, weather) {
    const empty = {
      iso,
      ready: false,
      main: Array(51).fill(0),
      euro: Array(13).fill(0),
      zs: Array(51).fill(0),
      lines: ["Wetter-Frequenzanalyse nicht verfügbar — der Konsens läuft ohne diese Schicht."],
      topMain: [],
      topEuro: [],
    };
    const withWx = joinDrawsWeather(filtered()).filter((d) => d.w && (d.w.temp != null || d.w.code != null));
    if (withWx.length < 20) return empty;

    let sky;
    let tempB;
    let windB;
    let inferred = false;
    if (weather && (weather.temp != null || weather.code != null)) {
      sky = classifySky(weather);
      tempB = classifyTemp(weather);
      windB = classifyWind(weather);
    } else {
      const inf = inferWxProfile(iso);
      sky = inf.sky;
      tempB = inf.tempB;
      windB = inf.windB;
      inferred = true;
    }
    if (!sky && !tempB && !windB) return empty;

    const skyRows = sky ? withWx.filter((d) => classifySky(d.w) === sky) : [];
    const tempRows = tempB ? withWx.filter((d) => classifyTemp(d.w) === tempB) : [];
    const windRows = windB ? withWx.filter((d) => classifyWind(d.w) === windB) : [];
    const wd = weekdayIndex(iso);
    const month = Number(iso.slice(5, 7));
    const wom = weekOfMonth(iso);
    const dayRows = sky ? withWx.filter((d) => d.wd === wd && classifySky(d.w) === sky) : [];
    const monthRows = sky ? withWx.filter((d) => d.month === month && classifySky(d.w) === sky) : [];
    const weekRows = sky ? withWx.filter((d) => d.wom === wom && classifySky(d.w) === sky) : [];

    const mainSky = wxLiftScores(skyRows, "main", 50);
    const mainTemp = wxLiftScores(tempRows, "main", 50);
    const mainWind = wxLiftScores(windRows, "main", 50);
    const mainDay = wxLiftScores(dayRows, "main", 50);
    const mainMonth = wxLiftScores(monthRows, "main", 50);
    const mainWeek = wxLiftScores(weekRows, "main", 50);
    const euroSky = wxLiftScores(skyRows, "euro", 12);
    const euroTemp = wxLiftScores(tempRows, "euro", 12);
    const euroWind = wxLiftScores(windRows, "euro", 12);

    const main = Array(51).fill(0);
    const euro = Array(13).fill(0);
    const zs = Array(51).fill(0);
    for (let n = 1; n <= 50; n++) {
      main[n] = 0.36 * mainSky.scores[n]
        + 0.22 * mainTemp.scores[n]
        + 0.16 * mainWind.scores[n]
        + 0.12 * mainDay.scores[n]
        + 0.09 * mainMonth.scores[n]
        + 0.05 * mainWeek.scores[n];
      zs[n] = mainSky.zs[n];
    }
    for (let n = 1; n <= 12; n++) {
      euro[n] = 0.5 * euroSky.scores[n] + 0.28 * euroTemp.scores[n] + 0.22 * euroWind.scores[n];
    }

    const topMain = wxTop(main, 50, 8);
    const topEuro = wxTop(euro, 12, 4);
    const skyLab = wxNamed(WX_SKY, sky);
    const tempLab = wxNamed(WX_TEMP, tempB);
    const windLab = wxNamed(WX_WIND, windB);
    const lines = [];
    if (weather && !inferred) {
      lines.push(`Helsinki für ${weekday(iso)}, ${fmtDate(iso)}: ${fmt(weather.temp, 1)} °C, ${fmt(weather.rain, 1)} mm, Wind ${fmt(weather.wind, 0)} km/h, Lage ${weatherLabel(weather.code)} — gelesen als ${skyLab}, ${tempLab}, ${windLab}.`);
    } else {
      lines.push(`Keine Tagesprognose. Typische Lage am ${WD_DE[wd]} im ${MO_DE[month - 1]}: ${skyLab}, ${tempLab}, ${windLab} (aus ${fmt(inferWxProfile(iso).sample)} vergleichbaren Archivtagen).`);
    }
    if (skyRows.length) {
      lines.push(`${skyLab}: ${fmt(skyRows.length)} historische Ziehungen. Stärkste Häufungen gegenüber Zufall: ${topFrom(mainSky.counts, 6, 50).join(", ") || "–"}.`);
    }
    if (tempRows.length) {
      lines.push(`${tempLab}: ${fmt(tempRows.length)} Ziehungen im Temperaturfenster.`);
    }
    if (windRows.length) {
      lines.push(`${windLab}: ${fmt(windRows.length)} Ziehungen in dieser Windklasse.`);
    }
    if (dayRows.length) {
      lines.push(`${WD_DE[wd]} × ${skyLab}: ${fmt(dayRows.length)} Ziehungen. Wetter-Querverbindung zum Ziehungswochentag.`);
    }
    if (monthRows.length) {
      lines.push(`${MO_DE[month - 1]} × ${skyLab}: ${fmt(monthRows.length)} Ziehungen. Monat-Wetter-Muster geht in den Score.`);
    }
    if (topMain.length) {
      lines.push(`Wetter-Frequenzscore (Lage + Temperatur + Wind + Tag/Monat): ${topMain.join(", ")}.`);
    }
    if (topEuro.length) {
      lines.push(`Eurozahlen mit Wetter-Häufung: ${topEuro.join(", ")}.`);
    }
    lines.push("Die Wetterschicht verschiebt den Konsens nur dort, wo Historie und Prognose zusammenpassen. Die Jackpot-Chance bleibt 1 zu 139.838.160.");

    return {
      iso,
      ready: true,
      weather,
      sky,
      tempB,
      windB,
      inferred,
      main,
      euro,
      zs,
      lines,
      topMain,
      topEuro,
    };
  }

  function getWxSignal(iso) {
    if (state.wxSignal && state.wxSignal.iso === iso) return state.wxSignal;
    return buildWxSignal(iso, wx.byDate[iso] || null);
  }

  function wxMatrixHtml(joined, rowDefs, dim, buckets, n) {
    const p = 0.1;
    const grid = rowDefs.map((row) => buckets.map((b) => {
      const rows = joined.filter((d) => row.match(d) && bucketOf(d, dim) === b.id);
      return { rows, value: hitsIn(rows, n) };
    }));
    const maxCount = Math.max(1, ...grid.flatMap((line) => line.map((c) => c.value)));
    const cells = grid.map((line, ri) => line.map((cell, ci) => {
      const b = buckets[ci];
      const row = rowDefs[ri];
      const exp = n == null ? null : cell.rows.length * p;
      const z = n == null || cell.rows.length < 4 ? 0 : zScore(cell.value, cell.rows.length, p);
      const bg = n == null ? heatColor(cell.value, 0, maxCount) : liftColor(z);
      const title = n == null
        ? `${row.label} · ${b.label}: ${cell.value} Ziehungen`
        : `Zahl ${n} · ${row.label} · ${b.label}: ${cell.value}× in ${cell.rows.length} Ziehungen, erwartet ${fmt(exp, 1)}`;
      return { value: cell.value, title, bg, empty: cell.rows.length === 0 };
    }));
    const cols = `72px repeat(${buckets.length}, minmax(0, 1fr))`;
    return `<div class="wx-matrix" style="grid-template-columns:${cols}">
      <div class="wx-mx-lab"></div>
      ${buckets.map((b) => `<div class="wx-mx-h">${b.label}</div>`).join("")}
      ${rowDefs.map((row, ri) => `
        <div class="wx-mx-lab">${row.label}</div>
        ${cells[ri].map((c) => `<div class="wx-mx-cell${c.empty ? " is-empty" : ""}" style="background:${c.empty ? "transparent" : c.bg}" title="${c.title}">${c.empty ? "–" : c.value}</div>`).join("")}
      `).join("")}
    </div>`;
  }

  function svgStackedBars(cats, series, unit) {
    const w = 640;
    const h = 220;
    const pad = { l: 8, r: 12, t: 28, b: 36 };
    const totals = cats.map((_, i) => series.reduce((s, ser) => s + (ser.values[i] || 0), 0));
    const max = Math.max(1, ...totals);
    const inner = w - pad.l - pad.r;
    const bw = inner / Math.max(1, cats.length);
    const y = (v) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
    const bars = cats.map((cat, i) => {
      const x = pad.l + i * bw + bw * 0.18;
      const width = bw * 0.64;
      let acc = 0;
      const parts = series.map((ser) => {
        const v = ser.values[i] || 0;
        const y0 = y(acc + v);
        const bh = y(acc) - y0;
        acc += v;
        return `<rect x="${x}" y="${y0}" width="${width}" height="${Math.max(0, bh)}" fill="${ser.color}"/>`;
      }).join("");
      return `<g>
        ${parts}
        <text x="${x + width / 2}" y="${h - 12}" text-anchor="middle" fill="#c9d4ee" font-size="${cats.length > 12 ? 9 : 11}">${cat}</text>
      </g>`;
    }).join("");
    const legend = series.map((ser, i) =>
      `<g transform="translate(${pad.l + i * 118}, 4)">
        <rect width="10" height="10" rx="2" fill="${ser.color}"/>
        <text x="14" y="10" fill="#c9d4ee" font-size="11">${ser.label}</text>
      </g>`
    ).join("");
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">
      <text x="${pad.l}" y="14" fill="#93a0bf" font-size="11">${unit}</text>
      ${legend}
      ${bars}
    </svg>`;
  }

  function wxFindings(joined, buckets, dim) {
    const p = 0.1;
    const items = [];
    buckets.forEach((b) => {
      const rows = joined.filter((d) => bucketOf(d, dim) === b.id);
      if (rows.length < 30) return;
      for (let n = 1; n <= 50; n++) {
        const obs = hitsIn(rows, n);
        const z = zScore(obs, rows.length, p);
        if (Math.abs(z) >= 1.8) {
          items.push({
            z,
            kind: "zahl",
            text: `Hauptzahl ${n} bei ${b.label}: ${obs}× in ${rows.length} Ziehungen (erwartet ${fmt(rows.length * p, 1)}, z = ${fmt(z, 1)}).`,
          });
        }
      }
    });
    const wdRows = [...new Set(joined.map((d) => d.wd))].sort((a, b) => a - b);
    wdRows.forEach((wd) => {
      buckets.forEach((b) => {
        const rows = joined.filter((d) => d.wd === wd && bucketOf(d, dim) === b.id);
        if (rows.length < 8) return;
        const share = joined.length ? rows.length / joined.length : 0;
        items.push({
          z: share * 4,
          kind: "zeit",
          text: `${WD_DE[wd]} und ${b.label}: ${rows.length} Ziehungen (${fmt(share * 100, 1)} % des Zeitraums).`,
        });
      });
    });
    MO_DE.forEach((_, mi) => {
      const month = mi + 1;
      buckets.forEach((b) => {
        const rows = joined.filter((d) => d.month === month && bucketOf(d, dim) === b.id);
        if (rows.length < 8) return;
        for (let n = 1; n <= 50; n++) {
          const obs = hitsIn(rows, n);
          const z = zScore(obs, rows.length, p);
          if (Math.abs(z) >= 2.2 && obs >= 4) {
            items.push({
              z,
              kind: "quer",
              text: `Zahl ${n} im ${MO_DE[mi]} bei ${b.label}: ${obs}× in ${rows.length} Ziehungen (erwartet ${fmt(rows.length * p, 1)}, z = ${fmt(z, 1)}).`,
            });
          }
        }
      });
    });
    const zahl = items.filter((x) => x.kind === "zahl").sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 8);
    const quer = items.filter((x) => x.kind === "quer").sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 6);
    const zeit = items.filter((x) => x.kind === "zeit").sort((a, b) => b.z - a.z).slice(0, 6);
    return { zahl, quer, zeit };
  }

  function wxNumberProfile(joined, n) {
    const dims = [
      { id: "sky", label: "Lage", buckets: WX_SKY },
      { id: "temp", label: "Temperatur", buckets: WX_TEMP },
      { id: "wind", label: "Windstärke", buckets: WX_WIND },
    ];
    const total = hitsIn(joined, n);
    const recent = joined.filter((d) => d.main.includes(n)).slice(-8).reverse();
    const dimHtml = dims.map((dim) => {
      const rows = dim.buckets.map((b) => {
        const subset = joined.filter((d) => bucketOf(d, dim.id) === b.id);
        const obs = hitsIn(subset, n);
        const exp = subset.length * 0.1;
        const z = zScore(obs, subset.length, 0.1);
        return `<div class="stat-row"><span>${b.label} · ${subset.length} Ziehungen</span><strong>${obs}× (${obs - exp >= 0 ? "+" : ""}${fmt(obs - exp, 1)}, z ${fmt(z, 1)})</strong></div>`;
      }).join("");
      return `<div><h4>${dim.label}</h4>${rows}</div>`;
    }).join("");
    const dates = recent.length
      ? `<div class="wx-recent">${recent.map((d) => {
        const sky = WX_SKY.find((b) => b.id === classifySky(d.w));
        const temp = d.w?.temp == null ? "–" : `${fmt(d.w.temp, 1)} °C`;
        const wind = d.w?.wind == null ? "–" : `${fmt(d.w.wind, 0)} km/h`;
        return `<div class="wx-recent-row"><span>${WD_DE[d.wd]} ${fmtDate(d.date)}</span><span class="wx-chip" style="--wx:${sky?.color || "#8aa0d0"}">${sky?.label || "ohne Wetter"}</span><span>${temp}</span><span>${wind}</span><span>${d.main.map((x) => String(x).padStart(2, "0")).join(" · ")}</span></div>`;
      }).join("")}</div>`
      : `<p class="muted">Keine Treffer im gewählten Zeitraum.</p>`;
    return `
      <div class="wx-profile">
        <h3>Zahl ${n} im Zeitraum · ${total} Treffer</h3>
        <p class="muted">Erwartet wären ${fmt(joined.length * 0.1, 1)} Treffer, wenn jede Ziehung unabhängig 5 aus 50 zieht.</p>
        <div class="wx-profile-grid">${dimHtml}</div>
        <h4>Letzte Treffer mit Wetter</h4>
        ${dates}
      </div>`;
  }

  function paintWx() {
    const el = document.getElementById("wx-root");
    if (!el) return;
    if (wx.status === "loading" || wx.status === "idle") {
      el.innerHTML = `
        <h2>Wetter in Helsinki × alle Ziehungen</h2>
        <p class="muted">Lade Archivwetter am Ziehungsort (Sonnig, Wolkig, Regen, Temperatur, Wind) …</p>`;
      return;
    }
    if (wx.status === "error") {
      el.innerHTML = `
        <h2>Wetter in Helsinki × alle Ziehungen</h2>
        <p class="muted">Wetterarchiv nicht geladen (${wx.error || "unbekannt"}).</p>
        <div class="actions"><button type="button" class="btn secondary" id="wx-retry">Erneut laden</button></div>`;
      return;
    }

    const dim = state.wxDim;
    const buckets = wxDimBuckets();
    const joined = joinDrawsWeather(filtered());
    const withWx = joined.filter((d) => bucketOf(d, dim) != null);
    const missing = joined.length - withWx.length;
    const nSel = state.wxNum;
    const p = 0.1;

    const kpis = buckets.map((b) => {
      const rows = withWx.filter((d) => bucketOf(d, dim) === b.id);
      const share = withWx.length ? rows.length / withWx.length : 0;
      return `<article class="card wx-kpi"><p class="kpi-value">${fmt(share * 100, 0)} %</p><p class="kpi-label">${b.label}<br>${rows.length} Ziehungen</p></article>`;
    }).join("");

    const heats = buckets.map((b) => {
      const rows = withWx.filter((d) => bucketOf(d, dim) === b.id);
      const cells = Array.from({ length: 50 }, (_, i) => {
        const num = i + 1;
        const obs = hitsIn(rows, num);
        const z = zScore(obs, rows.length, p);
        const on = nSel === num ? " is-on" : "";
        return `<button type="button" class="heat-cell wx-n${on}" data-wx-n="${num}" style="background:${liftColor(z)}" title="Zahl ${num} bei ${b.label}: ${obs}× in ${rows.length} Ziehungen, erwartet ${fmt(rows.length * p, 1)} (z = ${fmt(z, 1)})">${num}<small>${obs}</small></button>`;
      }).join("");
      const euroCells = Array.from({ length: 12 }, (_, i) => {
        const num = i + 1;
        const eligible = rows.filter((d) => num <= (d.euroMax || 12));
        const obs = eligible.reduce((s, d) => s + (d.euro.includes(num) ? 1 : 0), 0);
        const pe = eligible.length ? eligible.reduce((s, d) => s + 2 / (d.euroMax || 12), 0) / eligible.length : 1 / 6;
        const z = zScore(obs, eligible.length, pe);
        return `<div class="heat-cell" style="background:${liftColor(z)}" title="Euro ${num} bei ${b.label}: ${obs}×, erwartet ${fmt(eligible.length * pe, 1)}">${num}<small>${obs}</small></div>`;
      }).join("");
      return `<div class="wx-heat">
        <h4><span>${b.label}</span><span class="muted">${rows.length} Ziehungen</span></h4>
        <div class="heat">${cells}</div>
        <p class="wx-euro-lab">Eurozahlen</p>
        <div class="heat euro">${euroCells}</div>
      </div>`;
    }).join("");

    const wdDefs = [...new Set(withWx.map((d) => d.wd))].sort((a, b) => a - b)
      .map((wd) => ({ label: WD_DE[wd], match: (d) => d.wd === wd }));
    const womDefs = [1, 2, 3, 4, 5]
      .filter((w) => withWx.some((d) => d.wom === w))
      .map((w) => ({ label: `${w}. Woche`, match: (d) => d.wom === w }));
    const moDefs = MO_DE.map((lab, i) => ({ label: lab, match: (d) => d.month === i + 1 }))
      .filter((row) => withWx.some(row.match));
    const years = [...new Set(withWx.map((d) => d.year))].sort((a, b) => a - b);
    const yrDefs = years.map((y) => ({ label: String(y), match: (d) => d.year === y }));
    const stacked = svgStackedBars(
      years.map(String),
      buckets.map((b) => ({
        id: b.id,
        label: b.label,
        color: b.color,
        values: years.map((y) => withWx.filter((d) => d.year === y && bucketOf(d, dim) === b.id).length),
      })),
      nSel ? `Ziehungen je Jahr` : "Ziehungen je Jahr"
    );

    const findings = wxFindings(withWx, buckets, dim);
    const list = (arr, empty) => arr.length
      ? `<ul class="wx-findings">${arr.map((x) => `<li>${x.text}</li>`).join("")}</ul>`
      : `<p class="muted">${empty}</p>`;

    const temps = withWx.map((d) => d.w?.temp).filter((v) => v != null && !Number.isNaN(v));
    const winds = withWx.map((d) => d.w?.wind).filter((v) => v != null && !Number.isNaN(v));
    const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

    el.innerHTML = `
      <h2>Wetter in Helsinki × Ziehungen</h2>
      <p class="muted">
        Lage, Temperatur und Windstärke am Ziehungsort für den gewählten Zeitraum.
        ${fmt(withWx.length)} von ${fmt(joined.length)} Ziehungen mit Wetter${missing ? ` · ${missing} ohne Archivwert` : ""}.
        Mittel ${fmt(mean(temps), 1)} °C, Wind max. ${fmt(mean(winds), 0)} km/h.
        Farbe in den Zahlenfeldern = Abweichung von der Zufallserwartung (5 aus 50). Gold häufiger, Blau seltener.
        Sonnig = klar bis heiter, Wolkig = bedeckt/Nebel, Regen = Niederschlag inkl. Schnee.
        Das ist Korrelation, keine Vorhersage — die Jackpot-Chance bleibt 1 zu 139.838.160.
      </p>
      <div class="wx-pills" role="tablist">
        <button type="button" class="wx-pill${dim === "sky" ? " is-on" : ""}" data-wx-dim="sky">Lage (Sonnig / Wolkig / Regen)</button>
        <button type="button" class="wx-pill${dim === "temp" ? " is-on" : ""}" data-wx-dim="temp">Temperatur</button>
        <button type="button" class="wx-pill${dim === "wind" ? " is-on" : ""}" data-wx-dim="wind">Windstärke</button>
      </div>
      <div class="kpis wx-kpis">${kpis}</div>
      <p class="muted wx-hint">Eine Hauptzahl antippen, um Tag, Woche, Monat und Jahr bei diesem Wetter zu sehen.${nSel ? ` Aktiv: Zahl ${nSel}.` : ""}</p>
      <div class="wx-heats">${heats}</div>
      ${nSel ? wxNumberProfile(withWx, nSel) : ""}
      <div class="charts wx-charts">
        <div class="chart-box">
          <h4>${nSel ? `Zahl ${nSel} · Wochentag × Wetter` : "Wochentag × Wetter"}</h4>
          ${wxMatrixHtml(withWx, wdDefs, dim, buckets, nSel)}
        </div>
        <div class="chart-box">
          <h4>${nSel ? `Zahl ${nSel} · Woche im Monat` : "Woche im Monat × Wetter"}</h4>
          ${wxMatrixHtml(withWx, womDefs, dim, buckets, nSel)}
        </div>
      </div>
      <div class="chart-box" style="margin-top:12px">
        <h4>${nSel ? `Zahl ${nSel} · Monat × Wetter` : "Monat × Wetter"}</h4>
        ${wxMatrixHtml(withWx, moDefs, dim, buckets, nSel)}
      </div>
      <div class="charts wx-charts" style="margin-top:12px">
        <div class="chart-box">
          <h4>Wetterlage über die Jahre</h4>
          ${stacked}
        </div>
        <div class="chart-box">
          <h4>${nSel ? `Zahl ${nSel} · Jahr × Wetter` : "Jahr × Wetter"}</h4>
          ${wxMatrixHtml(withWx, yrDefs, dim, buckets, nSel)}
        </div>
      </div>
      <div class="wx-notes">
        <h3>Auffälligkeiten (Häufigkeit)</h3>
        ${list(findings.zahl, "Keine robuste Zahlen-Abweichung (Schwelle |z| ≥ 1,8, mindestens 10 Ziehungen je Wetter).")}
        <h3>Querverbindungen Monat × Wetter × Zahl</h3>
        ${list(findings.quer, "Keine dichten Monat-Wetter-Zahl-Cluster (Schwelle |z| ≥ 2,2). Bei wenigen Ziehungen je Zelle ist das der Normalfall.")}
        <h3>Zeit × Wetter</h3>
        ${list(findings.zeit, "Keine belastbare Zeit-Wetter-Häufung.")}
      </div>
    `;
  }

  function renderCalc(stats) {
    const ready = state.main.length === 5 && state.euro.length === 2;
    let hist = "";
    if (ready) {
      const evald = evaluateTicket(state.main, state.euro, stats);
      hist = `
        <article class="card">
          <div class="hero-odds">
            <p class="label">Theoretische Jackpot-Wahrscheinlichkeit (aktuelle Regeln)</p>
            <strong>1 : ${fmt(prizeOdds(5, 2))}</strong>
          </div>
          <p class="muted" style="text-align:center">Diese Chance gilt für jeden vollständigen Tipp gleich — auch für „heiße“ Zahlen.</p>
          <div style="overflow:auto;margin-top:12px">
            <table>
              <thead><tr><th>Klasse</th><th>Richtige</th><th>Chance 1 zu</th></tr></thead>
              <tbody>
                ${PRIZE.map((p) => `<tr><td>${p.cls}</td><td>${p.label}</td><td>${fmt(prizeOdds(p.main, p.euro), p.cls <= 3 ? 0 : 1)}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        </article>
        <article class="card">
          <h2>Empirische Bewertung deines Tipps</h2>
          <p class="muted">${evald.exact}</p>
          ${evald.rows.map((r) => `<div class="stat-row"><span>${r.label}</span><strong>${r.value}</strong></div>`).join("")}
        </article>
      `;
    } else {
      hist = `<article class="card"><p class="muted">Wähle 5 Hauptzahlen und 2 Eurozahlen, um die Gewinnklassen und die historische Bewertung zu sehen.</p></article>`;
    }

    document.getElementById("tab-calc").innerHTML = `
      <div class="grid-2">
        <article class="card">
          <div class="picker-head"><h2>Hauptzahlen</h2><p>${state.main.length} / 5</p></div>
          <div class="picker" id="pick-main">
            ${Array.from({ length: 50 }, (_, i) => i + 1).map((n) =>
              `<button type="button" class="ball${state.main.includes(n) ? " selected" : ""}" data-kind="main" data-n="${n}">${n}</button>`
            ).join("")}
          </div>
          <div class="picker-head"><h2>Eurozahlen</h2><p>${state.euro.length} / 2</p></div>
          <div class="picker euro" id="pick-euro">
            ${Array.from({ length: 12 }, (_, i) => i + 1).map((n) =>
              `<button type="button" class="ball euro${state.euro.includes(n) ? " selected" : ""}" data-kind="euro" data-n="${n}">${n}</button>`
            ).join("")}
          </div>
          <div class="actions">
            <button class="btn secondary" id="clear-pick">Auswahl leeren</button>
          </div>
        </article>
        <div style="display:grid;gap:14px">${hist}</div>
      </div>
    `;
  }

  function evaluateTicket(main, euro, stats) {
    const m = [...main].sort((a, b) => a - b);
    const e = [...euro].sort((a, b) => a - b);
    const draws = filtered();
    let best = { hits: 0, euroHits: 0, date: null };
    let exact = 0;
    let pairHits = 0;
    draws.forEach((d) => {
      const mh = d.main.filter((n) => m.includes(n)).length;
      const eh = d.euro.filter((n) => e.includes(n)).length;
      if (mh === 5 && eh === 2) exact += 1;
      if (mh > best.hits || (mh === best.hits && eh > best.euroHits)) best = { hits: mh, euroHits: eh, date: d.date };
      if (mh >= 2) pairHits += 1;
    });
    const rows = m.map((n) => {
      const s = stats.mainStats[n - 1];
      const delta = s.count - s.expected;
      return {
        label: `Hauptzahl ${n}`,
        value: `${s.count}× (${delta >= 0 ? "+" : ""}${fmt(delta, 1)} vs. Erwartung), überfällig ${s.overdue}`,
      };
    }).concat(e.map((n) => {
      const s = stats.euroStats[n - 1];
      return { label: `Eurozahl ${n}`, value: `${s.count}×, überfällig ${s.overdue}` };
    }));
    rows.push({ label: "Beste historische Annäherung", value: best.date ? `${best.hits}+${best.euroHits} am ${fmtDate(best.date)}` : "–" });
    rows.push({ label: "Ziehungen mit mind. 2 deiner Hauptzahlen", value: `${pairHits}` });
    return {
      exact: exact
        ? `Diese exakte Kombination fiel bereits ${exact}×.`
        : `Diese exakte 5+2-Kombination ist in der Historie noch nie gefallen — bei 139,8 Mio. Tipps und ${fmt(ALL.length)} Ziehungen ist das der Normalfall.`,
      rows,
    };
  }

  function sampleWeighted(items, weightFn, count, rnd) {
    const pool = items.map((item) => ({ item, w: Math.max(weightFn(item), 0.01) }));
    const picked = [];
    while (picked.length < count && pool.length) {
      const total = pool.reduce((s, p) => s + p.w, 0);
      let r = rnd() * total;
      let idx = 0;
      for (; idx < pool.length; idx++) {
        r -= pool[idx].w;
        if (r <= 0) break;
      }
      idx = Math.min(idx, pool.length - 1);
      picked.push(pool[idx].item);
      pool.splice(idx, 1);
    }
    return picked.sort((a, b) => a - b);
  }

  function mulberry32(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function toIso(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function nextDrawDate(lastIso) {
    if (live.nextDraw && (!lastIso || live.nextDraw > lastIso)) {
      return new Date(`${live.nextDraw}T12:00:00`);
    }
    const start = new Date(`${lastIso}T12:00:00`);
    for (let i = 1; i <= 8; i++) {
      const n = new Date(start);
      n.setDate(start.getDate() + i);
      const wd = n.getDay();
      if (wd === 2 || wd === 5) return n;
    }
    return start;
  }

  function euroMaxFor(iso) {
    if (iso < "2014-10-10") return 8;
    if (iso < "2022-03-25") return 10;
    return 12;
  }

  function weekdayIndex(iso) {
    return new Date(`${iso}T12:00:00`).getDay();
  }

  function lastDrawOfWeekday(wd) {
    for (let i = ALL.length - 1; i >= 0; i--) {
      if (weekdayIndex(ALL[i].date) === wd) return ALL[i];
    }
    return null;
  }

  function recentOfficialDraws() {
    return {
      last: ALL[ALL.length - 1] || null,
      tue: lastDrawOfWeekday(2),
      fri: lastDrawOfWeekday(5),
    };
  }

  function describeDraw(d) {
    if (!d) return "";
    return `${weekday(d.date)}, ${fmtDate(d.date)}: ${d.main.join(" · ")} + ${d.euro.join(" · ")}`;
  }

  function syncMeta() {
    data.count = ALL.length;
    if (ALL.length) {
      data.firstDraw = ALL[0].date;
      data.lastDraw = ALL[ALL.length - 1].date;
    }
  }

  function normalizeDraw(draw) {
    return {
      date: draw.date,
      main: [...draw.main].map(Number).sort((a, b) => a - b),
      euro: [...draw.euro].map(Number).sort((a, b) => a - b),
      euroMax: draw.euroMax || euroMaxFor(draw.date),
    };
  }

  function ingestDraw(raw) {
    if (!raw?.date || !Array.isArray(raw.main) || !Array.isArray(raw.euro)) return false;
    const row = normalizeDraw(raw);
    if (row.main.length !== 5 || row.euro.length !== 2) return false;
    const idx = ALL.findIndex((d) => d.date === row.date);
    if (idx >= 0) {
      const prev = ALL[idx];
      if (prev.main.join() === row.main.join() && prev.euro.join() === row.euro.join()) return false;
      ALL[idx] = row;
    } else {
      ALL.push(row);
    }
    ALL.sort((a, b) => a.date.localeCompare(b.date));
    syncMeta();
    return true;
  }

  function expectedDrawDates(fromIso, endIso) {
    const dates = [];
    const d = new Date(`${fromIso}T12:00:00`);
    const end = new Date(`${endIso}T12:00:00`);
    d.setDate(d.getDate() + 1);
    while (d <= end) {
      const wd = d.getDay();
      if (wd === 2 || wd === 5) dates.push(toIso(d));
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }

  function loadPersistedDraws() {
    try {
      const raw = localStorage.getItem(LIVE_STORE);
      if (!raw) return 0;
      const extra = JSON.parse(raw);
      let n = 0;
      (extra.draws || []).forEach((d) => { if (ingestDraw(d)) n += 1; });
      if (extra.nextDraw) live.nextDraw = extra.nextDraw;
      return n;
    } catch {
      return 0;
    }
  }

  function persistLiveDraws() {
    try {
      const extra = ALL.filter((d) => d.date > bundledLast);
      localStorage.setItem(LIVE_STORE, JSON.stringify({
        savedAt: new Date().toISOString(),
        lastDraw: data.lastDraw,
        nextDraw: live.nextDraw,
        draws: extra,
      }));
    } catch { /* ignore quota / private mode */ }
  }

  function julianDay(d) {
    const y = d.getFullYear();
    let m = d.getMonth() + 1;
    const day = d.getDate() + 0.5;
    let yy = y;
    if (m <= 2) {
      yy -= 1;
      m += 12;
    }
    const A = Math.floor(yy / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (yy + 4716)) + Math.floor(30.6001 * (m + 1)) + day + B - 1524.5;
  }

  function sunLongitude(d) {
    const start = Date.UTC(d.getFullYear(), 0, 0);
    const doy = (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86400000;
    return ((doy - 80) * 360) / 365.2422;
  }

  function zodiacName(lon) {
    const names = ["Widder", "Stier", "Zwillinge", "Krebs", "Löwe", "Jungfrau", "Waage", "Skorpion", "Schütze", "Steinbock", "Wassermann", "Fische"];
    const i = ((Math.floor(((lon % 360) + 360) % 360 / 30)) + 12) % 12;
    return { name: names[i], index: i + 1 };
  }

  function moonInfo(d) {
    const synodic = 29.530588853;
    const age = ((julianDay(d) - 2451550.1) % synodic + synodic) % synodic;
    const illum = (1 - Math.cos((2 * Math.PI * age) / synodic)) / 2;
    const sun = sunLongitude(d);
    const moonLon = sun + (360 * age) / synodic;
    const sign = zodiacName(moonLon);
    let phase = "Neumond";
    if (age < 1.5 || age > synodic - 1.5) phase = "Neumond";
    else if (age < 6.5) phase = "zunehmende Sichel";
    else if (age < 8.5) phase = "zunehmender Halbmond";
    else if (age < 13.5) phase = "zunehmender Mond";
    else if (age < 16) phase = "Vollmond";
    else if (age < 21.5) phase = "abnehmender Mond";
    else if (age < 23.5) phase = "abnehmender Halbmond";
    else phase = "abnehmende Sichel";
    return { age, illum, phase, sign, sun: zodiacName(sun) };
  }

  const CURRENT_EVENTS = [
    { from: "2026-08-20", to: "2026-08-28", title: "35 Jahre Unabhängigkeit der Ukraine (24.08.) — Koalition der Willigen in Kiew, 6,1 Mrd. € EU-Luftverteidigung", nums: [24, 8, 35, 6, 1] },
    { from: "2026-08-20", to: "2026-08-28", title: "US-Sanktionen gegen Iran („economic D-Day“) und Drohung, Ölausfuhren aus dem Golf zu stoppen", nums: [24, 26, 2] },
    { from: "2026-08-22", to: "2026-08-27", title: "US-vermittelte Gespräche Syrien–Israel in Jordanien zur Deeskalation", nums: [22, 27, 4] },
    { from: "2026-08-12", to: "2026-08-14", title: "Totale Sonnenfinsternis am 12.08.2026", nums: [12, 8, 26] },
    { from: "2026-08-25", to: "2026-08-30", title: "Tiefe partielle Mondfinsternis 27./28.08.2026 (rund 96 % Abdeckung, in Europa sichtbar)", nums: [27, 28, 8, 12, 46] },
  ];

  const HISTORY_EVENTS = [
    { date: "2012-03-23", title: "Erste Eurojackpot-Ziehung (5, 8, 21, 37, 46 + 6, 8)", nums: [5, 8, 21, 37, 46, 6], window: 0 },
    { date: "2012-07-27", title: "Eröffnung Olympische Spiele London", nums: [27, 7, 12], window: 3 },
    { date: "2014-10-10", title: "Eurozahlen von 8 auf 10 erweitert", nums: [10, 8, 14], window: 2 },
    { date: "2015-03-20", title: "Sonnenfinsternis über Europa (20.03.2015)", nums: [20, 3, 15], window: 3 },
    { date: "2015-11-13", title: "Anschläge von Paris", nums: [13, 11, 15], window: 4 },
    { date: "2016-06-23", title: "Brexit-Referendum", nums: [23, 6, 16], window: 3 },
    { date: "2016-08-05", title: "Olympische Spiele Rio", nums: [5, 8, 16], window: 4 },
    { date: "2020-03-11", title: "WHO erklärt COVID-19 zur Pandemie", nums: [11, 3, 20], window: 5 },
    { date: "2022-02-24", title: "Beginn des russischen Angriffskriegs gegen die Ukraine (24.02.)", nums: [24, 2, 22], window: 4 },
    { date: "2022-03-25", title: "Regelwechsel: 2 aus 12, Dienstagsziehung, Jackpot-Deckel 120 Mio.", nums: [25, 3, 12, 22], window: 2 },
    { date: "2024-04-08", title: "Totale Sonnenfinsternis über Nordamerika", nums: [8, 4, 24], window: 3 },
    { date: "2024-06-09", title: "Europawahl", nums: [9, 6, 24], window: 3 },
    { date: "2024-07-26", title: "Eröffnung Olympische Spiele Paris", nums: [26, 7, 24], window: 3 },
    { date: "2025-05-08", title: "80 Jahre Kriegsende in Europa", nums: [8, 5, 45], window: 3 },
    { date: "2026-02-06", title: "Olympische Winterspiele Mailand-Cortina (Zeitraum 2026)", nums: [6, 2, 26], window: 7 },
    { date: "2026-08-12", title: "Totale Sonnenfinsternis 12.08.2026", nums: [12, 8, 26], window: 3 },
    { date: "2026-08-24", title: "35. Unabhängigkeitstag der Ukraine — Echo des 24.02.2022", nums: [24, 8, 35, 22], window: 3 },
  ];

  const ECLIPSES = [
    { date: "2015-03-20", title: "Sonnenfinsternis 20.03.2015" },
    { date: "2015-09-28", title: "Blutmond 28.09.2015" },
    { date: "2017-08-21", title: "Große amerikanische Sonnenfinsternis" },
    { date: "2018-07-27", title: "Jahrhundert-Mondfinsternis 27.07.2018" },
    { date: "2019-07-02", title: "Totale Sonnenfinsternis 02.07.2019" },
    { date: "2021-06-10", title: "Ringförmige Sonnenfinsternis 10.06.2021" },
    { date: "2022-05-16", title: "Totale Mondfinsternis 16.05.2022" },
    { date: "2022-10-25", title: "Partielle Sonnenfinsternis 25.10.2022" },
    { date: "2023-10-14", title: "Ringförmige Sonnenfinsternis 14.10.2023" },
    { date: "2023-10-28", title: "Partielle Mondfinsternis 28.10.2023" },
    { date: "2024-04-08", title: "Totale Sonnenfinsternis 08.04.2024" },
    { date: "2025-03-14", title: "Totale Mondfinsternis 14.03.2025" },
    { date: "2025-09-07", title: "Totale Mondfinsternis 07.09.2025" },
    { date: "2026-08-12", title: "Totale Sonnenfinsternis 12.08.2026" },
    { date: "2026-08-28", title: "Tiefe partielle Mondfinsternis 28.08.2026" },
  ];

  const moonCache = new Map();
  function moonForIso(iso) {
    if (!moonCache.has(iso)) moonCache.set(iso, moonInfo(new Date(`${iso}T12:00:00`)));
    return moonCache.get(iso);
  }

  function daysBetween(a, b) {
    return Math.abs(new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000;
  }

  function drawsNear(iso, days) {
    return ALL.filter((d) => daysBetween(d.date, iso) <= days);
  }

  function tally(draws, field, max) {
    const c = Array(max + 1).fill(0);
    draws.forEach((d) => d[field].forEach((n) => { if (n >= 1 && n <= max) c[n] += 1; }));
    return c;
  }

  function topFrom(counts, k, max) {
    return Array.from({ length: max }, (_, i) => i + 1)
      .filter((n) => counts[n] > 0)
      .sort((a, b) => counts[b] - counts[a] || a - b)
      .slice(0, k);
  }

  function worldEventsFor(drawDate) {
    const iso = toIso(drawDate);
    const day = drawDate.getDate();
    const month = drawDate.getMonth() + 1;
    const year = drawDate.getFullYear();
    const hit = CURRENT_EVENTS.filter((e) => iso >= e.from && iso <= e.to);
    const numerology = {
      title: `Ziehungsdatum ${fmtDate(iso)} — Tag ${day}, Monat ${month}, Jahr ${year}`,
      nums: [day, month, year % 100, (day + month) % 50 || 50, ((day * month) % 50) || 1].filter((n) => n >= 1 && n <= 50),
    };
    return [...hit, numerology];
  }

  function uniqueValid(nums, max) {
    return [...new Set(
      nums.filter((n) => Number.isFinite(n) && n >= 1).map((n) => ((n - 1) % max) + 1)
    )];
  }

  const KI_FOCUSES = [
    { id: "balance", label: "Kernsynthese" },
    { id: "sky", label: "Sternenhimmel" },
    { id: "world", label: "Weltgeschehen" },
    { id: "history", label: "Historische Konstellationen" },
    { id: "overdue", label: "Überfällige Zahlen" },
    { id: "calendar", label: "Kalender & Datenanker" },
    { id: "eclipse", label: "Finsternisse" },
    { id: "weekday", label: "Wochentagsmuster" },
    { id: "pairs", label: "Häufige Paare" },
    { id: "origin", label: "Eröffnungsziehung 2012" },
    { id: "sum", label: "Summe / Gerade-Ungerade" },
    { id: "alt", label: "Gegenmodell" },
  ];

  function focusWeights(id) {
    const base = { due: 1, typical: 1, day: 1, skyHist: 1, eclipse: 1, cal: 1, date: 1, pair: 1, astro: 1, world: 1, first: 1, last: 1 };
    const extra = {
      sky: { astro: 2.3, skyHist: 2.1, eclipse: 1.4 },
      world: { world: 2.5, date: 1.4 },
      history: { skyHist: 2.2, eclipse: 1.8, first: 1.6 },
      overdue: { due: 2.6, typical: 0.45, last: 0.5 },
      calendar: { cal: 2.4, date: 2.2, day: 1.3 },
      eclipse: { eclipse: 2.7, astro: 1.6 },
      weekday: { day: 2.5, pair: 1.3 },
      pairs: { pair: 3.4, typical: 0.8 },
      origin: { first: 4.2, world: 1.3 },
      sum: { typical: 1.4, due: 1.2 },
      alt: { due: 0.35, typical: 1.8, last: 0.2, astro: 0.7, world: 0.7 },
    }[id] || {};
    return { ...base, ...extra };
  }

  function buildForecast(stats, variant = 0, opts = {}) {
    const target = nextDrawDate(data.lastDraw);
    const iso = toIso(target);
    const moon = moonInfo(target);
    const events = worldEventsFor(target);
    const recent = recentOfficialDraws();
    const last = recent.last;
    const lastTue = recent.tue;
    const lastFri = recent.fri;
    const weekdayIdx = target.getDay();
    const sameDay = ALL.filter((d) => new Date(`${d.date}T12:00:00`).getDay() === weekdayIdx);
    const dayMain = Array(51).fill(0);
    const dayEuro = Array(13).fill(0);
    sameDay.forEach((d) => {
      d.main.forEach((n) => { dayMain[n] += 1; });
      d.euro.forEach((n) => { dayEuro[n] += 1; });
    });

    const sameSky = ALL.filter((d) => {
      const m = moonForIso(d.date);
      return m.sign.index === moon.sign.index || Math.abs(m.illum - moon.illum) < 0.12;
    });
    const skyHistMain = tally(sameSky, "main", 50);
    const skyHistEuro = tally(sameSky, "euro", 12);
    const skyHistTop = topFrom(skyHistMain, 8, 50);

    const eclipseDraws = ECLIPSES.flatMap((e) => drawsNear(e.date, 3));
    const eclipseTop = topFrom(tally(eclipseDraws, "main", 50), 6, 50);

    const sameCal = ALL.filter((d) => d.date.slice(5) === iso.slice(5));
    const calTop = topFrom(tally(sameCal, "main", 50), 5, 50);

    const dateNums = uniqueValid([target.getDate(), target.getMonth() + 1, 25, 8, 24, 35], 50);

    const histEventHits = HISTORY_EVENTS.map((ev) => {
      const nearby = drawsNear(ev.date, ev.window ?? 3);
      const drawn = nearby.flatMap((d) => d.main);
      const overlap = ev.nums.filter((n) => n <= 50 && drawn.includes(n));
      return {
        title: `${ev.title} (${fmtDate(ev.date)})`,
        nums: uniqueValid([...ev.nums, ...drawn.slice(0, 8)], 50),
        nearby: nearby.length,
        overlap,
        sample: nearby.slice(0, 2).map((d) => `${fmtDate(d.date)}: ${d.main.join("-")}`),
      };
    }).filter((e) => e.nearby > 0);

    const first = ALL[0];
    const consec = [];
    last.main.forEach((n, i) => {
      if (i && last.main[i] === last.main[i - 1] + 1) consec.push(`${last.main[i - 1]}-${n}`);
    });
    const lastSameDay = weekdayIdx === 2 ? lastTue : weekdayIdx === 5 ? lastFri : last;
    const lastOtherDay = weekdayIdx === 2 ? lastFri : weekdayIdx === 5 ? lastTue : null;

    const overdueTop = [...stats.mainStats].sort((a, b) => b.overdue - a.overdue).slice(0, 5);
    const hotTop = [...stats.mainStats].sort((a, b) => b.count - a.count).slice(0, 5);

    const illumN = Math.max(1, Math.min(50, Math.round(moon.illum * 50)));
    const ageN = Math.max(1, Math.min(50, Math.round(moon.age)));
    const eclipseSoon = iso >= "2026-08-25" && iso <= "2026-08-30";
    const skyNums = uniqueValid([
      illumN, ageN, moon.sign.index, moon.sun.index + 20,
      target.getDate(), target.getMonth() + 1, 3, 8, 12,
      eclipseSoon ? 27 : null, eclipseSoon ? 28 : null,
      ...skyHistTop, ...eclipseTop,
    ], 50);

    const histEventNums = uniqueValid(histEventHits.flatMap((e) => e.nums), 50);
    const eventNums = uniqueValid([...events.flatMap((e) => e.nums), ...histEventNums, ...calTop, ...first.main], 50);
    const skyEuro = uniqueValid([moon.sign.index, 12, Math.max(1, Math.round(moon.illum * 12)), target.getMonth() + 1, moon.sun.index, ...topFrom(skyHistEuro, 4, 12)], 12);
    const eventEuro = uniqueValid([...events.flatMap((e) => e.nums), ...first.euro], 12);

    const used = opts.used || [];
    const focus = opts.focus || "balance";
    const focusMeta = KI_FOCUSES.find((x) => x.id === focus) || KI_FOCUSES[0];
    const w = focusWeights(focus);
    const prevList = used.length ? used : (variant > 0 && state.forecast ? [state.forecast] : []);
    const prevMain = prevList.flatMap((t) => t.main);
    const prevEuro = prevList.flatMap((t) => t.euro);
    const usedKeys = new Set(prevList.map((t) => t.main.slice().sort((a, b) => a - b).join("-")));
    const focusSalt = [...focus].reduce((a, c) => a + c.charCodeAt(0), 0);
    let pickSalt = 0;

    const pairBoost = (a, b) => {
      let c = 0;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      filtered().forEach((d) => {
        if (d.main.includes(lo) && d.main.includes(hi)) c += 1;
      });
      return c;
    };

    function scoreMain(n, picked) {
      const s = stats.mainStats[n - 1];
      const dueRaw = focus === "alt"
        ? Math.exp(-((s.overdue / 10 - 0.35) ** 2) / 0.9)
        : Math.exp(-((s.overdue / 10 - 1.15) ** 2) / 0.85);
      const z = (s.count - s.expected) / Math.sqrt(Math.max(s.expected, 1));
      const typical = Math.exp(-(z * z) / 2.4);
      const dayRank = sameDay.length ? dayMain[n] / sameDay.length : 0;
      const skyHist = sameSky.length ? skyHistMain[n] / sameSky.length : 0;
      const eclipseW = eclipseDraws.length ? eclipseTop.includes(n) ? 1 : 0 : 0;
      const calW = calTop.includes(n) ? 1 : 0;
      const dateW = dateNums.includes(n) ? 1 : 0;
      let pair = 0;
      picked.forEach((p) => { pair += pairBoost(n, p); });
      pair = picked.length ? pair / picked.length : 0;
      const astro = skyNums.includes(n) ? 1 : 0;
      const world = eventNums.includes(n) ? 1 : 0;
      const lastHit = last.main.includes(n) ? 1 : 0;
      const sameDayHit = lastSameDay && lastSameDay.date !== last.date && lastSameDay.main.includes(n) ? 1 : 0;
      const otherDayHit = lastOtherDay && lastOtherDay.date !== last.date && lastOtherDay.main.includes(n) ? 1 : 0;
      const firstHit = first.main.includes(n) ? 0.35 : 0;
      const prevPen = prevMain.filter((x) => x === n).length;
      const jitter = ((n * 17 + target.getDate() * 31 + target.getMonth() * 13 + variant * 97 + focusSalt * 11 + pickSalt * 53) % 100) / 400;
      return w.due * 1.2 * dueRaw + w.typical * 0.95 * typical + w.day * 0.5 * dayRank
        + w.skyHist * 0.7 * skyHist + w.eclipse * 0.55 * eclipseW + w.cal * 0.45 * calW + w.date * 0.5 * dateW
        + w.pair * 0.12 * pair + w.astro * 1.35 * astro + w.world * 1.15 * world + w.first * firstHit
        - w.last * 0.85 * lastHit - w.last * 0.35 * sameDayHit - w.last * 0.28 * otherDayHit
        - 0.85 * prevPen + jitter;
    }

    function scoreEuro(n) {
      const s = stats.euroStats[n - 1];
      const due = Math.exp(-((s.overdue / 6 - 1.1) ** 2) / 0.9);
      const z = (s.count - s.expected) / Math.sqrt(Math.max(s.expected, 1));
      const typical = Math.exp(-(z * z) / 2.2);
      const astro = skyEuro.includes(n) ? 1 : 0;
      const world = eventEuro.includes(n) ? 1 : 0;
      const lastHit = last.euro.includes(n) ? 1 : 0;
      const sameDayHit = lastSameDay && lastSameDay.date !== last.date && lastSameDay.euro.includes(n) ? 1 : 0;
      const otherDayHit = lastOtherDay && lastOtherDay.date !== last.date && lastOtherDay.euro.includes(n) ? 1 : 0;
      const dayRank = sameDay.length ? dayEuro[n] / sameDay.length : 0;
      const skyHist = sameSky.length ? skyHistEuro[n] / sameSky.length : 0;
      const prevPen = prevEuro.filter((x) => x === n).length;
      const jitter = ((n * 23 + variant * 41 + focusSalt * 7 + pickSalt * 29) % 50) / 200;
      return w.due * 1.1 * due + w.typical * 0.95 * typical + w.day * 0.4 * dayRank + w.skyHist * 0.65 * skyHist
        + w.astro * 1.5 * astro + w.world * 1.1 * world - w.last * 0.6 * lastHit
        - w.last * 0.25 * sameDayHit - w.last * 0.2 * otherDayHit - 0.8 * prevPen + jitter;
    }

    const sumW = focus === "sum" ? 2.6 : 1;
    const pool = stats.mainStats.map((s) => s.n);
    const ePool = stats.euroStats.map((s) => s.n);

    function pickTicket() {
      const main = [];
      while (main.length < 5) {
        let best = null;
        let bestS = -1e9;
        pool.forEach((n) => {
          if (main.includes(n)) return;
          let sc = scoreMain(n, main);
          const nextOdd = main.filter((x) => x % 2).length + (n % 2);
          const nextLow = main.filter((x) => x <= 25).length + (n <= 25 ? 1 : 0);
          const remain = 4 - main.length;
          if (nextOdd > 4 || (nextOdd === 0 && remain === 0)) sc -= 0.35 * sumW;
          if (Math.abs((nextOdd + remain * 0.5) - stats.avgOdd) > 1.6) sc -= 0.2 * sumW;
          if (Math.abs((nextLow + remain * 0.5) - stats.avgLow) > 1.6) sc -= 0.2 * sumW;
          const sum = main.reduce((a, b) => a + b, 0) + n;
          if (main.length === 4 && Math.abs(sum - stats.avgSum) > 38) sc -= 0.45 * sumW;
          if (sc > bestS) {
            bestS = sc;
            best = n;
          }
        });
        main.push(best);
      }
      main.sort((a, b) => a - b);
      const euro = [];
      while (euro.length < 2) {
        let best = null;
        let bestS = -1e9;
        ePool.forEach((n) => {
          if (euro.includes(n)) return;
          const sc = scoreEuro(n);
          if (sc > bestS) {
            bestS = sc;
            best = n;
          }
        });
        euro.push(best);
      }
      euro.sort((a, b) => a - b);
      return { main, euro };
    }

    let ticket = pickTicket();
    let tries = 0;
    while (usedKeys.has(ticket.main.join("-")) && tries < 28) {
      tries += 1;
      pickSalt = tries * 19;
      ticket = pickTicket();
    }
    if (usedKeys.has(ticket.main.join("-"))) {
      const taken = new Set(ticket.main);
      for (let n = 1; n <= 50 && usedKeys.has(ticket.main.join("-")); n++) {
        if (taken.has(n)) continue;
        const next = ticket.main.slice(0, 4).concat(n).sort((a, b) => a - b);
        if (!usedKeys.has(next.join("-"))) ticket.main = next;
      }
    }
    const main = ticket.main;
    const euro = ticket.euro;

    const skyLines = [
      `${moon.phase} (${fmt(moon.illum * 100, 0)} % beleuchtet, Mondalter ${fmt(moon.age, 1)} Tage) im Zeichen ${moon.sign.name}. Sonne in ${moon.sun.name}.`,
      `${fmt(sameSky.length)} frühere Ziehungen mit ähnlichem Mondstand (gleiches Zeichen oder ähnliche Beleuchtung). Häufigste Hauptzahlen dort: ${skyHistTop.join(", ") || "–"}.`,
    ];
    if (eclipseSoon) {
      skyLines.push("Kurz vor der tiefen partiellen Mondfinsternis am 27./28.08.2026 (rund 96 %) — Gewicht auf 27, 28, 8 und 12.");
    }
    skyLines.push(`Historische Finsternisse seit 2015: ${fmt(eclipseDraws.length)} Ziehungen im ±3-Tage-Fenster. Auffällige Zahlen: ${eclipseTop.join(", ") || "–"}.`);
    skyLines.push("Sommerhimmel: Sommerdreieck (Vega, Deneb, Altair) und Milchstraße in Schwan/Leier — Bindung an 3 und 8.");

    const pastWorld = histEventHits.slice(-8).map((e) => {
      const extra = e.overlap.length ? ` In nahen Ziehungen fielen Ankerzahlen ${e.overlap.join(", ")}.` : "";
      const sample = e.sample.length ? ` Beispiel: ${e.sample.join("; ")}.` : "";
      return `${e.title} — ${e.nearby} Ziehung(en) im Zeitfenster.${extra}${sample}`;
    });

    const facts = [
      `Nächste Ziehung wäre Ziehung Nr. ${ALL.length + 1} (${fmt(ALL.length + 1)}), ${weekday(iso)} ${fmtDate(iso)}. Ziffernanker: ${String(ALL.length + 1).split("").join(", ")}.`,
      `Letzte Ziehung ${describeDraw(last)}${consec.length ? ` — Folge ${consec.join(", ")}` : ""}. Diese Zahlen werden bewusst abgeschwächt.`,
      lastTue ? `Letzter Dienstag ${describeDraw(lastTue)}. Geht in die Vorhersage ein.` : "Noch keine Dienstagsziehung im Archiv.",
      lastFri ? `Letzter Freitag ${describeDraw(lastFri)}. Geht in die Vorhersage ein.` : "Noch keine Freitagsziehung im Archiv.",
      lastSameDay && lastSameDay.date !== last.date
        ? `Gleiche Wochentags-Ziehung zuletzt ${describeDraw(lastSameDay)}.`
        : `Die nächste Ziehung fällt auf ${weekday(iso)} — das Wochentagsmuster aus ${fmt(sameDay.length)} früheren ${weekday(iso)}-Ziehungen ist mitgewichtet.`,
      `Eröffnungsziehung 23.03.2012: ${first.main.join(" · ")} + ${first.euro.join(" · ")} bleibt als Ursprungsmuster im Mix.`,
      sameCal.length
        ? `Am ${iso.slice(8)}.${iso.slice(5, 7)}. gab es bisher ${fmt(sameCal.length)} Ziehungen. Häufigste Zahlen an diesem Kalendertag: ${calTop.join(", ") || "–"}.`
        : `Am ${fmtDate(iso)} gab es noch keine historische Ziehung mit gleichem Kalendertag.`,
      `Überfälligste Zahlen jetzt: ${overdueTop.map((s) => `${s.n} (${s.overdue} Ziehungen)`).join(", ")}.`,
      `Häufigste Zahlen im Filter: ${hotTop.map((s) => `${s.n} (${s.count}×)`).join(", ")}.`,
      `Ø ungerade ${fmt(stats.avgOdd, 2)} / 5, Ø niedrig (1–25) ${fmt(stats.avgLow, 2)} / 5, Ø Summe ${fmt(stats.avgSum, 1)}.`,
      `24.08. (Ukraine) und 24.02.2022 bilden denselben Tagesanker 24 — historisch ein wiederkehrendes Datum in der Weltlage seit 2022.`,
    ];

    const ki = [
      `Nächste Ziehung: ${weekday(iso)}, ${fmtDate(iso)} (nach ${fmtDate(last.date)})${variant ? ` · Variante ${variant + 1}` : ""}.`,
      `Letzte Dienstags- und Freitagsziehung sind Teil der Historie und werden bei der Auswahl abgeschwächt, damit sich die Kugeln nicht einfach wiederholen.`,
      `Fokus ${focusMeta.label}: das Modell gewichtet Historie, Himmel und Weltlage neu, ohne die Jackpot-Chance zu ändern.`,
      `Modell mischt ${fmt(stats.n)} Filter-Ziehungen, ${fmt(sameSky.length)} Mond-Zwillinge, ${fmt(eclipseDraws.length)} Finsternis-Fenster und ${fmt(HISTORY_EVENTS.length)} markante Welt-Daten.`,
      `Anker aus Himmel, Historie und Lage: ${[...skyNums, ...eventNums].filter((n, i, a) => a.indexOf(n) === i).slice(0, 12).join(", ")}.`,
      "Das ist die dichteste Synthese aus den vorhandenen Daten. Die Jackpot-Chance bleibt 1 zu 139.838.160.",
    ];

    return {
      main,
      euro,
      title: focus === "balance" ? "Vorhersage" : `KI · ${focusMeta.label}`,
      iso,
      variant,
      focus: focusMeta.id,
      focusLabel: focusMeta.label,
      moon,
      skyLines,
      events,
      pastWorld,
      facts,
      ki,
    };
  }

  function generate(kind, stats) {
    const mains = stats.mainStats.map((s) => s.n);
    const euros = stats.euroStats.map((s) => s.n);
    const byCount = [...stats.mainStats].sort((a, b) => b.count - a.count);
    const byOver = [...stats.mainStats].sort((a, b) => b.overdue - a.overdue);
    if (kind === "hot") {
      return { main: byCount.slice(0, 5).map((s) => s.n).sort((a, b) => a - b), euro: [...stats.euroStats].sort((a, b) => b.count - a.count).slice(0, 2).map((s) => s.n).sort((a, b) => a - b), title: "Häufigste Zahlen" };
    }
    if (kind === "cold") {
      return { main: [...stats.mainStats].sort((a, b) => a.count - b.count).slice(0, 5).map((s) => s.n).sort((a, b) => a - b), euro: [...stats.euroStats].sort((a, b) => a.count - b.count).slice(0, 2).map((s) => s.n).sort((a, b) => a - b), title: "Seltenste Zahlen" };
    }
    if (kind === "overdue") {
      return { main: byOver.slice(0, 5).map((s) => s.n).sort((a, b) => a - b), euro: [...stats.euroStats].sort((a, b) => b.overdue - a.overdue).slice(0, 2).map((s) => s.n).sort((a, b) => a - b), title: "Längst nicht gezogen" };
    }
    if (kind === "predict") return buildForecast(stats, state.forecastVariant);
    const rnd = mulberry32((Date.now() + Math.floor(Math.random() * 1e6)) % 1e9);
    if (kind === "random") {
      return { main: sampleWeighted(mains, () => 1, 5, rnd), euro: sampleWeighted(euros, () => 1, 2, rnd), title: "Gleichverteilter Zufall" };
    }
    return {
      main: sampleWeighted(mains, (n) => stats.mainStats[n - 1].count, 5, rnd),
      euro: sampleWeighted(euros, (n) => stats.euroStats[n - 1].count, 2, rnd),
      title: "Gewichtet nach Häufigkeit",
    };
  }

  function renderGen(stats) {
    const kinds = [
      ["hot", "Heiße Zahlen"],
      ["cold", "Kalte Zahlen"],
      ["overdue", "Überfällig"],
      ["weighted", "Häufigkeitsgewichtet"],
      ["random", "Reiner Zufall"],
    ];
    document.getElementById("tab-gen").innerHTML = `
      <article class="card">
        <h2>Tipps aus der Historie ableiten</h2>
        <p class="muted">Strategien ändern die Jackpot-Chance nicht. Sie sortieren Zahlen nur nach Häufigkeit oder Wartezeit. Reiner Zufall ist mathematisch gleichwertig. Die Vorhersage verdichtet Historie (inklusive letzter Dienstags- und Freitagsziehung), Sternenhimmel und Weltlage zu einem Tipp. KI Vorhersage erzeugt zwölf unabhängige Sichten. KI Tipp verdichtet diese Modelle zu einem einzelnen Konsens und rechnet die Wetter-Frequenzanalyse aus Helsinki (Lage, Temperatur, Wind, Wochentag, Monat) mit ein. Analyse bewertet eine Ziehung — zuletzt gezogene (Dienstag oder Freitag), manuell oder per Internet abgefragte Zahlen — nach Weltlage, Wetter, Himmel, Jahreszeit und Monatshäufigkeit. Das erklärt den Zufall nicht, es ordnet Auffälligkeiten.</p>
        <div class="actions">
          ${kinds.map(([id, label]) => `<button class="btn secondary gen-btn" data-kind="${id}">${label}</button>`).join("")}
        </div>
        <div class="actions predict-row">
          <button class="btn predict gen-btn" data-kind="predict">★ Vorhersage</button>
          <button class="btn ki gen-btn" data-kind="ki">✦ KI Vorhersage</button>
          <button class="btn kitip gen-btn" data-kind="kitip">◈ KI Tipp</button>
          <button class="btn analyse gen-btn" data-kind="analyse">◉ Analyse</button>
        </div>
        <div id="gen-out"></div>
      </article>
    `;
    if (state.genView === "analyse") paintAnalysis();
    else if (state.genView === "kitip" && state.kiTipLoading) paintKiTipLoading();
    else if (state.genView === "kitip" && state.kiTip) paintKiTip(state.kiTip);
    else if (state.genView === "ki" && state.kiPack) paintKiPack(state.kiPack);
    else if (state.forecast) paintForecast(state.forecast);
  }

  function paintForecast(f) {
    const out = document.getElementById("gen-out");
    if (!out) return;
    out.innerHTML = `
        <div class="forecast">
          <div class="forecast-hero">
            <p class="date">Vorhersage für ${weekday(f.iso)}, ${fmtDate(f.iso)}${f.variant ? ` · Variante ${f.variant + 1}` : ""}</p>
            <h3>Vorhersage aus Historie, Himmel und Weltlage</h3>
            <div class="forecast-balls">${ballsHtml(f.main)}<span class="plus">+</span>${ballsHtml(f.euro, true)}</div>
            <div class="actions" style="justify-content:center">
              <button class="btn secondary use-tip" data-main="${f.main.join(",")}" data-euro="${f.euro.join(",")}">Im Rechner öffnen</button>
            </div>
          </div>
          <article class="card reason">
            <h3>Sternenhimmel — aktuell und historisch</h3>
            <ul>${f.skyLines.map((l) => `<li>${l}</li>`).join("")}</ul>
          </article>
          <article class="card reason">
            <h3>Weltgeschehen — aktuell</h3>
            <ul>${f.events.map((e) => `<li>${e.title}${e.nums?.length ? ` — Anker: ${e.nums.filter((n) => n >= 1 && n <= 50).join(", ")}` : ""}</li>`).join("")}</ul>
          </article>
          <article class="card reason">
            <h3>Vergangene Weltlage und nahe Ziehungen</h3>
            <ul>${(f.pastWorld || []).map((l) => `<li>${l}</li>`).join("")}</ul>
          </article>
          <article class="card reason">
            <h3>Auffällige Zahlen, Daten und Fakten</h3>
            <ul>${(f.facts || []).map((l) => `<li>${l}</li>`).join("")}</ul>
          </article>
          <article class="card reason">
            <h3>KI-Synthese</h3>
            <ul>${f.ki.map((l) => `<li>${l}</li>`).join("")}</ul>
          </article>
        </div>
      `;
  }

  function escHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function kiPrintModel(color) {
    const stats = analyze(filtered());
    let pack = state.kiPack;
    if (!pack) pack = buildKiPack(stats, state.kiTipRound || 0);
    let tip = state.kiTip;
    if (!tip || tip.iso !== pack.iso || (tip.round || 0) !== (pack.round || 0)) {
      tip = assembleKiTip(pack, stats, pack.round || 0, getWxSignal(pack.iso));
    }
    return {
      iso: pack.iso,
      round: pack.round || 0,
      color: !!color,
      date: `${weekday(pack.iso)}, ${fmtDate(pack.iso)}`,
      tip: { main: tip.main, euro: tip.euro },
      tickets: pack.tickets.map((t, i) => ({
        idx: String(i + 1).padStart(2, "0"),
        focus: t.focusLabel,
        main: t.main,
        euro: t.euro,
      })),
    };
  }

  function kiNumsHtml(main, euro) {
    const ball = (n, isEuro) => `<span class="pball${isEuro ? " euro" : ""}">${escHtml(String(n).padStart(2, "0"))}</span>`;
    return `${main.map((n) => ball(n, false)).join("")}<span class="pplus">+</span>${euro.map((n) => ball(n, true)).join("")}`;
  }

  function kiForecastPrintHtml(model) {
    const tickets = model.tickets.map((t) => `
      <div class="prow">
        <span class="pidx">${t.idx}</span>
        <span class="pnums">${kiNumsHtml(t.main, t.euro)}</span>
        <span class="pfocus">${escHtml(t.focus)}</span>
      </div>`).join("");
    const fileTitle = `KI-Zahlen Eurojackpot ${fmtDate(model.iso)}`;
    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>${escHtml(fileTitle)}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #fff; color: #111; }
    body { font-family: system-ui, sans-serif; }
    .sheet { padding: 4px 0; }
    .eyebrow { margin: 0; letter-spacing: .14em; text-transform: uppercase; font-size: 11px; color: #8a6a10; }
    h1 { margin: 4px 0 2px; font-family: Georgia, serif; font-size: 24px; }
    .date { margin: 0 0 14px; font-size: 13px; color: #444; }
    h2 { margin: 0 0 8px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #8a6a10; }
    .tip {
      border: 2px solid #c49200; border-radius: 12px; padding: 10px 12px 12px; margin-bottom: 14px;
    }
    .prow, .phead {
      display: grid; grid-template-columns: 28px max-content minmax(0, 1fr); gap: 10px; align-items: center;
      padding: 6px 0; border-bottom: 1px solid #e6e0d2; break-inside: avoid;
    }
    .phead { border-bottom: 1px solid #cfc6b8; padding-bottom: 4px; margin-bottom: 2px; }
    .pidx { font-weight: 700; color: #2c4a6e; }
    .pfocus { font-size: 11px; color: #6a4e0b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pnums { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }
    .pcols { display: flex; gap: 4px; align-items: center; font-size: 9px; letter-spacing: .04em; color: #888; }
    .pcols span { width: 26px; text-align: center; }
    .pcols .wide { width: 14px; }
    .pball {
      width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; flex: 0 0 26px;
      font: 700 12px/1 system-ui, sans-serif; background: #d7e3ff; color: #111;
    }
    .pball.euro { background: #f0c01a; }
    .pplus { font-weight: 700; padding: 0 4px; color: #8a6a10; flex: 0 0 auto; }
    body.bw .eyebrow, body.bw h2, body.bw .pidx, body.bw .pfocus, body.bw .pplus, body.bw .date, body.bw .pcols { color: #111; }
    body.bw .tip { border-color: #111; }
    body.bw .prow, body.bw .phead { border-bottom-color: #bbb; }
    body.bw .pball { background: #fff; color: #111; border: 1.6px solid #111; }
    body.bw .pball.euro { background: #111; color: #fff; }
    @media print { .sheet { padding: 0; } }
  </style>
</head>
<body class="${model.color ? "color" : "bw"}">
  <div class="sheet">
    <p class="eyebrow">Eurojackpot</p>
    <h1>KI-Zahlen</h1>
    <p class="date">${escHtml(model.date)}</p>
    <div class="tip">
      <h2>KI-Tipp</h2>
      <div class="pnums">${kiNumsHtml(model.tip.main, model.tip.euro)}</div>
    </div>
    <h2>KI-Vorhersage</h2>
    <div class="phead">
      <span class="pidx">Nr</span>
      <span class="pcols"><span>01</span><span>02</span><span>03</span><span>04</span><span>05</span><span class="wide">+</span><span>E1</span><span>E2</span></span>
      <span class="pfocus">Schwerpunkt</span>
    </div>
    ${tickets}
  </div>
</body>
</html>`;
  }

  function pdfEscape(text) {
    const map = {
      Ä: "\\304", Ö: "\\326", Ü: "\\334", ä: "\\344", ö: "\\366", ü: "\\374", ß: "\\337",
      "€": "\\200", "–": "\\226", "—": "\\227", "„": "\\204", "“": "\\223", "”": "\\224",
      "‘": "\\221", "’": "\\222", "…": "\\205", "·": "\\267", "°": "\\260", "×": "\\327",
      "•": "\\225", "\u00a0": " ",
    };
    let out = "";
    for (const ch of String(text)) {
      if (ch === "\\") out += "\\\\";
      else if (ch === "(") out += "\\(";
      else if (ch === ")") out += "\\)";
      else if (ch === "\n" || ch === "\r") out += " ";
      else if (map[ch]) out += map[ch];
      else if (ch.charCodeAt(0) < 128) out += ch;
      else out += "?";
    }
    return out;
  }

  function buildKiForecastPdf(model) {
    const color = model.color;
    const theme = color
      ? {
        ink: "0.12 0.13 0.18",
        muted: "0.35 0.36 0.4",
        gold: "0.45 0.32 0.05",
        blue: "0.17 0.29 0.43",
        mainFill: "0.74 0.82 0.94",
        euroFill: "0.91 0.72 0.12",
        mainStroke: "0.45 0.55 0.72",
        euroStroke: "0.62 0.48 0.08",
        num: "0.1 0.12 0.16",
        euroNum: "0.1 0.12 0.16",
      }
      : {
        ink: "0 0 0",
        muted: "0.2 0.2 0.2",
        gold: "0 0 0",
        blue: "0 0 0",
        mainFill: "1 1 1",
        euroFill: "0.12 0.12 0.12",
        mainStroke: "0 0 0",
        euroStroke: "0 0 0",
        num: "0 0 0",
        euroNum: "1 1 1",
      };
    const pageW = 595;
    const pageH = 842;
    const ml = 42;
    const ops = [];
    let y = pageH - 40;

    const txt = (x, yy, str, size, font, col) => {
      ops.push(`${col} rg BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${yy.toFixed(1)} Tm (${pdfEscape(str)}) Tj ET`);
    };
    const circle = (cx, cy, r, fill, stroke) => {
      const k = 0.5522847498 * r;
      ops.push(`1 w ${fill} rg ${stroke} RG ${cx - r} ${cy} m ${cx - r} ${cy + k} ${cx - k} ${cy + r} ${cx} ${cy + r} c ${cx + k} ${cy + r} ${cx + r} ${cy + k} ${cx + r} ${cy} c ${cx + r} ${cy - k} ${cx + k} ${cy - r} ${cx} ${cy - r} c ${cx - k} ${cy - r} ${cx - r} ${cy - k} ${cx - r} ${cy} c b`);
    };
    const ball = (cx, cy, n, euro) => {
      ops.push("q");
      circle(cx, cy, 10, euro ? theme.euroFill : theme.mainFill, euro ? theme.euroStroke : theme.mainStroke);
      const label = String(n).padStart(2, "0");
      txt(cx - 5.6, cy - 3.2, label, 9, "F2", euro ? theme.euroNum : theme.num);
      ops.push("Q");
    };
    const numsX = ml + 32;
    const step = 26;
    const row = (cy, main, euro) => {
      let x = numsX;
      main.forEach((n) => { ball(x, cy, n, false); x += step; });
      txt(x - 6, cy - 3.4, "+", 11, "F2", theme.gold);
      x += 16;
      euro.forEach((n) => { ball(x, cy, n, true); x += step; });
      return x + 10;
    };
    const colHead = (cy) => {
      ["01", "02", "03", "04", "05"].forEach((label, i) => {
        txt(numsX + i * step - 6, cy, label, 7, "F1", theme.muted);
      });
      txt(numsX + 5 * step + 2, cy, "+", 7, "F1", theme.muted);
      txt(numsX + 5 * step + 16 - 6, cy, "E1", 7, "F1", theme.muted);
      txt(numsX + 6 * step + 16 - 6, cy, "E2", 7, "F1", theme.muted);
    };

    txt(ml, y, "EUROJACKPOT", 9, "F2", theme.gold);
    y -= 22;
    txt(ml, y, "KI-Zahlen", 22, "F3", theme.ink);
    y -= 16;
    txt(ml, y, model.date, 11, "F1", theme.muted);
    y -= 18;

    ops.push("q");
    ops.push(`${color ? "0.98 0.93 0.78" : "1 1 1"} rg ${theme.gold} RG 1.6 w ${ml} ${y - 40} 511 56 re B`);
    txt(ml + 10, y - 2, "KI-TIPP", 9, "F2", theme.gold);
    row(y - 24, model.tip.main, model.tip.euro);
    ops.push("Q");
    y -= 72;

    txt(ml, y, "KI-VORHERSAGE", 9, "F2", theme.gold);
    y -= 16;
    txt(ml, y, "Nr", 7, "F1", theme.muted);
    colHead(y);
    txt(numsX + 7 * step + 8, y, "Schwerpunkt", 7, "F1", theme.muted);
    y -= 18;
    model.tickets.forEach((t) => {
      txt(ml, y - 3, t.idx, 10, "F2", theme.blue);
      const after = row(y, t.main, t.euro);
      txt(after, y - 3, t.focus, 8, "F1", theme.gold);
      y -= 28;
    });

    const content = ops.join("\n");
    const objects = [];
    const add = (body) => {
      objects.push(body);
      return objects.length;
    };
    const catalogId = add("");
    const pagesId = add("");
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const f3 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>");
    const stream = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    const contentId = add(stream);
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects[pagesId - 1] = `<< /Type /Pages /Count 1 /Kids [${pageId} 0 R] >>`;
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

    let out = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i++) {
      out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }

  function downloadKiForecastPdf(model) {
    const bytes = buildKiForecastPdf(model);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const tone = model.color ? "Farbe" : "SW";
    const name = `KI-Zahlen-Eurojackpot-${fmtDate(model.iso).replace(/\./g, "-")}-${tone}.pdf`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return url;
  }

  function closeKiPrintAsk() {
    const box = document.getElementById("ki-print-ask");
    if (box) box.hidden = true;
  }

  function openKiPrintAsk() {
    if (!state.kiPack && !state.kiTip) return;
    const box = document.getElementById("ki-print-ask");
    if (box) box.hidden = false;
  }

  function openKiForecastPrint(color) {
    closeKiPrintAsk();
    const model = kiPrintModel(color);
    const pdfUrl = downloadKiForecastPdf(model);
    const preview = window.open(pdfUrl, "_blank", "noopener");
    if (preview) {
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 120000);
      return;
    }
    const html = kiForecastPrintHtml(model);
    let frame = document.getElementById("ki-print-frame");
    if (!frame) {
      frame = document.createElement("iframe");
      frame.id = "ki-print-frame";
      frame.title = "KI-Zahlen drucken";
      document.body.appendChild(frame);
    }
    frame.onload = () => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch {
        /* PDF liegt bereits im Download-Ordner */
      }
    };
    frame.srcdoc = html;
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 120000);
  }

  function paintKiPack(pack) {
    const out = document.getElementById("gen-out");
    if (!out || !pack) return;
    const f = pack.tickets[0];
    out.innerHTML = `
        <div class="forecast">
          <div class="forecast-hero">
            <p class="date">KI Vorhersage für ${weekday(pack.iso)}, ${fmtDate(pack.iso)}${pack.round ? ` · Runde ${pack.round + 1}` : ""}</p>
            <h3>Zwölf KI-Sichten auf die nächste Ziehung</h3>
            <p class="muted">Jede Zeile nutzt einen anderen Schwerpunkt (Himmel, Weltlage, Historie, Überfälligkeit …). Die Jackpot-Chance bleibt bei jedem Tipp 1 zu 139.838.160.</p>
            <div class="actions" style="justify-content:center">
              <button type="button" class="btn secondary" id="ki-pdf">Als PDF drucken</button>
            </div>
          </div>
          <div class="ki-list">
            ${pack.tickets.map((t, i) => `
              <div class="ticket ki-ticket">
                <span class="idx">${String(i + 1).padStart(2, "0")}</span>
                <span class="focus">${t.focusLabel}</span>
                ${ballsHtml(t.main)}<span class="plus">+</span>${ballsHtml(t.euro, true)}
                <button class="btn secondary use-tip" data-main="${t.main.join(",")}" data-euro="${t.euro.join(",")}">Im Rechner öffnen</button>
              </div>
            `).join("")}
          </div>
          <article class="card reason">
            <h3>Sternenhimmel — aktuell und historisch</h3>
            <ul>${f.skyLines.map((l) => `<li>${l}</li>`).join("")}</ul>
          </article>
          <article class="card reason">
            <h3>Weltgeschehen — aktuell</h3>
            <ul>${f.events.map((e) => `<li>${e.title}${e.nums?.length ? ` — Anker: ${e.nums.filter((n) => n >= 1 && n <= 50).join(", ")}` : ""}</li>`).join("")}</ul>
          </article>
          <article class="card reason">
            <h3>Vergangene Weltlage und nahe Ziehungen</h3>
            <ul>${(f.pastWorld || []).map((l) => `<li>${l}</li>`).join("")}</ul>
          </article>
          <article class="card reason">
            <h3>Auffällige Zahlen, Daten und Fakten</h3>
            <ul>${(f.facts || []).map((l) => `<li>${l}</li>`).join("")}</ul>
          </article>
          <article class="card reason">
            <h3>KI-Synthese</h3>
            <ul>
              <li>${fmt(pack.tickets.length)} unabhängige Vorhersagen für ${weekday(pack.iso)}, ${fmtDate(pack.iso)}.</li>
              <li>Schwerpunkte: ${pack.tickets.map((t) => t.focusLabel).join(" · ")}.</li>
              <li>Keine der zwölf Kombinationen ändert die mathematische Chance. Das ist Synthese, kein Gewinnversprechen.</li>
            </ul>
          </article>
        </div>
      `;
  }

  function buildKiPack(stats, round = 0) {
    const tickets = [];
    KI_FOCUSES.forEach((focus, i) => {
      let f = buildForecast(stats, round * 12 + i, { used: tickets, focus: focus.id });
      tickets.push({
        main: f.main,
        euro: f.euro,
        iso: f.iso,
        focus: focus.id,
        focusLabel: focus.label,
        skyLines: f.skyLines,
        events: f.events,
        pastWorld: f.pastWorld,
        facts: f.facts,
      });
    });
    return {
      iso: tickets[0].iso,
      round,
      tickets,
    };
  }

  function applyKiPack(stats, round) {
    state.kiRound = round;
    state.kiPack = buildKiPack(stats, round);
    state.genView = "ki";
    closeForecastAsk();
    paintKiPack(state.kiPack);
  }

  function assembleKiTip(pack, stats, round, signal) {
    const last = ALL[ALL.length - 1];
    const lastTue = lastDrawOfWeekday(2);
    const lastFri = lastDrawOfWeekday(5);
    const recentMain = new Set([...(last?.main || []), ...(lastTue?.main || []), ...(lastFri?.main || [])]);
    const recentEuro = new Set([...(last?.euro || []), ...(lastTue?.euro || []), ...(lastFri?.euro || [])]);
    const voteMain = Array(51).fill(0);
    const voteEuro = Array(13).fill(0);
    pack.tickets.forEach((t) => {
      t.main.forEach((n) => { voteMain[n] += 1; });
      t.euro.forEach((n) => { voteEuro[n] += 1; });
    });
    const models = pack.tickets.length;
    const draws = filtered();
    const wxSig = signal || getWxSignal(pack.iso);
    const pairBoost = (a, b) => {
      let c = 0;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      draws.forEach((d) => {
        if (d.main.includes(lo) && d.main.includes(hi)) c += 1;
      });
      return c;
    };

    const main = [];
    const pool = stats.mainStats.map((s) => s.n);
    while (main.length < 5) {
      let best = null;
      let bestS = -1e9;
      pool.forEach((n) => {
        if (main.includes(n)) return;
        const s = stats.mainStats[n - 1];
        const z = (s.count - s.expected) / Math.sqrt(Math.max(s.expected, 1));
        const typical = Math.exp(-(z * z) / 2.4);
        const due = Math.exp(-((s.overdue / 10 - 1.15) ** 2) / 0.85);
        let pair = 0;
        main.forEach((p) => { pair += pairBoost(n, p); });
        pair = main.length ? pair / main.length : 0;
        let sc = 3.6 * (voteMain[n] / models) + 0.5 * typical + 0.32 * due + 0.08 * pair
          + 1.25 * (wxSig.main[n] || 0)
          - (last.main.includes(n) ? 0.5 : recentMain.has(n) ? 0.22 : 0)
          + ((n * 19 + round * 47) % 40) / 900;
        const nextOdd = main.filter((x) => x % 2).length + (n % 2);
        const nextLow = main.filter((x) => x <= 25).length + (n <= 25 ? 1 : 0);
        const remain = 4 - main.length;
        if (nextOdd > 4 || (nextOdd === 0 && remain === 0)) sc -= 0.4;
        if (Math.abs((nextOdd + remain * 0.5) - stats.avgOdd) > 1.6) sc -= 0.22;
        if (Math.abs((nextLow + remain * 0.5) - stats.avgLow) > 1.6) sc -= 0.22;
        const sum = main.reduce((a, b) => a + b, 0) + n;
        if (main.length === 4 && Math.abs(sum - stats.avgSum) > 38) sc -= 0.5;
        if (sc > bestS) {
          bestS = sc;
          best = n;
        }
      });
      main.push(best);
    }
    main.sort((a, b) => a - b);

    const euro = [];
    const ePool = stats.euroStats.map((s) => s.n);
    while (euro.length < 2) {
      let best = null;
      let bestS = -1e9;
      ePool.forEach((n) => {
        if (euro.includes(n)) return;
        const s = stats.euroStats[n - 1];
        const z = (s.count - s.expected) / Math.sqrt(Math.max(s.expected, 1));
        const typical = Math.exp(-(z * z) / 2.2);
        const due = Math.exp(-((s.overdue / 6 - 1.1) ** 2) / 0.9);
        const sc = 3.6 * (voteEuro[n] / models) + 0.5 * typical + 0.32 * due
          + 1.05 * (wxSig.euro[n] || 0)
          - (last.euro.includes(n) ? 0.4 : recentEuro.has(n) ? 0.18 : 0)
          + ((n * 23 + round * 41) % 30) / 400;
        if (sc > bestS) {
          bestS = sc;
          best = n;
        }
      });
      euro.push(best);
    }
    euro.sort((a, b) => a - b);

    const voters = (n, kind) => pack.tickets.filter((t) => t[kind].includes(n)).map((t) => t.focusLabel);
    const voteLine = (n, kind, max) => {
      const v = kind === "main" ? voteMain[n] : voteEuro[n];
      const names = voters(n, kind);
      return `${n} — ${v} von ${max} Modellen${names.length ? ` (${names.join(", ")})` : ""}`;
    };
    const wxLine = (n, kind) => {
      const sc = kind === "main" ? (wxSig.main[n] || 0) : (wxSig.euro[n] || 0);
      const z = kind === "main" ? wxSig.zs[n] : null;
      if (!wxSig.ready || sc < 0.08) return `${n} — Wetterlage unauffällig im Prognosefenster.`;
      return `${n} — Wetter-Frequenzscore ${fmt(sc, 2)}${z != null && Math.abs(z) >= 0.8 ? ` (Lage z = ${fmt(z, 1)})` : ""}.`;
    };
    const nearMain = [...Array(50).keys()].map((i) => i + 1)
      .filter((n) => !main.includes(n) && voteMain[n] > 0)
      .sort((a, b) => voteMain[b] - voteMain[a] || a - b)
      .slice(0, 5);
    const overlap = pack.tickets.map((t) => ({
      label: t.focusLabel,
      hit: t.main.filter((n) => main.includes(n)).length,
    })).sort((a, b) => b.hit - a.hit);
    const f = pack.tickets[0];
    const wxHits = main.filter((n) => (wxSig.main[n] || 0) >= 0.22);
    const ki = [
      `Nächste Ziehung: ${weekday(pack.iso)}, ${fmtDate(pack.iso)}. Dieser eine Tipp ist die Konsens-Berechnung aus ${models} KI-Schwerpunkten plus der Wetter-Frequenzanalyse (Helsinki).`,
      lastTue && lastFri
        ? `Letzter Dienstag ${fmtDate(lastTue.date)} und letzter Freitag ${fmtDate(lastFri.date)} fließen in den Konsens ein.`
        : `Die letzte Ziehung ${fmtDate(last.date)} fließt in den Konsens ein.`,
      "Jedes Modell bewertet Himmel, Historie, Weltlage, Überfälligkeit, Paare und Kalender anders. Der KI-Tipp nimmt die Zahlen mit der höchsten Übereinstimmung, legt die Wetter-Häufungen aus gleichen Lagen/Temperaturen/Winden darüber und justiert Summe, Gerade/Ungerade und Paare nach.",
      wxSig.ready
        ? `Wetterschicht aktiv${wxHits.length ? ` — zieht ${wxHits.join(", ")} zusätzlich an` : " — keine Zahl mit starker Wetter-Häufung im Tipp"}.`
        : "Wetterschicht ohne Archiv/Prognose, Konsens nur aus den zwölf Modellen.",
      `Stärkste Modell-Überlappung: ${overlap.slice(0, 3).map((o) => `${o.label} (${o.hit}/5)`).join(" · ")}.`,
      "Das ist die bestmögliche Berechnung aus den vorhandenen Modellen und der Wetterhistorie. Die Jackpot-Chance bleibt 1 zu 139.838.160.",
    ];
    return {
      main,
      euro,
      iso: pack.iso,
      round,
      skyLines: f.skyLines,
      events: f.events,
      pastWorld: f.pastWorld,
      facts: f.facts,
      wxLines: wxSig.lines || [],
      wxNotes: main.map((n) => wxLine(n, "main")),
      wxEuroNotes: euro.map((n) => wxLine(n, "euro")),
      ki,
      mainVotes: main.map((n) => voteLine(n, "main", models)),
      euroVotes: euro.map((n) => voteLine(n, "euro", models)),
      nearVotes: nearMain.map((n) => voteLine(n, "main", models)),
      voteMain,
      voteEuro,
      models,
    };
  }

  function paintKiTip(tip) {
    const out = document.getElementById("gen-out");
    if (!out || !tip) return;
    out.innerHTML = `
        <div class="forecast">
          <div class="forecast-hero">
            <p class="date">KI Tipp für ${weekday(tip.iso)}, ${fmtDate(tip.iso)}${tip.round ? ` · Variante ${tip.round + 1}` : ""}</p>
            <h3>Bestmögliche KI-Berechnung — ein Konsens-Tipp</h3>
            <p class="muted">Verdichtung von ${tip.models} KI-Modellen und der Wetter-Frequenzanalyse (Helsinki: Lage, Temperatur, Wind, Tag, Monat) zu einem Tipp. Die Jackpot-Chance bleibt 1 zu 139.838.160.</p>
            <div class="forecast-balls">${ballsHtml(tip.main)}<span class="plus">+</span>${ballsHtml(tip.euro, true)}</div>
            <div class="actions" style="justify-content:center">
              <button class="btn secondary use-tip" data-main="${tip.main.join(",")}" data-euro="${tip.euro.join(",")}">Im Rechner öffnen</button>
              <button type="button" class="btn secondary" id="ki-pdf">Als PDF drucken</button>
            </div>
          </div>
          <article class="card reason">
            <h3>Modellstimmen der gewählten Zahlen</h3>
            <ul>${tip.mainVotes.map((l) => `<li>${l}</li>`).join("")}</ul>
            <p class="muted" style="margin:10px 0 6px">Eurozahlen</p>
            <ul>${tip.euroVotes.map((l) => `<li>${l}</li>`).join("")}</ul>
            ${tip.nearVotes.length ? `<p class="muted" style="margin:10px 0 6px">Knapp daneben (nicht im Tipp)</p><ul>${tip.nearVotes.map((l) => `<li>${l}</li>`).join("")}</ul>` : ""}
          </article>
          <article class="card reason">
            <h3>Wetter Helsinki × Historie</h3>
            <ul>${(tip.wxLines || []).map((l) => `<li>${l}</li>`).join("")}</ul>
            ${tip.wxNotes?.length ? `<p class="muted" style="margin:10px 0 6px">Wetterscore der Tippzahlen</p><ul>${tip.wxNotes.map((l) => `<li>${l}</li>`).join("")}</ul>` : ""}
            ${tip.wxEuroNotes?.length ? `<p class="muted" style="margin:10px 0 6px">Eurozahlen</p><ul>${tip.wxEuroNotes.map((l) => `<li>${l}</li>`).join("")}</ul>` : ""}
          </article>
          <article class="card reason">
            <h3>Sternenhimmel — aktuell und historisch</h3>
            <ul>${tip.skyLines.map((l) => `<li>${l}</li>`).join("")}</ul>
          </article>
          <article class="card reason">
            <h3>Weltgeschehen — aktuell</h3>
            <ul>${tip.events.map((e) => `<li>${e.title}${e.nums?.length ? ` — Anker: ${e.nums.filter((n) => n >= 1 && n <= 50).join(", ")}` : ""}</li>`).join("")}</ul>
          </article>
          <article class="card reason">
            <h3>Vergangene Weltlage und nahe Ziehungen</h3>
            <ul>${(tip.pastWorld || []).map((l) => `<li>${l}</li>`).join("")}</ul>
          </article>
          <article class="card reason">
            <h3>Auffällige Zahlen, Daten und Fakten</h3>
            <ul>${(tip.facts || []).map((l) => `<li>${l}</li>`).join("")}</ul>
          </article>
          <article class="card reason">
            <h3>KI-Synthese</h3>
            <ul>${tip.ki.map((l) => `<li>${l}</li>`).join("")}</ul>
          </article>
        </div>
      `;
  }

  function paintKiTipLoading() {
    const out = document.getElementById("gen-out");
    if (!out) return;
    out.innerHTML = `<article class="card"><p class="muted">KI Tipp lädt das Helsinki-Wetterarchiv und die Prognose für den Ziehungsabend, dann fließt die Frequenzanalyse (Lage, Temperatur, Wind, Wochentag, Monat) in den Konsens ein …</p></article>`;
  }

  async function applyKiTip(stats, round) {
    if (state.kiTipBusy) return;
    state.kiTipBusy = true;
    state.kiTipLoading = true;
    state.genView = "kitip";
    closeForecastAsk();
    paintKiTipLoading();
    try {
      await ensureWeather();
      const pack = (state.kiPack && state.kiPack.round === round)
        ? state.kiPack
        : buildKiPack(stats, round);
      if (!state.kiPack || state.kiPack.round !== round) state.kiPack = pack;
      let dayWx = wx.byDate[pack.iso] || null;
      if (!dayWx || (dayWx.temp == null && dayWx.code == null)) {
        try {
          const w = await fetchWeather(pack.iso);
          dayWx = { temp: w.temp, rain: w.rain, code: w.code, wind: w.wind };
          wx.byDate[pack.iso] = dayWx;
          persistWeather();
        } catch (_) {
          dayWx = null;
        }
      }
      const signal = buildWxSignal(pack.iso, dayWx);
      state.wxSignal = signal;
      state.kiTipRound = round;
      state.kiTip = assembleKiTip(pack, stats, round, signal);
      state.kiTipLoading = false;
      paintKiTip(state.kiTip);
    } catch (err) {
      state.kiTipLoading = false;
      const out = document.getElementById("gen-out");
      if (out) {
        out.innerHTML = `<article class="card"><p class="muted">KI Tipp fehlgeschlagen (${err.message || err.name}).</p></article>`;
      }
    } finally {
      state.kiTipBusy = false;
    }
  }

  function parseTipNums(text, count, max) {
    const nums = [...new Set(
      String(text || "").split(/[\s,;.+]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= max)
    )].sort((a, b) => a - b);
    return nums.slice(0, count);
  }

  function seasonOf(iso) {
    const m = Number(iso.slice(5, 7));
    if (m >= 3 && m <= 5) return { id: "spring", label: "Frühling", months: ["03", "04", "05"] };
    if (m >= 6 && m <= 8) return { id: "summer", label: "Sommer", months: ["06", "07", "08"] };
    if (m >= 9 && m <= 11) return { id: "autumn", label: "Herbst", months: ["09", "10", "11"] };
    return { id: "winter", label: "Winter", months: ["12", "01", "02"] };
  }

  function weatherLabel(code) {
    if (code == null || Number.isNaN(code)) return "unbekannt";
    if (code === 0) return "klar";
    if (code <= 3) return "bewölkt";
    if (code <= 48) return "Nebel";
    if (code <= 57) return "Niesel";
    if (code <= 67) return "Regen";
    if (code <= 77) return "Schnee";
    if (code <= 82) return "Regenschauer";
    if (code <= 86) return "Schneeschauer";
    return "Gewitter";
  }

  function clip01(x) {
    return Math.max(0, Math.min(1, x));
  }

  function readAnalyseDraft() {
    const dateEl = document.getElementById("analyse-date");
    const mainEl = document.getElementById("analyse-main");
    const euroEl = document.getElementById("analyse-euro");
    if (!state.analysisDraft) state.analysisDraft = {};
    if (dateEl) state.analysisDraft.iso = dateEl.value;
    if (mainEl) state.analysisDraft.main = mainEl.value;
    if (euroEl) state.analysisDraft.euro = euroEl.value;
    return state.analysisDraft;
  }

  function lastArchiveDraw() {
    return ALL[ALL.length - 1];
  }

  function extractOfficialDraw(payload) {
    const iso = (payload.head || {}).datum;
    const ziehungen = (((payload.zahlen || {}).hauptlotterie || {}).ziehungen) || [];
    let main = [];
    let euro = [];
    ziehungen.forEach((draw) => {
      const name = draw.bezeichnung || "";
      const nums = (draw.zahlenSortiert || []).map(Number).filter((n) => Number.isFinite(n));
      if (name.includes("5") && name.includes("50")) main = [...nums].sort((a, b) => a - b);
      else if (/^2 aus/.test(name) || name.includes("Euro")) euro = [...nums].sort((a, b) => a - b);
    });
    if (!iso || main.length !== 5 || euro.length !== 2) throw new Error("Antwort ohne vollständige Ziehung");
    return { date: iso, main, euro, euroMax: euroMaxFor(iso) };
  }

  function officialUrl(iso) {
    const q = iso ? `&datum=${iso}` : "";
    return `https://www.eurojackpot.com/wlinfo/WL_InfoService?client=jsn&gruppe=ZahlenUndQuoten&historie=ja&spielart=EJ&lang=de${q}`;
  }

  async function fetchJson(url, ms = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  async function fetchOfficialPayload(iso) {
    const direct = officialUrl(iso);
    try {
      return await fetchJson(direct);
    } catch (err) {
      const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(direct)}`;
      try {
        return await fetchJson(proxy, 12000);
      } catch {
        throw err;
      }
    }
  }

  async function fetchOfficialDraw(iso) {
    return extractOfficialDraw(await fetchOfficialPayload(iso));
  }

  function setLiveStatus() {
    const el = document.getElementById("live-status");
    const stamp = document.getElementById("data-stamp");
    const last = lastArchiveDraw();
    const tue = lastDrawOfWeekday(2);
    const fri = lastDrawOfWeekday(5);
    const bits = [];
    if (last) bits.push(`letzte Ziehung ${fmtDate(last.date)} (${weekday(last.date)})`);
    bits.push(`${fmt(ALL.length)} Ziehungen gesamt`);
    if (tue) bits.push(`Di ${fmtDate(tue.date)}`);
    if (fri) bits.push(`Fr ${fmtDate(fri.date)}`);
    let liveText = "Eurojackpot";
    let liveClass = "";
    if (live.status === "updating") {
      liveText = "Aktualisiere Dienstags- und Freitagsziehungen …";
      liveClass = "is-wait";
      bits.push("aktualisiere …");
    } else if (live.status === "ok") {
      liveText = live.added
        ? `Aktuell · ${live.added} neue Ziehung${live.added === 1 ? "" : "en"} (Di/Fr)`
        : "Aktuell · WestLotto, Dienstag und Freitag";
      liveClass = "is-live";
      bits.push(live.added ? `${live.added} neu geladen` : "aktuell");
    } else if (live.status === "local") {
      liveText = live.error
        ? `Gespeicherte Nachzüge · ${live.error}`
        : "Gespeicherte Nachzüge · Internet-Abfrage später erneut";
      liveClass = "is-err";
      bits.push("lokal gespeichert");
    } else {
      liveText = live.error
        ? `Archivstand · Update fehlgeschlagen (${live.error})`
        : "Archivstand · Update fehlgeschlagen";
      liveClass = "is-err";
      bits.push("Update fehlgeschlagen");
    }
    if (el) {
      el.textContent = liveText;
      el.className = `live-status ${liveClass}`;
    }
    if (stamp) stamp.textContent = bits.join(" · ");
  }

  async function refreshDrawsOnStart() {
    live.status = "updating";
    setLiveStatus();
    let added = 0;
    try {
      const payload = await fetchOfficialPayload();
      const latest = extractOfficialDraw(payload);
      if (ingestDraw(latest)) added += 1;
      const next = payload.head?.folgeZiehung?.datum;
      if (typeof next === "string" && next) live.nextDraw = next;
      live.status = "ok";
      live.source = "Internet · WestLotto / Eurojackpot";
      persistLiveDraws();
      const known = new Set(ALL.map((d) => d.date));
      const hist = Array.isArray(payload.history?.tage) ? payload.history.tage : [];
      const fromIso = bundledLast || ALL[ALL.length - 1]?.date || toIso(todayNoon());
      const want = new Set([
        ...hist.filter((iso) => typeof iso === "string" && iso > bundledLast),
        ...expectedDrawDates(fromIso, toIso(todayNoon())),
      ]);
      const missing = [...want].filter((iso) => iso && iso !== latest.date && !known.has(iso)).sort();
      for (const iso of missing) {
        try {
          const draw = await fetchOfficialDraw(iso);
          if (ingestDraw(draw)) added += 1;
        } catch { /* einzelne Termine können fehlen */ }
      }
      live.added = added;
      persistLiveDraws();
      if (!state.analysis && state.analysisDraft && /letzte Ziehung|Dienstag\/Freitag/.test(state.analysisDraft.source || "")) {
        const last = lastArchiveDraw();
        state.analysisDraft = {
          iso: last.date,
          main: last.main.join(" "),
          euro: last.euro.join(" "),
          source: "Aktuelle Ziehung · Dienstag/Freitag",
          note: `Aktualisiert: ${fmtDate(last.date)} (${weekday(last.date)}).`,
        };
      }
    } catch (err) {
      live.error = err.message || err.name || String(err);
      if (added > 0 || ALL.some((d) => d.date > bundledLast)) {
        live.status = added > 0 ? "ok" : "local";
        live.added = added;
        persistLiveDraws();
      } else {
        live.status = "error";
      }
    }
    setLiveStatus();
    render();
  }

  function readWeatherStore() {
    try {
      const o = JSON.parse(localStorage.getItem(WEATHER_STORE) || "null");
      return o?.byDate && typeof o.byDate === "object" ? o.byDate : {};
    } catch {
      return {};
    }
  }

  function persistWeather() {
    try {
      localStorage.setItem(WEATHER_STORE, JSON.stringify({
        v: 1,
        from: ALL[0]?.date,
        to: ALL[ALL.length - 1]?.date,
        byDate: wx.byDate,
      }));
    } catch (_) { /* quota */ }
  }

  function missingWeatherDates(byDate) {
    return ALL.filter((d) => {
      const w = byDate[d.date];
      return !w || (w.temp == null && w.code == null);
    }).map((d) => d.date);
  }

  async function fetchWxChunk(from, to) {
    const qs = `latitude=60.1699&longitude=24.9384&start_date=${from}&end_date=${to}&daily=temperature_2m_mean,precipitation_sum,weather_code,wind_speed_10m_max&timezone=Europe/Helsinki`;
    const urls = [
      `https://archive-api.open-meteo.com/v1/archive?${qs}`,
      `https://api.open-meteo.com/v1/forecast?${qs}`,
    ];
    let lastErr = null;
    for (const url of urls) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        const d = j.daily || {};
        const dates = d.time || [];
        const out = {};
        dates.forEach((iso, i) => {
          out[iso] = {
            temp: d.temperature_2m_mean?.[i],
            rain: d.precipitation_sum?.[i],
            code: d.weather_code?.[i],
            wind: d.wind_speed_10m_max?.[i],
          };
        });
        if (!dates.length) throw new Error("keine Tageswerte");
        return out;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Wetter nicht erreichbar");
  }

  async function loadHelsinkiWeather() {
    const byDate = { ...readWeatherStore(), ...wx.byDate };
    let missing = missingWeatherDates(byDate);
    if (!missing.length) {
      wx.byDate = byDate;
      return;
    }
    const from = missing[0];
    const to = missing[missing.length - 1];
    const y0 = Number(from.slice(0, 4));
    const y1 = Number(to.slice(0, 4));
    const want = new Set(missing);
    try {
      const part = await fetchWxChunk(from, to);
      Object.keys(part).forEach((iso) => {
        if (want.has(iso)) byDate[iso] = part[iso];
      });
    } catch (_) {
      for (let y = y0; y <= y1; y += 3) {
        const a = y === y0 ? from : `${y}-01-01`;
        const endY = Math.min(y + 2, y1);
        const b = endY === y1 ? to : `${endY}-12-31`;
        try {
          const part = await fetchWxChunk(a, b);
          Object.keys(part).forEach((iso) => {
            if (want.has(iso)) byDate[iso] = part[iso];
          });
        } catch (_) { /* try remaining years */ }
      }
    }
    wx.byDate = byDate;
    missing = missingWeatherDates(byDate);
    persistWeather();
    if (missing.length > ALL.length * 0.5) {
      throw new Error(`nur ${ALL.length - missing.length} von ${ALL.length} Tagen`);
    }
  }

  function ensureWeather() {
    if (wx.status === "ready") return Promise.resolve();
    if (wx.pending) return wx.pending;
    const cached = { ...readWeatherStore(), ...wx.byDate };
    if (!missingWeatherDates(cached).length) {
      wx.byDate = cached;
      wx.status = "ready";
      wx.error = null;
      return Promise.resolve();
    }
    wx.status = "loading";
    wx.pending = loadHelsinkiWeather()
      .then(() => {
        wx.status = "ready";
        wx.error = null;
        if (state.tab === "freq") paintWx();
      })
      .catch((err) => {
        const have = Object.keys(wx.byDate || {}).length;
        if (have > 40) {
          wx.status = "ready";
          wx.error = null;
        } else {
          wx.status = "error";
          wx.error = err.message || err.name || String(err);
        }
        if (state.tab === "freq") paintWx();
      })
      .finally(() => { wx.pending = null; });
    return wx.pending;
  }

  async function fetchWeather(iso) {
    const qs = `latitude=60.1699&longitude=24.9384&start_date=${iso}&end_date=${iso}&daily=temperature_2m_mean,precipitation_sum,weather_code,wind_speed_10m_max&timezone=Europe/Helsinki`;
    const urls = [
      `https://archive-api.open-meteo.com/v1/archive?${qs}`,
      `https://api.open-meteo.com/v1/forecast?${qs}`,
    ];
    let lastErr = null;
    for (const url of urls) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        const d = j.daily || {};
        const temp = d.temperature_2m_mean?.[0];
        const rain = d.precipitation_sum?.[0];
        const code = d.weather_code?.[0];
        const wind = d.wind_speed_10m_max?.[0];
        if (temp == null && rain == null && code == null) throw new Error("keine Tageswerte");
        return { temp, rain, code, wind, place: "Helsinki (Ziehungsort)" };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Wetter nicht erreichbar");
  }

  function svgBarChart(rows, unit) {
    const w = 640;
    const h = 230;
    const pad = { l: 36, r: 12, t: 18, b: 38 };
    const max = Math.max(1, ...rows.map((r) => Math.max(r.value, r.expected || 0)));
    const inner = w - pad.l - pad.r;
    const bw = inner / rows.length;
    const y = (v) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
    const bars = rows.map((r, i) => {
      const x = pad.l + i * bw + bw * 0.18;
      const width = bw * 0.44;
      const bh = h - pad.b - y(r.value);
      const expY = y(r.expected || 0);
      const exp = r.expected != null
        ? `<line x1="${x - 4}" x2="${x + width + 4}" y1="${expY}" y2="${expY}" stroke="#e8c547" stroke-width="2" stroke-dasharray="4 3"/>`
        : "";
      return `<g>
        <rect x="${x}" y="${y(r.value)}" width="${width}" height="${Math.max(0, bh)}" rx="5" fill="#8b6cff"/>
        ${exp}
        <text x="${x + width / 2}" y="${h - 14}" text-anchor="middle" fill="#c9d4ee" font-size="12">${r.label}</text>
        <text x="${x + width / 2}" y="${y(r.value) - 6}" text-anchor="middle" fill="#eef2ff" font-size="11">${fmt(r.value, r.value % 1 ? 1 : 0)}</text>
      </g>`;
    }).join("");
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">
      <text x="${pad.l}" y="14" fill="#93a0bf" font-size="11">${unit}</text>
      ${bars}
      <text x="${w - 8}" y="14" text-anchor="end" fill="#e8c547" font-size="11">gestrichelt = Erwartung</text>
    </svg>`;
  }

  function svgRadar(axes) {
    const cx = 150;
    const cy = 138;
    const r = 92;
    const n = axes.length;
    const pt = (i, scale) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return [cx + r * scale * Math.cos(ang), cy + r * scale * Math.sin(ang)];
    };
    const rings = [0.33, 0.66, 1].map((s) => {
      const d = axes.map((_, i) => pt(i, s).join(",")).join(" ");
      return `<polygon points="${d}" fill="none" stroke="rgba(255,255,255,0.12)"/>`;
    }).join("");
    const poly = axes.map((a, i) => pt(i, clip01(a.value)).join(",")).join(" ");
    const spokes = axes.map((a, i) => {
      const [x, y] = pt(i, 1);
      const [lx, ly] = pt(i, 1.22);
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(255,255,255,0.12)"/>
        <text x="${lx}" y="${ly + 4}" text-anchor="middle" fill="#c9d4ee" font-size="11">${a.label}</text>`;
    }).join("");
    return `<svg class="chart" viewBox="0 0 300 280" role="img">
      ${rings}${spokes}
      <polygon points="${poly}" fill="rgba(110,231,183,0.28)" stroke="#6ee7b7" stroke-width="2"/>
    </svg>`;
  }

  function buildAnalysis(iso, main, euro, meta) {
    const target = new Date(`${iso}T12:00:00`);
    const moon = moonInfo(target);
    const season = seasonOf(iso);
    const monthKey = iso.slice(5, 7);
    const monthDraws = ALL.filter((d) => d.date.slice(5, 7) === monthKey);
    const seasonDraws = ALL.filter((d) => season.months.includes(d.date.slice(5, 7)));
    const weekdayIdx = target.getDay();
    const dayDraws = ALL.filter((d) => new Date(`${d.date}T12:00:00`).getDay() === weekdayIdx);
    const prior = ALL.filter((d) => d.date < iso);
    const priorStats = analyze(prior.length ? prior : ALL);
    const monthMain = tally(monthDraws, "main", 50);
    const seasonMain = tally(seasonDraws, "main", 50);
    const allMain = tally(ALL, "main", 50);
    const monthEuro = tally(monthDraws, "euro", 12);
    const events = worldEventsFor(target);
    const histHits = HISTORY_EVENTS.map((ev) => {
      const dist = daysBetween(ev.date, iso);
      const nearby = drawsNear(ev.date, ev.window ?? 3);
      return { ...ev, dist, nearby, overlap: ev.nums.filter((n) => main.includes(n) || euro.includes(n)) };
    }).filter((e) => e.dist <= 16 || e.overlap.length);
    const eclipseNear = ECLIPSES.filter((e) => daysBetween(e.date, iso) <= 10);
    const skyNums = uniqueValid([
      Math.max(1, Math.min(50, Math.round(moon.illum * 50))),
      Math.max(1, Math.min(50, Math.round(moon.age))),
      moon.sign.index,
      moon.sun.index + 20,
      target.getDate(),
      target.getMonth() + 1,
      ...eclipseNear.flatMap((e) => [Number(e.date.slice(8)), Number(e.date.slice(5, 7))]),
    ], 50);
    const worldNums = uniqueValid(events.flatMap((e) => e.nums || []), 50);
    const weather = meta.weather;
    const weatherNums = weather
      ? uniqueValid([
        Math.round(Math.abs(weather.temp ?? 0)),
        Math.round(weather.rain ?? 0),
        weather.code,
        Math.round(weather.wind ?? 0),
        target.getMonth() + 1,
        target.getDate(),
      ], 50)
      : [];
    const consec = [];
    main.forEach((n, i) => {
      if (i && n === main[i - 1] + 1) consec.push(`${main[i - 1]}-${n}`);
    });
    const monthExp = monthDraws.length * (5 / 50);
    const seasonExp = seasonDraws.length * (5 / 50);
    const allExp = ALL.length * (5 / 50);

    function profile(n, kind) {
      const isMain = kind === "main";
      const monthC = isMain ? monthMain[n] : monthEuro[n];
      const seasonC = isMain ? seasonMain[n] : tally(seasonDraws, "euro", 12)[n];
      const allC = isMain ? allMain[n] : tally(ALL, "euro", 12)[n];
      const mExp = isMain ? monthExp : monthDraws.length * (2 / 12);
      const sExp = isMain ? seasonExp : seasonDraws.length * (2 / 12);
      const aExp = isMain ? allExp : ALL.length * (2 / 12);
      const st = isMain ? priorStats.mainStats[n - 1] : priorStats.euroStats[n - 1];
      const worldHit = events.filter((e) => (e.nums || []).includes(n));
      const histHit = histHits.filter((e) => e.nums.includes(n));
      const skyHit = skyNums.includes(n);
      const weatherHit = weatherNums.includes(n);
      const scores = {
        monat: clip01(mExp ? monthC / (mExp * 1.7) : 0),
        saison: clip01(sExp ? seasonC / (sExp * 1.7) : 0),
        welt: clip01((worldHit.length + histHit.length) / 2),
        himmel: skyHit ? 0.85 : clip01(st ? 0.15 : 0),
        wetter: weather ? (weatherHit ? 0.8 : 0.12) : 0,
      };
      const why = [];
      if (monthDraws.length) {
        const delta = monthC - mExp;
        why.push(`Im Monat ${iso.slice(5, 7)} fiel ${n} in ${fmt(monthC)} von ${fmt(monthDraws.length)} Ziehungen (erwartet ${fmt(mExp, 1)}, ${delta >= 0 ? "+" : ""}${fmt(delta, 1)}).`);
      }
      if (seasonDraws.length) {
        why.push(`${season.label}: ${fmt(seasonC)} Treffer in ${fmt(seasonDraws.length)} Ziehungen (erwartet ${fmt(sExp, 1)}).`);
      }
      if (st) {
        if (st.overdue >= 12) why.push(`Vor dieser Ziehung war ${n} ${st.overdue} Ziehungen überfällig — eine mögliche statistische „Nachhol“-Auffälligkeit, kein Zwang.`);
        else if (st.count > st.expected * 1.15) why.push(`Bis dahin lag ${n} über der Erwartung (${st.count}× vs. ${fmt(st.expected, 1)}) — häufig, aber unabhängig.`);
        else why.push(`Bis dahin unauffällig: ${st.count}× bei Erwartung ${fmt(st.expected, 1)}, Überfälligkeit ${st.overdue}.`);
      }
      worldHit.forEach((e) => why.push(`Weltlage-Anker: ${e.title}. Zahl ${n} steht in den Datums-/Ereignisankern — Assoziation, keine Ursache.`));
      histHit.slice(0, 2).forEach((e) => why.push(`Historisches Echo: ${e.title} (${fmtDate(e.date)}, Abstand ${fmt(e.dist, 0)} Tage).`));
      if (skyHit) why.push(`Himmelsanker: ${moon.phase} im ${moon.sign.name}, Sonne in ${moon.sun.name} — ${n} liegt bei Mondalter/Beleuchtung, Zeichenindex oder Finsternis-Datum.`);
      if (weatherHit && weather) {
        why.push(`Wetteranker Helsinki: ${fmt(weather.temp, 1)} °C, ${fmt(weather.rain, 1)} mm, Wind ${fmt(weather.wind, 0)} km/h, ${weatherLabel(weather.code)} — ${n} trifft Temperatur, Niederschlag, Code oder Wind.`);
      }
      if (target.getDate() === n) why.push(`${n} ist der Kalendertag der Ziehung.`);
      if (target.getMonth() + 1 === n) why.push(`${n} ist der Monat der Ziehung.`);
      return { n, kind, monthC, mExp, seasonC, sExp, allC, aExp, overdue: st?.overdue, scores, why };
    }

    const mains = main.map((n) => profile(n, "main"));
    const euros = euro.map((n) => profile(n, "euro"));
    const mean = (key) => mains.reduce((s, p) => s + p.scores[key], 0) / Math.max(mains.length, 1);
    const radar = [
      { label: "Welt", value: mean("welt") },
      { label: "Wetter", value: mean("wetter") },
      { label: "Himmel", value: mean("himmel") },
      { label: "Saison", value: mean("saison") },
      { label: "Monat", value: mean("monat") },
    ];
    const monthBars = mains.map((p) => ({ label: String(p.n), value: p.monthC, expected: p.mExp }));
    const ticket = [];
    const sum = main.reduce((a, b) => a + b, 0);
    const odd = main.filter((n) => n % 2).length;
    const low = main.filter((n) => n <= 25).length;
    ticket.push(`Summe ${sum} (Ø Historie ${fmt(priorStats.avgSum, 1)}). Ungerade ${odd}/5 (Ø ${fmt(priorStats.avgOdd, 2)}). Niedrig 1–25: ${low}/5 (Ø ${fmt(priorStats.avgLow, 2)}).`);
    if (consec.length) ticket.push(`Folge ${consec.join(", ")} — aufeinanderfolgende Kugeln kommen vor, sind aber kein Mechanismus.`);
    if (dayDraws.length) {
      const top = topFrom(tally(dayDraws, "main", 50), 5, 50);
      ticket.push(`${weekday(iso)} historisch ${fmt(dayDraws.length)} Ziehungen. Häufigste Hauptzahlen an diesem Wochentag: ${top.join(", ")}.`);
    }
    const lastTue = lastDrawOfWeekday(2);
    const lastFri = lastDrawOfWeekday(5);
    function overlapLine(d, label) {
      if (!d || d.date === iso) return null;
      const mh = main.filter((n) => d.main.includes(n));
      const eh = euro.filter((n) => d.euro.includes(n));
      return `${label} ${fmtDate(d.date)} (${d.main.join(" · ")} + ${d.euro.join(" · ")}): ${mh.length} Haupt- und ${eh.length} Eurozahlen gleich${mh.length || eh.length ? ` (${[...mh, ...eh].join(", ")})` : ""}.`;
    }
    const tueLine = overlapLine(lastTue, "Letzter Dienstag");
    const friLine = overlapLine(lastFri, "Letzter Freitag");
    if (tueLine) ticket.push(tueLine);
    if (friLine) ticket.push(friLine);
    const strong = [...mains].sort((a, b) => (b.scores.welt + b.scores.himmel + b.scores.wetter) - (a.scores.welt + a.scores.himmel + a.scores.wetter))[0];
    ticket.push(`Stärkste Ereignis-/Himmels-Überlappung bei ${strong.n}. Das ist eine Lesart der Anker, kein Beweis, weshalb die Kugel fiel.`);
    ticket.push("Jede Kombination bleibt gleich wahrscheinlich. Die Analyse sortiert Auffälligkeiten, sie ändert die Trommel nicht.");

    const weatherLines = weather
      ? [
        `Ort: ${weather.place}. ${fmt(weather.temp, 1)} °C im Mittel, ${fmt(weather.rain, 1)} mm Niederschlag, Wind bis ${fmt(weather.wind, 0)} km/h, Lage ${weatherLabel(weather.code)}.`,
        weatherNums.length ? `Wetterzahlen-Anker: ${weatherNums.join(", ")}.` : "Keine belastbaren Wetteranker.",
      ]
      : ["Wetterdaten waren nicht erreichbar. Jahreszeit und Kalender bleiben als Klima-Rahmen."];

    const skyLines = [
      `${moon.phase} (${fmt(moon.illum * 100, 0)} % beleuchtet, Mondalter ${fmt(moon.age, 1)} Tage) im ${moon.sign.name}. Sonne in ${moon.sun.name}.`,
      skyNums.length ? `Himmelsanker: ${skyNums.join(", ")}.` : "",
      eclipseNear.length ? `Nahe Finsternisse: ${eclipseNear.map((e) => `${e.title} (${fmtDate(e.date)})`).join("; ")}.` : "Keine Finsternis im ±10-Tage-Fenster.",
    ].filter(Boolean);

    const worldLines = [
      ...events.map((e) => `${e.title}${e.nums?.length ? ` — Anker ${e.nums.filter((n) => n >= 1 && n <= 50).join(", ")}` : ""}`),
      ...histHits.slice(0, 6).map((e) => `${e.title} (${fmtDate(e.date)}, ${fmt(e.dist, 0)} Tage Abstand)${e.overlap.length ? ` — Treffer ${e.overlap.join(", ")}` : ""}`),
    ];

    return {
      iso,
      main,
      euro,
      source: meta.source || "Eingabe",
      note: meta.note || "",
      season,
      weather,
      radar,
      monthBars,
      mains,
      euros,
      ticket,
      weatherLines,
      skyLines,
      worldLines,
      monthDraws: monthDraws.length,
      seasonDraws: seasonDraws.length,
    };
  }

  function paintAnalysisResult(report) {
    const box = document.getElementById("analyse-result");
    if (!box || !report) return;
    box.innerHTML = `
      <div class="forecast">
        <div class="forecast-hero">
          <p class="date">Analyse · ${weekday(report.iso)}, ${fmtDate(report.iso)} · ${report.source}</p>
          <h3>Warum gerade diese Zahlen? — Lesarten, kein Beweis</h3>
          <p class="muted">Die Ziehung ist zufällig. Unten stehen Übereinstimmungen mit Weltlage, Wetter in Helsinki, Sternenhimmel, ${report.season.label} und der Häufigkeit im Monat ${report.iso.slice(5, 7)} (${fmt(report.monthDraws)} Ziehungen). Die Chance bleibt 1 zu 139.838.160.</p>
          <div class="forecast-balls">${ballsHtml(report.main)}<span class="plus">+</span>${ballsHtml(report.euro, true)}</div>
          <div class="actions" style="justify-content:center">
            <button class="btn secondary use-tip" data-main="${report.main.join(",")}" data-euro="${report.euro.join(",")}">Im Rechner öffnen</button>
          </div>
        </div>
        <div class="charts">
          <div class="chart-box">
            <h4>Monatshäufigkeit der Hauptzahlen</h4>
            ${svgBarChart(report.monthBars, "Treffer im gleichen Kalendermonat")}
          </div>
          <div class="chart-box">
            <h4>Einfluss-Radar der Ziehung</h4>
            ${svgRadar(report.radar)}
          </div>
        </div>
        <article class="card reason">
          <h3>Gesamtbild — wieso, weshalb, warum (Lesarten)</h3>
          <ul>${report.ticket.map((l) => `<li>${l}</li>`).join("")}</ul>
        </article>
        <article class="card reason">
          <h3>Weltgeschehen</h3>
          <ul>${(report.worldLines.length ? report.worldLines : ["Keine markanten Anker im Fenster."]).map((l) => `<li>${l}</li>`).join("")}</ul>
        </article>
        <article class="card reason">
          <h3>Wetter und Jahreszeit</h3>
          <ul>${[`${report.season.label}: ${fmt(report.seasonDraws)} historische Ziehungen in dieser Jahreszeit.`, ...report.weatherLines].map((l) => `<li>${l}</li>`).join("")}</ul>
        </article>
        <article class="card reason">
          <h3>Sternenkonstellation</h3>
          <ul>${report.skyLines.map((l) => `<li>${l}</li>`).join("")}</ul>
        </article>
        <div class="num-grid">
          ${[...report.mains, ...report.euros].map((p) => `
            <article class="card reason num-card">
              <h4>${ballsHtml([p.n], p.kind === "euro")} ${p.kind === "euro" ? "Eurozahl" : "Hauptzahl"} ${p.n}</h4>
              <p class="muted">Monat ${fmt(p.monthC)} / erw. ${fmt(p.mExp, 1)} · ${report.season.label} ${fmt(p.seasonC)} / erw. ${fmt(p.sExp, 1)} · Archiv ${fmt(p.allC)} / erw. ${fmt(p.aExp, 1)}${p.overdue != null ? ` · überfällig ${p.overdue}` : ""}</p>
              <ul>${p.why.map((l) => `<li>${l}</li>`).join("")}</ul>
            </article>
          `).join("")}
        </div>
      </div>
    `;
  }

  function paintAnalysis() {
    const out = document.getElementById("gen-out");
    if (!out) return;
    const last = lastArchiveDraw();
    if (!state.analysisDraft) {
      state.analysisDraft = {
        iso: last.date,
        main: last.main.join(" "),
        euro: last.euro.join(" "),
        source: "Aktuelle Ziehung · Dienstag/Freitag",
        note: "",
      };
    }
    const d = state.analysisDraft;
    out.innerHTML = `
      <div class="forecast">
        <div class="forecast-hero">
          <p class="date">Ziehungsanalyse</p>
          <h3>Zahlen einlesen und Lesarten prüfen</h3>
          <p class="muted">Standard ist die neueste Ziehung im Archiv (${fmtDate(last.date)}, ${weekday(last.date)}). Dienstags- und Freitagsziehungen werden beim Start nachgeladen. Du kannst die letzte Ziehung, den letzten Dienstag, den letzten Freitag oder die offizielle Eurojackpot-Abfrage wählen. Wetter kommt von Open-Meteo für Helsinki.</p>
        </div>
        <article class="card analyse-form">
          <div class="analyse-fields">
            <label>Ziehungsdatum
              <input type="date" id="analyse-date" min="2012-03-23" value="${d.iso || last.date}">
            </label>
            <label>Hauptzahlen (5 aus 50)
              <input id="analyse-main" value="${d.main || ""}" placeholder="25 35 45 46 50">
            </label>
            <label>Eurozahlen (2)
              <input id="analyse-euro" value="${d.euro || ""}" placeholder="4 8">
            </label>
          </div>
          <div class="actions">
            <button type="button" class="btn secondary" id="analyse-last">Letzte Ziehung</button>
            <button type="button" class="btn secondary" id="analyse-tue">Letzter Dienstag</button>
            <button type="button" class="btn secondary" id="analyse-fri">Letzter Freitag</button>
            <button type="button" class="btn secondary" id="analyse-web">Aus dem Internet abfragen</button>
            <button type="button" class="btn analyse" id="analyse-run">Analyse starten</button>
          </div>
          <p id="analyse-status" class="muted">${d.note || ""}</p>
        </article>
        <div id="analyse-result"></div>
      </div>
    `;
    if (state.analysis) paintAnalysisResult(state.analysis);
  }

  function setAnalyseStatus(text) {
    const el = document.getElementById("analyse-status");
    if (el) el.textContent = text || "";
    if (state.analysisDraft) state.analysisDraft.note = text || "";
  }

  function applyAnalyseDraw(draw, source, note) {
    state.analysis = null;
    state.analysisDraft = {
      iso: draw.date,
      main: draw.main.join(" "),
      euro: draw.euro.join(" "),
      source,
      note: note || "",
    };
    paintAnalysis();
    setAnalyseStatus(note || `${source}: ${fmtDate(draw.date)}`);
  }

  async function runAnalysis() {
    readAnalyseDraft();
    const draft = state.analysisDraft;
    const iso = draft.iso;
    const main = parseTipNums(draft.main, 5, 50);
    const euro = parseTipNums(draft.euro, 2, 12);
    if (!iso) {
      setAnalyseStatus("Bitte ein Ziehungsdatum setzen.");
      return;
    }
    if (main.length !== 5 || euro.length !== 2) {
      setAnalyseStatus("Bitte genau 5 Hauptzahlen (1–50) und 2 Eurozahlen (1–12) eingeben.");
      return;
    }
    setAnalyseStatus("Analysiere Ziehung, Himmel, Monat und Wetter …");
    let weather = null;
    try {
      weather = await fetchWeather(iso);
    } catch {
      weather = null;
    }
    const known = ALL.find((d) => d.date === iso);
    const source = draft.source || (known ? "Lokales Archiv" : "Manuelle Eingabe");
    state.analysis = buildAnalysis(iso, main, euro, {
      weather,
      source,
      note: weather ? "Wetter Helsinki geladen." : "Ohne Wetterdaten (Abfrage fehlgeschlagen).",
    });
    state.genView = "analyse";
    paintAnalysis();
    setAnalyseStatus(weather
      ? `${source}. Wetter Helsinki: ${fmt(weather.temp, 1)} °C, ${weatherLabel(weather.code)}.`
      : `${source}. Wetterabfrage nicht möglich — Rest der Analyse steht.`);
  }

  function openAnalysis() {
    state.genView = "analyse";
    closeForecastAsk();
    const last = lastArchiveDraw();
    if (!state.analysisDraft) {
      state.analysisDraft = {
        iso: last.date,
        main: last.main.join(" "),
        euro: last.euro.join(" "),
        source: "Aktuelle Ziehung · Dienstag/Freitag",
        note: "",
      };
    }
    paintAnalysis();
    if (!state.analysis) runAnalysis();
  }

  function openForecastAsk(kind) {
    state.askKind = kind || "predict";
    const box = document.getElementById("forecast-ask");
    const text = document.getElementById("ask-text");
    const title = document.getElementById("ask-title");
    const neu = document.getElementById("forecast-new");
    if (state.askKind === "kitip") {
      const tip = state.kiTip;
      title.textContent = "Neuer KI-Tipp?";
      text.textContent = tip
        ? `Es liegt bereits ein KI-Tipp für ${weekday(tip.iso)}, ${fmtDate(tip.iso)} vor (${tip.main.join(" · ")} + ${tip.euro.join(" · ")}). Soll neu berechnet werden, oder bleibt der aktuelle Konsens?`
        : "Es liegt bereits ein KI-Tipp vor.";
      neu.textContent = "Neuen KI-Tipp berechnen";
    } else if (state.askKind === "ki") {
      const pack = state.kiPack;
      title.textContent = "Neue KI-Vorhersagen?";
      text.textContent = pack
        ? `Es liegen bereits ${pack.tickets.length} KI-Vorhersagen für ${weekday(pack.iso)}, ${fmtDate(pack.iso)} vor. Soll eine neue Runde erstellt werden, oder bleiben die aktuellen zwölf Tipps?`
        : "Es liegen bereits KI-Vorhersagen vor.";
      neu.textContent = "Neue KI-Vorhersagen erstellen";
    } else {
      const f = state.forecast;
      title.textContent = "Neue Vorhersage?";
      text.textContent = f
        ? `Es liegt bereits eine Vorhersage für ${weekday(f.iso)}, ${fmtDate(f.iso)} vor (${f.main.join(" · ")} + ${f.euro.join(" · ")}). Soll eine neue erstellt werden, oder bleibt es bei der aktuellen?`
        : "Es liegt bereits eine Vorhersage vor.";
      neu.textContent = "Neue Vorhersage erstellen";
    }
    box.hidden = false;
    state.forecastAsk = true;
  }

  function closeForecastAsk() {
    const box = document.getElementById("forecast-ask");
    if (box) box.hidden = true;
    state.forecastAsk = false;
  }

  function applyForecast(stats, variant) {
    state.forecastVariant = variant;
    const f = buildForecast(stats, variant);
    state.forecast = f;
    state.genView = "forecast";
    closeForecastAsk();
    paintForecast(f);
  }

  function restoreAskView() {
    if (state.askKind === "kitip" && state.kiTipLoading) paintKiTipLoading();
    else if (state.askKind === "kitip" && state.kiTip) paintKiTip(state.kiTip);
    else if (state.askKind === "ki" && state.kiPack) paintKiPack(state.kiPack);
    else if (state.forecast) paintForecast(state.forecast);
    state.askKind = null;
  }

  function showTickets(kind, stats) {
    if (kind === "predict") {
      applyForecast(stats, state.forecastVariant);
      return;
    }
    if (kind === "kitip") {
      applyKiTip(stats, state.kiTipRound);
      return;
    }
    if (kind === "ki") {
      applyKiPack(stats, state.kiRound);
      return;
    }
    state.genView = "tips";
    const tickets = kind === "hot" || kind === "cold" || kind === "overdue"
      ? [generate(kind, stats)]
      : Array.from({ length: 5 }, () => generate(kind, stats));
    document.getElementById("gen-out").innerHTML = tickets.map((t, i) => `
      <div class="ticket">
        <span class="muted">${t.title}${tickets.length > 1 ? ` ${i + 1}` : ""}</span>
        ${ballsHtml(t.main)}<span class="plus">+</span>${ballsHtml(t.euro, true)}
        <button class="btn secondary use-tip" data-main="${t.main.join(",")}" data-euro="${t.euro.join(",")}">Im Rechner öffnen</button>
      </div>
    `).join("");
  }

  function renderArchive() {
    const q = state.archiveQuery.trim().toLowerCase();
    const rows = [...ALL].reverse().filter((d) => {
      if (!q) return true;
      const hay = `${fmtDate(d.date)} ${d.main.join(" ")} ${d.euro.join(" ")} ${d.date}`;
      return hay.toLowerCase().includes(q) || q.split(/[\s,+]+/).every((tok) => !tok || hay.includes(tok));
    });
    const per = 20;
    const pages = Math.max(1, Math.ceil(rows.length / per));
    state.archivePage = Math.min(state.archivePage, pages);
    const slice = rows.slice((state.archivePage - 1) * per, state.archivePage * per);
    document.getElementById("tab-archive").innerHTML = `
      <article class="card">
        <h2>Alle ${fmt(ALL.length)} Ziehungen · ${fmtDate(ALL[0].date)} bis ${fmtDate(ALL[ALL.length - 1].date)}</h2>
        <input class="search" id="archive-q" placeholder="Suche Datum oder Zahlen, z. B. 21.08.2026 oder 25 35 45" value="${state.archiveQuery}">
        <p class="muted">${fmt(rows.length)} Treffer</p>
        <div style="overflow:auto">
          <table>
            <thead><tr><th>Datum</th><th>Hauptzahlen</th><th>Euro</th><th>Regel</th></tr></thead>
            <tbody>
              ${slice.map((d) => `<tr>
                <td>${fmtDate(d.date)}</td>
                <td>${d.main.map((n) => String(n).padStart(2, "0")).join(" · ")}</td>
                <td>${d.euro.map((n) => String(n).padStart(2, "0")).join(" · ")}</td>
                <td>2 aus ${d.euroMax}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <div class="actions">
          <button class="btn secondary" id="arch-prev" ${state.archivePage <= 1 ? "disabled" : ""}>Zurück</button>
          <span class="muted">Seite ${state.archivePage} / ${pages}</span>
          <button class="btn secondary" id="arch-next" ${state.archivePage >= pages ? "disabled" : ""}>Weiter</button>
        </div>
      </article>
    `;
  }

  function render() {
    const stats = analyze(filtered());
    setLiveStatus();
    if (state.tab === "overview") renderOverview(stats);
    if (state.tab === "freq") renderFreq(stats);
    if (state.tab === "calc") renderCalc(stats);
    if (state.tab === "gen") renderGen(stats);
    if (state.tab === "archive") renderArchive();
  }

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab;
      document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("is-active", b === btn));
      document.querySelectorAll(".panel").forEach((p) => {
        p.hidden = p.id !== `tab-${state.tab}`;
        p.classList.toggle("is-active", !p.hidden);
      });
      render();
    });
  });

  document.getElementById("period").addEventListener("change", (e) => {
    state.period = e.target.value;
    render();
  });

  document.body.addEventListener("click", (e) => {
    const wxDimBtn = e.target.closest("[data-wx-dim]");
    if (wxDimBtn) {
      state.wxDim = wxDimBtn.dataset.wxDim;
      paintWx();
      return;
    }
    const wxNumBtn = e.target.closest("[data-wx-n]");
    if (wxNumBtn) {
      const n = Number(wxNumBtn.dataset.wxN);
      state.wxNum = state.wxNum === n ? null : n;
      paintWx();
      return;
    }
    if (e.target.id === "wx-retry") {
      wx.status = "idle";
      wx.error = null;
      wx.pending = null;
      ensureWeather();
      paintWx();
      return;
    }
    if (e.target.id === "forecast-keep") {
      closeForecastAsk();
      restoreAskView();
      return;
    }
    if (e.target.id === "forecast-new") {
      const stats = analyze(filtered());
      if (state.askKind === "kitip") applyKiTip(stats, (state.kiTip?.round || 0) + 1);
      else if (state.askKind === "ki") applyKiPack(stats, (state.kiPack?.round || 0) + 1);
      else applyForecast(stats, (state.forecast?.variant || 0) + 1);
      return;
    }
    if (e.target.id === "forecast-ask") {
      closeForecastAsk();
      restoreAskView();
      return;
    }
    if (e.target.id === "analyse-last") {
      const last = lastArchiveDraw();
      applyAnalyseDraw(last, "Aktuelle Ziehung · Dienstag/Freitag", `Letzte Ziehung ${fmtDate(last.date)} (${weekday(last.date)}).`);
      runAnalysis();
      return;
    }
    if (e.target.id === "analyse-tue" || e.target.id === "analyse-fri") {
      const wd = e.target.id === "analyse-tue" ? 2 : 5;
      const label = wd === 2 ? "Letzter Dienstag" : "Letzter Freitag";
      const btn = e.target;
      const local = lastDrawOfWeekday(wd);
      const applyLocal = (draw, source, note) => {
        applyAnalyseDraw(draw, source, note);
        return runAnalysis();
      };
      if (local && live.status === "ok") {
        applyLocal(local, `Archiv · ${label}`, `${label}: ${fmtDate(local.date)}.`);
        return;
      }
      btn.disabled = true;
      setAnalyseStatus(`Frage ${label.toLowerCase()} ab …`);
      fetchOfficialDraw()
        .then((latest) => {
          ingestDraw(latest);
          persistLiveDraws();
          const draw = lastDrawOfWeekday(wd) || (weekdayIndex(latest.date) === wd ? latest : local);
          if (!draw) throw new Error("keine Ziehung");
          return applyLocal(draw, `Internet · ${label}`, `${label}: ${fmtDate(draw.date)}.`);
        })
        .catch((err) => {
          if (local) applyLocal(local, `Archiv · ${label}`, `${label} lokal: ${fmtDate(local.date)}.`);
          else setAnalyseStatus(`${label} nicht gefunden (${err.message || err.name}).`);
        })
        .finally(() => { btn.disabled = false; });
      return;
    }
    if (e.target.id === "analyse-web") {
      const btn = e.target;
      btn.disabled = true;
      readAnalyseDraft();
      setAnalyseStatus("Frage offizielle Eurojackpot-Zahlen ab …");
      const iso = state.analysisDraft?.iso;
      fetchOfficialDraw(iso)
        .catch(() => fetchOfficialDraw())
        .then((draw) => {
          ingestDraw(draw);
          persistLiveDraws();
          applyAnalyseDraw(draw, "Internet · WestLotto / Eurojackpot", `Abfrage erfolgreich: ${fmtDate(draw.date)} (${weekday(draw.date)}).`);
          return runAnalysis();
        })
        .catch((err) => {
          setAnalyseStatus(`Internet-Abfrage fehlgeschlagen (${err.message || err.name}). Zahlen manuell eintragen oder letzte lokale Ziehung laden.`);
        })
        .finally(() => { btn.disabled = false; });
      return;
    }
    if (e.target.id === "analyse-run") {
      runAnalysis();
      return;
    }
    if (e.target.id === "ki-pdf") {
      openKiPrintAsk();
      return;
    }
    if (e.target.id === "ki-print-color") {
      openKiForecastPrint(true);
      return;
    }
    if (e.target.id === "ki-print-bw") {
      openKiForecastPrint(false);
      return;
    }
    if (e.target.id === "ki-print-ask") {
      closeKiPrintAsk();
      return;
    }
    const gen = e.target.closest(".gen-btn");
    if (gen) {
      const kind = gen.dataset.kind;
      const stats = analyze(filtered());
      if (kind === "predict") {
        if (state.forecast) {
          openForecastAsk("predict");
          return;
        }
        applyForecast(stats, 0);
        return;
      }
      if (kind === "analyse") {
        openAnalysis();
        return;
      }
      if (kind === "kitip") {
        if (state.kiTip) {
          openForecastAsk("kitip");
          return;
        }
        applyKiTip(stats, 0);
        return;
      }
      if (kind === "ki") {
        if (state.kiPack) {
          openForecastAsk("ki");
          return;
        }
        applyKiPack(stats, 0);
        return;
      }
      closeForecastAsk();
      showTickets(kind, stats);
      return;
    }
    const pick = e.target.closest(".ball[data-n]");
    if (pick) {
      const n = Number(pick.dataset.n);
      const key = pick.dataset.kind === "euro" ? "euro" : "main";
      const max = key === "main" ? 5 : 2;
      const list = state[key];
      const i = list.indexOf(n);
      if (i >= 0) list.splice(i, 1);
      else if (list.length < max) list.push(n);
      list.sort((a, b) => a - b);
      render();
      return;
    }
    if (e.target.id === "clear-pick") {
      state.main = [];
      state.euro = [];
      render();
      return;
    }
    const use = e.target.closest(".use-tip");
    if (use) {
      state.main = use.dataset.main.split(",").map(Number);
      state.euro = use.dataset.euro.split(",").map(Number);
      document.querySelector('[data-tab="calc"]').click();
    }
    if (e.target.id === "arch-prev") {
      state.archivePage -= 1;
      renderArchive();
    }
    if (e.target.id === "arch-next") {
      state.archivePage += 1;
      renderArchive();
    }
  });

  document.body.addEventListener("input", (e) => {
    if (e.target.id === "analyse-date" || e.target.id === "analyse-main" || e.target.id === "analyse-euro") {
      readAnalyseDraft();
      return;
    }
    if (e.target.id === "archive-q") {
      const pos = e.target.selectionStart;
      state.archiveQuery = e.target.value;
      state.archivePage = 1;
      renderArchive();
      const input = document.getElementById("archive-q");
      input.focus();
      input.setSelectionRange(pos, pos);
    }
  });

  loadPersistedDraws();
  syncMeta();
  render();
  refreshDrawsOnStart();
})();
