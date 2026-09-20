# Install DigitalAfarin CMS on a New Website

This is the recommended v0.5 production path for a Django + Next.js App Router project.

## 1. Install and wire the backend + public frontend

From the repository root:

```bash
npx @digitalafarin/cms-cli@0.5.0 init \\
  --backend backend \\
  --frontend frontend \\
  --with-public-route
```

The command installs/wires the Django package and Next.js SDK, creates the CMS client adapter, and—when safe—adds a generic App Router route for CMS-created URLs.

If the frontend already owns a root catch-all, omit `--with-public-route` and integrate `cms.resolve()` into the existing route. The CLI intentionally refuses to create a conflicting root catch-all.

## 2. Scaffold the visual Admin

```bash
npx @digitalafarin/cms-admin@0.5.0 scaffold \\
  --dir cms-admin \\
  --base-path /cms \\
  --api-url https://api.example.com/api/cms/v1 \\
  --port 3001
```

The generated Admin contains the Professional Tiptap Editor and same-origin `/cms/api-proxy`.

## 3. Required frontend environment

```env
DIGITALAFARIN_CMS_URL=https://api.example.com/api/cms/v1
DIGITALAFARIN_CMS_SITE=example.com
```

## 4. Required Admin environment

```env
NEXT_PUBLIC_DIGITALAFARIN_CMS_ADMIN_BASE_PATH=/cms
NEXT_PUBLIC_API_URL=/cms/api-proxy
DIGITALAFARIN_CMS_API_URL=https://api.example.com/api/cms/v1
PORT=3001
```

## 5. Build checks before deployment

```bash
cd backend
python manage.py migrate
python manage.py check

cd ../frontend
npm run build

cd ../cms-admin
npm run typecheck
npm run build
```

## 6. Reverse proxy

Use `cms-admin/deploy/nginx.cms.conf` inside the public domain HTTPS server block. The intended topology is:

```text
https://example.com/       -> public Next.js app
https://example.com/cms/   -> CMS Admin on 127.0.0.1:3001
Django CMS API             -> internal/API upstream
```

Keep the generated `proxy_pass` without a trailing slash so the Admin receives its `/cms` base path.

## 7. Public rich text

Professional Editor prose is stored as a `rich_text` block. `data.doc` is the canonical Tiptap JSON. Public frontends should use `renderCmsRichTextHtml()` rather than trusting `data.html`.

```tsx
import { isCmsRichTextBlock, renderCmsRichTextHtml } from "@digitalafarin/cms-next";

if (isCmsRichTextBlock(block)) {
  return <div dangerouslySetInnerHTML={{ __html: renderCmsRichTextHtml(block) }} />;
}
```

The generated public renderer already follows this rule.

## 8. Production acceptance test

Before switching traffic, verify all of the following:

- `/cms/login` works.
- Create a draft in the Professional Editor.
- Standard -> Advanced -> Standard does not lose content.
- Insert an image from Media Library.
- Save, preview and publish.
- Re-open the entry and verify revisions.
- Open the public CMS path and verify it resolves instead of returning 404.
- Verify SEO metadata and JSON-LD.
- Verify one CMS redirect.
- Verify the public site root and existing dedicated routes still work.

For upgrades from v0.4.x, follow `docs/UPGRADING.md` instead of replacing a customized Admin directory blindly.
