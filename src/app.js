const root = document.getElementById("app");

const ui = {
  me: null,
  view: "loading",
  tab: "login",
  query: "",
  programs: [],
  workspace: null,
  notice: "",
  error: "",
  accountOpen: false,
  helpOpen: false,
  publicMode: false,
};

function setError(msg) {
  ui.error = msg || "";
  ui.notice = "";
}

function setNotice(msg) {
  ui.notice = msg || "";
  ui.error = "";
}

function render() {
  if (ui.view === "loading") {
    setProgramChrome(!!ui.workspace);
    return;
  }
  if (!ui.me) {
    renderGuest();
    bindGuest();
    setProgramChrome(!!ui.workspace);
    return;
  }
  renderApp();
  bindApp();
  setProgramChrome(!!ui.workspace);
}

const NEON_PAIRS = [
  ["#39f6ff", "#ff2ad4"],
  ["#7dff3a", "#39f6ff"],
  ["#ffef3a", "#ff2ad4"],
  ["#ff6a2a", "#7a5bff"],
  ["#3ee0ff", "#ff6a2a"],
  ["#b8ff2a", "#ff2ad4"],
  ["#ff2ad4", "#39f6ff"],
  ["#ffe14a", "#3ee0ff"],
];

function randomNeonPair() {
  return NEON_PAIRS[Math.floor(Math.random() * NEON_PAIRS.length)];
}

function renderInfoCloud(id, extraClass, title, text) {
  const [neonA, neonB] = randomNeonPair();
  const variant = 1 + Math.floor(Math.random() * 4);
  return `
    <div class="info-cloud ${extraClass} cloud-v${variant}" id="${id}" role="tooltip" style="--neon-a:${neonA};--neon-b:${neonB}">
      <div class="info-cloud-glow" aria-hidden="true">
        <span class="cloud-puff puff-a"></span>
        <span class="cloud-puff puff-b"></span>
        <span class="cloud-puff puff-c"></span>
        <div class="info-cloud-plate"></div>
      </div>
      <div class="info-cloud-body">
        ${title ? `<strong>${title}</strong>` : ""}
        <p>${text}</p>
      </div>
    </div>`;
}

function renderHelpBadge() {
  return `
    <div class="help-wrap">
      <button type="button" class="help-badge" aria-describedby="tip-site-help">
        <span class="help-badge-rim" aria-hidden="true"></span>
        <span class="help-badge-core" aria-hidden="true">
          <span class="help-q">?</span>
        </span>
        <span class="visually-hidden">Was ist Logistik-Tools, was soll Logistik-Tools.</span>
      </button>
      ${renderInfoCloud("tip-site-help", "help-badge-tip", "", "Was ist Logistik-Tools, was soll Logistik-Tools.")}
    </div>`;
}

function renderHelpDialog() {
  if (!ui.helpOpen) return "";
  return `
    <div class="overlay help-overlay" id="help-overlay">
      <div class="panel help-panel" role="dialog" aria-labelledby="help-dialog-title">
        <div class="panel-head">
          <div>
            <h2 id="help-dialog-title">Was ist Logistik-Tools, was soll Logistik-Tools.</h2>
          </div>
          <button class="icon-btn" type="button" id="close-help" aria-label="Schließen">×</button>
        </div>
        <p class="help-panel-text">Hier bei Logistik-Tools sollen Hilfsmittel für den Bedarf in der Logistik gesammelt, entwickelt, verbessert und nutzbar gemacht werden.</p>
      </div>
    </div>`;
}

function closeHelp() {
  ui.helpOpen = false;
  render();
}

function renderBrand() {
  if (ui.workspace) {
    return `
      <div class="brand">
        <span class="mark">GoGiLock</span>
        <h1>${escapeHtml(ui.workspace.name)}</h1>
        ${ui.workspace.description ? `<p>${escapeHtml(ui.workspace.description)}</p>` : ""}
      </div>`;
  }
  return `
    <div class="brand">
      <span class="mark">GoGiLock</span>
      <div class="brand-title">
        <h1>Logistik-Tools</h1>
        ${renderHelpBadge()}
      </div>
    </div>`;
}

function renderGuest() {
  root.innerHTML = `
        <header class="topbar">
          ${renderBrand()}
        </header>
        ${ui.workspace ? renderWorkspace() : `
      <div class="auth-grid">
        <section class="paper-card">
          <div class="code-tabs auth-tabs">
            <button type="button" data-tab="login" class="${ui.tab === "login" ? "active" : ""}">Anmelden</button>
            <button type="button" data-tab="register" class="${ui.tab === "register" ? "active" : ""}">Registrieren</button>
            <button type="button" data-tab="forgot" class="${ui.tab === "forgot" ? "active" : ""}">Passwort vergessen</button>
          </div>
          ${ui.error ? `<p class="banner bad">${escapeHtml(ui.error)}</p>` : ""}
          ${ui.notice ? `<p class="banner good">${escapeHtml(ui.notice)}</p>` : ""}
          ${ui.tab === "login" ? `
            <form id="login-form" class="form auth-form">
              <label>E-Mail
                <input name="email" type="email" required maxlength="120" autocomplete="username" placeholder="name@firma.de" />
              </label>
              <label>Passwort
                <input name="password" type="password" required maxlength="120" autocomplete="current-password" />
              </label>
              <div class="form-actions">
                <span></span>
                <button class="btn" type="submit">Anmelden</button>
              </div>
            </form>` : ""}
          ${ui.tab === "register" ? `
            <form id="register-form" class="form auth-form">
              <p class="hint">Nur eine gültige E-Mail-Adresse ist nötig. Passwort und Zugang werden automatisch erzeugt und an dich geschickt.</p>
              <label>E-Mail-Adresse
                <input name="email" type="email" required maxlength="120" autocomplete="email" placeholder="name@firma.de" />
              </label>
              <div class="form-actions">
                <span></span>
                <button class="btn" type="submit">Registrieren</button>
              </div>
            </form>` : ""}
          ${ui.tab === "forgot" ? `
            <form id="forgot-form" class="form auth-form">
              <p class="hint">Wir erzeugen ein neues Passwort und senden es an deine E-Mail-Adresse.</p>
              <label>E-Mail-Adresse
                <input name="email" type="email" required maxlength="120" autocomplete="email" />
              </label>
              <div class="form-actions">
                <span></span>
                <button class="btn" type="submit">Neues Passwort senden</button>
              </div>
            </form>` : ""}
        </section>
        <aside class="paper-card muted-card">
          <h2>Nach der Anmeldung</h2>
          <ul class="plain-list">
            <li>Alle freigegebenen Programme nutzen</li>
            <li>Passwort selbst ändern und individualisieren</li>
            <li>Bei Verlust ein neues Passwort per E-Mail erhalten</li>
          </ul>
        </aside>
      </div>
        `}
    ${!ui.workspace ? renderHelpDialog() : ""}
  `;
}

function bindGuest() {
  bindNav();
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.tab = btn.dataset.tab;
      ui.error = "";
      render();
    });
  });
  document.getElementById("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      await api("/api/login", {
        body: { email: data.get("email"), password: data.get("password") },
      });
      await boot();
    } catch (err) {
      setError(err.message);
      render();
    }
  });
  document.getElementById("register-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      const res = await api("/api/register", { body: { email: data.get("email") } });
      ui.tab = "login";
      setNotice(res.message || "Zugangsdaten wurden per E-Mail gesendet.");
      render();
    } catch (err) {
      setError(err.message);
      render();
    }
  });
  document.getElementById("forgot-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      const res = await api("/api/forgot-password", { body: { email: data.get("email") } });
      ui.tab = "login";
      setNotice(res.message || "Wenn ein Konto existiert, wurde ein neues Passwort gesendet.");
      render();
    } catch (err) {
      setError(err.message);
      render();
    }
  });
}

function navPrograms() {
  return typeof logistikPrograms !== "undefined" ? logistikPrograms : [];
}

function navIcon(program) {
  if (program && program.iconUrl) {
    return `<img src="${escapeHtml(program.iconUrl)}" alt="" width="34" height="34" />`;
  }
  return escapeHtml((program && program.icon) || "");
}

function renderSidenav() {
  const items = navPrograms();
  const activeId = ui.workspace ? ui.workspace.id : "";
  return `
    <nav class="sidenav" aria-label="Programme">
      <button type="button" class="sidenav-home ${activeId ? "" : "active"}" id="nav-home">
        <span class="logo" aria-hidden="true"><span class="logo-l">L</span><span class="logo-t">T</span></span>
        <span>Logistik-Tools</span>
      </button>
      <p class="sidenav-label">Programme</p>
      <ul class="sidenav-list">
        ${items
          .map(
            (p) => `
          <li>
            <button type="button" class="sidenav-item ${activeId === p.id ? "active" : ""}" data-open="${p.id}">
              <span class="sidenav-icon" style="--accent:${escapeHtml(p.accent || "#c45c32")}">${navIcon(p)}</span>
              <span>${escapeHtml(p.name)}</span>
            </button>
          </li>`
          )
          .join("")}
      </ul>
    </nav>`;
}

function renderApp() {
  root.innerHTML = `
        <header class="topbar">
          ${renderBrand()}
          <div class="top-actions">
            ${ui.publicMode ? "" : `
            <div class="account">
              <button class="btn ghost" type="button" id="account-btn">${escapeHtml(ui.me.email)}</button>
            </div>
            <button class="btn ghost" type="button" id="logout-btn">Abmelden</button>
            `}
          </div>
        </header>
        ${ui.error ? `<p class="banner bad">${escapeHtml(ui.error)}</p>` : ""}
        ${ui.notice ? `<p class="banner good">${escapeHtml(ui.notice)}</p>` : ""}
        ${ui.workspace ? renderWorkspace() : renderOverview()}
    ${ui.accountOpen && !ui.publicMode ? renderPasswordPanel() : ""}
    ${!ui.workspace ? renderHelpDialog() : ""}
  `;
}

function homeIcon(program) {
  if (program && program.iconUrl) {
    return `<img src="${escapeHtml(program.iconUrl)}" alt="" width="102" height="102" />`;
  }
  return escapeHtml((program && program.icon) || "");
}

function renderOverview() {
  return `
    <section class="home-icons" aria-label="Programme im Überblick">
      ${navPrograms()
        .map(
          (p) => `
        <div class="home-icon">
          <button type="button" class="home-icon-btn" aria-describedby="tip-${escapeHtml(p.id)}">
            <span class="home-icon-glyph">${homeIcon(p)}</span>
            <span class="visually-hidden">${escapeHtml(p.name)}</span>
          </button>
          ${renderInfoCloud("tip-" + escapeHtml(p.id), "home-icon-tip", escapeHtml(p.name), escapeHtml(p.description || ""))}
        </div>`
        )
        .join("")}
    </section>`;
}

function renderPasswordPanel() {
  return `
    <div class="overlay" id="pw-overlay">
      <div class="panel" role="dialog">
        <div class="panel-head">
          <div>
            <h2>Passwort ändern</h2>
            <p>Lege ein eigenes Passwort fest. Mindestens 8 Zeichen.</p>
          </div>
          <button class="icon-btn" type="button" id="close-pw">×</button>
        </div>
        <form class="form" id="pw-form">
          <label>Aktuelles Passwort
            <input name="currentPassword" type="password" required autocomplete="current-password" />
          </label>
          <label>Neues Passwort
            <input name="newPassword" type="password" required minlength="8" autocomplete="new-password" />
          </label>
          <div class="form-actions">
            <button class="btn ghost" type="button" id="close-pw-2">Abbrechen</button>
            <button class="btn" type="submit">Speichern</button>
          </div>
        </form>
      </div>
    </div>`;
}

function renderWorkspace() {
  const p = ui.workspace;
  if (!p) return "";
  let body = "";
  if (p.type === "code") {
    body = `<iframe title="${escapeHtml(p.name)}" sandbox="allow-scripts allow-forms allow-modals allow-same-origin"></iframe>`;
  } else if (p.type === "embed" && p.url) {
    body = `<iframe title="${escapeHtml(p.name)}" src="${escapeHtml(p.url)}" sandbox="allow-scripts allow-forms allow-modals allow-same-origin allow-popups allow-downloads allow-top-navigation-by-user-activation"></iframe>`;
  } else {
    body = `<div class="link-fallback"><div><h2>${escapeHtml(p.name)}</h2><p><a href="${escapeHtml(p.url || "#")}" target="_blank" rel="noopener">${escapeHtml(p.url || "")}</a></p></div></div>`;
  }
  return `
    <section class="program-stage workspace" aria-label="${escapeHtml(p.name)}">
      <div class="workspace-toolbar">
        <a class="btn" id="back-home" href="./">Zurück zur Hauptseite</a>
      </div>
      ${body}
    </section>`;
}

function markNav(id) {
  document.querySelectorAll("#sidenav .sidenav-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.open === id);
  });
  document.getElementById("nav-home")?.classList.toggle("active", !id);
}

function setProgramChrome(open) {
  const layout = document.querySelector(".app-layout");
  document.documentElement.classList.toggle("program-open", open);
  if (layout) {
    layout.classList.toggle("program-open", open);
    layout.classList.remove("nav-open");
  }
  document.documentElement.classList.remove("nav-open");
}

function showHiddenNav() {
  const layout = document.querySelector(".app-layout");
  if (!layout || !layout.classList.contains("program-open")) return;
  layout.classList.add("nav-open");
  document.documentElement.classList.add("nav-open");
}

function hideHiddenNav() {
  const layout = document.querySelector(".app-layout");
  if (!layout || !layout.classList.contains("program-open")) return;
  layout.classList.remove("nav-open");
  document.documentElement.classList.remove("nav-open");
}

function bindStaticNav() {
  if (!document.documentElement.dataset.homeBound) {
    document.documentElement.dataset.homeBound = "1";
    document.addEventListener("click", (e) => {
      if (e.target.closest("#back-home")) {
        e.preventDefault();
        goHome();
      }
    });
    window.addEventListener("message", (e) => {
      if (e.origin !== location.origin) return;
      if (e.data && e.data.type === "gogilock-home") goHome();
    });
  }
  const nav = document.getElementById("sidenav");
  const edge = document.getElementById("nav-edge");
  if (!nav || nav.dataset.bound) return;
  nav.dataset.bound = "1";
  nav.addEventListener("click", (e) => {
    const home = e.target.closest("#nav-home");
    if (home) {
      e.preventDefault();
      goHome();
      return;
    }
    const item = e.target.closest("[data-open]");
    if (!item) return;
    e.preventDefault();
    openProgram(item.dataset.open);
  });
  edge?.addEventListener("mouseenter", showHiddenNav);
  edge?.addEventListener("click", showHiddenNav);
  nav.addEventListener("mouseleave", hideHiddenNav);
  document.addEventListener("mousemove", (e) => {
    const layout = document.querySelector(".app-layout");
    if (!layout || !layout.classList.contains("program-open")) return;
    if (e.clientX <= 22) showHiddenNav();
    else if (e.clientX > 270 && !nav.contains(e.target)) hideHiddenNav();
  });
}

function homePath() {
  return location.pathname + location.search;
}

function showHome() {
  ui.workspace = null;
  ui.helpOpen = false;
  ui.view = ui.me ? "app" : "guest";
  markNav("");
  setProgramChrome(false);
  render();
}

function goHome(event) {
  if (event) event.preventDefault();
  if (location.hash) {
    history.back();
    return;
  }
  showHome();
}

function bindHomeIcons() {
  root.querySelectorAll(".home-icon-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const wrap = btn.closest(".home-icon");
      if (!wrap) return;
      const open = wrap.classList.contains("is-open");
      root.querySelectorAll(".home-icon").forEach((el) => el.classList.remove("is-open"));
      if (!open) wrap.classList.add("is-open");
    });
  });
  if (!document.documentElement.dataset.homeTipsBound) {
    document.documentElement.dataset.homeTipsBound = "1";
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".home-icon")) {
        document.querySelectorAll(".home-icon.is-open").forEach((el) => el.classList.remove("is-open"));
      }
    });
  }
}

function bindHelpBadge() {
  document.querySelector(".help-badge")?.addEventListener("click", (e) => {
    e.preventDefault();
    ui.helpOpen = true;
    render();
  });
  document.getElementById("close-help")?.addEventListener("click", closeHelp);
  document.getElementById("help-overlay")?.addEventListener("click", (e) => {
    if (e.target.id === "help-overlay") closeHelp();
  });
}

function bindNav() {
  document.getElementById("back-home")?.addEventListener("click", goHome);
  bindHomeIcons();
  bindHelpBadge();
  root.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      openProgram(el.dataset.open);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openProgram(el.dataset.open);
      }
    });
  });
  const frame = document.querySelector(".workspace iframe");
  if (frame && ui.workspace && ui.workspace.type === "code") {
    frame.srcdoc = buildSrcdoc(ui.workspace);
  }
}

function bindApp() {
  bindNav();
  document.getElementById("account-btn")?.addEventListener("click", () => {
    ui.accountOpen = true;
    render();
  });
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await api("/api/logout", { method: "POST", body: {} });
    ui.me = null;
    ui.programs = [];
    ui.tab = "login";
    setNotice("Du bist abgemeldet.");
    render();
  });
  document.getElementById("close-pw")?.addEventListener("click", closePw);
  document.getElementById("close-pw-2")?.addEventListener("click", closePw);
  document.getElementById("pw-overlay")?.addEventListener("click", (e) => {
    if (e.target.id === "pw-overlay") closePw();
  });
  document.getElementById("pw-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      const res = await api("/api/change-password", {
        body: {
          currentPassword: data.get("currentPassword"),
          newPassword: data.get("newPassword"),
        },
      });
      ui.accountOpen = false;
      setNotice(res.message || "Passwort gespeichert.");
      render();
    } catch (err) {
      setError(err.message);
      render();
    }
  });
}

function closePw() {
  ui.accountOpen = false;
  ui.error = "";
  render();
}

const HASH_BY_ID = {
  "logistik-ladeplan": "ladeplan",
  "logistik-abc": "abc-analyse",
  "logistik-lagerzonen": "abc-lagerzonen",
  "logistik-europalette": "europalettenschein",
};

const ID_BY_HASH = {
  ladeplan: "logistik-ladeplan",
  "abc-analyse": "logistik-abc",
  "abc-lagerzonen": "logistik-lagerzonen",
  europalettenschein: "logistik-europalette",
};

function setProgramUrl(id) {
  const hash = HASH_BY_ID[id];
  if (!hash) return;
  const next = "#" + hash;
  if (location.hash === next) return;
  const state = { ggl: "program", id };
  if (location.hash) {
    history.replaceState(state, "", next);
  } else {
    history.pushState(state, "", next);
  }
}

function openProgram(id, fromHistory) {
  const p = navPrograms().find((item) => item.id === id) || ui.programs.find((item) => item.id === id);
  if (!p) return;
  if (p.type === "link" && p.url) {
    window.open(p.url, "_blank", "noopener");
    return;
  }
  ui.workspace = p;
  if (!fromHistory) setProgramUrl(id);
  markNav(id);
  ui.view = ui.me ? "app" : ui.view === "loading" ? "app" : ui.view;
  if (!ui.me) {
    ui.me = { email: "" };
    ui.publicMode = true;
    ui.view = "app";
  }
  render();
}

function publicPrograms() {
  return navPrograms();
}

async function hasApi() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch("api/health", { credentials: "include", signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch (_) {
    return false;
  }
}

function isStaticHost() {
  return /\.github\.io$/i.test(location.hostname);
}

function enterPublic() {
  ui.publicMode = true;
  ui.me = { email: "" };
  ui.programs = publicPrograms();
  ui.view = "app";
  render();
}

function openFromHash(fromHistory) {
  const key = (location.hash || "").replace(/^#/, "");
  const id = ID_BY_HASH[key];
  if (id) openProgram(id, fromHistory);
}

function openLandingProgram() {
  const key = (location.hash || "").replace(/^#/, "");
  const id = ID_BY_HASH[key];
  if (!id) return;
  history.replaceState({ ggl: "home" }, "", homePath());
  history.pushState({ ggl: "program", id }, "", "#" + key);
  openProgram(id, true);
}

async function boot() {
  bindStaticNav();
  if (isStaticHost() || !(await hasApi())) {
    enterPublic();
    openLandingProgram();
    return;
  }
  try {
    const me = await api("/api/me");
    ui.me = { email: me.email };
    const list = await api("/api/programs");
    ui.programs = list.programs || [];
    ui.view = "app";
    ui.error = "";
  } catch (_) {
    enterPublic();
    openLandingProgram();
    return;
  }
  render();
  openLandingProgram();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (ui.helpOpen) {
      closeHelp();
    } else if (ui.workspace) {
      goHome();
    } else if (ui.accountOpen) {
      closePw();
    }
  }
});

window.addEventListener("popstate", () => {
  if (!location.hash) {
    showHome();
    return;
  }
  openFromHash(true);
});

boot();
