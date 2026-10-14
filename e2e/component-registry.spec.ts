import { expect, test, type Route } from "@playwright/test";

const report = {
  version: 1, generated_at: "2026-10-14T10:00:00Z",
  routes: [
    { url: "/", file: "app/page.tsx", kind: "page", route_kind: "static", loader: "host", reserved: false, parallel: false, intercepted: false, groups: [] },
    { url: "/about", file: "app/about/page.tsx", kind: "page", route_kind: "static", loader: "host", reserved: false, parallel: false, intercepted: false, groups: [] },
    { url: "/blog/[slug]", file: "app/blog/[slug]/page.tsx", kind: "page", route_kind: "dynamic", loader: "host", reserved: false, parallel: false, intercepted: false, groups: [] },
    { url: "/api/private", file: "app/api/private/route.ts", kind: "route", route_kind: "static", loader: "host", reserved: true, parallel: false, intercepted: false, groups: [] },
  ],
  mappings: [{ route: "/", source: "host", content_type: null }],
  errors: [], warnings: [], mapped: true,
};

const contentType = {
  id: "home-type", site: "site-1", name: "Homepage", slug: "homepage",
  schema: { fields: [
    { key: "hero", type: "group", fields: [
      { key: "title", type: "text" },
      { key: "cta", type: "group", fields: [{ key: "label", type: "text" }] },
    ]},
    { key: "rows", type: "repeater", fields: [{ key: "text", type: "text" }] },
  ]},
};

type DraftState = { draft?: { id: string; site: string; host_key: string; version: number; slots: Array<Record<string, unknown>>; updated_at: string }; };
async function mockDashboard(page: import("@playwright/test").Page, state: DraftState = {}) {
  await page.addInitScript(() => localStorage.setItem("cms_access_token", "e2e-access-token"));
  await page.route("**" + "/cms/route-explorer/report", async (route: Route) => {
    expect(route.request().headers().authorization).toBe("Bearer e2e-access-token");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(report) });
  });
  await page.route("**" + "/cms/api-proxy/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace("/cms/api-proxy", "");
    const method = route.request().method();
    const write = method === "POST" || method === "PATCH";
    if (path === "/content/component-bindings/" && write) {
      const data = route.request().postDataJSON() as Record<string, unknown>;
      const version = state.draft ? state.draft.version + 1 : 1;
      state.draft = { id: "binding-1", site: String(data.site),
        host_key: String(data.host_key), version,
        slots: data.slots as Array<Record<string, unknown>>, updated_at: "2026-10-14T10:00:00Z" };
      return route.fulfill({ status: state.draft.version === 1 ? 201 : 200,
        contentType: "application/json", body: JSON.stringify(state.draft) });
    }
    if (path === "/content/component-bindings/" && method === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ count: state.draft ? 1 : 0, next: null, previous: null,
          results: state.draft ? [state.draft] : [] }) });
    }
    if (path === "/content/component-bindings/binding-1/history/" && method === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ current_version: state.draft?.version || 1,
          results: state.draft ? [{ version: state.draft.version, created_at: state.draft.updated_at, created_by: null }] : [] }) });
    }
    const payload = path === "/sites/" ? { count: 1, results: [{ id: "site-1", name: "Demo", domain: "demo.test" }], next: null, previous: null }
      : path === "/content/types/" ? { count: 1, results: [contentType], next: null, previous: null }
      : { count: 0, results: [], next: null, previous: null };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

test("visual registry composes host-safe TypeScript with nested CMS fields", async ({ page }) => {
  await mockDashboard(page);
  await page.goto("/cms/component-registry?route=%2F");
  await expect(page.getByRole("heading", { name: "اتصال بصری کامپوننت‌ها" })).toBeVisible();
  await expect(page.getByText("مالک مسیر در گزارش:")).toBeVisible();
  const binding = page.getByRole("combobox", { name: "فیلد CMS" }).first();
  await expect(binding.locator('option[value="content.custom_fields.hero.title"]')).toHaveCount(1);
  await expect(binding.locator('option[value="content.custom_fields.hero.cta.label"]')).toHaveCount(1);
  await expect(binding.locator('option[value="content.custom_fields.rows.text"]')).toHaveCount(0);
  await binding.selectOption("content.custom_fields.hero.title");
  await page.getByRole("button", { name: "+ افزودن Props" }).click();
  await page.getByRole("textbox", { name: "نام Props" }).nth(1).fill("description");
  await page.getByRole("combobox", { name: "فیلد CMS" }).nth(1).selectOption("content.excerpt");
  const code = page.locator(".registryCode");
  await expect(code).toContainText('"component": "HeroSection"');
  await expect(code).toContainText('"heading": "content.custom_fields.hero.title"');
  await expect(code).toContainText('"description": "content.excerpt"');
  await expect(code).toContainText('"required": [');
  await expect(page.getByRole("button", { name: "کپی پیکربندی TypeScript" })).toBeEnabled();

  await page.getByRole("textbox", { name: "شناسه اتصال" }).fill("constructor");
  await expect(page.getByText("شناسه نامعتبر است.")).toBeVisible();
  await expect(code).toHaveCount(0);
});

test("dynamic and infrastructure routes cannot be selected for host component ownership", async ({ page }) => {
  await mockDashboard(page);
  await page.goto("/cms/component-registry?route=%2Fblog%2F%5Bslug%5D");
  await expect(page.getByRole("heading", { name: "اتصال بصری کامپوننت‌ها" })).toBeVisible();
  const available = page.getByRole("combobox", { name: "مسیر صفحه میزبان" });
  await expect(available.locator("option")).toHaveCount(2);
  await expect(available.locator('option[value="/"]')).toHaveCount(1);
  await expect(available.locator('option[value="/about/"]')).toHaveCount(1);
  await expect(available.locator('option[value="/blog/[slug]/"]')).toHaveCount(0);
  await available.selectOption("/about/");
  await expect(page.locator(".registryCode")).toContainText('"route": "/about/"');
});

test("saved component draft can be loaded and updated without changing host source", async ({ page }) => {
  const state: DraftState = {};
  await mockDashboard(page, state);
  await page.goto("/cms/component-registry?route=%2F");
  const button = page.getByRole("button", { name: "ثبت پیش‌نویس" });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByText("پیش‌نویس اتصال‌ها، نسخه ۱ ذخیره شد.")).toBeVisible();
  expect(state.draft?.slots[0]?.id).toBe("HomeHero");
  await page.getByRole("textbox", { name: "شناسه اتصال" }).fill("UpdatedHero");
  await page.getByRole("button", { name: "ذخیره نسخه جدید" }).click();
  await expect(page.getByText("پیش‌نویس اتصال‌ها، نسخه ۲ ذخیره شد.")).toBeVisible();
  expect(state.draft?.version).toBe(2);
  expect(state.draft?.slots[0]?.id).toBe("UpdatedHero");
  await page.getByRole("button", { name: "پیکربندی جدید" }).click();
  await page.getByRole("combobox", { name: "نسخه ذخیره‌شده" }).selectOption("binding-1");
  await expect(page.getByRole("textbox", { name: "شناسه اتصال" })).toHaveValue("UpdatedHero");
  await expect(page.locator(".registryCode")).toContainText('"id": "UpdatedHero"');
});
