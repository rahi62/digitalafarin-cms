import type { CmsSchema } from "./types.js";

export function schemaJsonLd(schemas: CmsSchema[]) {
  return schemas.filter((item) => item.is_active).map((item) => item.data);
}

export function jsonLdScriptProps(schema: Record<string, unknown>) {
  return {
    type: "application/ld+json",
    dangerouslySetInnerHTML: {
      __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
    },
  };
}
