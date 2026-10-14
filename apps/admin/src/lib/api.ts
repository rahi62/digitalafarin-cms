import { adminPath } from "@/lib/admin-path";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || adminPath("/api-proxy");

// Transitional client-side session transport. Future HttpOnly/BFF authentication must
// replace JS-readable tokens; this deliberately reduces persistence, not XSS exposure.
const ACCESS_KEY = "cms_access_token";
const REFRESH_KEY = "cms_refresh_token";
let refreshInFlight: Promise<string | null> | null = null;
let sessionGeneration = 0;

function sessionStore(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStore()?.getItem(ACCESS_KEY) ?? window.localStorage.getItem(ACCESS_KEY);
}
function getRefreshToken(): string | null {
  return sessionStore()?.getItem(REFRESH_KEY) || null;
}
export function setTokens(access: string, refresh: string): void {
  if (!access || !refresh) throw new Error("Invalid authentication token response");
  sessionStore()?.setItem(ACCESS_KEY, access);
  sessionStore()?.setItem(REFRESH_KEY, refresh);
  // Remove legacy persistent credentials when the user next signs in.
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  sessionGeneration += 1;
}
export function clearTokens(): void {
  sessionGeneration += 1;
  sessionStore()?.removeItem(ACCESS_KEY);
  sessionStore()?.removeItem(REFRESH_KEY);
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
  }
}
async function parseError(res: Response): Promise<Error> {
  let message = `API error ${res.status}`;
  try { const data = await res.json(); message = data.detail || JSON.stringify(data); } catch {}
  return new Error(message);
}
export async function login(username: string, password: string) {
  const res = await fetch(`${API_URL}/auth/token/`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }), cache: "no-store",
  });
  if (!res.ok) throw new Error("نام کاربری یا رمز عبور نادرست است");
  const data = await res.json() as { access?: string; refresh?: string };
  if (typeof data.access !== "string" || typeof data.refresh !== "string") {
    throw new Error("پاسخ احراز هویت معتبر نیست");
  }
  setTokens(data.access, data.refresh);
  return data;
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  const token = getRefreshToken();
  if (!token) return null;
  const generation = sessionGeneration;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/token/refresh/`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: token }), cache: "no-store",
      });
      if (!res.ok) return null;
      const data = await res.json() as { access?: string; refresh?: string };
      if (generation !== sessionGeneration || typeof data.access !== "string" || !data.access) return null;
      // Rotation-enabled backends provide a replacement refresh token.
      sessionStore()?.setItem(ACCESS_KEY, data.access);
      if (typeof data.refresh === "string" && data.refresh) sessionStore()?.setItem(REFRESH_KEY, data.refresh);
      return data.access;
    } catch { return null; }
  })();
  try { return await refreshInFlight; }
  finally { refreshInFlight = null; }
}
function sessionExpired() {
  clearTokens();
  if (typeof window !== "undefined" && !window.location.pathname.endsWith("/login")) {
    window.location.replace(adminPath("/login"));
  }
}

export async function logout(): Promise<void> {
  const refresh = getRefreshToken();
  // Clear browser credentials first, independently of network availability.
  clearTokens();
  if (refresh) {
    try {
      await fetch(`${API_URL}/auth/logout/`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }), cache: "no-store",
      });
    } catch { /* local logout remains in effect on network failure */ }
  }
}
export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const request = async () => fetch(`${API_URL}${path}`, {
    ...options, headers, cache: "no-store",
  });
  let response = await request();
  // Retry once only. Concurrent 401s share one refresh request.
  if (response.status === 401 && typeof window !== "undefined") {
    const replacement = await refreshAccessToken();
    if (replacement) {
      headers.set("Authorization", `Bearer ${replacement}`);
      response = await request();
    }
    if (response.status === 401 || !replacement) {
      sessionExpired();
      throw new Error("نشست منقضی شده است؛ دوباره وارد شوید.");
    }
  }
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  const body = await response.text();
  return (body ? JSON.parse(body) : undefined) as T;
}
export type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };
