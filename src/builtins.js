const ACCENTS = [
  { id: "copper", value: "#c45c32", label: "Kupfer" },
  { id: "moss", value: "#5a6b4a", label: "Moos" },
  { id: "ink", value: "#2c4a6e", label: "Tinte" },
  { id: "ochre", value: "#c4922a", label: "Ocker" },
  { id: "wine", value: "#8a3d4a", label: "Wein" },
  { id: "slate", value: "#5c5a56", label: "Schiefer" },
];

const notesHtml = `
<div class="wrap">
  <header>
    <h1>Notizen</h1>
    <p>Wird automatisch im Browser gespeichert.</p>
  </header>
  <textarea id="notes" placeholder="Schreibe hier …"></textarea>
</div>
`.trim();

const notesCss = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  font-family: "IBM Plex Sans", system-ui, sans-serif;
  background: #f3eee4;
  color: #1a1612;
}
.wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 28px;
  gap: 16px;
}
header h1 {
  margin: 0;
  font-family: Georgia, serif;
  font-size: 1.7rem;
  font-weight: 650;
}
header p { margin: 6px 0 0; color: #6b645b; font-size: 0.9rem; }
textarea {
  flex: 1;
  width: 100%;
  resize: none;
  border: 1px solid #d8d0c4;
  background: #fffdf8;
  border-radius: 10px;
  padding: 16px;
  font: 1.05rem/1.55 "IBM Plex Sans", system-ui, sans-serif;
  color: inherit;
}
textarea:focus { outline: 2px solid #c45c32; outline-offset: -1px; }
`.trim();

const notesJs = `
const el = document.getElementById("notes");
const key = "werkbank.builtin.notes";
el.value = localStorage.getItem(key) || "";
el.addEventListener("input", () => localStorage.setItem(key, el.value));
`.trim();

const calcHtml = `
<div class="calc">
  <div class="display" id="display">0</div>
  <div class="keys">
    <button data-act="clear">C</button>
    <button data-act="sign">±</button>
    <button data-act="percent">%</button>
    <button data-op="/">÷</button>
    <button data-num="7">7</button>
    <button data-num="8">8</button>
    <button data-num="9">9</button>
    <button data-op="*">×</button>
    <button data-num="4">4</button>
    <button data-num="5">5</button>
    <button data-num="6">6</button>
    <button data-op="-">−</button>
    <button data-num="1">1</button>
    <button data-num="2">2</button>
    <button data-num="3">3</button>
    <button data-op="+">+</button>
    <button data-num="0" class="wide">0</button>
    <button data-act="dot">,</button>
    <button data-act="eq" class="eq">=</button>
  </div>
</div>
`.trim();

const calcCss = `
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  display: grid;
  place-items: center;
  background: #f3eee4;
  font-family: "IBM Plex Sans", system-ui, sans-serif;
}
.calc {
  width: min(360px, 92vw);
  background: #1a1612;
  color: #f3eee4;
  border-radius: 18px;
  padding: 18px;
  box-shadow: 0 18px 40px rgba(26, 22, 18, 0.2);
}
.display {
  font: 500 2.2rem/1 "IBM Plex Mono", ui-monospace, monospace;
  text-align: right;
  padding: 18px 10px 22px;
  min-height: 72px;
  word-break: break-all;
}
.keys {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
button {
  appearance: none;
  border: 0;
  border-radius: 12px;
  min-height: 52px;
  font-size: 1.15rem;
  background: #2b2621;
  color: inherit;
  cursor: pointer;
}
button:hover { background: #3a342d; }
.wide { grid-column: span 2; }
.eq { background: #c45c32; color: #fff; }
.eq:hover { background: #d46a3e; }
`.trim();

const calcJs = `
let current = "0";
let stored = null;
let op = null;
let fresh = true;
const display = document.getElementById("display");

function show() {
  display.textContent = current.replace(".", ",");
}

function inputNum(n) {
  if (fresh || current === "0") {
    current = n;
    fresh = false;
  } else {
    current += n;
  }
  show();
}

function compute() {
  if (stored === null || !op) return;
  const a = Number(stored);
  const b = Number(current);
  let result = b;
  if (op === "+") result = a + b;
  if (op === "-") result = a - b;
  if (op === "*") result = a * b;
  if (op === "/") result = b === 0 ? "Fehler" : a / b;
  current = String(result);
  stored = null;
  op = null;
  fresh = true;
  show();
}

document.querySelector(".keys").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn.dataset.num) inputNum(btn.dataset.num);
  if (btn.dataset.op) {
    stored = current;
    op = btn.dataset.op;
    fresh = true;
  }
  if (btn.dataset.act === "clear") {
    current = "0"; stored = null; op = null; fresh = true; show();
  }
  if (btn.dataset.act === "dot" && !current.includes(".")) {
    current += ".";
    fresh = false;
    show();
  }
  if (btn.dataset.act === "sign") {
    current = String(Number(current) * -1);
    show();
  }
  if (btn.dataset.act === "percent") {
    current = String(Number(current) / 100);
    show();
  }
  if (btn.dataset.act === "eq") compute();
});
`.trim();

const timerHtml = `
<div class="wrap">
  <p class="label">Stoppuhr</p>
  <div class="time" id="time">00:00.00</div>
  <div class="row">
    <button id="toggle">Start</button>
    <button id="reset" class="ghost">Zurücksetzen</button>
  </div>
</div>
`.trim();

const timerCss = `
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  display: grid;
  place-items: center;
  background: #f3eee4;
  color: #1a1612;
  font-family: "IBM Plex Sans", system-ui, sans-serif;
}
.wrap { text-align: center; }
.label {
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-size: 0.75rem;
  color: #6b645b;
  margin: 0 0 8px;
}
.time {
  font: 500 4rem/1 "IBM Plex Mono", ui-monospace, monospace;
  margin-bottom: 28px;
}
.row { display: flex; gap: 12px; justify-content: center; }
button {
  appearance: none;
  border: 0;
  background: #c45c32;
  color: #fff;
  padding: 12px 22px;
  border-radius: 999px;
  font-size: 1rem;
  cursor: pointer;
}
.ghost {
  background: transparent;
  color: #1a1612;
  border: 1px solid #cfc6b8;
}
`.trim();

const timerJs = `
let start = 0;
let elapsed = 0;
let tick = null;
const time = document.getElementById("time");
const toggle = document.getElementById("toggle");

function fmt(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return [m, s].map((n) => String(n).padStart(2, "0")).join(":") + "." + String(cs).padStart(2, "0");
}

function render() {
  time.textContent = fmt(elapsed + (tick ? Date.now() - start : 0));
}

toggle.addEventListener("click", () => {
  if (tick) {
    elapsed += Date.now() - start;
    clearInterval(tick);
    tick = null;
    toggle.textContent = "Start";
  } else {
    start = Date.now();
    tick = setInterval(render, 30);
    toggle.textContent = "Pause";
  }
});

document.getElementById("reset").addEventListener("click", () => {
  if (tick) clearInterval(tick);
  tick = null;
  start = 0;
  elapsed = 0;
  toggle.textContent = "Start";
  render();
});
`.trim();

const builtins = [
  {
    id: "builtin-notes",
    name: "Notizen",
    description: "Schnelle Texte, die im Browser bleiben.",
    icon: "✎",
    accent: "#5a6b4a",
    type: "code",
    html: notesHtml,
    css: notesCss,
    js: notesJs,
    builtin: true,
  },
  {
    id: "builtin-calc",
    name: "Rechner",
    description: "Kleiner Taschenrechner für zwischendurch.",
    icon: "∑",
    accent: "#2c4a6e",
    type: "code",
    html: calcHtml,
    css: calcCss,
    js: calcJs,
    builtin: true,
  },
  {
    id: "builtin-timer",
    name: "Stoppuhr",
    description: "Zeit stoppen, pausieren, zurücksetzen.",
    icon: "◷",
    accent: "#c45c32",
    type: "code",
    html: timerHtml,
    css: timerCss,
    js: timerJs,
    builtin: true,
  },
];

const CODE_TEMPLATE = {
  html: `<div class="app">
  <h1>Mein Programm</h1>
  <p>Hier kannst du HTML, CSS und JavaScript schreiben.</p>
  <button id="btn">Klick mich</button>
</div>`,
  css: `* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  font-family: system-ui, sans-serif;
  background: #f3eee4;
  color: #1a1612;
  display: grid;
  place-items: center;
}
.app { text-align: center; padding: 24px; }
h1 { font-family: Georgia, serif; margin-bottom: 8px; }
button {
  margin-top: 16px;
  padding: 10px 18px;
  border: 0;
  border-radius: 999px;
  background: #c45c32;
  color: #fff;
  cursor: pointer;
}`,
  js: `document.getElementById("btn").addEventListener("click", () => {
  alert("Hallo von deinem Programm!");
});`,
};
