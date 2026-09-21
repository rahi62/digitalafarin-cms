import { expect, test, type Page, type Route } from "@playwright/test";

type MockState = {
  createdPayload?: Record<string, unknown>;
  entry?: Record<string, unknown>;
};

const site = { id: "site-1", name: "Demo Site" };
const contentType = {
  id: "type-1",
  site: site.id,
  name: "Page",
  slug: "page",
  schema: { fields: [] },
};

const richBlock = {
  id: "rich_text-existing",
  type: "rich_text",
  data: {
    format: "tiptap-json",
    version: 1,
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Original body" }],
        },
      ],
    },
    html: "<p>Original body</p>",
    text: "Original body",
  },
};

const ctaBlock = {
  id: "cta-existing",
  type: "cta",
  data: {
    title: "Contact us",
    text: "Keep this block",
    label: "Call",
    href: "/contact/",
  },
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installMocks(page: Page, state: MockState) {
  await page.addInitScript(() => {
    localStorage.setItem("cms_access_token", "e2e-access-token");
    localStorage.setItem("cms_refresh_token", "e2e-refresh-token");
  });

  await page.route("https://cdn.example.test/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#ddd"/></svg>',
    });
  });

  await page.route("**/cms/api-proxy/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/cms/api-proxy", "");
    const method = request.method();

    if (method === "GET" && path === "/sites/") {
      return json(route, { count: 1, next: null, previous: null, results: [site] });
    }

    if (method === "GET" && path === "/content/types/") {
      return json(route, { count: 1, next: null, previous: null, results: [contentType] });
    }

    if (method === "GET" && path === "/content/types/type-1/") {
      return json(route, contentType);
    }

    if (method === "GET" && path === "/media/assets/") {
      return json(route, {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: "media-1",
            site: site.id,
            url: "https://cdn.example.test/hero.svg",
            filename: "hero.svg",
            mime_type: "image/svg+xml",
            alt_text: "Hero test image",
            caption: "Hero caption",
            folder: "editor",
            width: 640,
            height: 360,
            size_bytes: 1200,
          },
        ],
      });
    }

    if (method === "POST" && path === "/content/entries/") {
      state.createdPayload = request.postDataJSON() as Record<string, unknown>;
      const payload = state.createdPayload;
      state.entry = {
        id: "entry-new",
        ...payload,
        author: null,
        author_name: "",
        content_type_slug: "page",
        created_at: "2026-09-20T00:00:00Z",
        updated_at: "2026-09-20T00:00:00Z",
        published_at: null,
      };
      return json(route, state.entry, 201);
    }

    if (path === "/content/entries/entry-new/" && method === "GET") {
      return json(route, state.entry || {
        id: "entry-new",
        site: site.id,
        content_type: contentType.id,
        title: "Browser test",
        slug: "browser-test",
        path: "/browser-test/",
        excerpt: "",
        status: "draft",
        parent: null,
        is_featured: false,
        categories: [],
        tags: [],
        custom_fields: {},
        blocks: [],
      });
    }

    if (path === "/content/entries/entry-existing/" && method === "GET") {
      return json(route, state.entry);
    }

    if (path.startsWith("/content/entries/") && method === "PUT") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      state.entry = { ...(state.entry || {}), ...payload };
      return json(route, state.entry);
    }

    if (method === "GET") {
      return json(route, { count: 0, next: null, previous: null, results: [] });
    }

    if (method === "POST") {
      return json(route, {});
    }

    return json(route, {});
  });
}

test("standard editor survives mode switching, inserts media and keeps /cms after create", async ({ page }) => {
  const state: MockState = {};
  await installMocks(page, state);

  await page.goto("/cms/content/new");
  await expect(page.getByText("ویرایشگر حرفه‌ای")).toBeVisible();

  await page.locator(".field").filter({ hasText: "عنوان" }).locator("input").fill("Browser test");
  await page.locator(".field").filter({ hasText: "Slug" }).locator("input").fill("browser-test");
  await page.locator(".field").filter({ hasText: "Path" }).locator("input").fill("/browser-test/");

  const canvas = page.locator(".cmsRichTextCanvas");
  await canvas.fill("متن تست برای ویرایشگر حرفه‌ای");

  await page.getByRole("tab", { name: "بلوک‌های پیشرفته" }).click();
  await expect(page.getByText("متن حرفه‌ای (Tiptap)")).toBeVisible();
  await expect(page.getByText("متن تست برای ویرایشگر حرفه‌ای")).toBeVisible();

  await page.getByRole("tab", { name: "ویرایشگر استاندارد" }).click();
  await expect(canvas).toContainText("متن تست برای ویرایشگر حرفه‌ای");

  await page.getByRole("button", { name: "تصویر" }).click();
  await expect(page.getByText("انتخاب رسانه")).toBeVisible();
  await page.getByRole("button").filter({ hasText: "hero.svg" }).click();
  await expect(canvas.locator("img")).toHaveAttribute("src", "https://cdn.example.test/hero.svg");

  await page.getByRole("button", { name: "ایجاد محتوا" }).click();
  await page.waitForURL("**/cms/content/entry-new");

  expect(state.createdPayload).toBeTruthy();
  const blocks = (state.createdPayload?.blocks || []) as Array<Record<string, any>>;
  expect(blocks).toHaveLength(1);
  expect(blocks[0].type).toBe("rich_text");
  expect(blocks[0].data.format).toBe("tiptap-json");
  expect(blocks[0].data.text).toContain("متن تست");
  expect(JSON.stringify(blocks[0].data.doc)).toContain("https://cdn.example.test/hero.svg");
});

test("standard edits preserve trailing advanced blocks through Standard ↔ Advanced", async ({ page }) => {
  const state: MockState = {
    entry: {
      id: "entry-existing",
      site: site.id,
      content_type: contentType.id,
      title: "Mixed content",
      slug: "mixed-content",
      path: "/mixed-content/",
      excerpt: "",
      status: "draft",
      parent: null,
      is_featured: false,
      categories: [],
      tags: [],
      custom_fields: {},
      blocks: [richBlock, ctaBlock],
      author: null,
      author_name: "",
      content_type_slug: "page",
      created_at: "2026-09-20T00:00:00Z",
      updated_at: "2026-09-20T00:00:00Z",
      published_at: null,
    },
  };
  await installMocks(page, state);

  await page.goto("/cms/content/entry-existing");
  await expect(page.getByText("۱ بلوک پیشرفته حفظ شده است")).toBeVisible();

  const canvas = page.locator(".cmsRichTextCanvas");
  await expect(canvas).toContainText("Original body");
  await canvas.fill("Edited body");

  await page.getByRole("tab", { name: "بلوک‌های پیشرفته" }).click();
  await expect(page.getByText("متن حرفه‌ای (Tiptap)")).toBeVisible();
  await expect(page.getByPlaceholder("عنوان CTA")).toHaveValue("Contact us");
  await expect(page.getByPlaceholder("توضیح کوتاه")).toHaveValue("Keep this block");

  await page.getByRole("tab", { name: "ویرایشگر استاندارد" }).click();
  await expect(canvas).toContainText("Edited body");

  await page.getByRole("tab", { name: "بلوک‌های پیشرفته" }).click();
  await expect(page.getByPlaceholder("عنوان CTA")).toHaveValue("Contact us");
});
