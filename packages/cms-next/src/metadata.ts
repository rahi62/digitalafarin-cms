import type { Metadata } from "next";
import type { CmsSeoDefaults, ResolvedPage } from "./types.js";

function applyTitleTemplate(title: string, defaults: CmsSeoDefaults, siteName: string) {
  const template = defaults.title_template || "{{title}}";
  return template
    .replaceAll("{{title}}", title)
    .replaceAll("{{site_name}}", defaults.site_name || siteName)
    .trim();
}

export function toNextMetadata(page: ResolvedPage): Metadata {
  const seo = page.seo;
  const defaults = page.site.seo_defaults || {
    site_name: page.site.name,
    title_template: "{{title}}",
    twitter_card: "summary_large_image" as const,
    robots_index: true,
    robots_follow: true,
  };

  const title = seo?.title || applyTitleTemplate(page.content.title, defaults, page.site.name);
  const description = seo?.description || page.content.excerpt || defaults.default_description || undefined;
  const ogTitle = seo?.og_title || seo?.title || title;
  const ogDescription = seo?.og_description || description;
  const ogImage = seo?.og_image || defaults.default_og_image || undefined;
  const twitterCard = (seo?.twitter_card || defaults.twitter_card || "summary_large_image") as "summary" | "summary_large_image";
  const robotsIndex = seo ? seo.robots_index : defaults.robots_index;
  const robotsFollow = seo ? seo.robots_follow : defaults.robots_follow;

  return {
    title,
    description,
    alternates: seo?.canonical_url ? { canonical: seo.canonical_url } : undefined,
    robots: { index: robotsIndex, follow: robotsFollow },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      images: ogImage ? [ogImage] : undefined,
      siteName: defaults.site_name || page.site.name,
    },
    twitter: {
      card: twitterCard,
      title: ogTitle,
      description: ogDescription,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}
