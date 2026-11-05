/** Cache tags attached to every SDK fetch so revalidation can be precise. */
export function cmsSiteTag(site: string): string {
  return `cms:site:${site}`;
}

/** Normalise like the CMS does: leading slash, no duplicate slashes, trailing slash. */
export function cmsNormalizePath(path: string): string {
  const cleaned = "/" + path.split("/").filter(Boolean).join("/");
  return cleaned === "/" ? "/" : cleaned + "/";
}

export function cmsPathTag(path: string): string {
  return `cms:path:${cmsNormalizePath(path)}`;
}

/** Lists, menus and sitemaps: refreshed on every content change of the site. */
export function cmsListTag(site: string): string {
  return `cms:list:${site}`;
}
