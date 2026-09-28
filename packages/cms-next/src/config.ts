import type { NextConfig } from "next";

/** Compose this around the host config; existing middleware/redirects still need review. */
export function withDigitalAfarinCms(config: NextConfig = {}): NextConfig {
  const previewHeaders = [
    { key: "Cache-Control", value: "private, no-store, max-age=0" },
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
    { key: "Referrer-Policy", value: "no-referrer" },
  ];
  return {
    ...config,
    async rewrites() {
      const original = await config.rewrites?.() || [];
      const grouped = Array.isArray(original) ? { beforeFiles: [], afterFiles: original, fallback: [] } : original;
      const excludePreview = (rules: typeof grouped.beforeFiles) => (rules || []).map((rule) => ({ ...rule,
        missing: [...(rule.missing || []), { type: "query" as const, key: "cms_preview" }],
      }));
      return {
        beforeFiles: [...excludePreview(grouped.beforeFiles), {
          // Exclude infrastructure so images and API calls never become page previews.
          source: "/:cms_path((?!api(?:/|$)|media(?:/|$)|_next(?:/|$)|digitalafarin-cms-preview(?:/|$)|cms(?:/|$)|admin(?:/|$)).*)",
          has: [{ type: "query" as const, key: "cms_preview" }],
          destination: "/digitalafarin-cms-preview/:cms_path*",
        }],
        afterFiles: excludePreview(grouped.afterFiles),
        fallback: excludePreview(grouped.fallback),
      };
    },
    async headers() {
      return [...(await config.headers?.() || []),
        { source: "/:path*", has: [{ type: "query" as const, key: "cms_preview" }], headers: previewHeaders },
        { source: "/digitalafarin-cms-preview/:path*", headers: previewHeaders },
      ];
    },
  };
}
