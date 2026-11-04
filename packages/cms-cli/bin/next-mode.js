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
