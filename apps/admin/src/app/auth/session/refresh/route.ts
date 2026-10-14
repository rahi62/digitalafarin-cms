import { NextRequest, NextResponse } from "next/server";
import { bffError, clearSessionCookies, failure, names, setSessionCookies, upstreamPost } from "@/lib/bff-session";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const denied = bffError(request);
  if (denied) return denied;
  const refresh = request.cookies.get(names.refresh)?.value;
  if (!refresh) return failure(401, "Session expired");
  try {
    const upstream = await upstreamPost("/auth/token/refresh/", { refresh });
    const data: unknown = upstream.ok ? await upstream.json() : null;
    if (!data || typeof data !== "object" ||
        typeof (data as Record<string, unknown>).access !== "string") {
      const response = failure(401, "Session expired");
      clearSessionCookies(response);
      return response;
    }
    const newData = data as { access: string; refresh?: string };
    const response = NextResponse.json({ authenticated: true }, { headers: { "Cache-Control": "no-store" } });
    setSessionCookies(response, { access: newData.access, refresh: newData.refresh || refresh });
    return response;
  } catch { return failure(503, "Session refresh unavailable"); }
}
