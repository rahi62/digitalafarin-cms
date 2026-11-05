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
      /[?#%\\:{}]/.test(input) || ["[", "]", "*", "(", ")"].some((char) => input.includes(char)) || /[\x00-\x20]/.test(input)) {
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
  const definitions = input.map((slot: CmsHostComponentSlot) => {
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
    const required: string[] = [...new Set<string>(slot.required || [])];
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


/** Metadata retrieved by an authenticated server, never from arbitrary client input. */
export type CmsApprovedManifest = {
  format_version: number;
  site: string;
  host_key: string;
  approved_version: number;
  sha256: string;
  slots: CmsHostComponentSlot[];
  runtime_status?: "unverified";
};

/**
 * Fail closed unless a CMS-approved revision exactly matches the host's
 * explicitly compiled component allowlist and pinned deployment identity.
 *
 * Caller MUST use an authenticated, trusted HTTPS API response on the server.
 * This does not fetch, deploy, import, or execute remote components.
 */
export function assertCmsApprovedHostManifest(
  remote: unknown,
  local: CmsComponentRegistry,
  pinned: { site: string; hostKey: string; version: number; checksum: string },
): asserts remote is CmsApprovedManifest {
  if (!remote || typeof remote !== "object" || Array.isArray(remote)) {
    throw new CmsComponentRegistryError("Approved host manifest is missing or invalid.");
  }
  const manifest = remote as Record<string, unknown>;
  if (manifest.format_version !== 1 ||
      manifest.site !== pinned.site || manifest.host_key !== pinned.hostKey ||
      manifest.approved_version !== pinned.version ||
      !/^[a-f0-9]{64}$/.test(String(manifest.sha256)) ||
      manifest.sha256 !== pinned.checksum) {
    throw new CmsComponentRegistryError("CMS approval differs from this host build's pinned deployment identity.");
  }
  const remoteSlots = defineCmsComponentRegistry(manifest.slots as CmsHostComponentSlot[]);
  if (remoteSlots.length !== local.length) {
    throw new CmsComponentRegistryError("CMS approved component count differs from host build.");
  }
  const toIdentity = (slot: CmsHostComponentSlot) => JSON.stringify({
    id: slot.id, route: slot.route, component: slot.component,
    props: Object.keys(slot.props).sort().map((name) => [name, slot.props[name]]),
    required: [...(slot.required || [])].sort(),
  });
  const expected = new Map(local.map((item) => [item.id, toIdentity(item)]));
  for (const slot of remoteSlots) {
    if (!expected.has(slot.id) || expected.get(slot.id) !== toIdentity(slot)) {
      throw new CmsComponentRegistryError("CMS approved component bindings differ from host allowlist.");
    }
  }
}
