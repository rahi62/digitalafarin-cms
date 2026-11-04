import { cmsSiteTag } from "./tags.js";

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
      next: { revalidate: options.revalidate ?? 3600, tags: [cmsSiteTag(upstream.site)] },
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
