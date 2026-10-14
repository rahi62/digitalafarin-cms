import type { NextRequest } from "next/server";
import { cmsUpstream, cookieAccess, sessionDenied, sessionJson } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = cookieAccess(request);
  if (!access) return sessionDenied();
  try {
    const upstream = await cmsUpstream("/sites/?page_size=1", {
      headers: { Authorization: "Bearer " + access, Accept: "application/json" },
    });
    if (upstream.status === 401) return sessionDenied("Session expired");
    if (upstream.status === 403) return sessionJson({ detail: "Access denied" }, 403);
    if (!upstream.ok) return sessionJson({ detail: "Authentication service unavailable" }, 503);
    return sessionJson({ authenticated: true });
  } catch {
    return sessionJson({ detail: "Authentication service unavailable" }, 503);
  }
}
