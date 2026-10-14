import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_BASE_PATH } from "@/lib/admin-path";

export const BFF_MODE = process.env.NEXT_PUBLIC_DIGITALAFARIN_CMS_AUTH_MODE === "bff";
const cookiePath = ADMIN_BASE_PATH || "/";
const cookiePrefix = "cms_bff_";
export const names = {
  access: cookiePrefix + "access",
  refresh: cookiePrefix + "refresh",
  csrf: cookiePrefix + "csrf",
};
const secure = process.env.NODE_ENV === "production";

export function upstreamBase() {
  return (process.env.DIGITALAFARIN_CMS_API_URL || "http://127.0.0.1:8000/api/cms/v1").replace(/\/+$/, "");
}
function secret(): string {
  const value = process.env.DIGITALAFARIN_CMS_BFF_SECRET;
  if (!value || value.length < 32) throw new Error("DIGITALAFARIN_CMS_BFF_SECRET must be at least 32 characters");
  return value;
}
export function ready(): boolean {
  if (!BFF_MODE) return false;
  try { secret(); return true; } catch { return false; }
}
export function failure(status: number, detail: string) {
  return NextResponse.json({ detail }, {
    status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) return false;
  if (!origin) return false;
  try {
    const requested = new URL(origin);
    const configured = process.env.DIGITALAFARIN_CMS_PUBLIC_ORIGIN;
    if (configured) return requested.origin === new URL(configured).origin;
    // Next.js may reconstruct nextUrl using a private reverse-proxy origin.
    // Compare against the actual HTTP Host while still requiring a matching scheme.
    const host = request.headers.get("host");
    const scheme = request.headers.get("x-forwarded-proto") ||
      new URL(request.url).protocol.slice(0, -1);
    return requested.host === host && requested.protocol === scheme + ":";
  } catch { return false; }
}
export function newCsrf(): string {
  const nonce = randomBytes(24).toString("hex");
  const signature = createHmac("sha256", secret()).update(nonce).digest("hex");
  return nonce + "." + signature;
}
export function verifyCsrf(request: NextRequest): boolean {
  const cookie = request.cookies.get(names.csrf)?.value || "";
  const header = request.headers.get("x-cms-csrf") || "";
  if (!header || header.length !== cookie.length || !/^[a-f0-9]{48}\.[a-f0-9]{64}$/.test(cookie)) return false;
  const [nonce, signature] = cookie.split(".");
  const expected = createHmac("sha256", secret()).update(nonce).digest("hex");
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) &&
    timingSafeEqual(Buffer.from(header), Buffer.from(cookie));
}
export function setSessionCookies(response: NextResponse, tokens: { access: string; refresh: string }, csrf?: string) {
  response.cookies.set(names.access, tokens.access, {
    httpOnly: true, sameSite: "strict", secure, path: cookiePath, maxAge: 30 * 60,
  });
  response.cookies.set(names.refresh, tokens.refresh, {
    httpOnly: true, sameSite: "strict", secure, path: cookiePath, maxAge: 7 * 24 * 3600,
  });
  if (csrf) response.cookies.set(names.csrf, csrf, {
    httpOnly: false, sameSite: "strict", secure, path: cookiePath, maxAge: 7 * 24 * 3600,
  });
  response.headers.set("Cache-Control", "no-store");
}
export function clearSessionCookies(response: NextResponse) {
  for (const key of Object.values(names)) {
    response.cookies.set(key, "", {
      httpOnly: key !== names.csrf, sameSite: "strict", secure, path: cookiePath, maxAge: 0,
    });
  }
  response.headers.set("Cache-Control", "no-store");
}
export function bffError(request: NextRequest, csrf = true): NextResponse | null {
  if (!ready()) return failure(503, "Secure BFF session is not configured.");
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
  // Browsers generally omit Origin on same-origin GET, but must send it on writes.
  if (unsafe && !sameOrigin(request)) return failure(403, "Cross-origin session request denied.");
  if (!unsafe && ["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") || "")) {
    return failure(403, "Cross-site session read denied.");
  }
  if (csrf && !verifyCsrf(request)) return failure(403, "CSRF validation failed.");
  return null;
}
export async function upstreamPost(path: string, body: unknown, access?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (access) headers.Authorization = "Bearer " + access;
  return fetch(upstreamBase() + path, {
    method: "POST", headers, body: JSON.stringify(body),
    redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(12000),
  });
}
export async function parseTokenResponse(response: Response): Promise<{access: string; refresh: string} | null> {
  if (!response.ok) return null;
  const value: unknown = await response.json();
  if (!value || typeof value !== "object") return null;
  const tokens = value as Record<string, unknown>;
  if (typeof tokens.access !== "string" || !tokens.access ||
      typeof tokens.refresh !== "string" || !tokens.refresh) return null;
  return { access: tokens.access, refresh: tokens.refresh };
}
