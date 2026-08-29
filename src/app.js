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
    root.innerHTML = `<div class="shell"><p class="footer-note">Logistik-Tools wird geladen …</p></div>`;
    return;
  }
  if (!ui.me) {
    renderGuest();
    bindGuest();
    return;
  }
  renderApp();
  bindApp();
}

function renderGuest() {
  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <span class="mark"><span class="logo" aria-hidden="true"><span class="logo-l">L</span><span class="logo-t">T</span></span> GoGiLock</span>
          <h1>Logistik-Tools</h1>
          <p>Programme für alle, die angemeldet sind. Registriere dich mit einer gültigen E-Mail-Adresse. Dein Login wird automatisch erzeugt und per E-Mail zugestellt.</p>
        </div>
      </header>
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
    </div>
  `;
}

function bindGuest() {
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

function renderApp() {
  const programs = filteredPrograms();
  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <span class="mark"><span class="logo" aria-hidden="true"><span class="logo-l">L</span><span class="logo-t">T</span></span> GoGiLock</span>
          <h1>Logistik-Tools</h1>
          <p>${ui.publicMode
            ? "Notizen, Rechner und Stoppuhr – direkt im Browser."
            : "Nach der Anmeldung stehen dir alle von der Administration bereitgestellten Programme zur Verfügung."}</p>
        </div>
        <div class="top-actions">
          <label class="search">
            <span aria-hidden="true">⌕</span>
            <input id="search" type="search" placeholder="Suchen …" value="${escapeHtml(ui.query)}" />
          </label>
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
      <section class="board" aria-label="Programme">
        ${
          ui.programs.length === 0
            ? `<div class="empty">Noch keine Programme. Die Administration kann sie hinterlegen.</div>`
            : programs
                .map(
                  (p) => `
            <article class="card" tabindex="0" data-open="${p.id}" style="--accent:${escapeHtml(p.accent || "#c45c32")}">
              <div class="tab"></div>
              <div class="card-body">
                <div class="icon">${escapeHtml(p.icon || "⌘")}</div>
                <h2>${escapeHtml(p.name)}</h2>
                <p>${escapeHtml(p.description || "")}</p>
                <div class="meta"><span>${typeLabel(p.type)}</span><span>${ui.publicMode ? "Öffentlich" : "Freigegeben"}</span></div>
              </div>
            </article>`
                )
                .join("")
        }
      </section>
    </div>
    ${ui.accountOpen && !ui.publicMode ? renderPasswordPanel() : ""}
    ${renderWorkspace()}
  `;
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
    body = `<iframe title="${escapeHtml(p.name)}" src="${escapeHtml(p.url)}" sandbox="allow-scripts allow-forms allow-same-origin allow-popups"></iframe>`;
  } else {
    body = `<div class="link-fallback"><div><h2>${escapeHtml(p.name)}</h2><p><a href="${escapeHtml(p.url || "#")}" target="_blank" rel="noopener">${escapeHtml(p.url || "")}</a></p></div></div>`;
  }
  return `
    <div class="overlay" id="workspace-overlay">
      <div class="panel wide workspace" role="dialog">
        <div class="workspace-toolbar">
          <h2>${escapeHtml(p.icon || "")} ${escapeHtml(p.name)}</h2>
          <button class="btn" type="button" id="close-workspace">Schließen</button>
        </div>
        ${body}
      </div>
    </div>`;
}

function bindApp() {
  document.getElementById("search")?.addEventListener("input", (e) => {
    ui.query = e.target.value;
    const active = document.activeElement === e.target;
    render();
    if (active) {
      const next = document.getElementById("search");
      next.focus();
      next.setSelectionRange(ui.query.length, ui.query.length);
    }
  });
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
  root.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", () => openProgram(el.dataset.open));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openProgram(el.dataset.open);
      }
    });
  });
  document.getElementById("close-workspace")?.addEventListener("click", () => {
    ui.workspace = null;
    render();
  });
  document.getElementById("workspace-overlay")?.addEventListener("click", (e) => {
    if (e.target.id === "workspace-overlay") {
      ui.workspace = null;
      render();
    }
  });
  const frame = document.querySelector(".workspace iframe");
  if (frame && ui.workspace && ui.workspace.type === "code") {
    frame.srcdoc = buildSrcdoc(ui.workspace);
  }
}

function closePw() {
  ui.accountOpen = false;
  ui.error = "";
  render();
}

function filteredPrograms() {
  const q = ui.query.trim().toLowerCase();
  if (!q) return ui.programs;
  return ui.programs.filter((p) =>
    `${p.name} ${p.description} ${p.type}`.toLowerCase().includes(q)
  );
}

function typeLabel(type) {
  if (type === "link") return "Link";
  if (type === "embed") return "Einbettung";
  return "Programm";
}

function openProgram(id) {
  const p = ui.programs.find((item) => item.id === id);
  if (!p) return;
  if (p.type === "link" && p.url) {
    window.open(p.url, "_blank", "noopener");
    return;
  }
  ui.workspace = p;
  render();
}

function publicPrograms() {
  if (typeof builtins === "undefined") return [];
  return builtins.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    icon: p.icon,
    accent: p.accent,
    type: p.type || "code",
    url: p.url || "",
    html: p.html || "",
    css: p.css || "",
    js: p.js || "",
  }));
}

async function hasApi() {
  try {
    const res = await fetch("api/health", { credentials: "include" });
    return res.ok;
  } catch (_) {
    return false;
  }
}

async function boot() {
  ui.view = "loading";
  render();
  if (!(await hasApi())) {
    ui.publicMode = true;
    ui.me = { email: "" };
    ui.programs = publicPrograms();
    ui.view = "app";
    render();
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
    ui.me = null;
    ui.view = "guest";
  }
  render();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (ui.workspace) {
      ui.workspace = null;
      render();
    } else if (ui.accountOpen) {
      closePw();
    }
  }
});

boot();
