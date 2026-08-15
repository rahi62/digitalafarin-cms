# Example public Next.js consumer

Set `CMS_API_URL` and `CMS_SITE`, then run `npm install && npm run dev`.

The example includes:

- a catch-all App Router page that resolves CMS content;
- `generateMetadata()` through `@digitalafarin/cms-next`;
- safe JSON-LD script rendering;
- `/sitemap.xml` and `/robots.txt` proxy routes backed by the CMS endpoints;
- a small sample block renderer.
