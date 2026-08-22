import type { CmsSchema, ResolvedPage } from "./types.js";

export function schemaJsonLd(schemas: CmsSchema[]) {
  return schemas.filter((item) => item.is_active).map((item) => item.data);
}

export function siteSchemaJsonLd(page: ResolvedPage) {
  return page.site.organization_schema ? [page.site.organization_schema] : [];
}

export function allSchemaJsonLd(page: ResolvedPage) {
  return [...siteSchemaJsonLd(page), ...schemaJsonLd(page.schemas)];
}

export function jsonLdScriptProps(schema: Record<string, unknown>) {
  return {
    type: "application/ld+json",
    dangerouslySetInnerHTML: {
      __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
    },
  };
}
