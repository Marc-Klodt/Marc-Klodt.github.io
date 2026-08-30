(function () {
  var home = "/";
  var link = document.querySelector(".ggl-backbar a");
  if (link) {
    link.addEventListener("click", function (e) {
      if (window.self === window.top) return;
      e.preventDefault();
      try {
        window.parent.postMessage({ type: "gogilock-home" }, window.location.origin);
      } catch (_) {
        window.top.location.href = home;
      }
    });
  }
  if (window.self !== window.top) return;
  if (!history.state || history.state.ggl !== "program") {
    history.replaceState({ ggl: "home" }, "", home);
    history.pushState({ ggl: "program" }, "", location.href);
  }
})();
