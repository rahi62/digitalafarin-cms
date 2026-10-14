import type { NextRequest } from "next/server";
import { cmsUpstream, eraseSession, saveSession, sessionJson, verifyCmsMutation } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifyCmsMutation(request)) return sessionJson({ detail: "Cross-origin request blocked" }, 403);
  if (Number(request.headers.get("content-length") || "0") > 16_384) {
    return sessionJson({ detail: "Request too large" }, 413);
  }
  let payload: { username?: unknown; password?: unknown };
  try { payload = await request.json(); } catch { return sessionJson({ detail: "Invalid credentials" }, 400); }
  if (typeof payload.username !== "string" || !payload.username ||
      typeof payload.password !== "string" || !payload.password ||
      payload.username.length > 254 || payload.password.length > 1024) {
    return sessionJson({ detail: "Invalid credentials" }, 400);
  }
  try {
    const upstream = await cmsUpstream("/auth/token/", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: payload.username, password: payload.password }),
    });
    if (!upstream.ok) return sessionJson({ detail: "نام کاربری یا رمز عبور نادرست است" }, 401);
    const tokens = await upstream.json() as { access?: unknown; refresh?: unknown };
    if (typeof tokens.access !== "string" || typeof tokens.refresh !== "string") {
      return sessionJson({ detail: "CMS authentication service returned invalid tokens" }, 502);
    }
    const result = sessionJson({ authenticated: true });
    eraseSession(result, request);
    saveSession(result, request, tokens.access, tokens.refresh);
    return result;
  } catch {
    return sessionJson({ detail: "سرویس ورود در دسترس نیست" }, 503);
  }
}
