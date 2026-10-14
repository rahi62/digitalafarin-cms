import { expect, test } from "@playwright/test";

test("HttpOnly BFF session protects API requests against CSRF and client token exposure", async ({ page }) => {
  await page.goto("/cms/login");
  const login = await page.evaluate(async () => {
    const response = await fetch("/cms/auth/session/login", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "testpass" }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(login.status).toBe(200);
  expect(login.body).toEqual({ authenticated: true });
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === "cms_bff_access")?.httpOnly).toBe(true);
  expect(cookies.find((cookie) => cookie.name === "cms_bff_refresh")?.httpOnly).toBe(true);
  expect(cookies.find((cookie) => cookie.name === "cms_bff_csrf")?.httpOnly).toBe(false);
  const csrf = cookies.find((cookie) => cookie.name === "cms_bff_csrf")?.value;
  expect(csrf).toMatch(/^[a-f0-9]{48}\.[a-f0-9]{64}$/);
  const browserSecrets = await page.evaluate(() => ({
    cookie: document.cookie,
    local: localStorage.getItem("cms_refresh_token"),
    session: sessionStorage.getItem("cms_refresh_token"),
  }));
  expect(browserSecrets.cookie).not.toContain("cms_bff_access");
  expect(browserSecrets.cookie).not.toContain("cms_bff_refresh");
  expect(browserSecrets.local).toBeNull();
  expect(browserSecrets.session).toBeNull();
  const api = await page.evaluate(async () => {
    const good = await fetch("/cms/api-proxy/sites/", { credentials: "same-origin" });
    const rawToken = await fetch("/cms/api-proxy/auth/token/", { credentials: "same-origin" });
    const rejected = await fetch("/cms/api-proxy/content/entries/", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: "{}",
    });
    return { good: good.status, rawToken: rawToken.status, rejected: rejected.status };
  });
  expect(api).toEqual({ good: 200, rawToken: 404, rejected: 403 });
  const accepted = await page.evaluate(async (csrfToken) => (await fetch("/cms/api-proxy/content/entries/", {
    method: "POST", credentials: "same-origin",
    headers: { "X-CMS-CSRF": csrfToken, "Content-Type": "application/json" },
    body: "{}",
  })).status, csrf);
  expect(accepted).toBe(201);
  const crossSite = await page.request.post("/cms/api-proxy/content/entries/", {
    headers: { Origin: "https://evil.example", "X-CMS-CSRF": csrf!, "Content-Type": "application/json" },
    data: {},
  });
  expect(crossSite.status()).toBe(403);

  const refresh = await page.evaluate(async (csrfToken) => (await fetch("/cms/auth/session/refresh", {
    method: "POST", credentials: "same-origin", headers: { "X-CMS-CSRF": csrfToken },
  })).status, csrf);
  expect(refresh).toBe(200);
  const refreshedCookies = await page.context().cookies();
  expect(refreshedCookies.find((cookie) => cookie.name === "cms_bff_refresh")?.value)
    .not.toBe(cookies.find((cookie) => cookie.name === "cms_bff_refresh")?.value);
  const logout = await page.evaluate(async (csrfToken) => (await fetch("/cms/auth/session/logout", {
    method: "POST", credentials: "same-origin", headers: { "X-CMS-CSRF": csrfToken },
  })).status, csrf);
  expect(logout).toBe(204);
  const after = await page.context().cookies();
  expect(after.find((cookie) => cookie.name === "cms_bff_access")).toBeUndefined();
  expect(after.find((cookie) => cookie.name === "cms_bff_refresh")).toBeUndefined();
  expect(after.find((cookie) => cookie.name === "cms_bff_csrf")).toBeUndefined();
  expect((await page.request.get("/cms/api-proxy/sites/")).status()).toBe(401);
});
