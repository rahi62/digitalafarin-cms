import { adminPath } from "@/lib/admin-path";

// Browser code never sees JWTs. Both tokens live in scoped HttpOnly cookies.
export const API_URL = adminPath("/api-proxy");
const SESSION_URL = adminPath("/session");
let refreshInFlight: Promise<boolean> | null = null;

export class CmsSessionExpiredError extends Error {
  constructor() { super("نشست شما منقضی شده است. دوباره وارد شوید."); this.name = "CmsSessionExpiredError"; }
}

async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await fetch(SESSION_URL + "/refresh", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "x-cms-request": "1" },
      });
      if (response.status === 401) return false;
      if (!response.ok) throw new Error("تمدید نشست به‌دلیل اختلال سرویس احراز هویت ممکن نیست.");
      return true;
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}
export async function sessionStatus(): Promise<boolean> {
  const check = () => fetch(SESSION_URL + "/status", { credentials: "same-origin", cache: "no-store" });
  let response = await check();
  if (response.status === 401) {
    if (!await refreshSession()) return false;
    response = await check();
  }
  if (response.status === 401) return false;
  if (!response.ok) throw new Error("وضعیت نشست قابل بررسی نیست. اتصال سرور را بررسی کنید.");
  return true;
}
export async function login(username: string, password: string) {
  const response = await fetch(SESSION_URL + "/login", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", "x-cms-request": "1" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    let message = "ورود انجام نشد.";
    try { message = (await response.json()).detail || message; } catch { /* opaque upstream */ }
    throw new Error(message);
  }
  // Remove legacy tokens after migration. No JWT is ever written in browser storage.
  if (typeof window !== "undefined") {
    localStorage.removeItem("cms_access_token");
    localStorage.removeItem("cms_refresh_token");
  }
  return { authenticated: true };
}
export async function logout() {
  const response = await fetch(SESSION_URL + "/logout", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "x-cms-request": "1" },
  });
  if (!response.ok) throw new Error("خروج از نشست تأیید نشد؛ اتصال سرور را بررسی کنید.");
  // Clean up tokens from previous CMS versions.
  if (typeof window !== "undefined") {
    localStorage.removeItem("cms_access_token");
    localStorage.removeItem("cms_refresh_token");
  }
}
function loginRedirect() {
  if (typeof window !== "undefined" && window.location.pathname !== adminPath("/login")) {
    window.location.assign(adminPath("/login"));
  }
}
export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.delete("Authorization");
  headers.set("x-cms-request", "1");
  if (options.body != null && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const execute = () => fetch(API_URL + path, {
    ...options, headers, credentials: "same-origin", cache: "no-store",
  });
  let response = await execute();
  if (response.status === 401) {
    if (await refreshSession()) response = await execute();
    else { loginRedirect(); throw new CmsSessionExpiredError(); }
  }
  if (response.status === 401) {
    loginRedirect(); throw new CmsSessionExpiredError();
  }
  if (!response.ok) {
    let message = "API error " + response.status;
    try {
      const error = await response.json() as { detail?: unknown };
      message = typeof error.detail === "string" ? error.detail : JSON.stringify(error);
    } catch { /* preserve status */ }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.text();
  return (body ? JSON.parse(body) : undefined) as T;
}
export type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };
