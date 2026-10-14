import { NextRequest, NextResponse } from "next/server";
import { bffError, clearSessionCookies, names, upstreamPost, parseTokenResponse } from "@/lib/bff-session";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const denied = bffError(request);
  if (denied) return denied;
  const access = request.cookies.get(names.access)?.value;
  const refresh = request.cookies.get(names.refresh)?.value;
  if (refresh) {
    try {
      const first = access ? await upstreamPost("/auth/logout/", { refresh }, access) : null;
      if (!first?.ok) {
        // A stale access JWT cannot blacklist refresh. Rotate once and revoke its replacement.
        const rotation = await upstreamPost("/auth/token/refresh/", { refresh });
        const tokens = await parseTokenResponse(rotation);
        if (tokens) await upstreamPost("/auth/logout/", { refresh: tokens.refresh }, tokens.access);
      }
    } catch { /* Clearing local cookies is still mandatory on network failure. */ }
  }
  const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  clearSessionCookies(response);
  return response;
}
