let start = 0;
let elapsed = 0;
let tick = null;
const time = document.getElementById("time");
const toggle = document.getElementById("toggle");

function fmt(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  return pad(m) + ":" + pad(s) + "." + pad(cs);
}

function render() {
  time.textContent = fmt(elapsed + (tick ? Date.now() - start : 0));
}

toggle.addEventListener("click", function () {
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

document.getElementById("reset").addEventListener("click", function () {
  if (tick) clearInterval(tick);
  tick = null;
  start = 0;
  elapsed = 0;
  toggle.textContent = "Start";
  render();
});
