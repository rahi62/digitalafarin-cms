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

type ApprovalEvent = {
  id: string; action: string; from_version: number | null; to_version: number | null;
  reason: string; created_at: string;
};
type DraftState = {
  draft?: { id: string; site: string; host_key: string; version: number; slots: Array<Record<string, unknown>>; updated_at: string };
  approvedVersion?: number | null;
  events?: ApprovalEvent[];
};
function approvalSnapshot(state: DraftState) {
  const approvedVersion = state.approvedVersion ?? null;
  return {
    draft_version: state.draft?.version || 0, approved_version: approvedVersion,
    approved_checksum: approvedVersion ? "abc123" : null,
    approved_at: approvedVersion ? "2026-10-14T10:00:00Z" : null,
    runtime_status: "unverified",
    has_unapproved_changes: approvedVersion !== null && approvedVersion !== state.draft?.version,
    events: state.events || [],
  };
}
async function mockDashboard(page: import("@playwright/test").Page, state: DraftState = {}) {
  await page.context().addCookies([{
    name: "__da_cms_access", value: "e2e-access-token", url: "http://127.0.0.1:3101/cms/",
    httpOnly: true, sameSite: "Strict",
  }]);
  await page.route("**/cms/session/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ authenticated: true }) });
  });
  await page.route("**" + "/cms/route-explorer/report", async (route: Route) => {
    expect(route.request().headers().cookie).toContain("__da_cms_access=e2e-access-token");
    expect(route.request().headers().authorization).toBeUndefined();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(report) });
  });
  await page.route("**" + "/cms/api-proxy/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace("/cms/api-proxy", "");
    const method = route.request().method();
    const write = method === "POST" || method === "PATCH";
    if ((path === "/content/component-bindings/" || path === "/content/component-bindings/binding-1/") && write) {
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
    if (path === "/content/component-bindings/binding-1/approval/" && method === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify(approvalSnapshot(state)) });
    }
    if (path === "/content/component-bindings/binding-1/approved-manifest/" && method === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ format_version: 1, approved_version: state.approvedVersion, slots: state.draft?.slots, runtime_status: "unverified" }) });
    }
    if ((path === "/content/component-bindings/binding-1/approve/" ||
         path === "/content/component-bindings/binding-1/rollback-approval/" ||
         path === "/content/component-bindings/binding-1/revoke-approval/") && method === "POST") {
      const data = route.request().postDataJSON() as {
        target_version: number; expected_approved_version: number | null;
        expected_draft_version: number; reason: string; confirm: boolean;
      };
      const previous = state.approvedVersion ?? null;
      if (!data.confirm || data.expected_approved_version !== previous || data.expected_draft_version !== state.draft?.version) {
        return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ detail: "Version conflict" }) });
      }
      state.approvedVersion = path.endsWith("revoke-approval/") ? null : data.target_version;
      state.events = [{
        id: "event-" + ((state.events?.length || 0) + 1),
        action: path.endsWith("revoke-approval/") ? "revoke" : path.endsWith("rollback-approval/") ? "rollback" : "approve",
        from_version: previous, to_version: state.approvedVersion, reason: data.reason,
        created_at: "2026-10-14T10:00:00Z",
      }, ...(state.events || [])];
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify(approvalSnapshot(state)) });
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

test("admin approval and rollback remain manual and preserve editable versions", async ({ page }) => {
  const state: DraftState = {};
  await mockDashboard(page, state);
  page.on("dialog", async (dialog) => { await dialog.accept(); });
  await page.goto("/cms/component-registry?route=%2F");
  await page.getByRole("button", { name: "ثبت پیش‌نویس" }).click();
  await expect(page.getByRole("button", { name: "تأیید نسخه ذخیره‌شده" })).toBeEnabled();
  await page.getByRole("button", { name: "تأیید نسخه ذخیره‌شده" }).click();
  await expect(page.getByText("آخرین نسخه تأییدشده:")).toBeVisible();
  expect(state.approvedVersion).toBe(1);
  await expect(page.getByText("اجرا روی میزبان:")).toContainText("تأییدنشده");

  await page.getByRole("textbox", { name: "شناسه اتصال" }).fill("NewHero");
  await expect(page.getByRole("button", { name: "تأیید نسخه ذخیره‌شده" })).toBeDisabled();
  await page.getByRole("button", { name: "ذخیره نسخه جدید" }).click();
  await expect(page.getByRole("button", { name: "تأیید نسخه ذخیره‌شده" })).toBeEnabled();
  await page.getByRole("button", { name: "تأیید نسخه ذخیره‌شده" }).click();
  expect(state.approvedVersion).toBe(2);

  await page.getByRole("combobox", { name: "نسخه قبلاً تأییدشده" }).selectOption("1");
  await page.getByRole("textbox", { name: "دلیل بازگردانی" }).fill("مشکل در اعتبارسنجی میزبان");
  await page.getByRole("button", { name: "ثبت Rollback تأیید" }).click();
  expect(state.approvedVersion).toBe(1);
  await expect(page.getByText("بازگردانی نسخه ۱")).toBeVisible();
  await expect(page.getByText("اجرا روی میزبان:")).toContainText("تأییدنشده");
  await page.getByRole("textbox", { name: "دلیل بازگردانی" }).fill("توقف انتشار تا تأیید میزبان");
  await page.getByRole("button", { name: "لغو تأیید فعلی" }).click();
  expect(state.approvedVersion).toBeNull();
  await expect(page.getByText("لغو تأیید", { exact: true })).toBeVisible();
  await expect(page.getByText("اجرا روی میزبان:")).toContainText("تأییدنشده");
});
