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
