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

document.querySelector(".keys").addEventListener("click", function (e) {
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
  if (btn.dataset.act === "dot" && current.indexOf(".") < 0) {
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
