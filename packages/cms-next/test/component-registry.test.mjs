import assert from "node:assert/strict";
import test from "node:test";
import {
  defineCmsComponentRegistry, resolveCmsComponentSlot, CmsComponentRegistryError,
  assertCmsApprovedHostManifest,
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
    { id: "DynamicUrl", route: "/blog/[slug]/", component: "Safe", props: { x: "content.title" } },
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

test("pinned host manifest must exactly match CMS-approved revision and local components", () => {
  const local = defineCmsComponentRegistry([{
    id: "Hero", route: "/", component: "HeroSection",
    props: { heading: "content.title", subtitle: "content.excerpt" },
    required: ["heading"],
  }]);
  const slots = [{
    id: "Hero", route: "/", component: "HeroSection",
    props: { subtitle: "content.excerpt", heading: "content.title" },
    required: ["heading"],
  }];
  const pinned = { site: "site-1", hostKey: "primary", version: 2, checksum: "a".repeat(64) };
  const manifest = {
    format_version: 1, site: "site-1", host_key: "primary",
    approved_version: 2, sha256: pinned.checksum, slots, runtime_status: "unverified",
  };
  assert.doesNotThrow(() => assertCmsApprovedHostManifest(manifest, local, pinned));
  for (const changed of [
    { ...manifest, site: "another-tenant" },
    { ...manifest, host_key: "other" },
    { ...manifest, approved_version: 1 },
    { ...manifest, sha256: "b".repeat(64) },
    { ...manifest, slots: [{ ...slots[0], props: { heading: "content.custom_fields.other" } }] },
    { ...manifest, slots: [{ ...slots[0], component: "RemoteRenderer" }] },
    { ...manifest, slots: [{ ...slots[0], route: "/api/" }] },
  ]) {
    assert.throws(() => assertCmsApprovedHostManifest(changed, local, pinned), CmsComponentRegistryError);
  }
});
