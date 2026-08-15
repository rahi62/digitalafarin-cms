import type { CmsMenu, CmsSiteContext, ResolvedPage } from "./types.js";

export type CmsClientOptions = {
  baseUrl: string;
  site: string;
  token?: string;
  revalidate?: number;
};

export type CmsClientEnvOptions = Partial<CmsClientOptions>;
export type ResolveOptions = { previewToken?: string };

type NextRequestInit = RequestInit & {
  next?: { revalidate?: number };
};

function normalizeBaseUrl(value: string) {
  if (!value) throw new Error("CMS baseUrl is required");
  return value.replace(/\/$/, "");
}

export function createCmsClient(options: CmsClientOptions) {
  const base = normalizeBaseUrl(options.baseUrl);
  if (!options.site) throw new Error("CMS site is required");

  async function request<T = unknown>(path: string, init: NextRequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (options.token) headers.set("Authorization", `Bearer ${options.token}`);

    const requestInit: NextRequestInit = { ...init, headers };
    if (
      typeof options.revalidate === "number" &&
      init.cache !== "no-store" &&
      typeof init.next?.revalidate !== "number"
    ) {
      requestInit.next = { ...(init.next || {}), revalidate: options.revalidate };
    }

    const res = await fetch(`${base}${path}`, requestInit);
    if (!res.ok) {
      throw new Error(`CMS request failed: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  function getSiteContext(init: NextRequestInit = {}) {
    return request<CmsSiteContext>(
      `/site-context/?site=${encodeURIComponent(options.site)}`,
      init,
    );
  }

  return {
    resolve: async (path: string, resolveOptions: ResolveOptions = {}) => {
      const qs = new URLSearchParams({ site: options.site, path });
      if (resolveOptions.previewToken) qs.set("preview", resolveOptions.previewToken);
      const pageInit: NextRequestInit = resolveOptions.previewToken ? { cache: "no-store" } : {};
      const [page, siteContext] = await Promise.all([
        request<ResolvedPage>(`/content/resolve/?${qs.toString()}`, pageInit),
        getSiteContext(),
      ]);
      return { ...page, site: { ...page.site, ...siteContext } } as ResolvedPage;
    },
    getSiteContext,
    getMenu: (key: string) => {
      const qs = new URLSearchParams({ site: options.site, key });
      return request<CmsMenu>(`/content/menu-resolve/?${qs.toString()}`);
    },
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
