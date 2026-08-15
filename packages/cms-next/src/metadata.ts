import type { Metadata } from "next";
import type { ResolvedPage } from "./types.js";

export function toNextMetadata(page: ResolvedPage): Metadata {
  const seo = page.seo;
  if (!seo) {
    return { title: page.content.title, description: page.content.excerpt };
  }

  return {
    title: seo.title || page.content.title,
    description: seo.description || page.content.excerpt,
    alternates: seo.canonical_url ? { canonical: seo.canonical_url } : undefined,
    robots: { index: seo.robots_index, follow: seo.robots_follow },
    openGraph: {
      title: seo.og_title || seo.title || page.content.title,
      description: seo.og_description || seo.description || page.content.excerpt,
      images: seo.og_image ? [seo.og_image] : undefined,
    },
    twitter: {
      card: (seo.twitter_card as "summary" | "summary_large_image") || "summary_large_image",
      title: seo.og_title || seo.title || page.content.title,
      description: seo.og_description || seo.description || page.content.excerpt,
      images: seo.og_image ? [seo.og_image] : undefined,
    },
  };
}
