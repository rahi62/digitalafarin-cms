import fs from "node:fs";
import path from "node:path";

/**
 * Next.js 16 `cacheComponents` (the create-next-app default since 16.4) rejects the classic
 * route segment config (`dynamic`, `runtime`, `revalidate`) and requires uncached data to be
 * either streamed or explicitly blocking (`export const instant = false`).
 */
export function usesCacheComponents(frontend) {
  for (const name of ["next.config.ts", "next.config.mjs", "next.config.js", "next.config.cjs"]) {
    const file = path.join(frontend, name);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1");
    if (/(^|[^\w.])cacheComponents\s*:\s*true\b/.test(text)) return true;
  }
  return false;
}

/** Page-level segment config for CMS pages that must render per request. */
export function segmentConfig(frontend) {
  return usesCacheComponents(frontend) ? "export const instant = false;" : 'export const dynamic = "force-dynamic";';
}

export function applySegmentConfig(frontend, text) {
  return text.replaceAll("__CMS_SEGMENT_CONFIG__", segmentConfig(frontend));
}

/**
 * Shown by `init --with-public-route` and `doctor` when the host enables `cacheComponents`.
 * Next.js fixes the HTTP status once streaming starts, so CMS 404s and redirects cannot be real
 * status codes there; for SEO-critical sites the classic rendering mode is the safe choice.
 */
export const CACHE_COMPONENTS_SEO_WARNING =
  "Warning: this host enables `cacheComponents`. For SEO-critical sites keep it OFF: with it ON, missing CMS pages " +
  "answer HTTP 200 with a noindex page and CMS redirects are client-side instead of real 404/308 responses. " +
  "Real status codes on cacheComponents hosts (via proxy.ts) are planned for 0.8.1. See docs/UPGRADING.md.";
