import { expect, test } from "@playwright/test";

test("unauthenticated browser cannot access session or proxy, or obtain raw JWTs", async ({ request }) => {
  const status = await request.get("/cms/session/status");
  expect(status.status()).toBe(401);
  const proxy = await request.get("/cms/api-proxy/content/entries/");
  expect(proxy.status()).toBe(401);
  const tokens = await request.post("/cms/api-proxy/auth/token/", {
    data: { username: "admin", password: "test" }, headers: { "x-cms-request": "1" },
  });
  expect(tokens.status()).toBe(404);
  const refresh = await request.post("/cms/api-proxy/auth/token/refresh/", {
    data: { refresh: "attacker" }, headers: { "x-cms-request": "1" },
  });
  expect(refresh.status()).toBe(404);
  const refreshNoCookie = await request.post("/cms/session/refresh", {
    headers: { "x-cms-request": "1" },
  });
  expect(refreshNoCookie.status()).toBe(401);
});

test("mutating session and CMS API requests require same-origin CSRF protection", async ({ request }) => {
  const loginWithoutHeader = await request.post("/cms/session/login", {
    data: { username: "anything", password: "anything" },
  });
  expect(loginWithoutHeader.status()).toBe(403);
  const loginWrongOrigin = await request.post("/cms/session/login", {
    headers: { "x-cms-request": "1", origin: "https://evil.example" },
    data: { username: "anything", password: "anything" },
  });
  expect(loginWrongOrigin.status()).toBe(403);
  const mutationWithoutHeader = await request.post("/cms/api-proxy/content/entries/", {
    data: { title: "unauthorized" },
  });
  expect(mutationWithoutHeader.status()).toBe(403);
  const mutationWrongOrigin = await request.post("/cms/api-proxy/content/entries/", {
    headers: { "x-cms-request": "1", origin: "https://evil.example" },
    data: { title: "unauthorized" },
  });
  expect(mutationWrongOrigin.status()).toBe(403);
});
