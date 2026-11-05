import { cacheLife, cacheTag } from "next/cache";
import { createCmsClientFromEnv, isCmsNotFoundError } from "./client.js";
import { cmsPathTag, cmsSiteTag } from "./tags.js";
import type { ResolvedPage } from "./types.js";

/**
 * Result of resolving one public CMS path. Everything is plain data so it can live in the
 * Next.js cache (including "missing" and "redirect" answers) and the page can answer with the
 * correct HTTP status *before* streaming starts.
 */
export type CachedCmsResolution =
  | { kind: "page"; page: ResolvedPage }
  | { kind: "redirect"; type: number; destination: string }
  | { kind: "missing" };

/**
 * `cacheComponents` hosts: resolve a path through the Next.js cache.
 *
 * Entries are tagged `cms:site:<domain>` and `cms:path:<path>`, so the CMS revalidation webhook
 * (`createCmsRevalidateHandler`) refreshes exactly the affected pages, including cached misses
 * and redirects. Requires `withDigitalAfarinCms` (it transpiles this package so the
 * `"use cache"` directive is compiled by Next.js).
 */
export async function resolveCmsPageCached(path: string): Promise<CachedCmsResolution> {
  "use cache";
  const client = createCmsClientFromEnv({ revalidate: 3600 });
  const site = process.env.DIGITALAFARIN_CMS_SITE || "";
  cacheTag(cmsSiteTag(site), cmsPathTag(path));
  try {
    const page = await client.resolve(path);
    cacheLife({ stale: 60, revalidate: 3600, expire: 60 * 60 * 24 * 30 });
    return { kind: "page", page };
  } catch (error) {
    if (!isCmsNotFoundError(error)) throw error; // transient failures are never cached
  }
  // Misses and redirects are cached briefly; publish/redirect webhooks expire them immediately.
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  try {
    const rule = await client.resolveRedirect(path);
    if (rule.match && rule.destination) {
      return { kind: "redirect", type: rule.type ?? 302, destination: rule.destination };
    }
  } catch (error) {
    if (!isCmsNotFoundError(error)) throw error;
  }
  return { kind: "missing" };
}
