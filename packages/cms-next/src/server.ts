import { createHmac, timingSafeEqual } from "node:crypto";
import { cmsListTag, cmsPathTag, cmsSiteTag } from "./tags.js";

/** Server-only fixed-upstream media handler. Never infer its target from a request. */
export function createCmsMediaHandler(options: { upstream?: string } = {}) {
  return async function media(request: Request, context: { params: Promise<{ path?: string[] }> }) {
    const upstream = options.upstream || process.env.DIGITALAFARIN_CMS_MEDIA_UPSTREAM;
    if (!upstream) return new Response("CMS media upstream is not configured", { status: 503 });
    let base: URL;
    try {
      base = new URL(upstream);
      if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error();
    } catch { return new Response("Invalid CMS media configuration", { status: 503 }); }
    const segments = (await context.params).path || [];
    if (!segments.length || segments.some((s) => !s || s === "." || s === ".." || /[%/\\?#\x00-\x1f]/.test(s))) {
      return new Response("Media not found", { status: 404 });
    }
    base.pathname = base.pathname.replace(/\/?$/, "/") + segments.map(encodeURIComponent).join("/");
    const headers = new Headers();
    for (const key of ["range", "if-none-match", "if-modified-since"]) {
      const value = request.headers.get(key);
      if (value) headers.set(key, value);
    }
    let response: Response;
    try {
      response = await fetch(base, { method: request.method === "HEAD" ? "HEAD" : "GET", headers,
        redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15000) });
    } catch { return new Response("Media upstream unavailable", { status: 502 }); }
    if (![200, 206, 304].includes(response.status)) {
      void response.body?.cancel().catch(() => undefined);
      return new Response(response.status === 404 ? "Media not found" : "Media upstream unavailable", {
        status: response.status === 404 ? 404 : 502, headers: { "Cache-Control": "no-store" },
      });
    }
    const resultHeaders = new Headers({ "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" });
    for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified", "cache-control"]) {
      const value = response.headers.get(key);
      if (value) resultHeaders.set(key, value);
    }
    if (!/^(image\/(png|jpeg|webp|gif|avif)|video\/|audio\/)/.test(resultHeaders.get("content-type") || "")) {
      resultHeaders.set("Content-Disposition", "attachment");
    }
    return new Response(request.method === "HEAD" || response.status === 304 ? null : response.body,
      { status: response.status, headers: resultHeaders });
  };
}

type SeoFileOptions = { baseUrl?: string; site?: string; revalidate?: number };

function seoUpstream(options: SeoFileOptions) {
  const baseUrl = options.baseUrl || process.env.DIGITALAFARIN_CMS_URL;
  const site = options.site || process.env.DIGITALAFARIN_CMS_SITE;
  if (!baseUrl || !site) return null;
  try {
    const url = new URL(baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return { base: baseUrl.replace(/\/$/, ""), site };
  } catch { return null; }
}

async function proxySeoFile(
  kind: "sitemap" | "robots", options: SeoFileOptions, page: number | null, contentType: string,
) {
  const upstream = seoUpstream(options);
  if (!upstream) return new Response("CMS is not configured", { status: 503, headers: { "Cache-Control": "no-store" } });
  const qs = new URLSearchParams({ site: upstream.site });
  if (page !== null) qs.set("page", String(page));
  let response: Response;
  try {
    response = await fetch(`${upstream.base}/content/${kind}/?${qs}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      next: { revalidate: options.revalidate ?? 3600, tags: [cmsSiteTag(upstream.site), cmsListTag(upstream.site)] },
    } as RequestInit);
  } catch { return new Response("CMS unavailable", { status: 502, headers: { "Cache-Control": "no-store" } }); }
  if (response.status !== 200) {
    void response.body?.cancel().catch(() => undefined);
    return new Response(response.status === 404 ? "Not found" : "CMS unavailable", {
      status: response.status === 404 ? 404 : 502, headers: { "Cache-Control": "no-store" },
    });
  }
  const headers = new Headers({
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": response.headers.get("cache-control") || "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
  });
  const etag = response.headers.get("etag");
  if (etag) headers.set("ETag", etag);
  return new Response(await response.text(), { status: 200, headers });
}

/** `app/sitemap.xml/route.ts`: serves the CMS sitemap (or the sitemap index for very large sites). */
export function createCmsSitemapHandler(options: SeoFileOptions = {}) {
  return () => proxySeoFile("sitemap", options, null, "application/xml; charset=utf-8");
}

/** `app/sitemaps/[page]/route.ts`: serves child sitemap `/sitemaps/<n>.xml` referenced by the index. */
export function createCmsSitemapPageHandler(options: SeoFileOptions = {}) {
  return async (_request: Request, context: { params: Promise<{ page?: string }> }) => {
    const raw = (await context.params).page || "";
    const match = /^(\d{1,6})(?:\.xml)?$/.exec(raw);
    const page = match ? Number(match[1]) : 0;
    if (page < 1) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    return proxySeoFile("sitemap", options, page, "application/xml; charset=utf-8");
  };
}

/** `app/robots.txt/route.ts`: serves the robots.txt generated from CMS site settings. */
export function createCmsRobotsHandler(options: SeoFileOptions = {}) {
  return () => proxySeoFile("robots", options, null, "text/plain; charset=utf-8");
}

const REVALIDATE_EVENTS = new Set([
  "content.published", "content.unpublished", "content.deleted", "redirect.changed", "site.settings_changed",
]);
const MAX_WEBHOOK_BYTES = 64 * 1024;
const MAX_PATHS = 50;

export type CmsReplayStore = {
  /** Returns true when the id was newly recorded, false when it was already seen. */
  claim(eventId: string, ttlMs: number): boolean | Promise<boolean>;
  release?(eventId: string): void | Promise<void>;
};

/** Process-local replay protection. Use a shared store (Redis, KV) when running several instances. */
export function createMemoryReplayStore(): CmsReplayStore {
  const seen = new Map<string, number>();
  return {
    claim(id, ttlMs) {
      const now = Date.now();
      for (const [key, expires] of seen) if (expires <= now) seen.delete(key);
      if (seen.has(id)) return false;
      seen.set(id, now + ttlMs);
      return true;
    },
    release(id) { seen.delete(id); },
  };
}

export type CmsRevalidateOptions = {
  /** Shared secret; defaults to DIGITALAFARIN_CMS_WEBHOOK_SECRET. */
  secret?: string;
  /** Expected CMS site domain; defaults to DIGITALAFARIN_CMS_SITE. Events for other sites are rejected. */
  site?: string;
  /** Maximum clock skew / age of the signed timestamp. Default 300 seconds. */
  toleranceSeconds?: number;
  replayStore?: CmsReplayStore;
  /** Injection points (tests, non-Next runtimes). Default to next/cache. */
  revalidatePath?: (path: string) => void | Promise<void>;
  revalidateTag?: (tag: string) => void | Promise<void>;
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function validPath(path: unknown): path is string {
  return typeof path === "string" && path.length <= 500 && path.startsWith("/") && !path.startsWith("//") &&
    !/[\x00-\x1f\\?#]/.test(path) && !path.split("/").some((part) => part === "." || part === "..");
}

/**
 * `app/api/cms/revalidate/route.ts`: receives signed CMS webhooks and refreshes exactly the
 * affected pages. Verifies the HMAC signature, the timestamp window and event-id replay
 * before touching any cache.
 */
export function createCmsRevalidateHandler(options: CmsRevalidateOptions = {}) {
  const replayStore = options.replayStore || createMemoryReplayStore();
  return async function revalidate(request: Request) {
    if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
    const secret = options.secret || process.env.DIGITALAFARIN_CMS_WEBHOOK_SECRET;
    const site = options.site || process.env.DIGITALAFARIN_CMS_SITE;
    if (!secret || !site) return json(503, { error: "not_configured" });

    const timestamp = request.headers.get("x-digitalafarin-timestamp") || "";
    const signature = request.headers.get("x-digitalafarin-signature") || "";
    const eventHeader = request.headers.get("x-digitalafarin-event-id") || "";
    if (!/^\d{9,12}$/.test(timestamp) || !signature || !eventHeader) return json(401, { error: "invalid_request" });
    const tolerance = options.toleranceSeconds ?? 300;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > tolerance) return json(401, { error: "stale_timestamp" });

    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > MAX_WEBHOOK_BYTES) return json(413, { error: "too_large" });
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_WEBHOOK_BYTES) return json(413, { error: "too_large" });

    const expected = "v1=" + createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return json(401, { error: "invalid_signature" });

    let event: { id?: unknown; type?: unknown; site?: unknown; data?: { paths?: unknown } };
    try { event = JSON.parse(raw); } catch { return json(400, { error: "invalid_json" }); }
    if (event.id !== eventHeader || typeof event.type !== "string" || !REVALIDATE_EVENTS.has(event.type)) {
      return json(400, { error: "invalid_event" });
    }
    if (event.site !== site) return json(400, { error: "wrong_site" });
    const paths = Array.isArray(event.data?.paths) ? event.data!.paths as unknown[] : [];
    if (paths.length > MAX_PATHS || !paths.every(validPath)) return json(400, { error: "invalid_paths" });

    // Only a correctly signed event may occupy a replay slot.
    if (!(await replayStore.claim(eventHeader, Math.max(tolerance, 60) * 2 * 1000))) return json(409, { error: "replayed" });

    const tags = new Set<string>();
    for (const path of paths as string[]) tags.add(cmsPathTag(path));
    if (event.type === "site.settings_changed") tags.add(cmsSiteTag(site));
    else tags.add(cmsListTag(site));
    try {
      const cache = options.revalidatePath && options.revalidateTag ? null : await import("next/cache");
      const revalidatePath = options.revalidatePath || ((path: string) => cache!.revalidatePath(path));
      const revalidateTag = options.revalidateTag ||
        ((tag: string) => (cache!.revalidateTag as (t: string, profile: unknown) => void)(tag, { expire: 0 }));
      for (const path of paths as string[]) await revalidatePath(path);
      for (const tag of tags) await revalidateTag(tag);
    } catch {
      await replayStore.release?.(eventHeader);
      return json(500, { error: "revalidation_failed" });
    }
    return json(200, { ok: true, paths, tags: [...tags] });
  };
}
