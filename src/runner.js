function buildSrcdoc(program) {
  const html = program.html || "";
  const css = program.css || "";
  const js = program.js || "";
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(program.name || "Programm")}</title>
  <style>${css}</style>
</head>
<body>
${html}
<script>
try {
${js}
} catch (err) {
  document.body.insertAdjacentHTML("beforeend",
    '<pre style="color:#8a3d4a;padding:16px;white-space:pre-wrap;">' +
    String(err) + "</pre>"
  );
}
</script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fileToProgram(file, text) {
  const name = file.name.replace(/\.[^.]+$/, "") || "Importiertes Programm";
  const isHtml = /\.html?$/i.test(file.name);

  if (isHtml) {
    const styleMatch = text.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const scriptMatch = text.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return {
      name,
      description: `Importiert aus ${file.name}`,
      icon: "⌘",
      accent: "#c45c32",
      type: "code",
      html: bodyMatch ? bodyMatch[1].trim() : text,
      css: styleMatch ? styleMatch[1].trim() : "",
      js: scriptMatch ? scriptMatch[1].trim() : "",
    };
  }

  return {
    name,
    description: `Importiert aus ${file.name}`,
    icon: "⌘",
    accent: "#5a6b4a",
    type: "code",
    html: `<pre id="out"></pre>`,
    css: `body{margin:0;padding:20px;background:#f3eee4;font-family:ui-monospace,monospace;}`,
    js: text,
  };
}
