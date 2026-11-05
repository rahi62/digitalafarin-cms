import { cmsListTag, cmsPathTag, cmsSiteTag } from "./tags.js";
import type { CmsMenu, CmsSiteContext, ResolvedPage, CmsEntryPage, CmsEntryQuery } from "./types.js";

export type CmsClientOptions = {
  baseUrl: string;
  site: string;
  token?: string;
  /**
   * Seconds to cache public fetches, `false` to cache until the CMS revalidation webhook
   * fires (recommended with `createCmsRevalidateHandler`), or `0`/unset for no caching.
   */
  revalidate?: number | false;
};

export type CmsClientEnvOptions = Partial<CmsClientOptions>;
export type ResolveOptions = { previewToken?: string };

type NextRequestInit = RequestInit & {
  next?: { revalidate?: number | false; tags?: string[] };
};
type CmsFetchInit = NextRequestInit & { cmsTags?: string[] };

export class CmsRequestError extends Error {
  status: number;
  body: string;

  constructor(status: number, _body = "", preview = false) {
    const message = preview ? "CMS preview is invalid, expired or unavailable. Create a new preview link." : `CMS request failed (${status}).`;
    super(message);
    this.name = "CmsRequestError";
    this.status = status;
    this.body = message;
  }
}

export function isCmsNotFoundError(error: unknown): error is CmsRequestError {
  return error instanceof CmsRequestError && error.status === 404;
}

function normalizeBaseUrl(value: string) {
  if (!value) throw new Error("CMS baseUrl is required");
  return value.replace(/\/$/, "");
}

export function createCmsClient(options: CmsClientOptions) {
  const base = normalizeBaseUrl(options.baseUrl);
  if (!options.site) throw new Error("CMS site is required");

  async function request<T = unknown>(path: string, init: CmsFetchInit = {}): Promise<T> {
    const { cmsTags, ...fetchInit } = init;
    const headers = new Headers(fetchInit.headers);
    if (options.token) headers.set("Authorization", `Bearer ${options.token}`);

    const requestInit: NextRequestInit = { ...fetchInit, headers };
    const isPreview = /[?&]preview=/.test(path);
    if (fetchInit.cache === undefined && (options.revalidate === undefined || options.revalidate === 0)) {
      requestInit.cache = "no-store";
    }
    if (!isPreview && fetchInit.cache !== "no-store" && requestInit.cache !== "no-store") {
      const tags = [...new Set([...(fetchInit.next?.tags || []), ...(cmsTags || [])])];
      if (typeof options.revalidate === "number" && options.revalidate > 0 && typeof fetchInit.next?.revalidate !== "number") {
        requestInit.next = { ...(fetchInit.next || {}), revalidate: options.revalidate, tags };
      } else if (options.revalidate === false && fetchInit.next?.revalidate === undefined) {
        requestInit.cache = fetchInit.cache ?? "force-cache";
        requestInit.next = { ...(fetchInit.next || {}), revalidate: false, tags };
      } else if (tags.length) {
        requestInit.next = { ...(fetchInit.next || {}), tags };
      }
    }

    let res: Response;
    try { res = await fetch(`${base}${path}`, requestInit); }
    catch { throw new CmsRequestError(503, "", /[?&]preview=/.test(path)); }
    if (!res.ok) {
      // Do not retain HTML debug pages, SQL errors, tokens or upstream configuration.
      // Next may tee fetch responses; awaiting one branch's cancellation can deadlock
      // until its cache branch is consumed. Cleanup must not delay the public error.
      void res.body?.cancel().catch(() => undefined);
      throw new CmsRequestError(res.status, "", /[?&]preview=/.test(path));
    }
    try {
      return await res.json() as T;
    } catch {
      throw new CmsRequestError(502);
    }
  }

  function getSiteContext(init: NextRequestInit = {}) {
    return request<CmsSiteContext>(
      `/site-context/?site=${encodeURIComponent(options.site)}`,
      { ...init, cmsTags: [cmsSiteTag(options.site)] },
    );
  }

  async function resolve(path: string, resolveOptions: ResolveOptions = {}) {
      const qs = new URLSearchParams({ site: options.site, path });
      const preview = resolveOptions.previewToken !== undefined;
      if (preview) qs.set("preview", resolveOptions.previewToken!);
      const pageInit: NextRequestInit = preview ? { cache: "no-store" } : {};
      const [page, siteContext] = await Promise.all([
        request<ResolvedPage>(`/content/resolve/?${qs.toString()}`, {
          ...pageInit, cmsTags: [cmsSiteTag(options.site), cmsPathTag(path)],
        }),
        getSiteContext(pageInit),
      ]);
      return { ...page, site: { ...page.site, ...siteContext } } as ResolvedPage;
  }

  return {
    resolve,
    resolveForRoute: async (path: string, resolveOptions: ResolveOptions = {}) => {
      try { return await resolve(path, resolveOptions); }
      catch (error) {
        if (resolveOptions.previewToken === undefined && isCmsNotFoundError(error)) return null;
        throw error;
      }
    },
    listEntries: (params: CmsEntryQuery = {}) => {
      const qs = new URLSearchParams({ site: options.site });
      for (const key of ["content_type", "search", "category", "tag", "page", "page_size"] as const) {
        if (params[key] !== undefined) qs.set(key, String(params[key]));
      }
      return request<CmsEntryPage>(`/content/public-entries/?${qs}`, {
        cmsTags: [cmsSiteTag(options.site), cmsListTag(options.site)],
      });
    },
    getSiteContext,
    getMenu: (key: string) => {
      const qs = new URLSearchParams({ site: options.site, key });
      return request<CmsMenu>(`/content/menu-resolve/?${qs.toString()}`, {
        cmsTags: [cmsSiteTag(options.site), cmsListTag(options.site)],
      });
    },
    /** @deprecated Authenticated management API. Use listEntries for public websites. */
    getEntries: (params: Record<string, string | number | boolean | null | undefined> = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) qs.set(key, String(value));
      });
      return request<unknown>(`/content/entries/?${qs.toString()}`);
    },
    getSitemapUrl: () => `${base}/content/sitemap/?site=${encodeURIComponent(options.site)}`,
    getRobotsUrl: () => `${base}/content/robots/?site=${encodeURIComponent(options.site)}`,
    resolveRedirect: (path: string) =>
      request<{ match: boolean; type?: number; destination?: string | null }>(
        `/seo/redirect-resolve/?site=${encodeURIComponent(options.site)}&path=${encodeURIComponent(path)}`,
        { cmsTags: [cmsSiteTag(options.site), cmsListTag(options.site)] },
      ),
    request,
  };
}

export function createCmsClientFromEnv(overrides: CmsClientEnvOptions = {}) {
  const baseUrl = overrides.baseUrl || process.env.DIGITALAFARIN_CMS_URL;
  const site = overrides.site || process.env.DIGITALAFARIN_CMS_SITE;
  if (!baseUrl || !site) {
    throw new Error("Set DIGITALAFARIN_CMS_URL and DIGITALAFARIN_CMS_SITE");
  }
  return createCmsClient({
    baseUrl,
    site,
    revalidate: overrides.revalidate,
    token: overrides.token,
  });
}
