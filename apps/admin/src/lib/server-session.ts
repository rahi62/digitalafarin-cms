import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const ACCESS_COOKIE = "__da_cms_access";
export const REFRESH_COOKIE = "__da_cms_refresh";
export const NO_STORE = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

function basePath() {
  const value = (process.env.NEXT_PUBLIC_DIGITALAFARIN_CMS_ADMIN_BASE_PATH || "/cms").trim();
  if (!value || value === "/") return "/";
  return (value.startsWith("/") ? value : "/" + value).replace(/\/+$/, "") || "/";
}
export function cmsApiBase() {
  return (process.env.DIGITALAFARIN_CMS_API_URL || "http://127.0.0.1:8000/api/cms/v1").replace(/\/+$/, "");
}
export function sessionJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}
export function cookieAccess(request: NextRequest) {
  return request.cookies.get(ACCESS_COOKIE)?.value || null;
}
export function cookieRefresh(request: NextRequest) {
  return request.cookies.get(REFRESH_COOKIE)?.value || null;
}
function cookieOptions(request: NextRequest, seconds: number) {
  // Explicit test-only opt-in, set solely by e2e/host/start-next.mjs.
  // Never configure this variable on an operational deployment.
  const localFixture = process.env.DIGITALAFARIN_CMS_E2E_HTTP_COOKIES === "1";
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production" && !localFixture,
    sameSite: "strict" as const,
    path: basePath(),
    maxAge: seconds,
  };
}
export function saveSession(response: NextResponse, request: NextRequest, access: string, refresh: string) {
  response.cookies.set(ACCESS_COOKIE, access, cookieOptions(request, 10 * 60));
  response.cookies.set(REFRESH_COOKIE, refresh, cookieOptions(request, 7 * 24 * 60 * 60));
}
export function eraseSession(response: NextResponse, request: NextRequest) {
  response.cookies.set(ACCESS_COOKIE, "", cookieOptions(request, 0));
  response.cookies.set(REFRESH_COOKIE, "", cookieOptions(request, 0));
}
export function verifyCmsMutation(request: NextRequest) {
  if (request.headers.get("x-cms-request") !== "1") return false;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && !["same-origin", "none"].includes(site)) return false;
  return true;
}
export async function cmsUpstream(endpoint: string, init: RequestInit) {
  const request = { ...init, cache: "no-store" as const, redirect: "manual" as const,
    signal: AbortSignal.timeout(10_000) };
  return fetch(cmsApiBase() + endpoint, request);
}
export function sessionDenied(message = "Authentication required") {
  return sessionJson({ detail: message }, 401);
}
