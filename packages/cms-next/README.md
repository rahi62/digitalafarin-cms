# @digitalafarin/cms-next

Next.js SDK for DigitalAfarin Headless CMS + SEO.

## Install

```bash
npm install @digitalafarin/cms-next
```

Or from the local package archive:

```bash
npm install ./digitalafarin-cms-next-0.2.0.tgz
```

## Environment

```env
DIGITALAFARIN_CMS_URL=http://localhost:8000/api/cms/v1
DIGITALAFARIN_CMS_SITE=localhost:3000
```

## Usage

```ts
import { createCmsClientFromEnv, toNextMetadata } from "@digitalafarin/cms-next";

export const cms = createCmsClientFromEnv({ revalidate: 60 });
```

In an App Router page:

```ts
export async function generateMetadata({ params }) {
  const path = "/" + ((await params).slug ?? []).join("/") + "/";
  return toNextMetadata(await cms.resolve(path));
}
```
