import http from "node:http";
const refreshSessions = new Map();
const accessSessions = new Map();
const sessions = new Map();
let counter = 0;

function respond(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
function actor(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  const sid = accessSessions.get(token);
  return sid && sessions.get(sid)?.active ? sid : null;
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
  const prefix = "/api/cms/v1/";
  const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : "";

  if (path === "auth/token/") {
    if (payload.username === "limited-user") {
      res.setHeader("Retry-After", "17");
      return respond(res, 429, { detail: "Request was throttled." });
    }
    if (req.method !== "POST" || payload.username !== "testuser" || payload.password !== "testpass")
      return respond(res, 401, { detail: "Invalid credentials" });
    counter += 1;
    const sid = "session-" + counter;
    sessions.set(sid, { id: sid, active: true, user_agent: "Test Browser", created_at: new Date().toISOString() });
    accessSessions.set("access-" + counter, sid);
    refreshSessions.set("refresh-" + counter, sid);
    return respond(res, 200, { access: "access-" + counter, refresh: "refresh-" + counter });
  }
  if (path === "auth/token/refresh/") {
    const sid = refreshSessions.get(payload.refresh);
    if (!sid || !sessions.get(sid)?.active) return respond(res, 401, { detail: "Invalid refresh" });
    refreshSessions.delete(payload.refresh);
    counter += 1;
    accessSessions.set("access-" + counter, sid);
    refreshSessions.set("refresh-" + counter, sid);
    return respond(res, 200, { access: "access-" + counter, refresh: "refresh-" + counter });
  }
  if (path === "auth/logout/") {
    const sid = actor(req);
    if (!sid || refreshSessions.get(payload.refresh) !== sid)
      return respond(res, 401, { detail: "Unauthorized" });
    refreshSessions.delete(payload.refresh);
    sessions.get(sid).active = false;
    res.writeHead(204); return res.end();
  }
  const sid = actor(req);
  if (!sid) return respond(res, 401, { detail: "Unauthorized" });
  if (path === "auth/sessions/" && req.method === "GET") {
    return respond(res, 200, {
      current_session_id: sid,
      results: [...sessions.values()].map((item) => ({
        id: item.id, current: item.id === sid, active: item.active,
        created_at: item.created_at, last_seen_at: item.created_at,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        revoked_at: item.active ? null : new Date().toISOString(), device: item.user_agent,
      })),
    });
  }
  if (path === "auth/sessions/revoke-others/" && req.method === "POST") {
    let count = 0;
    for (const session of sessions.values()) {
      if (session.id !== sid && session.active) { session.active = false; count += 1; }
    }
    return respond(res, 200, { revoked_count: count, current_revoked: false });
  }
  if (path === "auth/sessions/revoke-all/" && req.method === "POST") {
    if (payload.confirm !== true) return respond(res, 400, { detail: "Confirmation required" });
    let count = 0;
    for (const session of sessions.values()) {
      if (session.active) { session.active = false; count += 1; }
    }
    return respond(res, 200, { revoked_count: count, current_revoked: true });
  }
  const match = /^auth\/sessions\/(session-\d+)\/revoke\/$/.exec(path);
  if (match && req.method === "POST") {
    const other = sessions.get(match[1]);
    if (!other) return respond(res, 404, { detail: "Session not found" });
    other.active = false;
    return respond(res, 200, { revoked: other.id, current_revoked: sid === other.id });
  }
  if (path === "sites/" && req.method === "GET")
    return respond(res, 200, { count: 1, results: [{ id: "site-1", name: "Demo" }], next: null, previous: null });
  if (path === "content/entries/" && req.method === "POST")
    return respond(res, 201, { ok: true });
  return respond(res, 404, { detail: "Not found" });
}).listen(9779, "127.0.0.1", () => process.stdout.write("BFF upstream ready\n"));
