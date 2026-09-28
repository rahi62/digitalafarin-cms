# Install DigitalAfarin CMS on a New Website

Recommended v0.7 path for Django + Next.js App Router.

## 1. Install and wire backend + frontend

```bash
npx @digitalafarin/cms-cli@0.7.0 init \
  --backend backend \
  --frontend frontend \
  --with-public-route \
  --with-admin \
  --admin-base-path /cms \
  --admin-api-url https://api.example.com/api/cms/v1
```

The public catch-all only owns otherwise-unmatched URLs. If the frontend already owns a root catch-all, omit `--with-public-route` and integrate that route explicitly.

The visual Admin is embedded into the existing frontend and uses the same `package.json` and `node_modules`.

## 2. Configure public URLs independently

Frontend:

```env
DIGITALAFARIN_CMS_URL=https://api.example.com/api/cms/v1
DIGITALAFARIN_CMS_SITE=example.com
DIGITALAFARIN_CMS_MEDIA_UPSTREAM=http://django:8000/media/
```

Django settings:

```python
DIGITALAFARIN_CMS_MEDIA_PUBLIC_URL = "/media/"  # or https://cdn.example.com/assets/
DIGITALAFARIN_CMS_MEDIA_LEGACY_ORIGINS = []
```

Set `Site.settings.frontend_url` to the public site origin, for example `https://example.com`. API upstream, public frontend origin and media/storage origin are separate values.

## 3. Configure routed content types

For a collection such as a blog:

```text
collection_path      /blog
entry_path_pattern   /blog/{slug}/
```

Pages/homepage leave these fields empty and use explicit manual paths. The backend owns final-path calculation and conflict validation.

## 4. Existing collection routes

If the new website already contains `/blog` or `/blog/[slug]`, do not expect the catch-all to replace them:

```bash
npx @digitalafarin/cms-cli@0.7.0 init \
  --frontend frontend \
  --with-collection \
  --collection-path /blog \
  --content-type post
```

Review `.digitalafarin/integration.json` and proposals before applying:

```bash
npx @digitalafarin/cms-cli@0.7.0 apply-integration --frontend frontend
npx @digitalafarin/cms-cli@0.7.0 doctor --backend backend --frontend frontend
```

## 5. Build checks

```bash
cd backend
python manage.py migrate
python manage.py check
python manage.py cms_doctor

cd ../frontend
npm run build
```

## 6. Acceptance test

Verify all of the following before production:

- existing homepage still renders normally;
- existing legacy detail URL still works on a CMS public 404;
- a CMS draft is absent from public list/detail;
- signed draft preview works on an already-existing route;
- invalid/expired preview does not fall back;
- publish makes the entry appear in collection/detail immediately under default no-store behavior;
- uploaded image renders in Admin, preview and public detail;
- missing media returns 404 and does not enter the content resolver;
- changing an automatic slug creates the expected final path and redirect;
- unpublish removes the entry from public list/detail;
- metadata canonical, sitemap entry and card links use the same final path;
- tenant-other content is never returned by public APIs.

For upgrades from v0.6.0, follow `docs/UPGRADE-0.7.0.fa.md`.
