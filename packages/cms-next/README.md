# @digitalafarin/cms-next

Next.js SDK for DigitalAfarin Headless CMS + SEO.

## Install

```bash
npm install @digitalafarin/cms-next@0.7.0
```

## Environment

```env
DIGITALAFARIN_CMS_URL=http://localhost:8000/api/cms/v1
DIGITALAFARIN_CMS_SITE=localhost:3000
DIGITALAFARIN_CMS_MEDIA_UPSTREAM=http://localhost:8000/media/
```

`DIGITALAFARIN_CMS_URL` is the server-side CMS API upstream. `DIGITALAFARIN_CMS_SITE` must match the CMS Site domain. `DIGITALAFARIN_CMS_MEDIA_UPSTREAM` is a fixed server-side media origin used only by the same-origin media handler; it is never inferred from the request.

## Client

```ts
import { createCmsClientFromEnv } from "@digitalafarin/cms-next";

export const cms = createCmsClientFromEnv();
```

Public collection pages should use `listEntries()`:

```ts
const page = await cms.listEntries({
  content_type: "post",
  search: "seo",
  category: "guides",
  page: 1,
  page_size: 20,
});
```

This public endpoint is site-bound and only returns published entries whose content type is public.

For an existing detail route, use `resolveForRoute()`:

```ts
const page = await cms.resolveForRoute("/blog/example/");
if (!page) {
  // Only a normal public CMS 404 reaches this branch.
  // Call the host's legacy loader or notFound() here.
}
```

Preview, network, 403 and 5xx failures never become a legacy fallback.

## Existing host routes and preview

Compose the CMS wrapper with the host Next config:

```ts
import { withDigitalAfarinCms } from "@digitalafarin/cms-next/config";

const nextConfig = {
  // keep existing host options, redirects and rewrites
};

export default withDigitalAfarinCms(nextConfig);
```

Requests that contain `cms_preview` are rewritten before filesystem pages to the dedicated preview renderer. Preview responses are no-store, noindex and no-referrer. Host middleware/proxy rules still run before rewrites and must be reviewed if they redirect content routes.

## Same-origin media

Create `app/media/[...path]/route.ts`:

```ts
import { createCmsMediaHandler } from "@digitalafarin/cms-next/server";

export const dynamic = "force-dynamic";
export const GET = createCmsMediaHandler();
export const HEAD = GET;
```

The handler forwards only GET/HEAD to the configured fixed upstream, does not forward cookies or Authorization, rejects traversal, does not follow upstream redirects and preserves media 404s. For a public CDN/storage domain, configure Django to emit that absolute public media URL and bypass the same-origin handler.

## Metadata

```ts
import { toNextMetadata } from "@digitalafarin/cms-next";

export async function generateMetadata() {
  const page = await cms.resolve("/blog/example/");
  return toNextMetadata(page);
}
```

Canonical metadata follows the resolved entry URL. Preview metadata is forced to noindex/no-follow/no-referrer.

## Safe rich-text rendering

```tsx
import {
  isCmsRichTextBlock,
  renderCmsRichTextHtml,
} from "@digitalafarin/cms-next";

if (isCmsRichTextBlock(block)) {
  return (
    <div
      className="cms-rich-text"
      dangerouslySetInnerHTML={{ __html: renderCmsRichTextHtml(block) }}
    />
  );
}
```

The renderer uses canonical Tiptap JSON, escapes text, allow-lists supported nodes/marks and rejects unsafe URL protocols.

## Cache behavior

Without `revalidate`, SDK public reads use `no-store`. This is the safest integration mode when publish, move and unpublish must be visible on the next request. If the host opts into `createCmsClientFromEnv({ revalidate: 60 })`, it explicitly accepts up to 60 seconds of stale content unless its own invalidation layer is added.
