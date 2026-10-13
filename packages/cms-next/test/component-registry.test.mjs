import assert from "node:assert/strict";
import test from "node:test";
import {
  defineCmsComponentRegistry, resolveCmsComponentSlot, CmsComponentRegistryError,
} from "../dist/index.js";

const page = {
  site: { name: "Demo", domain: "demo.test", language: "fa" },
  content: {
    id: "entry-1", title: "Homepage", slug: "home", path: "/",
    excerpt: "Summary", custom_fields: {
      hero: { title: "پیشنهاد ویژه", cta: { label: "شروع کنید" } },
      banner: "<img src=x onerror=alert(1)>",
    },
    blocks: [], content_type_slug: "home", updated_at: "", status: "published",
  },
  seo: { title: "SEO title", description: "Description" },
};

test("host registry resolves only explicit route and bound fields", () => {
  const registry = defineCmsComponentRegistry([{
    id: "HomepageHero",
    route: "/",
    component: "HomeHero",
    props: {
      title: "content.custom_fields.hero.title",
      description: "content.excerpt",
      cta: "content.custom_fields.hero.cta.label",
      siteName: "site.name",
      seoTitle: "seo.title",
      safeString: "content.custom_fields.banner",
    },
    required: ["title", "cta"],
  }]);
  const resolved = resolveCmsComponentSlot(registry, "HomepageHero", page);
  assert.ok(resolved);
  assert.equal(resolved.component, "HomeHero");
  assert.equal(resolved.props.title, "پیشنهاد ویژه");
  assert.equal(resolved.props.cta, "شروع کنید");
  assert.equal(resolved.props.seoTitle, "SEO title");
  assert.equal(resolved.props.safeString, "<img src=x onerror=alert(1)>");
  assert.equal(resolveCmsComponentSlot(registry, "Missing", page), null);
  assert.equal(resolveCmsComponentSlot(registry, "HomepageHero", {
    ...page, content: { ...page.content, path: "/other/" },
  }), null);
  assert.equal(page.content.custom_fields.hero.title, "پیشنهاد ویژه");
});

test("registry rejects unsafe binding roots, prototype keys, duplicates and reserved routes", () => {
  for (const invalid of [
    { id: "Danger", route: "/api/", component: "Safe", props: { x: "content.title" } },
    { id: "BadId", route: "/", component: "Safe", props: { x: "content.custom_fields.__proto__.x" } },
    { id: "BadBinding", route: "/", component: "Safe", props: { x: "secret.password" } },
    { id: "BadUrl", route: "https://bad.test/", component: "Safe", props: { x: "content.title" } },
    { id: "BadProp", route: "/", component: "Safe", props: { __proto__: "content.title", safe: "content.__proto__" } },
  ]) {
    assert.throws(() => defineCmsComponentRegistry([invalid]), CmsComponentRegistryError);
  }
  assert.throws(() => defineCmsComponentRegistry([
    { id: "Same", route: "/", component: "One", props: {} },
    { id: "Same", route: "/about/", component: "Two", props: {} },
  ]), CmsComponentRegistryError);
});

test("missing required CMS values are reported, not silently rendered", () => {
  const registry = defineCmsComponentRegistry([{
    id: "HomeHero", component: "HomeHero", route: "/",
    props: { headline: "content.custom_fields.missing" }, required: ["headline"],
  }]);
  assert.throws(
    () => resolveCmsComponentSlot(registry, "HomeHero", page),
    CmsComponentRegistryError,
  );
});

test("registry does not permit prototype traversal through nested content", () => {
  assert.throws(() => defineCmsComponentRegistry([{
    id: "Hack", component: "Hack", route: "/",
    props: { key: "content.custom_fields.constructor" },
  }]), CmsComponentRegistryError);
});
