function api(path, options) {
  options = options || {};
  const init = {
    method: options.method || (options.body ? "POST" : "GET"),
    credentials: "include",
    headers: { Accept: "application/json" },
  };
  if (options.body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  return fetch(path, init).then(async (res) => {
    let data = {};
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok) {
      const err = new Error(data.error || "Die Anfrage ist fehlgeschlagen.");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  });
}
