import { NextRequest, NextResponse } from "next/server";
import { bffError, clearSessionCookies, names, upstreamPost } from "@/lib/bff-session";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const denied = bffError(request);
  if (denied) return denied;
  const access = request.cookies.get(names.access)?.value;
  const refresh = request.cookies.get(names.refresh)?.value;
  if (access && refresh) {
    try { await upstreamPost("/auth/logout/", { refresh }, access); }
    catch { /* Clearing local session is still mandatory on network failure. */ }
  }
  const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  clearSessionCookies(response);
  return response;
}
