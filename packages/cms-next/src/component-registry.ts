import type { ResolvedPage } from "./types.js";

// A host-controlled component slot. This is metadata only, never executable CMS code.
export type CmsHostComponentSlot = {
  id: string;
  route: string;
  component: string;
  props: Record<string, string>;
  required?: readonly string[];
};

export type CmsBoundComponent = {
  id: string;
  component: string;
  route: string;
  props: Record<string, unknown>;
};

export class CmsComponentRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CmsComponentRegistryError";
  }
}

const SAFE_PROP = /^[A-Za-z][A-Za-z0-9_]*$/;
const SOURCE_ROOTS = new Set(["content", "site", "seo"]);
const PROTECTED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const RESERVED_ROUTES = new Set(["api", "admin", "cms", "media", "_next", "static"]);

function canonicalPath(input: string): string {
  if (typeof input !== "string" || !input.startsWith("/") || input.startsWith("//") ||
      /[?#%\\:{}]/.test(input) || /[\x00-\x20]/.test(input)) {
    throw new CmsComponentRegistryError("A component route must be a safe absolute local path.");
  }
  const parts = input.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) {
    throw new CmsComponentRegistryError("Relative route traversal is not allowed.");
  }
  if (parts.length && RESERVED_ROUTES.has(parts[0].toLowerCase())) {
    throw new CmsComponentRegistryError("Infrastructure routes cannot own CMS components.");
  }
  return parts.length ? "/" + parts.join("/") + "/" : "/";
}

function sourceSegments(value: string): string[] {
  if (typeof value !== "string") throw new CmsComponentRegistryError("Field binding must be a string.");
  const segments = value.split(".");
  if (segments.length < 2 || segments.length > 9 ||
      !SOURCE_ROOTS.has(segments[0]) ||
      segments.some((s) => !SAFE_PROP.test(s) || PROTECTED_KEYS.has(s))) {
    throw new CmsComponentRegistryError("Unsafe or unsupported CMS field binding: " + String(value));
  }
  if (segments[0] === "content") {
    const isTopLevel = ["title", "excerpt", "slug", "path", "blocks", "custom_fields"].includes(segments[1]);
    if (!isTopLevel || (segments[1] !== "custom_fields" && segments.length > 2) ||
        (segments[1] === "custom_fields" && segments.length < 3)) {
      throw new CmsComponentRegistryError("Unsupported content field binding.");
    }
  }
  if (segments[0] === "site" && (segments.length !== 2 || !["name", "domain", "language"].includes(segments[1]))) {
    throw new CmsComponentRegistryError("Unsupported site field binding.");
  }
  if (segments[0] === "seo" && (segments.length !== 2 || !["title", "description", "og_title", "og_description", "og_image"].includes(segments[1]))) {
    throw new CmsComponentRegistryError("Unsupported SEO field binding.");
  }
  return segments;
}

export function defineCmsComponentRegistry(input: readonly CmsHostComponentSlot[]) {
  if (!Array.isArray(input) || input.length > 100) {
    throw new CmsComponentRegistryError("Registry must have at most 100 components.");
  }
  const identifiers = new Set<string>();
  const definitions = input.map((slot) => {
    if (!slot || !SAFE_PROP.test(slot.id) || !SAFE_PROP.test(slot.component) ||
        PROTECTED_KEYS.has(slot.id) || PROTECTED_KEYS.has(slot.component)) {
      throw new CmsComponentRegistryError("Component IDs must be unique, safe host-local names.");
    }
    if (identifiers.has(slot.id)) {
      throw new CmsComponentRegistryError("Duplicate component slot: " + slot.id);
    }
    identifiers.add(slot.id);
    const route = canonicalPath(slot.route);
    if (!slot.props || typeof slot.props !== "object" || Array.isArray(slot.props) ||
        Object.keys(slot.props).length > 50) {
      throw new CmsComponentRegistryError("Component props must be a small field mapping.");
    }
    const props: Record<string, string> = Object.create(null);
    for (const [prop, source] of Object.entries(slot.props)) {
      if (!SAFE_PROP.test(prop) || PROTECTED_KEYS.has(prop)) {
        throw new CmsComponentRegistryError("Unsafe prop key.");
      }
      sourceSegments(source);
      props[prop] = source;
    }
    const required = [...new Set(slot.required || [])];
    if (required.some((name) => !Object.hasOwn(props, name))) {
      throw new CmsComponentRegistryError("Every required prop must be declared in the field mapping.");
    }
    return Object.freeze({
      id: slot.id, component: slot.component, route,
      props: Object.freeze(props), required: Object.freeze(required),
    });
  });
  return Object.freeze(definitions);
}

export type CmsComponentRegistry = ReturnType<typeof defineCmsComponentRegistry>;

function ownValue(source: unknown, segments: string[]): unknown {
  let value = source;
  for (const segment of segments) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, segment)) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

// Match only explicit host routes; never rewrite Next.js pages or execute CMS-provided components.
export function resolveCmsComponentSlot(
  registry: CmsComponentRegistry,
  slotId: string,
  page: ResolvedPage,
): CmsBoundComponent | null {
  const slot = registry.find((item) => item.id === slotId);
  if (!slot) return null;
  let current: string;
  try { current = canonicalPath(page.content.path); }
  catch { return null; }
  if (current !== slot.route) return null;

  const props: Record<string, unknown> = Object.create(null);
  for (const [prop, source] of Object.entries(slot.props)) {
    const [root, ...segments] = sourceSegments(source);
    const rootValue = root === "content" ? page.content : root === "seo" ? page.seo : page.site;
    const value = ownValue(rootValue, segments);
    if (value !== undefined) props[prop] = value;
  }
  for (const prop of slot.required) {
    if (props[prop] === undefined || props[prop] === null || props[prop] === "") {
      throw new CmsComponentRegistryError(`Required property "${prop}" is missing for slot "${slot.id}".`);
    }
  }
  return { id: slot.id, route: slot.route, component: slot.component, props };
}
