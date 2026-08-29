const el = document.getElementById("notes");
const key = "gogilock.notes";
el.value = localStorage.getItem(key) || "";
el.addEventListener("input", () => localStorage.setItem(key, el.value));
