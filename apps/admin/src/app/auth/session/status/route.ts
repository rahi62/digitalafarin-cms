import { NextRequest, NextResponse } from "next/server";
import { names, ready } from "@/lib/bff-session";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  // This is a local cookie-presence hint, not proof of Django authorization.
  return NextResponse.json({
    configured: ready(),
    hasSession: ready() && Boolean(request.cookies.get(names.refresh)?.value),
  }, { headers: { "Cache-Control": "no-store" } });
}
