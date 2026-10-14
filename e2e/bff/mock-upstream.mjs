import http from "node:http";
const activeRefresh = new Set();
let counter = 0;
function respond(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}
http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1:9779");
  if (url.pathname === "/health") return respond(res, 200, { ok: true });
  let payload = {};
  try {
    let text = "";
    for await (const chunk of req) text += chunk.toString();
    payload = text ? JSON.parse(text) : {};
  } catch { return respond(res, 400, { detail: "Invalid JSON" }); }
  if (url.pathname === "/api/cms/v1/auth/token/") {
    if (req.method !== "POST" || payload.username !== "testuser" || payload.password !== "testpass")
      return respond(res, 401, { detail: "Invalid credentials" });
    counter += 1;
    activeRefresh.add("refresh-" + counter);
    return respond(res, 200, { access: "access-" + counter, refresh: "refresh-" + counter });
  }
  if (url.pathname === "/api/cms/v1/auth/token/refresh/") {
    if (!activeRefresh.delete(payload.refresh)) return respond(res, 401, { detail: "Invalid refresh" });
    counter += 1;
    activeRefresh.add("refresh-" + counter);
    return respond(res, 200, { access: "access-" + counter, refresh: "refresh-" + counter });
  }
  if (url.pathname === "/api/cms/v1/auth/logout/") {
    if (!req.headers.authorization?.startsWith("Bearer access-") || !activeRefresh.has(payload.refresh))
      return respond(res, 401, { detail: "Unauthorized" });
    activeRefresh.delete(payload.refresh);
    res.writeHead(204); return res.end();
  }
  if (url.pathname === "/api/cms/v1/sites/" && req.method === "GET") {
    if (!req.headers.authorization?.startsWith("Bearer access-"))
      return respond(res, 401, { detail: "Unauthorized" });
    return respond(res, 200, { count: 1, results: [{ id: "site-1", name: "Demo" }], next: null, previous: null });
  }
  if (url.pathname === "/api/cms/v1/content/entries/" && req.method === "POST") {
    if (!req.headers.authorization?.startsWith("Bearer access-"))
      return respond(res, 401, { detail: "Unauthorized" });
    return respond(res, 201, { ok: true });
  }
  return respond(res, 404, { detail: "Not found" });
}).listen(9779, "127.0.0.1", () => process.stdout.write("BFF upstream ready\n"));
