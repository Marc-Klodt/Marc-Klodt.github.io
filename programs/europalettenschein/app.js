(() => {
  const STORAGE_KEY = "europalettentausch.schein.v1";
  const DEFAULT_ROWS = 2;

  const body = document.body;
  const sheet = document.getElementById("sheet");
  const posBody = document.getElementById("pos-body");
  const rowTemplate = document.getElementById("pos-row-template");
  const btnEuro = document.getElementById("btn-euro");
  const btnNeutral = document.getElementById("btn-neutral");

  const pads = {
    "sign-ueber": createPad(document.getElementById("sign-ueber")),
    "sign-an": createPad(document.getElementById("sign-an")),
  };

  function todayIso() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function newBelegNr() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    const prefix = body.dataset.version === "neutral" ? "NS" : "EPS";
    return `${prefix}-${stamp}-${rand}`;
  }

  function setVersion(version, persist = true) {
    body.dataset.version = version;
    btnEuro.classList.toggle("is-active", version === "euro");
    btnNeutral.classList.toggle("is-active", version === "neutral");
    btnEuro.setAttribute("aria-pressed", String(version === "euro"));
    btnNeutral.setAttribute("aria-pressed", String(version === "neutral"));
    const beleg = document.getElementById("feld-beleg");
    if (beleg.value) {
      beleg.value = beleg.value.replace(/^(EPS|NS)-/, version === "neutral" ? "NS-" : "EPS-");
    }
    if (persist) save();
  }

  function addRow(data = {}) {
    const node = rowTemplate.content.firstElementChild.cloneNode(true);
    if (data.bezeichnung) node.querySelector(".feld-bezeichnung").value = data.bezeichnung;
    if (data.abgegeben != null) node.querySelector(".feld-abgegeben").value = data.abgegeben;
    if (data.empfangen != null) node.querySelector(".feld-empfangen").value = data.empfangen;
    if (data.zustand) node.querySelector(".feld-zustand").value = data.zustand;
    posBody.appendChild(node);
    numberRows();
    recalc();
    return node;
  }

  function numberRows() {
    [...posBody.querySelectorAll(".pos-row")].forEach((row, i) => {
      row.querySelector(".col-pos").textContent = String(i + 1);
    });
  }

  function qty(input) {
    const n = Number.parseInt(input.value, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function recalc() {
    let sumAb = 0;
    let sumAn = 0;
    [...posBody.querySelectorAll(".pos-row")].forEach((row) => {
      const ab = qty(row.querySelector(".feld-abgegeben"));
      const an = qty(row.querySelector(".feld-empfangen"));
      const diff = ab - an;
      row.querySelector(".feld-diff").textContent = String(diff);
      sumAb += ab;
      sumAn += an;
    });
    document.getElementById("sum-abgegeben").textContent = String(sumAb);
    document.getElementById("sum-empfangen").textContent = String(sumAn);
    document.getElementById("sum-diff").textContent = String(sumAb - sumAn);
  }

  function collectRows() {
    return [...posBody.querySelectorAll(".pos-row")].map((row) => ({
      bezeichnung: row.querySelector(".feld-bezeichnung").value,
      abgegeben: row.querySelector(".feld-abgegeben").value,
      empfangen: row.querySelector(".feld-empfangen").value,
      zustand: row.querySelector(".feld-zustand").value,
    }));
  }

  function currentState() {
    return {
      version: body.dataset.version,
      vorgang: sheet.dataset.vorgang,
      datum: document.getElementById("feld-datum").value,
      ort: document.getElementById("feld-ort").value,
      beleg: document.getElementById("feld-beleg").value,
      lieferschein: document.getElementById("feld-lieferschein").value,
      kennzeichen: document.getElementById("feld-kennzeichen").value,
      ueberFirma: document.getElementById("ueber-firma").value,
      ueberName: document.getElementById("ueber-name").value,
      ueberAdresse: document.getElementById("ueber-adresse").value,
      anFirma: document.getElementById("an-firma").value,
      anName: document.getElementById("an-name").value,
      anAdresse: document.getElementById("an-adresse").value,
      vereinbarung: document.querySelector('input[name="vereinbarung"]:checked')?.value || "zug-um-zug",
      rueckgabe: document.getElementById("feld-rueckgabe").value,
      bemerkungen: document.getElementById("feld-bemerkungen").value,
      signUeberName: document.getElementById("sign-ueber-name").value,
      signUeberDatum: document.getElementById("sign-ueber-datum").value,
      signAnName: document.getElementById("sign-an-name").value,
      signAnDatum: document.getElementById("sign-an-datum").value,
      signUeber: pads["sign-ueber"].toDataURL(),
      signAn: pads["sign-an"].toDataURL(),
      rows: collectRows(),
    };
  }

  function applyState(data) {
    if (!data) return;
    setVersion(data.version === "neutral" ? "neutral" : "euro", false);
    const vorgang = ["tausch", "empfangen", "ausgegeben"].includes(data.vorgang)
      ? data.vorgang
      : "tausch";
    sheet.dataset.vorgang = vorgang;
    const radio = document.querySelector(`input[name="vorgang"][value="${vorgang}"]`);
    if (radio) radio.checked = true;

    document.getElementById("feld-datum").value = data.datum || todayIso();
    document.getElementById("feld-ort").value = data.ort || "";
    document.getElementById("feld-beleg").value = data.beleg || newBelegNr();
    document.getElementById("feld-lieferschein").value = data.lieferschein || "";
    document.getElementById("feld-kennzeichen").value = data.kennzeichen || "";
    document.getElementById("ueber-firma").value = data.ueberFirma || "";
    document.getElementById("ueber-name").value = data.ueberName || "";
    document.getElementById("ueber-adresse").value = data.ueberAdresse || "";
    document.getElementById("an-firma").value = data.anFirma || "";
    document.getElementById("an-name").value = data.anName || "";
    document.getElementById("an-adresse").value = data.anAdresse || "";
    const vereinbarung = document.querySelector(`input[name="vereinbarung"][value="${data.vereinbarung || "zug-um-zug"}"]`);
    if (vereinbarung) vereinbarung.checked = true;
    document.getElementById("feld-rueckgabe").value = data.rueckgabe || "";
    document.getElementById("feld-bemerkungen").value = data.bemerkungen || "";
    document.getElementById("sign-ueber-name").value = data.signUeberName || "";
    document.getElementById("sign-ueber-datum").value = data.signUeberDatum || data.datum || todayIso();
    document.getElementById("sign-an-name").value = data.signAnName || "";
    document.getElementById("sign-an-datum").value = data.signAnDatum || data.datum || todayIso();

    posBody.replaceChildren();
    const rows = Array.isArray(data.rows) && data.rows.length ? data.rows : [{}, {}];
    rows.forEach((row) => addRow(row));

    pads["sign-ueber"].fromDataURL(data.signUeber);
    pads["sign-an"].fromDataURL(data.signAn);
    recalc();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState()));
    } catch {
      /* private mode / quota */
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function resetForm() {
    posBody.replaceChildren();
    for (let i = 0; i < DEFAULT_ROWS; i += 1) addRow();
    document.getElementById("feld-datum").value = todayIso();
    document.getElementById("feld-ort").value = "";
    document.getElementById("feld-beleg").value = newBelegNr();
    document.getElementById("feld-lieferschein").value = "";
    document.getElementById("feld-kennzeichen").value = "";
    document.getElementById("ueber-firma").value = "";
    document.getElementById("ueber-name").value = "";
    document.getElementById("ueber-adresse").value = "";
    document.getElementById("an-firma").value = "";
    document.getElementById("an-name").value = "";
    document.getElementById("an-adresse").value = "";
    document.querySelector('input[name="vorgang"][value="tausch"]').checked = true;
    sheet.dataset.vorgang = "tausch";
    document.querySelector('input[name="vereinbarung"][value="zug-um-zug"]').checked = true;
    document.getElementById("feld-rueckgabe").value = "";
    document.getElementById("feld-bemerkungen").value = "";
    document.getElementById("sign-ueber-name").value = "";
    document.getElementById("sign-ueber-datum").value = todayIso();
    document.getElementById("sign-an-name").value = "";
    document.getElementById("sign-an-datum").value = todayIso();
    pads["sign-ueber"].clear();
    pads["sign-an"].clear();
    recalc();
    save();
  }

  function createPad(canvas) {
    const ctx = canvas.getContext("2d");
    let drawing = false;
    let last = null;
    let image = null;

    function styleCtx() {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1a1612";
      ctx.lineWidth = 2.1;
    }

    function paintImage() {
      if (!image) return;
      const rect = canvas.getBoundingClientRect();
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, rect.width || canvas.width, rect.height || canvas.height);
      };
      img.src = image;
    }

    function sizeCanvas() {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(Math.round(rect.width), 300);
      const h = Math.max(Math.round(rect.height), 80);
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      styleCtx();
      paintImage();
    }

    function pos(event) {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function start(event) {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      drawing = true;
      last = pos(event);
    }

    function move(event) {
      if (!drawing) return;
      event.preventDefault();
      const p = pos(event);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    }

    function end() {
      if (!drawing) return;
      drawing = false;
      last = null;
      image = canvas.toDataURL("image/png");
      save();
    }

    canvas.addEventListener("pointerdown", start);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    const api = {
      clear() {
        image = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      },
      toDataURL() {
        return image;
      },
      fromDataURL(url) {
        image = url || null;
        if (!image) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          return;
        }
        paintImage();
      },
      resize: sizeCanvas,
    };

    new ResizeObserver(sizeCanvas).observe(canvas);
    sizeCanvas();
    return api;
  }

  btnEuro.addEventListener("click", () => setVersion("euro"));
  btnNeutral.addEventListener("click", () => setVersion("neutral"));

  document.getElementById("btn-add-row").addEventListener("click", () => {
    addRow();
    save();
  });

  document.getElementById("btn-print").addEventListener("click", () => {
    save();
    window.print();
  });

  document.getElementById("btn-new").addEventListener("click", () => {
    const dirty = collectRows().some((row) =>
      row.bezeichnung || row.abgegeben || row.empfangen || row.zustand
    );
    if (dirty && !window.confirm("Aktuellen Schein verwerfen und neu beginnen?")) return;
    resetForm();
  });

  document.querySelectorAll('input[name="vorgang"]').forEach((input) => {
    input.addEventListener("change", () => {
      sheet.dataset.vorgang = input.value;
      save();
    });
  });

  posBody.addEventListener("input", (event) => {
    if (event.target.closest(".pos-row")) recalc();
    save();
  });

  posBody.addEventListener("click", (event) => {
    const del = event.target.closest(".icon-del");
    if (!del) return;
    const row = del.closest(".pos-row");
    if (posBody.querySelectorAll(".pos-row").length <= 1) {
      row.querySelectorAll("input, select").forEach((el) => {
        el.value = "";
      });
      recalc();
      save();
      return;
    }
    row.remove();
    numberRows();
    recalc();
    save();
  });

  sheet.addEventListener("input", () => save());
  sheet.addEventListener("change", () => save());

  document.querySelectorAll("[data-clear-sign]").forEach((btn) => {
    btn.addEventListener("click", () => {
      pads[btn.dataset.clearSign]?.clear();
      save();
    });
  });

  window.addEventListener("beforeprint", () => {
    Object.values(pads).forEach((pad) => pad.resize());
  });

  const stored = load();
  if (stored) {
    applyState(stored);
  } else {
    resetForm();
  }

  const requested = new URLSearchParams(location.search).get("v");
  if (requested === "neutral" || requested === "euro") {
    setVersion(requested, false);
  }
})();
