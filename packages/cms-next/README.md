# @digitalafarin/cms-next

Next.js SDK for DigitalAfarin Headless CMS + SEO.

## Install

```bash
npm install @digitalafarin/cms-next
```

For the v0.3 release archive:

```bash
npm install ./digitalafarin-cms-next-0.3.0.tgz
```

## Environment

```env
DIGITALAFARIN_CMS_URL=http://localhost:8000/api/cms/v1
DIGITALAFARIN_CMS_SITE=localhost:3000
```

## Create a client

```ts
import { createCmsClientFromEnv } from "@digitalafarin/cms-next";

export const cms = createCmsClientFromEnv({ revalidate: 60 });
```

## App Router metadata

```ts
import { toNextMetadata } from "@digitalafarin/cms-next";
import { cms } from "@/lib/cms";

export async function generateMetadata({ params }) {
  const path = "/" + ((await params).slug ?? []).join("/") + "/";
  const page = await cms.resolve(path);
  return toNextMetadata(page);
}
```

`resolve()` can enrich the page payload with sanitized site-level SEO context. `toNextMetadata()` applies per-entry metadata first and falls back to site defaults such as title templates, descriptions, robots settings and default Open Graph values.

## JSON-LD

```ts
import { allSchemaJsonLd } from "@digitalafarin/cms-next";

const schemas = allSchemaJsonLd(page);
```

The helper returns active page schemas together with the configured global Organization schema when present.

## Other public helpers

The SDK also exposes typed clients/helpers for CMS resolution, site context, menus, redirects, metadata and schema rendering. See the root repository README and `examples/next-site` for an end-to-end consumer example.
