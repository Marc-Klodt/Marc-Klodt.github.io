const root = document.getElementById("app");

const ui = {
  view: "loading",
  hasAdmin: false,
  me: null,
  tab: "programs",
  gateTab: "login",
  forgotEmail: "",
  programs: [],
  users: [],
  outbox: [],
  settings: null,
  query: "",
  editor: null,
  workspace: null,
  confirm: null,
  codeTab: "html",
  error: "",
  notice: "",
};

function render() {
  if (ui.view === "loading") {
    root.innerHTML = `<div class="shell admin-shell"><p class="footer-note">Administration wird geladen …</p></div>`;
    return;
  }
  if (ui.view === "setup") {
    renderGate("Admin einrichten", "Lege E-Mail, Passwort und einen persönlichen Sicherheitscode fest. Den Code brauchst du später, falls das Passwort verloren geht.", "setup");
    bindGate();
    return;
  }
  if (ui.view === "login") {
    renderGate("Administrator-Anmeldung", "Nur der Administrator kann Programme implementieren, bearbeiten oder entfernen. E-Mail und Passwort lassen sich nach der Anmeldung jederzeit ändern.", ui.gateTab || "login");
    bindGate();
    return;
  }
  renderAdmin();
  bindAdmin();
}

function renderGate(title, text, mode) {
  const isLoginFlow = mode === "login" || mode === "forgot" || mode === "reset";
  root.innerHTML = `
    <div class="shell admin-shell">
      <header class="topbar">
        <div class="brand">
          <span class="mark"><span class="logo" aria-hidden="true"><span class="logo-l">L</span><span class="logo-t">T</span></span> GoGiLock Admin</span>
          <h1>${title}</h1>
          <p>${text}</p>
        </div>
      </header>
      <section class="paper-card auth-narrow">
        ${isLoginFlow ? `
          <div class="code-tabs auth-tabs">
            <button type="button" data-gate="login" class="${mode === "login" ? "active" : ""}">Anmelden</button>
            <button type="button" data-gate="forgot" class="${mode === "forgot" || mode === "reset" ? "active" : ""}">Passwort vergessen</button>
          </div>` : ""}
        ${ui.error ? `<p class="banner bad">${escapeHtml(ui.error)}</p>` : ""}
        ${ui.notice ? `<p class="banner good">${escapeHtml(ui.notice)}</p>` : ""}
        ${mode === "setup" ? `
        <form class="form auth-form" id="gate-form">
          <label>E-Mail
            <input name="email" type="email" required maxlength="120" autocomplete="username" />
          </label>
          <label>Passwort wählen
            <input name="password" type="password" required minlength="8" maxlength="120" autocomplete="new-password" />
          </label>
          <label>Sicherheitscode
            <input name="securityCode" type="password" required minlength="6" maxlength="32" autocomplete="off" />
          </label>
          <p class="hint">Merke dir den Sicherheitscode. Bei einem vergessenen Passwort brauchst du ihn zusammen mit einem Code aus der E-Mail.</p>
          <div class="form-actions">
            <span></span>
            <button class="btn" type="submit">Admin anlegen</button>
          </div>
        </form>` : ""}
        ${mode === "login" ? `
        <form class="form auth-form" id="gate-form">
          <label>E-Mail
            <input name="email" type="email" required maxlength="120" autocomplete="username" />
          </label>
          <label>Passwort
            <input name="password" type="password" required minlength="8" maxlength="120" autocomplete="current-password" />
          </label>
          <div class="form-actions">
            <span></span>
            <button class="btn" type="submit">Anmelden</button>
          </div>
        </form>` : ""}
        ${mode === "forgot" ? `
        <form class="form auth-form" id="forgot-form">
          <p class="hint">Wir senden einen Einmal-Code an die Admin-E-Mail. Danach brauchst du zusätzlich deinen persönlichen Sicherheitscode.</p>
          <label>E-Mail
            <input name="email" type="email" required maxlength="120" autocomplete="username" value="${escapeHtml(ui.forgotEmail || "")}" />
          </label>
          <div class="form-actions">
            <span></span>
            <button class="btn" type="submit">Code per E-Mail senden</button>
          </div>
        </form>` : ""}
        ${mode === "reset" ? `
        <form class="form auth-form" id="reset-form">
          <p class="hint">Gib den Code aus der E-Mail und deinen persönlichen Sicherheitscode ein. Danach legst du ein neues Passwort fest.</p>
          <label>E-Mail
            <input name="email" type="email" required maxlength="120" value="${escapeHtml(ui.forgotEmail || "")}" />
          </label>
          <label>Code aus der E-Mail
            <input name="mailCode" type="text" required maxlength="12" inputmode="numeric" autocomplete="one-time-code" />
          </label>
          <label>Persönlicher Sicherheitscode
            <input name="securityCode" type="password" required minlength="6" maxlength="32" autocomplete="off" />
          </label>
          <label>Neues Passwort
            <input name="newPassword" type="password" required minlength="8" maxlength="120" autocomplete="new-password" />
          </label>
          <div class="form-actions">
            <button class="btn ghost" type="button" id="back-forgot">Zurück</button>
            <button class="btn" type="submit">Passwort erneuern</button>
          </div>
        </form>` : ""}
      </section>
    </div>`;
}

function bindGate() {
  document.querySelectorAll("[data-gate]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.gateTab = btn.dataset.gate;
      ui.error = "";
      ui.notice = "";
      render();
    });
  });
  document.getElementById("gate-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const body = {
      email: data.get("email"),
      password: data.get("password"),
      securityCode: data.get("securityCode"),
    };
    try {
      if (ui.view === "setup") await api("/api/admin/setup", { body });
      else await api("/api/admin/login", { body });
      ui.error = "";
      ui.notice = "";
      await loadAdmin();
    } catch (err) {
      ui.error = err.message;
      render();
    }
  });
  document.getElementById("forgot-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    ui.forgotEmail = String(data.get("email") || "");
    try {
      const res = await api("/api/admin/forgot", { body: { email: ui.forgotEmail } });
      ui.gateTab = "reset";
      ui.notice = res.message || "Wenn die Adresse stimmt, wurde ein Code per E-Mail gesendet.";
      ui.error = "";
      render();
    } catch (err) {
      ui.error = err.message;
      render();
    }
  });
  document.getElementById("reset-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      const res = await api("/api/admin/reset", {
        body: {
          email: data.get("email"),
          mailCode: data.get("mailCode"),
          securityCode: data.get("securityCode"),
          newPassword: data.get("newPassword"),
        },
      });
      ui.gateTab = "login";
      ui.notice = res.message || "Passwort erneuert. Bitte anmelden.";
      ui.error = "";
      render();
    } catch (err) {
      ui.error = err.message;
      render();
    }
  });
  document.getElementById("back-forgot")?.addEventListener("click", () => {
    ui.gateTab = "forgot";
    ui.error = "";
    render();
  });
}

function renderAdmin() {
  root.innerHTML = `
    <div class="shell admin-shell">
      <header class="topbar">
        <div class="brand">
          <span class="mark"><span class="logo" aria-hidden="true"><span class="logo-l">L</span><span class="logo-t">T</span></span> GoGiLock Admin</span>
          <h1>Programme verwalten</h1>
          <p>Hier implementierst du Programme, entfernst sie wieder und legst fest, wie Zugangsdaten per E-Mail rausgehen.</p>
        </div>
        <div class="top-actions">
          <span class="footer-note" style="margin:0">${escapeHtml(ui.me.email)}</span>
          <button class="btn ghost" type="button" id="logout-admin">Abmelden</button>
        </div>
      </header>
      <div class="code-tabs admin-tabs">
        <button type="button" data-admin-tab="programs" class="${ui.tab === "programs" ? "active" : ""}">Programme</button>
        <button type="button" data-admin-tab="users" class="${ui.tab === "users" ? "active" : ""}">Benutzer</button>
        <button type="button" data-admin-tab="mail" class="${ui.tab === "mail" ? "active" : ""}">E-Mail</button>
        <button type="button" data-admin-tab="account" class="${ui.tab === "account" ? "active" : ""}">Konto</button>
      </div>
      ${ui.error ? `<p class="banner bad">${escapeHtml(ui.error)}</p>` : ""}
      ${ui.notice ? `<p class="banner good">${escapeHtml(ui.notice)}</p>` : ""}
      ${ui.tab === "programs" ? renderProgramsTab() : ""}
      ${ui.tab === "users" ? renderUsersTab() : ""}
      ${ui.tab === "mail" ? renderMailTab() : ""}
      ${ui.tab === "account" ? renderAccountTab() : ""}
    </div>
    ${renderEditor()}
    ${renderWorkspace()}
    ${renderConfirm()}
  `;
}

function renderProgramsTab() {
  const programs = filteredPrograms();
  return `
    <div class="top-actions" style="margin:16px 0 22px;justify-content:flex-start">
      <label class="search">
        <span aria-hidden="true">⌕</span>
        <input id="search" type="search" placeholder="Suchen …" value="${escapeHtml(ui.query)}" />
      </label>
      <button class="btn" type="button" id="add-btn">+ Programm implementieren</button>
    </div>
    <section class="board">
      ${
        programs.length === 0
          ? `<div class="empty">Noch keine Programme.</div>`
          : programs
              .map(
                (p) => `
          <article class="card" tabindex="0" data-open="${p.id}" style="--accent:${escapeHtml(p.accent || "#c45c32")}">
            <div class="tab"></div>
            <div class="card-body">
              <div class="icon">${escapeHtml(p.icon || "⌘")}</div>
              <h2>${escapeHtml(p.name)}</h2>
              <p>${escapeHtml(p.description || "")}</p>
              <div class="meta"><span>${typeLabel(p.type)}</span><span>Admin</span></div>
            </div>
            <button class="remove" type="button" data-remove="${p.id}" aria-label="Entfernen">×</button>
          </article>`
              )
              .join("")
      }
      <button class="add-tile" id="add-tile" type="button"><strong>+</strong><span>Programm hinzufügen</span></button>
    </section>`;
}

function renderAccountTab() {
  return `
    <form class="paper-card form" id="account-form" style="margin-top:18px">
      <p class="hint">Hier änderst du die Admin-E-Mail, das Passwort und den persönlichen Sicherheitscode. Zum Speichern ist das aktuelle Passwort nötig.</p>
      ${ui.me && ui.me.hasPin === false ? `<p class="banner bad">Es ist noch kein Sicherheitscode hinterlegt. Lege einen fest, damit du das Passwort per E-Mail zurücksetzen kannst.</p>` : ""}
      <label>Aktuelle E-Mail
        <input name="email" type="email" required maxlength="120" value="${escapeHtml((ui.me && ui.me.email) || "")}" />
      </label>
      <label>Neues Passwort
        <input name="newPassword" type="password" minlength="8" maxlength="120" autocomplete="new-password" placeholder="leer lassen, um es zu behalten" />
      </label>
      <label>Neuer Sicherheitscode
        <input name="securityCode" type="password" minlength="6" maxlength="32" autocomplete="off" placeholder="leer lassen, um ihn zu behalten" />
      </label>
      <label>Aktuelles Passwort zur Bestätigung
        <input name="currentPassword" type="password" required minlength="8" maxlength="120" autocomplete="current-password" />
      </label>
      <div class="form-actions">
        <span></span>
        <button class="btn" type="submit">Zugang speichern</button>
      </div>
    </form>`;
}

function renderUsersTab() {
  if (!ui.users.length) {
    return `<div class="empty">Noch keine registrierten Benutzer.</div>`;
  }
  return `
    <div class="paper-card" style="margin-top:18px">
      <table class="plain-table">
        <thead><tr><th>E-Mail</th><th>Registriert</th></tr></thead>
        <tbody>
          ${ui.users
            .map(
              (u) =>
                `<tr><td>${escapeHtml(u.email)}</td><td>${escapeHtml(formatDate(u.createdAt))}</td></tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function renderMailTab() {
  const s = ui.settings || {};
  return `
    <form class="paper-card form" id="mail-form" style="margin-top:18px">
      <p class="hint">Zugangsdaten für neue Konten und neue Passwörter werden per E-Mail verschickt. Im Testmodus landen die Mails im Postausgang dieser Seite, bis SMTP eingerichtet ist.</p>
      <label class="check-row">
        <input name="testMode" type="checkbox" ${s.testMode ? "checked" : ""} />
        Testmodus (Mails nur intern speichern)
      </label>
      <div class="row">
        <label>SMTP-Server
          <input name="host" type="text" value="${escapeHtml(s.host || "")}" placeholder="smtp.example.com" />
        </label>
        <label>Port
          <input name="port" type="text" value="${escapeHtml(String(s.port || 587))}" />
        </label>
      </div>
      <div class="row">
        <label>Benutzername
          <input name="user" type="text" value="${escapeHtml(s.user || "")}" />
        </label>
        <label>SMTP-Passwort
          <input name="password" type="password" placeholder="${s.hasPassword ? "unverändert lassen" : "optional"}" />
        </label>
      </div>
      <div class="row">
        <label>Absender-E-Mail
          <input name="fromEmail" type="email" value="${escapeHtml(s.fromEmail || "")}" />
        </label>
        <label>Absendername
          <input name="fromName" type="text" value="${escapeHtml(s.fromName || "GoGiLock")}" />
        </label>
      </div>
      <label class="check-row">
        <input name="enableSsl" type="checkbox" ${s.enableSsl ? "checked" : ""} />
        Verschlüsselung (SSL/TLS)
      </label>
      <div class="form-actions">
        <span></span>
        <button class="btn" type="submit">E-Mail speichern</button>
      </div>
    </form>
    <div class="paper-card" style="margin-top:18px">
      <h2>Postausgang</h2>
      <p class="hint">Hier siehst du die zuletzt erzeugten System-Mails. Im Testmodus steht das generierte Passwort in der gespeicherten Datei.</p>
      ${
        !(ui.outbox || []).length
          ? `<p class="hint">Noch keine Mails.</p>`
          : `<table class="plain-table"><thead><tr><th>An</th><th>Betreff</th><th>Modus</th><th></th></tr></thead><tbody>
            ${ui.outbox
              .map(
                (m) => `<tr>
                  <td>${escapeHtml(m.to)}</td>
                  <td>${escapeHtml(m.subject)}</td>
                  <td>${escapeHtml(m.mode || "")}</td>
                  <td><button class="btn ghost" type="button" data-mail="${escapeHtml(m.id)}">Öffnen</button></td>
                </tr>`
              )
              .join("")}
          </tbody></table>`
      }
    </div>`;
}

function renderEditor() {
  const ed = ui.editor;
  if (!ed) return "";
  const p = ed.program;
  const type = p.type || "code";
  return `
    <div class="overlay" id="editor-overlay">
      <div class="panel" role="dialog">
        <div class="panel-head">
          <div>
            <h2>${ed.mode === "edit" ? "Programm bearbeiten" : "Programm implementieren"}</h2>
            <p>Nur Administratoren können Programme anlegen oder ändern.</p>
          </div>
          <button class="icon-btn" type="button" id="close-editor">×</button>
        </div>
        <form class="form" id="program-form">
          <div class="row">
            <label>Name
              <input name="name" required maxlength="60" value="${escapeHtml(p.name || "")}" />
            </label>
            <label>Symbol
              <input name="icon" maxlength="4" value="${escapeHtml(p.icon || "⌘")}" />
            </label>
          </div>
          <label>Beschreibung
            <input name="description" maxlength="160" value="${escapeHtml(p.description || "")}" />
          </label>
          <div>
            <div style="margin-bottom:8px;font-size:0.86rem;font-weight:500">Art</div>
            <div class="types">
              <button class="type-btn ${type === "code" ? "active" : ""}" type="button" data-type="code"><strong>Eigenes Programm</strong><span>HTML, CSS, JavaScript</span></button>
              <button class="type-btn ${type === "link" ? "active" : ""}" type="button" data-type="link"><strong>Link</strong><span>Öffnet eine Web-App</span></button>
              <button class="type-btn ${type === "embed" ? "active" : ""}" type="button" data-type="embed"><strong>Einbettung</strong><span>In GoGiLock anzeigen</span></button>
            </div>
          </div>
          ${
            type === "code"
              ? `
            <div class="code-tabs">
              <button type="button" data-code-tab="html" class="${ui.codeTab === "html" ? "active" : ""}">HTML</button>
              <button type="button" data-code-tab="css" class="${ui.codeTab === "css" ? "active" : ""}">CSS</button>
              <button type="button" data-code-tab="js" class="${ui.codeTab === "js" ? "active" : ""}">JavaScript</button>
            </div>
            <label class="${ui.codeTab === "html" ? "" : "hidden"}">HTML<textarea name="html">${escapeHtml(p.html || "")}</textarea></label>
            <label class="${ui.codeTab === "css" ? "" : "hidden"}">CSS<textarea name="css">${escapeHtml(p.css || "")}</textarea></label>
            <label class="${ui.codeTab === "js" ? "" : "hidden"}">JavaScript<textarea name="js">${escapeHtml(p.js || "")}</textarea></label>
            <div class="drop-hint" id="drop-hint">HTML-Datei hierher ziehen oder klicken</div>
            <input id="html-file" class="hidden" type="file" accept=".html,.htm,.js,.css" />`
              : `<label>Adresse<input name="url" type="url" required placeholder="https://…" value="${escapeHtml(p.url || "")}" /></label>`
          }
          <div>
            <div style="margin-bottom:8px;font-size:0.86rem;font-weight:500">Farbe</div>
            <div class="swatches">
              ${ACCENTS.map((a) => `<button class="swatch ${p.accent === a.value ? "active" : ""}" type="button" data-accent="${a.value}" title="${a.label}" style="background:${a.value}"></button>`).join("")}
            </div>
          </div>
          <div class="form-actions">
            <button class="btn ghost" type="button" id="cancel-editor">Abbrechen</button>
            <button class="btn" type="submit">${ed.mode === "edit" ? "Speichern" : "Hinzufügen"}</button>
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
      <div class="panel wide workspace">
        <div class="workspace-toolbar">
          <h2>${escapeHtml(p.icon || "")} ${escapeHtml(p.name)}</h2>
          <div class="top-actions">
            <button class="btn ghost" type="button" id="edit-open">Bearbeiten</button>
            <button class="btn ghost" type="button" data-remove="${p.id}">Entfernen</button>
            <button class="btn" type="button" id="close-workspace">Schließen</button>
          </div>
        </div>
        ${body}
      </div>
    </div>`;
}

function renderConfirm() {
  if (!ui.confirm) return "";
  return `
    <div class="overlay" id="confirm-overlay">
      <div class="panel confirm">
        <h2>Programm entfernen?</h2>
        <p>„${escapeHtml(ui.confirm.name)}“ verschwindet für alle Benutzer.</p>
        <div class="form-actions">
          <button class="btn ghost" type="button" id="cancel-remove">Behalten</button>
          <button class="btn danger" type="button" id="ok-remove">Entfernen</button>
        </div>
      </div>
    </div>`;
}

function bindAdmin() {
  document.getElementById("logout-admin")?.addEventListener("click", async () => {
    await api("/api/admin/logout", { method: "POST", body: {} });
    ui.me = null;
    ui.view = "login";
    ui.gateTab = "login";
    render();
  });
  document.querySelectorAll("[data-admin-tab]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      ui.tab = btn.dataset.adminTab;
      ui.error = "";
      if (ui.tab === "users") ui.users = (await api("/api/admin/users")).users || [];
      if (ui.tab === "mail") {
        ui.settings = await api("/api/admin/settings");
        ui.outbox = (await api("/api/admin/outbox")).items || [];
      }
      render();
    });
  });
  document.getElementById("add-btn")?.addEventListener("click", openCreate);
  document.getElementById("add-tile")?.addEventListener("click", openCreate);
  const search = document.getElementById("search");
  if (search) {
    search.addEventListener("input", (e) => {
      ui.query = e.target.value;
      render();
      const next = document.getElementById("search");
      next.focus();
      next.setSelectionRange(ui.query.length, ui.query.length);
    });
  }
  root.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-remove]")) return;
      openProgram(el.dataset.open);
    });
  });
  root.querySelectorAll("[data-remove]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      ui.confirm = ui.programs.find((p) => p.id === el.dataset.remove);
      render();
    });
  });
  document.getElementById("cancel-remove")?.addEventListener("click", () => {
    ui.confirm = null;
    render();
  });
  document.getElementById("ok-remove")?.addEventListener("click", async () => {
    await api("/api/admin/programs/" + encodeURIComponent(ui.confirm.id), { method: "DELETE" });
    ui.programs = ui.programs.filter((p) => p.id !== ui.confirm.id);
    ui.confirm = null;
    ui.workspace = null;
    ui.notice = "Programm entfernt.";
    render();
  });
  document.getElementById("close-editor")?.addEventListener("click", closeEditor);
  document.getElementById("cancel-editor")?.addEventListener("click", closeEditor);
  document.getElementById("close-workspace")?.addEventListener("click", () => {
    ui.workspace = null;
    render();
  });
  document.getElementById("edit-open")?.addEventListener("click", () => {
    const current = ui.workspace;
    ui.workspace = null;
    openEdit(current.id);
  });
  document.querySelectorAll("[data-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncEditorFromForm();
      ui.editor.program.type = btn.dataset.type;
      if (btn.dataset.type === "code" && !ui.editor.program.html) {
        Object.assign(ui.editor.program, CODE_TEMPLATE);
      }
      render();
    });
  });
  document.querySelectorAll("[data-code-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncEditorFromForm();
      ui.codeTab = btn.dataset.codeTab;
      render();
    });
  });
  document.querySelectorAll("[data-accent]").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncEditorFromForm();
      ui.editor.program.accent = btn.dataset.accent;
      render();
    });
  });
  document.getElementById("program-form")?.addEventListener("submit", onSave);
  const drop = document.getElementById("drop-hint");
  const fileInput = document.getElementById("html-file");
  if (drop && fileInput) {
    drop.addEventListener("click", () => fileInput.click());
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("over");
      if (e.dataTransfer.files[0]) importCodeFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener("change", () => {
      if (fileInput.files[0]) importCodeFile(fileInput.files[0]);
    });
  }
  const frame = document.querySelector(".workspace iframe");
  if (frame && ui.workspace && ui.workspace.type === "code") {
    frame.srcdoc = buildSrcdoc(ui.workspace);
  }
  document.getElementById("account-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      const res = await api("/api/admin/account", {
        method: "PUT",
        body: {
          currentPassword: data.get("currentPassword"),
          email: data.get("email"),
          newPassword: data.get("newPassword"),
          securityCode: data.get("securityCode"),
        },
      });
      ui.me = { email: res.email, hasPin: !!res.hasPin };
      ui.notice = res.message || "Admin-Zugang gespeichert.";
      ui.error = "";
      render();
    } catch (err) {
      ui.error = err.message;
      render();
    }
  });
  document.getElementById("mail-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      ui.settings = await api("/api/admin/settings", {
        method: "PUT",
        body: {
          testMode: data.get("testMode") === "on",
          host: data.get("host"),
          port: Number(data.get("port") || 587),
          user: data.get("user"),
          password: data.get("password"),
          fromEmail: data.get("fromEmail"),
          fromName: data.get("fromName"),
          enableSsl: data.get("enableSsl") === "on",
        },
      });
      ui.notice = "E-Mail-Einstellungen gespeichert.";
      ui.error = "";
      render();
    } catch (err) {
      ui.error = err.message;
      render();
    }
  });
  document.querySelectorAll("[data-mail]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const res = await api("/api/admin/outbox/" + encodeURIComponent(btn.dataset.mail));
      alert(res.body || "");
    });
  });
}

function filteredPrograms() {
  const q = ui.query.trim().toLowerCase();
  if (!q) return ui.programs;
  return ui.programs.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(q));
}

function typeLabel(type) {
  if (type === "link") return "Link";
  if (type === "embed") return "Einbettung";
  return "Eigenes Programm";
}

function blankProgram() {
  return {
    name: "",
    description: "",
    icon: "⌘",
    accent: ACCENTS[0].value,
    type: "code",
    url: "",
    html: CODE_TEMPLATE.html,
    css: CODE_TEMPLATE.css,
    js: CODE_TEMPLATE.js,
  };
}

function openCreate() {
  ui.codeTab = "html";
  ui.editor = { mode: "create", program: blankProgram() };
  render();
}

function openEdit(id) {
  const p = ui.programs.find((item) => item.id === id);
  if (!p) return;
  ui.codeTab = "html";
  ui.editor = { mode: "edit", program: Object.assign({}, p) };
  render();
}

function closeEditor() {
  ui.editor = null;
  render();
}

function syncEditorFromForm() {
  const form = document.getElementById("program-form");
  if (!form || !ui.editor) return;
  const data = new FormData(form);
  const p = ui.editor.program;
  p.name = String(data.get("name") || p.name);
  p.icon = String(data.get("icon") || p.icon);
  p.description = String(data.get("description") || "");
  if (data.has("url")) p.url = String(data.get("url") || "");
  if (data.has("html")) p.html = String(data.get("html") || "");
  if (data.has("css")) p.css = String(data.get("css") || "");
  if (data.has("js")) p.js = String(data.get("js") || "");
}

async function onSave(e) {
  e.preventDefault();
  syncEditorFromForm();
  const p = ui.editor.program;
  const path =
    ui.editor.mode === "edit"
      ? "/api/admin/programs/" + encodeURIComponent(p.id)
      : "/api/admin/programs";
  const saved = await api(path, {
    method: ui.editor.mode === "edit" ? "PUT" : "POST",
    body: p,
  });
  const next = saved.program;
  if (ui.editor.mode === "edit") {
    ui.programs = ui.programs.map((item) => (item.id === next.id ? next : item));
  } else {
    ui.programs.push(next);
  }
  ui.editor = null;
  ui.notice = "Programm gespeichert.";
  render();
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

async function importCodeFile(file) {
  const text = await file.text();
  syncEditorFromForm();
  Object.assign(ui.editor.program, fileToProgram(file, text));
  ui.editor.program.type = "code";
  ui.codeTab = "html";
  render();
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("de-DE");
}

async function loadAdmin() {
  const me = await api("/api/admin/me");
  ui.me = { email: me.email, hasPin: !!me.hasPin };
  ui.programs = (await api("/api/admin/programs")).programs || [];
  ui.view = "app";
  render();
}

async function boot() {
  try {
    const status = await api("/api/admin/status");
    ui.hasAdmin = !!status.hasAdmin;
    if (!ui.hasAdmin) {
      ui.view = "setup";
      render();
      return;
    }
    await loadAdmin();
  } catch (err) {
    ui.view = ui.hasAdmin || err.status === 401 ? "login" : "setup";
    if (!ui.hasAdmin) {
      try {
        ui.hasAdmin = !!(await api("/api/admin/status")).hasAdmin;
        ui.view = ui.hasAdmin ? "login" : "setup";
      } catch (_) {}
    }
    render();
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (ui.confirm) {
    ui.confirm = null;
    render();
  } else if (ui.editor) closeEditor();
  else if (ui.workspace) {
    ui.workspace = null;
    render();
  }
});

boot();
