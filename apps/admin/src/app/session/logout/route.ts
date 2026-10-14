import type { NextRequest } from "next/server";
import { cmsUpstream, cookieRefresh, eraseSession, sessionJson, verifyCmsMutation } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifyCmsMutation(request)) return sessionJson({ detail: "Cross-origin request blocked" }, 403);
  const refresh = cookieRefresh(request);
  let revoked = !refresh;
  if (refresh) {
    try {
      const result = await cmsUpstream("/auth/token/blacklist/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      revoked = result.ok || result.status === 400 || result.status === 401;
    } catch { revoked = false; }
  }
  const response = sessionJson({ authenticated: false, refresh_revoked: revoked });
  eraseSession(response, request);
  return response;
}
