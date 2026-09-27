# @digitalafarin/cms-admin

Embeddable visual Next.js administration package for DigitalAfarin Headless SEO CMS.

The default installation mode embeds the CMS Admin inside an existing Next.js App Router application, so the public website and `/cms` share the same Next.js runtime and the same `node_modules`.

## Embedded mode (recommended)

Install through the main CLI:

```bash
npx @digitalafarin/cms-cli admin \
  --frontend frontend \
  --admin-base-path /cms \
  --admin-api-url https://api.example.com/api/cms/v1
```

Or, after installing this package in the host frontend:

```bash
npm install @digitalafarin/cms-admin

npx digitalafarin-cms-admin embed \
  --frontend . \
  --base-path /cms \
  --api-url https://api.example.com/api/cms/v1
```

The embed command:

- creates the Admin routes inside the host `app/cms` or `src/app/cms`;
- keeps reusable Admin implementation files under `digitalafarin-cms-admin/` inside the host source root;
- uses the host project's existing Next.js, React and `node_modules`;
- creates the same-origin `/cms/api-proxy` route;
- writes the required CMS Admin environment values into the host `.env.local`;
- does not create a second Next.js application.

Generated environment:

```env
NEXT_PUBLIC_DIGITALAFARIN_CMS_ADMIN_BASE_PATH=/cms
NEXT_PUBLIC_API_URL=/cms/api-proxy
DIGITALAFARIN_CMS_API_URL=https://api.example.com/api/cms/v1
```

## Standalone mode (optional)

Process-isolated deployments remain available:

```bash
npx @digitalafarin/cms-admin scaffold \
  --dir cms-admin \
  --base-path /cms \
  --api-url https://api.example.com/api/cms/v1 \
  --port 3001
```

Standalone mode creates its own Next.js app and therefore has its own `package.json` and `node_modules`. Use it only when a separate Admin process is intentionally required.

## Professional editor

The Admin includes the Tiptap-based Standard Editor with RTL/LTR, headings, formatting, links, tables, Media Library images, lists, quotes, code blocks, word count, focus mode, autosave/recovery and revision tooling.

The structured Block Editor remains available as **Advanced Blocks**. CMS content is stored as structured `blocks`; rich prose uses the typed `rich_text` block whose canonical body is Tiptap JSON.
