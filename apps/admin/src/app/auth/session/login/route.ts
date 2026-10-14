import { NextRequest, NextResponse } from "next/server";
import { bffError, failure, newCsrf, parseTokenResponse, setSessionCookies, upstreamPost } from "@/lib/bff-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const denied = bffError(request, false);
  if (denied) return denied;
  let credentials: unknown;
  try { credentials = await request.json(); } catch { return failure(400, "Invalid request body"); }
  if (!credentials || typeof credentials !== "object") return failure(400, "Invalid credentials");
  const { username, password } = credentials as Record<string, unknown>;
  if (typeof username !== "string" || typeof password !== "string" ||
      !username || !password || username.length > 256 || password.length > 512)
    return failure(400, "Invalid credentials");
  try {
    const upstream = await upstreamPost("/auth/token/", { username, password });
    const tokens = await parseTokenResponse(upstream);
    if (!tokens) return failure(401, "نام کاربری یا رمز عبور نادرست است");
    const response = NextResponse.json({ authenticated: true }, { headers: { "Cache-Control": "no-store" } });
    setSessionCookies(response, tokens, newCsrf());
    return response;
  } catch { return failure(503, "Authentication service unavailable"); }
}
