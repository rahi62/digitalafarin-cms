import type { NextRequest } from "next/server";
import { cmsUpstream, cookieRefresh, eraseSession, saveSession, sessionDenied, sessionJson, verifyCmsMutation } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifyCmsMutation(request)) return sessionJson({ detail: "Cross-origin request blocked" }, 403);
  const refresh = cookieRefresh(request);
  if (!refresh) return sessionDenied("Session expired");
  try {
    const upstream = await cmsUpstream("/auth/token/refresh/", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!upstream.ok) {
      const denied = sessionDenied("Session expired");
      eraseSession(denied, request);
      return denied;
    }
    const tokens = await upstream.json() as { access?: unknown; refresh?: unknown };
    if (typeof tokens.access !== "string" || typeof tokens.refresh !== "string") {
      return sessionJson({ detail: "Refresh token rotation is not enabled in Django CMS" }, 503);
    }
    const result = sessionJson({ authenticated: true });
    saveSession(result, request, tokens.access, tokens.refresh);
    return result;
  } catch {
    return sessionJson({ detail: "Authentication service unavailable" }, 503);
  }
}
