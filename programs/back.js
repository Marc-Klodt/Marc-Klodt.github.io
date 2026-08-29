(function () {
  var link = document.querySelector(".ggl-backbar a");
  if (!link) return;
  link.addEventListener("click", function (e) {
    if (window.self === window.top) return;
    e.preventDefault();
    try {
      window.parent.postMessage({ type: "gogilock-home" }, window.location.origin);
    } catch (_) {
      window.top.location.href = "/";
    }
  });
})();
